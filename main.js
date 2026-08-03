import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
/* Media comes from the generated manifest, not a hand-kept list. Drop files into
 * public/media/<group>/<set>/ and the build regenerates it — see
 * media-example/README.md. Fetched rather than imported so the same
 * file serves every page without rebuilding the bundle. */
const MANIFEST = '/media/manifest.json';
const MEDIA_SET = 'home/array';

/* mayananda.com — armillary rings, then the work.
 *
 * rings.glb is generated from a Houdini FBX by op2/scripts/fbx_to_glb.py, which
 * splits one merged mesh into ~50 named parts by vertex colour. Legend, authored
 * in Houdini: green trigrams (centre), red flicker, purple boxes (one node each,
 * spins on its own axis), yellow/orange/teal inner/middle/outer ring, magenta
 * the X and Y pivots.
 *
 * SCROLL TIMELINE (p = 0..1 across the runway)
 *   0.00 - 0.40   rings UNWIND: they start fully rotated and settle to flat
 *   0.40 - 0.62   the whole rig recedes from the camera
 *   0.55 - 1.00   the image array rises out of the depth
 * Click any image to bring it forward; click again to send it back.
 */

const MODEL = '/rings.glb';

/* ---- act boundaries -----------------------------------------------------
 * The rings travel: they enter from off-screen above, cross the frame, and leave
 * off-screen below, completing exactly ONE full turn on the way. Because the
 * rotation is a whole 360, the pose on exit matches the pose on entry.
 */
const IN_A = 0.00, IN_B = 0.16;      // travel in from off-screen
const OUT_A = 0.44, OUT_B = 0.60;    // travel out again
const CYCLE_END = 0.60;              // one full turn spans the whole journey
const RECEDE_A = 0.34, RECEDE_B = 0.60;
const ARRAY_A = 0.56, ARRAY_B = 1.00;

// Turns completed over the journey. Whole numbers so entry and exit poses match.
const TURNS = { outer: 1, middle: -1, inner: 1, centre: 1 };
const TWO_PI = Math.PI * 2;

const D = Math.PI / 180;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => v * v * (3 - 2 * v);
const seg = (p, a, b) => smooth(clamp01((p - a) / (b - a)));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 4.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

// Metals need something to reflect or they render near-black.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
// Neutral, not ACES: ACES desaturates and hue-shifts as colours clip, which
// pushed the reds orange. Neutral holds white balance.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

scene.add(new THREE.AmbientLight(0xffffff, 0.12));
const key = new THREE.DirectionalLight(0xffffff, 0.85);
key.position.set(2, 3, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x88ccff, 0.45);
rim.position.set(-3, -1, 2);
scene.add(rim);

/* ---- reel, used as a multiply over the gold ----------------------------- */
const videoEl = document.getElementById('reel');
const videoTex = new THREE.VideoTexture(videoEl);
videoTex.colorSpace = THREE.SRGBColorSpace;
videoTex.flipY = false;                 // glTF UV convention
const playReel = () => videoEl.play().catch(() => {});
playReel();
window.addEventListener('pointerdown', playReel, { once: true, passive: true });

const MAT = {
    ring: new THREE.MeshStandardMaterial({
        color: 0xc10f0f, metalness: 0.25, roughness: 0.45, envMapIntensity: 0.5,
    }),
    // In three.js `map` is multiplied by `color`, so a gold base with the reel as
    // its map IS the multiply — the footage tints the metal instead of replacing it.
    box: new THREE.MeshStandardMaterial({
        color: 0xffc94d, map: videoTex,
        metalness: 0.85, roughness: 0.34, envMapIntensity: 1.0,
    }),
    axis: new THREE.MeshStandardMaterial({
        color: 0x2f6fe0, metalness: 0.55, roughness: 0.35,
    }),
    // Centre is solid white now; the reel moved onto the gold.
    centre: new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.18,
        metalness: 0.0, roughness: 0.75,
    }),
    flicker: new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3,
        metalness: 0.1, roughness: 0.6, transparent: true, opacity: 1,
    }),
};

// Rig materials share these four; flicker manages its own opacity.
const RIG_MATS = [MAT.ring, MAT.box, MAT.axis, MAT.centre];
let rigTransparent = false;
let rigOpacity = 1;

function setRigFade(v) {
    rigOpacity = v;
    const want = v < 0.999;
    if (want !== rigTransparent) {
        rigTransparent = want;
        for (const m of RIG_MATS) { m.transparent = want; m.needsUpdate = true; }
        MAT.flicker.needsUpdate = true;
    }
    if (want) for (const m of RIG_MATS) m.opacity = v;
}

/* ---- rig ---------------------------------------------------------------- */
const rig = new THREE.Group();
const gOuter = new THREE.Group();
const gMiddle = new THREE.Group();
const gInner = new THREE.Group();
const centre = new THREE.Group();
gOuter.add(gMiddle); gMiddle.add(gInner);
rig.add(gOuter); rig.add(centre);
scene.add(rig);

const spinners = [];
const flickers = [];
let ready = false;

function recentre(mesh) {
    mesh.geometry.computeBoundingBox();
    const c = new THREE.Vector3();
    mesh.geometry.boundingBox.getCenter(c);
    mesh.geometry.translate(-c.x, -c.y, -c.z);
    return c;
}

new GLTFLoader().load(MODEL, (gltf) => {
    const byName = new Map();
    gltf.scene.traverse((o) => { if (o.isMesh) byName.set(o.name, o); });

    const attach = (name, parent, material) => {
        const m = byName.get(name);
        if (!m) { console.warn('[rings] missing part:', name); return null; }
        m.material = material;
        parent.add(m);
        return m;
    };

    attach('outerRing', gOuter, MAT.ring);
    attach('middleRing', gMiddle, MAT.ring);
    attach('innerRing', gInner, MAT.ring);
    attach('axis', gInner, MAT.axis);
    attach('trigrams', centre, MAT.centre);

    // Each flicker piece is its own node with its own material and its own clock,
    // so they blink independently. Sharing one material made all three strobe in
    // unison, which read as a single element rather than three.
    for (const [name, mesh] of byName) {
        if (!/^flicker_\d+$/.test(name)) continue;
        const mat = MAT.flicker.clone();
        mesh.material = mat;
        centre.add(mesh);
        flickers.push({
            mat,
            t: Math.random() * 0.5,                 // desynchronised start
            period: 0.07 + Math.random() * 0.28,    // each piece its own rate
            on: Math.random() < 0.5,
        });
    }

    const ringOf = { outer: gOuter, middle: gMiddle, inner: gInner };
    for (const [name, mesh] of byName) {
        const m = /^boxes_(outer|middle|inner)_(\d+)$/.exec(name);
        if (!m) continue;
        mesh.material = MAT.box;
        const c = recentre(mesh);
        const pivot = new THREE.Group();
        pivot.position.copy(c);
        pivot.add(mesh);
        ringOf[m[1]].add(pivot);
        const t = Math.atan2(c.y, c.x);
        spinners.push({
            pivot,
            axis: new THREE.Vector3(-Math.sin(t), Math.cos(t), 0).normalize(),
            rate: 0.6 + (parseInt(m[2], 10) % 5) * 0.12,
        });
    }

    frameToView();
    ready = true;
    document.body.classList.add('scene-ready');
}, undefined, (err) => {
    console.error('[rings] failed to load', MODEL, err);
    document.body.classList.add('scene-failed');
});

/* ---- image array -------------------------------------------------------- */
const arrayGroup = new THREE.Group();
arrayGroup.visible = false;
scene.add(arrayGroup);

const cards = [];              // { mesh, home:Vector3, homeScale, video }
let selected = null;
const ARRAY_REST_Z = -1.6;     // where the array sits once fully in
const ARRAY_FAR_Z = -14;       // where it starts, deep behind the rings

const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');

function columnsForViewport() {
    // Portrait phones get fewer, larger cards — 34 tiles across 390px is not a
    // tappable target. Landscape gets closer to the original density.
    return window.innerWidth / window.innerHeight < 1 ? 3 : 6;
}

function buildArray(media) {
    for (const item of media) {
        const geo = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x111111, transparent: true, opacity: 0, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        arrayGroup.add(mesh);
        const card = {
            mesh, home: new THREE.Vector3(), video: null, aspect: 1,
            baseW: 1, baseH: 1, zoom: 2,
        };
        cards.push(card);

        if (item.type === 'video') {
            // Ten simultaneous videos is a lot for a phone. They are created
            // paused and only started once the array is actually on screen.
            const v = document.createElement('video');
            v.src = item.src; v.loop = true; v.muted = true;
            v.playsInline = true; v.crossOrigin = 'anonymous'; v.preload = 'metadata';
            card.video = v;
            const tex = new THREE.VideoTexture(v);
            tex.colorSpace = THREE.SRGBColorSpace;
            mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
            v.addEventListener('loadedmetadata', () => {
                card.aspect = (v.videoWidth || 1) / (v.videoHeight || 1);
                layoutArray();
            }, { once: true });
        } else {
            texLoader.load(item.src, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
                const img = tex.image;
                card.aspect = (img && img.width ? img.width / img.height : 1);
                layoutArray();
            }, undefined, () => { /* leave the placeholder tile */ });
        }
    }
    layoutArray();
}

function layoutArray() {
    const cols = columnsForViewport();
    const rows = Math.ceil(cards.length / cols);

    // Fit the grid to what the camera can actually see at the array's resting
    // depth, so the outer columns land on the screen edges instead of off it.
    const dist = Math.abs(camera.position.z - ARRAY_REST_Z);
    const vH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
    const vW = vH * camera.aspect;

    const gap = 0.06;
    const cellW = (vW * 0.92) / cols;
    const cellH = cellW * 0.72;

    cards.forEach((card, i) => {
        const cx = i % cols, cy = Math.floor(i / cols);
        const x = (cx - (cols - 1) / 2) * cellW;
        const y = -(cy - (rows - 1) / 2) * cellH;
        card.home.set(x, y, 0);

        // Fit each card inside its cell without distorting its aspect.
        const maxW = cellW - gap, maxH = cellH - gap;
        let w = maxW, h = w / card.aspect;
        if (h > maxH) { h = maxH; w = h * card.aspect; }
        card.baseW = w;
        card.baseH = h;
        // How much to enlarge when chosen: fill ~62% of the viewport height at
        // the forward position, so a small tile still reads when selected.
        const distSel = 1.7;
        const viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distSel;
        card.zoom = Math.max(1.6, (viewH * 0.62) / h);
        if (card !== selected) {
            card.mesh.scale.set(w, h, 1);
            card.mesh.position.copy(card.home);
        }
    });
}
// Pull the set from the generated manifest, then build. Async because the
// manifest is fetched, so the array simply appears once it lands.
fetch(MANIFEST)
    .then((r) => r.json())
    .then((m) => {
        const set = m[MEDIA_SET];
        if (!set || !set.items || !set.items.length) {
            console.warn('[media] no items for', MEDIA_SET, '- run: npm run media');
            return;
        }
        buildArray(set.items);
    })
    .catch((e) => console.warn('[media] manifest unavailable', e));

/* ---- framing ------------------------------------------------------------ */
// How far the rig must travel to be genuinely off-screen. Derived from the
// visible height at the rig's depth plus the board's own radius, so it clears
// the frame on a tall phone as well as a wide monitor.
let OFFSCREEN_Y = 3.0;

function frameToView() {
    const radius = 1.05;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distV = radius / Math.tan(vFov / 2);
    const distH = radius / (Math.tan(vFov / 2) * camera.aspect);
    camera.position.z = Math.max(distV, distH) * 1.18;
    camera.updateProjectionMatrix();

    const visibleH = 2 * Math.tan(vFov / 2) * camera.position.z;
    OFFSCREEN_Y = (visibleH / 2 + radius) * 1.15;
}

function onViewportChange() {
    camera.aspect = window.innerWidth / window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    frameToView();
    layoutArray();
}
window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', () => setTimeout(onViewportChange, 150));

/* ---- input -------------------------------------------------------------- */
let p = 0, pointerX = 0, pointerY = 0;

function onScroll() {
    const span = Math.max(1, document.body.scrollHeight - window.innerHeight);
    p = clamp01(window.scrollY / span);
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

window.addEventListener('pointermove', (e) => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = -(e.clientY / window.innerHeight) * 2 + 1;
}, { passive: true });

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
window.addEventListener('click', (e) => {
    if (!arrayGroup.visible) return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(arrayGroup.children, false);
    if (hits.length) {
        const card = cards.find((c) => c.mesh === hits[0].object);
        selected = (selected === card) ? null : card;
    } else {
        selected = null;
    }
});

/* ---- loop --------------------------------------------------------------- */
const clock = new THREE.Clock();
let videosPlaying = false;
const tmp = new THREE.Vector3();

function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);

    // ACT 1 — the rings cross the frame, turning exactly once.
    // Travel: off-screen above -> centre -> off-screen below. Linear inside each
    // leg so the entry and exit read at the same speed.
    const inT = clamp01((p - IN_A) / (IN_B - IN_A));
    const outT = clamp01((p - OUT_A) / (OUT_B - OUT_A));
    rig.position.y = OFFSCREEN_Y * (1 - smooth(inT)) - OFFSCREEN_Y * smooth(outT);

    // One full turn across the whole journey, so it exits as it entered.
    const c = clamp01(p / CYCLE_END);
    gOuter.rotation.x = c * TURNS.outer * TWO_PI;
    gMiddle.rotation.y = c * TURNS.middle * TWO_PI;
    gInner.rotation.x = c * TURNS.inner * TWO_PI;
    centre.rotation.x = c * TURNS.centre * TWO_PI;

    // ACT 2 — recede while it leaves.
    const r = seg(p, RECEDE_A, RECEDE_B);
    rig.position.z = -r * 9.0;
    rig.scale.setScalar(1 - r * 0.15);

    // ACT 3 — the array rises out of the depth.
    const a = seg(p, ARRAY_A, ARRAY_B);
    arrayGroup.visible = a > 0.001;
    arrayGroup.position.z = THREE.MathUtils.lerp(ARRAY_FAR_Z, ARRAY_REST_Z, a);

    // Fade the rig out as the array arrives, otherwise receded ring fragments
    // show through the grid and read as artefacts. Transparency is only switched
    // on while actually fading — leaving 44 transparent boxes sorting against
    // each other at rest causes its own artefacts.
    setRigFade(1 - a);
    rig.visible = a < 0.999;

    if (arrayGroup.visible && !videosPlaying) {
        videosPlaying = true;
        for (const c of cards) if (c.video) c.video.play().catch(() => {});
    }

    // Selected card flies to a fixed point in front of the camera. Card positions
    // are local to arrayGroup, so convert the world z we want into local z.
    const selLocalZ = (camera.position.z - 1.7) - arrayGroup.position.z;

    // Pointer-driven tilt, as the original card wall had: a card's rotation is
    // its offset from the pointer, so the grid curves away at the edges and
    // flattens under the cursor. Edge cards also pull in slightly toward centre.
    const distArr = Math.abs(camera.position.z - (arrayGroup.position.z));
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distArr;
    const visW = visH * camera.aspect;
    const MAX_ROT = Math.PI / 6;

    for (const card of cards) {
        const isSel = card === selected;

        const nx = (card.home.x / (visW / 2)) - pointerX;
        const ny = (card.home.y / (visH / 2)) - pointerY;

        if (isSel) {
            // Selected card lerps flat and square-on.
            card.mesh.rotation.y += (0 - card.mesh.rotation.y) * 0.12;
            card.mesh.rotation.x += (0 - card.mesh.rotation.x) * 0.12;
            tmp.set(0, 0, selLocalZ);
        } else {
            card.mesh.rotation.y += (nx * MAX_ROT - card.mesh.rotation.y) * 0.1;
            card.mesh.rotation.x += (-ny * MAX_ROT - card.mesh.rotation.x) * 0.1;
            tmp.set(
                card.home.x - card.home.x * Math.abs(nx) * 0.3,
                card.home.y,
                card.home.z,
            );
        }
        card.mesh.position.lerp(tmp, 0.12);

        // Grow the selected card about its own fitted size, so a portrait and a
        // landscape image both enlarge without distorting.
        const grow = isSel ? card.zoom : 1;
        card.mesh.scale.x += (card.baseW * grow - card.mesh.scale.x) * 0.12;
        card.mesh.scale.y += (card.baseH * grow - card.mesh.scale.y) * 0.12;

        // Fade in with the act; dim the rest when one is chosen.
        const wantOpacity = isSel ? 1 : a * (selected ? 0.28 : 1);
        card.mesh.material.opacity += (wantOpacity - card.mesh.material.opacity) * 0.12;
        card.mesh.renderOrder = isSel ? 2 : 1;
    }

    if (ready) {
        for (const s of spinners) s.pivot.rotateOnAxis(s.axis, dt * s.rate);
        // Each piece counts down its own timer, so they blink independently
        // rather than in lockstep. Scaled by the rig fade so they disappear
        // with everything else instead of blinking over the array.
        for (const f of flickers) {
            f.t -= dt;
            if (f.t <= 0) {
                f.t = f.period * (0.5 + Math.random());
                f.on = Math.random() < 0.5;
            }
            f.mat.opacity = (f.on ? 1 : 0) * rigOpacity;
        }
    }

    rig.rotation.y += (pointerX * 0.22 - rig.rotation.y) * 0.05;
    rig.rotation.x += (-pointerY * 0.16 - rig.rotation.x) * 0.05;

    renderer.render(scene, camera);
}

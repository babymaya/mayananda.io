import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* mayananda.com — armillary rings.
 *
 * rings.glb is generated from a Houdini FBX, split into ~50 named parts by
 * vertex colour. Legend, authored in Houdini: green trigrams (centre), red
 * flicker, purple boxes (one node each, spins on its own axis),
 * yellow/orange/teal inner/middle/outer ring, magenta the X and Y pivots.
 *
 * SCROLL TIMELINE (p = 0..1 across the runway)
 *   0.00 - 0.16   the rings sweep in from off-screen above
 *   0.00 - 0.62   the rings turn exactly once, so they end flat
 *   0.62 - 1.00   staggered, largest ring first, each ring drops and shrinks into
 *                 one tiny copy of the rig just above the tray
 *
 * The tray and the windows are in desktop.js, so they still work if WebGL or the
 * model fails.
 */

const MODEL = '/rings.glb';

// Turns completed over the scroll. Whole numbers so both ends match.
const TURNS = { outer: 1, middle: -1, inner: 1, centre: 1 };
const TWO_PI = Math.PI * 2;

const IN_A = 0.00, IN_B = 0.16;      // sweep in from off-screen
const TWIST_END = 0.62;              // one full turn ends here, so the rings are flat

// Pointer tilt, in radians at the edge of the window.
const TILT_Y = 0.75, TILT_X = 0.55, TILT_EASE = 0.07;

// The finished tiny ring, as fractions of the screen height.
const TINY_DIAMETER = 0.05;
const TINY_GAP = 0.05;               // between the tray and the tiny ring
const TRAY_PX = 49;                  // tray height + its top border
const RIG_RADIUS = 1.05;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => v * v * (3 - 2 * v);
const MAX_PIXEL_RATIO = 1.5;
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 4.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(pixelRatio());
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

const MAT = {
    ring: new THREE.MeshStandardMaterial({
        color: 0xc10f0f, metalness: 0.25, roughness: 0.45, envMapIntensity: 0.5,
    }),
    // The reel becomes this material's map once it plays. In three.js `map` is
    // multiplied by `color`, so the footage tints the gold instead of replacing it.
    box: new THREE.MeshStandardMaterial({
        color: 0xffc94d, metalness: 0.85, roughness: 0.34, envMapIntensity: 1.0,
    }),
    axis: new THREE.MeshStandardMaterial({
        color: 0x2f6fe0, metalness: 0.55, roughness: 0.35,
    }),
    centre: new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.18,
        metalness: 0.0, roughness: 0.75,
    }),
    flicker: new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3,
        metalness: 0.1, roughness: 0.6, transparent: true, opacity: 1,
    }),
};

/* ---- reel: optional, and never competes with the first paint ------------- */
const REEL_DELAY_MS = 1200;
const videoEl = document.getElementById('reel');

function startReel() {
    if (navigator.connection && navigator.connection.saveData) return;
    videoEl.addEventListener('playing', () => {
        const tex = new THREE.VideoTexture(videoEl);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;              // glTF UV convention
        MAT.box.map = tex;
        MAT.box.needsUpdate = true;
    }, { once: true });
    videoEl.preload = 'auto';
    videoEl.load();
    videoEl.play().catch(() => {
        // Autoplay refused: the first interaction starts it instead.
        window.addEventListener('pointerdown', () => videoEl.play().catch(() => {}),
            { once: true, passive: true });
    });
}

/* ---- rig ---------------------------------------------------------------- */
const rig = new THREE.Group();
const gOuter = new THREE.Group();
const gMiddle = new THREE.Group();
const gInner = new THREE.Group();
const centre = new THREE.Group();
// Siblings, not nested: each ring must move and shrink on its own for the stagger.
// animate() composes their rotations, so they still behave as a gimbal.
rig.add(gOuter, gMiddle, gInner, centre);
scene.add(rig);

// Largest ring first, then inward. a..b is each part's slice of the scroll.
const COLLAPSE = [
    { group: gOuter, a: 0.62, b: 0.82 },
    { group: gMiddle, a: 0.68, b: 0.88 },
    { group: gInner, a: 0.74, b: 0.94 },
    { group: centre, a: 0.80, b: 1.00 },
];

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
    setTimeout(startReel, REEL_DELAY_MS);
}, undefined, (err) => {
    console.error('[rings] failed to load', MODEL, err);
    document.body.classList.add('scene-failed');
});

/* ---- framing ------------------------------------------------------------ */
let offscreenY = 3.0, tinyY = -1.0, tinyScale = 0.05;

function frameToView() {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distV = RIG_RADIUS / Math.tan(vFov / 2);
    const distH = RIG_RADIUS / (Math.tan(vFov / 2) * camera.aspect);
    camera.position.z = Math.max(distV, distH) * 1.18;
    camera.updateProjectionMatrix();

    // Everything below is measured at the rig's depth, so it holds at any window shape.
    const visibleH = 2 * Math.tan(vFov / 2) * camera.position.z;
    offscreenY = (visibleH / 2 + RIG_RADIUS) * 1.15;
    tinyScale = (TINY_DIAMETER * visibleH) / (2 * RIG_RADIUS);
    const trayH = (TRAY_PX / window.innerHeight) * visibleH;
    tinyY = -visibleH / 2 + trayH + (TINY_GAP + TINY_DIAMETER / 2) * visibleH;
}

function onViewportChange() {
    camera.aspect = window.innerWidth / window.innerHeight;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    frameToView();
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

/* ---- loop --------------------------------------------------------------- */
const clock = new THREE.Clock();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const tiltEuler = new THREE.Euler();
const qTilt = new THREE.Quaternion();
const qOuter = new THREE.Quaternion();
const qMiddle = new THREE.Quaternion();
const qInner = new THREE.Quaternion();
const qCentre = new THREE.Quaternion();
let tiltX = 0, tiltY = 0;

function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);

    // Sweep in from above.
    rig.position.y = offscreenY * (1 - smooth(clamp01((p - IN_A) / (IN_B - IN_A))));

    // One full turn. The tilt goes on each ring separately, so a ring turns about
    // its own centre after it has moved to the bottom.
    tiltX += (-pointerY * TILT_X - tiltX) * TILT_EASE;
    tiltY += (pointerX * TILT_Y - tiltY) * TILT_EASE;
    qTilt.setFromEuler(tiltEuler.set(tiltX, tiltY, 0));

    const c = clamp01(p / TWIST_END) * TWO_PI;
    qOuter.setFromAxisAngle(AXIS_X, c * TURNS.outer);
    qMiddle.setFromAxisAngle(AXIS_Y, c * TURNS.middle).premultiply(qOuter);
    qInner.setFromAxisAngle(AXIS_X, c * TURNS.inner).premultiply(qMiddle);
    qCentre.setFromAxisAngle(AXIS_X, c * TURNS.centre);

    gOuter.quaternion.copy(qTilt).multiply(qOuter);
    gMiddle.quaternion.copy(qTilt).multiply(qMiddle);
    gInner.quaternion.copy(qTilt).multiply(qInner);
    centre.quaternion.copy(qTilt).multiply(qCentre);

    // Staggered collapse to one tiny copy above the tray.
    for (const { group, a, b } of COLLAPSE) {
        const s = smooth(clamp01((p - a) / (b - a)));
        group.position.y = tinyY * s;
        group.scale.setScalar(1 + (tinyScale - 1) * s);
    }

    if (ready) {
        for (const s of spinners) s.pivot.rotateOnAxis(s.axis, dt * s.rate);
        for (const f of flickers) {
            f.t -= dt;
            if (f.t <= 0) {
                f.t = f.period * (0.5 + Math.random());
                f.on = Math.random() < 0.5;
            }
            f.mat.opacity = f.on ? 1 : 0;
        }
    }

    renderer.render(scene, camera);
}

/* Page transition: the page itself breaks into glass.
 *
 * Rewritten from a WebGL version that drew a procedural field. A shader cannot
 * see the DOM, so that version refracted an invented picture instead of the
 * page — which is what made it read as an overlay rather than as the page
 * breaking. This version uses `backdrop-filter`, which samples the real
 * backdrop, so every shard shows the actual page behind it.
 *
 *   veil     one full-window layer blurs everything, edge to edge
 *   shards   a small number of large Voronoi cells, each refracting its own
 *            way: its own displacement field, blur, drift angle and spin
 *   sweep    travels across the frame and fires each cell as it arrives, so the
 *            break propagates cell by cell rather than wiping left to right
 *
 * No rims, no outlines, no seam lighting. The only visible edges are where two
 * neighbouring shards refract differently.
 *
 * Played in two halves either side of a real navigation, handed over by a
 * sessionStorage flag. Under 800 ms end to end.
 */

import { prefersReducedMotion } from './glcore.js';

const FLAG = 'fx:enter';
const COVER_MS = 380;
const ARRIVE_MS = 420;

/* Cell count, not cell size — deliberately few and large. About a dozen pieces
 * read as broken glass; fifty read as gravel. */
const cellTarget = () => {
    const w = window.innerWidth;
    return w < 700 ? 7 : w < 1200 ? 10 : 13;
};

/* ---- Voronoi ------------------------------------------------------------ */

/* Clip a convex polygon to the half-plane of points nearer `self` than `other`
 * (Sutherland-Hodgman against the perpendicular bisector). Run against every
 * other site and what remains is the Voronoi cell. O(n^2), but n is a dozen. */
function clipHalfPlane(poly, self, other) {
    const dx = other[0] - self[0];
    const dy = other[1] - self[1];
    const mx = (self[0] + other[0]) / 2;
    const my = (self[1] + other[1]) / 2;
    const f = p => (p[0] - mx) * dx + (p[1] - my) * dy;

    const out = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const fa = f(a);
        const fb = f(b);
        if (fa <= 0) out.push(a);
        if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
            const t = fa / (fa - fb);
            out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        }
    }
    return out;
}

/* Jittered grid rather than uniform random: pure random clumps, which yields a
 * few slivers and one enormous cell. */
function makeSites(w, h, count) {
    const aspect = w / Math.max(h, 1);
    const cols = Math.max(2, Math.round(Math.sqrt(count * aspect)));
    const rows = Math.max(2, Math.ceil(count / cols));
    const sites = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            sites.push([
                (c + 0.5 + (Math.random() - 0.5) * 0.8) * (w / cols),
                (r + 0.5 + (Math.random() - 0.5) * 0.8) * (h / rows)
            ]);
        }
    }
    return sites;
}

function voronoi(w, h, sites) {
    // Pad the box so edge cells run past the viewport and no shard stops short
    // of the screen edge.
    const pad = Math.max(w, h) * 0.6;
    const bounds = [
        [-pad, -pad],
        [w + pad, -pad],
        [w + pad, h + pad],
        [-pad, h + pad]
    ];
    return sites.map((s, i) => {
        let poly = bounds;
        for (let j = 0; j < sites.length && poly.length; j++) {
            if (i !== j) poly = clipHalfPlane(poly, s, sites[j]);
        }
        return poly;
    });
}

/* ---- geometry helpers --------------------------------------------------- */

function bbox(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function centroid(poly) {
    let x = 0, y = 0;
    for (const p of poly) { x += p[0]; y += p[1]; }
    return [x / poly.length, y / poly.length];
}

function polygonToClip(poly, box) {
    return 'polygon(' + poly
        .map(p => `${(p[0] - box.x).toFixed(1)}px ${(p[1] - box.y).toFixed(1)}px`)
        .join(',') + ')';
}

/* ---- filters ------------------------------------------------------------ */

const NS = 'http://www.w3.org/2000/svg';

/* One SVG displacement filter per shard. feTurbulence makes a vector field and
 * feDisplacementMap pushes the backdrop along it — a real per-pixel refraction
 * of real page content. Each shard gets its own seed, frequency and scale, so
 * no two bend the same way. */
function buildFilters(defs, count, seedBase) {
    const ids = [];
    for (let i = 0; i < count; i++) {
        const id = `fx-refract-${i}`;
        ids.push(id);

        const f = document.createElementNS(NS, 'filter');
        f.setAttribute('id', id);
        f.setAttribute('x', '-30%');
        f.setAttribute('y', '-30%');
        f.setAttribute('width', '160%');
        f.setAttribute('height', '160%');
        f.setAttribute('color-interpolation-filters', 'sRGB');

        const turb = document.createElementNS(NS, 'feTurbulence');
        turb.setAttribute('type', 'fractalNoise');
        const fx = 0.004 + Math.random() * 0.010;
        const fy = fx * (0.6 + Math.random());
        turb.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);
        turb.setAttribute('numOctaves', '2');
        turb.setAttribute('seed', String(Math.floor(seedBase + i * 37)));
        turb.setAttribute('result', 'noise');
        f.appendChild(turb);

        const disp = document.createElementNS(NS, 'feDisplacementMap');
        disp.setAttribute('in', 'SourceGraphic');
        disp.setAttribute('in2', 'noise');
        disp.setAttribute('scale', '0');
        disp.setAttribute('xChannelSelector', 'R');
        disp.setAttribute('yChannelSelector', 'G');
        f.appendChild(disp);

        defs.appendChild(f);
    }
    return ids;
}

/* ---- runner ------------------------------------------------------------- */

function createRunner() {
    const root = document.createElement('div');
    root.className = 'fx-glass-root';
    root.setAttribute('aria-hidden', 'true');

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fx-glass-defs');
    const defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);

    // The full-window blur: one layer, edge to edge, over everything.
    const veil = document.createElement('div');
    veil.className = 'fx-veil';
    root.appendChild(veil);

    document.body.appendChild(svg);
    document.body.appendChild(root);

    const supportsBackdrop =
        CSS.supports('backdrop-filter', 'blur(4px)') ||
        CSS.supports('-webkit-backdrop-filter', 'blur(4px)');

    let shards = [];

    function build() {
        shards.forEach(s => s.el.remove());
        while (defs.firstChild) defs.removeChild(defs.firstChild);
        shards = [];

        const w = window.innerWidth;
        const h = window.innerHeight;
        const cells = voronoi(w, h, makeSites(w, h, cellTarget()));
        const ids = buildFilters(defs, cells.length, Math.random() * 500);

        // A random sweep axis, so the break does not always travel the same way.
        const ang = Math.random() * Math.PI * 2;
        const ax = Math.cos(ang);
        const ay = Math.sin(ang);
        const projs = cells.map(p => {
            const c = centroid(p);
            return (c[0] - w / 2) * ax + (c[1] - h / 2) * ay;
        });
        const lo = Math.min(...projs);
        const span = Math.max(Math.max(...projs) - lo, 1);

        cells.forEach((poly, i) => {
            if (poly.length < 3) return;
            const box = bbox(poly);
            const el = document.createElement('div');
            el.className = 'fx-shard';
            el.style.left = `${box.x}px`;
            el.style.top = `${box.y}px`;
            el.style.width = `${box.w}px`;
            el.style.height = `${box.h}px`;
            el.style.clipPath = polygonToClip(poly, box);
            root.appendChild(el);

            const dir = Math.random() * Math.PI * 2;
            const drift = 26 + Math.random() * 54;
            shards.push({
                el,
                filter: ids[i],
                // 0..1 along the sweep axis: when this cell's turn comes.
                t: (projs[i] - lo) / span,
                dx: Math.cos(dir) * drift,
                dy: Math.sin(dir) * drift,
                blur: 1.5 + Math.random() * 4.5,
                disp: 12 + Math.random() * 26,
                lift: 0.12 + Math.random() * 0.45,
                rot: (Math.random() - 0.5) * 5,
                node: defs.querySelector(`#${ids[i]} feDisplacementMap`)
            });
        });
    }

    build();

    let rebuildTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(build, 200);
    });

    /* One clock drives both halves rather than CSS transitions: the
     * displacement lives in an SVG attribute, which CSS cannot animate. */
    function paint(mode, p) {
        const cover = mode === 'cover';
        const ease = cover ? 1 - Math.pow(1 - p, 3) : p * p;

        const veilBlur = cover ? ease * 9 : (1 - p) * 9;
        veil.style.opacity = String(cover ? ease : 1 - p * 0.9);
        const vf = `blur(${veilBlur.toFixed(1)}px) saturate(${(1 + ease * 0.6).toFixed(2)}) ` +
                   `brightness(${(1 + ease * 0.18).toFixed(2)})`;
        veil.style.backdropFilter = vf;
        veil.style.webkitBackdropFilter = vf;

        for (const s of shards) {
            // The sweep reaches this cell at s.t; before that it has not broken
            // yet, after it runs its own local progress.
            const local = Math.max(0, Math.min((p - s.t * 0.55) / 0.45, 1));
            const e = cover ? 1 - Math.pow(1 - local, 3) : local * local;

            const k = cover ? 0.35 : 1;
            const scale = cover ? 1 + 0.02 * e : 1 + 0.10 * e;
            s.el.style.transform =
                `translate3d(${(s.dx * e * k).toFixed(1)}px, ${(s.dy * e * k).toFixed(1)}px, 0) ` +
                `rotate(${(s.rot * e).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
            s.el.style.opacity = String(cover ? e : 1 - e);

            if (supportsBackdrop) {
                const b = s.blur * (cover ? e : 1);
                // brightness/contrast per shard is what makes one piece catch
                // the light and the next stay dull, which is most of what
                // reads as glass on a dark page.
                const bf = `url(#${s.filter}) blur(${b.toFixed(1)}px) ` +
                           `brightness(${(1 + s.lift * e).toFixed(2)}) contrast(${(1 + 0.15 * e).toFixed(2)})`;
                s.el.style.backdropFilter = bf;
                // Safari has no url() backdrop-filter; blur alone still reads.
                s.el.style.webkitBackdropFilter = `blur(${b.toFixed(1)}px)`;
            }
            if (s.node) {
                s.node.setAttribute('scale', (s.disp * (cover ? e : 1 - e * 0.4)).toFixed(1));
            }
        }
    }

    function run(mode, ms) {
        return new Promise(resolve => {
            root.style.display = 'block';
            root.style.pointerEvents = mode === 'cover' ? 'auto' : 'none';

            const t0 = performance.now();
            let done = false;
            // requestAnimationFrame is suspended entirely in a background tab,
            // so it cannot be the only way this finishes. setTimeout still
            // fires when hidden.
            const finish = () => {
                if (done) return;
                done = true;
                clearTimeout(guard);
                resolve();
            };
            const guard = setTimeout(finish, ms + 400);

            const frame = now => {
                if (done) return;
                const p = Math.min((now - t0) / ms, 1);
                paint(mode, p);
                if (p < 1) requestAnimationFrame(frame);
                else finish();
            };
            requestAnimationFrame(frame);
        });
    }

    function hide() {
        root.style.display = 'none';
        root.style.pointerEvents = 'none';
        veil.style.backdropFilter = 'none';
        veil.style.webkitBackdropFilter = 'none';
        for (const s of shards) {
            s.el.style.backdropFilter = 'none';
            s.el.style.webkitBackdropFilter = 'none';
            s.el.style.opacity = '0';
        }
    }

    hide();

    return {
        cover: () => run('cover', COVER_MS),
        arrive: () => run('arrive', ARRIVE_MS).finally(hide),
        hide,
        /* Hold one frame at a fixed progress. The whole thing is under 800 ms,
         * so this is the only practical way to look at it. Not used by the
         * site. */
        still(mode, p) {
            root.style.display = 'block';
            paint(mode, p);
        },
        rebuild: build
    };
}

function isInternalNav(a) {
    if (!a || !a.href) return false;
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    if (a.getAttribute('href')?.startsWith('#')) return false;
    let url;
    try { url = new URL(a.href, location.href); } catch { return false; }
    if (url.origin !== location.origin) return false;
    if (url.pathname === location.pathname && url.hash) return false;
    return true;
}

export function initTransitions() {
    if (prefersReducedMotion()) {
        sessionStorage.removeItem(FLAG);
        return;
    }

    const runner = createRunner();
    if (!runner) {
        sessionStorage.removeItem(FLAG);
        return;
    }

    window.__fx = runner;

    if (sessionStorage.getItem(FLAG)) {
        sessionStorage.removeItem(FLAG);
        runner.arrive();
    }

    let leaving = false;

    document.addEventListener('click', e => {
        if (leaving) return;
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest && e.target.closest('a');
        if (!isInternalNav(a)) return;

        e.preventDefault();
        leaving = true;
        const href = a.href;
        sessionStorage.setItem(FLAG, '1');

        let gone = false;
        const go = () => { if (!gone) { gone = true; location.href = href; } };
        runner.cover().then(go);
        setTimeout(go, COVER_MS + 250);
    });

    window.addEventListener('pageshow', e => {
        if (e.persisted) {
            leaving = false;
            sessionStorage.removeItem(FLAG);
            runner.hide();
        }
    });
}

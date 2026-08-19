/* /ai background: Conway's Game of Life, drawn through a pixel-cell dither.
 *
 * Two passes, different rates:
 *
 *   life   ping-pong pair of RGBA8 textures at cell resolution, stepped on a
 *          fixed 12 Hz tick. R holds the cell, G holds a decaying heat trail
 *          so a cell that just died still glows for a moment.
 *   render every frame, full resolution. An ordered dither turns a smooth
 *          noise field into stable cells, and the life grid is composited on
 *          top of it.
 *
 * The coupling asked for: a blast ripple does not just light pixels up, it
 * writes living cells into the simulation along the expanding ring. So a click
 * seeds a circle of life that then evolves on its own and collides with
 * whatever was already there.
 *
 * Techniques from react-bits (MIT + Commons Clause, (c) 2026 David Haz).
 */

import { program, quadVAO, texture, framebuffer, fitCanvas, startLoop, prefersReducedMotion } from './glcore.js';
import { HASH, BAYER, VNOISE, SHAPES, SRGB } from './chunks.js';

const MAX_CLICKS = 8;
const CELL_CSS = 9;        // css pixels per life cell
const MAX_GRID = 420;      // hard cap per axis, bounds cost on a large monitor
const TICK = 1 / 12;       // seconds per life step

const LIFE_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uPrev;
uniform vec2  uGrid;
uniform float uTime;
uniform float uSpawn;
uniform float uAspect;
uniform int   uClickCount;
uniform vec3  uClicks[${MAX_CLICKS}];
uniform float uRippleSpeed;
uniform float uRippleThickness;

in vec2 vUv;
out vec4 outColor;

${HASH}

float cellAt(vec2 uv, vec2 off) {
  return texture(uPrev, uv + off / uGrid).r > 0.5 ? 1.0 : 0.0;
}

void main() {
  // Sample at cell centres. Landing on a texel edge with REPEAT wrapping reads
  // the wrong neighbour and the simulation quietly drifts.
  vec2 cell = floor(vUv * uGrid);
  vec2 uv = (cell + 0.5) / uGrid;

  vec4 prev = texture(uPrev, uv);
  float alive = prev.r > 0.5 ? 1.0 : 0.0;

  float n = cellAt(uv, vec2(-1.0, -1.0)) + cellAt(uv, vec2(0.0, -1.0)) + cellAt(uv, vec2(1.0, -1.0))
          + cellAt(uv, vec2(-1.0,  0.0))                               + cellAt(uv, vec2(1.0,  0.0))
          + cellAt(uv, vec2(-1.0,  1.0)) + cellAt(uv, vec2(0.0,  1.0)) + cellAt(uv, vec2(1.0,  1.0));

  // B3/S23.
  float next = alive > 0.5
    ? ((n == 2.0 || n == 3.0) ? 1.0 : 0.0)
    : (n == 3.0 ? 1.0 : 0.0);

  // A finite board settles into still lifes and blinkers within a minute or
  // two. A trickle of spontaneous cells keeps it from becoming wallpaper.
  if (hash21t(cell, floor(uTime * 12.0)) < uSpawn) next = 1.0;

  // The blast ring writes life rather than only drawing light.
  vec2 p = vec2(uv.x * uAspect, uv.y);
  for (int i = 0; i < ${MAX_CLICKS}; i++) {
    if (i >= uClickCount) break;
    vec3 c = uClicks[i];
    if (c.z < 0.0) continue;
    float age = uTime - c.z;
    if (age < 0.0 || age > 3.0) continue;
    float r = distance(p, vec2(c.x * uAspect, c.y));
    float ring = abs(r - uRippleSpeed * age);
    // Thin the seeding as the ring travels, so a click reads as one sharp
    // shock rather than an expanding disc of noise.
    float fade = exp(-1.6 * age);
    if (ring < uRippleThickness && hash21t(cell, c.z) < 0.55 * fade) next = 1.0;
  }

  float heat = max(next, prev.g * 0.82);
  outColor = vec4(next, heat, 0.0, 1.0);
}
`;

const RENDER_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uLife;
uniform vec2  uGrid;
uniform vec2  uResolution;
uniform float uCell;
uniform float uTime;
uniform float uDensity;
uniform float uJitter;
uniform float uEdgeFade;
uniform float uLevel;
uniform float uAspect;
uniform vec3  uDim;
uniform vec3  uLive;
uniform vec3  uBirth;
uniform int   uClickCount;
uniform vec3  uClicks[${MAX_CLICKS}];
uniform float uRippleSpeed;
uniform float uRippleThickness;

out vec4 fragColor;

${HASH}
${BAYER}
${VNOISE}
${SHAPES}
${SRGB}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;

  vec2 cellId  = floor(fragCoord / uCell);
  vec2 cellUV  = fract(fragCoord / uCell);
  vec2 lifeUV  = (cellId + 0.5) / uGrid;

  vec4 life = texture(uLife, lifeUV);
  float alive = life.r;
  float heat  = life.g;

  // The drifting field the dither resolves into cells. Without it a dead
  // region of the board is perfectly empty, which reads as broken.
  vec3 np = vec3(cellId / uGrid * vec2(uAspect, 1.0) * 3.0, uTime * 0.05);
  float base = fbm(np, 4) * 0.5 + 0.5;
  float feed = (base - 0.78) + (uDensity - 0.5) * 0.35;

  // Life sits on top of the field, not blended into it: a living cell should
  // always cross the dither threshold rather than merely raise its odds.
  feed = max(feed, alive * 0.95);
  feed = max(feed, heat * 0.45);

  float ringGlow = 0.0;
  vec2 p = vec2(lifeUV.x * uAspect, lifeUV.y);
  for (int i = 0; i < ${MAX_CLICKS}; i++) {
    if (i >= uClickCount) break;
    vec3 c = uClicks[i];
    if (c.z < 0.0) continue;
    float age = uTime - c.z;
    if (age < 0.0 || age > 3.0) continue;
    float r = distance(p, vec2(c.x * uAspect, c.y));
    float ring = exp(-pow((r - uRippleSpeed * age) / uRippleThickness, 2.0));
    ringGlow = max(ringGlow, ring * exp(-1.1 * age) * exp(-2.0 * r));
  }
  feed = max(feed, ringGlow);

  float bayer = Bayer8(fragCoord / uCell) - 0.5;
  float bw = step(0.5, feed + bayer);

  float h = hash21(cellId);
  float coverage = bw * (1.0 + (h - 0.5) * uJitter);

  // Square cells for the body of the field, circles for living cells: the
  // simulation stays legible as a simulation instead of dissolving into grain.
  float mSq = maskSquare(cellUV, coverage);
  float mCi = maskCircle(cellUV, coverage);
  float M = mix(mSq, mCi, clamp(heat, 0.0, 1.0));

  if (uEdgeFade > 0.0) {
    vec2 norm = fragCoord / uResolution;
    float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));
    M *= smoothstep(0.0, uEdgeFade, edge);
  }

  vec3 col = uDim;
  col = mix(col, uLive, clamp(heat, 0.0, 1.0));
  col = mix(col, uBirth, clamp(alive * 0.12 + ringGlow * 1.2, 0.0, 1.0));

  float a = clamp(M, 0.0, 1.0) * uLevel;
  fragColor = vec4(toSRGB(col) * a, a);
}
`;

const hexToRGB = hex => {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    return [
        parseInt(f.slice(0, 2), 16) / 255,
        parseInt(f.slice(2, 4), 16) / 255,
        parseInt(f.slice(4, 6), 16) / 255
    ];
};

export function initLifeBackground(canvas, opts = {}) {
    const {
        dim = '#3a0d0d',
        live = '#c10f0f',
        birth = '#ffc94d',
        density = 0.5,
        jitter = 0.35,
        edgeFade = 0.35,
        level = 0.62,
        spawn = 0.0016,
        rippleSpeed = 0.5,
        rippleThickness = 0.035
    } = opts;

    const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        powerPreference: 'low-power'
    });
    if (!gl) return null;

    const still = prefersReducedMotion();

    let lifeProg, renderProg;
    try {
        lifeProg = program(gl, LIFE_FRAG);
        renderProg = program(gl, RENDER_FRAG);
    } catch (err) {
        // A shader that will not compile must not take the page down with it.
        console.warn('[bg-life] disabled:', err.message);
        return null;
    }

    const vao = quadVAO(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const tex = [null, null];
    const fbo = [null, null];
    let src = 0;
    let grid = [1, 1];
    let cellPx = CELL_CSS;

    const clicks = new Float32Array(MAX_CLICKS * 3).fill(-1);
    let clickIx = 0;
    let clickCount = 0;

    function seed() {
        const [w, h] = grid;
        const data = new Uint8Array(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            const on = Math.random() < 0.32 ? 255 : 0;
            data[i * 4] = on;
            data[i * 4 + 1] = on;
            data[i * 4 + 3] = 255;
        }
        for (let i = 0; i < 2; i++) {
            if (tex[i]) gl.deleteTexture(tex[i]);
            if (fbo[i]) gl.deleteFramebuffer(fbo[i]);
            tex[i] = texture(gl, w, h, { data: i === 0 ? data : null });
            fbo[i] = framebuffer(gl, tex[i]);
        }
        src = 0;
    }

    function resize() {
        if (!fitCanvas(canvas)) return false;
        const dpr = canvas.width / Math.max(canvas.clientWidth, 1);
        cellPx = CELL_CSS * dpr;
        grid = [
            Math.min(MAX_GRID, Math.max(8, Math.ceil(canvas.width / cellPx))),
            Math.min(MAX_GRID, Math.max(8, Math.ceil(canvas.height / cellPx)))
        ];
        seed();
        return true;
    }
    resize();

    function step(time) {
        const [w, h] = grid;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - src]);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.BLEND);
        gl.useProgram(lifeProg.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex[src]);
        const L = lifeProg.loc;
        gl.uniform1i(L.uPrev, 0);
        gl.uniform2f(L.uGrid, w, h);
        gl.uniform1f(L.uTime, time);
        gl.uniform1f(L.uSpawn, spawn);
        gl.uniform1f(L.uAspect, w / h);
        gl.uniform1i(L.uClickCount, clickCount);
        gl.uniform3fv(L.uClicks, clicks);
        gl.uniform1f(L.uRippleSpeed, rippleSpeed);
        gl.uniform1f(L.uRippleThickness, rippleThickness);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.enable(gl.BLEND);
        src = 1 - src;
    }

    function draw(time) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(renderProg.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex[src]);
        const L = renderProg.loc;
        gl.uniform1i(L.uLife, 0);
        gl.uniform2f(L.uGrid, grid[0], grid[1]);
        gl.uniform2f(L.uResolution, canvas.width, canvas.height);
        gl.uniform1f(L.uCell, cellPx);
        gl.uniform1f(L.uTime, time);
        gl.uniform1f(L.uDensity, density);
        gl.uniform1f(L.uJitter, jitter);
        gl.uniform1f(L.uEdgeFade, edgeFade);
        gl.uniform1f(L.uLevel, level);
        gl.uniform1f(L.uAspect, grid[0] / grid[1]);
        gl.uniform3fv(L.uDim, hexToRGB(dim));
        gl.uniform3fv(L.uLive, hexToRGB(live));
        gl.uniform3fv(L.uBirth, hexToRGB(birth));
        gl.uniform1i(L.uClickCount, clickCount);
        gl.uniform3fv(L.uClicks, clicks);
        gl.uniform1f(L.uRippleSpeed, rippleSpeed);
        gl.uniform1f(L.uRippleThickness, rippleThickness);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* The canvas sits behind the text and takes no pointer events, so the blast
     * is triggered from the window and mapped back into canvas space. */
    function blastAt(clientX, clientY, time) {
        const r = canvas.getBoundingClientRect();
        const x = (clientX - r.left) / Math.max(r.width, 1);
        const y = 1 - (clientY - r.top) / Math.max(r.height, 1);
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        clicks[clickIx * 3] = x;
        clicks[clickIx * 3 + 1] = y;
        clicks[clickIx * 3 + 2] = time;
        clickIx = (clickIx + 1) % MAX_CLICKS;
        clickCount = Math.min(clickCount + 1, MAX_CLICKS);
    }

    let now = 0;
    const onDown = e => blastAt(e.clientX, e.clientY, now);
    window.addEventListener('pointerdown', onDown, { passive: true });

    if (still) {
        // Reduced motion: one settled frame, no ticking, no ripples.
        const settle = () => { for (let i = 0; i < 6; i++) step(i * TICK); draw(0); };
        settle();
        window.removeEventListener('pointerdown', onDown);
        const onResizeStill = () => { if (resize()) settle(); };
        window.addEventListener('resize', onResizeStill);
        return () => window.removeEventListener('resize', onResizeStill);
    }

    let acc = 0;
    let nextAuto = 4 + Math.random() * 6;
    const stop = startLoop(canvas, (time, dt) => {
        now = time;
        if (resize()) acc = 0;

        // An idle page should still show the coupling, so fire the occasional
        // blast on its own.
        if (time > nextAuto) {
            const r = canvas.getBoundingClientRect();
            blastAt(r.left + Math.random() * r.width, r.top + Math.random() * r.height, time);
            nextAuto = time + 6 + Math.random() * 10;
        }

        acc += dt;
        // Cap catch-up steps: after a stall, run at most a few ticks rather
        // than however many the clock says are owed.
        let steps = 0;
        while (acc >= TICK && steps < 3) { step(time); acc -= TICK; steps++; }
        if (acc > TICK) acc = 0;

        draw(time);
    });

    return () => {
        stop();
        window.removeEventListener('pointerdown', onDown);
    };
}

/* Home page overlay: reaction-diffusion that grows from each click and dissolves
 * into a Game of Life. It is on while the tray is up (desktop.js turns it on and
 * off). Self-contained: plain WebGL2, no other modules.
 *
 *   rd     Gray-Scott on a fine grid, 32-bit floats. R = U, G = V, B = lifetime.
 *          A click seeds a noisy blob. The pattern starts white, turns blue with
 *          age, and fades when its lifetime runs out.
 *   life   Game of Life on a coarser grid, 3 steps per second. R = cell, G = trail.
 *   draw   Solid cells with a small gap; dead-cell trails as a small halftone.
 *   imprint  When the media viewer closes, desktop.js calls imprint() with the
 *          image (or the video's last frame) and where it was on screen. Each
 *          life cell takes the brightness there: an ordered (Bayer 4x4) halftone
 *          decides which cells live, and the trail channel takes the brightness,
 *          so the fine trail halftone shows the grey tones. Then the normal
 *          rules run on it: the picture seeds the life pattern.
 *
 * How they meet, over each pattern's life:
 *   - while young (KILL_END), the pattern clears all life in its area;
 *   - its edges always kill life;
 *   - the coupling then grows in a straight line with its age: the pattern gives
 *     birth to life (TAKEOVER) and life disturbs the pattern (LIFE_FEED);
 *   - when it is gone, the life it left behind runs on under the normal rules.
 * The screen edges are hard: nothing wraps to the opposite side.
 * A faint background of gliders keeps BACKGROUND % alive; above MAX_RED % red a
 * random die-off holds the red down.
 *
 * Values locked in on the tuning page, 2026-11-10.
 * Dither technique from react-bits (MIT + Commons Clause, (c) 2026 David Haz).
 */

const SETTINGS = {
    feed: 0.029, kill: 0.057,       // Gray-Scott "maze"
    cell: 3,                         // drawn pattern cell, css px
    size: 1.5,                       // pattern grid cell, css px
    speed: 3,                        // pattern steps per frame
    lasts: 10,                       // pattern lifetime, s
    lifeCell: 6,                     // Game of Life cell, css px
    bg: 2,                           // background: live share kept up, %
    maxRed: 30,                      // most red on screen, %
    trail: 6.5,                      // dead-cell trail, s
    takeover: 0.35,                  // pattern -> life, at full coupling
    killEnd: 0.5,                    // pattern clears life for this share of its life
    start: 0.05,                     // coupling starts at this share of its life
    lifeFeed: 0.04,                  // life -> pattern, at full coupling
};

const GAP = 0.15;            // gap around each drawn cell, share of a cell
const THRESH = 0.22;         // V above this = pattern cell on
const SEED_R = 5;            // seed blob radius, pattern cells
const LIFE_TICK = 1 / 3;     // Game of Life steps per second: 3
const LIFE_START = 0.12;     // live share at the start
const CAP_SOFT = 5;          // die-off starts this many % below MAX_RED
const CAP_DEATH = 0.15;      // die-off chance per step at MAX_RED
const FADE_SECONDS = 0.6;    // overlay fade in and out
const IMPRINT_HOLD = 4000;   // ms after an imprint with no red-cap die-off
// Bayer 4x4 thresholds for the imprint halftone, 0..1.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const LEVEL = 1.0;           // overall overlay strength
const BASE = 0.5;            // brightness away from the mouse
const SPOT_PX = 160;         // radius (css px) of the full-brightness area around the mouse

// Colours in linear light (the draw pass converts to sRGB).
const WHITE = [1, 1, 1];
const BLUE = [0.028, 0.162, 0.745];      // #2f6fe0
const RED = [0.527, 0.005, 0.005];       // #c10f0f

const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const STEP = `#version 300 es
precision highp float;
uniform sampler2D uPrev, uLife; uniform vec2 uGrid; uniform float uFeed, uKill, uDecay, uLifeFeed, uStart;
uniform vec3 uSeed;      // x, y in uv, radius in cells; radius < 0 = no seed
in vec2 vUv; out vec4 o;
// Outside the screen = empty rest state, so nothing wraps to the opposite edge.
vec3 at(vec2 uv, vec2 off) {
  vec2 p = uv + off / uGrid;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec3(1.0, 0.0, 0.0);
  return texture(uPrev, p).rgb;
}
// Coupling to the Game of Life: straight line from 0 at uStart to 1 at the end.
float coupling(float life) {
  return life > 0.0 ? clamp((1.0 - life - uStart) / max(1.0 - uStart, 0.001), 0.0, 1.0) : 0.0;
}
void main() {
  vec2 cell = floor(vUv * uGrid); vec2 uv = (cell + 0.5) / uGrid;
  vec3 c = at(uv, vec2(0));
  vec3 n = at(uv, vec2(0,1)), s = at(uv, vec2(0,-1)), e = at(uv, vec2(1,0)), w = at(uv, vec2(-1,0));
  vec2 lap = -c.rg + 0.2 * (n.rg + s.rg + e.rg + w.rg)
           + 0.05 * (at(uv, vec2(1,1)).rg + at(uv, vec2(-1,1)).rg + at(uv, vec2(1,-1)).rg + at(uv, vec2(-1,-1)).rg);
  float u = c.r, v = c.g, uvv = u * v * v;
  u += lap.r - uvv + uFeed * (1.0 - u);
  v += 0.5 * lap.g + uvv - (uFeed + uKill) * v;
  v += uLifeFeed * texture(uLife, uv).r * coupling(c.b);

  // Lifetime travels with the pattern; where it reaches 0 the cell rests.
  float life = max(c.b, max(max(n.b, s.b), max(e.b, w.b)) * step(0.002, v)) - uDecay;
  life = max(life, 0.0);
  float keep = smoothstep(0.0, 0.15, life);
  u = mix(1.0, u, keep);
  v *= keep;

  // Seed: an irregular, noisy blob (a perfect circle grows a mirror image).
  if (uSeed.z > 0.0) {
    vec2 d = (cell + 0.5) - uSeed.xy * uGrid;
    float h = fract(sin(dot(cell + uSeed.xy * 977.0, vec2(127.1, 311.7))) * 43758.5453);
    float h2 = fract(h * 91.7);
    float edgeR = uSeed.z * (0.6 + 0.8 * fract(sin(dot(floor(d / 2.0) + uSeed.xy * 31.0, vec2(12.9898, 78.233))) * 43758.5453));
    if (length(d) < edgeR && h < 0.6) { u = 0.4 + 0.2 * h2; v = 0.15 + 0.2 * fract(h2 * 13.3); life = 1.0; }
  }
  o = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), life, 1.0);
}`;

const LIFE = `#version 300 es
precision highp float;
uniform sampler2D uPrev, uRd; uniform vec2 uGrid, uRdGrid;
uniform int uRule; uniform float uTime, uConvert, uThresh, uDeath, uSpawnP, uHeatDecay, uStart, uKillEnd;
in vec2 vUv; out vec4 o;
float hash21t(vec2 p, float t) { return fract(sin(dot(p + t, vec2(12.9898, 78.233))) * 43758.5453123); }
// Outside the screen = dead, so nothing wraps.
float at(vec2 uv, vec2 off) {
  vec2 p = uv + off / uGrid;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;
  return texture(uPrev, p).r > 0.5 ? 1.0 : 0.0;
}
void main() {
  vec2 cell = floor(vUv * uGrid); vec2 uv = (cell + 0.5) / uGrid;
  vec4 prev = texture(uPrev, uv);
  float alive = prev.r > 0.5 ? 1.0 : 0.0, next = alive, heat = prev.g;
  if (uRule == 1) {
    float n = at(uv, vec2(-1,-1)) + at(uv, vec2(0,-1)) + at(uv, vec2(1,-1)) + at(uv, vec2(-1,0))
            + at(uv, vec2(1,0)) + at(uv, vec2(-1,1)) + at(uv, vec2(0,1)) + at(uv, vec2(1,1));
    next = alive > 0.5 ? ((n == 2.0 || n == 3.0) ? 1.0 : 0.0) : (n == 3.0 ? 1.0 : 0.0);
    // Faint background: gliders at random places while too little is alive.
    float tick = floor(uTime * 3.0);
    vec2 tile = floor(cell / 3.0);
    if (uSpawnP > 0.0 && hash21t(tile, tick) < uSpawnP) {
      vec2 l = mod(cell, 3.0);
      float h = hash21t(tile, tick + 5.0);
      if (h > 0.5) l.x = 2.0 - l.x;
      if (fract(h * 7.0) > 0.5) l.y = 2.0 - l.y;
      bool g = (l.x == 1.0 && l.y == 0.0) || (l.x == 2.0 && l.y == 1.0) || l.y == 2.0;
      next = g ? 1.0 : 0.0;
    }
    // Red cap: random die-off near the maximum.
    if (next > 0.5 && hash21t(cell, tick + 11.0) < uDeath) next = 0.0;
    heat = prev.g * uHeatDecay;
  }
  vec4 rd = texture(uRd, uv);
  float k = rd.b > 0.0 ? clamp((1.0 - rd.b - uStart) / max(1.0 - uStart, 0.001), 0.0, 1.0) : 0.0;
  if (rd.g > uThresh && hash21t(cell, floor(uTime * 8.0)) < uConvert * k) next = 1.0;

  // While young, a pattern clears life in its whole area (within 2 pattern cells).
  float regionB = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++)
    regionB = max(regionB, texture(uRd, uv + vec2(x, y) / uRdGrid).b);
  if (regionB > 0.0 && 1.0 - regionB < uKillEnd) next = 0.0;

  // Pattern edges always kill life.
  if (rd.b > 0.0) {
    vec2 px = 1.0 / uRdGrid;
    bool on = rd.g > uThresh;
    bool edge = ((texture(uRd, uv + vec2(px.x, 0.0)).g > uThresh) != on)
             || ((texture(uRd, uv - vec2(px.x, 0.0)).g > uThresh) != on)
             || ((texture(uRd, uv + vec2(0.0, px.y)).g > uThresh) != on)
             || ((texture(uRd, uv - vec2(0.0, px.y)).g > uThresh) != on);
    if (edge) next = 0.0;
  }
  o = vec4(next, max(next, heat), 0.0, 1.0);
}`;

const DRAW = `#version 300 es
precision highp float;
uniform sampler2D uRd, uLife; uniform vec2 uResolution;
uniform float uCell, uLifeCell, uPixel, uGap, uThresh, uLevel, uBase, uSpot;
uniform vec2 uMouse;     // device px, origin bottom left; far away when there is no mouse
uniform vec3 uWhite, uBlue, uRed;
out vec4 o;
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float Bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
#define Bayer4(a) (Bayer2(0.5 * (a)) * 0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(0.5 * (a)) * 0.25 + Bayer2(a))
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec4 rd = texture(uRd, (floor(fc / uCell) + 0.5) * uCell / uResolution);
  vec4 life = texture(uLife, (floor(fc / uLifeCell) + 0.5) * uLifeCell / uResolution);
  bool rdGap = any(lessThan(fract(fc / uCell), vec2(uGap)));
  bool lifeGap = any(lessThan(fract(fc / uLifeCell), vec2(uGap)));
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (rd.g > uThresh && !rdGap) {
    col = mix(uBlue, uWhite, smoothstep(0.35, 1.0, rd.b));
    a = 0.9;
  } else if (life.r > 0.5 && !lifeGap) {
    col = uRed; a = 0.85;
  } else if (life.g > 0.02) {
    col = uRed; a = 0.55 * step(Bayer8(fc / uPixel), life.g * 0.9);
  }
  // 50% everywhere, 100% in a soft circle around the mouse.
  float spot = 1.0 - smoothstep(uSpot * 0.5, uSpot, distance(fc, uMouse));
  a *= uLevel * mix(uBase, 1.0, spot);
  o = vec4(toSRGB(col) * a, a);
}`;

export function createOverlay() {
    const S = SETTINGS;
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-overlay';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    const gl = canvas.getContext('webgl2', {
        alpha: true, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: true, powerPreference: 'low-power',
    });
    // The pattern needs float render targets; without them there is no overlay.
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) { canvas.remove(); return null; }

    function prog(frag) {
        const mk = (t, src) => {
            const sh = gl.createShader(t);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
            return sh;
        };
        const p = gl.createProgram();
        gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
        gl.attachShader(p, mk(gl.FRAGMENT_SHADER, frag));
        gl.bindAttribLocation(p, 0, 'aPos');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const loc = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
            const name = gl.getActiveUniform(p, i).name;
            loc[name] = gl.getUniformLocation(p, name);
        }
        return { p, loc };
    }

    let stepProg, lifeProg, drawProg;
    try { stepProg = prog(STEP); lifeProg = prog(LIFE); drawProg = prog(DRAW); }
    catch (err) { console.warn('[overlay] disabled:', err.message); canvas.remove(); return null; }

    gl.bindVertexArray(gl.createVertexArray());
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    function target(w, h, data, bytes) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        if (bytes) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        // 32-bit: 16-bit floats round the slow lifetime back to 1.0 every step.
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { t, fb };
    }
    const free = (set) => { for (const x of set.a) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.fb); } };

    const sim = { a: [], src: 0, grid: [1, 1] };
    const life = { a: [], src: 0, grid: [1, 1] };
    let dpr = 1;

    function reset() {
        free(sim);
        const w = Math.max(8, Math.ceil(canvas.width / (S.size * dpr)));
        const h = Math.max(8, Math.ceil(canvas.height / (S.size * dpr)));
        sim.grid = [w, h];
        const d = new Float32Array(w * h * 4);
        for (let i = 0; i < w * h; i++) { d[i * 4] = 1; d[i * 4 + 3] = 1; }
        sim.a = [target(w, h, d), target(w, h, null)];
        sim.src = 0;

        free(life);
        const lw = Math.max(8, Math.ceil(canvas.width / (S.lifeCell * dpr)));
        const lh = Math.max(8, Math.ceil(canvas.height / (S.lifeCell * dpr)));
        life.grid = [lw, lh];
        const ld = new Uint8Array(lw * lh * 4);
        for (let i = 0; i < lw * lh; i++) {
            const on = Math.random() < LIFE_START ? 255 : 0;
            ld[i * 4] = on; ld[i * 4 + 1] = on; ld[i * 4 + 3] = 255;
        }
        life.a = [target(lw, lh, ld, true), target(lw, lh, null, true)];
        life.src = 0;
    }

    function fit() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (w === canvas.width && h === canvas.height) return;
        canvas.width = w;
        canvas.height = h;
        reset();
    }

    // Background and red cap, from the measured life share twice per second.
    let spawnP = 0, capDeath = 0, nextMeasure = 0, capHoldUntil = 0;
    function measure(now) {
        const [w, h] = life.grid;
        const buf = new Uint8Array(w * h * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, life.a[life.src].fb);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        let live = 0, red = 0;
        for (let i = 0; i < w * h; i++) {
            if (buf[i * 4] > 127) { live++; red++; } else if (buf[i * 4 + 1] > 64) red++;
        }
        const liveShare = 100 * live / (w * h), redShare = 100 * red / (w * h);
        spawnP = 0.0015 * Math.max(0, S.bg - liveShare) / Math.max(S.bg, 0.01);
        const soft = S.maxRed - CAP_SOFT;
        capDeath = CAP_DEATH * Math.min(1, Math.max(0, (redShare - soft) / CAP_SOFT));
        // A fresh imprint is far above the red cap; let it run before the die-off.
        if (now < capHoldUntil) capDeath = 0;
    }

    // Mouse position in css px from the top left; null = no mouse over the page.
    let mouse = null;
    window.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = canvas.getBoundingClientRect();
        mouse = [e.clientX - r.left, e.clientY - r.top];
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { mouse = null; });

    /* Every click seeds the pattern while the overlay is on, also a click on a
     * window, the tray or a title bar (windows sit above the canvas). Capture
     * phase on window, so a handler that stops the event cannot hide it. */
    let seed = null;
    window.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !active) return;
        const r = canvas.getBoundingClientRect();
        seed = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
    }, { capture: true, passive: true });

    const heatDecay = Math.pow(0.02, LIFE_TICK / S.trail);
    let simTime = 0, lifeAcc = 0;

    function lifePass(rule) {
        gl.useProgram(lifeProg.p);
        const F = lifeProg.loc;
        gl.bindFramebuffer(gl.FRAMEBUFFER, life.a[1 - life.src].fb);
        gl.viewport(0, 0, life.grid[0], life.grid[1]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, life.a[life.src].t);
        gl.uniform1i(F.uPrev, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sim.a[sim.src].t);
        gl.uniform1i(F.uRd, 1);
        gl.uniform2f(F.uGrid, life.grid[0], life.grid[1]);
        gl.uniform2f(F.uRdGrid, sim.grid[0], sim.grid[1]);
        gl.uniform1i(F.uRule, rule);
        gl.uniform1f(F.uTime, simTime);
        gl.uniform1f(F.uConvert, S.takeover);
        gl.uniform1f(F.uStart, S.start);
        gl.uniform1f(F.uKillEnd, S.killEnd);
        gl.uniform1f(F.uDeath, capDeath);
        gl.uniform1f(F.uSpawnP, spawnP);
        gl.uniform1f(F.uHeatDecay, heatDecay);
        gl.uniform1f(F.uThresh, THRESH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        life.src = 1 - life.src;
    }

    function step(dt, now) {
        gl.disable(gl.BLEND);
        gl.useProgram(stepProg.p);
        const L = stepProg.loc;
        for (let i = 0; i < S.speed; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, sim.a[1 - sim.src].fb);
            gl.viewport(0, 0, sim.grid[0], sim.grid[1]);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, sim.a[sim.src].t);
            gl.uniform1i(L.uPrev, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, life.a[life.src].t);
            gl.uniform1i(L.uLife, 1);
            gl.uniform2f(L.uGrid, sim.grid[0], sim.grid[1]);
            gl.uniform1f(L.uFeed, S.feed);
            gl.uniform1f(L.uKill, S.kill);
            gl.uniform1f(L.uDecay, 1 / (S.lasts * 60 * S.speed));
            gl.uniform1f(L.uLifeFeed, S.lifeFeed / S.speed);
            gl.uniform1f(L.uStart, S.start);
            gl.uniform3f(L.uSeed, seed ? seed[0] : 0, seed ? seed[1] : 0, seed && i === 0 ? SEED_R : -1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            sim.src = 1 - sim.src;
        }
        seed = null;

        simTime += dt;
        lifeAcc += dt;
        if (now > nextMeasure) { nextMeasure = now + 500; measure(now); }
        if (lifeAcc >= LIFE_TICK) { lifeAcc = Math.min(lifeAcc - LIFE_TICK, LIFE_TICK); lifePass(1); }
        lifePass(0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function draw(level) {
        gl.enable(gl.BLEND);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(drawProg.p);
        const D = drawProg.loc;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sim.a[sim.src].t);
        gl.uniform1i(D.uRd, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, life.a[life.src].t);
        gl.uniform1i(D.uLife, 1);
        gl.uniform2f(D.uResolution, canvas.width, canvas.height);
        gl.uniform1f(D.uCell, S.cell * dpr);
        gl.uniform1f(D.uLifeCell, S.lifeCell * dpr);
        gl.uniform1f(D.uPixel, 2 * dpr);
        gl.uniform1f(D.uGap, GAP);
        gl.uniform1f(D.uThresh, THRESH);
        gl.uniform1f(D.uLevel, level);
        gl.uniform1f(D.uBase, BASE);
        gl.uniform1f(D.uSpot, SPOT_PX * dpr);
        if (mouse) gl.uniform2f(D.uMouse, mouse[0] * dpr, canvas.height - mouse[1] * dpr);
        else gl.uniform2f(D.uMouse, -1e5, -1e5);
        gl.uniform3fv(D.uWhite, WHITE);
        gl.uniform3fv(D.uBlue, BLUE);
        gl.uniform3fv(D.uRed, RED);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let active = false, fade = 0, raf = 0, last = 0;

    function frame(now) {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        fade = Math.max(0, Math.min(1, fade + (active ? dt : -dt) / FADE_SECONDS));
        fit();
        if (!still && document.visibilityState !== 'hidden') step(dt, now);
        draw(fade * LEVEL);
        if (active || fade > 0) raf = requestAnimationFrame(frame);
        else { raf = 0; gl.clear(gl.COLOR_BUFFER_BIT); }
    }

    /* Stamp media (img or video, drawable, same origin or CORS) into the life
     * grid. rect = where its picture was, css px from the viewport's top left.
     * Returns false when nothing was stamped. */
    const scratch = document.createElement('canvas');
    function imprint(media, rect) {
        if (!active || !rect || rect.width < 1 || rect.height < 1) return false;
        fit();
        const r = canvas.getBoundingClientRect();
        const [gw, gh] = life.grid;
        const sx = gw / r.width, sy = gh / r.height;
        // Cells covered, columns from the left and rows from the top.
        const c0 = Math.max(0, Math.floor((rect.left - r.left) * sx));
        const c1 = Math.min(gw, Math.ceil((rect.left + rect.width - r.left) * sx));
        const t0 = Math.max(0, Math.floor((rect.top - r.top) * sy));
        const t1 = Math.min(gh, Math.ceil((rect.top + rect.height - r.top) * sy));
        const w = c1 - c0, h = t1 - t0;
        if (w < 1 || h < 1) return false;

        scratch.width = w;
        scratch.height = h;
        const ctx = scratch.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        let px;
        try {
            ctx.drawImage(media, (rect.left - r.left) * sx - c0, (rect.top - r.top) * sy - t0,
                rect.width * sx, rect.height * sy);
            px = ctx.getImageData(0, 0, w, h).data;
        } catch (err) {
            console.warn('[overlay] imprint skipped:', err.message);
            return false;
        }

        // Texture rows go from the bottom; canvas rows from the top.
        const out = new Uint8Array(w * h * 4);
        for (let j = 0; j < h; j++) {
            const k = h - 1 - j;
            for (let i = 0; i < w; i++) {
                const p = (j * w + i) * 4, o = (k * w + i) * 4;
                const lum = (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) / 255;
                const live = lum > BAYER4[((t0 + j) & 3) * 4 + ((c0 + i) & 3)] ? 255 : 0;
                out[o] = live;
                out[o + 1] = Math.max(live, Math.round(lum * 255));
                out[o + 3] = 255;
            }
        }
        gl.bindTexture(gl.TEXTURE_2D, life.a[life.src].t);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, c0, gh - t1, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
        capHoldUntil = performance.now() + IMPRINT_HOLD;
        capDeath = 0;
        return true;
    }

    fit();
    return {
        imprint,
        setActive(on) {
            active = on;
            canvas.classList.toggle('active', on);
            if (!raf && (on || fade > 0)) {
                last = performance.now();
                raf = requestAnimationFrame(frame);
            }
        },
    };
}

/* Minimal WebGL2 harness for fullscreen fragment effects.
 *
 * Every background effect on this site is one fullscreen triangle plus one
 * fragment shader. That is all this file provides: compile, bind, resize, and
 * a frame loop that stops when nobody is looking at it.
 *
 * Deliberately not a library. No scene graph, no camera, no material system —
 * the shader writes gl_Position itself, so none of that would ever be read.
 */

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
        gl.deleteShader(sh);
        throw new Error(`${kind} shader failed to compile:\n${log}`);
    }
    return sh;
}

export function program(gl, fragSrc, vertSrc = VERT) {
    const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        throw new Error(`program failed to link:\n${log}`);
    }
    // Cache uniform locations up front. getUniformLocation every frame is a
    // string lookup into the driver; doing it once is free.
    const loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        const name = info.name.replace(/\[0\]$/, '');
        loc[name] = gl.getUniformLocation(p, name);
    }
    return { p, loc };
}

/* One triangle, not two. It covers the viewport with three vertices instead of
 * six and has no diagonal seam, which matters for derivative-based antialiasing
 * (fwidth) along the middle of the screen. */
export function quadVAO(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
}

export function texture(gl, w, h, { filter = gl.NEAREST, wrap = gl.REPEAT, data = null } = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return t;
}

export function framebuffer(gl, tex) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw new Error('framebuffer incomplete');
    return fb;
}

/* Device pixel ratio is capped at 2. Past that the cost is quadratic and the
 * difference is invisible; a 3x phone would render 9x the fragments of a 1x
 * screen for an animated background nobody is inspecting closely. */
export function fitCanvas(canvas, maxDpr = 2) {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w;
    canvas.height = h;
    return true;
}

/* Frame loop that pauses when the tab is hidden or the canvas has scrolled off
 * screen. An animated background that keeps running in a background tab is a
 * battery bug, not a feature. */
export function startLoop(canvas, onFrame) {
    let raf = 0;
    let visible = true;
    let onScreen = true;
    let last = performance.now();
    let elapsed = 0;

    const io = 'IntersectionObserver' in window
        ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }, { threshold: 0 })
        : null;
    if (io) io.observe(canvas);

    const onVis = () => { visible = document.visibilityState !== 'hidden'; };
    document.addEventListener('visibilitychange', onVis);

    const tick = now => {
        raf = requestAnimationFrame(tick);
        // Clamp dt so returning to a parked tab does not advance the
        // simulation by however many seconds the tab was asleep.
        const dt = Math.min((now - last) / 1000, 1 / 20);
        last = now;
        if (!visible || !onScreen) return;
        elapsed += dt;
        onFrame(elapsed, dt);
    };
    raf = requestAnimationFrame(tick);

    return () => {
        cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVis);
        if (io) io.disconnect();
    };
}

/* Reduced-motion is honoured everywhere an effect animates. */
export const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

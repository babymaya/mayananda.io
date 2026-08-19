# fx — effects layer

Animated backgrounds and page transitions. No framework.

The background is raw WebGL2. The transition is DOM + `backdrop-filter` — it has
to refract the real page, and a shader cannot see the DOM.

## Files

| File | What it is |
|---|---|
| `glcore.js` | The harness: compile, fullscreen triangle, textures, framebuffers, DPR-capped resize, a frame loop that pauses when unseen. ~150 lines. |
| `chunks.js` | Shared GLSL strings — hashes, Bayer dither, value noise + fBm, cell shapes, cosine palette, sRGB. |
| `bg-life.js` | The `/ai` background: Game of Life through a pixel dither. |
| `transition.js` | The page transition: Voronoi glass shards over the live page. |
| `site.js` | Entry point. Loaded by every page. |

## Wiring

`site.js` is loaded by all six pages as `<script type="module" src="/fx/site.js">`.
Transitions are always on. The background is opt-in per page:

```html
<body class="page terminal" data-bg="life">
```

`data-bg="life"` is the only value that does anything today. The module is
imported dynamically, so the five pages without a background never download it
(it is a separate ~3.4 kB gzip chunk).

The terminal frame is CSS only — `class="page terminal"` plus
`<main data-term="visitor@mayananda: ~/ai">` for the title-bar label. It is on
`/ai`, `/pipeline` and `/about`. Only `/ai` also has the animated background.

## Why raw WebGL2

The four react-bits components this was built from each ship a React component
around three.js or ogl. Reading them showed all four are the same program: a
fullscreen quad, one fragment shader, a rAF loop pushing uniforms. Every vertex
shader is `gl_Position = vec4(position, 1.0)` — no camera transform, so the
`OrthographicCamera` and `PlaneGeometry` each one constructs are never read.

So the framework was replaced with `glcore.js`. The site had no React, and
adding it plus three.js to render a fullscreen quad would have been the largest
dependency on the site by an order of magnitude.

## /ai background

Two passes at different rates:

- **life** — ping-pong RGBA8 pair at cell resolution, stepped at a fixed 12 Hz.
  `R` is the cell, `G` is a decaying heat trail so a cell that just died still
  glows. Standard B3/S23.
- **render** — every frame, full resolution. An 8×8 ordered dither turns a
  drifting fBm field into stable cells; the life grid composites on top.

The coupling: a blast ripple does not only draw light, it **writes living cells
into the simulation** along the expanding ring. A click seeds a circle of life
that then evolves on its own and collides with what was already there. The ring
is read by both passes — the life pass seeds from it, the render pass glows it.

Two settings that were tuned by eye, not guessed:

- **Seed density is 0.32.** At 0.11 the board dies into still lifes within a
  couple of seconds and stops moving entirely — verified in the browser, it
  looked broken. A denser soup stays chaotic.
- **`spawn` is 0.0016 per cell per tick.** Even a good soup settles on a board
  this size. The trickle keeps it alive without reading as noise.

`level` (0.62) scales final alpha. This sits behind body text, so it is texture,
not subject.

## Transition

Six separate documents, so it is played in two halves either side of a real
navigation, handed over by a `sessionStorage` flag:

| Half | What happens | Duration |
|---|---|---|
| leaving | the page breaks cell by cell and blurs over | 380 ms |
| arriving | shards drift apart and clear, revealing the new page | 420 ms |

Under 800 ms end to end.

**This is DOM, not WebGL, and that is the whole point.** The first version was a
shader drawing a procedural field — but a shader cannot see the DOM, so it was
refracting an invented picture instead of the page, which is why it read as an
overlay rather than as the page breaking. `backdrop-filter` samples the real
backdrop, so each shard shows the actual content behind it.

How it is put together:

- **Voronoi cells, computed in JS.** Sutherland-Hodgman clipping of a padded
  rectangle against each perpendicular bisector. O(n²), but n is about a dozen.
  Sites come from a jittered grid, not uniform random — random clumps, giving
  slivers and one huge cell.
- **Few and large:** 7 cells on a phone, 13 on a wide screen. Fifty small ones
  read as gravel.
- **Per-cell refraction.** Each shard gets its own SVG `feTurbulence` +
  `feDisplacementMap`, with its own seed, frequency and scale, applied through
  `backdrop-filter: url(#id)`. That is a real per-pixel bend of real content,
  and no two shards bend the same way. Each also gets its own blur, brightness
  lift, drift angle and spin.
- **The sweep fires cell by cell.** Each cell's centroid is projected onto a
  random axis; that position is when its break starts. The sweep travels across
  the frame and sets off each cell as it arrives, rather than wiping.
- **One full-window veil** blurs everything edge to edge, over the nav and the
  animated background too.
- **No borders.** No rims, outlines or seam lighting. The only visible edges are
  where two neighbouring shards refract differently.

### Three things that bite

1. **`requestAnimationFrame` is suspended entirely in a background tab.** The
   first version resolved its promise only from inside the rAF loop, so
   navigating and immediately switching tabs left the layer stuck over the
   arriving page. Found in the browser, not by reading. `run()` now races a
   `setTimeout` guard, which does still fire when hidden. Do not remove it.
2. **This site is nearly black, and blurring black gives black.** The first
   backdrop-filter pass crushed the whole screen to near-nothing and read as a
   fade-out. Each shard now carries its own `brightness()` and `contrast()`
   lift; that variation between neighbouring pieces is most of what reads as
   glass on a dark page.
3. **Displacement overshoots fast.** At `scale` 26-80 the page stopped looking
   like bent glass and became liquid smear. 12-38 is the usable band.

### Cost

A dozen overlapping `backdrop-filter` layers is the expensive part of this
approach — each one forces the backdrop to be re-filtered. Shards are sized to
their polygon's bounding box rather than fullscreen, which limits it, but the
boxes still overlap.

**This has not been measured on real hardware.** Frame rate could not be timed
under browser automation: the automated tab is backgrounded, so rAF is
suspended and any figure would have been invented. If it stutters, lower
`cellTarget()` first.

## Debug hook

`window.__fx.still(mode, p)` holds one transition frame at a fixed progress —
`mode` is `"cover"` or `"arrive"`. The whole thing is under 800 ms, so this is
the only practical way to look at a frame. Not called by the site.

```js
window.__fx.still("cover", 0.45);    // mid-break
window.__fx.still("arrive", 0.45);   // clearing
window.__fx.hide();
```

## Accessibility and safety

- `prefers-reduced-motion: reduce` disables transitions entirely (including the
  handoff flag, so an arriving page never waits on an animation that will not
  play) and renders the background as one settled still frame.
- The frame loop pauses when the tab is hidden or the canvas scrolls off screen,
  and `dt` is clamped so returning to a parked tab does not fast-forward the
  simulation.
- Device pixel ratio is capped at 2; the life grid is capped at 420 cells/axis.
- Every WebGL entry point degrades to nothing: no WebGL2 context, or a shader
  that fails to compile, removes the canvas and logs a warning. The page is
  never taken down by an effect.
- If `backdrop-filter` is unsupported the shards still drift and fade; they just
  do not refract. Navigation never depends on the animation finishing.

## Licence

Techniques were learned by reading [react-bits](https://reactbits.dev) —
**MIT + Commons Clause**, © 2026 David Haz. The ordered-dither construction and
the antialiased cell masks follow that source closely enough to name it, and the
files say so.

The Commons Clause forbids selling or redistributing the components themselves
"whether alone, in a bundle, or as a ported version". Using an effect as site
chrome is explicitly permitted, which is what this is. Do not lift these files
back out as a standalone component library, and do not describe them as original
shader work — the techniques are reused, with attribution.

Full technique-by-technique scan, with line references and the bugs found in the
originals: `projects/2026job/effects/TECHNIQUES.md` in the op2 repo.

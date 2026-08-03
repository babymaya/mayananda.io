# mayananda.com

Source for [mayananda.com](https://mayananda.com/), a single-page WebGL piece built
with [three.js](https://threejs.org/) and bundled by [Vite](https://vite.dev/).

The page renders a set of concentric polygon rings nested on a gimbal. Scroll
position drives the gimbal's rotation, video is mapped onto the mesh at the centre,
and a set of small boxes mounted in each ring spin continuously. Everything else on
the page is a logo and a footer.

## Local development

```
npm install
npm run build      # writes dist/
```

**`npm run dev` does not start a dev server.** In `package.json` it is aliased to
`vite build`, exactly like `npm run build`. Running it will produce a build and exit;
it will not watch files and it will not open a browser.

To look at the result, serve `dist/` over HTTP:

```
cd dist
python -m http.server 8000
# then open http://localhost:8000/
```

Opening `dist/index.html` over `file://` will not work. The page uses root-relative
paths (`/main.js`, `/style.css`, `/rings.glb`, `/mayaReelA.mp4`), which only resolve
when the directory is served as a site root.

`npm run preview` (Vite's own static server) also works once a build exists.

## Deployment

Pushing to `main` triggers `.github/workflows/static.yml`, which installs
dependencies, runs `npm run build`, and publishes `./dist` to the `gh-pages` branch
via `peaceiris/actions-gh-pages`. GitHub Pages serves that branch on the custom
domain `mayananda.com`, with "Enforce HTTPS" enabled.

## The 3D pipeline

`public/rings.glb` is not modelled by hand for the web. It is generated from a
Houdini FBX export by `scripts/fbx_to_glb.py`, which lives in the separate `op2`
repository.

The FBX is a **single merged mesh with no materials**, so there is no conventional
way to tell one part from another. The parts were instead tagged in Houdini by
vertex colour, and the script splits the mesh into roughly 50 named glTF nodes by
reading those colours back. The legend:

| Colour  | Part                | Role                                   |
| ------- | ------------------- | -------------------------------------- |
| green   | `trigrams`          | the video surface                      |
| red     | `flicker`           | random opacity, resampled a few times a second |
| purple  | `boxes_*`           | spin on their own axis                 |
| yellow  | `innerRing`         | inner ring                             |
| orange  | `middleRing`        | middle ring                            |
| teal    | `outerRing`         | outer ring                             |
| magenta | `axis`              | the X and Y pivot axes                 |

The purple boxes are additionally split into one node per box (by connected
components, then sorted by angle so the numbering is stable), because each box has
to be able to rotate independently.

The vertex colours are a *part manifest*, not art direction. `main.js` ignores
`COLOR_0` at render time and assigns an authored material to each named part —
shipping the tag colours literally would put debug magenta and green on screen.

### Motion is JavaScript, not glTF animation

No animation clips are baked into the `.glb`. All motion is written in `main.js`:

- The rings are gimbal-nested **outer (X) > middle (Y) > inner (X)** and their
  angles are a function of scroll position, so the sweep can be scrubbed
  continuously rather than played back.
- The centre (the video surface) is deliberately *not* a child of the gimbal. It
  pitches on X only, so the footage never inherits the middle ring's yaw and turns
  away from the viewer.
- Each purple box rotates about the tangent of the ring it sits in, with a slight
  per-box rate offset so they do not move in lockstep.

## Constraints

- **No third-party requests.** The page loads nothing from another origin: no CDN,
  no web fonts, no analytics, no remote images. The favicon is an inline SVG
  `data:` URI and the environment map used for reflections is generated in-process
  rather than fetched. Keep it that way.
- **No horizontal scrolling on mobile.** Layout must stay within the viewport width
  at phone sizes; the canvas is sized to `window.innerWidth`/`innerHeight` and the
  model is framed to the *smaller* viewport dimension so a portrait screen shows the
  whole ring instead of cropping it.

## Publishing

One command, from `op2/projects/2026job`:

```powershell
..\..\scripts\publish-site.ps1
```

Syncs media from the staging tree, downscales and converts images to WebP,
regenerates the media manifest, builds, and starts a local preview. Then commit
and push `main` here to deploy.

## Custom domain

`public/CNAME` must ship with every build. The deploy action force-replaces the
`gh-pages` branch, so a build without that file deletes the CNAME, GitHub clears
the custom domain, and the site 404s **while the workflow still reports success**.
The workflow also passes `cname:` as a second line of defence. Verify a deploy with:

```bash
gh api repos/babymaya/mayananda.io/pages --jq '.cname + " | " + .status'
curl -s -o /dev/null -w "%{http_code}" https://mayananda.com/
```

## Images

Source images are masters and are never modified. `scripts/optimize-media.py`
downscales and re-encodes only the copies under `public/`, so re-syncing restores
originals and the next publish reduces them again. WebP is used because the
catalogue thumbnails carry alpha.

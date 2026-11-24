/* The home page desktop: a tray that rises at the bottom of the scroll, and one
 * draggable window per page. Separate from main.js so navigation still works if
 * WebGL or the model fails.
 *
 * Client work and 3d come from windows-content.js, which is generated from the
 * layout tool (op2/projects/2026job/site-windows/build_windows.py). A link with
 * data-doc opens its page (laser.html, shaders.html, ...) in a pop-up window
 * instead of going to it; without JavaScript it is an ordinary link.
 */

import { BODIES } from './windows-content.js';

const svg = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const PLACEHOLDER = '<p class="win-empty">Content to come.</p>';

/* EN/KR. The coding window holds both languages (data-l spans, CSS hides one).
 * A documentation page holds a second <main lang="ko">, written by
 * scripts/i18n-ko.py; a pop-up shows the <main> of the chosen language. The
 * choice is remembered in this browser only. */
let lang = 'en';
try { if (localStorage.getItem('site-lang') === 'ko') lang = 'ko'; } catch { /* storage blocked */ }
document.documentElement.dataset.lang = lang;
const both = (en, ko) => `<span data-l="en">${en}</span><span data-l="ko" lang="ko">${ko}</span>`;

const PAGES = [
    {
        id: 'clientwork', title: 'client work',
        icon: svg('<rect x="3" y="7.5" width="18" height="12.5" rx="1.5"/><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18"/>'),
        body: BODIES.clientwork || PLACEHOLDER,
    },
    {
        id: '3d', title: '3d',
        icon: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'),
        body: BODIES['3d'] || PLACEHOLDER,
    },
    {
        id: 'coding', title: 'coding',
        icon: svg('<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>'),
        lang: true,
        body: `<p class="code-intro">${both('ai driven coding projects', 'AI 기반 코딩 프로젝트')}</p>
            <div class="code-grid">
                <a class="code-cell" href="/houdini.html" data-doc>
                    <img data-src="https://res.cloudinary.com/dpzz06lzn/image/upload/f_auto,q_auto,w_640/v1794212457/pen_roundtrip_z23cdy.png" alt="">
                    <b>${both('Houdini', '후디니')}</b>
                </a>
                <a class="code-cell" href="/games.html" data-doc>
                    <img data-src="/media/games/rings/TAO_04_chains_lit.webp" alt="">
                    <b>${both('Games', '게임')}</b>
                </a>
                <a class="code-cell" href="/laser.html" data-doc>
                    <img data-src="https://res.cloudinary.com/dpzz06lzn/image/upload/f_auto,q_auto,w_640/v1794214422/follow_083203_05_n1_20261031_083225_p7_ivjbod.jpg" alt="">
                    <b>${both('Tracking to Laser', '트래킹 투 레이저')}</b>
                </a>
                <a class="code-cell" href="/shaders.html" data-doc>
                    <img data-src="https://res.cloudinary.com/dpzz06lzn/image/upload/f_auto,q_auto,w_640/v1794306579/Screenshot_2026-11-10_172548_y2kmbf.png" alt="">
                    <b>${both('Shader Studio', '셰이더 스튜디오')}</b>
                </a>
            </div>`,
    },
    {
        id: 'about', title: 'about',
        icon: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.500 2 7.500 6"/>'),
        body: `${BODIES.about || PLACEHOLDER}
            <p class="about-contact">email: <a href="mailto:mayalilananda@gmail.com">mayalilananda@gmail.com</a></p>
            <p>ig: <a href="https://instagram.com/sri_mayananda" target="_blank" rel="noopener">@sri_mayananda</a></p>`,
    },
];

const TRAY_H = 48;
const KEEP_VISIBLE = 96;       // pixels of a title bar that must stay on screen
const BOTTOM_SLACK = 12;       // phone address bars change the height slightly
const CASCADE = 28;

const tray = document.createElement('div');
tray.id = 'tray';
tray.setAttribute('role', 'toolbar');
tray.setAttribute('aria-label', 'Pages');
tray.inert = true;
document.body.appendChild(tray);

const wins = new Map();        // id -> { el, button, x, y, state, doc }
let topZ = 100;
let focusedId = null;
let docCount = 0;

const anyOpen = () => [...wins.values()].some((w) => w.state !== 'closed');

/* The Game of Life overlay is on while the tray is up. Its code loads the first
 * time it is needed, so it costs nothing on the first page load. */
let overlay = null;
let overlayLoading = false;
let overlayWanted = false;

function setOverlay(on) {
    overlayWanted = on;
    if (overlay) { overlay.setActive(on); return; }
    if (!on || overlayLoading) return;
    overlayLoading = true;
    import('./fx/overlay-life.js')
        .then((m) => {
            overlay = m.createOverlay();
            if (overlay) overlay.setActive(overlayWanted);
        })
        .catch((err) => console.warn('[overlay] unavailable:', err));
}

function updateTray() {
    const doc = document.documentElement;
    const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - BOTTOM_SLACK;
    const show = atBottom || anyOpen();
    tray.classList.toggle('show', show);
    tray.inert = !show;
    if (show !== overlayWanted) setOverlay(show);
}

function applyPosition(w) {
    w.el.style.transform = `translate3d(${w.x}px, ${w.y}px, 0)`;
}

function clampPosition(w) {
    const width = w.el.offsetWidth;
    const maxY = Math.max(0, window.innerHeight - TRAY_H - 36);
    w.x = Math.min(window.innerWidth - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - width, w.x));
    w.y = Math.min(maxY, Math.max(0, w.y));
    applyPosition(w);
}

function refreshButtons() {
    for (const [id, w] of wins) {
        const focused = id === focusedId && w.state === 'open';
        w.el.classList.toggle('focused', focused);
        if (!w.button) continue;
        w.button.classList.toggle('open', w.state !== 'closed');
        w.button.classList.toggle('active', focused);
        w.button.setAttribute('aria-pressed', w.state === 'open' ? 'true' : 'false');
    }
}

function focusWin(id) {
    const w = wins.get(id);
    focusedId = id;
    w.el.style.zIndex = String(++topZ);
    refreshButtons();
}

function focusNext() {
    let best = null;
    let bestZ = -1;
    for (const [id, w] of wins) {
        const z = Number(w.el.style.zIndex || 0);
        if (w.state === 'open' && z > bestZ) { best = id; bestZ = z; }
    }
    focusedId = best;
    refreshButtons();
}

/* Images and videos carry data-src until their window first opens, so a closed
 * window downloads nothing. */
function loadMedia(root) {
    root.querySelectorAll('[data-src]').forEach((m) => {
        m.src = m.dataset.src;
        m.removeAttribute('data-src');
        if (m.tagName === 'VIDEO') m.play().catch(() => {});
    });
}

function setVideosPlaying(w, on) {
    w.el.querySelectorAll('video').forEach((v) => {
        if (on && v.src) v.play().catch(() => {});
        else v.pause();
    });
}

function openWin(id, offsetIndex) {
    const w = wins.get(id);
    const first = w.state === 'closed' && !w.placed;
    w.state = 'open';
    w.el.hidden = false;
    loadMedia(w.el);
    setVideosPlaying(w, true);
    if (first) {
        const width = w.el.offsetWidth;
        const height = w.el.offsetHeight;
        const offset = offsetIndex * CASCADE;
        w.x = (window.innerWidth - width) / 2 + offset;
        w.y = Math.max(12, (window.innerHeight - TRAY_H - height) / 2 + offset);
        w.placed = true;
    }
    clampPosition(w);
    focusWin(id);
    updateTray();
}

function hideWin(id, state) {
    const w = wins.get(id);
    w.state = state;
    w.el.hidden = true;
    setVideosPlaying(w, false);
    if (focusedId === id) focusNext();
    refreshButtons();
    updateTray();
}

function makeDraggable(w, bar) {
    let drag = null;

    bar.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button') || e.button !== 0) return;
        drag = { px: e.clientX, py: e.clientY, x: w.x, y: w.y };
        bar.setPointerCapture(e.pointerId);
        w.el.classList.add('dragging');
    });
    bar.addEventListener('pointermove', (e) => {
        if (!drag) return;
        w.x = drag.x + e.clientX - drag.px;
        w.y = drag.y + e.clientY - drag.py;
        clampPosition(w);
    });
    const end = () => { drag = null; w.el.classList.remove('dragging'); };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
}

/* One window element. A tray window has a tray button and can be minimized; a
 * document pop-up has no button, so it only closes. */
function createWin(id, title, body, { button = null, doc = false, langBtn = false } = {}) {
    const el = document.createElement('section');
    el.className = doc ? 'win win-doc' : 'win';
    el.hidden = true;
    el.setAttribute('aria-label', title);
    el.innerHTML = `
        <header class="win-bar">
            <span class="win-title"></span>
            ${langBtn ? '<button type="button" class="win-btn win-lang" data-act="lang" aria-label="Language: English or Korean"><span data-show="en">EN</span>/<span data-show="ko">KR</span></button>' : ''}
            ${doc ? '' : '<button type="button" class="win-btn" data-act="min">_</button>'}
            <button type="button" class="win-btn" data-act="close">&times;</button>
        </header>
        <div class="win-body${doc ? ' page' : ''}">${body}</div>`;
    el.querySelector('.win-title').textContent = title;
    el.querySelector('[data-act="close"]').setAttribute('aria-label', `Close ${title}`);
    document.body.appendChild(el);

    const w = { el, button, x: 0, y: 0, state: 'closed', doc, placed: false };
    wins.set(id, w);

    makeDraggable(w, el.querySelector('.win-bar'));
    el.addEventListener('pointerdown', () => focusWin(id));
    const min = el.querySelector('[data-act="min"]');
    if (min) {
        min.setAttribute('aria-label', `Minimize ${title}`);
        min.addEventListener('click', () => hideWin(id, 'minimized'));
    }
    el.querySelector('[data-act="close"]').addEventListener('click', () => hideWin(id, 'closed'));
    el.querySelector('[data-act="lang"]')?.addEventListener('click', () => setLang(lang === 'en' ? 'ko' : 'en'));
    return w;
}

PAGES.forEach((page, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tray-item';
    button.innerHTML = `${page.icon}<span>${page.title}</span>`;
    tray.appendChild(button);

    const w = createWin(page.id, page.title, page.body, { button, langBtn: !!page.lang });
    const offsetIndex = index - (PAGES.length - 1) / 2;

    // The same rules as a desktop taskbar: open it, bring it forward, or hide it.
    button.addEventListener('click', () => {
        if (w.state !== 'open') openWin(page.id, offsetIndex);
        else if (focusedId === page.id) hideWin(page.id, 'minimized');
        else focusWin(page.id);
    });
});

/* ---- document pop-ups --------------------------------------------------
 * The page is fetched and its <main> is shown in a window. Links between the
 * documentation pages (for example the Houdini section links) open as pop-ups
 * too. Image links (.tiles) still open the full image in a new tab. */

function isDocLink(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return false;
    const url = new URL(a.href, location.href);
    return url.origin === location.origin && url.pathname.endsWith('.html');
}

function setLang(next) {
    lang = next;
    document.documentElement.dataset.lang = lang;
    try { localStorage.setItem('site-lang', lang); } catch { /* storage blocked */ }
    // Open pop-ups load their page again in the new language.
    for (const w of wins.values()) if (w.doc && w.path) loadDoc(w, w.path);
}

async function loadDoc(w, path) {
    w.path = path;
    const body = w.el.querySelector('.win-body');
    try {
        // no-cache: always check the server, so an edited page never shows from an old copy.
        const res = await fetch(path, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const page = new DOMParser().parseFromString(await res.text(), 'text/html');
        const main = (lang === 'ko' && page.querySelector('main[lang="ko"]'))
            || page.querySelector('main:not([lang="ko"])') || page.querySelector('main');
        if (!main) throw new Error('no <main>');
        body.lang = main.lang === 'ko' ? 'ko' : 'en';
        main.querySelectorAll('.back').forEach((n) => n.remove());
        // Lazy images in a scrolling window load as they come into view.
        main.querySelectorAll('img').forEach((img) => { img.loading = 'lazy'; });
        body.innerHTML = main.innerHTML;
        const h1 = main.querySelector('h1');
        if (h1) w.el.querySelector('.win-title').textContent = h1.textContent.trim();
        body.scrollTop = 0;
    } catch (err) {
        console.warn('[doc] could not load', path, err);
        body.innerHTML = `<p>This page did not load. <a href="${path}">Open it as a page</a>.</p>`;
    }
}

function openDoc(path, title) {
    const id = `doc:${path}`;
    if (!wins.has(id)) {
        const w = createWin(id, title || path, '<p class="win-empty">Loading&hellip;</p>', { doc: true, langBtn: true });
        loadDoc(w, path);
    }
    const w = wins.get(id);
    if (w.state !== 'open') openWin(id, (docCount++ % 4) - 1.5);
    else focusWin(id);
}

/* ---- media viewer ------------------------------------------------------
 * A click on an image or video in a window shows it over the whole page: no
 * window bar, one red close button at the top right. The caption (if the piece
 * has one) slides up when the mouse comes near the bottom of the screen; on a
 * touch screen a tap on the media shows or hides it. */

const CAPTION_ZONE = 140;      // px from the bottom edge that bring the caption up

const viewer = document.createElement('div');
viewer.id = 'viewer';
viewer.hidden = true;
viewer.setAttribute('role', 'dialog');
viewer.setAttribute('aria-modal', 'true');
viewer.setAttribute('aria-label', 'Media viewer');
viewer.innerHTML = `
    <div class="viewer-stage"></div>
    <button type="button" class="viewer-close" aria-label="Close">&times;</button>
    <div class="viewer-cap"></div>`;
document.body.appendChild(viewer);

const vStage = viewer.querySelector('.viewer-stage');
const vCap = viewer.querySelector('.viewer-cap');
const vClose = viewer.querySelector('.viewer-close');
let viewerReturn = null;

/* Larger copies than the window uses. */
const bigSrc = (src) => src
    .replace('/image/upload/f_auto,q_auto,w_1200/', '/image/upload/f_auto,q_auto,w_2000/')
    .replace('/image/upload/f_auto,q_auto,w_640/', '/image/upload/f_auto,q_auto,w_2000/')
    .replace('/video/upload/q_auto:low,w_640/', '/video/upload/q_auto,w_1280/');

function openViewer(media, caption) {
    const src = media.currentSrc || media.src || media.dataset.src;
    if (!src) return;
    vStage.textContent = '';
    let el;
    if (media.tagName === 'VIDEO') {
        el = document.createElement('video');
        Object.assign(el, { muted: true, loop: true, playsInline: true, autoplay: true });
        el.poster = '';
        el.crossOrigin = 'anonymous';   // the overlay reads its last frame (imprint)
        el.src = bigSrc(src);
        // Fall back to the copy the window already loaded if the large one fails.
        el.addEventListener('error', () => { if (el.src !== src) el.src = src; }, { once: true });
    } else {
        el = document.createElement('img');
        el.alt = media.alt || '';
        el.crossOrigin = 'anonymous';   // the overlay reads its pixels (imprint)
        el.src = bigSrc(src);
        el.addEventListener('error', () => { if (el.src !== src) el.src = src; }, { once: true });
    }
    vStage.appendChild(el);
    vCap.innerHTML = caption || '';
    viewer.classList.toggle('has-cap', !!caption);
    viewer.classList.remove('cap-up');
    viewerReturn = document.activeElement;
    viewer.hidden = false;
    document.documentElement.classList.add('viewer-open');
    vClose.focus({ preventScroll: true });
}

/* The box the picture fills inside its element (object-fit: contain), css px. */
function pictureRect(el) {
    const r = el.getBoundingClientRect();
    const nw = el.naturalWidth || el.videoWidth, nh = el.naturalHeight || el.videoHeight;
    if (!nw || !nh || !r.width || !r.height) return null;
    const s = Math.min(r.width / nw, r.height / nh);
    const w = nw * s, h = nh * s;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
}

function closeViewer() {
    if (viewer.hidden) return;
    // Imprint the picture (a video: the frame on screen now) on the life pattern,
    // where it was shown. Measured before the viewer hides.
    const media = vStage.firstElementChild;
    const ready = media && (media.tagName === 'VIDEO' ? media.readyState >= 2 : media.complete);
    if (overlay && ready) overlay.imprint(media, pictureRect(media));
    viewer.hidden = true;
    vStage.textContent = '';            // stops a video and frees it
    document.documentElement.classList.remove('viewer-open');
    if (viewerReturn && viewerReturn.focus) viewerReturn.focus({ preventScroll: true });
    viewerReturn = null;
}

vClose.addEventListener('click', closeViewer);
viewer.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !viewer.classList.contains('has-cap')) return;
    viewer.classList.toggle('cap-up', e.clientY > window.innerHeight - CAPTION_ZONE);
});
viewer.addEventListener('pointerleave', () => viewer.classList.remove('cap-up'));
viewer.addEventListener('click', (e) => {
    if (e.target.closest('.viewer-close') || e.target.closest('.viewer-cap')) return;
    if (viewer.classList.contains('has-cap') && matchMedia('(hover: none)').matches) {
        viewer.classList.toggle('cap-up');
    }
});
// Capture phase, so Escape closes the viewer and not the window under it.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !viewer.hidden) { e.stopImmediatePropagation(); closeViewer(); }
}, true);

/* Media in a window that opens the viewer: the client work and 3d pieces, the
 * image tiles of the documentation pop-ups, and figures in those pages. */
function viewerTarget(target) {
    const body = target.closest('.win-body');
    if (!body) return null;
    const media = target.closest('.cw-media img, .cw-media video, .tiles a, .win-body.page figure img');
    if (!media) return null;
    const el = media.tagName === 'A' ? media.querySelector('img') : media;
    if (!el) return null;
    const cap = media.closest('figure')?.querySelector('figcaption');
    return { el, caption: cap ? cap.innerHTML : '' };
}

document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const hit = viewerTarget(e.target);
    if (hit) { e.preventDefault(); openViewer(hit.el, hit.caption); }
});

document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a');
    if (!a || !a.closest('.win-body')) return;
    if (!(a.hasAttribute('data-doc') || isDocLink(a))) return;
    e.preventDefault();
    const url = new URL(a.href, location.href);
    const title = a.querySelector(`b [data-l="${lang}"]`)?.textContent
        || a.querySelector('b')?.textContent || a.textContent.trim();
    // A link inside a pop-up (for example the Houdini section links) changes the
    // page in that same window; a link anywhere else opens a pop-up.
    const docWin = a.closest('.win-doc');
    const w = docWin && [...wins.values()].find((x) => x.el === docWin);
    if (w) { loadDoc(w, url.pathname); focusWin([...wins].find(([, x]) => x === w)[0]); return; }
    openDoc(url.pathname, title);
});

window.addEventListener('scroll', updateTray, { passive: true });
window.addEventListener('resize', () => {
    for (const w of wins.values()) if (w.state === 'open') clampPosition(w);
    updateTray();
});
new ResizeObserver(updateTray).observe(document.body);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && focusedId) hideWin(focusedId, 'closed');
});
updateTray();

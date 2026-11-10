/* The home page desktop: a tray that rises at the bottom of the scroll, and one
 * draggable window per page. Separate from main.js so navigation still works if
 * WebGL or the model fails.
 *
 * SKETCH: the window contents are placeholders until the page text is written.
 */

const svg = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const PLACEHOLDER = '<p class="win-empty">Content to come.</p>';

const PAGES = [
    {
        id: 'clientwork', title: 'client work',
        icon: svg('<rect x="3" y="7.5" width="18" height="12.5" rx="1.5"/><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18"/>'),
        body: PLACEHOLDER,
    },
    {
        id: '3d', title: '3d',
        icon: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'),
        body: PLACEHOLDER,
    },
    {
        id: 'coding', title: 'coding',
        icon: svg('<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>'),
        body: PLACEHOLDER,
    },
    {
        id: 'personal', title: 'personal work',
        icon: svg('<path d="M4 20l1-4.5L16 4.5a2 2 0 0 1 3 0l.5.5a2 2 0 0 1 0 3L8.5 19z"/><path d="M14 6.5l3.5 3.5"/>'),
        body: PLACEHOLDER,
    },
    {
        id: 'about', title: 'about',
        icon: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.500 2 7.500 6"/>'),
        body: `${PLACEHOLDER}
            <p>email: <a href="mailto:mayalilananda@gmail.com">mayalilananda@gmail.com</a></p>
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

const wins = new Map();        // id -> { el, button, x, y, state }
let topZ = 100;
let focusedId = null;

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
        w.button.classList.toggle('open', w.state !== 'closed');
        w.button.classList.toggle('active', id === focusedId && w.state === 'open');
        w.button.setAttribute('aria-pressed', w.state === 'open' ? 'true' : 'false');
        w.el.classList.toggle('focused', id === focusedId && w.state === 'open');
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

function openWin(id, index) {
    const w = wins.get(id);
    const first = w.state === 'closed';
    w.state = 'open';
    w.el.hidden = false;
    if (first) {
        const width = w.el.offsetWidth;
        const height = w.el.offsetHeight;
        const offset = (index - (PAGES.length - 1) / 2) * CASCADE;
        w.x = (window.innerWidth - width) / 2 + offset;
        w.y = Math.max(12, (window.innerHeight - TRAY_H - height) / 2 + offset);
    }
    clampPosition(w);
    focusWin(id);
    updateTray();
}

function hideWin(id, state) {
    const w = wins.get(id);
    w.state = state;
    w.el.hidden = true;
    if (focusedId === id) focusNext();
    refreshButtons();
    updateTray();
}

function makeDraggable(w, id, bar) {
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

PAGES.forEach((page, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tray-item';
    button.innerHTML = `${page.icon}<span>${page.title}</span>`;
    tray.appendChild(button);

    const el = document.createElement('section');
    el.className = 'win';
    el.hidden = true;
    el.setAttribute('aria-label', page.title);
    el.innerHTML = `
        <header class="win-bar">
            <span class="win-title">${page.title}</span>
            <button type="button" class="win-btn" data-act="min" aria-label="Minimize ${page.title}">_</button>
            <button type="button" class="win-btn" data-act="close" aria-label="Close ${page.title}">&times;</button>
        </header>
        <div class="win-body">${page.body}</div>`;
    document.body.appendChild(el);

    const w = { el, button, x: 0, y: 0, state: 'closed' };
    wins.set(page.id, w);

    makeDraggable(w, page.id, el.querySelector('.win-bar'));
    el.addEventListener('pointerdown', () => focusWin(page.id));
    el.querySelector('[data-act="min"]').addEventListener('click', () => hideWin(page.id, 'minimized'));
    el.querySelector('[data-act="close"]').addEventListener('click', () => hideWin(page.id, 'closed'));

    // The same rules as a desktop taskbar: open it, bring it forward, or hide it.
    button.addEventListener('click', () => {
        if (w.state !== 'open') openWin(page.id, index);
        else if (focusedId === page.id) hideWin(page.id, 'minimized');
        else focusWin(page.id);
    });
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

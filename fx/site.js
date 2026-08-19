/* Effects entry point, loaded by every page.
 *
 * Transitions are wired everywhere. The animated background is loaded only for
 * a page that asks for it (data-bg on the body), and loaded dynamically so the
 * pages without one never download the simulation.
 */

import { initTransitions } from './transition.js';

initTransitions();

const bg = document.body.dataset.bg;
if (bg === 'life') {
    import('./bg-life.js')
        .then(({ initLifeBackground }) => {
            const canvas = document.createElement('canvas');
            canvas.className = 'fx-bg';
            canvas.setAttribute('aria-hidden', 'true');
            document.body.prepend(canvas);
            if (!initLifeBackground(canvas)) canvas.remove();
        })
        .catch(err => console.warn('[fx] background unavailable:', err));
}

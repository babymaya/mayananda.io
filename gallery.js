/* Shared gallery loader.
 *
 * Any element with class "shots" and a data-set attribute is filled from the
 * generated media manifest:
 *
 *   <div class="shots" data-set="games/rings"></div>
 *
 * Add files under public/media/<group>/<set>/, rebuild, done — no markup change.
 * A set with no files renders nothing at all rather than an empty frame, so an
 * unpopulated section simply does not appear. See media-example/README.md.
 */
(function () {
    var hosts = document.querySelectorAll('.shots[data-set]');
    if (!hosts.length) return;

    fetch('/media/manifest.json')
        .then(function (r) { return r.json(); })
        .then(function (manifest) {
            hosts.forEach(function (host) {
                var set = manifest[host.dataset.set];
                if (!set || !set.items || !set.items.length) {
                    // Nothing uploaded yet: remove the container and its hint so
                    // the page reads as finished rather than broken.
                    var hint = host.nextElementSibling;
                    if (hint && hint.classList.contains('shots-hint')) hint.remove();
                    host.remove();
                    return;
                }
                set.items.forEach(function (item) {
                    var fig = document.createElement('figure');
                    var el;
                    if (item.type === 'video') {
                        el = document.createElement('video');
                        el.src = item.src;
                        el.loop = true; el.muted = true;
                        el.playsInline = true; el.controls = true;
                        el.preload = 'metadata';
                    } else {
                        el = document.createElement('img');
                        el.src = item.src;
                        el.loading = 'lazy';
                        el.decoding = 'async';
                        el.alt = (set.title || '') + (item.caption ? ' — ' + item.caption : '');
                    }
                    fig.appendChild(el);
                    if (item.caption) {
                        var cap = document.createElement('figcaption');
                        cap.textContent = item.caption;
                        fig.appendChild(cap);
                    }
                    host.appendChild(fig);
                });
            });
        })
        .catch(function () {
            hosts.forEach(function (h) {
                h.innerHTML = '<p style="padding:1rem;color:#6f6f6f">' +
                    'Media manifest unavailable — run: npm run media</p>';
            });
        });
})();

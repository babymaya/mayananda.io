/* Scans public/media and writes public/media/manifest.json.
 *
 * A static host cannot list a directory, so the site cannot "look in a folder"
 * at runtime. This runs at build time instead (npm prebuild), which gives the
 * same result: drop files into a folder, build, and every page picks them up.
 * Nothing is hand-edited.
 *
 * CONVENTION
 *   public/media/<group>/<set>/NN_some_name.png
 *     <group>  page it belongs to        e.g. games, 3d, pipeline, home
 *     <set>    gallery within that page  e.g. rings, cardsbones
 *     NN       two digits, controls order
 *     name     becomes the caption: underscores -> spaces
 *
 *   Folders beginning with "_" are ignored (examples, scratch, templates).
 *
 * OVERRIDES
 *   Drop a captions.json next to the images to write real captions:
 *     { "01_game": "The board mid-cascade", "_title": "Rings" }
 *   Keys are the filename without extension. "_title" names the whole set.
 *
 * REMOTE ITEMS
 *   public/media/remote.json may declare items hosted elsewhere:
 *     { "home": [ { "src": "https://…/a.png", "type": "image" } ] }
 *   They are merged into the same manifest, so consumers do not care where a
 *   file physically lives.
 */
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

const ROOT = process.cwd();
const MEDIA = join(ROOT, 'public', 'media');
const OUT = join(MEDIA, 'manifest.json');

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg']);
const VIDEO = new Set(['.mp4', '.webm', '.mov']);

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const dirs = (p) => (isDir(p) ? readdirSync(p).filter((n) => !n.startsWith('_') && isDir(join(p, n))) : []);

function caption(file, overrides) {
    const stem = basename(file, extname(file));
    if (overrides && overrides[stem]) return overrides[stem];
    // 03_holdem_table -> "holdem table"
    return stem.replace(/^\d+[_-]?/, '').replace(/[_-]+/g, ' ').trim();
}

function readJson(p) {
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

const manifest = {};

if (!existsSync(MEDIA)) {
    console.warn('[media] no public/media directory; writing empty manifest');
} else {
    for (const group of dirs(MEDIA)) {
        for (const set of dirs(join(MEDIA, group))) {
            const dir = join(MEDIA, group, set);
            const overrides = readJson(join(dir, 'captions.json')) || {};
            const items = readdirSync(dir)
                .filter((n) => {
                    const e = extname(n).toLowerCase();
                    return IMAGE.has(e) || VIDEO.has(e);
                })
                .sort()                       // NN_ prefix gives the order
                .map((n) => ({
                    src: `/media/${group}/${set}/${n}`,
                    type: VIDEO.has(extname(n).toLowerCase()) ? 'video' : 'image',
                    caption: caption(n, overrides),
                }));
            if (!items.length) continue;
            manifest[`${group}/${set}`] = {
                title: overrides._title || set,
                items,
            };
        }
    }
}

// Merge declared remote items under the same keys.
const remote = readJson(join(MEDIA, 'remote.json'));
if (remote) {
    for (const [key, list] of Object.entries(remote)) {
        if (!Array.isArray(list)) continue;
        const entry = manifest[key] || (manifest[key] = { title: key.split('/').pop(), items: [] });
        for (const it of list) {
            if (!it || !it.src) continue;
            entry.items.push({
                src: it.src,
                type: it.type || 'image',
                caption: it.caption || '',
                remote: true,
            });
        }
    }
}

writeFileSync(OUT, JSON.stringify(manifest, null, 1) + '\n', 'utf8');

const sets = Object.keys(manifest);
const total = sets.reduce((n, k) => n + manifest[k].items.length, 0);
console.log(`[media] ${sets.length} set(s), ${total} item(s) -> public/media/manifest.json`);
for (const k of sets) console.log(`[media]   ${k.padEnd(22)} ${manifest[k].items.length}`);

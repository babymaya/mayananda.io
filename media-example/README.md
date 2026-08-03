# Adding images

Drop files in, run a build. Nothing here is hand-maintained.

This folder is a copyable example and is deliberately **outside** `public/`, so it
is never published. Copy `my_project/` into `public/media/<group>/` to start.

```
public/media/<group>/<set>/NN_name.png
```

| Part | Means | Examples |
|---|---|---|
| `<group>` | which page | `games`, `3d`, `pipeline`, `home` |
| `<set>` | one gallery on that page | `rings`, `cardsbones` |
| `NN` | two digits, sets the order | `01`, `02`, … |
| `name` | becomes the caption | `holdem_table` -> "holdem table" |

Images: png, jpg, jpeg, webp, avif, gif, svg. Video: mp4, webm, mov.

## Then

```
npm run build        # regenerates the manifest first, automatically
npm run media        # or just regenerate the manifest
```

The build writes `public/media/manifest.json`. Every gallery on the site reads
that one file, so a new folder appears on its page with no code change.

## Real captions

The filename is only a fallback. Add `captions.json` beside the images:

```json
{
  "_title": "My Project",
  "01_first_shot": "The board mid-cascade"
}
```

Keys are filenames without the extension. `_title` names the whole set. You only
need entries for the ones you want to write properly.

## Files hosted elsewhere

`public/media/remote.json` declares items that live on a CDN rather than in this
repo. They land in the same manifest under the same keys, so nothing consuming it
needs to care where a file physically sits.

```json
{ "home/array": [ { "src": "https://…/image.png", "type": "image" } ] }
```

## Notes

- Folders starting with `_` are ignored — including this one. It exists to be
  copied, not published.
- Order comes from the `NN` prefix, so renumber to reorder. Leave gaps (10, 20,
  30) if you expect to insert things later.
- Keep source files out of `public/` if they are huge; everything in `public/`
  ships as-is.

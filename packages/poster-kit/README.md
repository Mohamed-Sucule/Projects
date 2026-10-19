# poster-kit

What [Your Place](../../your-place/) and [Your Sky](../../your-sky/) share. They began as one
app copied into two, and the copies had started to drift, so the parts that are the same in
both now live here once:

| Module                               | What it is                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| [`history`](src/history.ts)          | Undo and redo around any reducer. A whole drag is one step, and typing in one field merges into one.                      |
| [`sizes`](src/sizes.ts)              | Poster sizes and the pixel budget: 300 dpi where the browser's canvas allows it, and the real dpi where it doesn't.       |
| [`fonts`](src/fonts.ts)              | The three typefaces, waiting for them before a canvas draws, and embedding them in an SVG.                                |
| [`files`](src/files.ts)              | Data URLs and downloads.                                                                                                  |
| [`photon`](src/photon.ts)            | Place search and reverse geocoding with [Photon](https://photon.komoot.io), in the reader's language where Photon has it. |
| [`PlaceSearch`](src/PlaceSearch.tsx) | The place search box, a WAI-ARIA combobox. Each app gives its own placeholder and says where "use my location" puts you.  |
| [`Icon`](src/Icon.tsx)               | The interface's icons.                                                                                                    |

It is a workspace package, published nowhere. The apps import its TypeScript source directly
(`import { PlaceSearch } from 'poster-kit/PlaceSearch'`) and Vite compiles it with the rest of
each app, so there is no build step and no stale copy.

```sh
npm run check -w poster-kit   # formatting, lint, types, unit tests
```

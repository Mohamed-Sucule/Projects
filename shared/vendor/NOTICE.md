# Vendored libraries

Served from this repository rather than a CDN, so the pages that use them work
with nothing fetched from anyone else's server — the text recogniser below
reads a scanned form entirely offline.

Transformers.js and the ONNX WebAssembly engine are not in this folder. They
load from jsDelivr at pinned versions (see `shared/ai.js`), along with the model
weights from the Hugging Face hub, the first time a page asks for a model.

| Path | Package | Version | Licence |
|---|---|---|---|
| `tesseract/tesseract.esm.min.js`, `tesseract/worker.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) | 7.0.0 | Apache-2.0 (`tesseract/LICENSE`) |
| `tesseract/tesseract-core-*.wasm.js` (plain, SIMD and relaxed-SIMD builds; the worker picks one) | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | 7.0.0 | Apache-2.0 (`tesseract/core.LICENSE`) |
| `tesseract/eng.traineddata.gz` | [@tesseract.js-data/eng](https://www.npmjs.com/package/@tesseract.js-data/eng) (`4.0.0_best_int`) | 1.0.0 | Apache-2.0 upstream (Google tessdata_best), packaged under MIT |

All files are the packages' published builds, unmodified.

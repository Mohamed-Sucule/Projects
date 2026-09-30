/* ───────────────────────────────────────────────────────────────────────────
   shared/ai.js — machine learning that runs on the visitor's own device.

   Every flagship on this site does its AI in the browser: no API key, no
   server, nothing the visitor types or says leaves their machine. That is a
   real product decision, not a demo shortcut — it is what a client with
   patient records, claims or sales calls actually asks for, and it is why the
   models here are small, specific ones (a speech recogniser, an embedding
   model, a reading-comprehension model) rather than one large chatbot.

   This module is the one place that knows how to load them:

     • the runtime (Transformers.js and the ONNX WebAssembly engine) comes from
       jsDelivr at exact pinned versions, the first time a model is asked for
       and never before — a page that does not need a model never fetches one;
     • weights come from the Hugging Face hub the first time and are cached by
       the browser after that, so a second visit starts instantly;
     • WebGPU is used when the browser has it, and plain WebAssembly when not;
     • and every load can FAIL — a phone on a train, a locked-down office
       network — so every caller is handed `null` and a reason instead of an
       exception, and every app here has a path that works without the model.

   The apps never import Transformers.js themselves. When a model changes,
   it changes here.
   ─────────────────────────────────────────────────────────────────────────── */

/* Pinned, so a new release upstream can never change what these pages run.
   The ONNX build is the one this Transformers.js release was built against. */
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
const ORT_WASM = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';

/* The models, and what each is for. Sizes are the quantised downloads, so
   the pages can say honestly how much they are about to fetch. */
export const MODELS = {
  embed:     { task: 'feature-extraction',             id: 'Xenova/all-MiniLM-L6-v2',                        dtype: 'q8', mb: 23,  what: 'understands what sentences mean' },
  qa:        { task: 'question-answering',             id: 'Xenova/distilbert-base-cased-distilled-squad',   dtype: 'q8', mb: 65,  what: 'finds the exact answer in a passage' },
  asr:       { task: 'automatic-speech-recognition',   id: 'Xenova/whisper-tiny.en',                         dtype: 'q8', mb: 41,  what: 'turns speech into text' },
  zeroshot:  { task: 'zero-shot-classification',       id: 'Xenova/mobilebert-uncased-mnli',                 dtype: 'q8', mb: 25,  what: 'sorts sentences into categories it was never trained on' },
  sentiment: { task: 'text-classification',            id: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', dtype: 'q8', mb: 67, what: 'reads the tone of a sentence' },
  vision:    { task: 'zero-shot-image-classification', id: 'Xenova/clip-vit-base-patch32',                  dtype: 'q8', mb: 88,  what: 'says what a photo shows' },
};

let runtime = null;

/** Transformers.js, configured and ready. Loaded once, on first use. */
export function transformers() {
  runtime ??= import(TRANSFORMERS).then((T) => {
    T.env.allowLocalModels = false;
    T.env.useBrowserCache = true;
    const onnx = T.env.backends.onnx;
    /* A folder rather than two file names, so the engine picks the build the
       browser can run: the asyncify one where it can, the plain one on older
       Safari. */
    onnx.wasm.wasmPaths = ORT_WASM;
    /* Threads need cross-origin isolation, which GitHub Pages cannot switch
       on. One thread is slower and it always works; asking for four on a page
       that cannot have them fails in a way nobody sees. */
    if (!self.crossOriginIsolated) onnx.wasm.numThreads = 1;
    return T;
  });
  return runtime;
}

const loaded = new Map();         // name → Promise<pipeline | null>
const status = new Map();         // name → { state, progress, reason }
const listeners = new Set();

export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function statusOf(name) { return status.get(name) ?? { state: 'idle', progress: 0 }; }
function set(name, s) {
  status.set(name, { ...statusOf(name), ...s });
  for (const fn of listeners) fn(name, statusOf(name));
}

export const hasWebGPU = () => typeof navigator !== 'undefined' && !!navigator.gpu;

/**
 * A ready-to-use pipeline, or null if it could not be had. Never throws.
 * Loading the same model twice returns the same promise.
 */
export function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const m = MODELS[name];
  const p = (async () => {
    set(name, { state: 'loading', progress: 0, reason: '' });
    try {
      const T = await transformers();
      const files = new Map();
      const progress_callback = (e) => {
        if (e.status === 'progress' && e.total) {
          files.set(e.file, [e.loaded, e.total]);
          let done = 0, all = 0;
          for (const [a, b] of files.values()) { done += a; all += b; }
          set(name, { progress: all ? done / all : 0 });
        }
      };
      const attempt = (device) => T.pipeline(m.task, m.id, { dtype: m.dtype, device, progress_callback });
      let pipe;
      if (hasWebGPU()) {
        try { pipe = await attempt('webgpu'); } catch { pipe = null; }
      }
      pipe ??= await attempt('wasm');
      set(name, { state: 'ready', progress: 1 });
      return pipe;
    } catch (e) {
      set(name, { state: 'unavailable', reason: explainFailure(e) });
      return null;
    }
  })();
  loaded.set(name, p);
  return p;
}

function explainFailure(e) {
  const msg = String(e?.message ?? e);
  if (/fetch|network|Failed to load|NetworkError|404|403/i.test(msg)) {
    return 'the model could not be downloaded on this connection';
  }
  if (/memory|OOM|allocation/i.test(msg)) return 'this device ran out of memory loading it';
  return 'this browser could not run it';
}

/* ── small helpers every app wants ──────────────────────────────────────── */

/** Sentence embeddings, L2-normalised, as plain arrays. */
export async function embed(texts) {
  const pipe = await load('embed');
  if (!pipe) return null;
  const out = await pipe(texts, { pooling: 'mean', normalize: true });
  return out.tolist();
}

export const cosine = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/**
 * A little status line for a page: what each model is for, how big it is,
 * and where it has got to. Updates itself.
 */
export function statusLine(host, names) {
  const render = () => {
    host.replaceChildren(...names.map((n) => {
      const m = MODELS[n], s = statusOf(n);
      const span = document.createElement('span');
      span.className = `ai-chip ai-${s.state}`;
      const label = s.state === 'ready' ? 'ready'
        : s.state === 'loading' ? `downloading ${Math.round((s.progress || 0) * 100)}% of ${m.mb} MB`
        : s.state === 'unavailable' ? `off — ${s.reason}`
        : `${m.mb} MB, not loaded`;
      span.title = `${m.id} — ${m.what}`;
      span.textContent = `${m.what}: ${label}`;
      return span;
    }));
  };
  render();
  onStatus((n) => { if (names.includes(n)) render(); });
}

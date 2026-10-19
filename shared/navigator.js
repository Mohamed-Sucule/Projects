/* shared/navigator.js — one way to get anywhere, from anywhere.

   Thirty-one pages, each of which used to offer exactly one route out: a
   "← PLAYGROUND" link back to the front, where you scrolled until you found the
   next thing. That is a chore, and a chore repeated thirty-one times is the
   whole experience of a site.

   This installs a single control on every page: press ⌘K (or / , or tap the
   pill) and ask for what you want in whatever words you have. "the ai stuff".
   "something fun". "i have two minutes". "surprise me". The ranking behind it
   is BM25 with an intent layer — see search.js, which is tested separately.

   SHADOW DOM, and not for fashion. This markup lands inside thirty-one
   different stylesheets written months apart, several of which style bare
   `button`, `input` and `kbd` elements. A shadow root is the only way to be
   certain none of them reaches in, and equally that nothing here leaks out and
   quietly restyles somebody's page.

   Everything is lazy: nothing is built until the first open, so a page that is
   never navigated from pays for one event listener and an eighty-byte pill. */

import { ATLAS, KINDS, HOME, currentEntry, resolveHref } from './atlas.js';
import { buildIndex, search, explain } from './search.js';

const link = (href) => resolveHref(href, import.meta.url);
const here = currentEntry();
const position = here ? ATLAS.findIndex((e) => e.id === here.id) : -1;

/* Neighbours come out of the atlas order, so "next" is the next thing I would
   have put in front of you rather than whatever is alphabetically adjacent. */
const previous = position > 0 ? ATLAS[position - 1] : null;
const next = position !== -1 && position < ATLAS.length - 1 ? ATLAS[position + 1] : null;

const SUGGESTIONS = [
  'the AI work',
  'something fun',
  'I have 2 minutes',
  'what should I look at first',
  'surprise me',
];

let index = null;
let ui = null;
let open = false;

/* ── the pill ───────────────────────────────────────────────────────────── */

const host = document.createElement('div');
host.setAttribute('data-navigator', '');
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `<style>${CSS()}</style>
  <button class="pill" part="pill" aria-haspopup="dialog" aria-expanded="false">
    <span class="dot"></span>
    <span class="label">${here ? escape(here.title) : 'Find anything'}</span>
    <kbd>⌘K</kbd>
  </button>
  <div class="scrim" hidden></div>`;
document.documentElement.appendChild(host);

const pill = shadow.querySelector('.pill');
const scrim = shadow.querySelector('.scrim');
pill.addEventListener('click', () => toggle(true));
scrim.addEventListener('click', (e) => { if (e.target === scrim) toggle(false); });

/* ── keyboard ───────────────────────────────────────────────────────────── */

addEventListener('keydown', (e) => {
  /* Never steal a keystroke from something the visitor is typing into. Several
     pages here are built around a text box — the tokeniser, Sift's filter
     language, Loom — and a global "/" shortcut that hijacked those would be a
     worse bug than having no shortcut at all. */
  const typing = e.target instanceof HTMLElement &&
    (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));

  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    toggle(!open);
    return;
  }
  if (open && e.key === 'Escape') { e.preventDefault(); toggle(false); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

  if (!open && e.key === '/') { e.preventDefault(); toggle(true); return; }
  /* Brackets step through the pieces in atlas order without opening anything.
     Cheap to add, and it turns a thirty-one page site into something you can
     riffle through like a deck of cards. */
  if (!open && e.key === '[' && previous) { location.href = link(previous.href); }
  if (!open && e.key === ']' && next) { location.href = link(next.href); }
});

/* ── opening ────────────────────────────────────────────────────────────── */

function toggle(wanted) {
  if (wanted === open) return;
  open = wanted;
  pill.setAttribute('aria-expanded', String(open));
  if (!open) {
    scrim.hidden = true;
    document.documentElement.style.removeProperty('overflow');
    ui?.lastFocus?.focus?.();
    return;
  }
  if (!ui) build();
  scrim.hidden = false;
  /* The page behind must not scroll while a full-screen panel is over it —
     on a phone that produces the specific awfulness of scrolling the wrong
     thing and losing your place in both. */
  document.documentElement.style.overflow = 'hidden';
  ui.lastFocus = document.activeElement;
  ui.input.value = '';
  render('');
  requestAnimationFrame(() => ui.input.focus());
}

function build() {
  index = buildIndex(ATLAS, KINDS);
  scrim.innerHTML = `
    <div class="panel" role="dialog" aria-modal="true" aria-label="Find anything on this site">
      <div class="search">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="M13.5 13.5 18 18"/></svg>
        <input type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="Ask for anything — &ldquo;something fun&rdquo;, &ldquo;the AI work&rdquo;, &ldquo;2 minutes&rdquo;" />
        <button class="close" aria-label="Close">esc</button>
      </div>
      ${here ? neighbourBar() : ''}
      <div class="chips">${SUGGESTIONS.map((s) =>
        `<button class="chip" data-q="${escape(s)}">${escape(s)}</button>`).join('')}</div>
      <div class="results" role="listbox"></div>
      <div class="foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
        <span class="spacer"></span>
        <span>${ATLAS.length} things, all live in your browser</span>
      </div>
    </div>`;

  ui = {
    input: scrim.querySelector('input'),
    results: scrim.querySelector('.results'),
    hits: [],
    active: 0,
    lastFocus: null,
  };

  ui.input.addEventListener('input', () => render(ui.input.value));
  ui.input.addEventListener('keydown', onKeys);
  scrim.querySelector('.close').addEventListener('click', () => toggle(false));
  for (const chip of scrim.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      ui.input.value = chip.dataset.q;
      render(chip.dataset.q);
      ui.input.focus();
    });
  }
  ui.results.addEventListener('click', (e) => {
    const row = e.target.closest?.('[data-href]');
    if (row) location.href = row.dataset.href;
  });
  ui.results.addEventListener('pointermove', (e) => {
    const row = e.target.closest?.('[data-i]');
    if (row && Number(row.dataset.i) !== ui.active) {
      ui.active = Number(row.dataset.i);
      paintActive();
    }
  });
}

function neighbourBar() {
  const side = (entry, dir) => entry
    ? `<a class="neighbour" href="${link(entry.href)}">
         <kbd>${dir === 'prev' ? '[' : ']'}</kbd>
         <span>${dir === 'prev' ? '←' : ''} ${escape(entry.title)} ${dir === 'next' ? '→' : ''}</span>
       </a>`
    : '<span class="neighbour empty"></span>';
  return `<div class="where">
    ${side(previous, 'prev')}
    <span class="youare">You are in <b>${escape(here.title)}</b> · ${position + 1} of ${ATLAS.length}</span>
    ${side(next, 'next')}
  </div>`;
}

/* ── rendering ──────────────────────────────────────────────────────────── */

function render(query) {
  ui.hits = search(query, index, { limit: 7 });
  ui.active = 0;

  const rows = ui.hits.map((hit, i) => {
    const kind = KINDS[hit.entry.kind];
    return `<a class="row" data-i="${i}" data-href="${link(hit.entry.href)}" role="option">
      <span class="bar" style="--a:${kind.accent}"></span>
      <span class="text">
        <span class="top">
          <b>${escape(hit.entry.title)}</b>
          <span class="kind" style="--a:${kind.accent}">${escape(kind.label)}</span>
        </span>
        <span class="blurb">${escape(hit.entry.hook)}</span>
        <span class="why">${escape(explain(hit, query))} · ${hit.entry.minutes} min</span>
      </span>
      <span class="go">↵</span>
    </a>`;
  }).join('');

  ui.results.innerHTML = rows +
    `<a class="row all" data-i="${ui.hits.length}" data-href="${link(HOME.href)}" role="option">
       <span class="bar" style="--a:154,165,184"></span>
       <span class="text"><span class="top"><b>See everything</b></span>
       <span class="blurb">${ATLAS.length} pieces on one page, each with a live preview.</span></span>
       <span class="go">↵</span>
     </a>`;
  paintActive();
}

function paintActive() {
  const rows = [...ui.results.querySelectorAll('.row')];
  rows.forEach((row, i) => row.classList.toggle('on', i === ui.active));
  rows[ui.active]?.scrollIntoView({ block: 'nearest' });
}

function onKeys(e) {
  const total = ui.hits.length + 1;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    ui.active = (ui.active + 1) % total;
    paintActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    ui.active = (ui.active - 1 + total) % total;
    paintActive();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const row = ui.results.querySelectorAll('.row')[ui.active];
    if (row) location.href = row.dataset.href;
  } else if (e.key === 'Tab') {
    /* Three focusable things in here and a modal over the page: keeping Tab
       inside it is the difference between a dialog and a trap door onto the
       document behind. */
    const focusable = [...scrim.querySelectorAll('input, button, a')];
    const at = focusable.indexOf(shadow.activeElement);
    const to = e.shiftKey ? at - 1 : at + 1;
    e.preventDefault();
    focusable[(to + focusable.length) % focusable.length]?.focus();
  }
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── styles ─────────────────────────────────────────────────────────────── */

function CSS() {
  return `
  :host { all: initial; }
  @media print { :host { display: none !important; } }
  * { box-sizing: border-box; font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  kbd { font: 600 10px/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .04em;
        border: 1px solid rgba(255,255,255,.2); border-radius: 4px; padding: 3px 5px;
        color: rgba(233,238,251,.6); background: rgba(255,255,255,.05); }

  .pill {
    position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
    display: inline-flex; align-items: center; gap: 9px; cursor: pointer;
    padding: 9px 12px 9px 13px; border-radius: 99px;
    border: 1px solid rgba(255,255,255,.16); background: rgba(12,16,26,.82);
    backdrop-filter: blur(14px) saturate(1.3);
    color: #e9eefb; font-size: 13px; font-weight: 600; letter-spacing: -.005em;
    box-shadow: 0 10px 34px -14px rgba(0,0,0,.9);
    opacity: .72; transition: opacity .2s, transform .2s, border-color .2s;
  }
  .pill:hover, .pill:focus-visible { opacity: 1; transform: translateY(-2px);
    border-color: rgba(125,211,252,.5); outline: none; }
  .pill .dot { width: 7px; height: 7px; border-radius: 50%; flex: none;
    background: #7dd3fc; box-shadow: 0 0 10px 1px rgba(125,211,252,.7); }
  .pill .label { max-width: 42vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .scrim[hidden] { display: none; }
  .scrim {
    position: fixed; inset: 0; z-index: 2147483001;
    background: rgba(4,6,12,.72); backdrop-filter: blur(7px);
    display: flex; align-items: flex-start; justify-content: center;
    padding: clamp(14px, 9vh, 110px) 16px 16px;
    animation: fade .16s ease-out;
  }
  @keyframes fade { from { opacity: 0 } to { opacity: 1 } }

  .panel {
    width: min(660px, 100%); max-height: min(78vh, 680px);
    display: flex; flex-direction: column; overflow: hidden;
    background: #0c1018; border: 1px solid rgba(255,255,255,.14); border-radius: 16px;
    box-shadow: 0 40px 100px -30px rgba(0,0,0,1);
    animation: rise .2s cubic-bezier(.2,.8,.3,1);
  }
  @keyframes rise { from { opacity: 0; transform: translateY(-10px) scale(.985) } to { opacity: 1; transform: none } }

  .search { display: flex; align-items: center; gap: 11px; padding: 14px 14px 13px;
    border-bottom: 1px solid rgba(255,255,255,.09); flex: none; }
  .search svg { width: 17px; height: 17px; flex: none; fill: none;
    stroke: rgba(233,238,251,.42); stroke-width: 1.8; stroke-linecap: round; }
  .search input {
    flex: 1; min-width: 0; border: 0; background: transparent; outline: none;
    color: #e9eefb; font-size: 16px; font-weight: 500; letter-spacing: -.01em; padding: 2px 0;
  }
  .search input::placeholder { color: rgba(233,238,251,.3); }
  .close { border: 1px solid rgba(255,255,255,.16); background: transparent; cursor: pointer;
    color: rgba(233,238,251,.5); border-radius: 6px; padding: 5px 8px;
    font: 600 10px/1 ui-monospace, Menlo, monospace; letter-spacing: .08em; }
  .close:hover { color: #e9eefb; border-color: rgba(255,255,255,.3); }

  .where { display: flex; align-items: center; gap: 10px; flex: none;
    padding: 9px 14px; border-bottom: 1px solid rgba(255,255,255,.07);
    background: rgba(125,211,252,.045); }
  .youare { flex: 1; text-align: center; font-size: 11.5px; color: rgba(233,238,251,.45); }
  .youare b { color: rgba(233,238,251,.85); font-weight: 650; }
  .neighbour { display: inline-flex; align-items: center; gap: 6px; text-decoration: none;
    color: rgba(233,238,251,.6); font-size: 11.5px; font-weight: 600; white-space: nowrap;
    max-width: 30%; overflow: hidden; }
  .neighbour:hover { color: #cfe9ff; }
  .neighbour.empty { min-width: 40px; }
  .neighbour span { overflow: hidden; text-overflow: ellipsis; }

  .chips { display: flex; gap: 7px; flex-wrap: wrap; padding: 12px 14px 4px; flex: none; }
  .chip { cursor: pointer; border-radius: 99px; padding: 6px 11px;
    border: 1px solid rgba(255,255,255,.13); background: rgba(255,255,255,.04);
    color: rgba(233,238,251,.68); font-size: 12px; font-weight: 600; }
  .chip:hover { background: rgba(125,211,252,.14); border-color: rgba(125,211,252,.4); color: #cfe9ff; }

  .results { overflow-y: auto; padding: 8px; display: grid; gap: 2px; }
  .row { display: flex; align-items: stretch; gap: 11px; text-decoration: none;
    padding: 10px 10px 10px 0; border-radius: 10px; color: inherit; cursor: pointer; }
  .row .bar { width: 3px; border-radius: 3px; flex: none; background: rgb(var(--a)); opacity: .55; }
  .row .text { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .row .top { display: flex; align-items: baseline; gap: 9px; }
  .row b { font-size: 14.5px; font-weight: 650; letter-spacing: -.012em; color: #e9eefb; }
  .row .kind { font: 600 9.5px/1 ui-monospace, Menlo, monospace; letter-spacing: .12em;
    text-transform: uppercase; color: rgb(var(--a)); opacity: .85; }
  .row .blurb { font-size: 12.5px; line-height: 1.45; color: rgba(233,238,251,.55);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .why { font: 600 10.5px/1 ui-monospace, Menlo, monospace; color: rgba(233,238,251,.3); }
  .row .go { align-self: center; font-size: 13px; color: transparent; flex: none; padding-right: 4px; }
  .row.on { background: rgba(125,211,252,.11); }
  .row.on .bar { opacity: 1; }
  .row.on .go { color: rgba(125,211,252,.9); }
  .row.all b { color: rgba(233,238,251,.8); }

  .foot { display: flex; align-items: center; gap: 14px; flex: none;
    padding: 10px 14px; border-top: 1px solid rgba(255,255,255,.08);
    font-size: 11px; color: rgba(233,238,251,.34); }
  .foot span { display: inline-flex; align-items: center; gap: 5px; }
  .foot .spacer { flex: 1; }

  @media (max-width: 620px) {
    .pill { right: 12px; bottom: 12px; padding: 8px 11px; font-size: 12.5px; }
    .pill kbd { display: none; }
    .scrim { padding: 10px 10px 10px; }
    .panel { max-height: 88vh; }
    .foot span:not(.spacer):not(:last-child) { display: none; }
    .where { flex-wrap: wrap; }
    .youare { order: -1; flex-basis: 100%; }
    .neighbour { max-width: 46%; }
  }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `;
}

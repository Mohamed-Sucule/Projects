/* atlas/main.js — the Portal Atlas, once script arrives.

   The page works without any of this: the gallery is plain HTML (build.mjs),
   every tile is a link to the project's own page, and the pictures are files.
   On top of that, this adds:

     the sheet     a project opened in place, at #world/<id>: the problem, the
                   evidence, how it was built, and the next world after it
     the theatre   "Run it here" opens the real app full screen, at
                   #world/<id>/live, so Back and Esc both step out of it
     the rest      tiles arriving as they scroll into view, the corner turning
                   solid past the portal, and Search opening the site's finder */

import { KINDS } from '../shared/atlas.js';
import { ISLANDS, REGIONS, TALLY_URL, islandById } from './worlds.js';

const $ = (s, el = document) => el.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const kindLabel = (i) => (i.id === 'tally' ? 'AI product · Python service' : `${KINDS[i.kind]?.label ?? i.kind} · about ${i.minutes} min`);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const launchHref = (i) => (i.id === 'tally' ? TALLY_URL : `../${i.href}`);
const sourceHref = (i) => i.source ?? (i.study ? i.study.replace('/blob/main/', '/tree/main/').replace(/\/README\.md$/, '') : null);
const artSet = (id) => `art/${id}-900.webp 900w, art/${id}-1800.webp 1800w`;
function el(tag, attrs = {}, text = '') {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (text) n.textContent = text;
  return n;
}

/* ── the corner ──────────────────────────────────────────────────────── */

const nav = $('.nav');
const hero = $('.hero');
new IntersectionObserver(([e]) => nav.classList.toggle('solid', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' }).observe(hero);
const navLinks = [...nav.querySelectorAll('nav a')];
const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href')));
new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    navLinks.forEach((a, n) => a.setAttribute('aria-current', String(sections[n] === e.target)));
  }
}, { rootMargin: '-45% 0px -50% 0px' }).observe(...sections.slice(0, 1));
sections.slice(1).forEach((s) => s && new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) navLinks.forEach((a, n) => a.setAttribute('aria-current', String(sections[n] === e.target)));
}, { rootMargin: '-45% 0px -50% 0px' }).observe(s));

/* Search is the site's own finder (shared/navigator.js); here it has a place in
   the corner instead of a floating button. */
$('.search').addEventListener('click', () => {
  document.querySelector('[data-navigator]')?.shadowRoot?.querySelector('.pill')?.click();
});

/* the portal drifts a little slower than the page */
const heroImg = $('.hero-art img');
if (!reduced) {
  let queued = false;
  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const y = scrollY;
      if (y < innerHeight * 1.2) heroImg.style.translate = `0 ${(y * 0.22).toFixed(1)}px`;
    });
  }, { passive: true });
}

/* ── the gallery ─────────────────────────────────────────────────────── */

const tiles = [...document.querySelectorAll('.tile')];
if (reduced || !('IntersectionObserver' in window)) tiles.forEach((t) => t.classList.add('in'));
else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  tiles.forEach((t) => io.observe(t));
}
document.querySelector('.regions').addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  open(a.dataset.open, { push: true });
});

/* ── a project, opened ───────────────────────────────────────────────── */

const sheet = $('#sheet');
const outside = [nav, $('main'), $('.foot')];
let current = null;
let pushed = false;
let lastTile = null;

function fill(i) {
  const q = (s) => sheet.querySelector(s);
  const ri = REGIONS.findIndex((r) => r.id === i.region);
  q('.sh-crumb').textContent = `${ROMAN[ri]} · ${REGIONS[ri].name}`;
  q('.kind').textContent = kindLabel(i);
  q('#sh-title').textContent = i.title;
  q('.blurb').textContent = i.blurb;
  const tile = document.querySelector(`.tile[data-id="${i.id}"]`);
  const art = q('.sh-art');
  const loaded = tile?.querySelector('.art')?.currentSrc;
  art.removeAttribute('srcset');
  art.src = loaded || `art/${i.id}-900.webp`;
  art.sizes = '100vw';
  art.srcset = artSet(i.id);
  art.alt = '';
  q('.sh-alt').textContent = tile?.dataset.alt ? `The picture: ${tile.dataset.alt.replace(/\.$/, '')}.` : '';

  const actions = q('.sh-actions');
  actions.replaceChildren();
  const launch = launchHref(i);
  if (launch) actions.append(el('a', { class: 'btn primary', href: launch }, `Launch ${i.title} ↗`));
  if (i.study) actions.append(el('a', { class: 'btn', href: i.study, rel: 'noopener' }, 'Case study'));
  const src = sourceHref(i);
  if (src) actions.append(el('a', { class: 'btn', href: src, rel: 'noopener' }, 'Source'));
  actions.append(el('a', { class: 'btn', href: `projects/${i.id}/` }, 'Its own page'));
  const note = q('.sh-note');
  note.hidden = !!launch;
  note.textContent = launch ? '' : 'Tally is a Python service rather than a page, so it runs on a server. It deploys in one step from render.yaml; until it does, the case study and the source are the way in, and the About section below walks through how it was built.';

  q('.sh-problem').textContent = i.problem;
  const ev = q('.sh-evidence');
  ev.textContent = i.evidence;
  if (i.tests) ev.append(' ', el('a', { href: i.tests, rel: 'noopener' }, 'Read its tests'));
  q('.sh-features').replaceChildren(...i.features.map((f) => el('li', {}, f)));
  q('.sh-dtitle').textContent = i.decision[0];
  q('.sh-dtext').textContent = i.decision[1];
  q('.sh-tech').replaceChildren(...i.tech.map((t) => el('li', {}, t)));
  const ai = q('.sh-ai');
  ai.hidden = !i.ai;
  if (i.ai) for (const key of ['model', 'code', 'guards', 'limits']) q(`.sh-${key}`).replaceChildren(...i.ai[key].map((t) => el('li', {}, t)));

  const shot = q('.sh-shot img');
  shot.src = `shots/${i.id}-960.webp`;
  shot.srcset = tile?.querySelector('.shot')?.getAttribute('srcset') ?? '';
  shot.sizes = '(min-width: 860px) 40vw, 100vw';
  shot.alt = `${i.title} as it first opens.`;
  q('.sh-shot figcaption').textContent = launch
    ? `${i.title} as it opens. “Run it here” starts the real app on this page.`
    : 'Tally’s audit view.';
  q('.try').hidden = !launch;

  const n = ISLANDS.indexOf(i);
  const next = ISLANDS[(n + 1) % ISLANDS.length];
  const nx = q('.sh-next');
  nx.href = `#world/${next.id}`;
  nx.dataset.id = next.id;
  nx.querySelector('img').srcset = artSet(next.id);
  nx.querySelector('img').sizes = '100vw';
  nx.querySelector('img').src = `art/${next.id}-900.webp`;
  nx.querySelector('.title').textContent = next.title;
  const prev = ISLANDS[(n - 1 + ISLANDS.length) % ISLANDS.length];
  q('[data-go="prev"]').setAttribute('aria-label', `Previous: ${prev.title}`);
  q('[data-go="next"]').setAttribute('aria-label', `Next: ${next.title}`);
  document.title = `${i.title} — Portal Atlas`;
}

/* Where the browser can, the tile's picture itself grows into the sheet. */
function transition(update, withArt) {
  if (reduced || !document.startViewTransition || !withArt) { update(); return; }
  withArt.style.viewTransitionName = 'art';
  const vt = document.startViewTransition(() => {
    withArt.style.viewTransitionName = '';
    update();
    sheet.querySelector('.sh-art').style.viewTransitionName = 'art';
  });
  vt.finished.finally(() => { sheet.querySelector('.sh-art').style.viewTransitionName = ''; });
}

function open(id, { push = false } = {}) {
  const i = islandById.get(id);
  if (!i) return;
  const wasOpen = !sheet.hidden;
  const tile = document.querySelector(`.tile[data-id="${id}"]`);
  if (!wasOpen) lastTile = tile;
  const show = () => {
    fill(i);
    current = id;
    sheet.hidden = false;
    sheet.scrollTop = 0;
    document.body.classList.add('locked');
    outside.forEach((n) => { n.inert = true; });
    $('.sh-close').focus({ preventScroll: true });
  };
  if (wasOpen) {
    show();
  } else {
    sheet.classList.remove('closing');
    const art = tile?.querySelector('.art');
    const visible = art && art.getBoundingClientRect().bottom > 0 && art.getBoundingClientRect().top < innerHeight;
    if (visible && document.startViewTransition && !reduced) transition(show, art);
    else { show(); if (!reduced) { sheet.classList.add('opening'); setTimeout(() => sheet.classList.remove('opening'), 600); } }
  }
  const hash = `#world/${id}`;
  if (push && location.hash !== hash) {
    if (wasOpen) history.replaceState({ world: id }, '', hash);
    else { history.pushState({ world: id }, '', hash); pushed = true; }
  }
}

function close({ fromHistory = false } = {}) {
  if (sheet.hidden) return;
  closeTheatre({ quiet: true, fromHistory: true });
  const id = current;
  const tile = document.querySelector(`.tile[data-id="${id}"]`) ?? lastTile;
  const hide = () => {
    sheet.hidden = true;
    sheet.classList.remove('closing');
    document.body.classList.remove('locked');
    outside.forEach((n) => { n.inert = false; });
    current = null;
    document.title = 'Portal Atlas — Mohamed Sucule, AI product builder: ideas that escape the ordinary';
    tile?.querySelector('h4 a')?.focus({ preventScroll: true });
  };
  const art = tile?.querySelector('.art');
  if (!reduced && document.startViewTransition && art && sheet.scrollTop < innerHeight * 0.5) {
    tile.scrollIntoView({ block: 'center' });
    sheet.querySelector('.sh-art').style.viewTransitionName = 'art';
    const vt = document.startViewTransition(() => {
      sheet.querySelector('.sh-art').style.viewTransitionName = '';
      hide();
      art.style.viewTransitionName = 'art';
    });
    vt.finished.finally(() => { art.style.viewTransitionName = ''; });
  } else if (!reduced) {
    tile?.scrollIntoView({ block: 'center' });
    sheet.classList.add('closing');
    setTimeout(hide, 330);
  } else {
    tile?.scrollIntoView({ block: 'center' });
    hide();
  }
  if (!fromHistory) {
    if (pushed) { pushed = false; history.back(); }
    else history.replaceState(null, '', location.pathname + location.search);
  } else pushed = false;
}

function step(dir) {
  const n = ISLANDS.findIndex((i) => i.id === current);
  const to = ISLANDS[(n + dir + ISLANDS.length) % ISLANDS.length];
  if (!reduced) {
    sheet.classList.remove('opening');
    void sheet.offsetWidth;
    sheet.classList.add('opening');
    setTimeout(() => sheet.classList.remove('opening'), 600);
  }
  open(to.id, { push: true });
}

$('.sh-close').addEventListener('click', () => close());
sheet.querySelector('[data-go="prev"]').addEventListener('click', () => step(-1));
sheet.querySelector('[data-go="next"]').addEventListener('click', () => step(1));
sheet.querySelector('.sh-next').addEventListener('click', (e) => { e.preventDefault(); step(1); });

/* ── the real thing, running ─────────────────────────────────────────── */

const theatre = $('#theatre');
const thPanel = $('.th-panel');
let livePushed = false;
const shotRect = () => sheet.querySelector('.sh-shot img').getBoundingClientRect();
function flipFrom(rect) {
  const to = thPanel.getBoundingClientRect();
  thPanel.style.transform = `translate(${rect.left - to.left}px, ${rect.top - to.top}px) scale(${rect.width / to.width}, ${rect.height / to.height})`;
}
function openTheatre({ push = true } = {}) {
  const i = islandById.get(current);
  const href = i && launchHref(i);
  if (!href || !theatre.hidden) return;
  $('.th-title').textContent = `${i.title}, running live`;
  $('.th-open').href = href;
  /* the apps are this site's own pages, so the frame gives them what a direct visit would:
     Tuner and Front Desk can still ask for the microphone, through the browser's own prompt */
  $('.th-frame').replaceChildren(el('iframe', { src: href, title: `${i.title}, running live`, allow: 'microphone; autoplay; fullscreen' }));
  const from = shotRect();
  theatre.hidden = false;
  sheet.inert = true;
  if (!reduced) {
    thPanel.style.transition = 'none';
    flipFrom(from);
    void thPanel.offsetWidth;
    thPanel.style.transition = '';
    requestAnimationFrame(() => { thPanel.style.transform = ''; });
  }
  $('.th-back').focus({ preventScroll: true });
  if (push && !location.hash.endsWith('/live')) {
    history.pushState({ world: i.id, live: true }, '', `#world/${i.id}/live`);
    livePushed = true;
  }
}
function closeTheatre({ fromHistory = false, quiet = false } = {}) {
  if (theatre.hidden) return;
  const done = () => { theatre.hidden = true; thPanel.style.transform = ''; $('.th-frame').replaceChildren(); };
  sheet.inert = false;
  if (reduced || quiet) done();
  else { flipFrom(shotRect()); setTimeout(done, 480); }
  if (!fromHistory) {
    if (livePushed) { livePushed = false; history.back(); }
    else if (location.hash.endsWith('/live')) history.replaceState({ world: current }, '', `#world/${current}`);
  } else livePushed = false;
  if (!quiet) $('.try').focus({ preventScroll: true });
}
$('.try').addEventListener('click', () => openTheatre());
$('.th-back').addEventListener('click', () => closeTheatre());

/* ── addresses, keys ─────────────────────────────────────────────────── */

function route() {
  const m = location.hash.match(/^#world\/([a-z0-9-]+)(\/live)?$/);
  if (m && islandById.has(m[1])) {
    if (current !== m[1]) open(m[1]);
    if (m[2]) openTheatre({ push: false });
    else closeTheatre({ fromHistory: true });
  } else if (current) close({ fromHistory: true });
}
addEventListener('popstate', route);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!theatre.hidden) { e.preventDefault(); closeTheatre(); return; }
    if (!sheet.hidden) { e.preventDefault(); close(); }
    return;
  }
  if (sheet.hidden || !theatre.hidden || e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
});

route();
window.__atlas = { open, close, current: () => current, live: () => !theatre.hidden, count: ISLANDS.length };

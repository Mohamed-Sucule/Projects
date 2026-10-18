/* atlas/main.js — the Portal Atlas, once script arrives.

   The page works without any of this: the gallery is plain HTML (build.mjs),
   every painting is a link to the project's own page, and the pictures are
   files. On top of that, this adds:

     the way in    the portal as a film that loops, and a flight through it
                   into the gallery as you scroll
     the walk      on a wide screen, the rooms as one long wall that scrolling
                   carries you along

     the sheet     a project opened in place, at #world/<id>: the problem, the
                   evidence, how it was built, and the next world after it
     the theatre   "Run it here" opens the real app full screen, at
                   #world/<id>/live, so Back and Esc both step out of it
     the rest      the corner turning solid past the portal, and Search
                   opening the site's finder */

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

/* ── the way through ─────────────────────────────────────────────────────
   At rest, on a wide screen, the portal is a three-second film of itself that
   loops (the sea drifts, the stars turn over); a phone keeps the still. Scroll, and the film gives way to frames of a
   flight: the camera lines up with the ring, goes through it, and the evening
   on the other side brightens until it is the light the gallery begins in.
   Both are rendered offline (art/motion.mjs); here they are only played. */

const saveData = navigator.connection?.saveData === true;
const stage = $('.hero-stage');
const tall = () => innerWidth / innerHeight < 0.8;
const moving = !reduced && !saveData;
let video = null;
if (moving && !tall()) {
  video = el('video', { class: 'hero-video', muted: '', loop: '', playsinline: '', autoplay: '', preload: 'auto', 'aria-hidden': 'true' });
  video.muted = true;
  for (const [type, ext] of [['video/webm', 'webm'], ['video/mp4', 'mp4']]) {
    video.append(el('source', { type, src: `art/portal-loop.${ext}` }));
  }
  video.addEventListener('playing', () => video.classList.add('on'), { once: true });
  $('.hero-art').after(video);
  video.play?.().catch(() => {});
}

const FLIGHT = 32;
const flight = $('.flight');
const fctx = flight.getContext('2d');
let frames = null, frameSet = null, drawn = -1;
if (moving) hero.classList.add('crossing');
function loadFlight() {
  const set = tall() ? 'tall' : 'wide';
  if (frameSet === set) return;
  frameSet = set;
  frames = Array.from({ length: FLIGHT }, (_, i) => {
    const im = new Image();
    im.decoding = 'async';
    im.src = `art/flight/${set}-${String(i).padStart(2, '0')}.webp`;
    im.onload = () => { if (drawn === -2) paint(); };
    return im;
  });
}
function fitCanvas() {
  const d = Math.min(devicePixelRatio || 1, 2);
  flight.width = Math.round(stage.clientWidth * d);
  flight.height = Math.round(stage.clientHeight * d);
  drawn = -1;
}
/* the same cover fit and focal point as the picture underneath, so frame 0 is the still */
function drawFrame(im, alpha = 1) {
  const W = flight.width, H = flight.height, s = Math.max(W / im.naturalWidth, H / im.naturalHeight);
  const w = im.naturalWidth * s, h = im.naturalHeight * s;
  const [fx, fy] = tall() ? [0.5, 0.3] : [0.88, 0.5];
  fctx.globalAlpha = alpha;
  fctx.drawImage(im, (W - w) * fx, (H - h) * fy, w, h);
  fctx.globalAlpha = 1;
}
const ready = (im) => im.complete && im.naturalWidth > 0;
let fly = 0;
/* between two frames, the second fades over the first, so 32 frames read as a flight */
function paint() {
  if (!frames) return;
  const pos = fly * (FLIGHT - 1);
  let i = Math.min(FLIGHT - 1, Math.floor(pos));
  const t = pos - i;
  /* the nearest frame that has arrived, so a slow connection still moves */
  while (i > 0 && !ready(frames[i])) i--;
  if (!ready(frames[i])) { drawn = -2; return; }
  const key = i + Math.round(t * 16) / 16;
  if (key === drawn) return;
  drawFrame(frames[i]);
  const next = frames[i + 1];
  if (next && ready(next) && t > 0.01) drawFrame(next, t);
  drawn = key;
}
function onFly() {
  if (!moving) return;
  const span = hero.offsetHeight - innerHeight;
  fly = Math.max(0, Math.min(1, scrollY / Math.max(1, span)));
  hero.style.setProperty('--fly', fly.toFixed(4));
  const on = fly > 0.002;
  if (on && !frames) loadFlight();
  flight.classList.toggle('on', on);
  if (on) { paint(); video?.pause(); } else if (video?.paused) video.play().catch(() => {});
  /* past the bright middle of the flight the corner needs its own ground to stand on */
  nav.classList.toggle('over-light', fly > 0.62);
  /* when the scrolling stops, settle on a whole frame rather than a blend of two */
  clearTimeout(settleTimer);
  if (on) settleTimer = setTimeout(() => { fly = Math.round(fly * (FLIGHT - 1)) / (FLIGHT - 1); drawn = -1; paint(); }, 140);
}
let settleTimer = 0;
if (moving) {
  fitCanvas();
  /* fetch the flight once the opening has settled, before anyone needs it */
  addEventListener('load', () => setTimeout(loadFlight, 1200), { once: true });
}

/* "Enter the gallery" takes you through the ring rather than past it; a wheel,
   a touch or a key hands the scroll straight back. */
$('.hero .primary').addEventListener('click', (e) => {
  const to = $('#work').getBoundingClientRect().top + scrollY;
  if (!moving) return;
  e.preventDefault();
  const from = scrollY, t0 = performance.now(), dur = 2600;
  let raf = 0;
  const stop = () => { cancelAnimationFrame(raf); for (const ev of ['wheel', 'touchstart', 'keydown']) removeEventListener(ev, stop); };
  for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, stop, { passive: true });
  const step = (now) => {
    const u = Math.min(1, (now - t0) / dur);
    scrollTo(0, from + (to - from) * (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2));
    if (u < 1) raf = requestAnimationFrame(step); else { stop(); $('#work-title').focus?.({ preventScroll: true }); }
  };
  raf = requestAnimationFrame(step);
});

/* ── the gallery ───────────────────────────────────────────────────────── */

const corridor = $('.corridor');
const wallEl = $('.wall');
const rooms = [...document.querySelectorAll('.room')];
const paintings = [...document.querySelectorAll('.painting')];
const whereRoom = $('.w-room');
const whereBar = $('.w-bar i');
let walk = false, extra = 0, cTop = 0;

if (reduced || !('IntersectionObserver' in window)) paintings.forEach((t) => t.classList.add('in'));
else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  paintings.forEach((t) => io.observe(t));
}

/* on a wide screen the corridor is one long wall, and scrolling walks along it */
const leftOf = (n) => n.getBoundingClientRect().left - wallEl.getBoundingClientRect().left;
function layoutWalk() {
  walk = !reduced && innerWidth >= 900 && innerWidth / innerHeight >= 1.05;
  corridor.classList.toggle('walk', walk);
  if (!walk) { corridor.style.height = ''; wallEl.style.transform = ''; return; }
  extra = Math.max(0, wallEl.scrollWidth - innerWidth);
  corridor.style.height = `${innerHeight + extra}px`;
  cTop = corridor.getBoundingClientRect().top + scrollY;
  onWalk();
}
function onWalk() {
  if (!walk) return;
  const x = Math.min(extra, Math.max(0, scrollY - cTop));
  /* a focused link can scroll the stage itself where clip is not supported; only the walk moves it */
  wallEl.parentElement.scrollLeft = 0;
  wallEl.style.transform = `translate3d(${(-x).toFixed(1)}px, 0, 0)`;
  let room = rooms[0];
  for (const r of rooms) if (r.offsetLeft <= x + innerWidth * 0.5) room = r;
  const n = rooms.indexOf(room);
  const label = `Room ${ROMAN[n]} · ${REGIONS[n].name}`;
  if (whereRoom.textContent !== label) whereRoom.textContent = label;
  whereBar.style.width = `${(x / Math.max(1, extra)) * 100}%`;
}
/* bring a painting (or a room) to the middle of the screen, along the wall or down the page */
function bringIntoView(node, { smooth = !reduced, start = false } = {}) {
  if (!node) return;
  if (!walk) { node.scrollIntoView({ block: start ? 'start' : 'center', behavior: smooth ? 'smooth' : 'auto' }); return; }
  const left = leftOf(node);
  const x = start ? left : left - (innerWidth - node.offsetWidth) / 2;
  scrollTo({ top: cTop + Math.max(0, Math.min(extra, x)), behavior: smooth ? 'smooth' : 'auto' });
}
document.querySelectorAll('.contents a').forEach((a) => a.addEventListener('click', (e) => {
  if (!walk) return;
  e.preventDefault();
  bringIntoView(document.querySelector(a.getAttribute('href')), { start: true });
}));
/* walking with Tab: whatever is focused is brought to where it can be seen */
corridor.addEventListener('focusin', (e) => {
  if (!walk) return;
  const p = e.target.closest('.painting');
  wallEl.parentElement.scrollLeft = 0;
  if (p) bringIntoView(p, { smooth: false });
});
wallEl.addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  open(a.dataset.open, { push: true });
});

let queued = false;
addEventListener('scroll', () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; onFly(); onWalk(); });
}, { passive: true });
addEventListener('resize', () => { if (moving) { fitCanvas(); if (frames && frameSet !== (tall() ? 'tall' : 'wide')) { frames = null; frameSet = null; } } layoutWalk(); onFly(); });
addEventListener('load', layoutWalk);
layoutWalk();
onFly();

/* ── a project, opened ───────────────────────────────────────────────── */

const sheet = $('#sheet');
const outside = [nav, $('main'), $('.foot')];
let current = null;
let pushed = false;
let lastSeen = null;

function fill(i) {
  const q = (s) => sheet.querySelector(s);
  const ri = REGIONS.findIndex((r) => r.id === i.region);
  q('.sh-crumb').textContent = `${ROMAN[ri]} · ${REGIONS[ri].name}`;
  q('.kind').textContent = kindLabel(i);
  q('#sh-title').textContent = i.title;
  q('.blurb').textContent = i.blurb;
  const work = document.querySelector(`.painting[data-id="${i.id}"]`);
  const art = q('.sh-art');
  const loaded = work?.querySelector('.art')?.currentSrc;
  art.removeAttribute('srcset');
  art.src = loaded || `art/${i.id}-900.webp`;
  art.sizes = '100vw';
  art.srcset = artSet(i.id);
  art.alt = '';
  q('.sh-alt').textContent = work?.dataset.alt ? `The picture: ${work.dataset.alt.replace(/\.$/, '')}.` : '';

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
  shot.srcset = work?.querySelector('.shot')?.getAttribute('srcset') ?? '';
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

/* Where the browser can, the painting itself grows into the sheet. */
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
  const work = document.querySelector(`.painting[data-id="${id}"]`);
  if (!wasOpen) lastSeen = work;
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
    const art = work?.querySelector('.art');
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
  const work = document.querySelector(`.painting[data-id="${id}"]`) ?? lastSeen;
  const hide = () => {
    sheet.hidden = true;
    sheet.classList.remove('closing');
    document.body.classList.remove('locked');
    outside.forEach((n) => { n.inert = false; });
    current = null;
    document.title = 'Portal Atlas — Mohamed Sucule, AI product builder: ideas that escape the ordinary';
    work?.querySelector('h4 a')?.focus({ preventScroll: true });
  };
  const art = work?.querySelector('.art');
  if (!reduced && document.startViewTransition && art && sheet.scrollTop < innerHeight * 0.5) {
    bringIntoView(work, { smooth: false });
    sheet.querySelector('.sh-art').style.viewTransitionName = 'art';
    const vt = document.startViewTransition(() => {
      sheet.querySelector('.sh-art').style.viewTransitionName = '';
      hide();
      art.style.viewTransitionName = 'art';
    });
    vt.finished.finally(() => { art.style.viewTransitionName = ''; });
  } else if (!reduced) {
    bringIntoView(work, { smooth: false });
    sheet.classList.add('closing');
    setTimeout(hide, 330);
  } else {
    bringIntoView(work, { smooth: false });
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

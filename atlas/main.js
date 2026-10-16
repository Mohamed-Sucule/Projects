/* atlas/main.js — the Portal Atlas, wired together.

   The page is readable before any of this runs: the headline, the full list of
   projects, the case study and the way to get in touch are in the HTML, and
   every project has its own static page. This module adds the world on top:

     sky.js    the threshold, the portal and the world beyond it (WebGL)
     hero.js   the same idea in 2D canvas, for browsers without WebGL
     stage.js  the flight past the islands, and stepping into one
     fx.js     each world's environment, and the particle transitions

   and, here, the things that tie them to the page: the opening, scroll as the
   journey through the portal, the cursor, the hidden discoveries, the guide,
   the index and the renderer's own numbers. */

import { KINDS } from '../shared/atlas.js';
import { buildIndex, search, explain, detectIntent } from '../shared/search.js';
import { ISLANDS, REGIONS, SEARCHABLE, islandById } from './worlds.js';
import { islandSVG } from './islands.js';
import { createSky, sceneLayout, dialRing, toScreen, moonPhase, phaseName } from './sky.js';
import { createFx } from './fx.js';
import { createStage, kindLabel } from './stage.js';

const $ = (s, r = document) => r.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none)').matches;
const lowPower = coarse || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
const root = document.documentElement;

/* ── the renderers ──────────────────────────────────────────────────── */

const skyCanvas = $('#sky');
let sky = null;
try { sky = createSky(skyCanvas, { reduced, lowPower }); } catch (e) { console.warn('sky failed', e); sky = null; }
/* Without WebGL the same scene is drawn in 2D, behind the same calls, so
   everything below works the same either way. */
if (!sky) {
  document.body.classList.add('no-webgl');
  const { startWorld } = await import('./hero.js');
  sky = startWorld(skyCanvas, { reduced });
}
const fx = createFx($('#near'), $('#veil'), { reduced });
const stage = createStage({ sky, fx, reduced, coarse, onFocusChange: (isle) => { $('#guide').hidden = !!isle; document.body.classList.toggle('in-world', !!isle); } });

/* ── the opening ────────────────────────────────────────────────────── */
/* Atmosphere first, then the far structures out of the fog, then the portal
   lights ring by ring, then the headline. Short, skippable, and on a return
   visit shorter still. Nothing waits for it: the page is usable throughout. */

let seen = false;
try { seen = localStorage.getItem('atlas-visited') === '1'; localStorage.setItem('atlas-visited', '1'); } catch { /* private mode */ }
const INTRO = reduced ? 0 : seen ? 1000 : 2800;
const skipBtn = $('.skip-intro');
let introStart = performance.now();
let introDone = false;
root.classList.remove('booting');
document.body.classList.add('intro');

function resolveHeadline() {
  if (document.body.classList.contains('resolve')) return;
  document.body.classList.add('resolve');
  requestAnimationFrame(() => document.body.classList.remove('intro'));
}
function finishIntro() {
  if (introDone) return;
  introDone = true;
  sky?.set({ intro: 1 });
  resolveHeadline();
  skipBtn.hidden = true;
  placeSpots();
}
if (!INTRO) finishIntro();
else {
  skipBtn.hidden = seen;
  /* the clock starts once frames are actually arriving: on a slow GPU the shader
     compiles during the first draw, and the opening should not be spent waiting for it */
  let frames = 0;
  const tick = (now) => {
    if (introDone) return;
    if (frames++ < 2) { introStart = performance.now(); requestAnimationFrame(tick); return; }
    const u = Math.min(1, Math.max(0, now - introStart) / INTRO);
    sky?.set({ intro: u });
    if (u > 0.62) resolveHeadline();
    if (u >= 1) finishIntro(); else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  skipBtn.addEventListener('click', finishIntro);
  for (const ev of ['wheel', 'keydown', 'touchstart', 'pointerdown']) addEventListener(ev, finishIntro, { once: true, passive: true });
}

/* ── scroll is the journey ──────────────────────────────────────────── */

const field = $('.field');
const stageEl = $('.stage');
const hero = $('.hero');
const nav = $('.nav');
const projects = $('#projects');
let lastTravel = -1;

function portalPx() {
  if (sky) {
    const L = sky.layout();
    if (!L) return null;
    const [x, y] = toScreen(L.portal, innerWidth, innerHeight);
    return { x, y, r: L.portal[2] * innerHeight };
  }
  return null;
}

function onScroll() {
  const H = innerHeight;
  const fieldTop = field.getBoundingClientRect().top + scrollY;
  const travel = Math.max(0, Math.min(1, scrollY / Math.max(1, fieldTop - H * 0.04)));
  if (Math.abs(travel - lastTravel) > 0.0005) {
    lastTravel = travel;
    sky?.set({ travel: reduced ? (travel > 0.5 ? 1 : 0) : travel });
  }
  hero.style.opacity = String(Math.max(0, 1 - scrollY / (H * 0.42)));
  $('.hotspots').style.visibility = scrollY > H * 0.2 ? 'hidden' : '';
  /* the islands rise out of the cloud as the passage ends, rather than sliding up with the page */
  const fr = field.getBoundingClientRect();
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  /* and sink back into it as the field ends and the paper comes up */
  stageEl.style.opacity = String(Math.min(clamp01(1 - fr.top / (H * 0.4)), clamp01((fr.bottom - H * 0.25) / (H * 0.5))));
  stage.onScroll();
  sky?.set({ alt: stage.progress() });
  const pTop = projects.getBoundingClientRect().top;
  const onPaper = pTop < H * 0.5;
  document.body.classList.toggle('on-paper', onPaper);
  nav.classList.toggle('on-light', pTop < nav.offsetHeight);
  sky?.setVisible(pTop > 0);
  fx.ambient({ mode: onPaper ? 'off' : travel < 1 ? 'threshold' : 'world', travel: travel < 1 ? travel : 0, portal: portalPx() });
  for (const a of nav.querySelectorAll('nav a')) {
    const t = document.querySelector(a.getAttribute('href'));
    const r = t.getBoundingClientRect();
    a.setAttribute('aria-current', String(r.top < H * 0.5 && r.bottom > H * 0.5));
  }
}
let scrollQueued = false;
addEventListener('scroll', () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(() => { scrollQueued = false; onScroll(); }); } }, { passive: true });
addEventListener('resize', () => { onScroll(); placeSpots(); });

/* "Explore my worlds": a short, interruptible flight through the portal to the first island. */
let flight = 0;
function explore() {
  finishIntro();
  const target = field.getBoundingClientRect().top + scrollY + innerHeight * 0.02;
  if (reduced) { scrollTo({ top: target, behavior: 'auto' }); return; }
  const from = scrollY;
  const start = performance.now();
  const ms = Math.min(2200, 900 + Math.abs(target - from) * 0.45);
  cancelAnimationFrame(flight);
  const stop = () => { cancelAnimationFrame(flight); flight = 0; for (const e of ['wheel', 'touchstart', 'keydown']) removeEventListener(e, stop); };
  for (const e of ['wheel', 'touchstart', 'keydown']) addEventListener(e, stop, { passive: true });
  const step = (now) => {
    const u = Math.min(1, (now - start) / ms);
    const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    scrollTo(0, from + (target - from) * k);
    if (u < 1) flight = requestAnimationFrame(step); else stop();
  };
  flight = requestAnimationFrame(step);
}
$('.explore').addEventListener('click', (e) => { e.preventDefault(); explore(); });
nav.querySelector('a[href="#worlds"]').addEventListener('click', (e) => { e.preventDefault(); explore(); });

/* ── the cursor ─────────────────────────────────────────────────────── */

const hint = $('.portal-hint');
let hovering = false;
function onPointer(ev) {
  /* inside a world, a few of them answer the pointer the way their app would */
  fx.pointer(ev.clientX, ev.clientY, !!stage.selected() && stage.state() !== 'live' && !ev.target.closest?.('.reveal, .theatre, .nav'));
  if (ev.pointerType === 'touch') return;
  const mx = (ev.clientX / innerWidth) * 2 - 1;
  const my = (ev.clientY / innerHeight) * 2 - 1;
  if (!reduced) { sky?.set({ mouse: [mx, my] }); fx.ambient({ mouse: [mx, my] }); }
  if (scrollY > innerHeight * 0.3 || !introDone) return;
  const P = portalPx();
  if (!P) return;
  const d = Math.hypot(ev.clientX - P.x, ev.clientY - P.y);
  /* approaching counts, not only touching: the light gathers as the cursor nears the ring */
  const near = Math.max(0, Math.min(1, 1 - (d - P.r) / (P.r * 1.2)));
  const inside = d < P.r * 0.8;
  sky?.set({ hover: near });
  fx.ambient({ hover: near, portal: P });
  /* the dial round the ring: one block for each world, and it says which */
  const block = sky ? sky.dialAt(ev.clientX, ev.clientY) : -1;
  if (block !== dialHot) {
    dialHot = block;
    sky?.set({ dialHot: block });
    const isle = block >= 0 ? islandById.get(stage.order()[block]) : null;
    hint.querySelector('span').textContent = isle ? `${isle.title}: enter its world` : 'Step through';
  }
  const on = inside || dialHot >= 0;
  if (on !== hovering || dialHot >= 0) {
    hovering = on;
    document.querySelector('.threshold').style.cursor = on ? 'pointer' : '';
    hint.classList.toggle('on', on);
    hint.classList.toggle('dial', dialHot >= 0);
    hint.style.left = `${dialHot >= 0 ? ev.clientX : P.x}px`;
    hint.style.top = `${dialHot >= 0 ? ev.clientY + 24 : P.y + P.r * 1.3 + 10}px`;
  }
  const L = sky?.layout();
  if (L?.light) {
    const [lx, ly] = toScreen([L.light[0], L.light[1]], innerWidth, innerHeight);
    const dl = Math.hypot(ev.clientX - lx, ev.clientY - ly);
    sky.set({ lamp: Math.max(0, 1 - dl / 140) });
  }
}
let dialHot = -1;
addEventListener('pointermove', onPointer, { passive: true });
$('.threshold').addEventListener('click', (ev) => {
  if (ev.target.closest('a, button')) return;
  const block = sky ? sky.dialAt(ev.clientX, ev.clientY) : -1;
  if (block >= 0) { stage.select(stage.order()[block]); return; }
  const P = portalPx();
  if (P && Math.hypot(ev.clientX - P.x, ev.clientY - P.y) < P.r * 0.85) explore();
});

/* the same dial from the keyboard: the arrows go round it, Enter steps in */
const dial = $('.dial');
let dialKey = -1, dialTimer = 0;
/* (looked up here, not from the const above: with reduced motion the intro ends,
   and this runs, before the module has got that far) */
function placeDial() {
  const dial = $('.dial');
  const L = sky?.layout();
  dial.hidden = !L || !introDone;
  if (dial.hidden) return;
  const [x, y, r] = dialRing(L);
  const [px, py] = toScreen([x, y], innerWidth, innerHeight);
  const rp = r * innerHeight;
  Object.assign(dial.style, { left: `${px - rp}px`, top: `${py - rp}px`, width: `${rp * 2}px`, height: `${rp * 2}px` });
}
function fillDial() {
  dial.replaceChildren(...stage.order().map((id, i) => {
    const isle = islandById.get(id);
    const region = REGIONS.find((r) => r.id === isle.region)?.name;
    const o = document.createElement('div');
    o.id = `dial-${i}`;
    o.setAttribute('role', 'option');
    o.setAttribute('aria-selected', 'false');
    o.textContent = [isle.title, region, stage.wasSeen(id) && 'visited'].filter(Boolean).join(', ');
    return o;
  }));
}
/* the block turns with the dial, so the label follows it */
function labelDial() {
  const [x, y] = sky.dialPoint(dialKey);
  const half = hint.offsetWidth / 2 + 12;
  hint.style.left = `${Math.max(half, Math.min(innerWidth - half, x))}px`;
  hint.style.top = `${y + 24}px`;
}
function pointDial(i) {
  dialKey = dialHot = i;
  sky.set({ dialHot: i });
  for (const o of dial.children) o.setAttribute('aria-selected', String(o.id === `dial-${i}`));
  dial.setAttribute('aria-activedescendant', `dial-${i}`);
  hint.querySelector('span').textContent = `${islandById.get(stage.order()[i]).title}: enter its world`;
  hint.classList.add('on', 'dial');
  labelDial();
}
dial.addEventListener('focus', () => {
  fillDial();
  pointDial(Math.max(0, dialKey));
  clearInterval(dialTimer);
  if (!reduced) dialTimer = setInterval(labelDial, 250);
});
dial.addEventListener('blur', () => {
  clearInterval(dialTimer);
  dialHot = -1;
  hovering = false;
  sky?.set({ dialHot: -1 });
  hint.classList.remove('on', 'dial');
});
dial.addEventListener('keydown', (e) => {
  const n = stage.order().length;
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (step) pointDial((dialKey + step + n) % n);
  else if (e.key === 'Home') pointDial(0);
  else if (e.key === 'End') pointDial(n - 1);
  else if (e.key === 'Enter' || e.key === ' ') stage.select(stage.order()[dialKey]);
  else return;
  e.preventDefault();
  e.stopPropagation();
});

/* ── things to find ─────────────────────────────────────────────────── */

const note = $('.note');
function spotPos(name) {
  if (!sky) return null;
  const L = sky.layout();
  if (!L) return null;
  if (name === 'figure') return toScreen([L.figure[0], L.figure[1] + L.figure[2] * 0.5], innerWidth, innerHeight);
  if (name === 'moon') return toScreen([L.moon[0], L.moon[1]], innerWidth, innerHeight);
  return L.light ? toScreen([L.light[0], L.light[1]], innerWidth, innerHeight) : null;
}
function placeSpots() {
  for (const b of document.querySelectorAll('.hotspots .spot')) {
    const p = spotPos(b.dataset.spot);
    b.hidden = !p || !introDone;
    if (p) { b.style.left = `${p[0]}px`; b.style.top = `${p[1]}px`; }
  }
  placeDial();
}
function showNote(text, at) {
  note.querySelector('p').textContent = text;
  note.hidden = false;
  const w = Math.min(360, innerWidth - 32);
  note.style.left = `${Math.max(16, Math.min(innerWidth - w - 16, at[0] - w / 2))}px`;
  note.style.top = `${Math.max(80, Math.min(innerHeight - 200, at[1] + 26))}px`;
  note.querySelector('.note-close').focus({ preventScroll: true });
}
note.querySelector('.note-close').addEventListener('click', () => { note.hidden = true; });
document.querySelectorAll('.hotspots .spot').forEach((b) => b.addEventListener('click', (e) => {
  e.stopPropagation();
  const at = [parseFloat(b.style.left), parseFloat(b.style.top)];
  const phase = moonPhase();
  if (b.dataset.spot === 'figure') {
    showNote('For scale: the ring is about forty times the height of the person on the causeway. It is a tube, not a hoop: every layer of this scene sits at its own distance from you, so the ring is drawn in true perspective and you can see into its bore. All of it, sea and cliffs included, is one fragment shader, worked out pixel by pixel.', at);
  } else if (b.dataset.spot === 'moon') {
    const lit = Math.round(((1 - Math.cos(phase * Math.PI * 2)) / 2) * 100);
    showNote(`Tonight’s moon: ${phaseName(phase)}, ${lit}% lit. The phase is worked out from today’s date, so the sky is a little different each time you come back, and nothing about you is stored to do it.`, at);
  } else {
    note.hidden = true;
    stage.select('lamplighter');
  }
}));

/* ── the observatory: a guide that only knows what is real ──────────── */

const index = buildIndex(SEARCHABLE, KINDS);
const guide = $('#guide');
const card = $('#guide-card');
const orb = $('.guide-orb');
const input = $('#guide-q');
const results = $('.guide-results');
orb.addEventListener('click', () => {
  const open = card.hidden;
  card.hidden = !open;
  orb.setAttribute('aria-expanded', String(open));
  if (open) input.focus();
});
document.addEventListener('pointerdown', (e) => { if (!card.hidden && !guide.contains(e.target)) { card.hidden = true; orb.setAttribute('aria-expanded', 'false'); } });
function ask(q) {
  /* The search falls back to the flagship pieces when nothing matches, which is
     right for the site's navigator but would be a made-up recommendation here:
     only results that matched something, or that answer an explicit "surprise
     me", "the best" or "five minutes", count. */
  const intent = detectIntent(q);
  const hits = search(q, index, { limit: 3 }).filter((h) => h.score > 0 || intent.random || intent.featured || intent.maxMinutes);
  results.replaceChildren();
  if (!hits.length) {
    /* nothing real matches: say so, and offer the two honest ways forward */
    const li = document.createElement('li');
    li.className = 'none';
    li.innerHTML = '<p></p><a href="#projects">See every project as a list</a>';
    li.querySelector('p').textContent = `Nothing in the catalogue matches “${q}”. Try describing the problem rather than the tool: “double bookings”, “checking invoices against contracts”, “a game for two”.`;
    li.querySelector('a').addEventListener('click', () => { card.hidden = true; orb.setAttribute('aria-expanded', 'false'); });
    results.append(li);
    stage.light([]);
    return;
  }
  for (const h of hits) {
    const isle = islandById.get(h.entry.id);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<b></b><span></span><small></small>`;
    b.querySelector('b').textContent = isle.title;
    b.querySelector('span').textContent = isle.hook;
    b.querySelector('small').textContent = `${kindLabel(isle)} · ${explain(h, q)}`;
    b.addEventListener('click', () => { card.hidden = true; orb.setAttribute('aria-expanded', 'false'); stage.select(isle.id); });
    const page = document.createElement('a');
    page.className = 'page';
    page.href = `projects/${isle.id}/`;
    page.textContent = 'Its page';
    page.setAttribute('aria-label', `${isle.title}: its page`);
    li.append(b, page);
    results.append(li);
  }
  stage.light(hits.map((h) => h.entry.id));
}
$('form', card).addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim().slice(0, 200); if (q) ask(q); });
card.querySelectorAll('.guide-chips button').forEach((b) => b.addEventListener('click', () => { input.value = b.textContent; ask(b.textContent); }));

/* ── the index: every world, one keypress away ──────────────────────── */

const drawer = $('#index');
const indexBtn = $('.index-btn');
function openIndex() {
  const list = $('.index-list', drawer);
  if (!list.childElementCount) {
    for (const r of REGIONS) {
      const h = document.createElement('h3');
      h.textContent = r.name;
      const ul = document.createElement('ul');
      for (const isle of ISLANDS.filter((i) => i.region === r.id)) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `${islandSVG(isle, { uid: 'ix' })}<span><b></b><span></span></span>`;
        b.querySelector('b').textContent = isle.title;
        b.querySelector('span > span').textContent = kindLabel(isle);
        b.addEventListener('click', () => { closeIndex(); stage.select(isle.id); });
        li.append(b);
        ul.append(li);
      }
      list.append(h, ul);
    }
    for (const svg of list.querySelectorAll('svg')) svg.pauseAnimations?.();
  }
  drawer.hidden = false;
  document.body.classList.add('locked');
  $('.index-close', drawer).focus();
}
function closeIndex() {
  if (drawer.hidden) return;
  drawer.hidden = true;
  if (!stage.selected()) document.body.classList.remove('locked');
  indexBtn.focus({ preventScroll: true });
}
indexBtn.addEventListener('click', openIndex);
$('.index-close', drawer).addEventListener('click', closeIndex);
drawer.addEventListener('click', (e) => { if (e.target === drawer) closeIndex(); });
/* on a phone the section links live in here, since the bar has no room for them */
for (const a of drawer.querySelectorAll('.index-nav a')) {
  a.addEventListener('click', () => { drawer.hidden = true; document.body.classList.remove('locked'); });
}

/* ── the renderer's own numbers, behind the backtick key ────────────── */

const dev = $('#dev');
let devTimer = 0;
function devText() {
  const s = sky?.stats();
  const phase = moonPhase();
  const lines = s ? [
    `renderer   ${String(s.renderer).slice(0, 46)}`,
    `fps        ${s.fps}`,
    `submit     ${s.frameMs.toFixed(2)} ms`,
    `pixels     ${skyCanvas.width}×${skyCanvas.height} (${Math.round(s.scale * 100)}% of the screen)`,
    `quality    ${s.quality}`,
    `scene      ${s.travel <= 0 ? 'threshold' : s.travel >= 1 ? 'beyond' : 'crossing'}  travel ${s.travel.toFixed(2)}  altitude ${s.alt.toFixed(2)}`,
  ] : ['renderer   2D canvas fallback (no WebGL)'];
  lines.push(`moon       ${phaseName(phase)}, ${Math.round(((1 - Math.cos(phase * Math.PI * 2)) / 2) * 100)}% lit`);
  lines.push(`islands    ${stage.visibleCount()} of ${ISLANDS.length} drawn, ${stage.seenCount()} visited (dial lights them)`);
  lines.push(`stage      ${stage.state()}`);
  const isle = islandById.get(stage.selected());
  if (isle) {
    const block = stage.order().indexOf(isle.id);
    lines.push('', `world      ${isle.id} · ${REGIONS.find((r) => r.id === isle.region).name}`);
    lines.push(`dial       block ${block + 1} of ${ISLANDS.length}, clockwise from the top`);
    lines.push(`drawn as   ${isle.base} silhouette, ${isle.fx.type}${isle.fx.variant ? ` (${isle.fx.variant})` : ''} effect, ${isle.size} island`);
    lines.push(`launches   ${isle.href ? `../${isle.href}` : 'a server (Tally)'}`);
    if (isle.tests) lines.push(`tests      ${isle.tests.replace(/^.*\/blob\/main\//, '')}`);
    if (isle.ai) lines.push(`ai         ${isle.ai.model.length} model role(s), ${isle.ai.code.length} jobs left to plain code`);
  }
  lines.push(`motion     ${reduced ? 'reduced' : 'full'}${lowPower ? ', low-power device' : ''}`);
  lines.push('', 'press ` to close');
  return lines.join('\n');
}
function toggleDev() {
  dev.hidden = !dev.hidden;
  clearInterval(devTimer);
  if (!dev.hidden) { const upd = () => { $('pre', dev).textContent = devText(); }; upd(); devTimer = setInterval(upd, 500); }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeIndex();
    if (!note.hidden) note.hidden = true;
    if (!card.hidden) { card.hidden = true; orb.setAttribute('aria-expanded', 'false'); orb.focus(); }
    return;
  }
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === '`') { e.preventDefault(); toggleDev(); }
  if ((e.key === 'i' || e.key === 'I') && !e.metaKey && !e.ctrlKey && !e.altKey) { if (drawer.hidden) openIndex(); else closeIndex(); }
});

/* links in the plain list that say "its world" open it in the atlas */
document.querySelectorAll('[data-world]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); stage.select(a.dataset.world); }));

onScroll();
stage.route();
placeSpots();
window.__atlas = { sky, fx, stage, islands: ISLANDS.length };

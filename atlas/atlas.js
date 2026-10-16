/* atlas/atlas.js — the Portal Atlas: arrive, discover the islands, enter a project.

   The page is ordinary HTML that works without any of this: the headline, the
   case study and the way to get in touch are all in the markup. This module
   adds the world: the hero canvas, an island for every project, the panel each
   one opens into, and the guide. */

import { KINDS } from '../shared/atlas.js';
import { buildIndex, search, explain } from '../shared/search.js';
import { REGIONS, ISLANDS, islandById, SEARCHABLE, FEATURED } from './worlds.js';
import { islandSVG } from './islands.js';
import { startWorld } from './hero.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none)').matches;
const $ = (sel, root = document) => root.querySelector(sel);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const link = (href) => (href && !/^https?:/.test(href) ? `../${href}` : href);

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  if (html) node.innerHTML = html;
  return node;
}

/* Deterministic jitter so the constellation looks scattered but is the same on every visit. */
function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const kindLabel = (i) => (i.id === 'tally' ? 'AI product · Python service' : `${KINDS[i.kind]?.label ?? i.kind} · ${i.minutes} min`);

/* ── 01 arrive ──────────────────────────────────────────────────────────── */

const canvas = $('#world');
const hint = $('#portalHint');
const featured = islandById.get(FEATURED);
const portalArt = new Image();
portalArt.src = URL.createObjectURL(new Blob([islandSVG(featured)], { type: 'image/svg+xml' }));
hint.textContent = `Step through: ${featured.title}`;

const world = startWorld(canvas, {
  art: portalArt,
  reduced,
  onHover(on, p) {
    hint.classList.toggle('on', on);
    hint.style.left = `${p.x}px`;
    hint.style.top = `${p.y + p.ry + 18}px`;
  },
  onPortal(x, y) { stepThrough(x, y); },
});

function stepThrough(x, y) {
  const flash = $('#flash');
  flash.style.setProperty('--fx', `${x}px`);
  flash.style.setProperty('--fy', `${y}px`);
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');
  setTimeout(() => openPanel(FEATURED, { x, y }), reduced ? 0 : 240);
}

$('#enterPortal').addEventListener('click', () => {
  const p = world.portal();
  stepThrough(p.x, p.y);
});

/* The fixed starfield behind the islands. */
function drawStars() {
  const c = $('#stars');
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (innerWidth * innerHeight) / 2200; i++) {
    x.fillStyle = `rgba(232,236,255,${0.12 + rnd() * 0.5})`;
    const z = rnd() < 0.06 ? 1.6 : 0.9;
    x.fillRect(rnd() * innerWidth, rnd() * innerHeight, z, z);
  }
  for (const [fx, fy, k, col] of [[0.2, 0.3, 0.5, '113,142,200'], [0.8, 0.7, 0.6, '113,142,200'], [0.6, 0.1, 0.4, '154,230,208']]) {
    const r = Math.max(innerWidth, innerHeight) * k;
    const g = x.createRadialGradient(fx * innerWidth, fy * innerHeight, 0, fx * innerWidth, fy * innerHeight, r);
    g.addColorStop(0, `rgba(${col},.08)`);
    g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, innerWidth, innerHeight);
  }
}
drawStars();
let starTimer = 0;
addEventListener('resize', () => { clearTimeout(starTimer); starTimer = setTimeout(drawStars, 150); });

/* ── 02 the islands ─────────────────────────────────────────────────────── */

const worldEl = $('#islands-field');
const regionEls = [];
const isleEls = new Map();

REGIONS.forEach((region, ri) => {
  const members = ISLANDS.filter((i) => i.region === region.id);
  const sec = el('section', { class: 'region', id: `region-${region.id}`, 'aria-labelledby': `rh-${region.id}` });
  sec.append(el('header', { class: 'region-head' },
    `<p class="region-n">${ROMAN[ri]}</p><h3 id="rh-${region.id}">${region.name}</h3><p>${region.line}</p>`));
  const field = el('div', { class: 'constellation' }, '<svg class="lines" aria-hidden="true"></svg>');
  for (const isle of members) {
    const btn = el('button', {
      class: `isle ${isle.size}`, type: 'button', 'data-id': isle.id,
      'aria-label': `${isle.title}: ${isle.blurb}`,
    });
    const jitter = (hash01(isle.id) - 0.5) * (isle.size === 'lg' ? 30 : 70);
    btn.style.setProperty('--y', `${Math.round(jitter + (isle.size === 'sm' ? 30 : 0))}px`);
    btn.style.setProperty('--z', (0.6 + hash01(isle.id, 3) * 0.8).toFixed(2));
    btn.style.setProperty('--glow', isle.palette[2]);
    btn.innerHTML = `
      <span class="isle-float" style="--drift:${(8 + hash01(isle.id, 5) * 5).toFixed(1)}s;--delay:-${(hash01(isle.id, 9) * 6).toFixed(1)}s">
        <span class="isle-art">${islandSVG(isle)}</span>
      </span>
      <span class="isle-tag"><b>${isle.title}</b><i>${kindLabel(isle)}</i></span>
      <span class="isle-peek">${isle.hook}</span>`;
    btn.addEventListener('click', () => openPanel(isle.id, btn));
    if (!coarse && !reduced) {
      btn.addEventListener('pointermove', (ev) => {
        const r = btn.getBoundingClientRect();
        const art = btn.querySelector('.isle-art');
        art.style.setProperty('--ry', `${(((ev.clientX - r.left) / r.width) - 0.5) * 14}deg`);
        art.style.setProperty('--rx', `${(0.5 - ((ev.clientY - r.top) / r.height)) * 10}deg`);
      });
      btn.addEventListener('pointerleave', () => {
        const art = btn.querySelector('.isle-art');
        art.style.removeProperty('--rx');
        art.style.removeProperty('--ry');
      });
    }
    field.append(btn);
    isleEls.set(isle.id, btn);
  }
  sec.append(field);
  worldEl.append(sec);
  regionEls.push({ sec, field });
});

/* Constellation lines between neighbouring islands, redrawn when the layout changes. */
function drawLines() {
  for (const { field } of regionEls) {
    /* Layout positions, not screen ones: the islands drift and lean, the lines stay put. */
    const svg = field.querySelector('.lines');
    const box = { width: field.offsetWidth, height: field.offsetHeight };
    const pts = [...field.querySelectorAll('.isle')].map((b) => [b.offsetLeft + b.offsetWidth / 2, b.offsetTop + b.offsetWidth * 0.42]);
    let d = '';
    pts.forEach(([x, y], i) => { d += `${i ? 'L' : 'M'}${x.toFixed(0)},${y.toFixed(0)} `; });
    svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`);
    svg.innerHTML = `<path d="${d}"/>${pts.map(([x, y]) => `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="1.6"/>`).join('')}`;
  }
}
new ResizeObserver(() => requestAnimationFrame(drawLines)).observe(worldEl);

/* Scrolling carries you towards each region: its islands come up out of the
   distance as it reaches the middle of the screen. One read of the layout per
   frame, and only while something is moving. */
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const vh = innerHeight;
    for (const { sec, field } of regionEls) {
      const r = sec.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      const centre = r.top + Math.min(r.height, vh) * 0.45;
      const near = reduced ? 1 : Math.max(0, Math.min(1, 1 - (centre - vh * 0.5) / (vh * 0.75)));
      field.style.setProperty('--near', near.toFixed(3));
    }
    $('.corner').classList.toggle('solid', scrollY > innerHeight * 0.6);
    const b = $('#builder').getBoundingClientRect();
    $('.corner').classList.toggle('paper', b.top < 60 && b.bottom > 60);
  });
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* Islands off screen stop moving, so a page of thirty-five living things costs
   only what is in view. */
const still = new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    const on = isIntersecting && !reduced;
    target.classList.toggle('still', !on);
    for (const svg of target.querySelectorAll('svg')) { if (on) svg.unpauseAnimations?.(); else svg.pauseAnimations?.(); }
  }
}, { rootMargin: '120px' });
regionEls.forEach(({ sec }) => still.observe(sec));

/* ── 03 the project panel ───────────────────────────────────────────────── */

const panel = $('#panel');
const order = ISLANDS.map((i) => i.id);
let current = null;
let opener = null;

function originOf(from) {
  if (!from) return { x: innerWidth / 2, y: innerHeight / 2 };
  if (from instanceof Element) {
    const r = from.querySelector('.isle-art')?.getBoundingClientRect() ?? from.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return from;
}

function fill(isle) {
  panel.style.setProperty('--glow', isle.palette[2]);
  $('.panel-art', panel).innerHTML = islandSVG(isle, { label: `${isle.title}, drawn as a floating island`, uid: 'panel' });
  $('.panel-world', panel).textContent = isle.world;
  $('.panel-kind', panel).textContent = `${kindLabel(isle)} · ${REGIONS.find((r) => r.id === isle.region).name}`;
  $('#panel-title').textContent = isle.title;
  $('.panel-blurb', panel).textContent = isle.blurb;

  const actions = $('.panel-actions', panel);
  actions.innerHTML = '';
  const note = $('.panel-note', panel);
  note.hidden = true;
  if (isle.href) {
    actions.append(el('a', { class: 'btn primary', href: link(isle.href) }, `Launch ${isle.title} <span class="arrow" aria-hidden="true">&rarr;</span>`));
  } else {
    const a = el('a', { class: 'btn primary', href: '#builder' }, 'Read how it was built <span class="arrow" aria-hidden="true">&darr;</span>');
    a.addEventListener('click', () => closePanel());
    actions.append(a);
    note.hidden = false;
    note.textContent = 'Tally is a Python service rather than a page, so it runs on a server. It deploys in one step (render.yaml), and then this button launches it.';
  }
  const study = isle.study || isle.source;
  if (study) actions.append(el('a', { class: 'btn', href: study, rel: 'noopener' }, isle.study ? 'Engineering case study' : 'Read the source'));

  const shot = $('.panel-shot img', panel);
  shot.src = `shots/${isle.shot ?? `${isle.id}.jpg`}`;
  shot.alt = `${isle.title} as it first opens.`;
  $('.panel-shot figcaption', panel).textContent = isle.id === 'tally'
    ? 'Tally’s audit view: 23 findings across eight suppliers.'
    : `${isle.title}, as it opens.`;

  $('[data-fact="problem"]', panel).textContent = isle.problem;
  $('[data-fact="try"]', panel).textContent = isle.hook;
  $('[data-fact="tech"]', panel).innerHTML = `<ul class="chips">${isle.tech.map((t) => `<li>${t}</li>`).join('')}</ul>`;
  const ev = $('[data-fact="evidence"]', panel);
  ev.textContent = `${isle.evidence} `;
  if (isle.tests) ev.append(el('a', { href: isle.tests, rel: 'noopener' }, 'Read its tests'));

  const i = order.indexOf(isle.id);
  const prev = islandById.get(order[(i - 1 + order.length) % order.length]);
  const next = islandById.get(order[(i + 1) % order.length]);
  $('[data-nav="prev"]', panel).textContent = `← ${prev.title}`;
  $('[data-nav="prev"]', panel).dataset.to = prev.id;
  $('[data-nav="next"]', panel).textContent = `${next.title} →`;
  $('[data-nav="next"]', panel).dataset.to = next.id;
  $('.panel-body', panel).scrollTop = 0;
  panel.scrollTop = 0;
  if (reduced) for (const svg of panel.querySelectorAll('svg')) svg.pauseAnimations?.();
}

function openPanel(id, from, { push = true } = {}) {
  const isle = islandById.get(id);
  if (!isle) return;
  const fresh = !panel.open;
  if (fresh) opener = from instanceof Element ? from : document.activeElement?.closest?.('button, a') ?? $('#enterPortal');
  current = id;
  fill(isle);
  if (fresh) {
    const o = originOf(from);
    panel.showModal();
    const box = panel.getBoundingClientRect();
    panel.style.setProperty('--ox', `${o.x - box.left}px`);
    panel.style.setProperty('--oy', `${o.y - box.top}px`);
    panel.classList.remove('closing');
    if (!reduced) {
      panel.classList.add('opening');
      panel.addEventListener('animationend', () => panel.classList.remove('opening'), { once: true });
    }
    $('.panel-close', panel).focus({ preventScroll: true });
  }
  if (push) history[fresh ? 'pushState' : 'replaceState']({ isle: id }, '', `#isle/${id}`);
}

function closePanel({ fromHistory = false } = {}) {
  if (!panel.open) return;
  const done = () => {
    panel.classList.remove('closing');
    panel.close();
    current = null;
    opener?.focus({ preventScroll: true });
    opener = null;
  };
  if (!fromHistory && location.hash.startsWith('#isle/')) history.replaceState(null, '', location.pathname + location.search);
  if (reduced) return done();
  panel.classList.add('closing');
  setTimeout(done, 300);
}

panel.addEventListener('cancel', (ev) => { ev.preventDefault(); closePanel(); });
panel.addEventListener('click', (ev) => { if (ev.target === panel) closePanel(); });
$('.panel-close', panel).addEventListener('click', () => closePanel());
panel.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => openPanel(b.dataset.to, null)));
panel.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, textarea')) return;
  if (ev.key === 'ArrowRight') $('[data-nav="next"]', panel).click();
  if (ev.key === 'ArrowLeft') $('[data-nav="prev"]', panel).click();
});

function fromHash() {
  const m = location.hash.match(/^#isle\/([a-z0-9-]+)$/);
  if (m && islandById.has(m[1])) openPanel(m[1], isleEls.get(m[1]), { push: false });
  else if (panel.open) closePanel({ fromHistory: true });
}
addEventListener('popstate', fromHash);
fromHash();

/* ── the guide ──────────────────────────────────────────────────────────── */

const index = buildIndex(SEARCHABLE, KINDS);
const guide = $('#guide');
const card = $('.guide-card', guide);
const orb = $('.guide-orb', guide);
const input = $('#guide-q');
const results = $('.guide-results', guide);

orb.addEventListener('click', () => {
  const open = card.hidden;
  card.hidden = !open;
  orb.setAttribute('aria-expanded', String(open));
  if (open) input.focus();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !card.hidden && !panel.open) { card.hidden = true; orb.setAttribute('aria-expanded', 'false'); orb.focus(); }
});
document.addEventListener('pointerdown', (ev) => {
  if (!card.hidden && !guide.contains(ev.target)) { card.hidden = true; orb.setAttribute('aria-expanded', 'false'); }
});

function ask(q) {
  const hits = search(q, index, { limit: 3 });
  results.innerHTML = '';
  for (const hit of hits) {
    const isle = islandById.get(hit.entry.id);
    const b = el('button', { type: 'button' }, `<b>${isle.title}</b><span>${isle.hook} <em>(${explain(hit, q)})</em></span>`);
    b.addEventListener('click', () => { card.hidden = true; openPanel(isle.id, isleEls.get(isle.id)); });
    const li = el('li');
    li.append(b);
    results.append(li);
  }
  light(hits.map((h) => h.entry.id));
  $('#guide-show').hidden = hits.length === 0;
}

/* The chosen islands glow and stay open until the guide is asked something else. */
let lightTimer = 0;
function light(ids) {
  for (const b of isleEls.values()) b.classList.remove('chosen');
  for (const id of ids) isleEls.get(id)?.classList.add('chosen');
  clearTimeout(lightTimer);
  lightTimer = setTimeout(() => { for (const b of isleEls.values()) b.classList.remove('chosen'); }, 12000);
}

$('form', guide).addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (input.value.trim()) ask(input.value.trim());
});
guide.querySelectorAll('.guide-chips button').forEach((b) => b.addEventListener('click', () => { input.value = b.textContent; ask(b.textContent); }));
$('#guide-show').addEventListener('click', () => {
  const first = [...isleEls.values()].find((b) => b.classList.contains('chosen'));
  if (!first) return;
  card.hidden = true;
  first.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  first.focus({ preventScroll: true });
});

export { openPanel, closePanel };

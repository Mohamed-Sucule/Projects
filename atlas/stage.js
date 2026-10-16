/* atlas/stage.js — the worlds: a flight past thirty-five islands, and stepping into one.

   The islands sit at depths along the camera's path, in lanes either side of it.
   The page's own scroll position is the camera, so travelling is ordinary
   scrolling: the back button, the keyboard, a screen reader's "next button" and
   a scroll-wheel all just work, and nothing takes the wheel away from anyone.
   Each frame projects every island (35 transforms, nothing else) with a simple
   perspective: further means smaller, closer to the middle, and fainter.

   Choosing an island flies it to a focal point while the rest fall back and
   blur, its environment rises around it (fx.js), the sky takes on its colour,
   and the product panel gathers itself out of fragments of the island. Closing
   folds the panel away and puts everything back. Each of those is interruptible
   and has a real URL (#world/<id>), so a choice can be linked, shared and undone
   with the browser's back button. */

import { KINDS } from '../shared/atlas.js';
import { ISLANDS, REGIONS, islandById, TALLY_URL } from './worlds.js';
import { islandSVG } from './islands.js';

/* Each region has its own weather in the world beyond: the archipelago at dawn,
   the observatory under stars and an aurora, the night isles dark with lamps on
   the cloud, the reef at sunset, the shallows gone still as a mirror, and the
   engine rooms with a drafting grid laid across the cloud.
   env: stars, grid, water, aurora, night, warmth, lamps, (spare) */
const ENVS = {
  products: { tint: [1, 1, 1], env: [0, 0, 0, 0, 0, 0.15, 0, 0] },
  models: { tint: [0.8, 0.9, 1.15], env: [0.9, 0, 0, 0.85, 0.62, 0, 0, 0] },
  stories: { tint: [0.62, 0.64, 0.92], env: [1, 0, 0, 0.12, 1, 0, 1, 0] },
  games: { tint: [1.1, 0.82, 0.98], env: [0, 0, 0, 0, 0, 1, 0, 0] },
  workshop: { tint: [1.08, 1.0, 0.88], env: [0, 0, 1, 0, 0.05, 0.3, 0, 0] },
  engines: { tint: [0.8, 1.04, 1.06], env: [0.25, 1, 0, 0, 0.38, 0, 0, 0] },
};
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const LANES = [-0.34, 0.3, -0.1, 0.36, -0.26, 0.14, -0.4, 0.22];
const DZ = 1;
const GAP = 1.4;
const NEAR = 1.6;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const hash = (s, k = 0) => { let h = 2166136261 ^ k; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000; };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const kindLabel = (i) => (i.id === 'tally' ? 'AI product · Python service' : `${KINDS[i.kind]?.label ?? i.kind} · ${i.minutes} min`);

export function createStage({ sky, fx, reduced, coarse, onFocusChange = () => {} }) {
  const field = document.querySelector('.field');
  const stage = document.querySelector('.stage');
  const layer = document.querySelector('.isles');
  const preview = document.querySelector('.preview');
  const regionTitle = document.querySelector('.region-title');
  const regionsNav = document.querySelector('.regions');
  const reveal = document.getElementById('reveal');

  /* ── placing the islands ──────────────────────────────────────────── */
  const order = REGIONS.flatMap((r) => ISLANDS.filter((i) => i.region === r.id));
  const items = order.map((isle, n) => {
    const ri = REGIONS.findIndex((r) => r.id === isle.region);
    const z = n * DZ + ri * GAP + 1;
    const lane = LANES[n % LANES.length] + (hash(isle.id) - 0.5) * 0.06;
    const y = (hash(isle.id, 3) - 0.5) * 0.16 + (isle.size === 'lg' ? -0.03 : 0.03);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `isle ${isle.size}`;
    btn.dataset.id = isle.id;
    btn.dataset.region = isle.region;
    btn.style.setProperty('--glow', isle.palette[2]);
    btn.setAttribute('aria-label', `${isle.title}. ${isle.blurb} Opens its world.`);
    btn.innerHTML = `<span class="isle-body"><span class="isle-art">${islandSVG(isle)}</span></span><span class="isle-name">${isle.title}</span>`;
    layer.append(btn);
    return { isle, btn, z, lane, y, ri, sel: 0, cur: null, visible: true };
  });
  const byId = new Map(items.map((it) => [it.isle.id, it]));
  const zMax = items[items.length - 1].z - NEAR + 0.4;
  /* about a fifth of a screen of scrolling per island */
  field.style.setProperty('--field-h', `${Math.round((zMax / DZ) * 20 + 100)}vh`);

  /* region markers on the right edge */
  REGIONS.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span>${r.name}</span>`;
    b.setAttribute('aria-label', `Travel to ${r.name}`);
    b.addEventListener('click', () => travelTo(items.find((it) => it.ri === i).isle.id));
    regionsNav.append(b);
  });

  /* ── the camera ───────────────────────────────────────────────────── */
  let W = innerWidth, H = innerHeight;
  let progress = 0;
  let focusAmt = 0, focusFrom = 0, focusTo = 0, focusStart = 0;
  let selected = null;
  let raf = 0;
  let regionShown = -1;

  /* What the stage is doing. A click that arrives in the middle of a transition is
     dropped rather than stacked, so a world cannot be opened twice while it is
     still arriving, and a second Back cannot fire while the first is leaving.
       field → entering → world ⇄ live → leaving → field */
  let state = 'field';
  let stateTimer = 0;
  function to(next, after, ms) {
    clearTimeout(stateTimer);
    state = next;
    if (after) stateTimer = setTimeout(() => { state = after; }, reduced ? 0 : ms);
  }

  /* The worlds visited in this sitting light their block on the ring's dial. Kept
     for this tab only, in session storage, and only as a convenience. */
  const seen = new Set();
  try { for (const id of JSON.parse(sessionStorage.getItem('atlas-seen') || '[]')) seen.add(id); } catch { /* private mode */ }
  function seenMask() {
    let lo = 0, hi = 0;
    order.forEach((isle, i) => { if (seen.has(isle.id)) { if (i < 18) lo += 2 ** i; else hi += 2 ** (i - 18); } });
    return [lo, hi];
  }
  function markSeen(id) {
    seen.add(id);
    try { sessionStorage.setItem('atlas-seen', JSON.stringify([...seen])); } catch { /* fine without */ }
    sky?.set({ seen: seenMask() });
  }
  sky?.set({ seen: seenMask() });

  function fieldBox() {
    const top = field.getBoundingClientRect().top + scrollY;
    return { top, len: Math.max(1, field.offsetHeight - H) };
  }
  function readScroll() {
    const { top, len } = fieldBox();
    progress = Math.max(0, Math.min(1, (scrollY - top) / len));
    return progress;
  }
  function scrollFor(id) {
    const it = byId.get(id);
    const cz = Math.max(0, Math.min(zMax, it.z - NEAR));
    const { top, len } = fieldBox();
    return top + (cz / zMax) * len;
  }

  function focalPoint() {
    const narrow = W < 760;
    return narrow ? { x: W * 0.5, y: H * 0.15, w: Math.min(W * 0.56, 300) } : { x: W * 0.27, y: H * 0.5, w: Math.min(W * 0.34, 520) };
  }

  function baseWidth(isle) {
    const k = W < 760 ? Math.max(0.62, Math.min(1, W / 480)) * 0.9 : Math.max(0.65, Math.min(1.15, W / 1440));
    return (isle.size === 'lg' ? 400 : isle.size === 'md' ? 320 : 260) * k;
  }

  function project(it, cz) {
    const r = it.z - cz;
    const s = 1.6 / (Math.max(r, -0.5) + 0.9);
    const lanes = W < 760 ? 0.72 : 1;
    const x = W / 2 + it.lane * lanes * W * s * 0.72;
    const y = H * 0.54 + it.y * H * s + (s - 0.6) * H * 0.07;
    let a = 1;
    if (r > 4.2) a = Math.max(0, 1 - (r - 4.2) / 1.3);
    /* gone before it reaches the lens: a passing island fades while it is still in focus */
    if (r < 0.55) a = Math.max(0, (r - 0.05) / 0.5) ** 1.4;
    return { x, y, s, a, r };
  }

  let lastNow = 0;
  function update(now = performance.now()) {
    raf = 0;
    /* easing per 60th of a second, so a slow device arrives as quickly as a fast one */
    const dt = lastNow ? Math.min(6, (now - lastNow) / 16.7) : 1;
    lastNow = now;
    const follow = reduced ? 1 : 1 - Math.pow(1 - 0.14, dt);
    W = innerWidth;
    H = innerHeight;
    if (focusAmt !== focusTo) {
      const u = reduced ? 1 : Math.min(1, (now - focusStart) / 720);
      focusAmt = focusFrom + (focusTo - focusFrom) * ease(u);
      if (u >= 1) focusAmt = focusTo;
    }
    const cz = progress * zMax;
    const F = focalPoint();
    let nearest = null;
    for (const it of items) {
      const w = baseWidth(it.isle);
      const pr = project(it, cz);
      const target = it.isle.id === selected ? 1 : 0;
      it.sel += (target - it.sel) * follow;
      if (Math.abs(target - it.sel) < 0.002) it.sel = target;
      let x = pr.x, y = pr.y, s = pr.s, a = pr.a;
      if (it.sel > 0) {
        /* fly to the focal point; if it was out of view, come in from its own depth */
        const from = it.sel < 1 && pr.a < 0.05 ? project(it, it.z - 3) : pr;
        const fs = F.w / w;
        x = from.x + (F.x - from.x) * it.sel;
        y = from.y + (F.y - from.y) * it.sel;
        s = from.s + (fs - from.s) * it.sel;
        a = Math.max(from.a, it.sel);
      }
      const recede = focusAmt * (1 - it.sel);
      if (recede > 0) {
        s *= 1 - 0.35 * recede;
        x += (x - F.x) * 0.3 * recede;
        a *= 1 - 0.75 * recede;
      }
      const vis = a > 0.01;
      if (vis !== it.visible) {
        it.visible = vis;
        it.btn.style.pointerEvents = vis ? '' : 'none';
        it.btn.classList.toggle('still', !vis);
        for (const svg of it.btn.querySelectorAll('svg')) { if (vis && !reduced) svg.unpauseAnimations?.(); else svg.pauseAnimations?.(); }
      }
      it.btn.style.width = `${w}px`;
      it.btn.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px, ${(y - w * 0.45).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      it.btn.style.opacity = a.toFixed(3);
      it.btn.style.zIndex = String(it.sel > 0 ? 990 : Math.round(900 - pr.r * 100));
      it.btn.classList.toggle('named', s > 0.5 && a > 0.4);
      it.cur = { x, y, s, w, a, r: pr.r };
      if (pr.r > 0.8 && pr.a > 0.6 && (!nearest || pr.r < nearest.r)) nearest = { ...pr, it };
    }
    /* the threads between neighbours in the same region, from cap to cap */
    const cap = (c) => ({ x: c.x, y: c.y - 0.067 * c.w + 7 + (0.096 * c.w - 7) * c.s });
    const threads = [];
    const shown = parseFloat(stage.style.opacity || '1');
    if (focusAmt < 0.99 && shown > 0.02) {
      for (let i = 1; i < items.length; i++) {
        const A = items[i - 1], B = items[i];
        if (A.ri !== B.ri || !A.cur || !B.cur || A.cur.r < 0.5 || B.cur.r < 0.5) continue;
        const al = Math.min(A.cur.a, B.cur.a) * (1 - focusAmt) * shown;
        if (al > 0.03) threads.push({ a: cap(A.cur), b: cap(B.cur), style: REGIONS[A.ri].id, alpha: al });
      }
    }
    fx.links(threads);
    if (selected) {
      fx.moveFocal({ x: F.x, y: F.y, r: F.w * 0.5 });
      /* a shaft of the island's own light falls on it from the world above */
      sky?.set({ focus: [(F.x - W / 2) / H, (H / 2 - (F.y - F.w * 0.12)) / H, 1] });
    }
    /* which region we are in, and its colour in the sky */
    const ri = nearest ? nearest.it.ri : items[items.length - 1].ri;
    if (ri !== regionShown) showRegion(ri);
    let still = Math.abs(focusAmt - focusTo) > 0 || items.some((it) => it.sel !== (it.isle.id === selected ? 1 : 0));
    if (hot) placePreview(hot);
    if (still) kick(); else lastNow = 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(update); }

  function showRegion(ri) {
    regionShown = ri;
    const r = REGIONS[ri];
    sky?.set({ tint: ENVS[r.id].tint, env: ENVS[r.id].env });
    [...regionsNav.children].forEach((b, i) => b.setAttribute('aria-current', String(i === ri)));
    const apply = () => {
      regionTitle.querySelector('.n').textContent = ROMAN[ri];
      regionTitle.querySelector('h3').textContent = r.name;
      regionTitle.querySelector('.line').textContent = r.line;
      regionTitle.classList.remove('swap');
    };
    if (reduced) return apply();
    regionTitle.classList.add('swap');
    setTimeout(apply, 260);
  }

  /* ── hovering: an island rises, its fragments lift, a preview appears ─ */
  let hot = null;
  function placePreview(it) {
    const c = it.cur;
    if (!c) return;
    const half = (c.w * c.s) / 2;
    const right = c.x + half + 270 < W;
    preview.style.left = `${Math.round(right ? c.x + half * 0.8 : c.x - half * 0.8 - 250)}px`;
    preview.style.top = `${Math.round(Math.max(70, Math.min(H - 190, c.y - 60)))}px`;
  }
  function showPreview(it) {
    if (selected) return;
    hot = it;
    for (const o of items) o.btn.classList.toggle('hot', o === it && coarse);
    preview.querySelector('.pv-kind').textContent = kindLabel(it.isle);
    preview.querySelector('.pv-title').textContent = it.isle.title;
    preview.querySelector('.pv-hook').textContent = it.isle.hook;
    preview.querySelector('.pv-cta').textContent = coarse ? 'Tap again to enter →' : 'Enter this world →';
    preview.hidden = false;
    placePreview(it);
    requestAnimationFrame(() => { if (hot === it && !selected) preview.classList.add('on'); });
  }
  function hidePreview(it) {
    if (it && hot !== it) return;
    hot = null;
    preview.classList.remove('on');
    for (const o of items) o.btn.classList.remove('hot');
  }

  for (const it of items) {
    const { btn } = it;
    btn.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') showPreview(it); });
    btn.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hidePreview(it); });
    btn.addEventListener('pointerdown', () => { it.pressed = performance.now(); });
    btn.addEventListener('focus', () => {
      /* focus that comes from a tap is not a keyboard visit: leave the tap logic to the click */
      if (selected || performance.now() - (it.pressed || 0) < 600) return;
      /* a keyboard user who tabs to an island far away is carried to it */
      if (!it.cur || it.cur.a < 0.6 || it.cur.r < 0.8 || it.cur.r > 3.2) scrollTo({ top: scrollFor(it.isle.id), behavior: reduced ? 'auto' : 'smooth' });
      showPreview(it);
    });
    btn.addEventListener('blur', () => hidePreview(it));
    btn.addEventListener('click', () => {
      if (selected) return;
      if (coarse && hot !== it) { showPreview(it); return; }
      select(it.isle.id, { from: 'island' });
    });
  }

  /* ── choosing a world ─────────────────────────────────────────────── */
  let pushed = false;
  let lastFocus = null;
  let savedScroll = 0;

  function setFocus(on) {
    focusFrom = focusAmt;
    focusTo = on ? 1 : 0;
    focusStart = performance.now();
    kick();
  }

  function select(id, { from = 'other', push = true } = {}) {
    const it = byId.get(id);
    if (!it || state === 'entering' || state === 'leaving') return;
    if (state === 'live') closeTheatre({ quiet: true });
    const switching = !!selected;
    if (!switching) {
      lastFocus = it.btn;
      savedScroll = scrollY;
      document.body.classList.add('locked');
    }
    hidePreview();
    selected = id;
    stage.classList.add('focused');
    for (const o of items) o.btn.classList.toggle('selected', o === it);
    setFocus(true);
    const F = focalPoint();
    fx.focus(it.isle, { x: F.x, y: F.y, r: F.w * 0.5 });
    sky?.set({ accent: hex(it.isle.palette[2]), accentAmt: 1 });
    fill(it.isle);
    reveal.hidden = false;
    reveal.classList.remove('fold', 'enter');
    void reveal.offsetWidth;
    reveal.classList.add('enter');
    const rect = reveal.getBoundingClientRect();
    const c = it.cur ?? { x: W / 2, y: H / 2 };
    fx.assemble({ x: c.x, y: c.y }, rect, it.isle.palette);
    reveal.querySelector('.back').focus({ preventScroll: true });
    /* One history entry per visit, so Back closes the world. Arriving by a link
       that already names it (a deep link, or Forward) adds none: Back from there
       would land on the same world and open it again. */
    if (push && location.hash !== `#world/${id}` && location.hash !== `#world/${id}/live`) {
      if (!pushed && !switching) { history.pushState({ world: id }, '', `#world/${id}`); pushed = true; }
      else history.replaceState({ world: id }, '', `#world/${id}`);
    }
    markSeen(id);
    to('entering', 'world', 720);
    onFocusChange(it.isle);
    kick();
  }

  function close({ fromHistory = false } = {}) {
    if (!selected || state === 'leaving') return;
    if (state === 'live') closeTheatre({ quiet: true });
    to('leaving', 'field', 420);
    const done = () => {
      reveal.hidden = true;
      reveal.classList.remove('fold', 'enter');
      unloadLive();
    };
    selected = null;
    stage.classList.remove('focused');
    for (const o of items) o.btn.classList.remove('selected');
    setFocus(false);
    fx.unfocus();
    sky?.set({ accentAmt: 0, focus: [0, 0, 0] });
    document.body.classList.remove('locked');
    scrollTo({ top: savedScroll, behavior: 'auto' });
    if (reduced) done();
    else { reveal.classList.add('fold'); setTimeout(done, 420); }
    if (!fromHistory) {
      if (pushed) { pushed = false; history.back(); }
      else if (location.hash.startsWith('#world/')) history.replaceState(null, '', location.pathname + location.search);
    } else pushed = false;
    lastFocus?.focus({ preventScroll: true });
    onFocusChange(null);
    kick();
  }

  /* Go to an island from anywhere (the index, the guide, a link): move the camera
     to it first, so that closing the panel leaves you somewhere sensible. */
  function travelTo(id, { open = false } = {}) {
    const top = scrollFor(id);
    if (open) {
      scrollTo({ top, behavior: 'auto' });
      readScroll();
      update();
      select(id);
    } else {
      scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
      setTimeout(() => byId.get(id)?.btn.focus({ preventScroll: true }), reduced ? 0 : 700);
    }
  }

  /* ── the product panel ───────────────────────────────────────────── */
  function launchHref(isle) {
    if (isle.id === 'tally') return TALLY_URL;
    return `../${isle.href}`;
  }
  function el(tag, attrs = {}, text = '') {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    if (text) n.textContent = text;
    return n;
  }
  function fill(isle) {
    const q = (s) => reveal.querySelector(s);
    reveal.style.setProperty('--glow', isle.palette[2]);
    q('.rv-kind').textContent = `${kindLabel(isle)} · ${REGIONS.find((r) => r.id === isle.region).name}`;
    q('.rv-title').textContent = isle.title;
    q('.rv-blurb').textContent = isle.blurb;
    const actions = q('.rv-actions');
    actions.replaceChildren();
    const launch = launchHref(isle);
    if (launch) actions.append(el('a', { class: 'btn primary', href: launch }, `Launch ${isle.title} →`));
    if (isle.study) actions.append(el('a', { class: 'btn', href: isle.study, rel: 'noopener' }, 'Case study'));
    const src = isle.source ?? (isle.study ? isle.study.replace('/blob/main/', '/tree/main/').replace(/\/README\.md$/, '') : null);
    if (src) actions.append(el('a', { class: 'btn', href: src, rel: 'noopener' }, 'Source'));
    actions.append(el('a', { class: 'btn', href: `projects/${isle.id}/` }, 'Details page'));
    const note = q('.rv-note');
    note.hidden = !!launch;
    note.textContent = launch ? '' : 'Tally is a Python service rather than a page, so it runs on a server. It deploys in one step from render.yaml; until it is deployed, the case study and the source are the way in. The About section below walks through how it was built.';
    unloadLive();
    const img = q('.rv-frame img');
    img.src = `shots/${isle.shot ?? `${isle.id}.jpg`}`;
    img.alt = `${isle.title} as it first opens.`;
    q('.rv-preview figcaption').textContent = launch
      ? `A screenshot of ${isle.title} as it opens. “Try it here” runs the real app inside this panel.`
      : 'A screenshot of Tally’s audit view.';
    q('.try').hidden = !launch;
    q('.rv-problem').textContent = isle.problem;
    q('.rv-features').replaceChildren(...isle.features.map((f) => el('li', {}, f)));
    q('.rv-dtitle').textContent = isle.decision[0];
    q('.rv-dtext').textContent = isle.decision[1];
    q('.rv-tech').replaceChildren(...isle.tech.map((t) => el('li', {}, t)));
    const ai = q('.rv-ai');
    ai.hidden = !isle.ai;
    if (isle.ai) {
      for (const key of ['model', 'code', 'guards', 'limits']) q(`.rv-${key}`).replaceChildren(...isle.ai[key].map((t) => el('li', {}, t)));
    }
    const ev = q('.rv-evidence');
    ev.textContent = `${isle.evidence} `;
    if (isle.tests) ev.append(el('a', { href: isle.tests, rel: 'noopener' }, 'Read its tests'));
    const n = ISLANDS.indexOf(isle);
    const prev = order[(order.indexOf(isle) - 1 + order.length) % order.length];
    const next = order[(order.indexOf(isle) + 1) % order.length];
    void n;
    const [pb, nb] = reveal.querySelectorAll('.rv-nav button');
    pb.textContent = `← ${prev.title}`;
    pb.dataset.to = prev.id;
    nb.textContent = `${next.title} →`;
    nb.dataset.to = next.id;
    [...q('.rv-scroll').children].forEach((c, i) => c.style.setProperty('--i', i));
    q('.rv-scroll').scrollTop = 0;
  }

  /* ── the world becomes software ─────────────────────────────────────
     "Try it here" lifts the screenshot out of the panel and opens it into the
     whole screen, and the real app is running in it: the scenery dims to a
     backdrop and gets out of the way. It has its own address (#world/<id>/live),
     so Back and Esc both return to the world. */
  const theatre = document.getElementById('theatre');
  const thPanel = theatre.querySelector('.th-panel');
  let live = null;
  let livePushed = false;
  function unloadLive() {
    live?.remove();
    live = null;
  }
  function shotRect() {
    return reveal.querySelector('.rv-frame img').getBoundingClientRect();
  }
  function flipFrom(rect) {
    const to = thPanel.getBoundingClientRect();
    const sx = rect.width / to.width, sy = rect.height / to.height;
    thPanel.style.transform = `translate(${rect.left - to.left}px, ${rect.top - to.top}px) scale(${sx}, ${sy})`;
  }
  function openTheatre({ push = true } = {}) {
    const isle = islandById.get(selected);
    if (!isle || state === 'live' || state === 'leaving') return;
    const href = launchHref(isle);
    if (!href) return;
    to('live');
    theatre.querySelector('.th-title').textContent = `${isle.title}, running live`;
    theatre.querySelector('.th-open').href = href;
    theatre.style.setProperty('--glow', isle.palette[2]);
    /* the apps are this site's own pages, so the frame gives them what a direct visit would:
       Tuner and Front Desk can still ask for the microphone, through the browser's own prompt */
    live = el('iframe', { src: href, title: `${isle.title}, running live`, loading: 'eager' });
    theatre.querySelector('.th-frame').replaceChildren(live);
    const from = shotRect();
    theatre.hidden = false;
    document.body.classList.add('in-live');
    if (!reduced) {
      theatre.classList.remove('open');
      thPanel.style.transition = 'none';
      flipFrom(from);
      void thPanel.offsetWidth;
      thPanel.style.transition = '';
      fx.dissolve(from, isle.palette, 520);
    }
    requestAnimationFrame(() => { theatre.classList.add('open'); thPanel.style.transform = ''; });
    theatre.querySelector('.th-back').focus({ preventScroll: true });
    if (push && !location.hash.endsWith('/live')) {
      history.pushState({ world: isle.id, live: true }, '', `#world/${isle.id}/live`);
      livePushed = true;
    }
  }
  function closeTheatre({ fromHistory = false, quiet = false } = {}) {
    if (state !== 'live') return;
    to('world');
    document.body.classList.remove('in-live');
    const done = () => { theatre.hidden = true; theatre.classList.remove('open'); thPanel.style.transform = ''; unloadLive(); };
    if (reduced || quiet) done();
    else {
      theatre.classList.remove('open');
      flipFrom(shotRect());
      setTimeout(done, 460);
    }
    if (!fromHistory && !quiet) {
      if (livePushed) { livePushed = false; history.back(); }
      else if (location.hash.endsWith('/live')) history.replaceState({ world: selected }, '', `#world/${selected}`);
    } else if (fromHistory) livePushed = false;
    else if (quiet && location.hash.endsWith('/live')) { livePushed = false; history.replaceState({ world: selected }, '', `#world/${selected}`); }
    if (!quiet) reveal.querySelector('.try').focus({ preventScroll: true });
  }
  reveal.querySelector('.try').addEventListener('click', () => openTheatre());
  theatre.querySelector('.th-back').addEventListener('click', () => closeTheatre());

  reveal.querySelector('.back').addEventListener('click', () => close());
  reveal.querySelectorAll('.rv-nav button').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.to;
    const top = scrollFor(id);
    savedScroll = top;
    select(id, { push: true });
  }));
  document.addEventListener('keydown', (e) => {
    if (!selected || document.querySelector('.index-drawer:not([hidden])')) return;
    if (e.key === 'Escape' && state === 'live') { e.preventDefault(); closeTheatre(); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (state === 'live') return;
    if (e.target.closest?.('input, textarea, iframe')) return;
    if (e.key === 'ArrowRight') reveal.querySelectorAll('.rv-nav button')[1].click();
    if (e.key === 'ArrowLeft') reveal.querySelectorAll('.rv-nav button')[0].click();
  });

  function route() {
    const m = location.hash.match(/^#world\/([a-z0-9-]+)(\/live)?$/);
    if (m && byId.has(m[1])) {
      if (selected !== m[1]) {
        if (state === 'live') closeTheatre({ fromHistory: true, quiet: true });
        travelTo(m[1], { open: true });
        if (m[2]) { clearTimeout(stateTimer); state = 'world'; openTheatre({ push: false }); }
      } else if (m[2] && state !== 'live') openTheatre({ push: false });
      else if (!m[2] && state === 'live') closeTheatre({ fromHistory: true });
    } else if (selected) close({ fromHistory: true });
  }
  addEventListener('popstate', route);

  addEventListener('resize', () => { W = innerWidth; H = innerHeight; kick(); });

  return {
    onScroll() { if (selected) return; readScroll(); kick(); },
    progress: () => progress,
    route,
    travelTo,
    select: (id) => travelTo(id, { open: true }),
    selected: () => selected,
    state: () => state,
    seenCount: () => seen.size,
    wasSeen: (id) => seen.has(id),
    /* the worlds in the order the dial shows them, clockwise from the top */
    order: () => order.map((i) => i.id),
    light(ids) {
      for (const it of items) it.btn.classList.toggle('chosen', ids.includes(it.isle.id));
    },
    visibleCount: () => items.filter((it) => it.visible).length,
    regionOf: () => regionShown,
    update: kick,
  };
}

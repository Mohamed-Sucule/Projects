/* assets/night.js — the front page's evening.

   Each scene on the page has an hour (data-at, in minutes after 17:30) and the
   sky has a look for each of those hours. The scroll position is turned into a
   time between two scenes, and the sky, the sun, the moon, the stars and the
   rain are set from that time. The clock in the corner says what time it is,
   and the index marks where you are.

   A flock of starlings keeps the same hours (flock.js): it swirls over the
   sunset, comes down as the evening goes on, some of it onto the wire along
   the bottom of the screen, and leaves at first light. The index is that
   wire: each hour is a bird on it, and the one you pick flies to its scene.

   Motion is on unless the visitor has asked for less, and the button in the
   top bar turns it off and on again: off, the stars stop twinkling, the rain
   stops falling, the birds keep still and the recordings show their first
   frame. The sky and the flock still follow the scroll bar, because that is
   reading, not animation.

   Three of the projects take over the night for a moment as you reach them
   (takeover.js): the dark closes in on Ember, a city's streets draw across the
   sky at Your Place, and a lighthouse beam sweeps it at The Lamplighter. */

import { createFlock, createMessenger, PERCH_SHAPE } from './flock.js';
import { startTakeovers } from './takeover.js';

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

/* ── the sky at each hour ─────────────────────────────────────────────── */

const KEYS = [
  { at: 0, top: '#2f3b78', mid: '#b56c8e', low: '#ffb978', stars: 0, sun: 0.9, moon: 0, rain: 0 },
  { at: 60, top: '#080a1a', mid: '#12142b', low: '#2a1e2c', stars: 0.9, sun: 0, moon: 0.75, rain: 0 },
  { at: 120, top: '#0b0e24', mid: '#181b38', low: '#3b2b30', stars: 0.6, sun: 0, moon: 0.6, rain: 0 },
  { at: 180, top: '#080c14', mid: '#101a20', low: '#2e211c', stars: 0.8, sun: 0, moon: 0.5, rain: 0 },
  { at: 240, top: '#070b16', mid: '#0e1526', low: '#182032', stars: 0.25, sun: 0, moon: 0.1, rain: 1 },
  { at: 300, top: '#0c1029', mid: '#171b3c', low: '#262546', stars: 0.9, sun: 0, moon: 0.85, rain: 0 },
  { at: 390, top: '#05060d', mid: '#090a14', low: '#0f0f1b', stars: 1, sun: 0, moon: 1, rain: 0 },
  { at: 630, top: '#0a0f24', mid: '#151d3a', low: '#262b50', stars: 0.85, sun: 0, moon: 0.8, rain: 0 },
  { at: 690, top: '#27346a', mid: '#7a6494', low: '#f0a07a', stars: 0.2, sun: 0.3, moon: 0.2, rain: 0 },
  { at: 780, top: '#7c9fd0', mid: '#c2cde0', low: '#f6d3ae', stars: 0, sun: 0.7, moon: 0, rain: 0 },
  { at: 830, top: '#c0d4ee', mid: '#e5eaf2', low: '#fbebd6', stars: 0, sun: 0.95, moon: 0, rain: 0 },
  { at: 870, top: '#d2e3f4', mid: '#edf1f5', low: '#fbf3e4', stars: 0, sun: 1, moon: 0, rain: 0 },
];

/* Colours are mixed in OKLab, where halfway between two colours looks halfway. */
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function hexToLab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function labToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255));
}
const LAB = KEYS.map((k) => ({ top: hexToLab(k.top), mid: hexToLab(k.mid), low: hexToLab(k.low) }));
const mix = (a, b, t) => a + (b - a) * t;
const mixLab = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
const luminance = (rgb) => rgb.map((c) => toLinear(c / 255)).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
/* Linger on each scene's own sky, and change between them. */
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/* ── where each scene sits ────────────────────────────────────────────── */

const scenes = [...document.querySelectorAll('.scene[data-at]')];
const rail = document.getElementById('night');
const links = new Map([...rail.querySelectorAll('ol a')].map((a) => [a.hash.slice(1), a]));
const clock = document.querySelector('.clock time');
const clockName = document.querySelector('.clock .now');
const themeColour = document.querySelector('meta[name="theme-color"]');
let anchors = [];

/* The scroll position at which each scene is on stage: centred if it fits on
   the screen, its top at the top of the screen if it does not. */
function measure() {
  const vh = innerHeight;
  const max = Math.max(0, document.documentElement.scrollHeight - vh);
  let last = 0;
  anchors = scenes.map((s, i) => {
    const top = s.getBoundingClientRect().top + scrollY;
    const at = i === 0 ? 0 : Math.min(max, Math.max(last, top + Math.min(s.offsetHeight, vh) / 2 - vh / 2));
    last = at;
    return at;
  });
}

const state = { stars: 0, rain: 0 };
let shownScene = -1;
let shownMinute = -1;
let lightTop = null;
let lightLow = null;
let night = 0; // how far into the night the scroll bar is, in minutes

function paint() {
  const y = scrollY;
  let i = 0;
  while (i < anchors.length - 2 && y >= anchors[i + 1]) i++;
  const span = anchors[i + 1] - anchors[i];
  const t = span > 0 ? ease(Math.min(1, Math.max(0, (y - anchors[i]) / span))) : 1;
  const a = KEYS[i];
  const b = KEYS[i + 1];

  const top = labToRgb(mixLab(LAB[i].top, LAB[i + 1].top, t));
  root.style.setProperty('--sky-top', hex(top));
  root.style.setProperty('--sky-mid', hex(labToRgb(mixLab(LAB[i].mid, LAB[i + 1].mid, t))));
  root.style.setProperty('--sky-low', hex(labToRgb(mixLab(LAB[i].low, LAB[i + 1].low, t))));

  const sun = mix(a.sun, b.sun, t);
  root.style.setProperty('--sun-y', `${(18 + (1 - sun) * 82).toFixed(2)}vh`);
  root.style.setProperty('--sun-o', Math.min(1, sun * 2.2).toFixed(3));
  root.style.setProperty('--moon-o', mix(a.moon, b.moon, t).toFixed(3));
  state.stars = mix(a.stars, b.stars, t);
  state.rain = mix(a.rain, b.rain, t);

  /* The top bar's words go dark once the sky behind them is light. */
  const light = luminance(top) > 0.3;
  if (light !== lightTop) {
    lightTop = light;
    root.style.setProperty('--top-ink', light ? '#1c1a22' : '#f7f2ea');
    root.style.setProperty('--top-glass', light ? 'rgba(251, 247, 240, .74)' : 'rgba(10, 11, 30, .62)');
  }
  themeColour.setAttribute('content', hex(top));
  /* The wire hangs against the bottom of the sky, so it goes by that. */
  const low = luminance(labToRgb(mixLab(LAB[i].low, LAB[i + 1].low, t))) > 0.17;
  if (low !== lightLow) {
    lightLow = low;
    wireInk = low ? '#1c1527' : '#efe9df';
    root.style.setProperty('--wire-ink', wireInk);
  }

  /* The clock: 17:30 plus however far into the night the scroll bar is. */
  night = mix(a.at, b.at, t);
  flock?.setMinute(night);
  if (wire.on) rail.style.setProperty('--lit', (1 - (wire.x0 + (night / LAST) * (wire.x1 - wire.x0)) / W).toFixed(4));
  const minute = Math.round(night);
  if (minute !== shownMinute) {
    shownMinute = minute;
    const m = (17 * 60 + 30 + minute) % (24 * 60);
    clock.textContent = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  /* The scene on stage is the last one whose hour has come. */
  let on = 0;
  for (let k = 0; k < anchors.length; k++) if (y >= anchors[k] - innerHeight * 0.3) on = k;
  if (on !== shownScene) {
    shownScene = on;
    clockName.textContent = scenes[on].dataset.name;
    for (const [id, link] of links) {
      if (id === scenes[on].id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }
  if (!moving) { flock?.snap(); drawSky(performance.now()); }
}

/* ── stars and rain ───────────────────────────────────────────────────── */

const canvas = document.querySelector('.sky canvas');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;
let stars = [];
let drops = [];
let shooting = null;
let nextShooting = 0;

function size() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* A fixed pattern, so the same stars come out every night. */
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  stars = Array.from({ length: Math.min(420, Math.round((W * H) / 4200)) }, () => ({
    x: rand() * W, y: rand() ** 1.6 * H * 0.9, r: 0.35 + rand() ** 3 * 1.35, phase: rand() * Math.PI * 2, speed: 0.4 + rand() * 1.6,
  }));
  drops = Array.from({ length: Math.round((W * H) / 5200) }, () => ({ x: rand() * W * 1.2, y: rand() * H, len: 10 + rand() * 18, v: 900 + rand() * 600 }));
  front.width = Math.round(W * dpr);
  front.height = Math.round(H * dpr);
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layWire();
}

let last = performance.now();
function drawSky(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ctx.clearRect(0, 0, W, H);
  if (state.stars > 0.01) {
    for (const s of stars) {
      const twinkle = moving ? 0.6 + 0.4 * Math.sin(now * 0.001 * s.speed + s.phase) : 0.85;
      ctx.globalAlpha = state.stars * twinkle * (s.r > 1 ? 1 : 0.75);
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    /* Now and then, deep in the night, a shooting star. */
    if (moving && state.stars > 0.8) {
      if (!shooting && now > nextShooting) {
        shooting = { x: W * (0.2 + Math.random() * 0.6), y: H * (0.05 + Math.random() * 0.25), t: 0 };
        nextShooting = now + 7000 + Math.random() * 9000;
      }
    }
    if (shooting) {
      shooting.t += dt / 0.9;
      const k = shooting.t;
      const x = shooting.x + k * 260;
      const y = shooting.y + k * 110;
      const g = ctx.createLinearGradient(x - 120, y - 50, x, y);
      g.addColorStop(0, 'rgba(255,250,240,0)');
      g.addColorStop(1, 'rgba(255,250,240,0.9)');
      ctx.globalAlpha = state.stars * Math.sin(Math.PI * Math.min(1, k));
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - 120, y - 50);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (k >= 1) shooting = null;
    }
  }
  if (state.rain > 0.01 && moving) {
    ctx.globalAlpha = 0.32 * state.rain;
    ctx.strokeStyle = '#b8c6e6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const n = Math.round(drops.length * state.rain);
    for (let k = 0; k < n; k++) {
      const d = drops[k];
      d.y += d.v * dt;
      d.x -= d.v * dt * 0.28;
      if (d.y > H) { d.y = -d.len; d.x = Math.random() * W * 1.2; }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * 0.28, d.y - d.len);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (flock) {
    ctx.globalAlpha = 0.9;
    flock.drawBehind(ctx, '#1c1527');
    ctx.globalAlpha = 1;
  }
  drawFront();
}

/* In front of the page: the birds on the wire, the morning's leavers and any
   bird of the index that has been sent somewhere. */
function drawFront() {
  if (!wire.on) return; // on a phone there is no wire, and nothing flies in front
  fctx.clearRect(0, 0, W, H);
  if (flock) flock.drawInFront(fctx, { perch: wireInk, leave: wireInk, shape: PERCH_SHAPE_2D });
  for (const m of messengers.values()) m.draw(fctx, PERCH_SHAPE_2D);
}

let moving = false;
let frame = 0;
let stepped = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - stepped) / 1000);
  stepped = now;
  flock?.step(dt);
  for (const [a, m] of messengers) if (!m.step(dt)) messengers.delete(a);
  drawSky(now);
  frame = requestAnimationFrame(loop);
}

/* ── the flock ────────────────────────────────────────────────────────── */

const front = document.querySelector('canvas.front');
const fctx = front.getContext('2d');
const PERCH_SHAPE_2D = new Path2D(PERCH_SHAPE);
let wireInk = '#1c1527';
let flock = null;

/* Started once the page has been drawn: the flock spends a moment finding its
   shape first, and the sky should not wait for that. */
function hatch() {
  flock = createFlock({ count: Math.max(160, Math.min(760, Math.round((W * H) / 1700))) });
  flock.resize(W, H, wire.slots);
  flock.setMinute(night);
  if (!moving) flock.snap();
  drawSky(performance.now());
}

/* ── the wire ─────────────────────────────────────────────────────────── */

/* The wire runs edge to edge and dips in the middle; the hours sit along it
   from 17:30 at the left to 08:00 at the right. Every position is worked out
   here, in pixels, so the birds drawn by the stylesheet and the birds drawn on
   the canvas stand on exactly the same line. */
const LAST = Number(scenes[scenes.length - 1].dataset.at);
const RAIL = 104; //  the height of the strip it is strung across
const wire = { on: false, top: 0, y0: 62, sag: 12, x0: 40, x1: 0, slots: [] };
const wireY = (x) => wire.y0 + 4 * wire.sag * (x / W) * (1 - x / W);
const perchOf = (li) => {
  const x = parseFloat(li.style.getPropertyValue('--x'));
  return { x, y: wire.top + wireY(x) };
};

function layWire() {
  wire.on = matchMedia('(min-width: 901px)').matches;
  rail.classList.toggle('wired', wire.on);
  wire.slots = [];
  if (wire.on) {
    wire.top = H - RAIL;
    wire.x1 = W - 40;
    const d = `M0 ${wire.y0} Q${W / 2} ${wire.y0 + 2 * wire.sag} ${W} ${wire.y0}`;
    for (const path of rail.querySelectorAll('.wire path')) path.setAttribute('d', d);
    rail.querySelector('.wire').setAttribute('viewBox', `0 0 ${W} ${RAIL}`);
    const xs = [];
    rail.querySelectorAll('li').forEach((li, k) => {
      const x = wire.x0 + (Number(scenes[k].dataset.at) / LAST) * (wire.x1 - wire.x0);
      xs.push(x);
      li.style.setProperty('--x', `${x.toFixed(1)}px`);
      li.style.setProperty('--y', `${wireY(x).toFixed(1)}px`);
    });
    /* Places for the flock to sleep: along the wire, clear of the index. */
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let x = 18; x < W - 18; x += 19 + rand() * 9) {
      if (xs.some((b) => Math.abs(b - x) < 24) || rand() < 0.3) continue;
      wire.slots.push({ x, y: wire.top + wireY(x) });
    }
  }
  flock?.resize(W, H, wire.slots);
}

/* Pointing at a bird, or tabbing to it, says which hour it is. */
const label = rail.querySelector('.perch');
function name(a) {
  if (!wire.on) return;
  label.querySelector('time').textContent = a.querySelector('time').textContent;
  label.querySelector('span').textContent = a.querySelector('span').textContent;
  const x = perchOf(a.parentElement).x;
  label.classList.add('on');
  const half = label.offsetWidth / 2;
  label.style.setProperty('--px', `${Math.min(W - half - 12, Math.max(half + 12, x)).toFixed(1)}px`);
}
const unname = () => label.classList.remove('on');
for (const a of links.values()) {
  a.addEventListener('pointerenter', () => name(a));
  a.addEventListener('pointerleave', () => { if (!a.matches(':focus-visible')) unname(); });
  a.addEventListener('focus', () => { if (a.matches(':focus-visible')) name(a); });
  a.addEventListener('blur', unname);
}

/* Choosing an hour sends its bird ahead: it flies to the scene and stands on
   the scene's clock while the page catches up, then flies home. */
const messengers = new Map();
rail.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a || !wire.on || !moving || messengers.has(a)) return;
  unname();
  const hour = document.getElementById(a.hash.slice(1)).querySelector('.hour time');
  const li = a.parentElement;
  a.classList.add('away');
  messengers.set(a, createMessenger({
    from: perchOf(li),
    colour: getComputedStyle(hour).color,
    target: () => {
      const r = hour.getBoundingClientRect();
      /* On top of the last figure of the hour. */
      const x = r.right - r.width * 0.13;
      const y = r.top + r.height * 0.19;
      return { x, y, off: r.bottom < 70 || r.top > H - RAIL, near: { x, y: Math.min(H - RAIL, Math.max(70, y)) } };
    },
    home: () => perchOf(li),
    onHome: () => a.classList.remove('away'),
  }));
});

/* ── the recordings ───────────────────────────────────────────────────── */

const videos = [...document.querySelectorAll('.screen video')];
const seen = new WeakSet();
function syncVideo(v) {
  if (moving && seen.has(v)) {
    v.preload = 'auto';
    v.play().catch(() => {});
  } else {
    v.pause();
  }
}
const watcher = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target);
    syncVideo(e.target);
  }
}, { threshold: 0.35 });
videos.forEach((v) => watcher.observe(v));

/* ── things coming into view ──────────────────────────────────────────── */

const risers = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); risers.unobserve(e.target); }
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
document.querySelectorAll('.rise').forEach((el) => risers.observe(el));

/* ── three projects that take over the night (takeover.js) ───────────── */

const takeovers = startTakeovers({ moving: () => moving });

/* ── motion, on and off ───────────────────────────────────────────────── */

const button = document.querySelector('.motion');
let saved = null;
try { saved = localStorage.getItem('night:motion'); } catch { /* private browsing */ }

function setMotion(on, remember) {
  moving = on;
  root.dataset.motion = on ? 'on' : 'off';
  button.setAttribute('aria-pressed', String(on));
  if (remember) try { localStorage.setItem('night:motion', on ? 'on' : 'off'); } catch { /* not kept, still works */ }
  cancelAnimationFrame(frame);
  if (on) {
    stepped = performance.now();
    frame = requestAnimationFrame(loop);
  } else {
    for (const a of messengers.keys()) a.classList.remove('away');
    messengers.clear();
    flock?.snap();
    drawSky(performance.now());
  }
  videos.forEach(syncVideo);
  takeovers?.wake();
}
button.addEventListener('click', () => setMotion(!moving, true));
reduce.addEventListener('change', () => { if (saved === null) setMotion(!reduce.matches, false); });

/* ── the index, on a small screen ─────────────────────────────────────── */

const toggle = document.querySelector('.index');
const closeIndex = () => { rail.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); };
toggle.addEventListener('click', () => {
  const open = !rail.classList.contains('open');
  rail.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', String(open));
  if (open) rail.querySelector('[aria-current]')?.focus();
});
rail.addEventListener('click', (e) => { if (e.target.closest('a')) closeIndex(); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && rail.classList.contains('open')) { closeIndex(); toggle.focus(); }
  if (e.key === 'Escape') unname();
});

/* ── the email address ────────────────────────────────────────────────── */

/* Copy the address and say so; if the clipboard is refused, select it so it can be copied by hand. */
document.getElementById('copyMail').addEventListener('click', async (e) => {
  const note = document.getElementById('copyNote');
  const mail = e.currentTarget.dataset.mail;
  try {
    await navigator.clipboard.writeText(mail);
    note.textContent = `Copied ${mail}.`;
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#contact .mail'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    note.textContent = 'Press Ctrl+C or ⌘C to copy the selected address.';
  }
});

/* ── start ────────────────────────────────────────────────────────────── */

let queued = false;
const onScroll = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; paint(); });
};
size();
measure();
setMotion(saved ? saved === 'on' : !reduce.matches, false);
paint();
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { size(); measure(); paint(); });
if ('requestIdleCallback' in window) requestIdleCallback(hatch, { timeout: 700 }); else setTimeout(hatch, 120);
/* Pictures and fonts arriving change the page's height, so measure again. */
new ResizeObserver(() => { measure(); paint(); }).observe(document.body);

/* atlas/hero.js — the floating city, and the threshold for browsers without WebGL.

   buildCity draws the city that floats beyond the ring, once, with the 2D
   canvas; the shader (sky.js) uploads it as its one texture. startWorld draws the
   whole threshold in 2D from the same layout the shader uses (scene.js): the ring
   as a tube in perspective with its dial, the stack, the cables, the causeway,
   the cliffs, and the sea, which is the scene above it copied back upside down
   one strip at a time, each strip pushed sideways by a pair of travelling waves.
   It answers the same calls as the shader, so the page, the hotspots and the
   dial work the same either way. Off screen, in a background tab, or for someone
   who has asked for reduced motion, it stops. */

import { EYE, DIAL_SPEED, sceneLayout, dialAt, dialPoint, toScreen, moonPhase } from './scene.js';

const TAU = Math.PI * 2;
const LIT = 'rgba(255, 217, 138,';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function offscreen(w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  return [c, x];
}


/* The floating city: a mountain of rock with towers on top, a second city hanging
   upside down beneath it, a stair that climbs into nothing, and a waterfall that
   pours off the edge and never lands. Lit from the right, where the portal is. */
export function buildCity(size, dpr) {
  const W = size;
  const H = size * 1.25;
  const [c, x] = offscreen(W, H, dpr);
  const rand = seeded(1987);
  const capY = H * 0.42;
  const cx = W * 0.5;
  const rx = W * 0.44;

  /* the waterfall, behind the rock */
  const wf = x.createLinearGradient(0, capY, 0, H);
  wf.addColorStop(0, 'rgba(180,215,255,0.55)');
  wf.addColorStop(1, 'rgba(180,215,255,0)');
  x.fillStyle = wf;
  x.fillRect(cx - rx * 0.86, capY + 4, W * 0.035, H - capY);
  x.fillStyle = 'rgba(220,240,255,0.25)';
  x.fillRect(cx - rx * 0.86 + W * 0.012, capY + 4, W * 0.006, (H - capY) * 0.7);

  /* the rock */
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push([cx - rx + t * rx * 2 + (rand() - 0.5) * W * 0.03, capY + Math.sin(Math.PI * t) * H * (0.3 + rand() * 0.08)]);
  }
  x.beginPath();
  x.moveTo(cx - rx, capY);
  for (const [px, py] of pts) x.lineTo(px, py);
  x.lineTo(cx + rx, capY);
  x.closePath();
  const rg = x.createLinearGradient(cx - rx, capY, cx + rx, H * 0.8);
  rg.addColorStop(0, '#141d36');
  rg.addColorStop(0.6, '#1d2a4c');
  rg.addColorStop(1, '#3a3f62');
  x.fillStyle = rg;
  x.fill();
  x.strokeStyle = 'rgba(232,199,170,0.35)';
  x.lineWidth = 1.2;
  x.beginPath();
  for (let i = 7; i <= 12; i++) { const [px, py] = pts[i]; if (i === 7) x.moveTo(px, py); else x.lineTo(px, py); }
  x.stroke();

  /* the city that hangs underneath, upside down */
  const tip = pts[6][1];
  for (let i = 0; i < 6; i++) {
    const tx = cx - rx * 0.5 + i * rx * 0.2 + (rand() - 0.5) * 6;
    const top = capY + (tip - capY) * (0.35 + Math.abs(i - 2.5) * -0.05);
    const tw = W * (0.03 + rand() * 0.025);
    const th = H * (0.08 + rand() * 0.14);
    x.fillStyle = '#18233f';
    x.fillRect(tx, top, tw, th);
    x.beginPath();
    x.moveTo(tx, top + th);
    x.lineTo(tx + tw / 2, top + th + tw * 1.6);
    x.lineTo(tx + tw, top + th);
    x.fill();
    for (let k = 0; k < 4; k++) {
      if (rand() < 0.55) { x.fillStyle = `${LIT}${0.5 + rand() * 0.5})`; x.fillRect(tx + tw * 0.3, top + 6 + k * th * 0.22, tw * 0.4, tw * 0.3); }
    }
  }

  /* the land on top */
  x.beginPath();
  x.ellipse(cx, capY, rx, H * 0.045, 0, 0, TAU);
  const lg = x.createLinearGradient(0, capY - H * 0.05, 0, capY + H * 0.05);
  lg.addColorStop(0, '#3a5a5a');
  lg.addColorStop(1, '#1d3038');
  x.fillStyle = lg;
  x.fill();

  /* towers, back to front, shorter at the edges */
  const towers = [];
  for (let i = 0; i < 11; i++) {
    const t = (i + rand() * 0.6) / 11;
    const tx = cx - rx * 0.82 + t * rx * 1.64;
    const edge = 1 - Math.abs(t - 0.52) * 1.6;
    towers.push({ x: tx, w: W * (0.04 + rand() * 0.05), h: H * (0.08 + edge * (0.2 + rand() * 0.18)), kind: (rand() * 4) | 0 });
  }
  towers.sort((a, b) => a.h - b.h);
  for (const t of towers) {
    const base = capY + 2;
    const top = base - t.h;
    const g = x.createLinearGradient(t.x, 0, t.x + t.w, 0);
    g.addColorStop(0, '#16213d');
    g.addColorStop(0.7, '#24345c');
    g.addColorStop(1, '#5a5f84');
    x.fillStyle = g;
    x.fillRect(t.x, top, t.w, t.h);
    x.fillStyle = 'rgba(232,199,170,0.45)';
    x.fillRect(t.x + t.w - 1.2, top, 1.2, t.h);
    if (t.kind === 0) { x.beginPath(); x.moveTo(t.x, top); x.lineTo(t.x + t.w / 2, top - t.w * 1.8); x.lineTo(t.x + t.w, top); x.fillStyle = '#2a3a64'; x.fill(); }
    else if (t.kind === 1) { x.beginPath(); x.arc(t.x + t.w / 2, top, t.w / 2, Math.PI, 0); x.fillStyle = '#2f4070'; x.fill(); }
    else if (t.kind === 2) { x.fillStyle = '#9AE6D0'; x.fillRect(t.x + t.w / 2 - 0.6, top - t.w * 1.4, 1.2, t.w * 1.4); x.fillRect(t.x + t.w / 2 - 1.5, top - t.w * 1.45, 3, 3); }
    const rows = Math.floor(t.h / 9);
    for (let r = 1; r < rows; r++) for (let k = 0; k < 3; k++) {
      if (rand() < 0.42) {
        x.fillStyle = `${LIT}${0.35 + rand() * 0.6})`;
        x.fillRect(t.x + t.w * (0.18 + k * 0.26), top + r * 9, Math.max(1.4, t.w * 0.14), 3.4);
      }
    }
  }
  /* a bridge of arches between two of the tall towers */
  const [a, b] = towers.slice(-2).sort((p, q) => p.x - q.x);
  const by = capY - Math.min(a.h, b.h) * 0.62;
  x.fillStyle = '#2a3a62';
  x.fillRect(a.x + a.w, by, b.x - a.x - a.w, 4);
  x.strokeStyle = '#2a3a62';
  x.lineWidth = 2;
  const span = b.x - a.x - a.w;
  for (let k = 0; k < 3; k++) {
    x.beginPath();
    x.arc(a.x + a.w + span * (k + 0.5) / 3, by + 4, span / 6, 0, Math.PI);
    x.stroke();
  }
  /* the stair to nowhere, and its upside-down twin */
  const tallest = towers[towers.length - 1];
  let sx = tallest.x + tallest.w;
  let sy = capY - tallest.h * 0.85;
  x.fillStyle = '#c9b8a8';
  for (let k = 0; k < 9; k++) { x.fillRect(sx, sy, 7, 2); sx += 6; sy -= 5; }
  x.fillStyle = 'rgba(201,184,168,0.6)';
  sx += 10;
  for (let k = 0; k < 6; k++) { x.fillRect(sx, sy - 10, 7, 2); sx += 6; sy += 5; }
  /* pieces of building that came loose and float */
  for (let k = 0; k < 5; k++) {
    const fx = cx - rx * 0.6 + rand() * rx * 1.4;
    const fy = capY - H * (0.32 + rand() * 0.12);
    const fs = W * (0.012 + rand() * 0.016);
    x.fillStyle = '#2a3a62';
    x.fillRect(fx, fy, fs, fs);
    x.fillStyle = 'rgba(232,199,170,0.5)';
    x.fillRect(fx + fs - 1, fy, 1, fs);
  }
  return { canvas: c, w: W, h: H, capY };
}

/* ── the 2D threshold ───────────────────────────────────────────────────── */

const DEPTH = 0.26;
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/* A smooth seeded curve on 0..1, for cliff edges and cloud banks. */
function curve(rand, n) {
  const v = Array.from({ length: n + 2 }, () => rand());
  return (t) => {
    const x = Math.max(0, Math.min(0.9999, t)) * n;
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return v[i] * (1 - u) + v[i + 1] * u;
  };
}

/* The world beyond the ring, as a picture: the sky, a warm horizon, the sea of
   cloud and the floating city, with the region's weather laid over it. Used both
   in the ring's opening and, full size, behind the islands. */
function paintBeyond(x, w, h, city, { env = [0, 0, 0, 0, 0, 0, 0, 0], tint = [1, 1, 1], focus = [0, 0, 0], full = true } = {}) {
  const [stars, grid, water, aurora, night, warm, lamps, away = 0] = env;
  const hz = h * 0.56;
  const sky = x.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, night > 0.5 ? '#04060f' : '#0b1430');
  sky.addColorStop(0.62, night > 0.5 ? '#0d1530' : '#2a3a64');
  sky.addColorStop(1, night > 0.5 ? '#2a3354' : warm > 0.5 ? '#f0a890' : '#f2cfa6');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, hz);
  const sun = x.createRadialGradient(w * 0.42, hz, 0, w * 0.42, hz, w * 0.5);
  sun.addColorStop(0, `rgba(255,214,160,${0.5 * (1 - night * 0.8)})`);
  sun.addColorStop(1, 'rgba(255,214,160,0)');
  x.fillStyle = sun;
  x.fillRect(0, 0, w, h);
  if (full && stars) {
    const r = seeded(91);
    x.fillStyle = '#e8ecff';
    for (let i = 0; i < 160; i++) { x.globalAlpha = (0.3 + r() * 0.6) * stars; x.fillRect(r() * w, Math.pow(r(), 1.3) * hz * 0.85, 1.2, 1.2); }
    x.globalAlpha = 1;
  }
  if (full && aurora) {
    for (const [col, off] of [['rgba(80,240,190,', 0], ['rgba(140,100,240,', 0.08]]) {
      x.beginPath();
      for (let i = 0; i <= 40; i++) { const u = i / 40; x.lineTo(u * w, hz * (0.35 + off + 0.06 * Math.sin(u * 7) + 0.03 * Math.sin(u * 17))); }
      x.lineWidth = h * 0.05;
      x.strokeStyle = `${col}${0.12 * aurora})`;
      x.stroke();
    }
  }
  /* the sea of cloud, or water, below the horizon */
  const sea = x.createLinearGradient(0, hz, 0, h);
  if (water > 0.5) { sea.addColorStop(0, '#d9c8b6'); sea.addColorStop(0.3, '#6b7895'); sea.addColorStop(1, '#1d2740'); }
  else { sea.addColorStop(0, night > 0.5 ? '#3a4262' : '#e8d2bc'); sea.addColorStop(0.25, night > 0.5 ? '#232a44' : '#9d9ab4'); sea.addColorStop(1, night > 0.5 ? '#0b0f1e' : '#454a6e'); }
  x.fillStyle = sea;
  x.fillRect(0, hz, w, h - hz);
  const r = seeded(17);
  if (water < 0.5) {
    /* puffs of cloud, bigger nearer */
    for (let i = 0; i < 26; i++) {
      const u = r();
      const py = hz + Math.pow(u, 1.6) * (h - hz);
      const rad = (8 + u * 90) * (w / 900);
      const g = x.createRadialGradient(r() * w, py, 0, 0, 0, 0);
      void g;
      x.fillStyle = night > 0.5 ? `rgba(120,135,180,${0.12 + 0.1 * r()})` : `rgba(255,236,220,${0.14 + 0.12 * r()})`;
      x.beginPath();
      x.ellipse(r() * w, py, rad * 2.4, rad * 0.5, 0, 0, Math.PI * 2);
      x.fill();
    }
  } else {
    /* a path of glints towards the sun */
    x.fillStyle = 'rgba(255,240,220,0.5)';
    for (let i = 0; i < 70; i++) { const u = r(); const py = hz + 3 + Math.pow(u, 1.5) * (h - hz); x.fillRect(w * 0.42 + (r() - 0.5) * (10 + u * w * 0.3), py, 6 + u * 30, 1.5); }
  }
  if (grid > 0.5) {
    x.strokeStyle = 'rgba(160,230,225,0.22)';
    x.lineWidth = 1;
    for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(w * 0.5 + i * w * 0.004, hz); x.lineTo(w * 0.5 + i * w * 0.12, h); x.stroke(); }
    for (let i = 1; i < 12; i++) { const py = hz + (h - hz) * Math.pow(i / 12, 2); x.beginPath(); x.moveTo(0, py); x.lineTo(w, py); x.stroke(); }
  }
  if (lamps) {
    for (let i = 0; i < 40; i++) {
      const u = r();
      const px = r() * w, py = hz + 4 + Math.pow(u, 1.8) * (h - hz) * 0.8;
      const g = x.createRadialGradient(px, py, 0, px, py, 3 + u * 16);
      g.addColorStop(0, `rgba(255,200,120,${0.9 * lamps})`);
      g.addColorStop(1, 'rgba(255,200,120,0)');
      x.fillStyle = g;
      x.fillRect(px - 20, py - 20, 40, 40);
    }
  }
  /* the city */
  if (city) {
    const far = full ? away : 0;
    const cw = Math.min(w * 0.3, h * 0.42) * (1 - 0.7 * far);
    const chh = cw * (city.h / city.w);
    const cx = (full ? w * 0.7 : w * 0.5) + w * 0.08 * far;
    x.globalAlpha = (night > 0.5 ? 0.7 : 1) * (1 - 0.45 * far);
    x.drawImage(city.canvas, cx - cw / 2, hz - chh * 0.62, cw, chh);
    x.globalAlpha = 1;
  }
  if (focus[2] > 0.01) {
    const g = x.createLinearGradient(0, 0, 0, focus[1]);
    g.addColorStop(0, 'rgba(232,220,200,0)');
    g.addColorStop(1, `rgba(232,220,200,${0.18 * focus[2]})`);
    x.fillStyle = g;
    x.fillRect(focus[0] - 50, 0, 100, focus[1]);
  }
  if (tint.some((v) => Math.abs(v - 1) > 0.02)) {
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = `rgb(${Math.min(255, tint[0] * 230)},${Math.min(255, tint[1] * 230)},${Math.min(255, tint[2] * 230)})`;
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  }
}

/* The same scene as the shader, drawn with the 2D canvas for browsers without
   WebGL: the ring as a tube in perspective (its face, its bore, its far opening
   and the dial of thirty-five blocks), the cables, the sea stack and its lamp,
   the causeway and the person on it, the cliffs, and the sea that reflects it
   all. It takes the same settings as the shader (set(), layout(), dialAt()), so
   the page drives either without knowing which one it has. */
export function startWorld(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, L = null;
  let bg, up, upx, fg, beyond, cityArt;
  let raf = 0, last = 0, visible = true, alive = true, dialRot = 0;
  const t0 = performance.now();
  const target = {
    intro: reduced ? 1 : 0, travel: 0, hover: 0, alt: 0, lamp: 0, mouse: [0, 0], tint: [1, 1, 1],
    env: [0, 0, 0, 0, 0, 0, 0, 0], focus: [0, 0, 0], accent: [0.6, 0.9, 0.82], accentAmt: 0, seen: [0, 0], dialHot: -1, flash: 0,
  };
  const now = { hover: 0, lamp: 0, mouse: [0, 0] };
  const stats = { fps: 0, frameMs: 0, scale: 1, px: 0, quality: '2D canvas', renderer: '2D canvas (no WebGL)' };
  let frames = 0, fpsT = performance.now();
  let beyondKey = '';

  const S = (x, y) => [x * H + W / 2, H / 2 - y * H];

  function layout() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    /* one pixel per CSS pixel: a browser without WebGL is often one without much graphics power */
    DPR = 1;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    L = sceneLayout(W, H);
    stats.px = canvas.width * canvas.height;
    cityArt = buildCity(Math.round(Math.min(W * 0.4, 420)), DPR);
    buildBackground();
    buildForeground();
    [up, upx] = offscreen(W, H, DPR);
    beyondKey = '';
  }

  /* the sky, the moons, the far city, the isles, the cloud banks and the arch: drawn once */
  function buildBackground() {
    let x;
    [bg, x] = offscreen(W, H, DPR);
    const [, hzY] = S(0, L.hz);
    const g = x.createLinearGradient(0, 0, 0, hzY);
    g.addColorStop(0, '#03060d');
    g.addColorStop(0.6, '#0b1328');
    g.addColorStop(1, '#1e2846');
    x.fillStyle = g;
    x.fillRect(0, 0, W, hzY);
    const [cX, cY] = S(L.portal[0], L.portal[1]);
    const R = L.portal[2] * H;
    for (const [px, py, rad, col] of [[cX, hzY, W * 0.5, 'rgba(242,184,140,0.16)'], [cX, cY, R * 2.6, 'rgba(70,130,128,0.2)'], [W * 0.25, H * 0.25, W * 0.4, 'rgba(113,142,200,0.08)']]) {
      const rg = x.createRadialGradient(px, py, 0, px, py, rad);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg;
      x.fillRect(0, 0, W, hzY);
    }
    const rand = seeded(7);
    for (let i = 0, n = Math.round((W * hzY) / 2400); i < n; i++) {
      x.fillStyle = `rgba(232,236,255,${0.15 + rand() * 0.6})`;
      const s = rand() < 0.07 ? 1.6 : 0.9;
      x.fillRect(rand() * W, Math.pow(rand(), 1.3) * hzY * 0.92, s, s);
    }
    /* the ringed moon, in tonight's phase, and its small companion */
    const [mx, my] = S(L.moon[0], L.moon[1]);
    const mr = L.moon[2] * H;
    const phase = moonPhase();
    x.save();
    x.translate(mx, my);
    x.fillStyle = '#d8d2c8';
    x.beginPath(); x.arc(0, 0, mr, 0, TAU); x.fill();
    const lit = Math.cos(phase * TAU);
    x.fillStyle = 'rgba(10,14,26,0.92)';
    x.beginPath();
    x.ellipse(phase < 0.5 ? -mr * (1 - lit) * 0.5 - mr * 0.5 * (1 + lit) : mr * (1 - lit) * 0.5 + mr * 0.5 * (1 + lit), 0, mr * Math.abs(lit) * 0.5 + mr * 0.5, mr, 0, 0, TAU);
    x.fill();
    x.rotate(-0.42);
    x.strokeStyle = 'rgba(220,205,185,0.4)';
    x.lineWidth = mr * 0.12;
    x.beginPath(); x.ellipse(0, 0, mr * 2, mr * 0.46, 0, 0, Math.PI); x.stroke();
    x.restore();
    x.fillStyle = '#b8b0c8';
    const [m2x, m2y] = S(L.moon[0] + 0.11, L.moon[1] - 0.06);
    x.beginPath(); x.arc(m2x, m2y, mr * 0.3, 0, TAU); x.fill();
    /* the far city in the haze */
    const [fx, fy] = S(L.far[0], L.far[1]);
    const fw = L.far[2] * H;
    x.fillStyle = 'rgba(70,85,120,0.55)';
    x.beginPath();
    x.moveTo(fx - fw, fy);
    for (let i = 0; i <= 12; i++) { const u = i / 12 * 2 - 1; x.lineTo(fx + u * fw, fy + 0.6 * fw * Math.pow(1 - u * u, 0.6) * (0.85 + 0.3 * rand())); }
    x.closePath();
    x.fill();
    for (let i = 0; i < 26; i++) {
      const u = (i / 26) * 1.7 - 0.85;
      const th = fw * (0.06 + 0.3 * Math.pow(rand(), 2)) * (1 - Math.abs(u) * 0.8) + (rand() > 0.86 ? fw * 0.26 : 0);
      x.fillStyle = 'rgba(64,78,112,0.6)';
      x.fillRect(fx + u * fw, fy - th, fw * 0.045, th);
      if (rand() > 0.5) { x.fillStyle = 'rgba(255,214,150,0.6)'; x.fillRect(fx + u * fw + 1, fy - th * rand(), 1.2, 1.2); }
    }
    x.fillStyle = 'rgba(180,235,225,0.12)';
    x.fillRect(fx + fw * 0.16, 0, 1.2, fy - fw * 0.56);
    /* the cloud banks and the broken arch on the horizon */
    const bank = curve(seeded(31), 9);
    x.fillStyle = 'rgba(62,72,102,0.6)';
    x.beginPath(); x.moveTo(0, hzY);
    for (let i = 0; i <= 80; i++) x.lineTo((i / 80) * W, hzY - H * (0.02 + 0.09 * Math.pow(bank(i / 80), 1.6)));
    x.lineTo(W, hzY); x.fill();
    const [ax, ay] = S(-0.42 * L.a, L.hz - 0.08);
    x.strokeStyle = 'rgba(52,62,92,0.85)';
    x.lineWidth = H * 0.02;
    for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(ax, ay, H * 0.4, -2.5 + k * 0.56, -2.5 + k * 0.56 + 0.44); x.stroke(); }
    /* the sea */
    const sea = x.createLinearGradient(0, hzY, 0, H);
    sea.addColorStop(0, '#111a30');
    sea.addColorStop(1, '#03050a');
    x.fillStyle = sea;
    x.fillRect(0, hzY, W, H - hzY);
  }

  /* the causeway, the low rock and the cliffs: also drawn once */
  function buildForeground() {
    let x;
    [fg, x] = offscreen(W, H, DPR);
    const hz = L.hz;
    const cxw = L.portal[0];
    const l0 = (L.narrow ? 0 : 0.13) * 0.1;
    const lat = (z) => mix(l0, cxw, (z - 0.1) / 0.9);
    const hw = L.narrow ? 0.011 : 0.016;
    const left = [], right = [];
    for (let z = 0.12; z <= 0.975; z += 0.01) {
      left.push(S((lat(z) - hw) / z, hz - EYE / z));
      right.push(S((lat(z) + hw) / z, hz - EYE / z));
    }
    x.fillStyle = '#0a0d17';
    x.beginPath();
    left.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    right.reverse().forEach(([px, py]) => x.lineTo(px, py));
    x.fill();
    x.strokeStyle = 'rgba(120,210,195,0.25)';
    x.lineWidth = 1;
    for (let z = 0.2; z < 0.97; z += 1 / 15) {
      const [a1, b1] = S((lat(z) - hw) / z, hz - EYE / z);
      const [a2] = S((lat(z) + hw) / z, hz - EYE / z);
      x.globalAlpha = 0.3 + 0.7 * ss(0.3, 0.97, z);
      x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b1); x.stroke();
    }
    x.globalAlpha = 1;
    /* the person, just short of the ring */
    const [px, py] = S(L.figure[0], L.figure[1]);
    const fh = L.figure[2] * H;
    x.fillStyle = '#020306';
    x.fillRect(px - fh * 0.12, py - fh * 0.75, fh * 0.24, fh * 0.75);
    x.beginPath(); x.arc(px, py - fh * 0.88, fh * 0.11, 0, TAU); x.fill();
    /* the cliffs: a leaning wall each side, with a few lit openings */
    const wallSide = (x0, side, seed) => {
      const big = curve(seeded(seed), 6), small = curve(seeded(seed + 1), 30);
      const pts = [];
      for (let y = -0.52; y <= 0.52; y += 0.01) {
        const e = x0 - side * (0.11 * ss(0.05, -0.5, y) + 0.05 * ss(0.15, 0.5, y)) + side * (0.08 * (big(y + 0.5) - 0.5) + 0.02 * (small(y + 0.5) - 0.5));
        pts.push(S(e, y));
      }
      const edgeX = side > 0 ? W : 0;
      const g = x.createLinearGradient(side > 0 ? pts[50][0] : 0, 0, side > 0 ? W : pts[50][0], 0);
      g.addColorStop(0, side > 0 ? '#0b0e16' : '#05060b');
      g.addColorStop(1, side > 0 ? '#05060b' : '#0b0e16');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(edgeX, H + 2);
      pts.forEach(([a, b]) => x.lineTo(a, b));
      x.lineTo(edgeX, -2);
      x.fill();
      x.strokeStyle = 'rgba(110,200,185,0.35)';
      x.lineWidth = 1.2;
      x.beginPath();
      pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
      x.stroke();
      const r = seeded(seed + 7);
      x.fillStyle = 'rgba(255,200,130,0.85)';
      for (let i = 0; i < 10; i++) {
        const k = Math.floor(r() * pts.length);
        const [a, b] = pts[k];
        if (b < H * 0.06 || b > H * 0.75) continue;
        x.fillRect(a + side * H * (0.015 + r() * 0.05), b, 2, 3);
      }
    };
    wallSide(L.cliff[0], 1, 41);
    wallSide(L.narrow ? -L.cliff[0] : -0.5 * L.a + 0.07, -1, 53);
    /* the low rock in front of the headline */
    const lr = curve(seeded(61), 12);
    x.fillStyle = '#05070c';
    x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      const xs = -0.5 * L.a + u * 0.62 * L.a;
      x.lineTo(...S(xs, -0.5 + 0.25 * (1 - ss(-0.5 * L.a, -0.5 * L.a + 0.62 * L.a * (L.narrow ? 1 : 0.6), xs)) + 0.035 * (lr(u) - 0.5)));
    }
    x.lineTo(W * 0.62, H); x.fill();
  }

  function cached() {
    const key = `${target.env.join(',')}|${target.tint.join(',')}|${W}x${H}`;
    if (key !== beyondKey) {
      let x;
      [beyond, x] = offscreen(W, H, DPR);
      paintBeyond(x, W, H, cityArt, { env: target.env, tint: target.tint });
      beyondKey = key;
    }
    return beyond;
  }

  /* the ring, the stack, the cables: everything above the water that moves */
  function drawUpper(x, t) {
    x.clearRect(0, 0, W, H);
    x.drawImage(bg, 0, 0, W, H);
    const hov = now.hover;
    const [mx, my] = now.mouse;
    const R = L.portal[2] * H;
    const [Cx, Cy] = S(L.portal[0], L.portal[1]);
    const [Vx, Vy] = S(0, L.hz);
    const par = (k) => [mx * R * 0.05 * k, my * R * 0.03 * k];
    const [ox, oy] = par(1);
    const C = [Cx + ox, Cy + oy];
    const f = 1 / (1 + DEPTH);
    const Cb = [Vx + (C[0] - Vx) * f, Vy + (C[1] - Vy) * f];
    const Ri = R * 0.78;
    const intro = 1;
    /* the outer wall: the tube's side, swept from its far end to its near end */
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const c = 10 + Math.round(u * 10);
      x.fillStyle = `rgb(${c},${c + 3},${c + 10})`;
      x.beginPath(); x.arc(mix(Cb[0], C[0], u), mix(Cb[1], C[1], u), mix(R * f, R, u), 0, TAU); x.fill();
    }
    /* the dial: thirty-five blocks, one for each world */
    const Cd = [Vx + (C[0] - Vx) / 0.95, Vy + (C[1] - Vy) / 0.95];
    for (let i = 0; i < 35; i++) {
      const a = -(Math.PI / 2 + dialRot - ((i + 0.5) / 35) * TAU);
      const half = (0.43 * TAU) / 35;
      const hot = i === target.dialHot;
      const r0 = (1.035 + (hot ? 0.03 : 0)) * R / 0.95, r1 = (1.13 + (hot ? 0.03 : 0)) * R / 0.95;
      x.fillStyle = hot ? '#2a3040' : '#151924';
      x.beginPath(); x.arc(Cd[0], Cd[1], r1, a - half, a + half); x.arc(Cd[0], Cd[1], r0, a + half, a - half, true); x.fill();
      const seen = i < 18 ? Math.floor(target.seen[0] / 2 ** i) % 2 : Math.floor(target.seen[1] / 2 ** (i - 18)) % 2;
      const ign = ss((i + 0.5) / 35 - 0.03, (i + 0.5) / 35, (intro - 0.52) / 0.3);
      x.strokeStyle = hot ? 'rgba(255,246,230,0.95)' : seen ? `rgba(255,214,160,${0.9 * ign})` : `rgba(110,200,185,${0.35 * ign})`;
      x.lineWidth = Math.max(1, R * 0.012);
      x.beginPath(); x.arc(Cd[0], Cd[1], (r0 + r1) / 2, a - half * 0.5, a + half * 0.5); x.stroke();
    }
    /* the front face */
    const face = x.createLinearGradient(C[0] - R, C[1] - R, C[0] + R, C[1] + R);
    face.addColorStop(0, '#1c202b');
    face.addColorStop(1, '#07090f');
    x.fillStyle = face;
    x.beginPath(); x.arc(C[0], C[1], R, 0, TAU); x.arc(C[0], C[1], Ri, 0, TAU, true); x.fill('evenodd');
    x.strokeStyle = 'rgba(0,0,0,0.4)';
    x.lineWidth = 1;
    for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; x.beginPath(); x.moveTo(C[0] + Math.cos(a) * Ri, C[1] + Math.sin(a) * Ri); x.lineTo(C[0] + Math.cos(a) * R, C[1] + Math.sin(a) * R); x.stroke(); }
    x.strokeStyle = `rgba(110,210,190,${(0.22 + 0.3 * hov) * ss(0.55, 0.8, intro)})`;
    for (const k of [0.46, 0.74]) { x.beginPath(); x.arc(C[0], C[1], Ri + (R - Ri) * k, 0, TAU); x.stroke(); }
    /* the bore, lit from its far opening, and the opening itself */
    x.save();
    x.beginPath(); x.arc(C[0], C[1], Ri, 0, TAU); x.clip();
    const bore = x.createRadialGradient(Cb[0], Cb[1], Ri * f * 0.9, Cb[0], Cb[1], Ri * 1.4);
    bore.addColorStop(0, `rgba(214,180,150,${0.85 * ss(0.4, 0.7, intro)})`);
    bore.addColorStop(1, '#0a0c14');
    x.fillStyle = bore;
    x.fillRect(C[0] - R, C[1] - R, R * 2, R * 2);
    x.strokeStyle = 'rgba(110,210,190,0.14)';
    for (let j = 1; j <= 6; j++) { const u = j / 7; x.beginPath(); x.arc(mix(C[0], Cb[0], u), mix(C[1], Cb[1], u), mix(Ri, Ri * f, u), 0, TAU); x.stroke(); }
    x.beginPath(); x.arc(Cb[0], Cb[1], Ri * f, 0, TAU); x.clip();
    const b = cached();
    const bw = Ri * f * 2 / 0.78;
    x.globalAlpha = ss(0.45, 0.73, intro);
    x.drawImage(b, Cb[0] - bw * 0.8, Cb[1] - bw * 0.5 * (H / W) * 1.6 - mx * 6, bw * 1.6, bw * 1.6 * (H / W));
    x.globalAlpha = 1;
    x.restore();
    x.strokeStyle = 'rgba(255,246,232,0.9)';
    x.lineWidth = 1.3;
    x.beginPath(); x.arc(C[0], C[1], Ri, 0, TAU); x.stroke();
    if (hov > 0.05) {
      x.lineWidth = 1;
      x.strokeStyle = `rgba(255,120,140,${0.35 * hov})`; x.beginPath(); x.arc(C[0], C[1], Ri - 2, 0, TAU); x.stroke();
      x.strokeStyle = `rgba(120,200,255,${0.35 * hov})`; x.beginPath(); x.arc(C[0], C[1], Ri + 2, 0, TAU); x.stroke();
    }
    /* the orbit of light, with its pulses */
    x.strokeStyle = `rgba(150,230,210,${0.22 * ss(0.72, 0.95, intro)})`;
    x.beginPath(); x.arc(C[0], C[1], R * 1.27, 0, TAU); x.stroke();
    for (let i = 0; i < 3; i++) {
      const a = -(t * (0.22 + 0.25 * hov) + i * 2.0944);
      const g = x.createRadialGradient(C[0] + Math.cos(a) * R * 1.27, C[1] + Math.sin(a) * R * 1.27, 0, C[0] + Math.cos(a) * R * 1.27, C[1] + Math.sin(a) * R * 1.27, 8);
      g.addColorStop(0, `rgba(170,240,220,${0.9 * ss(0.72, 0.95, intro)})`);
      g.addColorStop(1, 'rgba(170,240,220,0)');
      x.fillStyle = g;
      x.fillRect(C[0] + Math.cos(a) * R * 1.27 - 8, C[1] + Math.sin(a) * R * 1.27 - 8, 16, 16);
    }
    /* cables, to the stack and to the cliff */
    const ringPt = (ang) => [C[0] + Math.cos(ang) * R, C[1] - Math.sin(ang) * R];
    const cable = (p0, p1, sag) => { x.beginPath(); x.moveTo(...p0); x.quadraticCurveTo((p0[0] + p1[0]) / 2, Math.max(p0[1], p1[1]) + sag * H, ...p1); x.stroke(); };
    x.strokeStyle = 'rgba(4,6,10,0.95)';
    x.lineWidth = 1.6;
    const cliffAt = (y) => S(L.cliff[0] + 0.004 - 0.045 * ss(-0.25, 0.5, y), y);
    if (L.light) cable(S(L.cliff[1] + 0.008, L.cliff[2] - 0.004), ringPt(2.55), 0.04);
    cable(ringPt(0.62), cliffAt(0.39), 0.03);
    cable(ringPt(-0.3), cliffAt(0.02), 0.035);
    /* the sea stack and its lamp */
    if (L.light) {
      const [sx] = S(L.cliff[1], 0);
      const [, base] = S(0, L.hz - EYE / 0.8);
      const [, top] = S(0, L.cliff[2]);
      const jag = curve(seeded(71), 14);
      x.fillStyle = '#0b0e18';
      x.beginPath();
      const steps = 30;
      for (let i = 0; i <= steps; i++) { const u = i / steps; const w = mix(0.052, 0.012, Math.pow(u, 0.55)) * H * (0.8 + 0.4 * jag(u)); x.lineTo(sx + w + u * u * 0.012 * H, mix(base, top, u)); }
      for (let i = steps; i >= 0; i--) { const u = i / steps; const w = mix(0.052, 0.012, Math.pow(u, 0.55)) * H * (0.8 + 0.4 * jag(1 - u)); x.lineTo(sx - w + u * u * 0.012 * H, mix(base, top, u)); }
      x.fill();
      const [lx, ly] = S(L.light[0], L.light[1]);
      x.fillStyle = '#0b0e18';
      x.fillRect(lx - 2.5, ly, 5, top - ly);
      const lg = x.createRadialGradient(lx, ly, 0, lx, ly, 10 + 40 * now.lamp);
      lg.addColorStop(0, `rgba(255,224,160,${0.5 + 0.5 * now.lamp})`);
      lg.addColorStop(1, 'rgba(255,224,160,0)');
      x.fillStyle = lg;
      x.fillRect(lx - 60, ly - 60, 120, 120);
    }
  }

  /* the threshold, composed into one picture whenever something in it changes */
  let frameCanvas = null, frameX = null, dirty = true;
  function compose(t) {
    if (!frameCanvas || frameCanvas.width !== canvas.width) [frameCanvas, frameX] = offscreen(W, H, DPR);
    drawUpper(upx, t);
    const x = frameX;
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.clearRect(0, 0, W, H);
    x.drawImage(up, 0, 0, W, H);
    /* the water: the scene above it again, upside down, strip by strip */
    const hzY = S(0, L.hz)[1];
    const step = 3;
    for (let y = hzY; y < H; y += step) {
      const src = 2 * hzY - y;
      if (src < 0) break;
      const kk = (y - hzY) / (H - hzY);
      const shift = Math.sin(y * 0.09 - t * 1.7) * (1 + (y - hzY) * 0.04) + Math.sin(y * 0.031 + t * 0.8) * 2.2;
      x.globalAlpha = 0.5 * (1 - kk * 0.85);
      x.drawImage(up, 0, Math.floor(src * DPR), up.width, Math.max(1, Math.ceil(step * DPR)), shift, y, W, step);
    }
    x.globalAlpha = 1;
    x.drawImage(fg, 0, 0, W, H);
    dirty = false;
  }

  function draw(ts) {
    raf = 0;
    if (!alive || !L) return;
    const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0);
    last = ts;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
    const before = now.hover + now.lamp;
    now.hover += (target.hover - now.hover) * k;
    now.lamp += (target.lamp - now.lamp) * k;
    if (Math.abs(now.hover + now.lamp - before) > 0.002) dirty = true;
    const t = reduced ? 30 : (ts - t0) / 1000;
    dialRot = reduced ? 0 : t * DIAL_SPEED;
    const e = target.travel;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    if (e >= 0.999) {
      ctx.drawImage(cached(), 0, 0, W, H);
    } else {
      if (dirty) compose(t);
      /* the crossing: everything swells round the far opening, then the world beyond takes over */
      const zoom = 1 + 14 * e * e;
      const [Cx, Cy] = S(L.portal[0], L.portal[1]);
      const [Vx, Vy] = S(0, L.hz);
      const f = 1 / (1 + DEPTH);
      const fx = Vx + (Cx - Vx) * f, fy = Vy + (Cy - Vy) * f;
      ctx.save();
      ctx.translate(fx * (1 - zoom), fy * (1 - zoom));
      ctx.scale(zoom, zoom);
      ctx.drawImage(frameCanvas, 0, 0, W, H);
      ctx.restore();
      if (e > 0.6) { ctx.globalAlpha = ss(0.6, 0.98, e); ctx.drawImage(cached(), 0, 0, W, H); ctx.globalAlpha = 1; }
    }
    /* the opening: the whole picture rises out of the dark */
    if (target.intro < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - ss(0, 1, target.intro)})`; ctx.fillRect(0, 0, W, H); }
    frames++;
    if (ts - fpsT > 1000) { stats.fps = Math.round((frames * 1000) / (ts - fpsT)); frames = 0; fpsT = ts; }
    /* keep drawing only while something is still changing */
    const settling = Math.abs(now.hover - target.hover) > 0.002 || Math.abs(now.lamp - target.lamp) > 0.002 || target.intro < 1;
    if (visible && !document.hidden && settling && e < 0.999) kick();
  }
  function kick() { if (!raf && alive) raf = requestAnimationFrame(draw); }

  const ro = new ResizeObserver(() => { layout(); dirty = true; last = 0; kick(); });
  ro.observe(canvas);
  const onVis = () => { if (!document.hidden) { last = 0; kick(); } };
  document.addEventListener('visibilitychange', onVis);
  layout();
  kick();

  return {
    set(values) {
      for (const [key, v] of Object.entries(values)) {
        if (['dialHot', 'seen'].includes(key) && String(target[key]) !== String(v)) dirty = true;
        target[key] = Array.isArray(v) ? [...v] : v;
      }
      kick();
    },
    setVisible(v) { visible = v; if (v) { last = 0; kick(); } },
    layout: () => L,
    dialAt: (px, py) => dialAt(L, [(px - W / 2) / H, (H / 2 - py) / H], dialRot),
    dialPoint: (i) => toScreen(dialPoint(L, i, dialRot), W, H),
    size: () => [W, H],
    stats: () => ({ ...stats, intro: target.intro, travel: target.travel, alt: target.alt }),
    redraw() { dirty = true; last = 0; kick(); },
    setScale() {},
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}

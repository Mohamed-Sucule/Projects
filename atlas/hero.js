/* atlas/hero.js — the first screen: a portal, a floating city and the water under both.

   One canvas, no image files. The sky, the city and the far islands are drawn
   once per resize into offscreen canvases; each frame then composes them with
   the parts that move (stars, the portal's rim and its swirl, the city's slow
   bob) into a "scene" above the horizon, and builds the water by copying that
   scene back upside down, one strip at a time, each strip pushed sideways by a
   pair of travelling waves. That is the whole reflection trick, and it is why
   the portal and the city really are in the water rather than painted there.

   The cursor leans every layer by an amount set by its depth, tips the portal
   towards it and pulls the swirl off centre. Off screen, in a background tab, or
   for someone who has asked for reduced motion, it stops: reduced motion gets a
   single still frame that still answers hover and click. */

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

/* ── things drawn once ─────────────────────────────────────────────────── */

function buildSky(w, h, dpr, portal) {
  const [c, x] = offscreen(w, h, dpr);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#080B14');
  g.addColorStop(0.5, '#0e1730');
  g.addColorStop(0.85, '#1a2747');
  g.addColorStop(1, '#2a2f4e');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const rand = seeded(7);
  /* Nebula: soft clouds, densest around the portal so the eye goes there. */
  const blobs = [[portal.x, portal.y, 0.9, '113,142,200', 0.22], [portal.x - w * 0.25, h * 0.3, 0.7, '113,142,200', 0.12],
    [portal.x + w * 0.12, h * 0.15, 0.5, '154,230,208', 0.07], [w * 0.12, h * 0.55, 0.6, '232,199,170', 0.06]];
  for (let i = 0; i < 7; i++) blobs.push([rand() * w, rand() * h * 0.8, 0.3 + rand() * 0.4, '113,142,200', 0.05 + rand() * 0.06]);
  for (const [bx, by, k, col, a] of blobs) {
    const rad = Math.max(w, h) * 0.45 * k;
    const rg = x.createRadialGradient(bx, by, 0, bx, by, rad);
    rg.addColorStop(0, `rgba(${col},${a})`);
    rg.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = rg;
    x.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
  }
  /* A warm band low in the sky, as if the light were coming from beyond the horizon. */
  const band = x.createLinearGradient(0, h * 0.72, 0, h);
  band.addColorStop(0, 'rgba(232,199,170,0)');
  band.addColorStop(1, 'rgba(232,199,170,0.12)');
  x.fillStyle = band;
  x.fillRect(0, h * 0.72, w, h * 0.28);
  const n = Math.round((w * h) / 2600);
  for (let i = 0; i < n; i++) {
    const sx = rand() * w;
    const sy = Math.pow(rand(), 1.4) * h * 0.95;
    const a = 0.15 + rand() * 0.55;
    x.fillStyle = `rgba(232,236,255,${a})`;
    const s = rand() < 0.08 ? 1.6 : 0.9;
    x.fillRect(sx, sy, s, s);
  }
  return c;
}

/* The far islands: flat silhouettes with a lit edge, small enough to read as distance. */
function buildFar(w, h, dpr) {
  const [c, x] = offscreen(w, h, dpr);
  const rand = seeded(23);
  const spots = [[0.08, 0.3, 0.05], [0.2, 0.18, 0.03], [0.46, 0.22, 0.025], [0.86, 0.2, 0.04], [0.94, 0.48, 0.03], [0.4, 0.55, 0.02]];
  for (const [fx, fy, fs] of spots) {
    const cx = fx * w;
    const cy = fy * h;
    const s = fs * Math.max(w, 900);
    x.beginPath();
    x.moveTo(cx - s, cy);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      x.lineTo(cx - s + t * 2 * s, cy + Math.sin(Math.PI * t) * s * (0.8 + rand() * 0.5));
    }
    x.closePath();
    x.fillStyle = 'rgba(20,30,56,0.75)';
    x.fill();
    x.beginPath();
    x.ellipse(cx, cy, s, s * 0.14, 0, 0, TAU);
    x.fillStyle = 'rgba(64,88,130,0.7)';
    x.fill();
    for (let k = 0; k < 3; k++) {
      const tw = s * (0.12 + rand() * 0.12);
      const th = s * (0.3 + rand() * 0.9);
      const tx = cx - s * 0.6 + rand() * s * 1.2;
      x.fillStyle = 'rgba(28,40,70,0.95)';
      x.fillRect(tx, cy - th, tw, th);
      if (rand() < 0.7) { x.fillStyle = `${LIT}0.8)`; x.fillRect(tx + tw * 0.35, cy - th * 0.7, Math.max(1, tw * 0.3), Math.max(1, tw * 0.3)); }
    }
  }
  return c;
}

/* The floating city: a mountain of rock with towers on top, a second city hanging
   upside down beneath it, a stair that climbs into nothing, and a waterfall that
   pours off the edge and never lands. Lit from the right, where the portal is. */
function buildCity(size, dpr) {
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

/* ── the moving parts ───────────────────────────────────────────────────── */

export function startWorld(canvas, { art = null, onPortal = () => {}, onHover = () => {}, reduced = false } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, horizon = 0, narrow = false;
  let portal = { x: 0, y: 0, rx: 0, ry: 0 };
  let sky, far, city, scene, sctx;
  let particles = [];
  let motes = [];
  let twinkles = [];
  let mx = 0, my = 0, tx = 0, ty = 0;
  let hover = false, hoverAmt = 0;
  let t = 2.4, last = 0, raf = 0, visible = true, alive = true;
  let image = art;
  /* If frames keep coming in slow (an old phone, a busy laptop), draw fewer
     pixels: up to two steps down in resolution, never back up in a visit. */
  let quality = 1, slow = 0, sampled = 0;

  function layout() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return;
    narrow = W < 760;
    DPR = Math.min(window.devicePixelRatio || 1, narrow ? 1.25 : 1.5) * quality;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    horizon = Math.round(H * (narrow ? 0.76 : 0.7));
    const ry = Math.min(H * (narrow ? 0.15 : 0.27), W * (narrow ? 0.34 : 0.26));
    portal = { x: W * (narrow ? 0.64 : 0.66), y: H * (narrow ? 0.23 : 0.38), ry, rx: ry * 0.66 };
    sky = buildSky(W, horizon, DPR, portal);
    far = buildFar(W, horizon, DPR);
    const size = Math.min(W * (narrow ? 0.5 : 0.3), H * 0.56, 480);
    city = buildCity(size, DPR);
    /* Up and to the left, so its land sits above the headline and only its dark rock is behind the words. */
    city.at = narrow ? { x: -W * 0.04, y: H * 0.2 - city.capY } : { x: W * 0.07, y: H * 0.31 - city.capY };
    [scene, sctx] = offscreen(W, horizon, DPR);
    const rand = seeded(42);
    particles = Array.from({ length: narrow ? 240 : 520 }, () => ({
      a: rand() * TAU, r: rand(), s: 0.5 + rand() * 0.9, z: rand() < 0.2 ? 2 : 1, warm: rand() < 0.35,
    }));
    motes = Array.from({ length: narrow ? 26 : 50 }, () => ({ x: rand() * W, y: rand() * horizon, v: 4 + rand() * 10, p: rand() * TAU }));
    twinkles = Array.from({ length: 70 }, () => ({ x: rand() * W, y: Math.pow(rand(), 1.5) * horizon * 0.9, p: rand() * TAU, s: 0.6 + rand() * 1.8 }));
  }

  /* Where the portal is drawn this frame, after parallax: hit-testing uses the same numbers. */
  function portalNow() {
    const k = narrow ? 0.4 : 1;
    return { x: portal.x + mx * W * 0.018 * k, y: portal.y + my * H * 0.012 * k, rx: portal.rx, ry: portal.ry, tilt: mx * 0.07 };
  }

  function drawPortal(c, dt) {
    const p = portalNow();
    const glow = 0.55 + hoverAmt * 0.45;
    /* the halo */
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.tilt);
    c.scale(p.rx / p.ry, 1);
    const halo = c.createRadialGradient(0, 0, p.ry * 0.7, 0, 0, p.ry * 2.1);
    halo.addColorStop(0, `rgba(154,230,208,${0.22 * glow})`);
    halo.addColorStop(0.45, `rgba(113,142,200,${0.1 * glow})`);
    halo.addColorStop(1, 'rgba(113,142,200,0)');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(0, 0, p.ry * 2.1, 0, TAU);
    c.fill();
    c.restore();

    /* the other side: a deeper sky, and the featured island floating in it */
    c.save();
    c.beginPath();
    c.ellipse(p.x, p.y, p.rx * 0.97, p.ry * 0.97, p.tilt, 0, TAU);
    c.clip();
    const inside = c.createRadialGradient(p.x - mx * p.rx * 0.2, p.y - my * p.ry * 0.2, 0, p.x, p.y, p.ry);
    inside.addColorStop(0, '#34507e');
    inside.addColorStop(0.55, '#162444');
    inside.addColorStop(1, '#070a13');
    c.fillStyle = inside;
    c.fillRect(p.x - p.rx, p.y - p.ry, p.rx * 2, p.ry * 2);
    if (image && image.complete && image.naturalWidth) {
      const iw = p.rx * 1.55;
      const ih = iw * (image.naturalHeight / image.naturalWidth);
      c.globalAlpha = 0.6 + hoverAmt * 0.4;
      c.drawImage(image, p.x - iw / 2 - mx * p.rx * 0.18, p.y - ih * 0.46 + Math.sin(t * 0.8) * 4 - my * p.ry * 0.12, iw, ih);
      c.globalAlpha = 1;
    }
    /* the swirl, pulled towards the cursor */
    c.globalCompositeOperation = 'lighter';
    const cos = Math.cos(p.tilt);
    const sin = Math.sin(p.tilt);
    const bright = 0.7 + hoverAmt * 0.5;
    /* Two passes, one colour each, alpha set per grain: no colour strings built per frame. */
    for (const warm of [false, true]) {
      c.fillStyle = warm ? '#E8C7AA' : '#9AE6D0';
      for (const q of particles) {
        if (q.warm !== warm) continue;
        if (dt) {
          q.a += dt * (0.18 + 1.1 * (1 - q.r)) * q.s;
          q.r -= dt * 0.035 * q.s;
          if (q.r < 0.04) q.r = 1;
        }
        const pull = (1 - q.r) * 0.22;
        const lx = Math.cos(q.a) * p.rx * q.r + mx * p.rx * pull;
        const ly = Math.sin(q.a) * p.ry * q.r + my * p.ry * pull;
        c.globalAlpha = Math.min(1, (0.25 + 0.6 * q.r) * bright);
        c.fillRect(p.x + lx * cos - ly * sin, p.y + lx * sin + ly * cos, q.z * 1.2, q.z * 1.2);
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.restore();

    /* the rim */
    c.save();
    const ring = (k, w, style, dash = null, offset = 0) => {
      c.beginPath();
      c.ellipse(p.x, p.y, p.rx * k, p.ry * k, p.tilt, 0, TAU);
      c.lineWidth = w;
      c.strokeStyle = style;
      c.setLineDash(dash || []);
      c.lineDashOffset = offset;
      c.stroke();
    };
    ring(1.0, 16, `rgba(232,199,170,${0.07 * glow})`);
    ring(1.0, 6, `rgba(154,230,208,${0.32 + 0.3 * hoverAmt})`);
    ring(1.0, 1.8, 'rgba(255,246,232,0.95)');
    ring(1.07, 2.2, `rgba(232,199,170,${0.55 + 0.3 * hoverAmt})`, [p.ry * 0.5, p.ry * 0.32], -t * 28);
    ring(1.15, 1, 'rgba(113,142,200,0.45)', [2, 10], t * 12);
    c.setLineDash([]);
    /* a column of light down into the water */
    const col = c.createLinearGradient(0, p.y + p.ry, 0, horizon);
    col.addColorStop(0, `rgba(154,230,208,${0.28 * glow})`);
    col.addColorStop(1, 'rgba(154,230,208,0)');
    c.fillStyle = col;
    c.fillRect(p.x - 1.5, p.y + p.ry, 3, horizon - p.y - p.ry);
    c.restore();
  }

  function compose(dt) {
    const c = sctx;
    c.clearRect(0, 0, W, horizon);
    c.drawImage(sky, 0, 0, W, horizon);
    c.fillStyle = '#f0f0ff';
    for (const s of twinkles) {
      c.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.s + s.p));
      c.fillRect(s.x + mx * 2, s.y + my * 2, 1.4, 1.4);
    }
    c.globalAlpha = 1;
    c.drawImage(far, mx * W * 0.006, my * H * 0.004, W, horizon);
    drawPortal(c, dt);
    const bob = Math.sin(t * 0.45) * 7;
    c.drawImage(city.canvas, city.at.x + mx * W * 0.03, city.at.y + bob + my * H * 0.02, city.w, city.h);
    /* drifting motes of light, the nearest layer */
    c.fillStyle = '#E8C7AA';
    for (const m of motes) {
      if (dt) { m.y -= m.v * dt; m.x += Math.sin(t + m.p) * dt * 6; if (m.y < 0) m.y = horizon; }
      c.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 0.7 + m.p));
      c.fillRect(m.x + mx * W * 0.05, m.y + my * H * 0.03, 1.6, 1.6);
    }
    c.globalAlpha = 1;
    /* mist sitting on the horizon */
    const mist = c.createLinearGradient(0, horizon - H * 0.08, 0, horizon);
    mist.addColorStop(0, 'rgba(113,142,200,0)');
    mist.addColorStop(1, 'rgba(113,142,200,0.16)');
    c.fillStyle = mist;
    c.fillRect(0, horizon - H * 0.08, W, H * 0.08);
  }

  function frame(now) {
    if (!alive) return;
    const gap = last ? now - last : 0;
    const dt = reduced ? 0 : Math.min(0.05, gap / 1000);
    last = now;
    if (!reduced && gap && gap < 200 && quality > 0.6) {
      sampled++;
      if (gap > 30) slow++;
      if (sampled === 60) {
        if (slow > 40) { quality = Math.max(0.6, quality - 0.2); layout(); }
        sampled = 0;
        slow = 0;
      }
    }
    t += dt;
    mx += (tx - mx) * Math.min(1, dt * 3 || 1);
    my += (ty - my) * Math.min(1, dt * 3 || 1);
    hoverAmt += ((hover ? 1 : 0) - hoverAmt) * Math.min(1, dt * 5 || 1);
    compose(dt);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(scene, 0, 0, W, horizon);
    /* the water: the scene again, upside down, strip by strip */
    const depth = H - horizon;
    const water = ctx.createLinearGradient(0, horizon, 0, H);
    water.addColorStop(0, '#16203a');
    water.addColorStop(1, '#05070d');
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, W, depth);
    const step = narrow ? 3 : 2;
    for (let y = 0; y < depth; y += step) {
      const src = horizon - 1 - y * 1.15;
      if (src < 0) break;
      const k = y / depth;
      const shift = Math.sin(y * 0.09 - t * 1.7) * (1 + y * 0.05) + Math.sin(y * 0.031 + t * 0.8) * 2.2;
      ctx.globalAlpha = 0.62 * (1 - k * 0.85);
      ctx.drawImage(scene, 0, Math.floor(src * DPR), scene.width, Math.max(1, Math.ceil(step * DPR)), shift, horizon + y, W, step);
    }
    ctx.globalAlpha = 1;
    /* glints under the portal, and a fine line where water meets sky */
    const p = portalNow();
    for (let i = 0; i < 18; i++) {
      const gy = horizon + 6 + i * (depth / 20);
      const gw = (12 + (i % 5) * 9) * (1 + hoverAmt * 0.6);
      const ga = (0.12 + 0.2 * Math.abs(Math.sin(t * 1.3 + i))) * (1 - i / 20);
      ctx.fillStyle = `rgba(154,230,208,${ga})`;
      ctx.fillRect(p.x - gw / 2 + Math.sin(t + i) * 6, gy, gw, 1);
    }
    ctx.fillStyle = 'rgba(232,199,170,0.22)';
    ctx.fillRect(0, horizon, W, 1);

    if (!reduced && visible && !document.hidden) raf = requestAnimationFrame(frame);
    else raf = 0;
  }

  function kick() {
    if (!raf && alive) raf = requestAnimationFrame(frame);
  }

  function inPortal(x, y) {
    const p = portalNow();
    const dx = x - p.x;
    const dy = y - p.y;
    const cos = Math.cos(-p.tilt);
    const sin = Math.sin(-p.tilt);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return (lx / p.rx) ** 2 + (ly / p.ry) ** 2 < 1.08;
  }

  function onMove(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (!reduced) {
      tx = (x / rect.width) * 2 - 1;
      ty = (y / rect.height) * 2 - 1;
    }
    const h = inPortal(x, y);
    if (h !== hover) {
      hover = h;
      canvas.style.cursor = h ? 'pointer' : '';
      onHover(h, portalNow());
    }
    kick();
  }
  function onLeave() {
    tx = 0; ty = 0;
    if (hover) { hover = false; canvas.style.cursor = ''; onHover(false, portalNow()); }
    kick();
  }
  function onClick(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (inPortal(x, y)) { const p = portalNow(); onPortal(p.x + rect.left, p.y + rect.top); }
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);
  const ro = new ResizeObserver(() => { layout(); last = 0; frame(performance.now()); });
  ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) { last = 0; kick(); } });
  io.observe(canvas);
  const onVis = () => { if (!document.hidden) { last = 0; kick(); } };
  document.addEventListener('visibilitychange', onVis);
  layout();
  frame(performance.now());

  return {
    portal: () => { const rect = canvas.getBoundingClientRect(); const p = portalNow(); return { x: p.x + rect.left, y: p.y + rect.top, rx: p.rx, ry: p.ry }; },
    setArt(img) { image = img; if (img && !img.complete) img.addEventListener('load', () => { last = 0; frame(performance.now()); }, { once: true }); kick(); },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}

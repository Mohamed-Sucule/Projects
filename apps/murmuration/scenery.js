/* apps/murmuration/scenery.js — everything that is not a bird: the sky and
   its clouds, the far bank, the water with the sun's track on it, and the
   reedbed in front, lit from behind and moving in the wind.

   The sky is repainted a few times a second as the light goes. The reeds are
   drawn once for each size of screen, in three depths, and laid over the
   picture every frame with a little lean that comes and goes with the wind.
   Everything is drawn from a seed, so it is the same marsh every evening. */

import { horizon, random } from './field.js';

/* The light, at its best and once it has gone. */
const GOLD = { top: [40, 54, 116], mid: [156, 102, 148], low: [255, 182, 122], glow: [255, 230, 186], cloud: [255, 196, 170], shade: [118, 82, 128] };
const DUSK = { top: [12, 16, 42], mid: [52, 46, 88], low: [170, 92, 90], glow: [222, 146, 118], cloud: [150, 92, 112], shade: [34, 28, 54] };
const mixc = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function createScenery(skyCanvas, reedCanvas) {
  const sky = skyCanvas.getContext('2d');
  const reeds = reedCanvas.getContext('2d');
  let W = 1, H = 1, dpr = 1, hy = 0, sx = 0;
  let cam = null;
  let clouds = [], stars = [], bank = [], layers = [], ground = null;
  let haze = [0.6, 0.45, 0.55];

  /* A fine grain over the sky, so its long gradients do not band into steps. */
  const grain = document.createElement('canvas');
  grain.width = grain.height = 160;
  {
    const g = grain.getContext('2d');
    const img = g.createImageData(160, 160);
    const rand = random(31);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rand() - 0.5) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const grainPattern = sky.createPattern(grain, 'repeat');

  function resize(width, height, ratio, camera) {
    W = width; H = height; dpr = ratio; cam = camera;
    hy = horizon(cam) * H;
    sx = W * (W > H ? 0.7 : 0.62);
    const rand = random(17);

    /* Clouds: long, thin bands low in the sky, each a run of soft puffs. */
    clouds = [];
    const bands = W > H ? 8 : 6;
    for (let b = 0; b < bands; b++) {
      const y = hy * (0.32 + rand() * 0.55);
      const x0 = rand() * W * 1.1 - W * 0.1;
      const len = W * (0.18 + rand() * 0.34);
      const tilt = (rand() - 0.5) * 0.04;
      const thick = H * (0.006 + rand() * 0.012) * (0.6 + (y / hy));
      const puffs = [];
      const n = 7 + Math.floor(rand() * 9);
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1);
        puffs.push({ x: x0 + u * len + (rand() - 0.5) * len * 0.08, y: y + u * len * tilt + (rand() - 0.5) * thick, rx: len * (0.08 + rand() * 0.12), ry: thick * (0.6 + rand() * 0.8), a: 0.5 + rand() * 0.5 });
      }
      clouds.push({ y, puffs });
    }

    /* The first stars, for after the light has gone. */
    stars = Array.from({ length: Math.round((W * hy) / 9000) }, () => ({ x: rand() * W, y: rand() ** 1.5 * hy * 0.75, r: 0.4 + rand() ** 4 * 1.1, a: 0.35 + rand() * 0.65 }));

    /* The far bank: hedges and clumps of trees, each clump many small
       crowns of different sizes, so the line is ragged, as trees are. */
    bank = [];
    const phase = [rand() * 6, rand() * 6];
    const trees = [];
    for (let c = 0; c < Math.round(W / 85); c++) {
      const cx = rand() * W;
      const wide = 20 + rand() * 120;
      const tall = 0.4 + rand() ** 2 * 1.2;
      for (let k = 0; k < 4 + rand() * 10; k++) trees.push({ x: cx + (rand() - 0.5) * wide, r: H * (0.003 + rand() * 0.009) * tall, lift: rand() * H * 0.004 * tall });
    }
    for (let x = -4; x <= W + 4; x += 2) {
      let h = H * 0.003 + H * 0.0025 * (Math.sin(x * 0.009 + phase[0]) + 1) + H * 0.0012 * (Math.sin(x * 0.05 + phase[1]) + 1);
      for (const tr of trees) {
        const d = Math.abs(x - tr.x);
        if (d < tr.r) h = Math.max(h, Math.sqrt(tr.r * tr.r - d * d) * 0.9 + tr.lift);
      }
      bank.push([x, hy - h]);
    }

    paintReeds();
  }

  function paintSky(ev) {
    const k = 1 - ev.light;
    const c = Object.fromEntries(Object.keys(GOLD).map((key) => [key, mixc(GOLD[key], DUSK[key], k)]));
    haze = c.mid.map((x) => x / 255);
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);
    sky.globalCompositeOperation = 'source-over';
    sky.globalAlpha = 1;
    const g = sky.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, rgb(c.top));
    g.addColorStop(0.58, rgb(c.mid));
    g.addColorStop(1, rgb(c.low));
    sky.fillStyle = g;
    sky.fillRect(0, 0, W, hy + 2);

    /* The first stars, once the light has gone. */
    const night = Math.max(0, Math.min(1, (0.5 - ev.light) / 0.5));
    if (night > 0) {
      sky.fillStyle = '#fff6e6';
      for (const s of stars) {
        sky.globalAlpha = night * s.a * 0.8;
        sky.beginPath();
        sky.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        sky.fill();
      }
      sky.globalAlpha = 1;
    }

    /* The sun's glow over the whole sky, and the sun itself while it is up. */
    const perDegree = H / cam.fov;
    const sy = hy - ev.sun * perDegree;
    const r = Math.max(13, H * 0.03);
    const halo = sky.createRadialGradient(sx, Math.min(sy, hy), 0, sx, Math.min(sy, hy), Math.max(W, H) * 0.6);
    halo.addColorStop(0, rgb(c.glow, 0.8 * (0.3 + 0.7 * ev.light)));
    halo.addColorStop(0.18, rgb(c.low, 0.4 * ev.light + 0.12));
    halo.addColorStop(1, rgb(c.low, 0));
    sky.fillStyle = halo;
    sky.fillRect(0, 0, W, hy + 2);
    if (ev.sun > -1.5) {
      sky.save();
      sky.beginPath();
      sky.rect(0, 0, W, hy);
      sky.clip();
      const disc = sky.createRadialGradient(sx, sy, 0, sx, sy, r * 1.35);
      disc.addColorStop(0, 'rgba(255,252,238,1)');
      disc.addColorStop(0.62, 'rgba(255,232,180,1)');
      disc.addColorStop(0.75, 'rgba(255,206,150,.55)');
      disc.addColorStop(1, 'rgba(255,190,140,0)');
      sky.fillStyle = disc;
      sky.beginPath();
      sky.arc(sx, sy, r * 1.35, 0, Math.PI * 2);
      sky.fill();
      sky.restore();
    }

    /* Clouds: lit warm from below while the sun is up, the nearer the sun the
       brighter; grey-violet against the afterglow once it has gone. */
    for (const cl of clouds) {
      for (const p of cl.puffs) {
        const near = Math.max(0, 1 - Math.abs(p.x - sx) / (W * 0.6));
        const lit = mixc(c.shade, c.cloud, Math.min(1, ev.light * (0.45 + near * 0.8)));
        sky.save();
        sky.translate(p.x, p.y);
        sky.scale(1, p.ry / p.rx);
        const puff = sky.createRadialGradient(0, 0, 0, 0, 0, p.rx);
        puff.addColorStop(0, rgb(lit, 0.5 * p.a));
        puff.addColorStop(0.55, rgb(lit, 0.28 * p.a));
        puff.addColorStop(1, rgb(lit, 0));
        sky.fillStyle = puff;
        sky.beginPath();
        sky.arc(0, 0, p.rx, 0, Math.PI * 2);
        sky.fill();
        sky.restore();
      }
    }

    /* The far bank. */
    sky.fillStyle = rgb(mixc(mixc(c.mid, [40, 28, 52], 0.55), [16, 12, 28], k * 0.6));
    sky.beginPath();
    sky.moveTo(-4, hy + 3);
    for (const [x, y] of bank) sky.lineTo(x, y);
    sky.lineTo(W + 4, hy + 3);
    sky.fill();

    /* Open water in front of it, holding the last of the light, and the sun's track across it. */
    const water = sky.createLinearGradient(0, hy + 2, 0, H);
    water.addColorStop(0, rgb(mixc(c.low, [50, 34, 62], 0.4)));
    water.addColorStop(0.25, rgb(mixc(c.mid, [22, 16, 34], 0.55)));
    water.addColorStop(1, rgb(mixc(c.top, [8, 6, 14], 0.7)));
    sky.fillStyle = water;
    sky.fillRect(0, hy + 2, W, H - hy);
    const shine = Math.max(0, Math.min(1, (ev.sun + 3) / 5)) * ev.light;
    if (shine > 0.02) {
      const column = sky.createRadialGradient(sx, hy, 0, sx, hy, H * 0.12);
      column.addColorStop(0, rgb(c.glow, 0.45 * shine));
      column.addColorStop(1, rgb(c.glow, 0));
      sky.save();
      sky.translate(sx, hy);
      sky.scale(0.45, 1);
      sky.translate(-sx, -hy);
      sky.fillStyle = column;
      sky.fillRect(sx - H * 0.3, hy + 2, H * 0.6, H * 0.12);
      sky.restore();
      const ripple = random(3);
      for (let y = hy + 4; y < hy + H * 0.1; y += 1.6 + ripple() * 1.6) {
        const d = (y - hy) / (H * 0.1);
        const half = r * (0.4 + d * 2.6) * (0.3 + ripple() * 0.9);
        sky.fillStyle = rgb(c.glow, shine * (0.6 - d * 0.5) * (0.35 + ripple() * 0.65));
        sky.fillRect(sx - half + (ripple() - 0.5) * r * 0.8, y, half * 2, 0.9);
      }
    }

    /* Grain, faint, to keep the gradients smooth. */
    sky.globalAlpha = 0.045;
    sky.globalCompositeOperation = 'overlay';
    sky.fillStyle = grainPattern;
    sky.fillRect(0, 0, W, H);
    sky.globalAlpha = 1;
    sky.globalCompositeOperation = 'source-over';
  }

  /* ── the reedbed ── */

  /* One common reed: a stem, a few long leaves, and a soft plume that droops
     to one side. Drawn as silhouette; scale is how near it is. */
  function reed(g, x, base, top, scale, rand, plumed = true) {
    /* Most lean the same way: there is a breeze off the water. */
    const lean = (rand() - 0.28) * (base - top) * 0.12;
    const tx = x + lean, ty = top;
    const cx = x + lean * 0.2, cy = (base + top) / 2;
    g.lineWidth = 0.7 * scale + rand() * 0.5 * scale;
    g.beginPath();
    g.moveTo(x, base);
    g.quadraticCurveTo(cx, cy, tx, ty);
    g.stroke();
    /* Leaves: long blades off the stem, curving out and down. */
    const leaves = scale > 0.8 ? 2 + Math.floor(rand() * 3) : Math.floor(rand() * 2);
    for (let k = 0; k < leaves; k++) {
      const u = 0.35 + rand() * 0.45;
      const px = (1 - u) * (1 - u) * x + 2 * (1 - u) * u * cx + u * u * tx;
      const py = (1 - u) * (1 - u) * base + 2 * (1 - u) * u * cy + u * u * ty;
      const side = rand() < 0.5 ? -1 : 1;
      const len = (base - top) * (0.18 + rand() * 0.2);
      const w = 1.6 * scale;
      const ex = px + side * len * 0.85, ey = py - len * 0.15 + len * 0.45 * rand();
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo(px + side * len * 0.45, py - len * 0.45, ex, ey);
      g.quadraticCurveTo(px + side * len * 0.4, py - len * 0.38 + w, px, py + w * 2);
      g.fill();
    }
    if (!plumed) return;
    if (scale < 0.7) {
      /* Far off, a plume is just a small soft tuft at the top. */
      g.save();
      g.globalAlpha *= 0.7;
      g.translate(tx, ty);
      g.rotate((lean / (base - top)) * 4 + 0.25);
      g.beginPath();
      g.ellipse(0, -2.4 * scale, 1.1 * scale, 3.6 * scale, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      return;
    }
    /* The plume: a curved spine with fine fibres hanging from it. */
    const side = lean >= 0 ? 1 : -1;
    const len = (base - top) * (0.07 + rand() * 0.05) * Math.min(1.5, 0.55 + scale * 0.45);
    const ax = tx + side * len * 0.35, ay = ty - len * 0.25;
    const bx = tx + side * len * 0.75, by = ty + len * (0.15 + rand() * 0.35);
    const at = (u) => [(1 - u) * (1 - u) * tx + 2 * (1 - u) * u * ax + u * u * bx, (1 - u) * (1 - u) * ty + 2 * (1 - u) * u * ay + u * u * by];
    g.save();
    g.globalAlpha *= 0.38;
    g.beginPath();
    for (let u = 0; u <= 1.001; u += 0.1) {
      const [px, py] = at(u);
      const wdt = Math.sin(Math.PI * Math.min(1, u * 1.1)) * len * 0.16;
      if (u === 0) g.moveTo(px, py - wdt); else g.lineTo(px, py - wdt);
    }
    for (let u = 1; u >= -0.001; u -= 0.1) {
      const [px, py] = at(u);
      g.lineTo(px, py + Math.sin(Math.PI * Math.min(1, u * 1.1)) * len * 0.22);
    }
    g.fill();
    g.restore();
    g.lineWidth = 0.45 * scale;
    g.beginPath();
    const fibres = Math.round(16 + scale * 14);
    for (let k = 0; k < fibres; k++) {
      const u = 0.08 + (k / fibres) * 0.9;
      const [px, py] = at(u);
      const f = len * (0.12 + rand() * 0.16) * (1 - u * 0.4);
      const ang = Math.PI / 2 + side * (0.35 + rand() * 0.6);
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(ang) * f * side * 0.6 + side * f * 0.3, py + Math.sin(ang) * f);
    }
    g.stroke();
    g.lineWidth = 0.9 * scale;
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(ax, ay, bx, by);
    g.stroke();
  }

  /* Three depths of reeds, each with a copy lit warm where the sun is behind it. */
  function paintReeds() {
    const rand = random(9);
    const depths = [
      { colour: '#32253e', count: Math.round(W / 2.2), top: [hy + H * 0.014, hy + H * 0.055], base: hy + H * 0.12, scale: 0.5, plume: 0.55, lean: 0.004, rim: 0.85 },
      { colour: '#1d1426', count: Math.round(W / 3), top: [hy + H * 0.025, hy + H * 0.12], base: H, scale: 0.85, plume: 0.6, lean: 0.008, rim: 0.55 },
      { colour: '#0b080f', count: Math.round(W / 70) + 5, top: [H * 0.5, H * 0.78], base: H + 10, scale: 2.1, plume: 0.8, lean: 0.014, rim: 0.3, frame: true },
    ];
    layers = depths.map((d, n) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = d.colour;
      g.strokeStyle = d.colour;
      g.lineCap = 'round';
      if (n === 0) {
        /* The far edge of the reedbed, a soft dark band along the water. */
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, d.base - H * 0.02 + Math.sin(x * 0.013) * H * 0.006 + rand() * H * 0.006);
        g.lineTo(W, H);
        g.fill();
      }
      if (d.frame && 'filter' in g) g.filter = 'blur(1.2px)';
      for (let k = 0; k < d.count; k++) {
        /* The nearest reeds stand to either side, framing the view. */
        const x = d.frame ? (rand() < 0.5 ? rand() * W * 0.16 : W - rand() * W * 0.16) : rand() * W;
        const top = d.top[0] + rand() ** 0.7 * (d.top[1] - d.top[0]);
        reed(g, x, d.base, top, d.scale * (0.75 + rand() * 0.5), rand, rand() < d.plume);
      }
      g.filter = 'none';
      /* Backlit: the reeds nearest the sun glow with it. */
      const rim = document.createElement('canvas');
      rim.width = canvas.width;
      rim.height = canvas.height;
      const r = rim.getContext('2d');
      r.drawImage(canvas, 0, 0);
      r.setTransform(dpr, 0, 0, dpr, 0, 0);
      r.globalCompositeOperation = 'source-atop';
      /* A wide, flat glow along the horizon: the tops catch it, the stems below do not. */
      r.translate(sx, hy);
      r.scale(1, 0.22);
      const glow = r.createRadialGradient(0, 0, 0, 0, 0, W * 0.45);
      glow.addColorStop(0, 'rgba(255,196,140,.95)');
      glow.addColorStop(0.35, 'rgba(240,140,110,.5)');
      glow.addColorStop(1, 'rgba(200,110,110,0)');
      r.fillStyle = glow;
      r.fillRect(-W, -H * 5, W * 2, H * 10);
      return { canvas, rim, lean: d.lean, rimStrength: d.rim, phase: n * 1.7 };
    });
    /* The body of the reedbed, under the nearer stems: unlit, and still. */
    ground = document.createElement('canvas');
    ground.width = Math.round(W * dpr);
    ground.height = Math.round(H * dpr);
    const g = ground.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const body = g.createLinearGradient(0, hy + H * 0.06, 0, H);
    body.addColorStop(0, 'rgba(29,20,38,0)');
    body.addColorStop(0.22, 'rgba(26,18,34,.94)');
    body.addColorStop(1, '#0a0810');
    g.fillStyle = body;
    g.fillRect(0, hy + H * 0.06, W, H);
  }

  /* Lay the reeds over the picture, leaning with the wind. */
  function drawReeds(time, light, moving) {
    reeds.setTransform(1, 0, 0, 1, 0, 0);
    reeds.clearRect(0, 0, reedCanvas.width, reedCanvas.height);
    const gust = moving ? 0.6 + 0.4 * Math.sin(time * 0.23) : 0;
    layers.forEach((l, n) => {
      if (n === 1) reeds.drawImage(ground, 0, 0);
      const lean = moving ? l.lean * gust * (Math.sin(time * 0.9 + l.phase) * 0.7 + Math.sin(time * 2.3 + l.phase * 2) * 0.3) : 0;
      /* A shear about the bottom of the screen: the tops move, the roots stay. */
      reeds.setTransform(1, 0, lean, 1, -lean * reedCanvas.height, 0);
      reeds.globalAlpha = 1;
      reeds.drawImage(l.canvas, 0, 0);
      reeds.globalAlpha = Math.max(0, light) * l.rimStrength;
      reeds.drawImage(l.rim, 0, 0);
      reeds.setTransform(1, 0, 0, 1, 0, 0);
      reeds.globalAlpha = 1;
    });
    reeds.globalAlpha = 1;
    reeds.setTransform(1, 0, 0, 1, 0, 0);
  }

  return {
    resize,
    paintSky,
    drawReeds,
    get haze() { return haze; },
    get sunX() { return sx; },
  };
}

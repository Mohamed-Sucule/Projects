/* atlas/fx.js — what the world does around a chosen island, and two transitions.

   When a world is chosen, the space around it changes into a picture of what
   that project does: Tally's slips of paper file past a line that checks each
   one, Raft Lab's five servers pass a leader's heartbeat, Claims Desk's beam
   reads the fields of a form. Each family below is a short drawing routine,
   parameterised per project (worlds.js, `fx`), drawn at the island's focal
   point on a canvas that sits between the sky and the islands.

   The same module owns the threshold's near layer (dust that bends towards the
   portal when you approach it, rock fragments drifting in the air) and the two
   particle transitions: fragments assembling into the product panel, and a
   screenshot dissolving into the live app behind it. */

const TAU = Math.PI * 2;

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909) ^ (s += 0x9e3779b9)) >>> 0) / 4294967296;
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ── environment families ───────────────────────────────────────────── */
/* Each draws with: x (2d context), c (accent rgb), t (seconds), k (0..1 presence),
   o = { x, y, r } the focal point and size, v (variant). */

const STAR = [232, 199, 170];
const RED = [255, 107, 107];
const GREEN = [122, 209, 138];

function glowDot(x, px, py, rad, col, a) {
  const g = x.createRadialGradient(px, py, 0, px, py, rad);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  x.fillStyle = g;
  x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
}

const FAMILIES = {
  /* attention arcs between tokens / citation threads to sentences */
  neural(x, c, t, k, o, v) {
    if (v === 'attention') {
      const n = 11;
      const y0 = o.y - o.r * 1.05;
      const pts = Array.from({ length: n }, (_, i) => [o.x + (i - (n - 1) / 2) * o.r * 0.26, y0 + Math.sin(i * 0.9) * 6]);
      for (let i = 1; i < n; i++) {
        for (const j of [i - 1, Math.max(0, i - 3)]) {
          const strong = (i + Math.floor(t * 0.8)) % 5 === 0 && j === i - 3;
          const [ax, ay] = pts[i];
          const [bx, by] = pts[j];
          x.strokeStyle = rgba(strong ? STAR : c, (strong ? 0.85 : 0.22) * k);
          x.lineWidth = strong ? 2.2 : 1;
          x.beginPath();
          x.moveTo(ax, ay);
          x.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 30 - (i - j) * 14, bx, by);
          x.stroke();
        }
      }
      pts.forEach(([px, py], i) => glowDot(x, px, py, 9, (i + Math.floor(t * 2)) % n === 0 ? STAR : c, 0.9 * k));
      return;
    }
    const r = rand(7);
    const nodes = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * TAU + r() * 0.3;
      const d = o.r * (1.25 + r() * 0.55);
      return [o.x + Math.cos(a) * d, o.y + Math.sin(a) * d * 0.62, r()];
    });
    nodes.forEach(([px, py, s], i) => {
      x.strokeStyle = rgba(c, 0.12 * k);
      x.lineWidth = 1;
      x.strokeRect(px - 16, py - 4, 32 + s * 20, 8);
      if ((i + Math.floor(t * 0.7)) % 5 === 0) {
        const p = (t * 0.7) % 1;
        x.strokeStyle = rgba(STAR, 0.7 * k);
        x.beginPath();
        x.moveTo(o.x, o.y - o.r * 0.3);
        x.lineTo(o.x + (px - o.x) * p, o.y - o.r * 0.3 + (py - o.y + o.r * 0.3) * p);
        x.stroke();
        x.fillStyle = rgba(STAR, 0.5 * k);
        x.fillRect(px - 16, py - 4, 32 + s * 20, 8);
      }
    });
  },

  /* invoices file past a checking line; the wrong ones are flagged and fall out */
  ledger(x, c, t, k, o) {
    const lineX = o.x + o.r * 0.1;
    x.strokeStyle = rgba(c, 0.55 * k);
    x.setLineDash([4, 6]);
    x.beginPath(); x.moveTo(lineX, o.y - o.r * 1.4); x.lineTo(lineX, o.y + o.r * 1.1); x.stroke();
    x.setLineDash([]);
    for (let i = 0; i < 22; i++) {
      const p = ((t * 0.09 + i / 22) % 1);
      const px = o.x - o.r * 2.2 + p * o.r * 4.4;
      const lane = (i % 3) - 1;
      const bad = i % 7 === 3;
      let py = o.y - o.r * 1.15 + lane * 22 + Math.sin(p * 6 + i) * 4;
      const past = px > lineX;
      if (past && bad) py += Math.pow((px - lineX) / (o.r * 2.2), 1.6) * o.r * 1.3;
      const a = Math.min(1, Math.min(p, 1 - p) * 8) * k;
      x.fillStyle = rgba([239, 230, 214], 0.75 * a);
      x.fillRect(px - 9, py - 6, 18, 12);
      x.fillStyle = rgba([150, 140, 125], 0.8 * a);
      x.fillRect(px - 6, py - 3, 10, 1.5); x.fillRect(px - 6, py, 8, 1.5);
      if (past) {
        x.fillStyle = rgba(bad ? RED : GREEN, 0.95 * a);
        x.beginPath(); x.arc(px + 9, py - 6, 3, 0, TAU); x.fill();
      }
    }
  },

  /* sound made visible: a call, a conversation, a rhythm, a pitch */
  voice(x, c, t, k, o, v) {
    if (v === 'rhythm') {
      const n = 16;
      const step = Math.floor(t * 4) % n;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU - Math.PI / 2;
        const px = o.x + Math.cos(a) * o.r * 1.4;
        const py = o.y + Math.sin(a) * o.r * 0.95;
        const on = i === step;
        const beat = i % 4 === 0;
        glowDot(x, px, py, on ? 22 : beat ? 9 : 6, on ? STAR : c, (on ? 0.95 : beat ? 0.6 : 0.3) * k);
      }
      return;
    }
    if (v === 'sine') {
      const f = 3 + 0.6 * Math.sin(t * 0.4);
      for (const [off, col, a] of [[0, c, 0.8], [0.5, STAR, 0.35]]) {
        x.strokeStyle = rgba(col, a * k);
        x.lineWidth = 1.6;
        x.beginPath();
        for (let i = 0; i <= 120; i++) {
          const u = i / 120;
          const px = o.x - o.r * 2 + u * o.r * 4;
          const py = o.y - o.r * 1.15 + Math.sin(u * TAU * (f + off) - t * 3) * 18 * Math.sin(u * Math.PI);
          if (i) x.lineTo(px, py); else x.moveTo(px, py);
        }
        x.stroke();
      }
      return;
    }
    if (v === 'conversation') {
      for (let side = 0; side < 2; side++) {
        const speaking = Math.floor(t * 0.5) % 2 === side;
        const bx = o.x + (side ? 1 : -1) * o.r * 1.35;
        for (let i = 0; i < 14; i++) {
          const h = (speaking ? 6 + 26 * Math.abs(Math.sin(t * 6 + i * 1.7)) : 3) * k;
          x.fillStyle = rgba(side ? STAR : c, (speaking ? 0.8 : 0.3) * k);
          x.fillRect(bx - 42 + i * 6, o.y - o.r * 0.9 - h / 2, 3, h);
        }
      }
      return;
    }
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.35 + i / 4) % 1;
      x.strokeStyle = rgba(c, (1 - p) * 0.55 * k);
      x.lineWidth = 1.5;
      x.beginPath();
      x.ellipse(o.x, o.y - o.r * 0.6, o.r * (0.3 + p * 1.8), o.r * (0.2 + p * 1.1), 0, 0, TAU);
      x.stroke();
    }
  },

  /* a beam reads a form; fields light as it passes; three chutes below */
  scan(x, c, t, k, o) {
    const w = o.r * 1.1;
    const h = o.r * 1.45;
    const fx = o.x + o.r * 1.15;
    const fy = o.y - h * 0.6;
    x.strokeStyle = rgba(STAR, 0.3 * k);
    x.strokeRect(fx, fy, w, h);
    const p = (Math.sin(t * 0.9) + 1) / 2;
    const sy = fy + p * h;
    for (let i = 0; i < 7; i++) {
      const ry = fy + 14 + i * (h - 28) / 7;
      const read = ry < sy;
      x.fillStyle = rgba(read ? c : STAR, (read ? 0.55 : 0.15) * k);
      x.fillRect(fx + 10, ry, w * (0.4 + ((i * 37) % 50) / 100), 5);
      if (read) { x.strokeStyle = rgba(c, 0.7 * k); x.strokeRect(fx + 6, ry - 3, w - 12, 11); }
    }
    const g = x.createLinearGradient(0, sy - 18, 0, sy + 2);
    g.addColorStop(0, rgba(c, 0));
    g.addColorStop(1, rgba(c, 0.6 * k));
    x.fillStyle = g;
    x.fillRect(fx - 6, sy - 18, w + 12, 20);
  },

  /* a plane of cells: a floor plan, a minefield, a sudoku, pipes, a QR code */
  grid(x, c, t, k, o, v) {
    const n = v === 'sudoku' ? 9 : v === 'qr' ? 21 : 10;
    const size = o.r * 2.6;
    const cell = size / n;
    const x0 = o.x - size / 2;
    const y0 = o.y + o.r * 0.15;
    x.save();
    x.translate(o.x, y0);
    x.transform(1, 0, -0.55, 0.42, 0, 0);
    x.translate(-o.x, -y0);
    const r = rand(n * 13 + v.length);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const px = x0 + i * cell;
      const py = y0 + j * cell;
      const wave = Math.max(0, Math.sin(t * 1.2 - (i + j) * 0.35));
      const seed = r();
      let a = 0.08;
      let col = c;
      if (v === 'mines') { a = seed < 0.15 ? 0.6 * wave : 0.12 + 0.25 * wave; col = seed < 0.15 ? RED : c; }
      else if (v === 'qr') {
        const finder = (i < 7 && j < 7) || (i > 13 && j < 7) || (i < 7 && j > 13);
        const ring = finder && (Math.min(i % 14, j % 14) === 0 || Math.max(i % 14, j % 14) === 6 || (i % 14 >= 2 && i % 14 <= 4 && j % 14 >= 2 && j % 14 <= 4));
        a = finder ? (ring ? 0.75 : 0.05) : seed < 0.5 * Math.min(1, t * 0.3) ? 0.55 : 0.04;
        col = STAR;
      } else if (v === 'plan') { a = (i + j) % 3 === 0 && i % 2 === 0 ? 0.4 : 0.06; }
      else { a = 0.1 + wave * 0.35; }
      x.fillStyle = rgba(col, a * k);
      x.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      if (v === 'sudoku' && seed < 0.35 && wave > 0.2) {
        x.fillStyle = rgba(STAR, 0.85 * k * wave);
        x.font = `${cell * 0.6}px Instrument Serif, Georgia, serif`;
        x.fillText(String(1 + Math.floor(seed * 25) % 9), px + cell * 0.32, py + cell * 0.72);
      }
      if (v === 'pipes') {
        x.strokeStyle = rgba(wave > 0.6 ? STAR : c, (0.3 + wave * 0.6) * k);
        x.lineWidth = 2;
        x.beginPath();
        if (seed < 0.5) { x.moveTo(px, py + cell / 2); x.lineTo(px + cell, py + cell / 2); } else { x.moveTo(px + cell / 2, py); x.lineTo(px + cell / 2, py + cell / 2); x.lineTo(px + cell, py + cell / 2); }
        x.stroke();
      }
    }
    if (v === 'plan') {
      for (let g = 0; g < 4; g++) {
        const p = (t * 0.12 + g * 0.25) % 1;
        glowDot(x, x0 + p * size, y0 + size * (0.2 + 0.2 * g), 10, g % 2 ? STAR : c, 0.9 * k);
      }
    }
    x.restore();
  },

  /* nodes and edges with something travelling: a loop, transfers, a chain, a tree, a ring */
  graph(x, c, t, k, o, v) {
    let nodes;
    let edges;
    const R = o.r;
    if (v === 'ring') {
      nodes = Array.from({ length: 5 }, (_, i) => [o.x + Math.cos((i / 5) * TAU - Math.PI / 2) * R * 1.45, o.y - R * 0.2 + Math.sin((i / 5) * TAU - Math.PI / 2) * R * 0.95]);
      edges = [1, 2, 3, 4].map((i) => [0, i]);
    } else if (v === 'tree') {
      nodes = [[o.x, o.y - R * 1.5], [o.x - R, o.y - R * 0.9], [o.x + R, o.y - R * 0.9], [o.x - R * 1.5, o.y - R * 0.25], [o.x - R * 0.5, o.y - R * 0.25], [o.x + R * 1.5, o.y - R * 0.25]];
      edges = [[1, 0], [2, 0], [3, 1], [4, 1], [5, 2]];
    } else if (v === 'chain') {
      nodes = Array.from({ length: 5 }, (_, i) => [o.x - R * 1.8 + i * R * 0.9, o.y - R * 1.15 + (i % 2) * 16]);
      edges = [[0, 1], [1, 2], [2, 3], [3, 4], [3, 2]];
    } else if (v === 'transfers') {
      nodes = Array.from({ length: 5 }, (_, i) => [o.x + Math.cos((i / 5) * TAU + 0.3) * R * 1.55, o.y - R * 0.25 + Math.sin((i / 5) * TAU + 0.3) * R * 0.9]);
      edges = [[0, 2], [1, 3], [4, 2]];
    } else {
      nodes = Array.from({ length: 6 }, (_, i) => [o.x + Math.cos((i / 6) * TAU) * R * 1.5, o.y - R * 0.25 + Math.sin((i / 6) * TAU) * R * 0.85]);
      edges = nodes.map((_, i) => [i, (i + 1) % 6]);
    }
    for (const [a, b] of edges) {
      const [ax, ay] = nodes[a];
      const [bx, by] = nodes[b];
      x.strokeStyle = rgba(c, 0.3 * k);
      x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      const p = (t * (v === 'ring' ? 0.9 : 0.45) + a * 0.13) % 1;
      glowDot(x, ax + (bx - ax) * p, ay + (by - ay) * p, 8, STAR, 0.85 * k);
    }
    nodes.forEach(([px, py], i) => {
      const lead = (v === 'ring' && i === 0) || (v === 'tree' && i === 0);
      glowDot(x, px, py, lead ? 26 : 16, lead ? STAR : c, 0.75 * k);
      x.strokeStyle = rgba(STAR, 0.6 * k);
      x.beginPath(); x.arc(px, py, lead ? 9 : 6, 0, TAU); x.stroke();
    });
  },

  /* bodies on paths: a paper plane, a tether, a ring that closes */
  orbit(x, c, t, k, o, v) {
    if (v === 'ring') {
      const rr = o.r * (1.6 - ((t * 0.08) % 1) * 0.8);
      x.strokeStyle = rgba(STAR, 0.5 * k);
      x.setLineDash([8, 6]);
      x.beginPath(); x.ellipse(o.x, o.y, rr, rr * 0.42, 0, 0, TAU); x.stroke();
      x.setLineDash([]);
      return;
    }
    if (v === 'flight') {
      x.strokeStyle = rgba(c, 0.6 * k);
      x.setLineDash([3, 7]);
      x.beginPath();
      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        const px = o.x - o.r * 2 + u * o.r * 4;
        const py = o.y - o.r * 1.1 + Math.sin(u * 9 + t) * 26;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.stroke();
      x.setLineDash([]);
      return;
    }
    const a = t * 1.2;
    const cx = o.x;
    const cy = o.y - o.r * 0.5;
    const px = cx + Math.cos(a) * o.r * 1.5;
    const py = cy + Math.sin(a) * o.r * 0.6;
    x.strokeStyle = rgba(STAR, 0.45 * k);
    x.beginPath(); x.ellipse(cx, cy, o.r * 1.5, o.r * 0.6, 0, 0, TAU); x.stroke();
    x.strokeStyle = rgba(c, 0.8 * k);
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(px, py); x.stroke();
    x.setLineDash([2, 5]);
    x.beginPath(); x.moveTo(px, py); x.lineTo(px - Math.sin(a) * 60, py + Math.cos(a) * 24); x.stroke();
    x.setLineDash([]);
    glowDot(x, px, py, 14, c, 0.9 * k);
  },

  /* sparks rising out of a pool of light in the dark */
  rise(x, c, t, k, o) {
    const g = x.createRadialGradient(o.x, o.y - o.r * 0.4, o.r * 0.5, o.x, o.y - o.r * 0.4, o.r * 3.2);
    g.addColorStop(0, rgba(c, 0));
    g.addColorStop(1, rgba([5, 4, 8], 0.55 * k));
    x.fillStyle = g;
    x.fillRect(0, 0, x.canvas.width, x.canvas.height);
    for (let i = 0; i < 40; i++) {
      const p = (t * 0.18 + i / 40) % 1;
      const sx = o.x + Math.sin(i * 12.9) * o.r * 0.6 + Math.sin(t + i) * 10 * p;
      const sy = o.y - o.r * 0.3 - p * o.r * 2.4;
      glowDot(x, sx, sy, 5, i % 3 ? c : STAR, (1 - p) * 0.9 * k);
    }
  },

  /* things falling: sand, or the slices that overhang */
  fall(x, c, t, k, o, v) {
    for (let i = 0; i < (v === 'sand' ? 120 : 10); i++) {
      const p = (t * (v === 'sand' ? 0.35 : 0.22) + i / (v === 'sand' ? 120 : 10)) % 1;
      const fx = o.x + (v === 'sand' ? -o.r * 1.2 + Math.sin(i * 7.7) * 6 : Math.sin(i * 3.3) * o.r * 1.6);
      const fy = o.y - o.r * 1.6 + p * o.r * 2.6;
      x.fillStyle = rgba(v === 'sand' ? [232, 194, 122] : c, (1 - p) * 0.8 * k);
      if (v === 'sand') x.fillRect(fx, fy, 2, 2);
      else { x.save(); x.translate(fx, fy); x.rotate(p * 2 + i); x.fillRect(-14, -3, 28, 6); x.restore(); }
    }
  },

  fog(x, c, t, k, o) {
    for (let i = 0; i < 5; i++) {
      const fy = o.y - o.r * 0.6 + i * 26;
      const fx = o.x + Math.sin(t * 0.15 + i) * o.r;
      const g = x.createRadialGradient(fx, fy, 0, fx, fy, o.r * 2);
      g.addColorStop(0, rgba(STAR, 0.08 * k));
      g.addColorStop(1, rgba(STAR, 0));
      x.fillStyle = g;
      x.fillRect(fx - o.r * 2, fy - o.r * 2, o.r * 4, o.r * 4);
    }
    if (Math.sin(t * 5.3) > 0.97) { x.fillStyle = rgba(c, 0.06 * k); x.fillRect(0, 0, x.canvas.width, x.canvas.height); }
  },

  ripple(x, c, t, k, o) {
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.25 + i / 6) % 1;
      x.strokeStyle = rgba(i % 2 ? STAR : c, (1 - p) * 0.6 * k);
      x.lineWidth = 1.4;
      x.beginPath();
      x.ellipse(o.x, o.y + o.r * 0.25, o.r * (0.3 + p * 2.2), o.r * (0.08 + p * 0.6), 0, 0, TAU);
      x.stroke();
    }
  },

  /* bars: a bell curve filling, data columns, a span waterfall */
  bars(x, c, t, k, o, v) {
    const n = v === 'waterfall' ? 9 : 17;
    for (let i = 0; i < n; i++) {
      let bx, by, bw, bh, col = c;
      if (v === 'waterfall') {
        bx = o.x - o.r * 1.8 + i * o.r * 0.22 + (i % 3) * 10;
        by = o.y - o.r * 1.5 + i * 16;
        bw = o.r * (0.5 + ((i * 41) % 60) / 60);
        bh = 9;
        col = i % 3 === 0 ? STAR : c;
      } else {
        const u = (i - (n - 1) / 2) / ((n - 1) / 2);
        const target = v === 'bell' ? Math.exp(-u * u * 3) : 0.3 + ((i * 53) % 70) / 100;
        const grow = Math.min(1, ((t * 0.25) % 1.4));
        bw = o.r * 0.13;
        bh = target * o.r * 1.3 * grow;
        bx = o.x - o.r * 1.4 + i * o.r * 0.175;
        by = o.y - o.r * 0.3 - bh;
      }
      x.fillStyle = rgba(col, 0.55 * k);
      x.fillRect(bx, by, bw, bh);
    }
    if (v === 'bell') {
      x.strokeStyle = rgba(STAR, 0.8 * k);
      x.beginPath(); x.moveTo(o.x - o.r * 0.6, o.y - o.r * 1.75); x.lineTo(o.x + o.r * 0.6, o.y - o.r * 1.75); x.stroke();
    }
  },

  spectrum(x, c, t, k, o) {
    const px = o.x;
    const py = o.y - o.r * 0.8;
    x.strokeStyle = rgba([255, 255, 255], 0.8 * k);
    x.lineWidth = 2;
    x.beginPath(); x.moveTo(o.x - o.r * 2.4, py + 10); x.lineTo(px, py); x.stroke();
    const hues = [[255, 107, 138], [255, 168, 107], [255, 224, 107], [122, 209, 138], [107, 184, 255], [168, 138, 255]];
    hues.forEach((h, i) => {
      x.fillStyle = rgba(h, (0.35 + 0.15 * Math.sin(t + i)) * k);
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(o.x + o.r * 2.6, py - o.r * 0.7 + i * o.r * 0.28);
      x.lineTo(o.x + o.r * 2.6, py - o.r * 0.7 + (i + 1) * o.r * 0.28);
      x.fill();
    });
  },

  merge(x, c, t, k, o) {
    for (const [side, col] of [[-1, RED], [1, GREEN]]) {
      for (let i = 0; i < 26; i++) {
        const p = (t * 0.3 + i / 26) % 1;
        const sx = o.x + side * o.r * 2.2 * (1 - p);
        const sy = o.y - o.r * 1.6 + p * o.r * 1.1 + Math.sin(p * 5 + i) * 4;
        glowDot(x, sx, sy, 5, col, (0.2 + p * 0.7) * k);
      }
    }
    glowDot(x, o.x, o.y - o.r * 0.5, 30, c, 0.7 * k);
  },

  contours(x, c, t, k, o) {
    for (let ring = 1; ring <= 7; ring++) {
      x.strokeStyle = rgba(ring % 3 ? c : STAR, (0.4 - ring * 0.035) * k);
      x.lineWidth = 1;
      x.beginPath();
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * TAU;
        const w = 1 + 0.12 * Math.sin(a * 3 + ring) + 0.06 * Math.sin(a * 7 - ring * 2);
        const rr = o.r * (0.6 + ring * 0.28 + ((t * 0.05) % 0.28)) * w;
        const px = o.x + Math.cos(a) * rr;
        const py = o.y + Math.sin(a) * rr * 0.45;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.stroke();
    }
  },

  /* a detective's board: pinned cards and red string, one pair that cannot both be true */
  strings(x, c, t, k, o) {
    const pins = [[-1.8, -1.2], [-0.9, -1.7], [0.6, -1.6], [1.7, -1.0], [1.5, 0.3], [-1.6, 0.2]].map(([a, b]) => [o.x + a * o.r, o.y + b * o.r * 0.7]);
    const pairs = [[0, 2], [1, 3], [2, 4], [3, 5], [0, 4]];
    const clash = Math.floor(t * 0.4) % pairs.length;
    pairs.forEach(([a, b], i) => {
      x.strokeStyle = rgba(i === clash ? RED : [200, 80, 80], (i === clash ? 0.9 : 0.35) * k);
      x.lineWidth = i === clash ? 2 : 1;
      x.beginPath(); x.moveTo(...pins[a]); x.lineTo(...pins[b]); x.stroke();
    });
    for (const [px, py] of pins) {
      x.fillStyle = rgba([239, 230, 214], 0.65 * k);
      x.fillRect(px - 14, py - 10, 28, 20);
      x.fillStyle = rgba(RED, 0.9 * k);
      x.beginPath(); x.arc(px, py - 10, 3, 0, TAU); x.fill();
    }
  },

  /* strawberry, coming apart along the seams a tokeniser sees */
  shards(x, c, t, k, o) {
    const parts = ['st', 'ra', 'w', 'ber', 'r', 'y'];
    const spread = (Math.sin(t * 0.8) + 1) / 2;
    let px = o.x - o.r * 1.2;
    x.font = '20px JetBrains Mono, ui-monospace, monospace';
    parts.forEach((p, i) => {
      const w = p.length * 13 + 14;
      const gap = spread * 14;
      x.fillStyle = rgba(c, 0.25 * k);
      x.fillRect(px, o.y - o.r * 1.4, w, 30);
      x.fillStyle = rgba(STAR, 0.9 * k);
      x.fillText(p, px + 7, o.y - o.r * 1.4 + 21);
      px += w + 4 + gap;
      if (i === 5) return;
    });
  },

  /* a lighthouse beam sweeping across, and the rain in it */
  beam(x, c, t, k, o) {
    const lx = o.x;
    const ly = o.y - o.r * 0.9;
    /* the light sweeps; a soft halo of a beam round a brighter core, in lamp colour */
    const a = -Math.PI / 2 + Math.sin(t * 0.56) * 1.3;
    const lamp = [255, 222, 160];
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (const [w, alpha] of [[0.2, 0.16], [0.06, 0.3]]) {
      const g = x.createRadialGradient(lx, ly, 0, lx, ly, o.r * 4.5);
      g.addColorStop(0, rgba(lamp, alpha * k));
      g.addColorStop(0.5, rgba(lamp, alpha * 0.35 * k));
      g.addColorStop(1, rgba(lamp, 0));
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(lx, ly);
      x.arc(lx, ly, o.r * 4.5, a - w, a + w);
      x.fill();
    }
    x.restore();
    x.strokeStyle = rgba([190, 205, 230], 0.25 * k);
    for (let i = 0; i < 60; i++) {
      const rx = ((i * 97 + t * 180) % (o.r * 6)) + o.x - o.r * 3;
      const ry = ((i * 53 + t * 420) % (o.r * 4)) + o.y - o.r * 2.2;
      x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx - 3, ry + 12); x.stroke();
    }
  },
};

export const FX_TYPES = Object.keys(FAMILIES);

/* ── the controller ─────────────────────────────────────────────────── */

export function createFx(near, veil, { reduced = false } = {}) {
  const x = near.getContext('2d');
  const vx = veil.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let raf = 0;
  let t0 = performance.now();
  const env = { island: null, focal: null, k: 0, target: 0, color: [154, 230, 208] };
  const amb = { mode: 'threshold', hover: 0, portal: null, travel: 0, mouse: [0, 0] };
  const transitions = [];
  const r = rand(11);
  const motes = Array.from({ length: 90 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, a: r() * TAU, s: 0.4 + r() }));
  const frags = Array.from({ length: 7 }, (_, i) => ({ u: r() * 2 - 1, v: r() * 2 - 1, z: 0.4 + r() * 0.8, rot: r() * TAU, spin: (r() - 0.5) * 0.25, size: 8 + r() * 18, seed: i }));

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    for (const c of [near, veil]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  }
  resize();
  addEventListener('resize', () => { resize(); kick(); });

  function drawAmbient(t, dt) {
    if (amb.mode === 'off') return;
    const P = amb.portal;
    const travel = amb.travel;
    for (const m of motes) {
      let mx = m.x * W + amb.mouse[0] * 14 * m.z;
      let my = m.y * H + amb.mouse[1] * 10 * m.z;
      if (P && amb.mode === 'threshold') {
        const dx = mx - P.x;
        const dy = my - P.y;
        const d = Math.hypot(dx, dy);
        /* near the portal, and more so when you approach it, the dust is drawn into orbit round it */
        const pull = amb.hover * Math.max(0, 1 - d / (P.r * 2.6));
        if (!reduced && dt) {
          m.y -= (0.004 + m.s * 0.004) * dt * (1 - pull);
          m.x += Math.sin(t * 0.3 + m.a) * 0.0006 * dt;
          if (pull > 0) {
            const ang = Math.atan2(dy, dx) + 0.9 * dt * pull;
            const nd = d - 12 * dt * pull;
            m.x = (P.x + Math.cos(ang) * nd) / W;
            m.y = (P.y + Math.sin(ang) * nd) / H;
          }
          if (m.y < -0.02) { m.y = 1.02; m.x = r(); }
        }
        if (travel > 0) {
          const s = 1 + travel * travel * 8 * m.z;
          mx = P.x + (mx - P.x) * s;
          my = P.y + (my - P.y) * s;
        }
      } else if (!reduced && dt) {
        m.y -= 0.002 * m.s * dt;
        if (m.y < -0.02) { m.y = 1.02; m.x = r(); }
      }
      const a = (0.25 + 0.45 * m.z) * (amb.mode === 'world' ? 0.5 : 1) * (1 - travel * 0.6);
      x.fillStyle = `rgba(232,199,170,${a})`;
      const s = 1 + m.z * 1.2 + travel * 3 * m.z;
      x.fillRect(mx, my, s, travel > 0.2 ? s * (1 + travel * 4) : s);
    }
    if (amb.mode === 'threshold' && P) {
      for (const f of frags) {
        if (!reduced && dt) f.rot += f.spin * dt;
        const spread = 1 + travel * travel * 14 * f.z;
        const fx = P.x + f.u * P.r * 2.3 * spread + amb.mouse[0] * 22 * f.z + Math.sin(t * 0.2 + f.seed) * 6;
        const fy = P.y + f.v * P.r * 1.4 * spread + amb.mouse[1] * 14 * f.z + Math.cos(t * 0.17 + f.seed) * 5 - (1 - spread) * 0;
        const d = Math.hypot(f.u, f.v);
        if (d < 0.75 || d > 1.5) continue;
        x.save();
        x.translate(fx, fy);
        x.rotate(f.rot);
        const sz = f.size * f.z * (1 + travel * 3);
        const pts = [[-sz, -sz * 0.3], [-sz * 0.2, -sz * 0.8], [sz * 0.9, -sz * 0.2], [sz * 0.4, sz * 0.7], [-sz * 0.6, sz * 0.5]];
        x.beginPath();
        pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py)));
        x.closePath();
        /* lit from the portal's side: a cool face fading into shadow */
        x.rotate(-f.rot);
        const g = x.createLinearGradient(0, -sz, 0, sz);
        g.addColorStop(0, 'rgba(46,58,86,0.96)');
        g.addColorStop(0.55, 'rgba(14,18,30,0.97)');
        g.addColorStop(1, 'rgba(6,8,14,0.98)');
        x.fillStyle = g;
        x.fill();
        x.rotate(f.rot);
        /* the rim the portal light catches, on the two upper edges only */
        x.beginPath();
        x.moveTo(...pts[0]); x.lineTo(...pts[1]); x.lineTo(...pts[2]);
        x.strokeStyle = `rgba(170,236,218,${0.3 + 0.4 * amb.hover})`;
        x.lineWidth = 1.2;
        x.stroke();
        x.restore();
      }
    }
  }

  function frame(ts) {
    raf = 0;
    const t = (ts - t0) / 1000;
    const dt = Math.min(0.05, frame.last ? (ts - frame.last) / 1000 : 0) * 60;
    frame.last = ts;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    drawAmbient(t, reduced ? 0 : dt);
    env.k += (env.target - env.k) * (reduced ? 1 : 1 - Math.pow(0.92, Math.max(1, dt)));
    if (env.island && env.k > 0.01 && env.focal) {
      const { type, variant } = env.island.fx;
      FAMILIES[type]?.(x, env.color, reduced ? 2 : t, env.k, env.focal, variant ?? '');
    }
    if (env.k < 0.01 && env.target === 0) env.island = null;

    vx.setTransform(dpr, 0, 0, dpr, 0, 0);
    vx.clearRect(0, 0, W, H);
    for (let i = transitions.length - 1; i >= 0; i--) {
      const tr = transitions[i];
      const p = Math.min(1, (ts - tr.start) / tr.ms);
      tr.draw(vx, p);
      if (p >= 1) { transitions.splice(i, 1); tr.done(); }
    }
    const busy = !reduced || transitions.length || Math.abs(env.k - env.target) > 0.01;
    if (busy && !document.hidden && (amb.mode !== 'off' || env.island || transitions.length)) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { frame.last = 0; kick(); } });
  kick();

  return {
    ambient(values) { Object.assign(amb, values); kick(); },
    focus(island, focal) {
      env.island = island;
      env.focal = focal;
      env.color = rgb(island.palette[2]);
      env.target = 1;
      if (reduced) env.k = 1;
      kick();
    },
    moveFocal(focal) { env.focal = focal; },
    unfocus() { env.target = 0; if (reduced) env.k = 0; kick(); },
    /* fragments in the island's colours gather from the island into the panel */
    assemble(from, rect, colors, ms = 700) {
      if (reduced) return Promise.resolve();
      const cols = colors.map(rgb);
      const pr = rand(Math.round(from.x * 7 + from.y));
      const parts = Array.from({ length: 110 }, () => {
        const edge = pr();
        const tx = rect.left + (edge < 0.5 ? pr() * rect.width : (pr() < 0.5 ? 0 : rect.width));
        const ty = rect.top + (edge < 0.5 ? (pr() < 0.5 ? 0 : rect.height) : pr() * rect.height);
        return { sx: from.x + (pr() - 0.5) * 120, sy: from.y + (pr() - 0.5) * 90, tx, ty, bend: (pr() - 0.5) * 240, delay: pr() * 0.3, size: 1.5 + pr() * 3, col: cols[Math.floor(pr() * cols.length)] };
      });
      return new Promise((done) => {
        transitions.push({
          start: performance.now(), ms, done,
          draw(c, p) {
            for (const q of parts) {
              const u = ease(Math.max(0, Math.min(1, (p - q.delay) / (1 - q.delay))));
              const px = q.sx + (q.tx - q.sx) * u + Math.sin(u * Math.PI) * q.bend;
              const py = q.sy + (q.ty - q.sy) * u - Math.sin(u * Math.PI) * 60;
              c.fillStyle = rgba(q.col, (1 - Math.pow(u, 6)) * 0.95);
              c.fillRect(px, py, q.size, q.size);
            }
            c.strokeStyle = `rgba(232,199,170,${Math.max(0, p - 0.6) * 1.2})`;
            c.strokeRect(rect.left + 0.5, rect.top + 0.5, rect.width - 1, rect.height - 1);
          },
        });
        kick();
      });
    },
    /* a picture coming apart into particles, uncovering what is behind it */
    dissolve(rect, colors, ms = 650) {
      if (reduced) return Promise.resolve();
      const cols = colors.map(rgb);
      const pr = rand(5);
      const parts = Array.from({ length: 260 }, () => ({ x: rect.left + pr() * rect.width, y: rect.top + pr() * rect.height, vx: (pr() - 0.5) * 160, vy: -40 - pr() * 160, col: cols[Math.floor(pr() * cols.length)], size: 1.5 + pr() * 3.5 }));
      return new Promise((done) => {
        transitions.push({
          start: performance.now(), ms, done,
          draw(c, p) {
            for (const q of parts) {
              c.fillStyle = rgba(q.col, (1 - p) * 0.9);
              c.fillRect(q.x + q.vx * p, q.y + q.vy * p + 80 * p * p, q.size, q.size);
            }
          },
        });
        kick();
      });
    },
    redraw: kick,
  };
}

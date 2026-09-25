/* ───────────────────────────────────────────────────────────────────────────
   loom/engine.js — the part that turns a graph of nodes into an image.

   There is no DOM in this file and there never will be. It takes a plain
   object describing which nodes exist and which ones feed which, and it hands
   back pixels. That means the whole thing can be run, and tested, from a
   terminal with no browser anywhere in sight.

   THE MODEL
   ─────────
   Every node produces exactly one thing: an image. Not a number, not a colour,
   not a "texture handle" — an image, the same size as every other image in the
   graph. That single decision is what makes the rest of it simple. A blur
   takes an image and returns an image. A blend takes two and returns one. A
   noise generator takes none and returns one. Because they all speak the same
   language, any output can be plugged into any input and the result is always
   defined.

   Images are three Float32Arrays (red, green, blue), not clamped bytes.
   Keeping them as floats means an operation halfway down the chain can push
   values past 1.0 or below 0 and a later operation can bring them back
   without the detail having been thrown away in between. Clamping happens
   once, at the very end, when the pixels are handed to a screen.

   EVALUATION
   ──────────
   Nodes are evaluated in dependency order, depth-first from the output.
   Anything not reachable from the node you asked for is never computed.

   Each result is cached against a hash of everything that could change it:
   the node's type, its parameters, the size requested, and — recursively —
   the hashes of its inputs. Change one parameter near the end of the chain
   and only that node and the ones after it are recomputed. The expensive
   noise field at the start is reused untouched. This is the difference
   between a slider that drags smoothly and one that stutters.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── images ──────────────────────────────────────────────────────────────── */

/** An RGB image of floating point pixels. The only currency in the graph. */
export function image(w, h) {
  return { w, h, r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h) };
}

/** Fill an image by calling fn(x, y, i) for every pixel; fn returns [r,g,b]. */
export function paint(img, fn) {
  const { w, h, r, g, b } = img;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const c = fn(x, y, i);
      r[i] = c[0]; g[i] = c[1]; b[i] = c[2];
    }
  }
  return img;
}

/** Fill an image from a single channel function — grey in, grey out. */
export function paintGrey(img, fn) {
  const { w, h, r, g, b } = img;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const v = fn(x, y, i);
      r[i] = v; g[i] = v; b[i] = v;
    }
  }
  return img;
}

export const luma = (img, i) => 0.2126 * img.r[i] + 0.7152 * img.g[i] + 0.0722 * img.b[i];

/** Bilinear sample at a floating point coordinate, with the edges repeating. */
export function sample(img, x, y, out) {
  const { w, h } = img;
  // wrap into range first so tiling and rotation never read outside the buffer
  let fx = x % w, fy = y % h;
  if (fx < 0) fx += w;
  if (fy < 0) fy += h;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = (x0 + 1) % w, y1 = (y0 + 1) % h;
  const tx = fx - x0, ty = fy - y0;
  const i00 = y0 * w + x0, i10 = y0 * w + x1, i01 = y1 * w + x0, i11 = y1 * w + x1;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  out[0] = img.r[i00] * w00 + img.r[i10] * w10 + img.r[i01] * w01 + img.r[i11] * w11;
  out[1] = img.g[i00] * w00 + img.g[i10] * w10 + img.g[i01] * w01 + img.g[i11] * w11;
  out[2] = img.b[i00] * w00 + img.b[i10] * w10 + img.b[i01] * w01 + img.b[i11] * w11;
  return out;
}

/* ── noise ───────────────────────────────────────────────────────────────── */

/* Gradient noise, the Perlin kind. A hash turns each integer lattice point
   into a pseudo-random direction; a pixel's value is the blend of how far it
   sits along each of the four surrounding directions. The result is smooth
   and has no visible grid, which is the entire point — value noise, the
   simpler alternative, produces obvious square artefacts. */

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function grad(seed, ix, iy, dx, dy) {
  let h = ix * 374761393 + iy * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  const a = (h & 255) / 256 * Math.PI * 2;
  return Math.cos(a) * dx + Math.sin(a) * dy;
}

export function perlin(seed, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const dx = x - x0, dy = y - y0;
  const u = fade(dx), v = fade(dy);
  const n00 = grad(seed, x0, y0, dx, dy);
  const n10 = grad(seed, x0 + 1, y0, dx - 1, dy);
  const n01 = grad(seed, x0, y0 + 1, dx, dy - 1);
  const n11 = grad(seed, x0 + 1, y0 + 1, dx - 1, dy - 1);
  const a = n00 + u * (n10 - n00);
  const b = n01 + u * (n11 - n01);
  return a + v * (b - a);
}

/** Several octaves of perlin stacked, each finer and fainter than the last. */
export function fbm(seed, x, y, octaves) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += perlin(seed + o * 101, x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/* ── palettes ────────────────────────────────────────────────────────────── */

/* Each palette is a handful of stops that a brightness value is mapped
   through. These are the difference between "a greyscale noise field" and
   "something you would put on a wall", so they were chosen by eye rather
   than generated. */

export const PALETTES = {
  ember:    ['#05030a', '#3b0d3f', '#a01f52', '#ef5f3c', '#ffc857', '#fff4d6'],
  lagoon:   ['#020b18', '#08304d', '#0e7490', '#31d0c6', '#a7f3d0', '#f0fdf4'],
  orchid:   ['#0a0318', '#2e1065', '#6d28d9', '#c084fc', '#f0abfc', '#fdf4ff'],
  sandstone:['#140d08', '#4a2f1a', '#a9713a', '#e0aa6e', '#f6dfb6', '#fffaf0'],
  mono:     ['#000000', '#3a3a3a', '#7a7a7a', '#b9b9b9', '#ffffff'],
  bloom:    ['#030b12', '#0b3d68', '#3b82f6', '#f472b6', '#fda4af', '#fff1f2'],
  toxic:    ['#04140a', '#0b4a2a', '#3f9142', '#a3e635', '#ecfccb', '#ffffff'],
  dusk:     ['#0b0616', '#312a5e', '#5f7fbf', '#f0a9a0', '#ffd9a0', '#fffbf0'],
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Look a 0..1 brightness up in a palette, blending between its stops. */
export function rampAt(stops, t) {
  const n = stops.length - 1;
  const p = Math.min(0.999999, Math.max(0, t)) * n;
  const i = Math.floor(p), f = p - i;
  const a = hexToRgb(stops[i]), b = hexToRgb(stops[Math.min(n, i + 1)]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/* A palette lookup happens once per pixel, and parsing a hex string per pixel
   is wasteful — so each ramp is baked into a 256-entry table once per render. */
function bakeRamp(stops, shift) {
  const tbl = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    let t = i / 255 + shift;
    t = t - Math.floor(t);
    const c = rampAt(stops, t);
    tbl[i * 3] = c[0]; tbl[i * 3 + 1] = c[1]; tbl[i * 3 + 2] = c[2];
  }
  return tbl;
}

/* ── node definitions ────────────────────────────────────────────────────── */

/* A node type is: what it is called, what it takes in, what knobs it has, and
   a function from (inputs, params, width, height) to an image. Adding a new
   kind of node means adding one entry here and nothing else anywhere — the
   editor builds its menus, its parameter panels and its port layout from
   this object at runtime. */

const num = (key, label, min, max, step, def) => ({ key, label, kind: 'num', min, max, step, def });
const pick = (key, label, options, def) => ({ key, label, kind: 'pick', options, def });
const bool = (key, label, def) => ({ key, label, kind: 'bool', def });

export const NODES = {

  /* ── sources ───────────────────────────────────────────────── */

  noise: {
    title: 'Noise', cat: 'source', accent: '#7dd3fc',
    about: 'Smooth random cloud. The raw material for almost everything else.',
    inputs: [],
    params: [
      num('scale', 'Scale', 1, 24, 0.1, 4),
      num('octaves', 'Detail', 1, 7, 1, 4),
      num('seed', 'Seed', 1, 9999, 1, 7),
      num('contrast', 'Contrast', 0.2, 4, 0.05, 1),
    ],
    run(_in, p, w, h) {
      const s = p.scale / Math.max(w, h);
      const oct = Math.round(p.octaves);
      return paintGrey(image(w, h), (x, y) => {
        const v = fbm(p.seed | 0, x * s, y * s, oct) * 0.5 + 0.5;
        /* Contrast pushes values away from mid-grey. Doing this as a gamma
           curve instead — pow(v, 1/contrast) — is the obvious shortcut and it
           is wrong: it brightens the whole field rather than widening it, so
           turning "contrast" up washed the image out. */
        return Math.min(1, Math.max(0, 0.5 + (v - 0.5) * p.contrast));
      });
    },
  },

  gradient: {
    title: 'Gradient', cat: 'source', accent: '#7dd3fc',
    about: 'A straight fade from black to white at whatever angle you like.',
    inputs: [],
    params: [num('angle', 'Angle', 0, 360, 1, 45), num('softness', 'Softness', 0.05, 3, 0.05, 1)],
    run(_in, p, w, h) {
      const a = p.angle * Math.PI / 180;
      const dx = Math.cos(a), dy = Math.sin(a);
      const len = Math.abs(dx) * w + Math.abs(dy) * h;
      return paintGrey(image(w, h), (x, y) => {
        const t = ((x - w / 2) * dx + (y - h / 2) * dy) / len + 0.5;
        return Math.min(1, Math.max(0, Math.pow(t, 1 / p.softness)));
      });
    },
  },

  rings: {
    title: 'Rings', cat: 'source', accent: '#7dd3fc',
    about: 'Concentric circles radiating out from a point you can move.',
    inputs: [],
    params: [
      num('count', 'Rings', 1, 40, 0.5, 8),
      num('cx', 'Centre X', 0, 1, 0.01, 0.5),
      num('cy', 'Centre Y', 0, 1, 0.01, 0.5),
      num('sharpness', 'Sharpness', 0.1, 6, 0.1, 1),
    ],
    run(_in, p, w, h) {
      const cx = p.cx * w, cy = p.cy * h;
      const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      return paintGrey(image(w, h), (x, y) => {
        const d = Math.hypot(x - cx, y - cy) / maxR;
        const v = 0.5 + 0.5 * Math.cos(d * p.count * Math.PI * 2);
        return Math.pow(v, p.sharpness);
      });
    },
  },

  checker: {
    title: 'Checker', cat: 'source', accent: '#7dd3fc',
    about: 'A chessboard. Mostly useful as something to distort.',
    inputs: [],
    params: [num('cells', 'Cells', 2, 48, 1, 8)],
    run(_in, p, w, h) {
      const n = Math.round(p.cells);
      const sx = n / w, sy = n / h;
      return paintGrey(image(w, h), (x, y) =>
        ((Math.floor(x * sx) + Math.floor(y * sy)) & 1) ? 1 : 0);
    },
  },

  cells: {
    title: 'Cells', cat: 'source', accent: '#7dd3fc',
    about: 'Scattered points, each pixel shaded by how far it sits from the nearest one. Gives you stone, scales, cracked earth.',
    inputs: [],
    params: [
      num('points', 'Points', 3, 120, 1, 24),
      num('seed', 'Seed', 1, 9999, 1, 3),
      pick('mode', 'Style', ['distance', 'edges', 'flat'], 'distance'),
    ],
    run(_in, p, w, h) {
      /* The points are placed once, then every pixel is compared against all
         of them. Brute force is O(pixels x points), which sounds alarming and
         is completely fine at these sizes — a spatial index here would be more
         code, more bugs, and no faster at 120 points. */
      const n = Math.round(p.points);
      const px = new Float32Array(n), py = new Float32Array(n), pv = new Float32Array(n);
      let s = (p.seed | 0) >>> 0;
      const rand = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      for (let i = 0; i < n; i++) { px[i] = rand() * w; py[i] = rand() * h; pv[i] = rand(); }
      const norm = Math.hypot(w, h) / Math.sqrt(n);
      return paintGrey(image(w, h), (x, y) => {
        let d1 = Infinity, d2 = Infinity, best = 0;
        for (let i = 0; i < n; i++) {
          /* distances are compared wrapped, so the pattern tiles seamlessly */
          let ddx = Math.abs(x - px[i]); if (ddx > w / 2) ddx = w - ddx;
          let ddy = Math.abs(y - py[i]); if (ddy > h / 2) ddy = h - ddy;
          const d = ddx * ddx + ddy * ddy;
          if (d < d1) { d2 = d1; d1 = d; best = i; }
          else if (d < d2) { d2 = d; }
        }
        if (p.mode === 'flat') return pv[best];
        if (p.mode === 'edges') return Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / (norm * 0.5));
        return Math.min(1, Math.sqrt(d1) / (norm * 0.7));
      });
    },
  },

  solid: {
    title: 'Solid', cat: 'source', accent: '#7dd3fc',
    about: 'One flat colour, edge to edge.',
    inputs: [],
    params: [
      num('level', 'Brightness', 0, 1, 0.01, 0.5),
      num('tint', 'Tint', 0, 1, 0.01, 0),
      num('hue', 'Hue', 0, 360, 1, 200),
    ],
    run(_in, p, w, h) {
      const a = p.hue * Math.PI / 180;
      const rr = 0.5 + 0.5 * Math.cos(a);
      const gg = 0.5 + 0.5 * Math.cos(a - 2.094);
      const bb = 0.5 + 0.5 * Math.cos(a + 2.094);
      const m = p.level;
      const img = image(w, h);
      img.r.fill(m * (1 - p.tint) + m * rr * 2 * p.tint);
      img.g.fill(m * (1 - p.tint) + m * gg * 2 * p.tint);
      img.b.fill(m * (1 - p.tint) + m * bb * 2 * p.tint);
      return img;
    },
  },

  /* ── shaping ───────────────────────────────────────────────── */

  levels: {
    title: 'Levels', cat: 'shape', accent: '#a3e635',
    about: 'Pushes the darks down and the lights up. The knob you reach for when something looks washed out.',
    inputs: ['in'],
    params: [
      num('low', 'Black point', 0, 1, 0.01, 0),
      num('high', 'White point', 0, 1, 0.01, 1),
      num('gamma', 'Midtones', 0.15, 5, 0.05, 1),
      bool('clip', 'Clip', true),
    ],
    run([a], p, w, h) {
      const span = Math.abs(p.high - p.low) < 1e-4 ? 1e-4 : p.high - p.low;
      const out = image(w, h);
      const shape = (v) => {
        let t = (v - p.low) / span;
        if (p.clip) t = Math.min(1, Math.max(0, t));
        return t < 0 ? -Math.pow(-t, p.gamma) : Math.pow(t, p.gamma);
      };
      for (let i = 0; i < out.r.length; i++) {
        out.r[i] = shape(a.r[i]); out.g[i] = shape(a.g[i]); out.b[i] = shape(a.b[i]);
      }
      return out;
    },
  },

  posterize: {
    title: 'Posterize', cat: 'shape', accent: '#a3e635',
    about: 'Rounds every pixel to the nearest of N brightnesses. Smooth gradients become hard bands.',
    inputs: ['in'],
    params: [num('steps', 'Bands', 2, 24, 1, 5), num('smooth', 'Softness', 0, 1, 0.01, 0)],
    run([a], p, w, h) {
      const n = Math.round(p.steps);
      const out = image(w, h);
      const q = (v) => {
        const t = Math.min(1, Math.max(0, v)) * (n - 1);
        const hard = Math.round(t) / (n - 1);
        return p.smooth > 0 ? hard + (t / (n - 1) - hard) * p.smooth : hard;
      };
      for (let i = 0; i < out.r.length; i++) {
        out.r[i] = q(a.r[i]); out.g[i] = q(a.g[i]); out.b[i] = q(a.b[i]);
      }
      return out;
    },
  },

  blur: {
    title: 'Blur', cat: 'shape', accent: '#a3e635',
    about: 'Softens everything. Runs as two one-dimensional passes rather than one square one, which is the difference between instant and sluggish.',
    inputs: ['in'],
    params: [num('radius', 'Radius', 0, 40, 0.5, 4), num('passes', 'Quality', 1, 3, 1, 2)],
    run([a], p, w, h) {
      /* A box blur repeated three times is indistinguishable from a gaussian
         and costs a fraction as much. Each pass is separable: blur across,
         then blur down. Doing it as a single 2D kernel would be r^2 work per
         pixel instead of 2r. */
      let src = a;
      const rad = Math.max(0, p.radius) * (Math.min(w, h) / 256);
      if (rad < 0.4) return src;
      const n = Math.round(p.passes);
      for (let pass = 0; pass < n; pass++) {
        src = boxPass(src, rad / n, true);
        src = boxPass(src, rad / n, false);
      }
      return src;
    },
  },

  warp: {
    title: 'Warp', cat: 'shape', accent: '#a3e635',
    about: 'Uses the second image as a map of how far to shove each pixel of the first. This is the node that makes things look hand-made rather than computed.',
    inputs: ['image', 'map'],
    params: [num('amount', 'Strength', 0, 200, 1, 40), num('angle', 'Direction', 0, 360, 1, 0)],
    run([a, m], p, w, h) {
      const out = image(w, h);
      const px = [0, 0, 0];
      const ca = Math.cos(p.angle * Math.PI / 180), sa = Math.sin(p.angle * Math.PI / 180);
      const k = p.amount * (Math.min(w, h) / 256);
      for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) {
          /* red steers horizontally, green vertically — so a plain grey map
             displaces diagonally, and a two-colour map gives you control of
             each axis independently */
          const dx = (m.r[i] - 0.5) * k, dy = (m.g[i] - 0.5) * k;
          sample(a, x + dx * ca - dy * sa, y + dx * sa + dy * ca, px);
          out.r[i] = px[0]; out.g[i] = px[1]; out.b[i] = px[2];
        }
      }
      return out;
    },
  },

  transform: {
    title: 'Transform', cat: 'shape', accent: '#a3e635',
    about: 'Zoom, spin and slide the image. It tiles, so zooming out repeats it forever.',
    inputs: ['in'],
    params: [
      num('zoom', 'Zoom', 0.1, 8, 0.01, 1),
      num('rotate', 'Rotate', -180, 180, 1, 0),
      num('x', 'Shift X', -1, 1, 0.01, 0),
      num('y', 'Shift Y', -1, 1, 0.01, 0),
    ],
    run([a], p, w, h) {
      /* Worked backwards: for each destination pixel, ask where it came from.
         Going forwards leaves holes wherever the image is stretched. */
      const out = image(w, h);
      const c = Math.cos(-p.rotate * Math.PI / 180), s = Math.sin(-p.rotate * Math.PI / 180);
      const inv = 1 / p.zoom;
      const px = [0, 0, 0];
      for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) {
          const ox = x - w / 2, oy = y - h / 2;
          const rx = (ox * c - oy * s) * inv + w / 2 - p.x * w;
          const ry = (ox * s + oy * c) * inv + h / 2 - p.y * h;
          sample(a, rx, ry, px);
          out.r[i] = px[0]; out.g[i] = px[1]; out.b[i] = px[2];
        }
      }
      return out;
    },
  },

  mirror: {
    title: 'Kaleidoscope', cat: 'shape', accent: '#a3e635',
    about: 'Folds the image back on itself. Turns noise into something that looks deliberate.',
    inputs: ['in'],
    params: [
      pick('mode', 'Fold', ['horizontal', 'vertical', 'both', 'radial'], 'radial'),
      num('segments', 'Segments', 2, 16, 1, 6),
    ],
    run([a], p, w, h) {
      const out = image(w, h);
      const px = [0, 0, 0];
      const seg = Math.round(p.segments);
      const wedge = Math.PI * 2 / seg;
      for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) {
          let sx = x, sy = y;
          if (p.mode === 'horizontal' || p.mode === 'both') sx = x < w / 2 ? x : w - 1 - x;
          if (p.mode === 'vertical' || p.mode === 'both') sy = y < h / 2 ? y : h - 1 - y;
          if (p.mode === 'radial') {
            const ox = x - w / 2, oy = y - h / 2;
            let ang = Math.atan2(oy, ox);
            const rad = Math.hypot(ox, oy);
            /* fold the angle into one wedge, then reflect alternate wedges so
               neighbouring segments meet as mirror images rather than as a
               visible seam */
            ang = ((ang % wedge) + wedge) % wedge;
            if (ang > wedge / 2) ang = wedge - ang;
            sx = w / 2 + Math.cos(ang) * rad;
            sy = h / 2 + Math.sin(ang) * rad;
          }
          sample(a, sx, sy, px);
          out.r[i] = px[0]; out.g[i] = px[1]; out.b[i] = px[2];
        }
      }
      return out;
    },
  },

  /* ── combining ─────────────────────────────────────────────── */

  blend: {
    title: 'Blend', cat: 'mix', accent: '#f472b6',
    about: 'Puts two images together. The mode decides how they argue.',
    inputs: ['a', 'b'],
    params: [
      pick('mode', 'Mode', ['mix', 'add', 'multiply', 'screen', 'difference', 'lighten', 'darken', 'overlay'], 'mix'),
      num('amount', 'Amount', 0, 1, 0.01, 0.5),
    ],
    run([a, b], p, w, h) {
      const out = image(w, h);
      const f = BLEND_MODES[p.mode] || BLEND_MODES.mix;
      const t = p.amount;
      for (let i = 0; i < out.r.length; i++) {
        out.r[i] = a.r[i] + (f(a.r[i], b.r[i]) - a.r[i]) * t;
        out.g[i] = a.g[i] + (f(a.g[i], b.g[i]) - a.g[i]) * t;
        out.b[i] = a.b[i] + (f(a.b[i], b.b[i]) - a.b[i]) * t;
      }
      return out;
    },
  },

  mask: {
    title: 'Mask', cat: 'mix', accent: '#f472b6',
    about: 'Reveals image A where the mask is bright and image B where it is dark. A blend with an opinion.',
    inputs: ['a', 'b', 'mask'],
    params: [num('softness', 'Softness', 0.01, 1, 0.01, 0.5), num('bias', 'Threshold', 0, 1, 0.01, 0.5)],
    run([a, b, m], p, w, h) {
      const out = image(w, h);
      const k = 1 / Math.max(0.01, p.softness);
      for (let i = 0; i < out.r.length; i++) {
        const v = luma(m, i);
        /* a smoothstep around the threshold, so softness 0.01 gives a hard
           cut-out and softness 1 gives a long cross-fade */
        let t = Math.min(1, Math.max(0, (v - p.bias) * k + 0.5));
        t = t * t * (3 - 2 * t);
        out.r[i] = b.r[i] + (a.r[i] - b.r[i]) * t;
        out.g[i] = b.g[i] + (a.g[i] - b.g[i]) * t;
        out.b[i] = b.b[i] + (a.b[i] - b.b[i]) * t;
      }
      return out;
    },
  },

  /* ── colour ────────────────────────────────────────────────── */

  colorize: {
    title: 'Colorize', cat: 'colour', accent: '#ffd166',
    about: 'Reads the brightness of each pixel and looks the answer up in a palette. This is where grey becomes gorgeous.',
    inputs: ['in'],
    params: [
      pick('palette', 'Palette', Object.keys(PALETTES), 'ember'),
      num('shift', 'Rotate', 0, 1, 0.01, 0),
      bool('reverse', 'Reverse', false),
    ],
    run([a], p, w, h) {
      const stops = PALETTES[p.palette] || PALETTES.ember;
      const tbl = bakeRamp(p.reverse ? [...stops].reverse() : stops, p.shift);
      const out = image(w, h);
      for (let i = 0; i < out.r.length; i++) {
        const v = Math.min(255, Math.max(0, Math.round(luma(a, i) * 255)));
        out.r[i] = tbl[v * 3]; out.g[i] = tbl[v * 3 + 1]; out.b[i] = tbl[v * 3 + 2];
      }
      return out;
    },
  },

  glow: {
    title: 'Glow', cat: 'colour', accent: '#ffd166',
    about: 'Takes the brightest parts, smears them, and adds them back on top. Cheap trick, enormous effect.',
    inputs: ['in'],
    params: [
      num('threshold', 'Catch above', 0, 1, 0.01, 0.6),
      num('radius', 'Spread', 1, 40, 0.5, 12),
      num('strength', 'Strength', 0, 3, 0.05, 1),
    ],
    run([a], p, w, h) {
      const bright = image(w, h);
      for (let i = 0; i < bright.r.length; i++) {
        const v = luma(a, i);
        const k = v > p.threshold ? (v - p.threshold) / Math.max(0.001, 1 - p.threshold) : 0;
        bright.r[i] = a.r[i] * k; bright.g[i] = a.g[i] * k; bright.b[i] = a.b[i] * k;
      }
      let s = bright;
      const rad = p.radius * (Math.min(w, h) / 256);
      for (let pass = 0; pass < 2; pass++) { s = boxPass(s, rad / 2, true); s = boxPass(s, rad / 2, false); }
      const out = image(w, h);
      for (let i = 0; i < out.r.length; i++) {
        out.r[i] = a.r[i] + s.r[i] * p.strength;
        out.g[i] = a.g[i] + s.g[i] * p.strength;
        out.b[i] = a.b[i] + s.b[i] * p.strength;
      }
      return out;
    },
  },

  output: {
    title: 'Output', cat: 'out', accent: '#ffffff',
    about: 'The end of the line. Whatever reaches here is the picture.',
    inputs: ['in'],
    params: [],
    run([a]) { return a; },
  },
};

const BLEND_MODES = {
  mix:        (a, b) => b,
  add:        (a, b) => a + b,
  multiply:   (a, b) => a * b,
  screen:     (a, b) => 1 - (1 - a) * (1 - b),
  difference: (a, b) => Math.abs(a - b),
  lighten:    (a, b) => Math.max(a, b),
  darken:     (a, b) => Math.min(a, b),
  overlay:    (a, b) => (a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b)),
};

/** One separable box-blur pass. Uses a running sum, so cost is independent of radius. */
function boxPass(src, radius, horizontal) {
  const { w, h } = src;
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return src;
  const out = image(w, h);
  const n = horizontal ? w : h;
  const outer = horizontal ? h : w;
  const win = r * 2 + 1;
  for (const ch of ['r', 'g', 'b']) {
    const S = src[ch], D = out[ch];
    for (let o = 0; o < outer; o++) {
      const idx = (k) => (horizontal ? o * w + k : k * w + o);
      /* prime the accumulator with the first window, clamping at the edge so
         the border does not darken */
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += S[idx(Math.min(n - 1, Math.max(0, k)))];
      for (let k = 0; k < n; k++) {
        D[idx(k)] = sum / win;
        sum -= S[idx(Math.min(n - 1, Math.max(0, k - r)))];
        sum += S[idx(Math.min(n - 1, Math.max(0, k + r + 1)))];
      }
    }
  }
  return out;
}

/* ── graphs ──────────────────────────────────────────────────────────────── */

export class GraphError extends Error {}

let nextId = 1;
export const freshId = () => `n${nextId++}`;
export const resetIds = (v = 1) => { nextId = v; };

/** A node with every parameter filled in from its type's defaults. */
export function makeNode(type, x = 0, y = 0, params = {}) {
  const def = NODES[type];
  if (!def) throw new GraphError(`unknown node type: ${type}`);
  const p = {};
  for (const spec of def.params) p[spec.key] = spec.def;
  return { id: freshId(), type, x, y, params: { ...p, ...params } };
}

export const emptyGraph = () => ({ nodes: [], links: [] });

export const nodeById = (g, id) => g.nodes.find((n) => n.id === id);

/** Which node, if any, is plugged into `port` of `id`. */
export const inputOf = (g, id, port) =>
  g.links.find((l) => l.to === id && l.port === port)?.from ?? null;

/**
 * Connect from -> to.port, replacing whatever was already there.
 * Refuses to create a cycle, because a graph that feeds into itself has no
 * evaluation order and would simply hang.
 */
export function connect(g, from, to, port) {
  if (from === to) throw new GraphError('a node cannot feed itself');
  if (reaches(g, to, from)) throw new GraphError('that would make a loop');
  const links = g.links.filter((l) => !(l.to === to && l.port === port));
  links.push({ from, to, port });
  return { ...g, links };
}

export function disconnect(g, to, port) {
  return { ...g, links: g.links.filter((l) => !(l.to === to && l.port === port)) };
}

export function removeNode(g, id) {
  return {
    nodes: g.nodes.filter((n) => n.id !== id),
    links: g.links.filter((l) => l.from !== id && l.to !== id),
  };
}

/** Is `target` downstream of `from`? Used to keep the graph acyclic. */
export function reaches(g, from, target) {
  const seen = new Set();
  const walk = (id) => {
    if (id === target) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return g.links.filter((l) => l.from === id).some((l) => walk(l.to));
  };
  return walk(from);
}

/** Depth-first evaluation order for `id`, dependencies before dependents. */
export function evalOrder(g, id) {
  const order = [], state = new Map();
  const visit = (nid) => {
    const st = state.get(nid);
    if (st === 'done') return;
    if (st === 'open') throw new GraphError('the graph contains a loop');
    state.set(nid, 'open');
    const node = nodeById(g, nid);
    if (!node) throw new GraphError(`missing node: ${nid}`);
    for (let port = 0; port < NODES[node.type].inputs.length; port++) {
      const src = inputOf(g, nid, port);
      if (src) visit(src);
    }
    state.set(nid, 'done');
    order.push(nid);
  };
  visit(id);
  return order;
}

/* A cheap, order-sensitive string hash. It only has to distinguish states
   that differ, and collisions would only ever cause a stale thumbnail — so a
   32-bit hash is plenty and a cryptographic one would be silly. */
function hashStr(s) {
  let a = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619) >>> 0; }
  return a.toString(36);
}

/** The identity of a node's result: its type, knobs, size and inputs' identities. */
export function signature(g, id, w, h, memo = new Map()) {
  if (memo.has(id)) return memo.get(id);
  const node = nodeById(g, id);
  if (!node) throw new GraphError(`missing node: ${id}`);
  const parts = [node.type, w, h];
  for (const spec of NODES[node.type].params) parts.push(`${spec.key}=${node.params[spec.key]}`);
  for (let port = 0; port < NODES[node.type].inputs.length; port++) {
    const src = inputOf(g, id, port);
    parts.push(src ? signature(g, src, w, h, memo) : '-');
  }
  const sig = hashStr(parts.join('|'));
  memo.set(id, sig);
  return sig;
}

/** A node with an unconnected input gets mid-grey rather than an exception. */
function placeholder(w, h) {
  const img = image(w, h);
  img.r.fill(0.5); img.g.fill(0.5); img.b.fill(0.5);
  return img;
}

/**
 * Evaluate `id` at w x h.
 *
 * `cache` is a Map of signature -> image that survives between calls. Pass the
 * same one each time and only what actually changed is recomputed.
 *
 * Returns { image, results, computed } — results maps every node id visited to
 * its image, so an editor can show a thumbnail on each node from one pass.
 */
export function evaluate(g, id, w, h, cache = new Map()) {
  const order = evalOrder(g, id);
  const sigs = new Map();
  const results = new Map();
  let computed = 0;

  for (const nid of order) {
    const node = nodeById(g, nid);
    const def = NODES[node.type];
    const sig = signature(g, nid, w, h, sigs);

    const hit = cache.get(sig);
    if (hit && hit.w === w && hit.h === h) { results.set(nid, hit); continue; }

    const inputs = def.inputs.map((_, port) => {
      const src = inputOf(g, nid, port);
      return src ? results.get(src) : placeholder(w, h);
    });

    const out = def.run(inputs, node.params, w, h);
    cache.set(sig, out);
    results.set(nid, out);
    computed++;
  }

  return { image: results.get(id), results, computed, order };
}

/** Float pixels to the clamped bytes a canvas wants. */
export function toRGBA(img, target) {
  const out = target || new Uint8ClampedArray(img.w * img.h * 4);
  for (let i = 0, j = 0; i < img.r.length; i++, j += 4) {
    out[j] = img.r[i] * 255;
    out[j + 1] = img.g[i] * 255;
    out[j + 2] = img.b[i] * 255;
    out[j + 3] = 255;
  }
  return out;
}

/* ── saving ──────────────────────────────────────────────────────────────── */

/* Graphs travel in the URL, so a picture you made is a link you can send.
   Positions are rounded and parameters trimmed to keep it short enough that
   a browser and a chat app will both survive it. */

export function serialize(g) {
  return {
    v: 1,
    n: g.nodes.map((n) => [n.id, n.type, Math.round(n.x), Math.round(n.y),
      Object.fromEntries(Object.entries(n.params).map(([k, v]) =>
        [k, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v]))]),
    l: g.links.map((l) => [l.from, l.to, l.port]),
  };
}

export function deserialize(data) {
  if (!data || data.v !== 1 || !Array.isArray(data.n)) throw new GraphError('not a loom graph');
  const nodes = data.n.map(([id, type, x, y, params]) => {
    if (!NODES[type]) throw new GraphError(`unknown node type: ${type}`);
    const base = {};
    for (const spec of NODES[type].params) base[spec.key] = spec.def;
    return { id, type, x, y, params: { ...base, ...params } };
  });
  const links = (data.l || [])
    .map(([from, to, port]) => ({ from, to, port }))
    .filter((l) => nodes.some((n) => n.id === l.from) && nodes.some((n) => n.id === l.to));
  /* ids arriving from a URL must not collide with ids minted later */
  let max = 0;
  for (const n of nodes) { const m = /^n(\d+)$/.exec(n.id); if (m) max = Math.max(max, +m[1]); }
  resetIds(max + 1);
  return { nodes, links };
}

import { test, assert } from './harness.mjs';
import {
  rng, luma, adjust, sobel, floydSteinberg, kmeans, colorSamples,
  densitySample, Stippler, delaunay, meshPoints, triangleColor, mosaic,
} from '../play/portrait/engine.js';

/** A tiny RGBA image from a per-pixel function returning [r,g,b]. */
function make(w, h, fn) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const [r, g, b] = fn(x, y);
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  return px;
}
const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };

/* ── brightness ──────────────────────────────────────────────────────────── */

test('brightness weights the channels the way an eye does', () => {
  const px = make(3, 1, (x) => [[255, 0, 0], [0, 255, 0], [0, 0, 255]][x]);
  const g = luma(px, 3, 1);
  assert.close(g[0], 0.2126, 1e-4);
  assert.close(g[1], 0.7152, 1e-4);
  assert.close(g[2], 0.0722, 1e-4);
  assert.ok(g[1] > g[0] && g[0] > g[2], 'green must read brightest and blue darkest');
});

test('contrast pushes away from mid-grey without escaping 0..1', () => {
  const g = Float32Array.from([0, 0.25, 0.5, 0.75, 1]);
  const hi = adjust(g, { contrast: 2 });
  assert.close(hi[2], 0.5, 1e-6, 'mid-grey is the pivot and must not move');
  assert.ok(hi[1] < g[1] && hi[3] > g[3], 'darks down, lights up');
  for (const v of hi) assert.ok(v >= 0 && v <= 1, `escaped range: ${v}`);
});

/* ── edges ───────────────────────────────────────────────────────────────── */

test('a flat image has no edges at all', () => {
  const g = new Float32Array(16 * 16).fill(0.42);
  const e = sobel(g, 16, 16);
  for (const v of e) assert.equal(v, 0);
});

test('a hard vertical edge is found, and only where it is', () => {
  const w = 21, h = 9;
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x < 10 ? 0 : 1;
  const e = sobel(g, w, h);
  const col = (x) => { let m = 0; for (let y = 1; y < h - 1; y++) m = Math.max(m, e[y * w + x]); return m; };
  assert.close(col(9), 1, 1e-6, 'the strongest response should sit on the boundary');
  assert.close(col(2), 0, 1e-6, 'flat region, far left');
  assert.close(col(18), 0, 1e-6, 'flat region, far right');
});

/* ── dithering ───────────────────────────────────────────────────────────── */

test('dithering to pure black and white keeps the average brightness', () => {
  // This is the entire illusion: every pixel is wrong, the area is right.
  const w = 64, h = 64;
  const g = new Float32Array(w * h).fill(0.33);
  const out = floydSteinberg(g, w, h, 2);
  for (const v of out) assert.ok(v === 0 || v === 255, `expected 1-bit output, saw ${v}`);
  assert.close(mean(out) / 255, 0.33, 0.02, 'the grey has to survive as a ratio of black to white');
});

test('a gradient dithers into a gradient of dot density', () => {
  const w = 96, h = 24;
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x / (w - 1);
  const out = floydSteinberg(g, w, h, 2);
  const share = (x0, x1) => {
    let on = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) { on += out[y * w + x] > 127 ? 1 : 0; n++; }
    return on / n;
  };
  assert.ok(share(0, 16) < 0.2, 'the dark end should be mostly black');
  assert.ok(share(80, 96) > 0.8, 'the light end should be mostly white');
  assert.ok(share(40, 56) > share(0, 16) && share(40, 56) < share(80, 96), 'and the middle in between');
});

test('more levels means less error than fewer', () => {
  const w = 40, h = 40;
  const g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (i % w) / (w - 1);
  const err = (levels) => {
    const out = floydSteinberg(g, w, h, levels);
    let e = 0;
    for (let i = 0; i < g.length; i++) e += Math.abs(out[i] / 255 - g[i]);
    return e / g.length;
  };
  assert.ok(err(8) < err(2), 'eight shades should track the original more closely than two');
});

/* ── palettes ────────────────────────────────────────────────────────────── */

test('k-means finds clusters that are actually there', () => {
  const rand = rng(4);
  const pts = [];
  // two tight, well-separated blobs
  for (let i = 0; i < 300; i++) pts.push(20 + rand() * 12, 30 + rand() * 12, 40 + rand() * 12);
  for (let i = 0; i < 300; i++) pts.push(210 + rand() * 12, 200 + rand() * 12, 190 + rand() * 12);
  const { centroids } = kmeans(Float32Array.from(pts), 2, { seed: 9 });
  const dark = centroids[0] < 128 ? 0 : 1, light = 1 - dark;
  assert.close(centroids[dark * 3], 26, 6);
  assert.close(centroids[light * 3], 216, 6);
});

test('the same image and seed give the same palette twice', () => {
  const s = colorSamples(make(24, 24, (x, y) => [x * 9, y * 9, 128]), 24, 24, 2);
  const a = kmeans(s, 5, { seed: 3 }).centroids;
  const b = kmeans(s, 5, { seed: 3 }).centroids;
  assert.deep([...a], [...b]);
});

test('asking for more colours than there are pixels is not an error', () => {
  const s = colorSamples(make(2, 2, () => [10, 20, 30]), 2, 2, 1);
  const r = kmeans(s, 50, { seed: 1 });
  assert.ok(r.k <= 4, `expected at most 4 clusters from 4 pixels, got ${r.k}`);
});

/* ── placing points ──────────────────────────────────────────────────────── */

test('points land where the picture is dark, not spread evenly', () => {
  const w = 60, h = 60;
  const weight = new Float32Array(w * h);
  // only the left third carries any weight
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) weight[y * w + x] = x < 20 ? 1 : 0;
  const pts = densitySample(weight, w, h, 400, rng(2));
  let left = 0;
  for (let i = 0; i < 400; i++) if (pts[i * 2] < 20) left++;
  assert.ok(left > 380, `expected nearly every point in the weighted third, got ${left}/400`);
});

test('a blank image still returns the number of points asked for', () => {
  // rejection sampling against zero weight would otherwise spin for ever
  const pts = densitySample(new Float32Array(400), 20, 20, 50, rng(1));
  assert.equal(pts.length, 100);
  for (let i = 0; i < 50; i++) {
    assert.ok(pts[i * 2] >= 0 && pts[i * 2] <= 20, 'x in bounds');
    assert.ok(pts[i * 2 + 1] >= 0 && pts[i * 2 + 1] <= 20, 'y in bounds');
  }
});

/* ── stippling ───────────────────────────────────────────────────────────── */

test('the grid finds the same nearest dot as checking every one', () => {
  // The spatial grid is the only reason this is fast; if it disagrees with
  // brute force anywhere, the whole relaxation is quietly wrong.
  const w = 80, h = 60;
  const weight = new Float32Array(w * h).fill(0.6);
  const s = new Stippler(weight, w, h, 120, 11);
  s.step();
  const rand = rng(99);
  for (let trial = 0; trial < 250; trial++) {
    const x = rand() * w, y = rand() * h;
    let bi = -1, bd = Infinity;
    for (let i = 0; i < s.n; i++) {
      const dx = s.pts[i * 2] - x, dy = s.pts[i * 2 + 1] - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    const got = s.nearest(x, y);
    const gd = (s.pts[got * 2] - x) ** 2 + (s.pts[got * 2 + 1] - y) ** 2;
    assert.close(gd, bd, 1e-9, `grid picked dot ${got}, brute force picked ${bi}`);
  }
});

test('relaxation settles down instead of wandering', () => {
  const w = 70, h = 70;
  const weight = new Float32Array(w * h).fill(1);
  const s = new Stippler(weight, w, h, 180, 5);
  const first = s.step();
  let last = first;
  for (let i = 0; i < 7; i++) last = s.step();
  assert.ok(last < first * 0.5, `drift should fall: started ${first.toFixed(2)}, ended ${last.toFixed(2)}`);
  for (let i = 0; i < s.n; i++) {
    assert.ok(s.pts[i * 2] >= 0 && s.pts[i * 2] <= w, 'a dot left the canvas horizontally');
    assert.ok(s.pts[i * 2 + 1] >= 0 && s.pts[i * 2 + 1] <= h, 'a dot left the canvas vertically');
  }
});

test('relaxation spreads dots out — no two end up on top of each other', () => {
  const w = 64, h = 64;
  const s = new Stippler(new Float32Array(w * h).fill(1), w, h, 64, 3);
  for (let i = 0; i < 8; i++) s.step();
  let closest = Infinity;
  for (let i = 0; i < s.n; i++) {
    for (let j = i + 1; j < s.n; j++) {
      closest = Math.min(closest, Math.hypot(s.pts[i * 2] - s.pts[j * 2], s.pts[i * 2 + 1] - s.pts[j * 2 + 1]));
    }
  }
  // even spacing over 64x64 with 64 dots is 8px; anything under 2 is a clump
  assert.ok(closest > 2, `two dots ended up ${closest.toFixed(2)}px apart`);
});

/* ── triangles ───────────────────────────────────────────────────────────── */

test('the triangulation is genuinely Delaunay', () => {
  // The defining property, and the one thing worth asserting: no point may
  // lie inside the circle drawn through any triangle's three corners.
  const rand = rng(21);
  const pts = Array.from({ length: 90 }, () => [rand() * 200, rand() * 200]);
  const tris = delaunay(pts);
  assert.ok(tris.length > 0, 'nothing was triangulated');

  const circum = (a, b, c) => {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
    const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
    return [ux, uy, Math.hypot(a[0] - ux, a[1] - uy)];
  };

  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [pts[tris[t]], pts[tris[t + 1]], pts[tris[t + 2]]];
    const [ux, uy, r] = circum(a, b, c);
    for (let i = 0; i < pts.length; i++) {
      if (i === tris[t] || i === tris[t + 1] || i === tris[t + 2]) continue;
      const d = Math.hypot(pts[i][0] - ux, pts[i][1] - uy);
      assert.ok(d > r - 1e-6, `point ${i} sits inside the circumcircle of triangle ${t / 3}`);
    }
  }
});

test('the mesh has no holes and no overlaps', () => {
  // Every interior edge belongs to exactly two triangles; every edge on the
  // outside belongs to exactly one. Anything else is a gap or a fold.
  const rand = rng(8);
  const pts = Array.from({ length: 60 }, () => [rand() * 100, rand() * 100]);
  const tris = delaunay(pts);
  const seen = new Map();
  for (let t = 0; t < tris.length; t += 3) {
    for (const [a, b] of [[tris[t], tris[t + 1]], [tris[t + 1], tris[t + 2]], [tris[t + 2], tris[t]]]) {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
  for (const [key, count] of seen) assert.ok(count === 1 || count === 2, `edge ${key} is shared by ${count} triangles`);
  assert.ok([...seen.values()].filter((c) => c === 2).length > 0, 'expected interior edges');
});

test('every triangle has real area — no slivers collapsed to a line', () => {
  const rand = rng(13);
  const pts = Array.from({ length: 70 }, () => [rand() * 150, rand() * 150]);
  const tris = delaunay(pts);
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [pts[tris[t]], pts[tris[t + 1]], pts[tris[t + 2]]];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    assert.ok(area > 1e-9, `triangle ${t / 3} has no area`);
  }
});

test('too few points to make a triangle is handled, not thrown', () => {
  assert.equal(delaunay([]).length, 0);
  assert.equal(delaunay([[0, 0], [1, 1]]).length, 0);
  assert.equal(delaunay([[0, 0], [10, 0], [0, 10]]).length, 3);
});

test('mesh points cover the frame right to its corners', () => {
  const w = 120, h = 90;
  const edges = new Float32Array(w * h).fill(0.5);
  const pts = meshPoints(edges, w, h, 200, 2);
  const has = (x, y) => pts.some((p) => Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] - y) < 1e-6);
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    assert.ok(has(x, y), `corner ${x},${y} is missing — the picture would have a gap`);
  }
  for (const p of pts) {
    assert.ok(p[0] >= 0 && p[0] <= w && p[1] >= 0 && p[1] <= h, `point outside the frame: ${p}`);
  }

  // and the hull must actually be the whole frame, or the last row and column
  // of the picture end up covered by no triangle at all
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  assert.equal(Math.min(...xs), 0); assert.equal(Math.max(...xs), w);
  assert.equal(Math.min(...ys), 0); assert.equal(Math.max(...ys), h);
});

test('detail follows the edges', () => {
  const w = 100, h = 100;
  const edges = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) edges[y * w + x] = y < 30 ? 1 : 0.001;
  const pts = meshPoints(edges, w, h, 600, 4);
  const top = pts.filter((p) => p[1] < 30).length;
  assert.ok(top / pts.length > 0.45, `only ${Math.round(100 * top / pts.length)}% of points landed on the detailed band`);
});

test('a triangle takes its colour from the picture underneath it', () => {
  const px = make(40, 40, (x) => (x < 20 ? [200, 20, 20] : [20, 20, 200]));
  const red = triangleColor(px, 40, 40, [1, 1], [15, 2], [8, 18]);
  const blue = triangleColor(px, 40, 40, [24, 1], [38, 2], [31, 18]);
  assert.ok(red[0] > 150 && red[2] < 80, `expected red, got ${red.map(Math.round)}`);
  assert.ok(blue[2] > 150 && blue[0] < 80, `expected blue, got ${blue.map(Math.round)}`);
});

/* ── mosaic ──────────────────────────────────────────────────────────────── */

test('the mosaic covers the image and uses only its own palette', () => {
  const px = make(64, 48, (x, y) => [x * 4, y * 5, 120]);
  const m = mosaic(px, 64, 48, 8, 6, 5);
  assert.equal(m.cols, 8);
  assert.equal(m.rows, 6);
  assert.equal(m.labels.length, 48);
  assert.ok(m.k <= 6 && m.k >= 1);
  for (const l of m.labels) assert.ok(l < m.k, `cell referenced colour ${l} of ${m.k}`);
});

test('a cell size that does not divide the image still covers all of it', () => {
  const px = make(50, 30, () => [9, 9, 9]);
  const m = mosaic(px, 50, 30, 7, 3, 1);
  assert.ok(m.cols * 7 >= 50 && m.rows * 7 >= 30, 'the grid must reach the far edge');
  assert.equal(m.labels.length, m.cols * m.rows);
});

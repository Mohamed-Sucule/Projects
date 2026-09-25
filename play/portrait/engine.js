/* ───────────────────────────────────────────────────────────────────────────
   portrait/engine.js — four ways of rebuilding a photograph out of something
   that is not a photograph.

   No DOM anywhere in this file. Everything takes pixels in and gives numbers
   back, so all of it runs and is tested from a terminal.

   The four:

     STIPPLE   thousands of dots, more of them where the picture is dark.
               Watch it settle and a face appears out of noise. This is the
               one people react to, and it is the only one that animates,
               because the settling IS the effect.

     LOW-POLY  a mesh of triangles, with more of them along edges. Each
               triangle takes a single flat colour from the photo underneath.

     MOSAIC    the whole picture reduced to a handful of colours chosen by
               the picture itself, laid out as tiles.

     INK       one bit per pixel. Black or white, nothing between, and the
               illusion of grey made entirely from where the dots fall.

   Nothing here is a filter applied to pixels. Each one throws the photograph
   away and rebuilds it from a few thousand primitives, which is why they hold
   up when you look closely and a filter does not.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── basics ──────────────────────────────────────────────────────────────── */

/** Deterministic PRNG — the same photo must produce the same picture twice. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Perceived brightness, 0..1, one float per pixel.
 *
 * The weights are the standard ones and they are not equal on purpose: the eye
 * is far more sensitive to green than to blue. Averaging the three channels
 * instead — which is the obvious thing to write — makes yellows come out too
 * dark and blues too light, and every downstream effect inherits the error.
 */
export function luma(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = (0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]) / 255;
  }
  return out;
}

/** Contrast and brightness about mid-grey, in place-safe form. */
export function adjust(gray, { contrast = 1, brightness = 0 } = {}) {
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = clamp01(0.5 + (gray[i] - 0.5) * contrast + brightness);
  }
  return out;
}

/* ── edges ───────────────────────────────────────────────────────────────── */

/**
 * Sobel edge strength, 0..1 per pixel.
 *
 * Two 3x3 kernels, one sensitive to vertical change and one to horizontal;
 * the answer is the length of the vector they form. Edges are where the
 * triangles need to be dense in low-poly mode, and where the ink lines go.
 */
export function sobel(gray, w, h) {
  const out = new Float32Array(w * h);
  const at = (x, y) => gray[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  let peak = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
                 + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
                 + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const m = Math.hypot(gx, gy);
      out[y * w + x] = m;
      if (m > peak) peak = m;
    }
  }
  // normalised against this image's own strongest edge, so a low-contrast
  // photo still produces a usable edge map instead of a black one
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
  return out;
}

/* ── one bit per pixel ───────────────────────────────────────────────────── */

/**
 * Floyd–Steinberg error diffusion to `levels` shades (2 = pure black/white).
 *
 * Rounding each pixel to the nearest shade on its own gives you flat bands and
 * loses everything in between. The trick is to round, then carry the rounding
 * error forward into the neighbours that have not been decided yet, in fixed
 * proportions: 7/16 right, 3/16 down-left, 5/16 down, 1/16 down-right.
 *
 * The errors cancel out across any small area, so the average brightness of
 * the result matches the original even though every single pixel is wrong.
 * That is the whole illusion, and it is why the test asserts on the mean.
 */
export function floydSteinberg(gray, w, h, levels = 2) {
  const buf = Float32Array.from(gray);
  const out = new Uint8Array(w * h);
  const steps = Math.max(2, Math.round(levels)) - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = buf[i];
      const q = Math.round(clamp01(old) * steps) / steps;
      out[i] = Math.round(q * 255);
      const err = old - q;
      if (x + 1 < w) buf[i + 1] += err * 7 / 16;
      if (y + 1 < h) {
        if (x > 0) buf[i + w - 1] += err * 3 / 16;
        buf[i + w] += err * 5 / 16;
        if (x + 1 < w) buf[i + w + 1] += err * 1 / 16;
      }
    }
  }
  return out;
}

/* ── colours the picture chose for itself ────────────────────────────────── */

/**
 * k-means over pixel colours: find the `k` colours that best represent this
 * image, rather than snapping to a fixed palette somebody else picked.
 *
 * Seeded with k-means++ — each new starting colour is chosen with probability
 * proportional to how far it sits from the nearest one already chosen. Picking
 * the k starts at random instead routinely lands two of them inside the same
 * dominant colour, and the result is a palette that misses an entire part of
 * the picture.
 */
export function kmeans(samples, k, { seed = 1, iterations = 12 } = {}) {
  const n = samples.length / 3;
  const rand = rng(seed);
  k = Math.max(1, Math.min(k, n));

  const cent = new Float32Array(k * 3);
  const dist2 = (i, c) => {
    const dr = samples[i * 3] - cent[c * 3];
    const dg = samples[i * 3 + 1] - cent[c * 3 + 1];
    const db = samples[i * 3 + 2] - cent[c * 3 + 2];
    return dr * dr + dg * dg + db * db;
  };

  // ── k-means++ seeding
  let first = Math.floor(rand() * n);
  cent[0] = samples[first * 3]; cent[1] = samples[first * 3 + 1]; cent[2] = samples[first * 3 + 2];
  const best = new Float32Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) { best[i] = Math.min(best[i], dist2(i, c - 1)); total += best[i]; }
    let target = rand() * total, pick = n - 1;
    for (let i = 0; i < n; i++) { target -= best[i]; if (target <= 0) { pick = i; break; } }
    cent[c * 3] = samples[pick * 3]; cent[c * 3 + 1] = samples[pick * 3 + 1]; cent[c * 3 + 2] = samples[pick * 3 + 2];
  }

  // ── Lloyd iterations
  const labels = new Uint16Array(n);
  const sum = new Float64Array(k * 3), count = new Uint32Array(k);
  for (let it = 0; it < iterations; it++) {
    sum.fill(0); count.fill(0);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = dist2(i, c); if (d < bd) { bd = d; bi = c; } }
      if (labels[i] !== bi) moved++;
      labels[i] = bi;
      sum[bi * 3] += samples[i * 3]; sum[bi * 3 + 1] += samples[i * 3 + 1]; sum[bi * 3 + 2] += samples[i * 3 + 2];
      count[bi]++;
    }
    for (let c = 0; c < k; c++) {
      if (!count[c]) continue;
      cent[c * 3] = sum[c * 3] / count[c];
      cent[c * 3 + 1] = sum[c * 3 + 1] / count[c];
      cent[c * 3 + 2] = sum[c * 3 + 2] / count[c];
    }
    if (!moved) break;      // settled; more passes cannot change anything
  }
  return { centroids: cent, labels, k };
}

/** Every nth pixel as an RGB sample set, for feeding kmeans without the cost. */
export function colorSamples(rgba, w, h, stride = 4) {
  const xs = Math.max(1, Math.round(stride));
  const cols = Math.ceil(w / xs), rows = Math.ceil(h / xs);
  const out = new Float32Array(cols * rows * 3);
  let o = 0;
  for (let y = 0; y < h; y += xs) {
    for (let x = 0; x < w; x += xs) {
      const j = (y * w + x) * 4;
      out[o++] = rgba[j]; out[o++] = rgba[j + 1]; out[o++] = rgba[j + 2];
    }
  }
  return out.subarray(0, o);
}

/* ── choosing where to put things ────────────────────────────────────────── */

/**
 * Scatter `count` points so that dense regions of `weight` get more of them.
 *
 * Rejection sampling: throw a dart anywhere, keep it with probability equal to
 * the weight there. Simple, unbiased, and it needs no preprocessing — which
 * matters because this runs again every time a slider moves.
 */
export function densitySample(weight, w, h, count, rand = rng(7)) {
  const pts = new Float32Array(count * 2);
  let placed = 0, tries = 0;
  const cap = count * 400;   // a nearly-white image would otherwise never fill
  while (placed < count && tries < cap) {
    tries++;
    const x = rand() * w, y = rand() * h;
    const v = weight[(y | 0) * w + (x | 0)];
    if (rand() < v) { pts[placed * 2] = x; pts[placed * 2 + 1] = y; placed++; }
  }
  // whatever is left over goes down uniformly rather than being dropped, so
  // the caller always gets the number of points it asked for
  while (placed < count) {
    pts[placed * 2] = rand() * w; pts[placed * 2 + 1] = rand() * h; placed++;
  }
  return pts;
}

/* ── stippling ───────────────────────────────────────────────────────────── */

/**
 * Weighted Lloyd relaxation.
 *
 * Every pixel is assigned to its nearest dot; every dot then moves to the
 * brightness-weighted centre of the pixels that chose it. Repeat. Dots spread
 * out until each is responsible for an equal share of the image's darkness,
 * which is exactly what a good stipple drawing looks like.
 *
 * The naive version compares every pixel against every dot — 200,000 pixels
 * against 4,000 dots is 800 million distance checks per pass, which is several
 * seconds. Instead the dots go into a uniform grid whose cells are about one
 * dot apart, and each pixel only searches outwards from its own cell until the
 * next ring cannot possibly hold anything closer. That is roughly ten checks
 * per pixel instead of four thousand.
 */
export class Stippler {
  constructor(weight, w, h, count, seed = 7, { start = 'density' } = {}) {
    this.weight = weight; this.w = w; this.h = h; this.n = count;
    this.rand = rng(seed);
    /* 'density' drops the dots roughly where they belong and converges in a
       few passes. 'uniform' scatters them at random and lets the relaxation
       do all of the work — slower, and the reason the picture visibly
       assembles itself rather than appearing already finished. The two settle
       to the same arrangement; only the journey differs. */
    this.pts = start === 'uniform'
      ? (() => {
          const p = new Float32Array(count * 2);
          for (let i = 0; i < count; i++) { p[i * 2] = this.rand() * w; p[i * 2 + 1] = this.rand() * h; }
          return p;
        })()
      : densitySample(weight, w, h, count, this.rand);
    this.cell = Math.max(2, Math.sqrt((w * h) / Math.max(1, count)));
    this.gw = Math.max(1, Math.ceil(w / this.cell));
    this.gh = Math.max(1, Math.ceil(h / this.cell));
    this.counts = new Int32Array(this.gw * this.gh + 1);
    this.order = new Int32Array(count);
    this.sumX = new Float64Array(count);
    this.sumY = new Float64Array(count);
    this.sumW = new Float64Array(count);
    this.drift = Infinity;
    this.passes = 0;
  }

  /** Bucket every dot into the grid, as a counting sort into flat arrays. */
  #index() {
    const { gw, gh, cell, counts, order, pts, n } = this;
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const gx = Math.min(gw - 1, Math.max(0, (pts[i * 2] / cell) | 0));
      const gy = Math.min(gh - 1, Math.max(0, (pts[i * 2 + 1] / cell) | 0));
      counts[gy * gw + gx + 1]++;
    }
    for (let c = 1; c <= gw * gh; c++) counts[c] += counts[c - 1];
    const cursor = Int32Array.from(counts.subarray(0, gw * gh));
    for (let i = 0; i < n; i++) {
      const gx = Math.min(gw - 1, Math.max(0, (pts[i * 2] / cell) | 0));
      const gy = Math.min(gh - 1, Math.max(0, (pts[i * 2 + 1] / cell) | 0));
      order[cursor[gy * gw + gx]++] = i;
    }
  }

  /** Index of the dot nearest (x, y). */
  nearest(x, y) {
    const { gw, gh, cell, counts, order, pts } = this;
    const cx = Math.min(gw - 1, Math.max(0, (x / cell) | 0));
    const cy = Math.min(gh - 1, Math.max(0, (y / cell) | 0));
    let best = -1, bestD = Infinity;
    const maxR = Math.max(gw, gh);
    for (let r = 0; r <= maxR; r++) {
      const x0 = Math.max(0, cx - r), x1 = Math.min(gw - 1, cx + r);
      const y0 = Math.max(0, cy - r), y1 = Math.min(gh - 1, cy + r);
      for (let gy = y0; gy <= y1; gy++) {
        const edgeRow = (gy === cy - r || gy === cy + r);
        for (let gx = x0; gx <= x1; gx++) {
          // only the perimeter of this ring — the inside was done already
          if (!edgeRow && gx !== cx - r && gx !== cx + r) continue;
          const c = gy * gw + gx;
          for (let k = counts[c]; k < counts[c + 1]; k++) {
            const i = order[k];
            const dx = pts[i * 2] - x, dy = pts[i * 2 + 1] - y;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = i; }
          }
        }
      }
      // anything in a further ring is at least r cells away, so once the best
      // so far beats that we are done and can stop expanding
      if (best >= 0 && bestD <= (r * cell) * (r * cell)) break;
    }
    return best;
  }

  /** One relaxation pass. Returns the average distance the dots moved. */
  step() {
    const { w, h, n, weight, sumX, sumY, sumW, pts } = this;
    this.#index();
    sumX.fill(0); sumY.fill(0); sumW.fill(0);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wt = weight[y * w + x];
        if (wt <= 0.004) continue;    // white paper pulls on nothing
        const i = this.nearest(x + 0.5, y + 0.5);
        if (i < 0) continue;
        sumX[i] += (x + 0.5) * wt; sumY[i] += (y + 0.5) * wt; sumW[i] += wt;
      }
    }

    let moved = 0;
    for (let i = 0; i < n; i++) {
      if (sumW[i] > 0) {
        const nx = sumX[i] / sumW[i], ny = sumY[i] / sumW[i];
        moved += Math.hypot(nx - pts[i * 2], ny - pts[i * 2 + 1]);
        pts[i * 2] = nx; pts[i * 2 + 1] = ny;
      } else {
        // a dot stranded in a white area owns nothing and would sit there for
        // ever; throw it back into the picture where there is work to do
        const p = densitySample(weight, w, h, 1, this.rand);
        moved += Math.hypot(p[0] - pts[i * 2], p[1] - pts[i * 2 + 1]);
        pts[i * 2] = p[0]; pts[i * 2 + 1] = p[1];
      }
    }
    this.drift = moved / Math.max(1, n);
    this.passes++;
    return this.drift;
  }

  /** The average distance between neighbouring dots, in image pixels. */
  get spacing() { return Math.sqrt((this.w * this.h) / Math.max(1, this.n)); }

  /** How dark the image is around a dot — used to size it when drawing. */
  weightAt(i) {
    const x = Math.min(this.w - 1, Math.max(0, this.pts[i * 2] | 0));
    const y = Math.min(this.h - 1, Math.max(0, this.pts[i * 2 + 1] | 0));
    return this.weight[y * this.w + x];
  }
}

/* ── triangles ───────────────────────────────────────────────────────────── */

/* Is p strictly inside the circle through a, b, c? The standard determinant,
   which assumes a, b, c wind anticlockwise — hence the orientation fix in
   delaunay() below. Getting that backwards produces a triangulation that
   looks almost right and fails the circumcircle property everywhere. */
function inCircumcircle(p, a, b, c) {
  const ax = a[0] - p[0], ay = a[1] - p[1];
  const bx = b[0] - p[0], by = b[1] - p[1];
  const cx = c[0] - p[0], cy = c[1] - p[1];
  return (ax * ax + ay * ay) * (bx * cy - by * cx)
       - (bx * bx + by * by) * (ax * cy - ay * cx)
       + (cx * cx + cy * cy) * (ax * by - ay * bx) > 1e-12;
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/**
 * Delaunay triangulation, Bowyer–Watson.
 *
 * Start with one huge triangle containing everything. Insert each point: find
 * every triangle whose circumcircle swallows it, delete them, and fill the
 * hole that leaves by joining the new point to the hole's boundary. Finish by
 * throwing away anything still attached to the huge triangle.
 *
 * Of all the ways to join points into triangles, this is the one that avoids
 * long thin slivers — it maximises the smallest angle in the whole mesh. That
 * is the difference between a low-poly picture that looks designed and one
 * that looks like shattered glass.
 *
 * Returns a flat Int32Array of vertex indices, three per triangle.
 */
export function delaunay(points) {
  const n = points.length;
  if (n < 3) return new Int32Array(0);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const dmax = Math.max(maxX - minX, maxY - minY) || 1;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const pts = points.concat([
    [mx - 20 * dmax, my - dmax], [mx, my + 20 * dmax], [mx + 20 * dmax, my - dmax],
  ]);

  const orient = (t) => (cross(pts[t[0]], pts[t[1]], pts[t[2]]) < 0 ? [t[0], t[2], t[1]] : t);
  let tris = [orient([n, n + 1, n + 2])];

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const keep = [], edges = new Map();
    for (const t of tris) {
      if (inCircumcircle(p, pts[t[0]], pts[t[1]], pts[t[2]])) {
        for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
          const key = a < b ? `${a},${b}` : `${b},${a}`;
          // an edge shared by two doomed triangles is interior to the hole,
          // so it cancels; what survives is exactly the hole's outline
          if (edges.has(key)) edges.delete(key); else edges.set(key, [a, b]);
        }
      } else keep.push(t);
    }
    tris = keep;
    for (const [a, b] of edges.values()) tris.push(orient([a, b, i]));
  }

  const out = [];
  for (const t of tris) {
    if (t[0] < n && t[1] < n && t[2] < n) out.push(t[0], t[1], t[2]);
  }
  return Int32Array.from(out);
}

/**
 * Points for a low-poly mesh: the corners and edges of the frame so the
 * picture is covered right to its border, a jittered grid so no large area is
 * empty, and the rest scattered along whatever the Sobel pass found
 * interesting. Detail lands where the picture changes, which is where a person
 * looks.
 */
export function meshPoints(edges, w, h, count, seed = 3) {
  const rand = rng(seed);

  /* The frame is the rectangle [0,w] x [0,h], not [0,w-1] x [0,h-1].
     Pinning the corners to w-1 and h-1 while scattered points range over
     [0,w) put some of them outside the mesh's own convex hull, and left the
     last row and column of the picture uncovered by any triangle. */
  const pts = [[0, 0], [w, 0], [0, h], [w, h]];

  const border = Math.max(2, Math.round(Math.sqrt(count) / 2));
  for (let i = 1; i < border; i++) {
    const t = i / border;
    pts.push([t * w, 0], [t * w, h], [0, t * h], [w, t * h]);
  }

  const gridN = Math.max(1, Math.round(count * 0.28));
  const cols = Math.max(1, Math.round(Math.sqrt(gridN * w / h)));
  const rows = Math.max(1, Math.round(gridN / cols));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push([
        Math.min(w, (c + 0.15 + rand() * 0.7) * (w / cols)),
        Math.min(h, (r + 0.15 + rand() * 0.7) * (h / rows)),
      ]);
    }
  }

  // edge strength is boosted before sampling so that mid-strength detail is
  // not swamped by a few very hard edges
  const weight = new Float32Array(edges.length);
  for (let i = 0; i < edges.length; i++) weight[i] = Math.pow(edges[i], 0.55);
  const want = Math.max(0, count - pts.length);
  const scattered = densitySample(weight, w, h, want, rand);
  for (let i = 0; i < want; i++) pts.push([scattered[i * 2], scattered[i * 2 + 1]]);

  return pts;
}

/** Average colour of the source under a triangle, sampled at a few points. */
export function triangleColor(rgba, w, h, a, b, c) {
  const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
  let r = 0, g = 0, bl = 0, n = 0;
  // the centroid plus a nudge towards each corner: enough to avoid picking a
  // single unlucky pixel, cheap enough to run on thousands of triangles
  for (const [px, py] of [[cx, cy],
    [(cx + a[0]) / 2, (cy + a[1]) / 2],
    [(cx + b[0]) / 2, (cy + b[1]) / 2],
    [(cx + c[0]) / 2, (cy + c[1]) / 2]]) {
    const x = Math.min(w - 1, Math.max(0, px | 0)), y = Math.min(h - 1, Math.max(0, py | 0));
    const j = (y * w + x) * 4;
    r += rgba[j]; g += rgba[j + 1]; bl += rgba[j + 2]; n++;
  }
  return [r / n, g / n, bl / n];
}

/* ── mosaic ──────────────────────────────────────────────────────────────── */

/**
 * Average the image down into cells, then snap every cell to one of `k`
 * colours the image chose for itself. Returns the grid and its palette.
 */
export function mosaic(rgba, w, h, cell, k, seed = 5) {
  const cols = Math.max(1, Math.ceil(w / cell)), rows = Math.max(1, Math.ceil(h / cell));
  const avg = new Float32Array(cols * rows * 3);
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = ry * cell; y < Math.min(h, (ry + 1) * cell); y++) {
        for (let x = rx * cell; x < Math.min(w, (rx + 1) * cell); x++) {
          const j = (y * w + x) * 4;
          r += rgba[j]; g += rgba[j + 1]; b += rgba[j + 2]; n++;
        }
      }
      const o = (ry * cols + rx) * 3;
      avg[o] = r / n; avg[o + 1] = g / n; avg[o + 2] = b / n;
    }
  }
  const { centroids, labels } = kmeans(avg, k, { seed });
  return { cols, rows, cell, labels, palette: centroids, k: centroids.length / 3 };
}

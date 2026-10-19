/* What goes on the chart, and where: one pass over the sky that turns directions into
   positions in pixels, decides which labels fit, and shapes the Moon. The canvas and the
   SVG are both drawn from the same scene, so they always agree. */

import {
  fromRaDec,
  normalize,
  rotate,
  type Matrix,
  type PlanetId,
  PLANET_NAME,
  type Sky,
  type Vec3,
} from './astro';
import { catalogue } from './catalogue';
import { angleBetween, project, slerp } from './project';

export interface ChartOptions {
  /** the figures of the constellations */
  lines: boolean;
  /** constellations, bright stars and planets */
  names: boolean;
  /** the celestial equator, lines of right ascension and declination, and the ecliptic */
  grid: boolean;
}

export type Measure = (font: string, text: string) => number;

export interface Label {
  text: string;
  /** where the text starts, and its baseline */
  x: number;
  y: number;
  size: number;
  weight: number;
  /** extra space between letters, in px */
  spacing: number;
  kind: 'constellation' | 'star' | 'planet';
}

export interface MoonMark {
  x: number;
  y: number;
  r: number;
  /** the direction of the Sun from the Moon on the chart, in radians: the lit side */
  toSun: number;
  /** cosine of the Sun–Moon–Earth angle: 1 when full, −1 when new */
  cosPhase: number;
}

export interface Scene {
  radius: number;
  /** x, y, radius and B−V colour per visible star, faintest first */
  stars: Float32Array;
  starCount: number;
  /** x, y, radius per star bright enough for a halo */
  halos: number[];
  figures: Float32Array[];
  grid: Float32Array[];
  ecliptic: Float32Array[];
  labels: Label[];
  moon: MoonMark | null;
  planets: { id: PlanetId; x: number; y: number; r: number }[];
  sun: { x: number; y: number; r: number } | null;
}

/** How big a star of a given magnitude is drawn, on a chart of radius R. */
export function starRadius(mag: number, R: number): number {
  return R * 0.00102 * Math.pow(Math.max(0.6, 7 - mag), 1.32);
}

const DEG = Math.PI / 180;

export function buildScene(
  sky: Sky,
  R: number,
  opts: ChartOptions,
  measure: Measure,
  family: string,
): Scene {
  const { stars, figures, constellations, named } = catalogue();
  const m = sky.rotation;

  // stars: one multiply each; those below the horizon are dropped
  const out = new Float32Array(stars.count * 4);
  const halos: number[] = [];
  let n = 0;
  for (let i = 0; i < stars.count; i++) {
    const x = stars.dir[i * 3]!;
    const y = stars.dir[i * 3 + 1]!;
    const z = stars.dir[i * 3 + 2]!;
    const up = m[6] * x + m[7] * y + m[8] * z;
    if (up <= 0) continue;
    const north = m[0] * x + m[1] * y + m[2] * z;
    const west = m[3] * x + m[4] * y + m[5] * z;
    const k = R / (1 + up);
    const mag = stars.mag[i]!;
    const r = starRadius(mag, R);
    out[n * 4] = west * k;
    out[n * 4 + 1] = -north * k;
    out[n * 4 + 2] = r;
    out[n * 4 + 3] = stars.bv[i]!;
    if (mag < 1.6) halos.push(west * k, -north * k, r);
    n++;
  }

  const at = (h: Vec3): [number, number] => {
    const [x, y] = project(h);
    return [x * R, y * R];
  };

  // constellation figures: each stretch between two stars on its own, curved as on the sky,
  // and stopped short of the stars so the lines never run into them
  const lines: Float32Array[] = [];
  if (opts.lines) {
    const gap = R * 0.012;
    for (const figure of figures) {
      for (const line of figure.lines) {
        for (let i = 0; i + 1 < line.length; i++) {
          const a = rotate(m, line[i]!);
          const b = rotate(m, line[i + 1]!);
          if (a[2] < 0 && b[2] < 0) continue;
          const steps = Math.max(1, Math.ceil(angleBetween(a, b) / (2 * DEG)));
          const pts = new Float32Array((steps + 1) * 2);
          for (let s = 0; s <= steps; s++) {
            const [x, y] = at(slerp(a, b, s / steps));
            pts[s * 2] = x;
            pts[s * 2 + 1] = y;
          }
          const trimmed = trim(pts, gap);
          if (trimmed) lines.push(trimmed);
        }
      }
    }
  }

  const grid: Float32Array[] = [];
  const ecliptic: Float32Array[] = [];
  if (opts.grid) {
    for (const dec of [-60, -30, 0, 30, 60]) {
      const ring: Vec3[] = [];
      for (let ra = 0; ra <= 360; ra += 2) ring.push(rotate(m, fromRaDec(ra, dec)));
      grid.push(...visibleRuns(ring, at));
    }
    for (let ra = 0; ra < 360; ra += 30) {
      const meridian: Vec3[] = [];
      for (let dec = -80; dec <= 80; dec += 2) meridian.push(rotate(m, fromRaDec(ra, dec)));
      grid.push(...visibleRuns(meridian, at));
    }
    // the ecliptic: the Sun's yearly path, near which the Moon and planets always are
    const tilt = 23.4393 * DEG;
    const path: Vec3[] = [];
    for (let l = 0; l <= 360; l += 2) {
      const s = Math.sin(l * DEG);
      path.push(rotate(m, [Math.cos(l * DEG), s * Math.cos(tilt), s * Math.sin(tilt)]));
    }
    ecliptic.push(...visibleRuns(path, at));
  }

  const planets = sky.planets
    .filter((p) => p.dir[2] > 0)
    .map((p) => {
      const [x, y] = at(p.dir);
      return { id: p.id, x, y, r: Math.max(starRadius(p.mag, R), R * 0.0068) };
    });

  const moon = sky.moon.dir[2] > -0.03 ? moonMark(sky, R, at) : null;
  const sun = sky.sun[2] > 0 ? { ...xy(at(sky.sun)), r: R * 0.024 } : null;

  const labels = opts.names
    ? placeLabels(m, R, measure, family, planets, named, constellations, moon, sun)
    : [];

  return {
    radius: R,
    stars: out,
    starCount: n,
    halos,
    figures: lines,
    grid,
    ecliptic,
    labels,
    moon,
    planets,
    sun,
  };
}

const xy = ([x, y]: [number, number]) => ({ x, y });

/** The Moon on the chart, turned so its lit side faces the Sun along the sky. */
function moonMark(sky: Sky, R: number, at: (h: Vec3) => [number, number]): MoonMark {
  const mo = sky.moon.dir;
  const s = sky.sun;
  // the way to the Sun, starting from the Moon: the Sun's direction less its part along the Moon's
  const d = s[0] * mo[0] + s[1] * mo[1] + s[2] * mo[2];
  const toward = normalize([s[0] - d * mo[0], s[1] - d * mo[1], s[2] - d * mo[2]]);
  const step = normalize([
    mo[0] + toward[0] * 0.01,
    mo[1] + toward[1] * 0.01,
    mo[2] + toward[2] * 0.01,
  ]);
  const [x, y] = at(mo);
  const [x2, y2] = at(step);
  return {
    x,
    y,
    r: R * 0.034,
    toSun: Math.atan2(y2 - y, x2 - x),
    cosPhase: Math.cos(sky.moon.phaseAngle * DEG),
  };
}

/** Split a path into the stretches above the horizon, each reaching just past its edge. */
function visibleRuns(pts: Vec3[], at: (h: Vec3) => [number, number]): Float32Array[] {
  const runs: Float32Array[] = [];
  let run: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const prev = pts[i - 1];
    const next = pts[i + 1];
    const near = p[2] >= 0 || (prev && prev[2] >= 0) || (next && next[2] >= 0);
    if (near) {
      run.push(...at(p));
    } else if (run.length) {
      if (run.length >= 4) runs.push(new Float32Array(run));
      run = [];
    }
  }
  if (run.length >= 4) runs.push(new Float32Array(run));
  return runs;
}

/** A polyline with `gap` px taken off each end, or null if nothing is left. */
export function trim(pts: Float32Array, gap: number): Float32Array | null {
  const count = pts.length / 2;
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < count; i++) {
    const l = Math.hypot(pts[i * 2]! - pts[i * 2 - 2]!, pts[i * 2 + 1]! - pts[i * 2 - 1]!);
    seg.push(l);
    total += l;
  }
  if (total <= gap * 2.4) return null;
  const pointAt = (dist: number): [number, number, number] => {
    let acc = 0;
    for (let i = 0; i < seg.length; i++) {
      const l = seg[i]!;
      if (acc + l >= dist || i === seg.length - 1) {
        const t = l > 0 ? (dist - acc) / l : 0;
        return [
          pts[i * 2]! + (pts[i * 2 + 2]! - pts[i * 2]!) * t,
          pts[i * 2 + 1]! + (pts[i * 2 + 3]! - pts[i * 2 + 1]!) * t,
          i,
        ];
      }
      acc += l;
    }
    return [pts[0]!, pts[1]!, 0];
  };
  const [sx, sy, si] = pointAt(gap);
  const [ex, ey, ei] = pointAt(total - gap);
  const res = [sx, sy];
  for (let i = si + 1; i <= ei; i++) res.push(pts[i * 2]!, pts[i * 2 + 1]!);
  res.push(ex, ey);
  return new Float32Array(res);
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/* Labels go on in order of importance, and each one only if it fits: inside the horizon,
   and clear of every label, planet, Moon and Sun already placed. */
function placeLabels(
  m: Matrix,
  R: number,
  measure: Measure,
  family: string,
  planets: Scene['planets'],
  named: ReturnType<typeof catalogue>['named'],
  constellations: ReturnType<typeof catalogue>['constellations'],
  moon: MoonMark | null,
  sun: Scene['sun'],
): Label[] {
  const taken: Box[] = [];
  const labels: Label[] = [];
  const pad = R * 0.006;
  const clear = (b: Box) =>
    taken.every(
      (t) => b.x1 + pad < t.x0 || b.x0 - pad > t.x1 || b.y1 + pad < t.y0 || b.y0 - pad > t.y1,
    );
  const inside = (b: Box) =>
    [
      [b.x0, b.y0],
      [b.x1, b.y0],
      [b.x0, b.y1],
      [b.x1, b.y1],
    ].every(([x, y]) => Math.hypot(x!, y!) < R * 0.955);
  const width = (text: string, size: number, weight: number, spacing: number) =>
    measure(`${weight} ${size}px ${family}`, text) + spacing * Math.max(0, text.length - 1);
  const mark = (x: number, y: number, r: number) =>
    taken.push({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

  for (const p of planets) mark(p.x, p.y, p.r);
  if (moon) mark(moon.x, moon.y, moon.r * 1.15);
  if (sun) mark(sun.x, sun.y, sun.r * 1.3);

  // beside a point: to its right if there is room, else to its left
  const beside = (text: string, x: number, y: number, r: number, kind: Label['kind']) => {
    const size = R * (kind === 'planet' ? 0.026 : 0.0215);
    const weight = kind === 'planet' ? 500 : 400;
    const spacing = size * 0.06;
    const w = width(text, size, weight, spacing);
    const gapX = r + R * 0.008;
    for (const left of [x + gapX, x - gapX - w]) {
      const box = { x0: left, y0: y - size * 0.55, x1: left + w, y1: y + size * 0.45 };
      if (inside(box) && clear(box)) {
        taken.push(box);
        labels.push({ text, x: left, y: y + size * 0.36, size, weight, spacing, kind });
        return;
      }
    }
  };

  const constellation = (c: (typeof constellations)[number]) => {
    const h = rotate(m, c.label);
    if (h[2] < 0.08) return;
    const [px, py] = project(h);
    const size = R * (c.rank === 1 ? 0.0255 : c.rank === 2 ? 0.0215 : 0.0185);
    const weight = c.rank === 1 ? 500 : 400;
    const spacing = size * 0.24;
    const text = c.name.toLocaleUpperCase('en');
    const w = width(text, size, weight, spacing);
    const x = px * R - w / 2;
    const y = py * R;
    const box = { x0: x, y0: y - size * 0.5, x1: x + w, y1: y + size * 0.5 };
    if (!inside(box) || !clear(box)) return;
    taken.push(box);
    labels.push({ text, x, y: y + size * 0.36, size, weight, spacing, kind: 'constellation' });
  };

  // the planets first, then the famous constellations, the bright stars, and the rest
  for (const p of planets) beside(PLANET_NAME[p.id], p.x, p.y, p.r, 'planet');
  const byRank = [...constellations].sort((a, b) => a.rank - b.rank);
  byRank.filter((c) => c.rank === 1).forEach(constellation);
  for (const s of [...named].sort((a, b) => a.mag - b.mag)) {
    const h = rotate(m, s.dir);
    if (h[2] < 0.05) continue;
    const [px, py] = project(h);
    beside(s.name, px * R, py * R, starRadius(s.mag, R), 'star');
  }
  byRank.filter((c) => c.rank > 1).forEach(constellation);
  return labels;
}

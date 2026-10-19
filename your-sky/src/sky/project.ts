/* From the dome of the sky to a flat chart: a stereographic projection centred on the point
   straight overhead. The horizon becomes the chart's edge (radius 1). It keeps shapes, so
   every constellation looks as it does in the sky, and it turns every circle on the sky
   into a circle on paper, which is why planispheres use it.

   Charts of the sky are drawn as seen looking up, with north at the top. That puts east on
   the left, the mirror of a map of the ground. */

import type { Vec3 } from './astro';

/** Chart position of a direction in the horizon frame (x north, y west, z up). */
export function project(h: Vec3): [number, number] {
  const k = 1 / Math.max(1e-9, 1 + h[2]);
  return [h[1] * k, -h[0] * k];
}

/** The direction that lands at a chart position. */
export function unproject(x: number, y: number): Vec3 {
  const r2 = x * x + y * y;
  const k = 2 / (1 + r2);
  return [-y * k, x * k, (1 - r2) / (1 + r2)];
}

/** A point partway along the great circle from a to b (spherical interpolation). */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const angle = Math.acos(dot);
  if (angle < 1e-9) return a;
  const s = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / s;
  const wb = Math.sin(t * angle) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

export const angleBetween = (a: Vec3, b: Vec3) =>
  Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

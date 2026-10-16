/* atlas/scene.js — where everything in the threshold is, shared by both renderers.

   The WebGL sky (sky.js) and the 2D fallback (hero.js) draw the same scene from
   these numbers, so the page can hit-test the ring and its dial and place the
   hidden hotspots without knowing which of the two is running. Units are the
   shader's: y from -0.5 to 0.5, x scaled by the aspect ratio. */

export const EYE = 0.03;
export const DIAL_SPEED = 0.01;
export function sceneLayout(W, H) {
  const a = W / H;
  const narrow = a < 0.9;
  const hz = narrow ? 0.06 : -0.14;
  const R = narrow ? Math.min(0.14, a * 0.29) : Math.min(0.25, a * 0.17);
  const cx = narrow ? 0.02 * a : 0.21 * a;
  const cy = hz + R * (narrow ? 1.25 : 1.22);
  const portal = [cx, cy, R];
  /* the cliff that leans in on the ring's right, and the sea stack on its left;
     a phone gets a second cliff instead of the stack */
  const cliffX = narrow ? 0.5 * a - 0.035 : cx + R * 1.02;
  const stackX = narrow ? 9 : cx - R * 1.32;
  const stackTop = hz + 0.31;
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const footX = (narrow ? 0 : 0.12) + (cx - (narrow ? 0 : 0.12)) * ss(0.05, 1, 0.93);
  return {
    a, narrow, hz, portal,
    cliff: [cliffX, stackX, stackTop, narrow ? 1 : 0],
    moon: narrow ? [-0.14, 0.43, 0.018] : [-0.33 * a, 0.35, 0.028],
    far: narrow ? [0.12, 0.43, 0.05] : [-0.22, 0.31, 0.12],
    /* the lamp on top of the stack (none on a phone) */
    light: narrow ? null : [stackX + 0.012, stackTop + 0.043],
    figure: [footX, hz - EYE / 0.93, (R * 0.05) / 0.93],
  };
}

/* Which block of the dial is under a point (scene units), or -1. Block i is the
   i-th world in the atlas, counted clockwise from the top. */
export function dialAt(L, [x, y], rot) {
  if (!L) return -1;
  const [cx, cy, R] = L.portal;
  const ox = cx / 0.95, oy = L.hz + (cy - L.hz) / 0.95;
  const dx = x - ox, dy = y - oy;
  const rr = Math.hypot(dx, dy) * 0.95 / R;
  if (rr < 1.02 || rr > 1.2) return -1;
  let fa = (Math.PI / 2 - Math.atan2(dy, dx) + rot) / (Math.PI * 2);
  fa -= Math.floor(fa);
  return Math.floor(fa * 35);
}

/* The middle of block i (scene units), the inverse of dialAt, so the keyboard
   can say where the block it chose is. */
export function dialPoint(L, i, rot) {
  const [cx, cy, R] = L.portal;
  const ox = cx / 0.95, oy = L.hz + (cy - L.hz) / 0.95;
  const th = Math.PI / 2 + rot - ((i + 0.5) / 35) * Math.PI * 2;
  const r = (R * 1.11) / 0.95;
  return [ox + Math.cos(th) * r, oy + Math.sin(th) * r];
}

/* The circle the dial sits on (scene units): centre and outer radius. */
export function dialRing(L) {
  const [cx, cy, R] = L.portal;
  return [cx / 0.95, L.hz + (cy - L.hz) / 0.95, (R * 1.2) / 0.95];
}

/** Scene units to CSS pixels. */
export function toScreen([x, y], W, H) {
  return [x * H + W / 2, H / 2 - y * H];
}

/* The real phase of the moon today: 0 new, 0.5 full. Computed from the date,
   so the sky is a little different on each visit without anything being stored. */
export function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - knownNew) / 86400000;
  return ((days % synodic) + synodic) % synodic / synodic;
}

export function phaseName(phase) {
  const names = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  return names[Math.round(phase * 8) % 8];
}

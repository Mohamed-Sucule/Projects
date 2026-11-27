/* apps/murmuration/field.js — the rules the starlings fly by, and everything
   about the scene that is not drawing.

   The flock runs on the graphics card (shaders.js), tens of thousands of
   birds at once. A starling is thought to keep track of its six or seven
   nearest neighbours, however near or far they are (Ballerini and others,
   PNAS, 2008). Finding the seven nearest of 30,000 birds for every bird,
   sixty times a second, is too much even for a GPU, so the sky is divided into
   boxes at three sizes. Every frame each box adds up the birds in it: how many,
   which way they are going, and where they are. A bird then looks at the
   smallest boxes around it that hold about seven others, which is the same
   rule, answered by zooming out until there are enough birds to answer it.

   This file holds those rules as numbers both sides use, the camera, the
   evening's timetable, and a version of the same flock that runs on the
   processor. That version is what the tests fly, and what a browser without
   the graphics features gets: fewer birds, the same rules. */

/* ── the sky the flock lives in ───────────────────────────────────────── */

export const BOX = 768; //            the side of the cube the boxes divide up
export const LEVELS = [48, 24, 12]; // boxes along each side, finest first
export const SEVEN = 7; //            the neighbours a starling keeps track of

export const RULES = {
  cruise: 118, //    units a second; a starling's wingspan is about four units
  slowest: 72,
  fastest: 205,
  align: 2.1, //     how hard a bird turns to fly with its neighbours
  cohere: 0.5, //    how hard it closes on them
  edge: 1.6, //      and how much harder when it is on the edge, with few close by
  crowd: 4.5, //     more birds than this in a box's worth of sky, and it moves out
  press: 7,
  pull: 2.4, //      back towards the roost once it strays outside the flock's space
  flee: 950, //      away from the falcon
  falcon: 78, //     the falcon's reach
  stoop: 135, //     and when it dives
  noise: 34,
};

/* The flock's space, over the roost: wider than it is tall, as murmurations are. */
export const SPACE = { x: 0, y: 205, z: -820, rx: 230, ry: 95, rz: 170, floor: 70 };

/* Where the arrivals come from, out of sight beyond the edges of the view. */
export const STREAMS = [
  [-1650, 120, -1150], [1650, 170, -1050], [-1200, 460, -1400], [1350, 60, -900], [200, 520, -1600],
];

/* The reedbed they sleep in, below the horizon. */
export const ROOST = { x: 40, y: -30, z: -720, spread: 700 };

/* ── the evening ──────────────────────────────────────────────────────── */

/* Seconds from the start: the birds come in, the murmuration, and the drop
   into the reeds as the light goes. */
export const EVENING = { arrive: 26, early: 0.14, sunset: 100, dropFrom: 112, down: 142, end: 150 };

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* When bird `rank` (0 to 1) arrives. The first few are already up when you come in. */
export function arrival(rank) {
  return rank < EVENING.early ? 0 : ((rank - EVENING.early) / (1 - EVENING.early)) * EVENING.arrive;
}

/* How the light is, and how much of the flock has gone down. */
export function evening(t) {
  return {
    light: 1 - smooth(20, EVENING.dropFrom + 20, t),
    sun: 4.5 - 9 * smooth(0, EVENING.sunset, t), //  degrees above the horizon
    down: smooth(EVENING.dropFrom, EVENING.down, t),
    over: t >= EVENING.end,
  };
}

/* The middle of the flock's space. It sweeps over the roost in a long figure
   of eight, about as fast as a starling flies, so the flock has to follow it
   and turn at each end. Left alone inside a space that keeps still, a flock
   settles into a slow ring round the middle, which no real one does for long. */
export function centre(time, aspect = 16 / 9) {
  const t = time + 7; // so the flock starts off to the right, clear of the title
  const k = narrow(aspect);
  return [
    SPACE.x + (250 * Math.sin(t * 0.23) + 50 * Math.sin(t * 0.61 + 0.4)) * k,
    SPACE.y + 45 * Math.sin(t * 0.37 + 1),
    SPACE.z + 150 * Math.sin(t * 0.46 + 2),
  ];
}

/* On a tall, narrow screen the flock sweeps less far from side to side, and
   is narrower. */
const narrow = (aspect) => Math.min(1, aspect / 1.2);
export function space(aspect = 16 / 9) {
  return { ...SPACE, rx: SPACE.rx * Math.max(0.6, narrow(aspect)) };
}

/* ── the camera ───────────────────────────────────────────────────────── */

/* Standing in the reeds, looking up at the flock. A tall, narrow screen gets a
   wider lens, so the flock still fits across it. */
export function camera(aspect) {
  const eye = [0, 6, 0];
  const look = [0, 150, -820];
  const fov = aspect >= 1 ? 46 : Math.min(78, (2 * Math.atan(Math.tan((23 * Math.PI) / 180) * (1.15 / aspect)) * 180) / Math.PI);
  const f = norm(sub(look, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const t = Math.tan((fov * Math.PI) / 360);
  const near = 1;
  const far = 6000;
  /* Column-major, as WebGL wants it. */
  const view = [
    r[0], u[0], -f[0], 0,
    r[1], u[1], -f[1], 0,
    r[2], u[2], -f[2], 0,
    -dot(r, eye), -dot(u, eye), dot(f, eye), 1,
  ];
  const proj = [
    1 / (t * aspect), 0, 0, 0,
    0, 1 / t, 0, 0,
    0, 0, -(far + near) / (far - near), -1,
    0, 0, (-2 * far * near) / (far - near), 0,
  ];
  return { eye, forward: f, right: r, up: u, tan: t, aspect, fov, view, proj, viewProj: multiply(proj, view) };
}

/* Where a point in the sky lands on the screen, from -1 to 1 each way. */
export function project(cam, p) {
  const m = cam.viewProj;
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return { x: x / w, y: y / w, w };
}

/* The pointer is the falcon: it is wherever the pointer is, as far away as the flock. */
export function falconAt(cam, nx, ny, distance) {
  const d = norm(add(cam.forward, add(scale(cam.right, nx * cam.tan * cam.aspect), scale(cam.up, ny * cam.tan))));
  return add(cam.eye, scale(d, distance));
}

/* How high the horizon sits on the screen, from the top, as a fraction. */
export function horizon(cam) {
  const p = project(cam, [0, 0, -40000]);
  return (1 - p.y) / 2;
}

/* ── the flock, on the processor ──────────────────────────────────────── */

/* The same rules as the shader, for a few thousand birds at most. */
export function createReference({ count, seed = 1 }) {
  const rand = random(seed);
  const N = count;
  const p = new Float32Array(N * 3);
  const v = new Float32Array(N * 3);
  const rank = new Float32Array(N);
  const wing = new Float32Array(N);
  const state = new Uint8Array(N); // 0 waiting to arrive, 1 flying, 2 asleep in the reeds
  const order = shuffle(N, rand);
  for (let i = 0; i < N; i++) rank[i] = (order[i] + 0.5) / N;
  let t = 0;
  seed0();

  function seed0() {
    t = 0;
    for (let i = 0; i < N; i++) {
      wing[i] = rand() * 6.28;
      if (arrival(rank[i]) > 0) { state[i] = 0; continue; }
      state[i] = 1;
      const [a, b, c] = start(rand);
      p.set(a, i * 3);
      v.set(b, i * 3);
      void c;
    }
  }

  const grids = LEVELS.map((g) => ({ g, h: BOX / g, n: new Float32Array(g * g * g), sv: new Float32Array(g * g * g * 3), sp: new Float32Array(g * g * g * 3) }));

  function step(dt, { falcon = null, stoop = false } = {}) {
    const before = t;
    t += dt;
    const c = centre(t);
    const ev = evening(t);
    const min = [c[0] - BOX / 2, c[1] - BOX / 2, c[2] - BOX / 2];
    /* Arrivals. */
    for (let i = 0; i < N; i++) {
      const at = arrival(rank[i]);
      if (state[i] === 0 && at <= t && at > before) {
        const s = STREAMS[Math.floor(hash(i, 3) * STREAMS.length)];
        const o = [s[0] + (hash(i, 4) - 0.5) * 90, s[1] + (hash(i, 5) - 0.5) * 60, s[2] + (hash(i, 6) - 0.5) * 90];
        p.set(o, i * 3);
        v.set(scale(norm(sub(c, o)), 150), i * 3);
        state[i] = 1;
      }
    }
    /* Each box adds up the birds in it. */
    for (const G of grids) {
      G.n.fill(0); G.sv.fill(0); G.sp.fill(0);
      for (let i = 0; i < N; i++) {
        if (state[i] !== 1) continue;
        const k = cellOf(G, min, p, i);
        if (k < 0) continue;
        G.n[k]++;
        for (let a = 0; a < 3; a++) { G.sv[k * 3 + a] += v[i * 3 + a]; G.sp[k * 3 + a] += p[i * 3 + a]; }
      }
    }
    const reach = stoop ? RULES.stoop : RULES.falcon;
    for (let i = 0; i < N; i++) {
      if (state[i] !== 1) continue;
      const P = [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
      const V = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
      let acc = [0, 0, 0];
      if (hash(i, 9) < ev.down) {
        /* Down into the reeds. */
        const target = [ROOST.x + (hash(i, 11) - 0.5) * ROOST.spread, ROOST.y, ROOST.z + (hash(i, 13) - 0.5) * 200];
        const want = scale(norm(sub(target, P)), 175);
        acc = scale(sub(want, V), 2.2);
      } else {
        const near = neighbours(grids, min, P, V);
        acc = add(acc, scale(sub(near.v, V), RULES.align));
        acc = add(acc, scale(sub(near.p, P), RULES.cohere + RULES.edge * (1 - near.k0)));
        if (near.n0 > RULES.crowd) acc = add(acc, scale(sub(P, near.p0), (RULES.press * (near.n0 - RULES.crowd)) / RULES.crowd));
        const o = [(P[0] - c[0]) / SPACE.rx, (P[1] - c[1]) / SPACE.ry, (P[2] - c[2]) / SPACE.rz];
        const out = Math.hypot(...o);
        if (out > 1) {
          const k = (out - 1) / out;
          acc = sub(acc, [o[0] * SPACE.rx * k * RULES.pull, o[1] * SPACE.ry * k * RULES.pull * 1.3, o[2] * SPACE.rz * k * RULES.pull]);
        }
        /* Not down into the reeds until it is time. */
        if (P[1] < SPACE.floor) acc = add(acc, [0, (SPACE.floor - P[1]) * 6, 0]);
        if (falcon) {
          const e = sub(P, falcon);
          const d = Math.hypot(...e) || 1;
          if (d < reach) acc = add(acc, scale(e, (RULES.flee * (1 - d / reach)) / d));
        }
        acc = add(acc, [(hash(i, t * 60) - 0.5) * RULES.noise * 2, (hash(i, t * 60 + 1) - 0.5) * RULES.noise * 2, (hash(i, t * 60 + 2) - 0.5) * RULES.noise * 2]);
        const sp = Math.hypot(...V) || 1;
        acc = add(acc, scale(V, ((RULES.cruise - sp) * 1.3) / sp));
      }
      let nv = add(V, scale(acc, dt));
      const sp = Math.hypot(...nv) || 1;
      nv = scale(nv, Math.min(RULES.fastest, Math.max(RULES.slowest, sp)) / sp);
      const np = add(P, scale(nv, dt));
      v.set(nv, i * 3);
      p.set(np, i * 3);
      wing[i] += dt * 24;
      if (np[1] < ROOST.y + 18 && hash(i, 9) < ev.down) state[i] = 2;
    }
  }

  return {
    count: N,
    step,
    restart: seed0,
    get t() { return t; },
    bird: (i) => ({ x: p[i * 3], y: p[i * 3 + 1], z: p[i * 3 + 2], vx: v[i * 3], vy: v[i * 3 + 1], vz: v[i * 3 + 2], wing: wing[i], state: state[i] }),
    census() { const n = [0, 0, 0]; for (let i = 0; i < N; i++) n[state[i]]++; return { waiting: n[0], flying: n[1], asleep: n[2] }; },
  };
}

/* Where a bird first in the air at the start is: a long, folded ribbon over the roost. */
function start(rand, time = 0) {
  const c = centre(time);
  const s = rand();
  const a = s * Math.PI * 2.4;
  const j = () => (rand() + rand() + rand() - 1.5) * 0.45;
  const p = [c[0] + SPACE.rx * 0.7 * (Math.cos(a) + j() * 0.4), c[1] + SPACE.ry * 0.6 * (Math.sin(a * 1.5) + j() * 0.5), c[2] + SPACE.rz * 0.6 * (Math.sin(a) + j() * 0.4)];
  const v = scale(norm([-Math.sin(a), Math.cos(a * 1.5) * 0.3, Math.cos(a) * 0.6]), RULES.cruise);
  return [p, v, a];
}
export { start as startingPlace };

function cellOf(G, min, p, i) {
  const x = Math.floor((p[i * 3] - min[0]) / G.h), y = Math.floor((p[i * 3 + 1] - min[1]) / G.h), z = Math.floor((p[i * 3 + 2] - min[2]) / G.h);
  if (x < 0 || y < 0 || z < 0 || x >= G.g || y >= G.g || z >= G.g) return -1;
  return (z * G.g + y) * G.g + x;
}

/* What a bird sees of its neighbours: at each size of box, the birds in the
   eight boxes around it, weighted by how near each box is (and not counting
   itself); then the finest size that holds about seven of them. */
function neighbours(grids, min, P, V) {
  const out = grids.map((G) => {
    const q = [(P[0] - min[0]) / G.h - 0.5, (P[1] - min[1]) / G.h - 0.5, (P[2] - min[2]) / G.h - 0.5];
    const b = q.map(Math.floor);
    const f = q.map((x, a) => x - b[a]);
    const own = [Math.floor((P[0] - min[0]) / G.h), Math.floor((P[1] - min[1]) / G.h), Math.floor((P[2] - min[2]) / G.h)];
    let n = 0;
    const sv = [0, 0, 0], sp = [0, 0, 0];
    for (let k = 0; k < 8; k++) {
      const o = [k & 1, (k >> 1) & 1, (k >> 2) & 1];
      const c = [b[0] + o[0], b[1] + o[1], b[2] + o[2]];
      if (c.some((x) => x < 0 || x >= G.g)) continue;
      const w = (o[0] ? f[0] : 1 - f[0]) * (o[1] ? f[1] : 1 - f[1]) * (o[2] ? f[2] : 1 - f[2]);
      const id = (c[2] * G.g + c[1]) * G.g + c[0];
      const self = c[0] === own[0] && c[1] === own[1] && c[2] === own[2] ? 1 : 0;
      n += w * (G.n[id] - self);
      for (let a = 0; a < 3; a++) { sv[a] += w * (G.sv[id * 3 + a] - self * V[a]); sp[a] += w * (G.sp[id * 3 + a] - self * P[a]); }
    }
    return n > 0.5 ? { n, v: scale(sv, 1 / n), p: scale(sp, 1 / n) } : { n, v: V, p: P };
  });
  const [a, b, c] = out;
  const k0 = smooth(3, SEVEN + 1, a.n), k1 = smooth(3, SEVEN + 1, b.n);
  return {
    v: mixv(mixv(c.v, b.v, k1), a.v, k0),
    p: mixv(mixv(c.p, b.p, k1), a.p, k0),
    n0: a.n,
    p0: a.p,
    k0,
  };
}

/* ── small things ─────────────────────────────────────────────────────── */

/* The same hash as the shader's: a fixed random number for bird i and salt s. */
export function hash(i, s) {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
export { random };

export function shuffle(n, rand) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const mixv = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
function multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

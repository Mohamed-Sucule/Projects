/* ───────────────────────────────────────────────────────────────────────────
   topple/engine.js — rigid bodies, from nothing.

   Boxes that fall, spin, hit each other, slide, tip over and settle into a
   pile. No library. The whole thing is here: collision detection by separating
   axis, contact points by clipping one face against another, and resolution by
   sequential impulses.

   It knows nothing about the page it is driving. It is a list of rectangles
   with mass, and a step function. That is what makes it testable — a stack
   that collapses, a box that sinks through the floor, or a pile that jitters
   for ever are all things you can catch from a terminal, and all things you
   would otherwise only notice as "it feels wrong".
   ─────────────────────────────────────────────────────────────────────────── */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ── vectors, kept tiny and allocation-free where it matters ─────────────── */

const v = (x = 0, y = 0) => ({ x, y });
const add = (a, b) => v(a.x + b.x, a.y + b.y);
const sub = (a, b) => v(a.x - b.x, a.y - b.y);
const mul = (a, s) => v(a.x * s, a.y * s);
const dot = (a, b) => a.x * b.x + a.y * b.y;
/** 2D cross products: vector×vector gives a scalar, scalar×vector a vector. */
const crossVV = (a, b) => a.x * b.y - a.y * b.x;
const crossSV = (s, a) => v(-s * a.y, s * a.x);
const rotate = (a, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return v(a.x * c - a.y * s, a.x * s + a.y * c);
};

export const RULES = {
  gravity: 2600,          // px per second per second — a page-sized world
  iterations: 12,         // impulse passes per step
  slop: 0.4,              // penetration tolerated before it is pushed out
  bias: 0.2,              // how hard overlap is turned back into velocity
  maxRecover: 130,        // px per second — the fastest overlap may be undone
  restitution: 0.05,      // barely bouncy: paper, not rubber
  friction: 0.42,
  /* Air. Set to 1 for a vacuum, which is the only way to check that momentum
     is conserved — a hidden 0.999 per step is a third of it gone in four
     seconds, and a conservation test would fail for the wrong reason. */
  linearDamping: 0.999,
  angularDamping: 0.996,
  sleepLinear: 12,        // below this for long enough, stop simulating
  sleepAngular: 0.5,
  sleepFrames: 34,
  maxStep: 1 / 120,
};

let nextId = 1;

export class Body {
  constructor({ x, y, w, h, angle = 0, mass = null, fixed = false, data = null }) {
    this.id = nextId++;
    this.w = w; this.h = h;
    this.p = v(x, y);
    this.angle = angle;
    this.vel = v(0, 0);
    this.spin = 0;
    /* A second, shadow velocity used only to push overlapping bodies apart.
       It moves them, and is then thrown away — see the note in advance(). */
    this.bvel = v(0, 0);
    this.bspin = 0;
    this.fixed = fixed;
    this.data = data;
    this.asleep = false;
    this.still = 0;
    this.touching = false;
    this.grabbed = false;

    /* The real mass is worked out whatever the body is doing, and only the
       INVERSE is zeroed to pin it in place. Storing a mass of zero for
       scenery looks equivalent and is not: release it later and it has
       nothing to be pushed by, so it accelerates under gravity and drops
       straight through the floor. */
    const m = mass ?? (w * h) / 6000;
    this.mass = m;
    // a rectangle's moment of inertia about its centre
    this.inertia = (m * (w * w + h * h)) / 12;
    this.invMass = fixed || m <= 0 ? 0 : 1 / m;
    this.invInertia = fixed || this.inertia <= 0 ? 0 : 1 / this.inertia;
  }

  /** The four corners, in world space. */
  corners() {
    const hx = this.w / 2, hy = this.h / 2;
    return [v(-hx, -hy), v(hx, -hy), v(hx, hy), v(-hx, hy)]
      .map((c) => add(this.p, rotate(c, this.angle)));
  }

  /** The two face directions. A rectangle has four faces but only two axes. */
  axes() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return [v(c, s), v(-s, c)];
  }

  wake() { this.asleep = false; this.still = 0; }

  /**
   * Turn a body between being part of the scenery and being something that
   * falls. A fixed body has no mass the solver can move, so switching means
   * recomputing what it weighs — and things already resting on it have to be
   * woken, or they hang in the air where it used to hold them up.
   */
  setFixed(flag) {
    this.fixed = !!flag;
    if (this.fixed) {
      this.invMass = 0; this.invInertia = 0;
      this.vel = { x: 0, y: 0 }; this.spin = 0;
    } else {
      this.invMass = this.mass > 0 ? 1 / this.mass : 0;
      this.invInertia = this.inertia > 0 ? 1 / this.inertia : 0;
      this.wake();
    }
    return this;
  }

  /* What the solver should think this body weighs. A sleeping body has to look
     exactly like a wall: if it keeps a real mass, it absorbs a share of every
     impulse and then throws that share away when it is skipped at integration
     — so everything resting on top of it is under-corrected, every step, and
     the error compounds the higher the pile goes. */
  get im() { return (this.fixed || this.asleep) ? 0 : this.invMass; }
  get ii() { return (this.fixed || this.asleep) ? 0 : this.invInertia; }

  applyImpulse(j, at) {
    if (this.fixed || this.asleep) return;
    this.vel = add(this.vel, mul(j, this.invMass));
    this.spin += crossVV(sub(at, this.p), j) * this.invInertia;
  }

  velocityAt(point) {
    return add(this.vel, crossSV(this.spin, sub(point, this.p)));
  }

  applyBias(j, at) {
    if (this.fixed || this.asleep) return;
    this.bvel = add(this.bvel, mul(j, this.invMass));
    this.bspin += crossVV(sub(at, this.p), j) * this.invInertia;
  }

  biasVelocityAt(point) {
    return add(this.bvel, crossSV(this.bspin, sub(point, this.p)));
  }
}

/* ── collision: is there a gap, and if not, where do they touch? ─────────────
   The separating axis test. Two convex shapes are apart if there is any line
   you can draw with one entirely on each side. For rectangles, only the four
   face directions need checking — if none of them separates the two, they
   overlap, and the axis with the LEAST overlap is the direction to push them
   apart along. */

function project(body, axis) {
  let min = Infinity, max = -Infinity;
  for (const c of body.corners()) {
    const d = dot(c, axis);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

function overlapOn(a, b, axis) {
  const pa = project(a, axis), pb = project(b, axis);
  const o = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
  return o;
}

/** Clip a segment against a plane, keeping what is on the inside. */
function clipSegment(points, normal, offset) {
  const out = [];
  const d0 = dot(normal, points[0]) - offset;
  const d1 = dot(normal, points[1]) - offset;
  if (d0 <= 0) out.push(points[0]);
  if (d1 <= 0) out.push(points[1]);
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1);
    out.push(add(points[0], mul(sub(points[1], points[0]), t)));
  }
  return out.slice(0, 2);
}

/**
 * Where two boxes touch.
 *
 * Returns a normal, a depth, and up to two contact points — two, not one,
 * because a box resting flat on the floor touches along an edge, and a single
 * contact point in the middle of it lets the box rock from side to side for
 * ever like a coin that will not settle.
 */
export function collide(a, b) {
  const axes = [...a.axes(), ...b.axes()];
  let best = Infinity, bestAxis = null;

  for (const axis of axes) {
    const o = overlapOn(a, b, axis);
    if (o <= 0) return null;              // a gap: they are not touching
    if (o < best) { best = o; bestAxis = axis; }
  }

  // point the axis from a towards b, so the sign of everything downstream is known
  let n = bestAxis;
  if (dot(sub(b.p, a.p), n) < 0) n = v(-n.x, -n.y);

  /* The reference face is the one most squarely facing along the axis; the
     incident face is the one on the other body most squarely facing back. */
  const pick = (body, dir) => {
    const cs = body.corners();
    let bestI = 0, bestD = -Infinity;
    for (let i = 0; i < 4; i++) {
      const edge = sub(cs[(i + 1) % 4], cs[i]);
      const normal = v(edge.y, -edge.x);
      const len = Math.hypot(normal.x, normal.y) || 1;
      const d = dot(v(normal.x / len, normal.y / len), dir);
      if (d > bestD) { bestD = d; bestI = i; }
    }
    return { a: cs[bestI], b: cs[(bestI + 1) % 4], d: bestD, i: bestI };
  };

  const fa = pick(a, n);
  const fb = pick(b, v(-n.x, -n.y));
  /* The tolerance matters. When two faces are equally square-on — which is
     exactly what happens to a box lying flat on the floor — the better one
     flips between them on floating-point noise, the contact points move every
     step, and the box acquires a steady sideways drift it never loses. */
  const flip = fb.d > fa.d * 1.02 + 0.005;
  const ref = flip ? fb : fa;
  const inc = flip ? fa : fb;

  const refDir = sub(ref.b, ref.a);
  const len = Math.hypot(refDir.x, refDir.y) || 1;
  const tangent = v(refDir.x / len, refDir.y / len);
  const refNormal = v(tangent.y, -tangent.x);

  let pts = [inc.a, inc.b];
  pts = clipSegment(pts, v(-tangent.x, -tangent.y), -dot(tangent, ref.a));
  if (pts.length < 2) return null;
  pts = clipSegment(pts, tangent, dot(tangent, ref.b));
  if (pts.length < 2) return null;

  const front = dot(refNormal, ref.a);
  const contacts = [];
  pts.forEach((p, k) => {
    const depth = front - dot(refNormal, p);
    /* Each contact is tagged with which pair of faces made it, so the solver
       can recognise the same contact again next frame and carry its impulse
       over. Without a name, a contact is new every frame. */
    if (depth >= 0) contacts.push({ point: p, depth, id: (flip ? 64 : 0) + ref.i * 8 + inc.i * 2 + k });
  });
  if (!contacts.length) return null;

  /* The contact normal is the reference FACE's normal, not the axis the
     separating test happened to pick. They agree in the easy cases and part
     company when the reference face comes from the second body, at which
     point everything downstream — including which way overlap is pushed out —
     is inverted. */
  const normal = flip ? v(-refNormal.x, -refNormal.y) : refNormal;
  return { a, b, normal, depth: best, contacts };
}

/* ── the world ───────────────────────────────────────────────────────────── */

export class World {
  constructor({ width = 1200, height = 800, rules = RULES } = {}) {
    this.rules = { ...RULES, ...rules };
    this.width = width;
    this.height = height;
    this.bodies = [];
    this.acc = 0;
    this.time = 0;
    /* Built once. Rebuilding the walls every step would hand them a new id
       every step, and every contact against them would look brand new. */
    this.walls = this.bounds();
    this.cache = new Map();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.walls = this.bounds();
    this.cache.clear();
    return this;
  }

  add(body) { this.bodies.push(body); return body; }
  clear() { this.bodies.length = 0; }

  /** Floor, and a wall on each side. The top is left open. */
  bounds() {
    const t = 2000;
    return [
      new Body({ x: this.width / 2, y: this.height + t / 2, w: this.width + t * 2, h: t, fixed: true }),
      new Body({ x: -t / 2, y: this.height / 2, w: t, h: this.height * 4, fixed: true }),
      new Body({ x: this.width + t / 2, y: this.height / 2, w: t, h: this.height * 4, fixed: true }),
    ];
  }

  /**
   * Advance by `dt` seconds.
   *
   * Sliced into fixed pieces and the leftover carried, because a solver fed a
   * variable step is a different solver every frame: a pile that is stable at
   * 60fps climbs out of itself at 30, and nothing about that is debuggable
   * from the outside.
   */
  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return this;
    if (dt > 0.4) return this;                // a backgrounded tab must not explode the pile
    this.acc += dt;
    let guard = 0;
    while (this.acc >= this.rules.maxStep - 1e-9 && guard++ < 8) {
      this.acc -= this.rules.maxStep;
      this.advance(this.rules.maxStep);
    }
    return this;
  }

  advance(h) {
    const R = this.rules;
    this.time += h;
    const walls = this.walls;

    for (const b of this.bodies) {
      b.bvel = v(0, 0);
      b.bspin = 0;
      if (b.asleep) {
        // held at rest, so impulses from anything landing on it cannot creep in
        b.vel = v(0, 0);
        b.spin = 0;
        continue;
      }
      if (b.fixed || b.grabbed) continue;
      b.vel.y += R.gravity * h;
      b.vel.x *= R.linearDamping;
      b.spin *= R.angularDamping;
    }

    const pairs = [];
    const all = [...this.bodies, ...walls];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (a.fixed && b.fixed) continue;
        if (a.asleep && b.asleep) continue;
        if ((a.asleep || a.fixed) && (b.asleep || b.fixed)) continue;
        // cheap reject before the real test
        const rA = Math.hypot(a.w, a.h) / 2, rB = Math.hypot(b.w, b.h) / 2;
        if (Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) > rA + rB) continue;
        const m = collide(a, b);
        if (m) pairs.push(m);
      }
    }

    for (const b of this.bodies) b.touching = false;
    for (const m of pairs) {
      if (!m.a.fixed) m.a.touching = true;
      if (!m.b.fixed) m.b.touching = true;
    }

    /* Sequential impulses, with each contact REMEMBERING the total push it has
       applied so far this step. That memory is the whole difference between a
       stack that stands and a stack that sinks: without it, every pass starts
       from nothing, later passes undo earlier ones, and twelve passes are
       barely better than one. With it the passes converge on a single set of
       forces that hold the whole pile up at once. */
    /* Ground contacts first. A stack settles from the bottom up, and solving
       the top of the pile before the floor it is standing on wastes most of
       each pass carrying the same information back down again. */
    pairs.sort((x, y) => (y.a.fixed || y.b.fixed ? 1 : 0) - (x.a.fixed || x.b.fixed ? 1 : 0));
    for (const m of pairs) prepare(m, R, h, this.cache);

    /* Drop contacts that no longer exist, or the cache grows for the life of
       the page and starts handing stale pushes to contacts that just happen to
       reuse a name. */
    const live = new Set(pairs.map((m) => `${m.a.id}:${m.b.id}`));
    for (const k of this.cache.keys()) if (!live.has(k)) this.cache.delete(k);
    for (let iter = 0; iter < R.iterations; iter++) {
      for (const m of pairs) resolve(m, R);
    }
    for (const m of pairs) {
      const store = new Map();
      for (const c of m.contacts) store.set(c.id, { Pn: c.Pn, Pt: c.Pt });
      this.cache.set(`${m.a.id}:${m.b.id}`, store);
    }

    for (const b of this.bodies) {
      if (b.fixed || b.grabbed) continue;
      if (b.asleep) continue;
      b.p = add(b.p, mul(add(b.vel, b.bvel), h));
      b.angle += (b.spin + b.bspin) * h;

      const speed = Math.hypot(b.vel.x, b.vel.y);
      const still = speed < R.sleepLinear && Math.abs(b.spin) < R.sleepAngular && b.touching;
      b.still = still ? b.still + 1 : 0;
    }

    this.settle(pairs, R);
  }

  /**
   * Put whole groups of touching bodies to sleep, never one at a time.
   *
   * Contacts never resolve to exactly zero, so without sleeping a settled pile
   * keeps twitching and never looks finished. But sleeping a body on its own
   * does not work: the moment it stops taking a share of the impulses, the
   * body resting against it gets a different answer, twitches, and wakes it
   * straight back up. A pile of six oscillates between the two states for
   * ever. A group that is still TOGETHER can be stopped together.
   */
  settle(pairs, R) {
    const island = new Map();
    const neighbours = new Map();
    const touch = (x, y) => {
      if (!neighbours.has(x)) neighbours.set(x, []);
      neighbours.get(x).push(y);
    };
    for (const m of pairs) {
      if (m.a.fixed || m.b.fixed) continue;      // the ground joins nothing together
      touch(m.a, m.b);
      touch(m.b, m.a);
    }

    let id = 0;
    for (const b of this.bodies) {
      if (b.fixed || island.has(b)) continue;
      const group = [];
      const queue = [b];
      island.set(b, id);
      while (queue.length) {
        const x = queue.pop();
        group.push(x);
        for (const y of neighbours.get(x) || []) {
          if (island.has(y)) continue;
          island.set(y, id);
          queue.push(y);
        }
      }
      id++;

      /* A body with nothing under it is falling, however slowly — at the top
         of a throw it is barely moving for a moment, and sleeping there would
         leave it hanging in mid-air. */
      const canSleep = group.every((x) => x.still > R.sleepFrames && (x.touching || x.asleep));
      for (const x of group) {
        if (canSleep) {
          x.asleep = true;
          x.vel = v(0, 0);
          x.spin = 0;
        } else if (x.asleep) x.wake();
      }
    }
  }
}

/**
 * Work out, once per step, everything about a contact that does not change
 * while the solver iterates.
 */
function prepare(m, R, h, cache) {
  const { a, b, normal } = m;
  const tangent = v(-normal.y, normal.x);
  const old = cache?.get(`${a.id}:${b.id}`);
  for (const c of m.contacts) {
    c.ra = sub(c.point, a.p);
    c.rb = sub(c.point, b.p);
    /* Start from the push that held this exact contact up last frame. This is
       what makes a pile settle rather than sag: the solver begins each step
       with the answer it worked out last time and only has to correct it,
       instead of rediscovering from zero that the bottom box is carrying five
       others. It is also what makes friction hold — a friction impulse
       rebuilt from nothing every frame lets a stack creep sideways for ever. */
    const was = old?.get(c.id);
    c.Pn = was ? was.Pn : 0;
    c.Pt = was ? was.Pt : 0;
    c.Pnb = 0;

    const raN = crossVV(c.ra, normal), rbN = crossVV(c.rb, normal);
    const kN = a.im + b.im + raN * raN * a.ii + rbN * rbN * b.ii;
    c.massNormal = kN > 0 ? 1 / kN : 0;

    const raT = crossVV(c.ra, tangent), rbT = crossVV(c.rb, tangent);
    const kT = a.im + b.im + raT * raT * a.ii + rbT * rbT * b.ii;
    c.massTangent = kT > 0 ? 1 / kT : 0;

    /* Overlap is turned into a gentle outward velocity rather than being
       teleported away. Teleporting adds energy that came from nowhere, and a
       pile treated that way slowly climbs out of itself. */
    /* Capped. A deep overlap — six boxes landing in the same frame, say —
       otherwise asks for a correction of thousands of pixels per second, and
       the pile is fired apart by the very thing meant to tidy it up. */
    c.bias = Math.min(R.bias * (1 / h) * Math.max(0, c.depth - R.slop), R.maxRecover);

    /* Bounce, but only off a real impact. Applying restitution to a box that
       is barely moving is what makes a settled pile hum and creep. */
    const approach = dot(sub(b.velocityAt(c.point), a.velocityAt(c.point)), normal);
    c.restitution = approach < -260 ? -approach * R.restitution : 0;
  }

  // apply what was carried over, before the first pass looks at anything
  for (const c of m.contacts) {
    if (c.Pn === 0 && c.Pt === 0) continue;
    const j = add(mul(normal, c.Pn), mul(tangent, c.Pt));
    a.applyImpulse(mul(j, -1), c.point);
    b.applyImpulse(j, c.point);
  }
}

function resolve(m, R) {
  const { a, b, normal } = m;
  const tangent = v(-normal.y, normal.x);

  for (const c of m.contacts) {
    const rel = sub(b.velocityAt(c.point), a.velocityAt(c.point));

    let dPn = c.massNormal * (-dot(rel, normal) + c.restitution);
    /* Clamped so the ACCUMULATED push is never negative: a contact may push
       things apart, never pull them together. Clamping the increment instead
       is the classic mistake, and it lets a box that is being pushed out on
       one pass get sucked back on the next. */
    const Pn0 = c.Pn;
    c.Pn = Math.max(Pn0 + dPn, 0);
    dPn = c.Pn - Pn0;
    if (dPn !== 0) {
      const j = mul(normal, dPn);
      a.applyImpulse(mul(j, -1), c.point);
      b.applyImpulse(j, c.point);
    }

    /* The push that removes overlap goes into a SEPARATE velocity, which moves
       the bodies this step and is then discarded. Feeding it into the real
       velocity instead adds energy that came from nowhere: a settled pile
       never quite stops, it creeps sideways across the floor, and nothing in
       it is ever still enough to be allowed to go to sleep. */
    if (c.bias > 0) {
      const relB = sub(b.biasVelocityAt(c.point), a.biasVelocityAt(c.point));
      let dPnb = c.massNormal * (-dot(relB, normal) + c.bias);
      const Pnb0 = c.Pnb;
      c.Pnb = Math.max(Pnb0 + dPnb, 0);
      dPnb = c.Pnb - Pnb0;
      if (dPnb !== 0) {
        const jb = mul(normal, dPnb);
        a.applyBias(mul(jb, -1), c.point);
        b.applyBias(jb, c.point);
      }
    }

    const rel2 = sub(b.velocityAt(c.point), a.velocityAt(c.point));
    let dPt = c.massTangent * -dot(rel2, tangent);
    const max = R.friction * c.Pn;         // Coulomb: friction is capped by the push
    const Pt0 = c.Pt;
    c.Pt = clamp(Pt0 + dPt, -max, max);
    dPt = c.Pt - Pt0;
    if (dPt !== 0) {
      const j = mul(tangent, dPt);
      a.applyImpulse(mul(j, -1), c.point);
      b.applyImpulse(j, c.point);
    }
  }
}

/* ── going home ──────────────────────────────────────────────────────────────
   Springs rather than a transition, so an element already on its way back can
   be grabbed and thrown again without anything being cancelled or restarted. */

export function homeStep(body, home, h, { stiffness = 130, damping = 19 } = {}) {
  if (body.grabbed) return false;
  const dx = home.x - body.p.x, dy = home.y - body.p.y;
  const da = (home.angle ?? 0) - body.angle;
  body.vel.x += (dx * stiffness - body.vel.x * damping) * h;
  body.vel.y += (dy * stiffness - body.vel.y * damping) * h;
  body.spin += (da * stiffness - body.spin * damping) * h;
  body.p = add(body.p, mul(body.vel, h));
  body.angle += body.spin * h;
  return Math.hypot(dx, dy) < 0.6 && Math.abs(da) < 0.01
    && Math.hypot(body.vel.x, body.vel.y) < 6;
}

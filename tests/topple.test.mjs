import { test, assert } from './harness.mjs';
import { World, Body, collide, homeStep, RULES, clamp } from '../apps/topple/engine.js';

const box = (o) => new Body({ w: 100, h: 40, ...o });
const run = (w, frames, fps = 60) => { for (let i = 0; i < frames; i++) w.step(1 / fps); return w; };
const speed = (b) => Math.hypot(b.vel.x, b.vel.y);
const tilt = (bodies) => Math.max(...bodies.map((b) => Math.abs(b.angle)));

/* ── is there a gap, and if not, where do they touch? ────────────────────── */

test('two boxes with daylight between them are not touching', () => {
  assert.equal(collide(box({ x: 0, y: 0 }), box({ x: 400, y: 0 })), null, 'far apart');
  assert.equal(collide(box({ x: 0, y: 0 }), box({ x: 101, y: 0 })), null, 'a pixel apart');
  assert.equal(collide(box({ x: 0, y: 0 }), box({ x: 0, y: 41 })), null, 'a pixel above');
});

test('two boxes that overlap report how much, and in which direction', () => {
  const m = collide(box({ x: 0, y: 0 }), box({ x: 0, y: 36 }));
  assert.ok(m, 'an overlap went unnoticed');
  assert.close(m.depth, 4, 1e-6);
  assert.close(m.normal.x, 0, 1e-9);
  assert.close(Math.abs(m.normal.y), 1, 1e-9);
});

test('the normal always points from the first box towards the second', () => {
  /* Get this backwards and the solver pulls things together instead of
     pushing them apart, which looks like the pile sucking itself inside out. */
  /* The offsets matter: the separating-axis test finds the SHALLOWEST way
     out, so two wide flat boxes overlapping a little sideways are correctly
     pushed apart vertically. These are offsets where the shallowest axis is
     the one being asked about. */
  for (const [dx, dy] of [[70, 0], [-70, 0], [0, 30], [0, -30]]) {
    const m = collide(box({ x: 0, y: 0 }), box({ x: dx, y: dy }));
    assert.ok(m, `${dx},${dy}`);
    assert.ok(m.normal.x * dx + m.normal.y * dy > 0, `normal points the wrong way for ${dx},${dy}`);
  }
});

test('a box resting flat gives TWO contact points, not one', () => {
  /* One contact in the middle of a flat edge lets the box rock from side to
     side for ever, like a coin that will not settle. */
  const w = new World({ width: 900, height: 600 });
  const m = collide(box({ x: 450, y: 585, w: 160, h: 40 }), w.walls[0]);
  assert.ok(m);
  assert.equal(m.contacts.length, 2);
  for (const c of m.contacts) assert.close(c.point.y, 600, 1e-6, 'a contact is not on the floor');
});

test('a box turned on its side is still measured correctly', () => {
  const a = box({ x: 0, y: 0, w: 100, h: 100 });
  // its half-diagonal is 70.7, so at 130 apart there is still daylight
  const b = box({ x: 0, y: 105, w: 100, h: 100, angle: Math.PI / 4 });
  const m = collide(a, b);
  assert.ok(m, 'a rotated box was missed');
  assert.ok(m.depth > 0 && m.depth < 100);
});

/* ── falling and resting ─────────────────────────────────────────────────── */

test('a box falls, lands, and stays on the floor', () => {
  const w = new World({ width: 900, height: 600 });
  const b = w.add(box({ x: 450, y: 100, w: 160, h: 40 }));
  run(w, 300);
  const bottom = b.p.y + 20;
  assert.ok(bottom > 600 - 2, `it stopped ${(600 - bottom).toFixed(1)}px above the floor`);
  assert.ok(bottom < 600 + RULES.slop + 0.5, `it sank ${(bottom - 600).toFixed(2)}px into the floor`);
  assert.close(b.angle, 0, 0.01, 'it should land flat');
});

test('nothing escapes the box it is in', () => {
  const w = new World({ width: 900, height: 600 });
  const bodies = [];
  for (let i = 0; i < 12; i++) {
    const b = w.add(box({ x: 100 + i * 60, y: 80 + (i % 4) * 70, w: 90, h: 34 }));
    b.vel = { x: (i % 2 ? 1 : -1) * 900, y: -300 };
    b.spin = (i % 3) - 1;
    bodies.push(b);
  }
  run(w, 600);
  for (const b of bodies) {
    assert.ok(b.p.x > -80 && b.p.x < 980, `a body got out sideways to x=${b.p.x.toFixed(0)}`);
    assert.ok(b.p.y < 660, `a body fell through the floor to y=${b.p.y.toFixed(0)}`);
    assert.ok(Number.isFinite(b.p.x) && Number.isFinite(b.p.y), 'a body went to NaN');
  }
});

test('something moving very fast does not pass straight through the floor', () => {
  const w = new World({ width: 900, height: 600 });
  const b = w.add(box({ x: 450, y: 60, w: 60, h: 20 }));
  b.vel = { x: 0, y: 9000 };
  run(w, 120);
  assert.ok(b.p.y < 620, `it tunnelled to y=${b.p.y.toFixed(0)}`);
});

/* ── stacking, which is the part that is hard ────────────────────────────── */

test('a stack of six stands up', () => {
  const w = new World({ width: 900, height: 600 });
  const st = [];
  for (let i = 0; i < 6; i++) st.push(w.add(box({ x: 450, y: 580 - i * 40, w: 160, h: 40 })));
  run(w, 600);
  assert.ok(tilt(st) < 0.2, `the stack leaned to ${tilt(st).toFixed(2)} radians`);
  const drift = Math.max(...st.map((b) => Math.abs(b.p.x - 450)));
  assert.ok(drift < 40, `the stack walked ${drift.toFixed(0)}px sideways`);
});

test('a stack of six dropped from a height still ends up standing', () => {
  const w = new World({ width: 900, height: 600 });
  const st = [];
  for (let i = 0; i < 6; i++) st.push(w.add(box({ x: 450, y: 400 - i * 60, w: 160, h: 40 })));
  run(w, 700);
  assert.ok(tilt(st) < 0.25, `it fell over: ${tilt(st).toFixed(2)} radians`);
});

test('a settled pile stops moving altogether', () => {
  /* Contacts never resolve to exactly zero, so a pile that is never allowed to
     stop keeps twitching, never looks finished, and burns a phone battery
     drawing the same picture for ever. */
  const w = new World({ width: 900, height: 600 });
  const st = [];
  for (let i = 0; i < 5; i++) st.push(w.add(box({ x: 450, y: 580 - i * 40, w: 160, h: 40 })));
  run(w, 400);
  assert.ok(st.every((b) => b.asleep), `${st.filter((b) => !b.asleep).length} of 5 never settled`);
  assert.ok(st.every((b) => speed(b) === 0));
});

test('and wakes up the moment something lands on it', () => {
  const w = new World({ width: 900, height: 600 });
  const st = [];
  for (let i = 0; i < 4; i++) st.push(w.add(box({ x: 450, y: 580 - i * 40, w: 160, h: 40 })));
  run(w, 400);
  assert.ok(st.every((b) => b.asleep), 'it never settled in the first place');
  w.add(box({ x: 450, y: 120, w: 60, h: 60 }));
  /* Watched while it happens. Ninety frames later the pile has woken, been
     landed on, and settled back down again — so a check at the end sees it
     asleep and concludes, wrongly, that nothing ever noticed. */
  let woke = false;
  for (let i = 0; i < 90 && !woke; i++) {
    w.step(1 / 60);
    woke = st.some((b) => !b.asleep);
  }
  assert.ok(woke, 'a box landed on the pile and nothing noticed');
  run(w, 200);
  assert.ok(st.every((b) => b.asleep), 'and then it never settled again');
});

test('a body with nothing under it never falls asleep in mid-air', () => {
  // at the top of a throw it is barely moving for a moment
  const w = new World({ width: 900, height: 4000 });
  const b = w.add(box({ x: 450, y: 200, w: 60, h: 60 }));
  b.vel = { x: 0, y: -8 };
  run(w, 120);
  assert.ok(!b.asleep, 'it went to sleep in the air');
});

/* ── the physics being physics ───────────────────────────────────────────── */

test('two boxes meeting in space conserve momentum', () => {
  /* With gravity and friction off, whatever one gains the other must lose. If
     momentum can appear, a pile slowly fires itself across the screen. */
  const w = new World({
    width: 4000, height: 4000,
    rules: { gravity: 0, friction: 0, restitution: 1, linearDamping: 1, angularDamping: 1 },
  });
  const a = w.add(box({ x: 1000, y: 2000, w: 100, h: 100 }));
  const b = w.add(box({ x: 1400, y: 2000, w: 100, h: 100 }));
  a.vel = { x: 500, y: 0 };
  b.vel = { x: -300, y: 0 };
  const before = a.mass * a.vel.x + b.mass * b.vel.x;
  run(w, 200);
  const after = a.mass * a.vel.x + b.mass * b.vel.x;
  assert.close(after, before, Math.abs(before) * 0.02 + 1, `${before.toFixed(1)} became ${after.toFixed(1)}`);
});

test('nothing ever gets faster on its own', () => {
  /* The failure this catches is the one that ruins every home-made solver:
     energy creeping in from the overlap correction until the pile explodes. */
  const w = new World({ width: 900, height: 600, rules: { gravity: 0 } });
  const bodies = [];
  for (let i = 0; i < 10; i++) {
    const b = w.add(box({ x: 120 + i * 70, y: 300 + (i % 3) * 30, w: 80, h: 40, angle: i * 0.3 }));
    b.vel = { x: (i % 2 ? 200 : -200), y: (i % 3) * 60 };
    bodies.push(b);
  }
  const energy = () => bodies.reduce((e, b) =>
    e + 0.5 * b.mass * (b.vel.x ** 2 + b.vel.y ** 2) + 0.5 * b.inertia * b.spin ** 2, 0);
  const start = energy();
  for (let i = 0; i < 400; i++) {
    w.step(1 / 60);
    assert.ok(energy() <= start * 1.05 + 1e-6,
      `energy climbed from ${start.toFixed(0)} to ${energy().toFixed(0)} at frame ${i}`);
  }
});

test('a box balanced on a corner tips over rather than standing on its point', () => {
  const w = new World({ width: 900, height: 600 });
  const b = w.add(box({ x: 450, y: 480, w: 90, h: 90, angle: 0.45 }));
  run(w, 400);
  const settled = Math.abs(((b.angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
  assert.ok(settled < 0.12 || settled > Math.PI / 2 - 0.12,
    `it came to rest at ${b.angle.toFixed(2)} radians, which is on a corner`);
});

test('a heavy box is harder to shift than a light one', () => {
  const w = new World({ width: 3000, height: 3000, rules: { gravity: 0 } });
  const light = w.add(new Body({ x: 1000, y: 1500, w: 80, h: 80, mass: 1 }));
  const heavy = w.add(new Body({ x: 2000, y: 1500, w: 80, h: 80, mass: 40 }));
  const hitL = w.add(new Body({ x: 800, y: 1500, w: 40, h: 40, mass: 5 }));
  const hitH = w.add(new Body({ x: 1800, y: 1500, w: 40, h: 40, mass: 5 }));
  hitL.vel = { x: 600, y: 0 };
  hitH.vel = { x: 600, y: 0 };
  run(w, 120);
  assert.ok(Math.abs(light.vel.x) > Math.abs(heavy.vel.x) * 2,
    `light moved at ${light.vel.x.toFixed(0)}, heavy at ${heavy.vel.x.toFixed(0)}`);
});

/* ── time ────────────────────────────────────────────────────────────────── */

test('the same setup twice gives the same pile', () => {
  const build = () => {
    const w = new World({ width: 900, height: 600 });
    for (let i = 0; i < 9; i++) {
      const b = w.add(box({ x: 200 + i * 60, y: 100 + (i % 3) * 80, w: 90, h: 34, angle: i * 0.4 }));
      b.vel = { x: (i % 2 ? 120 : -120), y: 0 };
    }
    run(w, 400);
    return w.bodies.map((b) => `${b.p.x.toFixed(4)},${b.p.y.toFixed(4)},${b.angle.toFixed(4)}`).join('|');
  };
  assert.equal(build(), build());
});

test('the same run at 30 and 120 frames a second ends up in the same place', () => {
  /* Sliced into fixed pieces on purpose: a solver fed a variable step is a
     different solver every frame, and a pile that is stable at 60 climbs out
     of itself at 30. */
  const at = (fps) => {
    const w = new World({ width: 900, height: 600 });
    const st = [];
    for (let i = 0; i < 5; i++) st.push(w.add(box({ x: 450, y: 400 - i * 60, w: 160, h: 40 })));
    for (let i = 0; i < fps * 6; i++) w.step(1 / fps);
    return st.map((b) => b.p.y.toFixed(1)).join(',');
  };
  assert.equal(at(30), at(120));
  assert.equal(at(60), at(120));
});

test('a backgrounded tab does not detonate the pile', () => {
  const w = new World({ width: 900, height: 600 });
  const st = [];
  for (let i = 0; i < 5; i++) st.push(w.add(box({ x: 450, y: 580 - i * 40, w: 160, h: 40 })));
  run(w, 300);
  const before = st.map((b) => b.p.y);
  w.step(240);
  assert.deep(st.map((b) => b.p.y), before, 'four minutes of catch-up were simulated at once');
});

test('nonsense time changes nothing', () => {
  const w = new World({ width: 900, height: 600 });
  const b = w.add(box({ x: 450, y: 300 }));
  const at = { ...b.p };
  for (const dt of [0, -1, NaN, Infinity, undefined, null]) w.step(dt);
  assert.deep({ ...b.p }, at);
});

/* ── being picked up ─────────────────────────────────────────────────────── */

test('a body you are holding is not dragged around by anything else', () => {
  const w = new World({ width: 900, height: 600 });
  const held = w.add(box({ x: 450, y: 300, w: 160, h: 40 }));
  held.grabbed = true;
  for (let i = 0; i < 6; i++) w.add(box({ x: 450, y: 260 - i * 42, w: 160, h: 40 }));
  run(w, 300);
  assert.close(held.p.y, 300, 1.5, 'the thing being held sagged under the pile');
});

test('going home settles, and stops', () => {
  const w = new World({ width: 900, height: 600 });
  const b = w.add(box({ x: 120, y: 500, w: 160, h: 40, angle: 1.2 }));
  const home = { x: 450, y: 200, angle: 0 };
  let done = false, frames = 0;
  while (!done && frames < 600) { done = homeStep(b, home, 1 / 60); frames++; }
  assert.ok(done, `it never arrived — ${Math.hypot(b.p.x - 450, b.p.y - 200).toFixed(1)}px away after ten seconds`);
  assert.close(b.p.x, 450, 1.5);
  assert.close(b.p.y, 200, 1.5);
  assert.close(b.angle, 0, 0.02);
  assert.ok(frames < 240, `it took ${frames} frames, which is long enough to feel broken`);
});

test('a body being held does not fly home underneath your finger', () => {
  const b = new Body({ x: 100, y: 100, w: 50, h: 50 });
  b.grabbed = true;
  const at = { ...b.p };
  for (let i = 0; i < 60; i++) homeStep(b, { x: 800, y: 800, angle: 0 }, 1 / 60);
  assert.deep({ ...b.p }, at);
});

/* ── the shape of the thing ──────────────────────────────────────────────── */

test('a fixed body has no mass the solver can move', () => {
  const f = new Body({ x: 0, y: 0, w: 10, h: 10, fixed: true });
  assert.equal(f.invMass, 0);
  assert.equal(f.invInertia, 0);
  assert.equal(f.im, 0);
});

test('a sleeping body looks exactly like a wall to the solver', () => {
  /* If it keeps a real mass it absorbs a share of every impulse and then
     throws that share away when it is skipped — so everything resting on it is
     under-corrected, every step, and the error compounds up the pile. */
  const b = new Body({ x: 0, y: 0, w: 50, h: 50 });
  assert.ok(b.im > 0);
  b.asleep = true;
  assert.equal(b.im, 0);
  assert.equal(b.ii, 0);
});

test('a box knows where its corners are', () => {
  const b = new Body({ x: 100, y: 100, w: 40, h: 20 });
  const cs = b.corners().map((c) => `${c.x.toFixed(0)},${c.y.toFixed(0)}`).sort();
  assert.deep(cs, ['120,110', '120,90', '80,110', '80,90'].sort());
  const turned = new Body({ x: 0, y: 0, w: 40, h: 20, angle: Math.PI / 2 }).corners();
  assert.close(Math.max(...turned.map((c) => Math.abs(c.x))), 10, 1e-6, 'turning it did not swap its sides');
});

test('scenery can be turned into something that falls', () => {
  /* The page stands up as fixed bodies that still collide, so a paragraph can
     be cut loose and whatever was resting on it comes down. */
  const w = new World({ width: 900, height: 600 });
  const shelf = w.add(box({ x: 450, y: 400, w: 300, h: 30, fixed: true }));
  const on = w.add(box({ x: 450, y: 360, w: 120, h: 40 }));
  run(w, 200);
  assert.close(shelf.p.y, 400, 1e-9, 'the shelf moved while it was scenery');
  assert.ok(on.p.y < 380, 'the box did not come to rest on the shelf');

  shelf.setFixed(false);
  on.wake();
  run(w, 260);
  assert.ok(shelf.p.y > 560, `the shelf did not fall — it is at ${shelf.p.y.toFixed(0)}`);
  assert.ok(shelf.p.y < 620, `the shelf fell THROUGH the floor to ${shelf.p.y.toFixed(0)}`);
  assert.ok(on.p.y < shelf.p.y, 'the box should still be on top of the shelf');
});

test('a body built as scenery still knows what it weighs', () => {
  /* Storing a mass of zero for scenery looks equivalent to zeroing the inverse
     and is not: release it later and it has nothing to be pushed by, so it
     accelerates under gravity and drops straight through the world. */
  const b = new Body({ x: 0, y: 0, w: 100, h: 40, fixed: true });
  assert.ok(b.mass > 0, 'a fixed body was given no mass at all');
  assert.ok(b.inertia > 0);
  assert.equal(b.invMass, 0, 'and it must still be immovable while it is fixed');
  b.setFixed(false);
  assert.ok(b.invMass > 0, 'releasing it left it massless');
  assert.close(b.invMass, 1 / b.mass, 1e-12);
  assert.close(b.invInertia, 1 / b.inertia, 1e-12);
});

test('turning a body back into scenery stops it dead', () => {
  const b = new Body({ x: 0, y: 0, w: 100, h: 40 });
  b.vel = { x: 500, y: -200 };
  b.spin = 3;
  b.setFixed(true);
  assert.equal(b.vel.x, 0);
  assert.equal(b.vel.y, 0);
  assert.equal(b.spin, 0);
  assert.equal(b.im, 0);
});

test('clamp does what it says', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

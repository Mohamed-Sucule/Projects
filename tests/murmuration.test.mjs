/* tests/murmuration.test.mjs — Murmuration (apps/murmuration).

   The flock itself runs on the graphics card, and tests/browser/murmuration.mjs
   flies it there. This file checks everything around it from a terminal: the
   evening's timetable, the camera, where the falcon is, and the same rules
   flown on the processor, which is the version a browser without the graphics
   features gets. */

import { test, assert } from './harness.mjs';
import { RULES, SPACE, EVENING, arrival, evening, centre, space, camera, project, falconAt, horizon, createReference } from '../apps/murmuration/field.js';
import { readFileSync } from 'node:fs';
import { FLY_FRAG, COUNT_VERT, DRAW_VERT, BIRD } from '../apps/murmuration/shaders.js';

test('the evening runs in order: arrivals, the murmuration, the drop, the end', () => {
  assert.equal(arrival(0), 0, 'the first birds are not already up');
  assert.close(arrival(1), EVENING.arrive, 1e-9);
  for (let r = 0; r < 1; r += 0.01) assert.ok(arrival(r + 0.01) >= arrival(r), 'later birds arrive earlier');
  const start = evening(0);
  assert.equal(start.light, 1);
  assert.equal(start.down, 0);
  assert.ok(start.sun > 0, 'the sun has already set at the start');
  assert.ok(evening(EVENING.sunset + 1).sun < 0, 'the sun never sets');
  assert.equal(evening(EVENING.dropFrom - 1).down, 0, 'birds go down before the drop');
  assert.equal(evening(EVENING.down).down, 1, 'birds are still up after the drop');
  assert.ok(!evening(EVENING.end - 1).over && evening(EVENING.end).over);
  assert.ok(EVENING.arrive < EVENING.dropFrom && EVENING.dropFrom < EVENING.down && EVENING.down <= EVENING.end);
});

test('the camera keeps the flock in view on every shape of screen', () => {
  for (const [w, h] of [[1920, 1080], [1440, 900], [1024, 768], [390, 844], [360, 740]]) {
    const cam = camera(w / h);
    const room = space(w / h);
    for (let t = 0; t < EVENING.dropFrom; t += 2) {
      const c = centre(t, w / h);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = project(cam, [c[0] + dx * room.rx * 0.8, c[1] + dy * room.ry, c[2]]);
        assert.ok(Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1, `${w}×${h} at ${t}s: the flock's edge is off the screen at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`);
      }
      /* And always above the reeds. */
      const low = project(cam, [c[0], c[1] - SPACE.ry, c[2]]);
      assert.ok((1 - low.y) / 2 < horizon(cam), `${w}×${h}: the flock dips below the horizon`);
    }
  }
});

test('the horizon sits low, with the reeds below it and the sky above', () => {
  for (const aspect of [16 / 9, 4 / 3, 390 / 844]) {
    const h = horizon(camera(aspect));
    assert.ok(h > 0.6 && h < 0.82, `the horizon is ${(h * 100).toFixed(0)}% of the way down`);
  }
});

test('the falcon is exactly where the pointer is', () => {
  const cam = camera(16 / 9);
  for (const [x, y] of [[0, 0], [0.5, 0.3], [-0.8, -0.2], [0.95, 0.9]]) {
    const p = project(cam, falconAt(cam, x, y, 850));
    assert.close(p.x, x, 1e-6);
    assert.close(p.y, y, 1e-6);
  }
});

test('the shaders fly by the same numbers as the processor', () => {
  /* The falcon's reach is handed over each frame; everything else is written into the shader. */
  const main = readFileSync(new URL('../apps/murmuration/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes('RULES.stoop') && main.includes('RULES.falcon'), 'the falcon does not use its reach');
  for (const [name, value] of Object.entries(RULES)) {
    if (name === 'falcon' || name === 'stoop') continue;
    const written = Number.isInteger(value) ? `${value}.0` : String(value);
    assert.ok(FLY_FRAG.includes(written), `the shader does not use ${name} = ${value}`);
  }
  assert.ok(COUNT_VERT.includes('gl_PointSize') && DRAW_VERT.includes('gl_InstanceID'));
  assert.equal(BIRD.length, 12 * 4, 'a bird is four triangles');
});

/* ── the flock, on the processor ──────────────────────────────────────── */

const flown = createReference({ count: 1200, seed: 5 });
const birds = () => Array.from({ length: flown.count }, (_, i) => flown.bird(i)).filter((b) => b.state === 1);
const run = (until, opts) => { while (flown.t < until) flown.step(1 / 30, opts); };

test('the birds come in, and by the end of the arrivals every one is up', () => {
  const first = flown.census();
  assert.ok(first.flying > 0 && first.waiting > 0, `at the start: ${JSON.stringify(first)}`);
  run(EVENING.arrive + 1);
  assert.equal(flown.census().flying, flown.count);
});

test('the murmuration holds together, keeps its spacing and stays over the reeds', () => {
  run(EVENING.arrive + 14);
  const all = birds();
  const mid = all.reduce((s, b) => [s[0] + b.x / all.length, s[1] + b.y / all.length, s[2] + b.z / all.length], [0, 0, 0]);
  const far = all.filter((b) => Math.hypot(b.x - mid[0], (b.y - mid[1]) * 2, b.z - mid[2]) > SPACE.rx * 1.6).length;
  assert.ok(far / all.length < 0.03, `${far} birds have strayed from the flock`);
  const nearest = all.filter((_, i) => i % 9 === 0).map((a) => Math.min(...all.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z))));
  nearest.sort((a, b) => a - b);
  const median = nearest[nearest.length >> 1];
  assert.ok(median > 1.5, `the flock has collapsed: the median gap is ${median.toFixed(2)}`);
  for (const b of all) {
    assert.ok(Number.isFinite(b.x + b.y + b.z), 'a bird has gone off the map');
    assert.ok(b.y > SPACE.floor * 0.5, `a bird is skimming the reeds at ${b.y.toFixed(0)}`);
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    assert.ok(speed >= RULES.slowest - 1e-3 && speed <= RULES.fastest + 1e-3, `a bird is flying at ${speed.toFixed(0)}`);
  }
});

test('a falcon in the middle of the flock opens a hole in it', () => {
  const all = birds();
  const mid = all.reduce((s, b) => [s[0] + b.x / all.length, s[1] + b.y / all.length, s[2] + b.z / all.length], [0, 0, 0]);
  /* Strike the densest part: the bird with the most others close by. */
  const crowded = (p) => all.filter((b) => Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) < 30).length;
  let at = all[0];
  for (const b of all.filter((_, i) => i % 13 === 0)) if (crowded(b) > crowded(at)) at = b;
  const falcon = [at.x, at.y, at.z];
  void mid;
  const near = () => birds().filter((b) => Math.hypot(b.x - falcon[0], b.y - falcon[1], b.z - falcon[2]) < 30).length;
  const before = near();
  for (let k = 0; k < 15; k++) flown.step(1 / 30, { falcon, stoop: true });
  const after = near();
  assert.ok(before >= 10, `nothing to strike: ${before} birds round the falcon`);
  assert.ok(after <= before * 0.2, `${after} of ${before} birds stayed by the falcon`);
});

test('as the light goes the whole flock drops into the reeds', () => {
  run(EVENING.dropFrom - 1);
  assert.equal(flown.census().asleep, 0, 'birds are down before the drop');
  run(EVENING.down + 6);
  assert.equal(flown.census().asleep, flown.count, `still up after the drop: ${JSON.stringify(flown.census())}`);
});

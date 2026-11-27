/* tests/flock.test.mjs — the starlings over the front page (assets/flock.js).

   The flock is decoration, but decoration that misbehaves is the first thing
   anyone notices: birds that collapse into a ball, wander off the screen, are
   still flapping over the night scenes, or come back wrong when you scroll up.
   It never touches the page, so all of that can be checked here, without a
   browser, on a screen the size of a laptop's. */

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.mjs';
import { createFlock, createMessenger, shares, HOURS, PERCH_SHAPE, FLY, PERCHED, ASLEEP } from '../assets/flock.js';

const W = 1440;
const H = 900;
const slots = Array.from({ length: 40 }, (_, k) => ({ x: 60 + k * 33, y: H - 30 }));

function flockAt(minute, seconds, f = hatch()) {
  f.setMinute(minute);
  for (let k = 0; k < seconds * 60; k++) f.step(1 / 60);
  return f;
}
function hatch(count = 600) {
  const f = createFlock({ count });
  f.resize(W, H, slots);
  return f;
}
const birds = (f) => Array.from({ length: f.count }, (_, i) => f.bird(i));

test('the flock keeps the hours of the night', () => {
  assert.deep(shares(0), { down: 0, gone: 0 }, 'at 17:30 every bird is up');
  assert.equal(shares(HOURS.settled).down, 1, 'not every bird is down by the time it is meant to be');
  assert.equal(shares(HOURS.leaveFrom).gone, 0, 'birds leave before first light');
  assert.equal(shares(HOURS.gone).gone, 1, 'not every bird has gone by morning');
  for (let m = 0; m < 870; m += 10) assert.ok(shares(m + 10).down >= shares(m).down && shares(m + 10).gone >= shares(m).gone, `the flock goes backwards at minute ${m}`);
});

test('the front page and the flock agree on the hours', () => {
  /* Up over the sunset when you land, down by the first scene of the night,
     and away after first light, by the time the morning comes. */
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (id) => Number(home.match(new RegExp(`id="${id}" class="scene[^"]*" data-at="(\\d+)"`))[1]);
  const first = Number(home.match(/class="scene(?! hero)[^"]*" data-at="(\d+)"/)[1]);
  assert.ok(HOURS.settleFrom > 0, 'the flock is already down when you land');
  assert.ok(HOURS.settled < first, 'birds are still flying over the first scene of the night');
  assert.ok(HOURS.leaveFrom >= at('oklch-studio'), 'the flock leaves before first light');
  assert.ok(HOURS.gone <= at('morning'), 'the flock is still here in the morning');
});

test('at dusk the whole flock is in the air, over the sky, and flying', () => {
  const f = flockAt(0, 10);
  const all = birds(f);
  assert.equal(f.census().fly, f.count);
  for (const b of all) {
    assert.ok(b.x > -0.1 * W && b.x < 1.1 * W && b.y > -0.1 * H && b.y < 0.65 * H, `a bird has wandered to ${b.x.toFixed(0)}, ${b.y.toFixed(0)}`);
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    assert.ok(speed > 100 && speed < 280, `a bird is flying at ${speed.toFixed(0)} pixels a second`);
  }
});

test('the birds keep their distance, and the flock holds together', () => {
  const all = birds(flockAt(0, 12));
  const nearest = all.filter((_, i) => i % 5 === 0).map((a) => Math.min(...all.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z))));
  nearest.sort((a, b) => a - b);
  const median = nearest[nearest.length >> 1];
  assert.ok(median > 6, `the flock has collapsed: half the birds are within ${median.toFixed(1)} px of another`);
  assert.ok(median < 30, `the flock has come apart: the median gap is ${median.toFixed(1)} px`);
  /* One murmuration, not a scatter: most birds are near the middle of it. */
  const cx = all.reduce((s, b) => s + b.x, 0) / all.length;
  const cy = all.reduce((s, b) => s + b.y, 0) / all.length;
  const near = all.filter((b) => Math.hypot(b.x - cx, b.y - cy) < 0.3 * W).length;
  assert.ok(near / all.length > 0.9, `only ${near} of ${all.length} birds are with the flock`);
});

test('it is down for the night before the night scenes, some of it on the wire', () => {
  const f = flockAt(270, 12);
  const c = f.census();
  assert.equal(c.fly + c.drop + c.land + c.leave, 0, `birds are still moving at 22:00: ${JSON.stringify(c)}`);
  assert.equal(c.perched, slots.length, 'every place on the wire is taken');
  for (const b of birds(f)) if (b.mode === PERCHED) {
    assert.equal(b.x, slots[b.slot].x);
    assert.equal(b.y, slots[b.slot].y);
  }
});

test('scrolling back up to dusk brings the flock back into the sky', () => {
  const f = flockAt(0, 8, flockAt(400, 12));
  assert.equal(f.census().fly, f.count);
  for (const b of birds(f)) assert.ok(b.y < H, 'a bird is still below the bottom of the screen');
});

test('by morning every bird has gone, and the birds on the wire go last', () => {
  const f = flockAt(600, 12);
  /* Halfway through the leaving, the wire is still full. */
  let half = HOURS.leaveFrom;
  while (shares(half).gone < 0.6) half++;
  flockAt(half, 6, f);
  assert.equal(f.census().perched, slots.length, 'birds have left the wire before the roost');
  assert.ok(f.census().gone > 0, 'nobody has left at all');
  flockAt(HOURS.gone + 10, 8, f);
  assert.equal(f.census().gone, f.count, `still here in the morning: ${JSON.stringify(f.census())}`);
});

test('with the motion off, the hour still places every bird and none of them moves', () => {
  const f = hatch();
  const before = birds(f).map((b) => [b.x, b.y]);
  f.setMinute(300);
  f.snap();
  assert.equal(f.census().perched, slots.length);
  assert.equal(f.census().asleep, f.count - slots.length);
  f.setMinute(0);
  f.snap();
  assert.equal(f.census().fly, f.count);
  /* Back where it was before the night, exactly: nothing was simulated. */
  assert.deep(birds(f).map((b) => [b.x, b.y]), before);
});

test('the same flock comes out every evening', () => {
  const a = birds(flockAt(0, 3)).map((b) => [b.x, b.y, b.z]);
  const b = birds(flockAt(0, 3)).map((b) => [b.x, b.y, b.z]);
  assert.deep(a, b);
});

test('a falcon opens a hole in the flock', () => {
  const f = flockAt(0, 6);
  const all = birds(f).filter((b) => b.mode === FLY);
  const x = all.reduce((s, b) => s + b.x, 0) / all.length;
  const y = all.reduce((s, b) => s + b.y, 0) / all.length;
  const around = () => birds(f).filter((b) => Math.hypot(b.x - x, b.y - y) < 50).length;
  f.setHawk({ x, y, r: 150 });
  const steps = 36;
  for (let k = 0; k < steps; k++) f.step(1 / 60);
  assert.ok(around() <= 3, `${around()} birds stayed within 50 px of the falcon`);
});

test('the index birds and the flock are the same bird', () => {
  /* night.css draws the hours on the wire with the shape the flock perches in. */
  const css = readFileSync(new URL('../assets/night.css', import.meta.url), 'utf8');
  assert.ok(css.includes(`d='${PERCH_SHAPE}'`), 'the birds on the wire are not the flock’s shape');
});

test('a bird sent to a scene flies there, stands on its clock, and comes home', () => {
  let target = { x: 300, y: 200, off: false };
  let home = false;
  const m = createMessenger({ from: { x: 900, y: 860 }, target: () => target, home: () => ({ x: 900, y: 860 }), colour: '#ffcf8a', onHome: () => { home = true; } });
  let t = 0;
  while (m.phase === 'out' && t < 3) { m.step(1 / 60); t += 1 / 60; }
  assert.equal(m.phase, 'perched', 'it never arrived');
  assert.ok(t < 1.5, `it took ${t.toFixed(2)} s to get there`);
  /* The page scrolls; the bird stays on the numbers. */
  target = { x: 300, y: 150, off: false };
  m.step(1 / 60);
  assert.deep(m.at, { x: 300, y: 150 });
  /* And when the scene scrolls away, it goes home early. */
  target = { ...target, off: true };
  m.step(1 / 60);
  assert.equal(m.phase, 'home');
  let going = true;
  for (let k = 0; k < 120 && going; k++) going = m.step(1 / 60);
  assert.ok(!going && home, 'it never got home');
});

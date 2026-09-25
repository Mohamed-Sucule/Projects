import { test, assert } from './harness.mjs';
import {
  SPRINGS, criticalDamping, makeSpring, stepSpring, atRest, snapSpring,
  grid, masonry, justified, list, spiral, deck, coverflow, LAYOUTS,
  extent, reorder, slotAt,
} from '../play/morph/engine.js';

const items = (n, aspects = null) =>
  Array.from({ length: n }, (_, i) => ({ id: i, aspect: aspects ? aspects[i % aspects.length] : 1 }));

const overlaps = (a, b) =>
  a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 &&
  a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;

/* ── springs ─────────────────────────────────────────────────────────────── */

test('a spring arrives at its target and stays there', () => {
  const s = makeSpring(0);
  for (let i = 0; i < 400; i++) stepSpring(s, 100, SPRINGS.snappy, 1 / 60);
  assert.close(s.value, 100, 0.01);
  assert.close(s.velocity, 0, 0.01);
});

test('critical damping does not overshoot; low damping does', () => {
  const run = (cfg) => {
    const s = makeSpring(0);
    let peak = 0;
    for (let i = 0; i < 400; i++) { stepSpring(s, 100, cfg, 1 / 60); peak = Math.max(peak, s.value); }
    return peak;
  };
  const critical = { stiffness: 200, damping: criticalDamping({ stiffness: 200 }), mass: 1 };
  assert.ok(run(critical) <= 100.01, `critically damped should never pass the target, peaked at ${run(critical)}`);
  assert.ok(run(SPRINGS.wobbly) > 105, 'an under-damped spring is supposed to overshoot');
});

test('the result does not depend on the frame rate', () => {
  // A spring that behaves differently at 120Hz than at 60Hz is a spring that
  // will look wrong on somebody's machine and right on mine.
  const at = (dt, steps) => {
    const s = makeSpring(0);
    for (let i = 0; i < steps; i++) stepSpring(s, 250, SPRINGS.gentle, dt);
    return s.value;
  };
  assert.close(at(1 / 60, 30), at(1 / 120, 60), 0.5);
  assert.close(at(1 / 60, 30), at(1 / 240, 120), 0.5);
});

test('a dropped frame does not detonate a stiff spring', () => {
  // Semi-implicit Euler in one big step is unstable; this is why the
  // integrator slices dt into small pieces internally.
  const s = makeSpring(0);
  stepSpring(s, 500, SPRINGS.stiff, 0.25);          // a quarter-second hitch
  assert.ok(Number.isFinite(s.value), 'value went non-finite');
  assert.ok(Math.abs(s.value) < 2000, `value blew up to ${s.value}`);
  for (let i = 0; i < 400; i++) stepSpring(s, 500, SPRINGS.stiff, 1 / 60);
  assert.close(s.value, 500, 0.5, 'and it still has to recover');
});

test('an absurd dt is clamped rather than integrated', () => {
  const s = makeSpring(0);
  stepSpring(s, 100, SPRINGS.snappy, 30);           // tab was in the background
  assert.ok(Number.isFinite(s.value) && Math.abs(s.value) < 1000);
});

test('redirecting mid-flight keeps the momentum', () => {
  // The whole reason for springs over transitions: no restart from zero.
  const s = makeSpring(0);
  for (let i = 0; i < 8; i++) stepSpring(s, 300, SPRINGS.gentle, 1 / 60);
  const speed = s.velocity;
  assert.ok(speed > 10, 'should be moving by now');
  stepSpring(s, 0, SPRINGS.gentle, 1 / 60);         // target yanked back
  assert.ok(s.velocity > 0, 'velocity must survive the change of target, not reset');
  assert.ok(s.velocity < speed, 'and it should now be slowing down');
});

test('rest is both close enough and slow enough', () => {
  const s = makeSpring(100);
  assert.ok(atRest(s, 100), 'sitting exactly on target at zero speed is rest');
  s.velocity = 400;
  assert.ok(!atRest(s, 100), 'passing through the target at speed is not rest');
  snapSpring(s, 100);
  assert.ok(atRest(s, 100));
  assert.equal(s.velocity, 0);
});

/* ── layouts, the shared contract ────────────────────────────────────────── */

test('every layout returns one finite rectangle per item, in order', () => {
  const box = { width: 900, height: 600, gap: 12, columns: 4 };
  for (const [name, { fn }] of Object.entries(LAYOUTS)) {
    const list24 = items(24, [0.7, 1, 1.5, 1.2]);
    const rects = fn(list24, box);
    assert.equal(rects.length, list24.length, `${name} returned ${rects.length} rects for 24 items`);
    rects.forEach((r, i) => {
      for (const k of ['x', 'y', 'w', 'h']) {
        assert.ok(Number.isFinite(r[k]), `${name}[${i}].${k} is ${r[k]}`);
      }
      assert.ok(r.w > 0 && r.h > 0, `${name}[${i}] has no area`);
    });
  }
});

test('every layout copes with one item and with none', () => {
  const box = { width: 600, height: 400, gap: 10, columns: 3 };
  for (const [name, { fn }] of Object.entries(LAYOUTS)) {
    assert.equal(fn([], box).length, 0, `${name} choked on an empty list`);
    const one = fn(items(1), box);
    assert.equal(one.length, 1, `${name} choked on a single item`);
    assert.ok(Number.isFinite(one[0].x) && one[0].w > 0, `${name} produced nonsense for one item`);
  }
});

test('every layout carries its own label and note for the interface', () => {
  for (const [name, def] of Object.entries(LAYOUTS)) {
    assert.ok(def.label, `${name} has no label`);
    assert.ok(def.note, `${name} has no note`);
    assert.ok(typeof def.fn === 'function');
  }
});

/* ── grid ────────────────────────────────────────────────────────────────── */

test('a grid fills the width exactly and never overlaps', () => {
  const rects = grid(items(12), { width: 800, gap: 16, columns: 4 });
  const row = rects.slice(0, 4);
  assert.close(row[3].x + row[3].w, 800, 0.01, 'the last column must reach the right edge');
  for (let i = 1; i < 4; i++) {
    assert.close(row[i].x - (row[i - 1].x + row[i - 1].w), 16, 0.01, 'gaps must be exact');
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      assert.ok(!overlaps(rects[i], rects[j]), `grid cells ${i} and ${j} overlap`);
    }
  }
});

test('a one-column grid is still a grid', () => {
  const rects = grid(items(3), { width: 500, gap: 10, columns: 1 });
  assert.close(rects[0].w, 500, 0.01);
  assert.close(rects[1].y, rects[0].h + 10, 0.01);
});

/* ── masonry ─────────────────────────────────────────────────────────────── */

test('masonry keeps every aspect ratio and never overlaps', () => {
  const list = items(30, [0.6, 1, 1.4, 0.85, 1.9]);
  const rects = masonry(list, { width: 920, gap: 14, columns: 4 });
  rects.forEach((r, i) => assert.close(r.w / r.h, list[i].aspect, 1e-6, `item ${i} was distorted`));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      assert.ok(!overlaps(rects[i], rects[j]), `masonry items ${i} and ${j} overlap`);
    }
  }
});

test('masonry keeps its columns roughly level', () => {
  // That is the entire job of "put it in the shortest column".
  const rects = masonry(items(40, [0.7, 1.3, 1, 1.8]), { width: 800, gap: 12, columns: 4 });
  const bottoms = new Map();
  for (const r of rects) bottoms.set(Math.round(r.x), Math.max(bottoms.get(Math.round(r.x)) ?? 0, r.y + r.h));
  const hs = [...bottoms.values()];
  assert.equal(hs.length, 4, 'expected four columns');
  const spread = Math.max(...hs) - Math.min(...hs);
  const tallest = Math.max(...hs);
  assert.ok(spread < tallest * 0.12, `columns differ by ${Math.round(spread)}px out of ${Math.round(tallest)}`);
});

/* ── justified ───────────────────────────────────────────────────────────── */

test('every justified row fills the container to the pixel', () => {
  // This is the property the whole algorithm exists to guarantee.
  const list = items(37, [0.66, 1.5, 1, 1.33, 0.8, 1.77]);
  const W = 1040, gap = 12;
  const rects = justified(list, { width: W, gap, targetHeight: 190 });

  const rows = new Map();
  rects.forEach((r) => {
    const key = Math.round(r.y);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(r);
  });
  const keys = [...rows.keys()].sort((a, b) => a - b);
  assert.ok(keys.length > 3, `expected several rows, got ${keys.length}`);

  keys.slice(0, -1).forEach((key) => {   // the last row is deliberately short
    const row = rows.get(key).sort((a, b) => a.x - b.x);
    const right = row[row.length - 1].x + row[row.length - 1].w;
    assert.close(right, W, 0.02, `a row ended at ${right.toFixed(2)} instead of ${W}`);
    row.forEach((r, i) => {
      if (i) assert.close(r.x - (row[i - 1].x + row[i - 1].w), gap, 0.02, 'gap inside a row');
      assert.close(r.h, row[0].h, 0.02, 'every item in a row shares one height');
    });
  });
});

test('justified never stretches an image', () => {
  const list = items(25, [0.6, 1.2, 1.8, 1]);
  const rects = justified(list, { width: 900, gap: 10, targetHeight: 160 });
  rects.forEach((r, i) => assert.close(r.w / r.h, list[i].aspect, 1e-6, `item ${i} was distorted`));
});

test('a lone last row is capped instead of blown up to fill the width', () => {
  const rects = justified(items(1, [1]), { width: 1200, gap: 10, targetHeight: 180 });
  assert.ok(rects[0].h <= 180 * 1.36, `a single item ballooned to ${rects[0].h.toFixed(0)}px tall`);
  assert.ok(rects[0].w < 1200, 'and it should not span the whole width either');
});

test('justified rows do not overlap each other', () => {
  const rects = justified(items(20, [0.7, 1.4, 1]), { width: 800, gap: 12, targetHeight: 150 });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      assert.ok(!overlaps(rects[i], rects[j]), `justified items ${i} and ${j} overlap`);
    }
  }
});

/* ── the rest ────────────────────────────────────────────────────────────── */

test('a list is full width, evenly spaced, and in order', () => {
  const rects = list(items(5), { width: 640, gap: 8, rowHeight: 80 });
  rects.forEach((r, i) => {
    assert.equal(r.w, 640);
    assert.close(r.y, i * 88, 1e-9);
  });
});

test('the spiral uses an angle that never forms spokes', () => {
  // Any rational fraction of a turn makes items line up into rays. The golden
  // angle is irrational, so no two items ever share a bearing.
  const rects = spiral(items(60), { width: 700, height: 700, size: 70 });
  const bearings = rects.map((r) => Math.round((r.rot % 360 + 360) % 360));
  assert.ok(new Set(bearings).size > 50, `only ${new Set(bearings).size} distinct angles out of 60`);
});

test('the spiral grows outwards from the middle', () => {
  const rects = spiral(items(40), { width: 600, height: 600, size: 80 });
  const from = (r) => Math.hypot(r.x + r.w / 2 - 300, r.y + r.h / 2 - 300);
  assert.ok(from(rects[39]) > from(rects[1]), 'later items should sit further out');
  assert.ok(rects[39].w < rects[0].w, 'and be smaller');
});

test('a deck stacks front to back with the first card on top', () => {
  const rects = deck(items(8), { width: 800, height: 600, size: 240 });
  for (let i = 1; i < rects.length; i++) {
    assert.ok(rects[i].z < rects[i - 1].z, 'each card must sit behind the one before it');
  }
});

test('coverflow turns everything except the focused item', () => {
  const rects = coverflow(items(9), { width: 900, height: 400, size: 180, focus: 4 });
  assert.equal(rects[4].rotY, 0, 'the focused item faces the viewer');
  assert.ok(rects[3].rotY > 0 && rects[5].rotY < 0, 'the two sides turn away from each other');
  assert.ok(rects[4].z > rects[0].z, 'and the focused item is in front');
  assert.ok(rects[4].scale > rects[8].scale, 'and largest');
});

test('coverflow keeps every card inside the box, however many there are', () => {
  // Spacing the turned-away cards evenly reads fine for five and sends the
  // fiftieth a thousand pixels off the side, which then scrolls.
  const W = 900;
  for (const n of [5, 30, 120]) {
    const rects = coverflow(items(n), { width: W, height: 420, size: 200, focus: Math.floor(n / 2) });
    rects.forEach((r, i) => {
      assert.ok(r.x + r.w > 0, `card ${i} of ${n} is off the left edge`);
      assert.ok(r.x < W, `card ${i} of ${n} is off the right edge at x=${r.x.toFixed(0)}`);
    });
  }
});

test('extent reports the bottom of the tallest thing', () => {
  assert.equal(extent([{ x: 0, y: 0, w: 10, h: 40 }, { x: 0, y: 30, w: 10, h: 25 }]), 55);
  assert.equal(extent([]), 0);
});

/* ── reordering ──────────────────────────────────────────────────────────── */

test('reorder moves one item and keeps every other', () => {
  const a = ['a', 'b', 'c', 'd', 'e'];
  assert.deep(reorder(a, 0, 3), ['b', 'c', 'd', 'a', 'e']);
  assert.deep(reorder(a, 4, 0), ['e', 'a', 'b', 'c', 'd']);
  assert.deep(reorder(a, 2, 2), a, 'moving onto itself changes nothing');
  assert.deep(a, ['a', 'b', 'c', 'd', 'e'], 'the input must not be mutated');
});

test('reorder is always a permutation, wherever you aim it', () => {
  const a = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let from = 0; from < a.length; from++) {
    for (let to = -3; to < a.length + 3; to++) {
      const out = reorder(a, from, to);
      assert.equal(out.length, a.length, `${from}->${to} changed the length`);
      assert.deep([...out].sort((x, y) => x - y), a, `${from}->${to} lost or duplicated an item`);
    }
  }
});

test('the drop slot is decided by centres, not edges', () => {
  // With edges, a small item dragged over a big one satisfies two slots at
  // once and the list flickers between them.
  const rects = [
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 120, y: 0, w: 300, h: 100 },
    { x: 440, y: 0, w: 100, h: 100 },
  ];
  assert.equal(slotAt(rects, 50, 50), 0);
  assert.equal(slotAt(rects, 270, 50), 1);
  assert.equal(slotAt(rects, 490, 50), 2);
  assert.equal(slotAt(rects, 270, 50, 1), 0, 'skipping the hovered item looks past it');
});

test('asking for a slot with nothing to drop onto is not a crash', () => {
  assert.equal(slotAt([], 10, 10), -1);
  assert.equal(slotAt([{ x: 0, y: 0, w: 10, h: 10 }], 5, 5, 0), -1);
});

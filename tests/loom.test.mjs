import { test, assert } from './harness.mjs';
import {
  NODES, PALETTES, image, sample, fbm, rampAt,
  makeNode, emptyGraph, connect, disconnect, removeNode, reaches,
  evalOrder, signature, evaluate, serialize, deserialize, resetIds,
  GraphError, luma, toRGBA,
} from '../play/loom/engine.js';

const W = 24, H = 24;

/** A graph is easier to build than to write out: add(type) returns the node. */
function build() {
  resetIds(1);
  let g = emptyGraph();
  return {
    add(type, params) { const n = makeNode(type, 0, 0, params); g = { ...g, nodes: [...g.nodes, n] }; return n; },
    wire(from, to, port = 0) { g = connect(g, from.id, to.id, port); },
    get graph() { return g; },
    set graph(v) { g = v; },
  };
}

/* ── the pieces ──────────────────────────────────────────────────────────── */

test('every node type declares what an editor needs to draw it', () => {
  for (const [key, def] of Object.entries(NODES)) {
    assert.ok(def.title, `${key} has no title`);
    assert.ok(def.about, `${key} has no plain-English description`);
    assert.ok(Array.isArray(def.inputs), `${key} has no input list`);
    assert.ok(typeof def.run === 'function', `${key} has no run()`);
    for (const p of def.params) {
      assert.ok(p.key && p.label && p.kind, `${key}.${p.key} is underspecified`);
      assert.ok(p.def !== undefined, `${key}.${p.key} has no default`);
      if (p.kind === 'pick') assert.ok(p.options.includes(p.def), `${key}.${p.key} defaults outside its options`);
      if (p.kind === 'num') assert.ok(p.def >= p.min && p.def <= p.max, `${key}.${p.key} defaults out of range`);
    }
  }
});

test('every node produces an image of exactly the size it was asked for', () => {
  for (const [key, def] of Object.entries(NODES)) {
    const params = Object.fromEntries(def.params.map((p) => [p.key, p.def]));
    const inputs = def.inputs.map(() => {
      const src = image(W, H);
      src.r.fill(0.4); src.g.fill(0.6); src.b.fill(0.8);
      return src;
    });
    const out = def.run(inputs, params, W, H);
    assert.equal(out.w, W, `${key} returned width ${out.w}`);
    assert.equal(out.h, H, `${key} returned height ${out.h}`);
    assert.equal(out.r.length, W * H, `${key} returned ${out.r.length} pixels`);
    for (let i = 0; i < out.r.length; i++) {
      assert.ok(Number.isFinite(out.r[i]) && Number.isFinite(out.g[i]) && Number.isFinite(out.b[i]),
        `${key} produced a non-finite pixel at ${i}`);
    }
  }
});

test('noise is smooth — neighbouring pixels never jump', () => {
  // The whole reason for gradient noise over random values is continuity.
  // Sampling a fine grid, no two adjacent points should differ much.
  let worst = 0;
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 60; x++) {
      const a = fbm(7, x * 0.05, y * 0.05, 1);
      const b = fbm(7, (x + 1) * 0.05, y * 0.05, 1);
      worst = Math.max(worst, Math.abs(a - b));
    }
  }
  assert.ok(worst < 0.1, `adjacent noise samples differed by ${worst.toFixed(3)} — that is not smooth`);
});

test('noise stays inside its nominal range and actually varies', () => {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 4000; i++) {
    const v = fbm(3, i * 0.017, i * 0.031, 4);
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  assert.ok(lo > -1.01 && hi < 1.01, `noise escaped [-1,1]: ${lo} .. ${hi}`);
  assert.ok(hi - lo > 0.4, `noise barely moved: range was only ${(hi - lo).toFixed(3)}`);
});

test('the same seed gives the same field, a different seed does not', () => {
  assert.equal(fbm(11, 3.3, 4.4, 3), fbm(11, 3.3, 4.4, 3));
  assert.ok(fbm(11, 3.3, 4.4, 3) !== fbm(12, 3.3, 4.4, 3));
});

test('sampling between pixels interpolates, and off the edge wraps', () => {
  const img = image(4, 4);
  img.r[0] = 0; img.r[1] = 1;           // (0,0) black, (1,0) white
  const out = [0, 0, 0];
  sample(img, 0.5, 0, out);
  assert.close(out[0], 0.5, 1e-6, 'halfway between 0 and 1 should be 0.5');
  sample(img, 4, 0, out);
  assert.close(out[0], img.r[0], 1e-6, 'x=4 on a 4-wide image should wrap to x=0');
  sample(img, -4, 0, out);
  assert.close(out[0], img.r[0], 1e-6, 'a negative coordinate should wrap too');
});

test('every palette stop is a real colour and the ramp runs dark to light', () => {
  for (const [name, stops] of Object.entries(PALETTES)) {
    assert.ok(stops.length >= 2, `${name} needs at least two stops`);
    for (const s of stops) assert.ok(/^#[0-9a-f]{6}$/i.test(s), `${name} has a bad stop: ${s}`);
    const first = rampAt(stops, 0), last = rampAt(stops, 1);
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    assert.ok(lum(last) > lum(first) + 0.3, `${name} does not travel far enough in brightness`);
  }
});

test('blur removes detail rather than adding or shifting brightness', () => {
  const noisy = NODES.noise.run([], { scale: 12, octaves: 5, seed: 4, contrast: 1 }, 48, 48);
  const soft = NODES.blur.run([noisy], { radius: 8, passes: 2 }, 48, 48);
  const spread = (img) => {
    let mean = 0;
    for (let i = 0; i < img.r.length; i++) mean += img.r[i];
    mean /= img.r.length;
    let v = 0;
    for (let i = 0; i < img.r.length; i++) v += (img.r[i] - mean) ** 2;
    return { mean, sd: Math.sqrt(v / img.r.length) };
  };
  const a = spread(noisy), b = spread(soft);
  assert.ok(b.sd < a.sd * 0.6, `blur should flatten the variation: ${a.sd.toFixed(3)} -> ${b.sd.toFixed(3)}`);
  assert.close(b.mean, a.mean, 0.05, 'blur must not darken or brighten the image overall');
});

test('a zero-radius blur is a no-op, not a slightly different image', () => {
  const src = NODES.checker.run([], { cells: 6 }, 32, 32);
  const out = NODES.blur.run([src], { radius: 0, passes: 2 }, 32, 32);
  for (let i = 0; i < src.r.length; i++) assert.equal(out.r[i], src.r[i]);
});

test('blend modes behave the way their names claim', () => {
  const mk = (v) => { const i = image(2, 2); i.r.fill(v); i.g.fill(v); i.b.fill(v); return i; };
  const at = (mode, a, b) =>
    NODES.blend.run([mk(a), mk(b)], { mode, amount: 1 }, 2, 2).r[0];
  assert.close(at('multiply', 0.5, 0.5), 0.25, 1e-6);
  assert.close(at('screen', 0.5, 0.5), 0.75, 1e-6);
  assert.close(at('difference', 0.8, 0.3), 0.5, 1e-6);
  assert.close(at('lighten', 0.2, 0.7), 0.7, 1e-6);
  assert.close(at('darken', 0.2, 0.7), 0.2, 1e-6);
  assert.close(at('add', 0.4, 0.4), 0.8, 1e-6);
  // amount 0 must leave A untouched whatever the mode says
  const untouched = NODES.blend.run([mk(0.3), mk(0.9)], { mode: 'multiply', amount: 0 }, 2, 2);
  assert.close(untouched.r[0], 0.3, 1e-6);
});

test('mask picks A where it is bright and B where it is dark', () => {
  const a = image(2, 1), b = image(2, 1), m = image(2, 1);
  a.r.fill(1); b.r.fill(0);
  m.r[0] = 1; m.g[0] = 1; m.b[0] = 1;     // left: fully revealing A
  m.r[1] = 0; m.g[1] = 0; m.b[1] = 0;     // right: fully revealing B
  const out = NODES.mask.run([a, b, m], { softness: 0.05, bias: 0.5 }, 2, 1);
  assert.close(out.r[0], 1, 1e-3);
  assert.close(out.r[1], 0, 1e-3);
});

test('colorize turns grey into colour and keeps dark dark', () => {
  const ramp = NODES.gradient.run([], { angle: 0, softness: 1 }, 32, 8);
  const col = NODES.colorize.run([ramp], { palette: 'ember', shift: 0, reverse: false }, 32, 8);
  let coloured = 0;
  for (let i = 0; i < col.r.length; i++) if (Math.abs(col.r[i] - col.b[i]) > 0.05) coloured++;
  assert.ok(coloured > col.r.length * 0.5, 'most of the image should no longer be grey');
  assert.ok(luma(col, 0) < luma(col, col.r.length - 1), 'the dark end should stay the dark end');
});

/* ── the graph ───────────────────────────────────────────────────────────── */

test('a link replaces whatever was in that port before', () => {
  const b = build();
  const n1 = b.add('noise'), n2 = b.add('checker'), out = b.add('output');
  b.wire(n1, out, 0);
  b.wire(n2, out, 0);
  assert.equal(b.graph.links.filter((l) => l.to === out.id && l.port === 0).length, 1);
  assert.equal(b.graph.links[0].from, n2.id);
});

test('a graph refuses to eat its own tail', () => {
  const b = build();
  const a = b.add('noise'), c = b.add('blur'), d = b.add('levels');
  b.wire(a, c, 0); b.wire(c, d, 0);
  assert.throws(() => connect(b.graph, d.id, c.id, 0), 'a cycle should have been rejected');
  assert.throws(() => connect(b.graph, c.id, c.id, 0), 'a self-link should have been rejected');
  assert.ok(reaches(b.graph, a.id, d.id));
  assert.ok(!reaches(b.graph, d.id, a.id));
});

test('deleting a node takes its wires with it', () => {
  const b = build();
  const a = b.add('noise'), c = b.add('blur'), d = b.add('output');
  b.wire(a, c, 0); b.wire(c, d, 0);
  const g = removeNode(b.graph, c.id);
  assert.equal(g.nodes.length, 2);
  assert.equal(g.links.length, 0, 'both wires touching the removed node should be gone');
});

test('evaluation order puts every dependency before its dependent', () => {
  const b = build();
  const n = b.add('noise'), ch = b.add('checker'), bl = b.add('blend'), out = b.add('output');
  b.wire(n, bl, 0); b.wire(ch, bl, 1); b.wire(bl, out, 0);
  const order = evalOrder(b.graph, out.id);
  const at = (id) => order.indexOf(id);
  assert.ok(at(n.id) < at(bl.id) && at(ch.id) < at(bl.id), 'both inputs must be computed before the blend');
  assert.ok(at(bl.id) < at(out.id));
  assert.equal(order.length, 4);
});

test('nothing upstream of a disconnected branch is evaluated', () => {
  const b = build();
  const used = b.add('noise'), unused = b.add('cells'), out = b.add('output');
  b.wire(used, out, 0);
  const order = evalOrder(b.graph, out.id);
  assert.ok(!order.includes(unused.id), 'an unreachable node should never be computed');
  assert.equal(order.length, 2);
});

test('a node with nothing plugged in still renders instead of crashing', () => {
  const b = build();
  const blur = b.add('blur'), out = b.add('output');
  b.wire(blur, out, 0);
  const { image: img } = evaluate(b.graph, out.id, 8, 8);
  assert.equal(img.w, 8);
  assert.close(img.r[0], 0.5, 1e-6, 'an empty input should read as mid-grey');
});

test('the cache recomputes exactly the nodes that changed, and no others', () => {
  const b = build();
  const n = b.add('noise'), bl = b.add('blur'), col = b.add('colorize'), out = b.add('output');
  b.wire(n, bl, 0); b.wire(bl, col, 0); b.wire(col, out, 0);
  const cache = new Map();

  const first = evaluate(b.graph, out.id, 16, 16, cache);
  assert.equal(first.computed, 4, 'a cold cache should compute everything');

  const again = evaluate(b.graph, out.id, 16, 16, cache);
  assert.equal(again.computed, 0, 'an unchanged graph should compute nothing at all');

  // Change the palette — the node itself and the output must redo; the
  // expensive noise and blur upstream of it must not.
  col.params.shift = 0.4;
  const after = evaluate(b.graph, out.id, 16, 16, cache);
  assert.equal(after.computed, 2, `expected colorize + output only, got ${after.computed}`);
});

test('changing the size invalidates everything, because it has to', () => {
  const b = build();
  const n = b.add('noise'), out = b.add('output');
  b.wire(n, out, 0);
  const cache = new Map();
  evaluate(b.graph, out.id, 16, 16, cache);
  const bigger = evaluate(b.graph, out.id, 32, 32, cache);
  assert.equal(bigger.computed, 2);
  assert.equal(bigger.image.w, 32);
});

test('two different graphs never share a signature', () => {
  const b = build();
  const n = b.add('noise'), out = b.add('output');
  b.wire(n, out, 0);
  const before = signature(b.graph, out.id, 16, 16);
  n.params.seed = 999;
  const after = signature(b.graph, out.id, 16, 16);
  assert.ok(before !== after, 'a changed upstream parameter must change the downstream signature');
});

test('one evaluation yields an image for every node on the way', () => {
  const b = build();
  const n = b.add('noise'), bl = b.add('blur'), out = b.add('output');
  b.wire(n, bl, 0); b.wire(bl, out, 0);
  const { results } = evaluate(b.graph, out.id, 8, 8);
  // the editor draws a thumbnail on each node from this single pass
  for (const id of [n.id, bl.id, out.id]) {
    assert.ok(results.get(id), `no result for ${id}`);
    assert.equal(results.get(id).w, 8);
  }
});

/* ── saving ──────────────────────────────────────────────────────────────── */

test('a graph survives a round trip through a URL', () => {
  const b = build();
  const n = b.add('noise', { seed: 42, scale: 9 });
  const col = b.add('colorize', { palette: 'lagoon' });
  const out = b.add('output');
  n.x = 120.6; n.y = -40.2;
  b.wire(n, col, 0); b.wire(col, out, 0);

  const back = deserialize(JSON.parse(JSON.stringify(serialize(b.graph))));
  assert.equal(back.nodes.length, 3);
  assert.equal(back.links.length, 2);
  const rn = back.nodes.find((x) => x.type === 'noise');
  assert.equal(rn.params.seed, 42);
  assert.equal(rn.params.scale, 9);
  assert.equal(rn.x, 121, 'positions are rounded on the way out');
  assert.equal(back.nodes.find((x) => x.type === 'colorize').params.palette, 'lagoon');

  // and it still renders to the same pixels
  const a = evaluate(b.graph, out.id, 12, 12).image;
  const c = evaluate(back, out.id, 12, 12).image;
  for (let i = 0; i < a.r.length; i++) assert.close(c.r[i], a.r[i], 1e-9);
});

test('a saved graph fills in parameters added after it was saved', () => {
  // Old links keep working when a node type grows a new knob — the default
  // is supplied rather than the parameter arriving as undefined.
  const back = deserialize({ v: 1, n: [['n1', 'noise', 0, 0, { seed: 5 }]], l: [] });
  assert.equal(back.nodes[0].params.seed, 5);
  assert.equal(back.nodes[0].params.octaves, NODES.noise.params.find((p) => p.key === 'octaves').def);
});

test('rubbish in the URL is refused rather than half-loaded', () => {
  assert.throws(() => deserialize(null));
  assert.throws(() => deserialize({ v: 99, n: [] }));
  assert.throws(() => deserialize({ v: 1, n: [['n1', 'notarealnode', 0, 0, {}]], l: [] }));
});

test('a link to a node that did not survive the trip is dropped', () => {
  const back = deserialize({ v: 1, n: [['n1', 'output', 0, 0, {}]], l: [['ghost', 'n1', 0]] });
  assert.equal(back.links.length, 0);
});

test('ids minted after a load do not collide with the ones loaded', () => {
  const g = deserialize({ v: 1, n: [['n7', 'noise', 0, 0, {}]], l: [] });
  const fresh = makeNode('output');
  assert.ok(!g.nodes.some((n) => n.id === fresh.id), `${fresh.id} collided with a loaded id`);
});

test('an unknown node type is an error, not a silent skip', () => {
  assert.throws(() => makeNode('definitely-not-a-node'), 'should have thrown GraphError');
  try { makeNode('nope'); } catch (e) { assert.ok(e instanceof GraphError); }
});

/* ── output ──────────────────────────────────────────────────────────────── */

test('pixels handed to a canvas are clamped bytes, fully opaque', () => {
  const img = image(2, 1);
  img.r[0] = -3; img.g[0] = 0.5; img.b[0] = 9;     // deliberately out of range
  const rgba = toRGBA(img);
  assert.equal(rgba[0], 0, 'negative should clamp to 0');
  assert.equal(rgba[1], 128);
  assert.equal(rgba[2], 255, 'over-bright should clamp to 255');
  assert.equal(rgba[3], 255, 'alpha must be opaque');
  assert.equal(rgba.length, 2 * 1 * 4);
});

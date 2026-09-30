/* ───────────────────────────────────────────────────────────────────────────
   loom/presets.js — the graphs that come in the box.

   These are the answer to "what do I do with this?". A blank canvas with
   fifteen node types on it is a puzzle; a finished picture you can pull apart
   is an invitation. Every one of these was tuned by rendering it and looking
   at it, which is the only way this kind of thing can be tuned.

   Nodes are written as a flat list and wired by name. Positions are not
   written down at all — they are computed from the shape of the graph, so a
   preset can never load looking like spaghetti, and the editor gets a "tidy
   up" button out of the same function for free.
   ─────────────────────────────────────────────────────────────────────────── */

import { NODES } from './engine.js';

/**
 * Arrange a graph left to right: a node sits one column right of its
 * deepest input, and columns stack their nodes vertically without overlap.
 */
/* rowHeight has to clear a whole node (26px header + 8 + 108 thumbnail + 8 =
   150px) or stacked nodes in the same column overlap each other. */
export function autoLayout(nodes, links, { colWidth = 214, rowHeight = 172, padX = 40, padY = 30 } = {}) {
  const inputsOf = (id) => links.filter((l) => l.to === id).map((l) => l.from);
  const depth = new Map();
  const depthOf = (id, guard = new Set()) => {
    if (depth.has(id)) return depth.get(id);
    if (guard.has(id)) return 0;            // a cycle cannot happen, but never hang if it does
    guard.add(id);
    const ins = inputsOf(id);
    const d = ins.length ? Math.max(...ins.map((i) => depthOf(i, guard))) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) depthOf(n.id);

  const columns = new Map();
  for (const n of nodes) {
    const d = depth.get(n.id);
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d).push(n);
  }
  const tallest = Math.max(...[...columns.values()].map((c) => c.length));
  for (const [d, col] of columns) {
    // centre each column against the tallest one, so the graph reads as a
    // funnel narrowing towards the output rather than as a top-aligned staircase
    const offset = (tallest - col.length) * rowHeight / 2;
    col.forEach((n, i) => {
      n.x = padX + d * colWidth;
      n.y = padY + offset + i * rowHeight;
    });
  }
  return nodes;
}

/**
 * Build a serialized graph from a flat list of [type, params, ...inputIds].
 * Ids are assigned in order: the first entry is n1, the second n2, and so on.
 */
function graph(spec) {
  const nodes = spec.map(([type, params], i) => {
    if (!NODES[type]) throw new Error(`preset uses an unknown node type: ${type}`);
    return { id: `n${i + 1}`, type, x: 0, y: 0, params: params || {} };
  });
  const links = [];
  spec.forEach(([type, , ...ins], i) => {
    ins.forEach((from, port) => {
      if (from) links.push({ from, to: `n${i + 1}`, port });
    });
  });
  autoLayout(nodes, links);
  return {
    v: 1,
    n: nodes.map((n) => [n.id, n.type, n.x, n.y, n.params]),
    l: links.map((l) => [l.from, l.to, l.port]),
  };
}

export const PRESETS = [
  {
    name: 'Magma',
    blurb: 'A cloud of noise, hard contrast, and a palette that runs from black through violet to a hot white.',
    graph: graph([
      ['noise', { scale: 3.4, octaves: 6, seed: 21, contrast: 1 }],                  // n1
      ['noise', { scale: 8.5, octaves: 3, seed: 88, contrast: 1 }],                  // n2
      ['warp', { amount: 70, angle: 0 }, 'n1', 'n2'],                                // n3
      ['levels', { low: 0.32, high: 0.74, gamma: 1.5, clip: true }, 'n3'],           // n4
      ['colorize', { palette: 'ember', shift: 0, reverse: false }, 'n4'],            // n5
      ['glow', { threshold: 0.55, radius: 18, strength: 0.85 }, 'n5'],               // n6
      ['output', {}, 'n6'],                                                          // n7
    ]),
  },
  {
    name: 'Marble',
    blurb: 'Concentric rings shoved sideways by a noise field. The same trick that makes fake stone convincing.',
    graph: graph([
      ['rings', { count: 9, cx: 0.42, cy: 0.55, sharpness: 0.75 }],                  // n1
      ['noise', { scale: 2.6, octaves: 6, seed: 314, contrast: 1 }],                 // n2
      ['warp', { amount: 130, angle: 25 }, 'n1', 'n2'],                              // n3
      ['blur', { radius: 1.5, passes: 2 }, 'n3'],                                    // n4
      ['levels', { low: 0.12, high: 0.88, gamma: 0.85, clip: true }, 'n4'],          // n5
      ['colorize', { palette: 'sandstone', shift: 0, reverse: false }, 'n5'],        // n6
      ['output', {}, 'n6'],                                                          // n7
    ]),
  },
  {
    name: 'Reef',
    blurb: 'Scattered cells outlined against their neighbours, softened, then dropped into a lagoon palette.',
    graph: graph([
      ['cells', { points: 44, seed: 9, mode: 'edges' }],                             // n1
      ['noise', { scale: 6, octaves: 5, seed: 41, contrast: 1 }],                    // n2
      ['warp', { amount: 26, angle: 0 }, 'n1', 'n2'],                                // n3
      ['blend', { mode: 'screen', amount: 0.55 }, 'n3', 'n2'],                       // n4
      ['levels', { low: 0.08, high: 0.8, gamma: 1.2, clip: true }, 'n4'],            // n5
      ['colorize', { palette: 'lagoon', shift: 0, reverse: false }, 'n5'],           // n6
      ['glow', { threshold: 0.74, radius: 10, strength: 0.45 }, 'n6'],               // n7
      ['output', {}, 'n7'],                                                          // n8
    ]),
  },
  {
    name: 'Rose window',
    blurb: 'Noise folded back on itself six times. Symmetry does all the work — the input is completely random.',
    graph: graph([
      ['noise', { scale: 6.5, octaves: 5, seed: 57, contrast: 1.6 }],                // n1
      ['mirror', { mode: 'radial', segments: 8 }, 'n1'],                             // n2
      ['levels', { low: 0.18, high: 0.82, gamma: 1.15, clip: true }, 'n2'],          // n3
      ['posterize', { steps: 8, smooth: 0.1 }, 'n3'],                                // n4
      ['colorize', { palette: 'orchid', shift: 0.04, reverse: false }, 'n4'],        // n5
      ['glow', { threshold: 0.78, radius: 11, strength: 0.4 }, 'n5'],                // n6
      ['output', {}, 'n6'],                                                          // n7
    ]),
  },
  {
    name: 'Dunes',
    blurb: 'A gradient and a noise field argued into bands. Every stripe is one step of the posterize node.',
    graph: graph([
      ['gradient', { angle: 108, softness: 1 }],                                     // n1
      ['noise', { scale: 2.2, octaves: 5, seed: 5, contrast: 1 }],                   // n2
      ['blend', { mode: 'add', amount: 0.52 }, 'n1', 'n2'],                          // n3
      ['posterize', { steps: 11, smooth: 0.28 }, 'n3'],                              // n4
      ['blur', { radius: 1, passes: 1 }, 'n4'],                                      // n5
      ['colorize', { palette: 'dusk', shift: 0, reverse: false }, 'n5'],             // n6
      ['output', {}, 'n6'],                                                          // n7
    ]),
  },
  {
    name: 'Mosaic',
    blurb: 'The same scatter of points read twice — once for the tiles, once for the gaps between them — and then stuck back together.',
    graph: graph([
      ['cells', { points: 26, seed: 12, mode: 'flat' }],                             // n1
      ['cells', { points: 26, seed: 12, mode: 'edges' }],                            // n2
      ['posterize', { steps: 6, smooth: 0 }, 'n1'],                                  // n3
      ['solid', { level: 0.04, tint: 0, hue: 200 }],                                 // n4
      ['mask', { softness: 0.12, bias: 0.28 }, 'n3', 'n4', 'n2'],                    // n5
      ['colorize', { palette: 'lagoon', shift: 0.1, reverse: false }, 'n5'],         // n6
      ['glow', { threshold: 0.72, radius: 6, strength: 0.35 }, 'n6'],                // n7
      ['output', {}, 'n7'],                                                          // n8
    ]),
  },
];

/** The graph a blank canvas starts from — small enough to read in one look. */
export const STARTER = graph([
  ['noise', { scale: 4, octaves: 5, seed: 7, contrast: 1 }],
  ['colorize', { palette: 'bloom', shift: 0, reverse: false }, 'n1'],
  ['output', {}, 'n2'],
]);

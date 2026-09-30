/* tests/sweeper.test.mjs — every board can be finished by thinking.

   The promise is two promises. The generator only hands out boards a player
   can finish without guessing — checked by playing every one of them. And the
   reasoning that decides that is sound — checked on small boards against
   brute force: every arrangement of mines consistent with what a player can
   see is enumerated, and anything the solver calls safe has to be safe in
   all of them, not just in the one the board happens to have. */

import { test, assert } from './harness.mjs';
import {
  LEVELS, rng, neighbourTable, layMines, countsFor, deduce, flood, solvable, generate, Game, explain,
} from '../play/sweeper/engine.js';

test('mines are laid in the right number, and never under or beside the first click', () => {
  const r = rng(3);
  for (let k = 0; k < 200; k++) {
    const first = Math.floor(r() * 81);
    const m = layMines(9, 9, 10, first, r);
    assert.equal(m.reduce((a, b) => a + b, 0), 10);
    for (const j of [first, ...neighbourTable(9, 9)[first]]) assert.equal(m[j], 0);
  }
});

test('the first click always opens a space, not a single number', () => {
  for (let s = 1; s <= 40; s++) {
    const g = new Game({ ...LEVELS.medium, seed: s });
    const opened = g.reveal(g.idx(3, 11));
    assert.equal(g.counts[g.idx(3, 11)], 0);
    assert.ok(opened.length > 1, `seed ${s} opened ${opened.length}`);
  }
});

test('every board handed out can be finished without a guess', () => {
  for (const [name, L] of Object.entries(LEVELS)) {
    for (let s = 1; s <= (name === 'hard' ? 12 : 30); s++) {
      const first = (s * 37) % (L.w * L.h);
      const g = generate({ ...L, first, seed: s });
      assert.ok(g.guaranteed, `${name} seed ${s} gave up`);
      assert.ok(solvable(g.mines, L.w, L.h, first), `${name} seed ${s}`);
    }
  }
});

test('the famous 1-2-1 is read the way a player reads it', () => {
  /* Three hidden squares along a wall, with 1, 2, 1 beneath them: the mines
     are above the ones and the middle is safe. It takes two numbers at once
     to see it, which is exactly the rule that makes a board solvable. */
  const w = 3, h = 2;
  const mines = Uint8Array.from([1, 0, 1, 0, 0, 0]);
  const counts = countsFor(mines, w, h);
  assert.deep([...counts.slice(3)], [1, 2, 1]);
  const open = Uint8Array.from([0, 0, 0, 1, 1, 1]), known = new Uint8Array(6);
  let left = 2, safe = [];
  for (let k = 0; k < 6 && !safe.length; k++) {
    const step = deduce({ w, h, counts, open, known, minesLeft: left });
    assert.ok(step, 'stuck');
    for (const m of step.mines) { known[m] = 1; left--; }
    safe = step.safe;
  }
  assert.deep(safe, [1], 'the middle square is the safe one');
  /* It gets there having proved only the right-hand mine: once that one is
     known, the right-hand 1 is full, and that is enough. */
  assert.deep([...known.slice(0, 3)], [0, 0, 1]);
});

/* ── soundness, by brute force ────────────────────────────────────────────── */

function consistent(counts, open, w, h, total) {
  /* Every way to place `total` mines on the unopened squares that agrees
     with every open number. Small boards only: 2^16 at most. */
  const nb = neighbourTable(w, h);
  const closed = [];
  for (let i = 0; i < w * h; i++) if (!open[i]) closed.push(i);
  const out = [];
  for (let mask = 0; mask < 1 << closed.length; mask++) {
    let bits = 0;
    for (let m = mask; m; m &= m - 1) bits++;
    if (bits !== total) continue;
    const mines = new Uint8Array(w * h);
    closed.forEach((c, k) => { if (mask & (1 << k)) mines[c] = 1; });
    let ok = true;
    for (let i = 0; i < w * h && ok; i++) {
      if (open[i] && nb[i].reduce((s, j) => s + mines[j], 0) !== counts[i]) ok = false;
    }
    if (ok) out.push(mines);
  }
  return out;
}

test('nothing the solver calls safe could be a mine, in any arrangement the board allows', () => {
  const r = rng(11);
  let checked = 0;
  for (let k = 0; k < 250; k++) {
    const w = 4 + Math.floor(r() * 2), h = 4;
    const total = 2 + Math.floor(r() * 3);
    const nb = neighbourTable(w, h);
    const first = Math.floor(r() * w * h);
    const pool = [...Array(w * h).keys()].filter((i) => i !== first);
    const mines = new Uint8Array(w * h);
    for (let placed = 0; placed < total;) {
      const c = pool[Math.floor(r() * pool.length)];
      if (!mines[c]) { mines[c] = 1; placed++; }
    }
    const counts = countsFor(mines, w, h);
    const open = new Uint8Array(w * h), known = new Uint8Array(w * h);
    flood(first, { counts, open, known, mines, nb });
    /* Open a couple more safe squares at random, to vary what is visible. */
    for (let extra = 0; extra < 2; extra++) {
      const c = Math.floor(r() * w * h);
      if (!mines[c]) flood(c, { counts, open, known, mines, nb });
    }
    const worlds = consistent(counts, open, w, h, total);
    const step = deduce({ w, h, counts, open, known, minesLeft: total, nb });
    if (!step) continue;
    for (const s of step.safe) for (const world of worlds) assert.equal(world[s], 0, `called ${s} safe on ${w}×${h}`);
    for (const m of step.mines) for (const world of worlds) assert.equal(world[m], 1, `called ${m} a mine on ${w}×${h}`);
    checked++;
  }
  assert.ok(checked > 100, `only ${checked} deductions checked`);
});

/* ── the game ─────────────────────────────────────────────────────────────── */

function playOut(g) {
  /* A perfect player: open whatever the hint says until it is over. */
  for (let k = 0; k < g.n && g.status === 'playing'; k++) {
    const h = g.hint();
    assert.ok(h, 'a guaranteed board ran out of moves');
    for (const s of h.safe) g.reveal(s);
  }
}

test('following the hints alone wins every game', () => {
  for (let s = 1; s <= 25; s++) {
    const g = new Game({ ...LEVELS.medium, seed: s });
    g.reveal(g.idx(8, 8));
    playOut(g);
    assert.equal(g.status, 'won', `seed ${s}`);
  }
});

test('a hint always explains itself', () => {
  const g = new Game({ ...LEVELS.easy, seed: 5 });
  g.reveal(g.idx(4, 4));
  const h = g.hint();
  assert.ok(h.why.length > 20);
  assert.ok(!g.mines[h.cell], 'and it is right');
  assert.equal(g.hints, 1);
});

test('losing points out the safe move that was there', () => {
  let shown = 0;
  for (let s = 1; s <= 30; s++) {
    const g = new Game({ ...LEVELS.easy, seed: s });
    g.reveal(g.idx(4, 4));
    const mine = [...g.mines.keys()].find((i) => g.mines[i] && !g.open[i]);
    g.reveal(mine);
    assert.equal(g.status, 'lost');
    if (g.missed) { assert.ok(!g.mines[g.missed.cell]); shown++; }
  }
  assert.ok(shown > 25, `a safe move was shown in only ${shown} of 30`);
});

test('chording opens the neighbours when the flags add up, and not before', () => {
  const g = new Game({ ...LEVELS.easy, seed: 9 });
  g.reveal(g.idx(4, 4));
  const num = [...g.open.keys()].find((i) => g.open[i] && g.counts[i] > 0
    && g.nb[i].some((j) => !g.open[j] && !g.mines[j]));
  assert.ok(num !== undefined);
  assert.deep(g.chord(num), [], 'no flags yet, nothing happens');
  for (const j of g.nb[num]) if (g.mines[j]) g.flag(j);
  const opened = g.chord(num);
  assert.ok(opened.length > 0);
  assert.equal(g.status === 'lost', false);
});

test('winning flags every mine', () => {
  const g = new Game({ ...LEVELS.easy, seed: 2 });
  g.reveal(g.idx(0, 0));
  for (let i = 0; i < g.n; i++) if (!g.mines[i]) g.reveal(i);
  assert.equal(g.status, 'won');
  assert.equal(g.minesLeft, 0);
});

test('the reasons read like a person wrote them', () => {
  const counts = Uint8Array.from([0, 1, 2, 3]);
  assert.ok(/^The 2 already touches both of its mines/.test(explain({ rule: 'full', from: [2], safe: [9], mines: [] }, counts)));
  assert.ok(/^The 1 already touches its one mine,/.test(explain({ rule: 'full', from: [1], safe: [9], mines: [] }, counts)));
  assert.ok(/^The 3 already touches all three of its mines/.test(explain({ rule: 'full', from: [3], safe: [9], mines: [] }, counts)));
  assert.ok(/the 1 and the 3 together/.test(explain({ rule: 'pair', from: [1, 3], safe: [9], mines: [] }, counts)));
});

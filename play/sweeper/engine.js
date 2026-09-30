/* ───────────────────────────────────────────────────────────────────────────
   sweeper/engine.js — Minesweeper with the coin-flip taken out.

   Every Minesweeper ever shipped has the same flaw. Most of a board yields to
   reasoning, and then, twenty minutes in, you reach two squares that nothing
   on the board can tell apart, one of them is a mine, and the game is decided
   by a coin. Nobody enjoys that and nobody learns anything from it.

   THE FIX IS IN THE GENERATOR, not the rules. Mines are laid, and then a
   solver plays the board from your first click using only what a player can
   see and the reasoning a good player uses:

     • a number that already touches all its mines makes its other neighbours
       safe; one with exactly as many hidden neighbours as mines left makes
       them all mines;
     • two numbers that share squares constrain each other — whatever the
       shared squares hold, what is left over for each can be pinned down;
     • at the very end, the count of mines left settles the rest.

   If the solver cannot finish the board without guessing, the board is thrown
   away and another is laid. What you are given can always be finished by
   thinking — and so, when a game is lost, the page can point at the move you
   could have made instead, and say why it was safe.

   The first click is always an opening: no mine in it or next to it.

   No DOM here. A game is a state machine a test can play.
   ─────────────────────────────────────────────────────────────────────────── */

/** mulberry32 — the same seed lays the same board on every machine. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LEVELS = {
  easy:   { w: 9,  h: 9,  mines: 10, label: 'Easy' },
  medium: { w: 16, h: 16, mines: 40, label: 'Medium' },
  hard:   { w: 30, h: 16, mines: 99, label: 'Hard' },
};

/** Every neighbour of a cell, as indices. Precomputed once per board size. */
export function neighbourTable(w, h) {
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) n.push(yy * w + xx);
        }
      }
      out.push(n);
    }
  }
  return out;
}

/** Lay `count` mines, keeping the first click and its neighbours clear. */
export function layMines(w, h, count, first, random) {
  const nb = neighbourTable(w, h);
  const keepClear = new Set([first, ...nb[first]]);
  const pool = [];
  for (let i = 0; i < w * h; i++) if (!keepClear.has(i)) pool.push(i);
  if (count > pool.length) throw new RangeError('more mines than room for them');
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const mines = new Uint8Array(w * h);
  for (let i = 0; i < count; i++) mines[pool[i]] = 1;
  return mines;
}

export function countsFor(mines, w, h) {
  const nb = neighbourTable(w, h);
  return Uint8Array.from(nb, (n) => n.reduce((s, j) => s + mines[j], 0));
}

/* ── the reasoning ───────────────────────────────────────────────────────── */

/**
 * One deduction from what a player can see: the revealed squares and their
 * numbers, and the mines already proven. Returns the first thing it can
 * prove — { safe: [...], mines: [...], rule, from: [cells] } — or null.
 * It never looks at where the mines actually are.
 */
export function deduce({ w, h, counts, open, known, minesLeft, nb = neighbourTable(w, h) }) {
  const n = w * h;
  const hidden = (i) => !open[i] && !known[i];

  /* The constraints: every open number with hidden neighbours, as the set
     of those neighbours and how many mines are still among them. */
  const cons = [];
  for (let i = 0; i < n; i++) {
    if (!open[i] || !counts[i] && !nb[i].some(hidden)) continue;
    const cells = nb[i].filter(hidden);
    if (!cells.length) continue;
    const need = counts[i] - nb[i].filter((j) => known[j]).length;
    cons.push({ at: i, cells, need });
  }

  /* One number on its own. */
  for (const c of cons) {
    if (c.need === 0) return { safe: c.cells, mines: [], rule: 'full', from: [c.at] };
    if (c.need === c.cells.length) return { safe: [], mines: c.cells, rule: 'tight', from: [c.at] };
  }

  /* Two numbers that share squares. Whatever the shared squares hold lies
     between a floor and a ceiling; what that leaves for the squares only one
     of them touches can sometimes be pinned exactly. */
  const byCell = new Map();
  cons.forEach((c, k) => { for (const x of c.cells) (byCell.get(x) ?? byCell.set(x, []).get(x)).push(k); });
  for (let a = 0; a < cons.length; a++) {
    const A = cons[a];
    const partners = new Set();
    for (const x of A.cells) for (const k of byCell.get(x)) if (k !== a) partners.add(k);
    for (const b of partners) {
      const B = cons[b];
      const inA = new Set(A.cells);
      const inter = B.cells.filter((x) => inA.has(x));
      const onlyA = A.cells.filter((x) => !B.cells.includes(x));
      const onlyB = B.cells.filter((x) => !inA.has(x));
      if (!onlyB.length) continue;
      const lo = Math.max(0, A.need - onlyA.length, B.need - onlyB.length);
      const hi = Math.min(inter.length, A.need, B.need);
      if (B.need - lo === 0) return { safe: onlyB, mines: [], rule: 'pair', from: [A.at, B.at] };
      if (B.need - hi === onlyB.length) return { safe: [], mines: onlyB, rule: 'pair', from: [A.at, B.at] };
    }
  }

  /* The count of mines left, once the board is nearly done. */
  const rest = [];
  for (let i = 0; i < n; i++) if (hidden(i)) rest.push(i);
  if (rest.length && minesLeft === 0) return { safe: rest, mines: [], rule: 'count', from: [] };
  if (rest.length && minesLeft === rest.length) return { safe: [], mines: rest, rule: 'count', from: [] };
  return null;
}

/** Open a cell, and flood outward through zeros the way the game does. */
export function flood(i, { counts, open, known, mines, nb }) {
  const opened = [];
  const stack = [i];
  while (stack.length) {
    const j = stack.pop();
    if (open[j] || known[j] || mines?.[j]) continue;
    open[j] = 1;
    opened.push(j);
    if (counts[j] === 0) for (const k of nb[j]) if (!open[k]) stack.push(k);
  }
  return opened;
}

/**
 * Play a board from the first click by reasoning alone. True if every safe
 * square gets opened without a single guess.
 */
export function solvable(mines, w, h, first) {
  const nb = neighbourTable(w, h);
  const counts = countsFor(mines, w, h);
  const n = w * h;
  const open = new Uint8Array(n), known = new Uint8Array(n);
  let minesLeft = mines.reduce((a, b) => a + b, 0);
  const safeTotal = n - minesLeft;
  let opened = flood(first, { counts, open, known, mines, nb }).length;
  for (let guard = 0; guard < n * 4 && opened < safeTotal; guard++) {
    const step = deduce({ w, h, counts, open, known, minesLeft, nb });
    if (!step) return false;
    for (const m of step.mines) { if (!known[m]) { known[m] = 1; minesLeft--; } }
    for (const s of step.safe) opened += flood(s, { counts, open, known, mines, nb }).length;
  }
  return opened === safeTotal;
}

/**
 * Lay boards until one can be finished by thinking. Returns the mines and how
 * many boards were thrown away to find it. After `maxTries` it settles for the
 * last one and says so, rather than hang — which in practice never happens at
 * the three standard sizes.
 */
export function generate({ w, h, mines, first, seed = 1, noGuess = true, maxTries = 4000 }) {
  const random = rng(seed);
  let board = null;
  for (let t = 1; t <= maxTries; t++) {
    board = layMines(w, h, mines, first, random);
    if (!noGuess || solvable(board, w, h, first)) return { mines: board, tries: t, guaranteed: noGuess };
  }
  return { mines: board, tries: maxTries, guaranteed: false };
}

/* ── the game ────────────────────────────────────────────────────────────── */

export class Game {
  constructor({ w, h, mines, seed = (Math.random() * 2 ** 32) >>> 0, noGuess = true }) {
    Object.assign(this, { w, h, total: mines, seed, noGuess });
    this.n = w * h;
    this.nb = neighbourTable(w, h);
    this.open = new Uint8Array(this.n);
    this.flags = new Uint8Array(this.n);
    this.mines = null;              // laid on the first click
    this.counts = null;
    this.status = 'ready';
    this.hints = 0;
    this.lostAt = -1;
    this.tries = 0;
  }

  idx(x, y) { return y * this.w + x; }
  get flagsPlaced() { return this.flags.reduce((a, b) => a + b, 0); }
  get minesLeft() { return this.total - this.flagsPlaced; }

  /** Open a square. Returns the squares that opened. */
  reveal(i) {
    if (this.status === 'won' || this.status === 'lost' || this.open[i] || this.flags[i]) return [];
    if (!this.mines) {
      const g = generate({ w: this.w, h: this.h, mines: this.total, first: i, seed: this.seed, noGuess: this.noGuess });
      this.mines = g.mines;
      this.tries = g.tries;
      this.guaranteed = g.guaranteed;
      this.counts = countsFor(this.mines, this.w, this.h);
      this.status = 'playing';
    }
    if (this.mines[i]) {
      /* Before anything changes: was there a move that could be proved? */
      this.missed = this.hintFor(i);
      this.status = 'lost';
      this.lostAt = i;
      return [i];
    }
    const opened = flood(i, { counts: this.counts, open: this.open, known: this.flags, nb: this.nb });
    this.checkWin();
    return opened;
  }

  /** Right click, or a long press. */
  flag(i) {
    if (this.status !== 'playing' || this.open[i]) return false;
    this.flags[i] ^= 1;
    return true;
  }

  /**
   * Click an open number whose mines are all flagged, and every other
   * neighbour opens at once — the move that makes a fast game fast. A wrong
   * flag makes it open a mine, exactly as in the original.
   */
  chord(i) {
    if (this.status !== 'playing' || !this.open[i] || !this.counts[i]) return [];
    const around = this.nb[i];
    if (around.filter((j) => this.flags[j]).length !== this.counts[i]) return [];
    const opened = [];
    for (const j of around) {
      if (this.flags[j] || this.open[j]) continue;
      opened.push(...this.reveal(j));
      if (this.status === 'lost') break;
    }
    return opened;
  }

  checkWin() {
    let openCount = 0;
    for (let i = 0; i < this.n; i++) openCount += this.open[i];
    if (openCount === this.n - this.total) {
      this.status = 'won';
      for (let i = 0; i < this.n; i++) if (this.mines[i]) this.flags[i] = 1;
    }
  }

  /**
   * The next thing that can be proved from what is on the board, as a safe
   * square to open, with the reason in words and the numbers that give it
   * away. It reasons only from the open squares — never from the flags, which
   * might be wrong — and chains through mines it proves on the way.
   */
  hint() {
    if (this.status !== 'playing') return null;
    const h = this.hintFor(-1);
    if (h) this.hints++;
    return h;
  }

  hintFor(avoid) {
    const known = new Uint8Array(this.n);
    let minesLeft = this.total;
    const provenMines = [];
    for (let guard = 0; guard < this.n; guard++) {
      const step = deduce({ w: this.w, h: this.h, counts: this.counts, open: this.open, known, minesLeft, nb: this.nb });
      if (!step) return null;
      const safe = step.safe.filter((s) => !this.open[s] && s !== avoid);
      if (safe.length) {
        return { cell: safe[0], safe, rule: step.rule, from: step.from, mines: provenMines, why: explain(step, this.counts) };
      }
      for (const m of step.mines) { if (!known[m]) { known[m] = 1; minesLeft--; provenMines.push(m); } }
    }
    return null;
  }
}

/** Why a deduction holds, in words a player would use. */
export function explain(step, counts) {
  const num = (i) => `the ${counts[i]}`;
  if (step.rule === 'full') {
    const k = counts[step.from[0]];
    const words = ['', 'its one mine', 'both of its mines', 'all three of its mines', 'all four of its mines',
      'all five of its mines', 'all six of its mines', 'all seven of its mines', 'all eight of its mines'];
    return `${num(step.from[0]).replace(/^t/, 'T')} already touches ${words[k]}, so every other square around it is safe.`;
  }
  if (step.rule === 'tight') {
    return `${num(step.from[0]).replace(/^t/, 'T')} has exactly as many hidden squares left as mines, so they are all mines.`;
  }
  if (step.rule === 'pair') {
    const [a, b] = step.from;
    return `Look at ${num(a)} and ${num(b)} together. Whatever sits in the squares they share, the squares only ${num(b)} touches `
      + (step.safe.length ? 'cannot hold a mine.' : 'must all be mines.');
  }
  return step.safe.length ? 'Every mine is accounted for, so everything left is safe.'
    : 'The hidden squares left are exactly as many as the mines left.';
}

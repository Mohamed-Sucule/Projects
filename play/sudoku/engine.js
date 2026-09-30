/* ───────────────────────────────────────────────────────────────────────────
   sudoku/engine.js — puzzles with one answer, and a hint that says why.

   Two solvers live here, and they are for different things.

   THE FAST ONE is a backtracking search over bitmasks, always filling the
   square with the fewest options first. It never explains anything. Its job
   is to count: a puzzle is only a puzzle if it has exactly one solution, and
   the generator asks it that question after every clue it takes away.

   THE HUMAN ONE solves the way a person does, with named techniques, easiest
   first — a square with only one possible digit; a digit with only one
   possible square in a row, column or box; candidates locked into a line
   inside a box; pairs; the X-Wing. It never guesses. It is what grades a
   puzzle (a puzzle is as hard as the hardest technique it needs), what
   guarantees every puzzle here can be finished by reasoning, and what writes
   the hints — because a hint that just fills in a square teaches nothing,
   and one that says "this is the only place in the box a 7 can go" teaches
   the move.

   No DOM here. Grids are arrays of 81 numbers, 0 for empty.
   ─────────────────────────────────────────────────────────────────────────── */

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── geometry ────────────────────────────────────────────────────────────── */

export const rowOf = (i) => Math.floor(i / 9);
export const colOf = (i) => i % 9;
export const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/* The 27 units: nine rows, nine columns, nine boxes. */
export const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push({ kind: 'row', n: r, cells: Array.from({ length: 9 }, (_, c) => r * 9 + c) });
for (let c = 0; c < 9; c++) UNITS.push({ kind: 'column', n: c, cells: Array.from({ length: 9 }, (_, r) => r * 9 + c) });
for (let b = 0; b < 9; b++) {
  const r0 = Math.floor(b / 3) * 3, c0 = (b % 3) * 3;
  UNITS.push({ kind: 'box', n: b, cells: Array.from({ length: 9 }, (_, k) => (r0 + Math.floor(k / 3)) * 9 + c0 + (k % 3)) });
}
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  for (const u of UNITS) if (u.cells.includes(i)) for (const j of u.cells) if (j !== i) s.add(j);
  return [...s];
});

const ALL = 0b1111111110;                 // bits 1..9
const bit = (d) => 1 << d;
const count = (m) => { let c = 0; for (; m; m &= m - 1) c++; return c; };
const digits = (m) => { const out = []; for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d); return out; };

export function parse(str) {
  return [...str.replace(/\s/g, '')].map((ch) => (/[1-9]/.test(ch) ? Number(ch) : 0));
}
export const show = (grid) => grid.map((d) => d || '.').join('');

/** Every rule holds: no digit twice in any row, column or box. */
export function valid(grid) {
  for (const u of UNITS) {
    let seen = 0;
    for (const i of u.cells) {
      const d = grid[i];
      if (!d) continue;
      if (seen & bit(d)) return false;
      seen |= bit(d);
    }
  }
  return true;
}

/** Squares whose digit repeats in a row, column or box — for the red ink. */
export function conflicts(grid) {
  const out = new Set();
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    for (const j of PEERS[i]) if (grid[j] === grid[i]) { out.add(i); out.add(j); }
  }
  return out;
}

/* ── the fast solver ─────────────────────────────────────────────────────── */

/**
 * Backtracking search, fewest options first. Returns up to `limit`
 * solutions. With a `random`, the digits are tried in a shuffled order,
 * which is how a blank grid becomes a random finished one.
 */
export function solve(grid, { limit = 1, random = null } = {}) {
  const g = grid.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const d = g[i];
    if (!d) continue;
    const m = bit(d);
    if ((rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & m) return [];
    rows[rowOf(i)] |= m; cols[colOf(i)] |= m; boxes[boxOf(i)] |= m;
  }
  const out = [];
  const search = () => {
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      const c = count(m);
      if (c < bestCount) { best = i; bestMask = m; bestCount = c; if (c <= 1) break; }
    }
    if (best < 0) { out.push(g.slice()); return out.length >= limit; }
    if (!bestCount) return false;
    const ds = digits(bestMask);
    if (random) for (let k = ds.length - 1; k > 0; k--) { const j = Math.floor(random() * (k + 1)); [ds[k], ds[j]] = [ds[j], ds[k]]; }
    const r = rowOf(best), c = colOf(best), b = boxOf(best);
    for (const d of ds) {
      const m = bit(d);
      g[best] = d; rows[r] |= m; cols[c] |= m; boxes[b] |= m;
      if (search()) return true;
      g[best] = 0; rows[r] &= ~m; cols[c] &= ~m; boxes[b] &= ~m;
    }
    return false;
  };
  search();
  return out;
}

export const countSolutions = (grid, limit = 2) => solve(grid, { limit }).length;

/* ── the human solver ────────────────────────────────────────────────────── */

export const TECHNIQUES = ['naked single', 'hidden single', 'pointing', 'box-line', 'naked pair', 'hidden pair', 'naked triple', 'x-wing'];
/* `max` is the hardest technique a level may need; `clues` is how many
   givens it keeps at least. Difficulty is partly technique and partly how
   much of the grid you are given to work from — a singles-only puzzle with
   25 clues is technically easy and feels like being handed a blank page. */
export const LEVELS = {
  easy:   { label: 'Easy',   max: 1, clues: 34 },   // singles only
  medium: { label: 'Medium', max: 3, clues: 28 },   // plus locked candidates
  hard:   { label: 'Hard',   max: 7, clues: 0 },    // plus pairs, triples and the X-Wing
};

/** Candidates for every empty square, from the digits already placed. */
export function candidates(grid) {
  const cand = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    let m = ALL;
    for (const j of PEERS[i]) if (grid[j]) m &= ~bit(grid[j]);
    cand[i] = m;
  }
  return cand;
}

const unitName = (u) => (u.kind === 'box' ? `box ${u.n + 1}` : `${u.kind} ${u.n + 1}`);

/**
 * The easiest next step from a grid and its candidates: a placement
 * { cell, digit } or some eliminations { remove: [[cell, digit]…] }, with
 * the technique, the unit it happened in and the squares involved.
 */
export function nextStep(grid, cand) {
  /* A square with only one candidate. */
  for (let i = 0; i < 81; i++) {
    if (!grid[i] && count(cand[i]) === 1) return { technique: 0, cell: i, digit: digits(cand[i])[0], cells: [i] };
  }
  /* A digit with only one place to go in some unit. */
  for (const u of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const spots = u.cells.filter((i) => !grid[i] && cand[i] & bit(d));
      if (spots.length === 1 && !u.cells.some((i) => grid[i] === d)) {
        return { technique: 1, cell: spots[0], digit: d, unit: u, cells: u.cells };
      }
    }
  }
  const eliminate = (technique, pairs, extra) => {
    const remove = pairs.filter(([i, d]) => cand[i] & bit(d));
    return remove.length ? { technique, remove, ...extra } : null;
  };
  /* Pointing: inside a box, a digit confined to one row or column can be
     crossed out of the rest of that row or column. */
  for (const box of UNITS.filter((u) => u.kind === 'box')) {
    for (let d = 1; d <= 9; d++) {
      const spots = box.cells.filter((i) => !grid[i] && cand[i] & bit(d));
      if (spots.length < 2) continue;
      for (const kind of ['row', 'column']) {
        const of = kind === 'row' ? rowOf : colOf;
        if (spots.every((i) => of(i) === of(spots[0]))) {
          const line = UNITS.find((u) => u.kind === kind && u.n === of(spots[0]));
          const s = eliminate(2, line.cells.filter((i) => !box.cells.includes(i)).map((i) => [i, d]), { digit: d, unit: box, line, cells: spots });
          if (s) return s;
        }
      }
    }
  }
  /* Box-line: inside a row or column, a digit confined to one box can be
     crossed out of the rest of that box. */
  for (const line of UNITS.filter((u) => u.kind !== 'box')) {
    for (let d = 1; d <= 9; d++) {
      const spots = line.cells.filter((i) => !grid[i] && cand[i] & bit(d));
      if (spots.length < 2 || !spots.every((i) => boxOf(i) === boxOf(spots[0]))) continue;
      const box = UNITS[18 + boxOf(spots[0])];
      const s = eliminate(3, box.cells.filter((i) => !line.cells.includes(i)).map((i) => [i, d]), { digit: d, unit: line, line: box, cells: spots });
      if (s) return s;
    }
  }
  /* Naked pair: two squares in a unit with the same two candidates own
     those two digits; nobody else in the unit can have them. */
  for (const u of UNITS) {
    const two = u.cells.filter((i) => !grid[i] && count(cand[i]) === 2);
    for (let a = 0; a < two.length; a++) {
      for (let b = a + 1; b < two.length; b++) {
        if (cand[two[a]] !== cand[two[b]]) continue;
        const ds = digits(cand[two[a]]);
        const s = eliminate(4, u.cells.filter((i) => i !== two[a] && i !== two[b]).flatMap((i) => ds.map((d) => [i, d])),
          { unit: u, cells: [two[a], two[b]], digits: ds });
        if (s) return s;
      }
    }
  }
  /* Hidden pair: two digits that only fit in the same two squares of a
     unit; those squares can hold nothing else. */
  for (const u of UNITS) {
    const where = {};
    for (let d = 1; d <= 9; d++) where[d] = u.cells.filter((i) => !grid[i] && cand[i] & bit(d));
    for (let x = 1; x <= 9; x++) {
      for (let y = x + 1; y <= 9; y++) {
        if (where[x].length !== 2 || where[y].length !== 2 || where[x][0] !== where[y][0] || where[x][1] !== where[y][1]) continue;
        const cells = where[x];
        const s = eliminate(5, cells.flatMap((i) => digits(cand[i]).filter((d) => d !== x && d !== y).map((d) => [i, d])),
          { unit: u, cells, digits: [x, y] });
        if (s) return s;
      }
    }
  }
  /* Naked triple: three squares whose candidates together are three digits. */
  for (const u of UNITS) {
    const small = u.cells.filter((i) => !grid[i] && count(cand[i]) >= 2 && count(cand[i]) <= 3);
    for (let a = 0; a < small.length; a++) {
      for (let b = a + 1; b < small.length; b++) {
        for (let c = b + 1; c < small.length; c++) {
          const m = cand[small[a]] | cand[small[b]] | cand[small[c]];
          if (count(m) !== 3) continue;
          const trio = [small[a], small[b], small[c]], ds = digits(m);
          const s = eliminate(6, u.cells.filter((i) => !trio.includes(i)).flatMap((i) => ds.map((d) => [i, d])), { unit: u, cells: trio, digits: ds });
          if (s) return s;
        }
      }
    }
  }
  /* X-Wing: a digit that fits in exactly the same two columns of two rows
     must take one corner of that rectangle in each column — so the rest of
     both columns can lose it. And the same with rows and columns swapped. */
  for (const [kind, other] of [['row', 'column'], ['column', 'row']]) {
    const lines = UNITS.filter((u) => u.kind === kind);
    const across = kind === 'row' ? colOf : rowOf;
    for (let d = 1; d <= 9; d++) {
      const pos = lines.map((u) => u.cells.filter((i) => !grid[i] && cand[i] & bit(d)));
      for (let a = 0; a < 9; a++) {
        if (pos[a].length !== 2) continue;
        for (let b = a + 1; b < 9; b++) {
          if (pos[b].length !== 2) continue;
          const [p, q] = pos[a].map(across);
          if (pos[b].map(across).join() !== [p, q].join()) continue;
          const targets = UNITS.filter((u) => u.kind === other && (u.n === p || u.n === q));
          const keep = new Set([...pos[a], ...pos[b]]);
          const s = eliminate(7, targets.flatMap((u) => u.cells.filter((i) => !keep.has(i)).map((i) => [i, d])),
            { digit: d, cells: [...pos[a], ...pos[b]], lines: [lines[a], lines[b]] });
          if (s) return s;
        }
      }
    }
  }
  return null;
}

/**
 * Solve by reasoning alone, recording every step. Returns the grid as far as
 * logic took it, whether that was all the way, and the hardest technique it
 * needed — which is the puzzle's grade.
 */
export function logicSolve(puzzle, { maxTechnique = TECHNIQUES.length - 1 } = {}) {
  const grid = puzzle.slice();
  const cand = candidates(grid);
  let hardest = -1;
  const steps = [];
  for (let guard = 0; guard < 2000; guard++) {
    if (grid.every((d) => d)) break;
    const step = nextStep(grid, cand);
    if (!step || step.technique > maxTechnique) break;
    hardest = Math.max(hardest, step.technique);
    steps.push(step);
    if (step.cell !== undefined && step.digit && !step.remove) {
      grid[step.cell] = step.digit;
      cand[step.cell] = 0;
      for (const j of PEERS[step.cell]) cand[j] &= ~bit(step.digit);
    } else {
      for (const [i, d] of step.remove) cand[i] &= ~bit(d);
    }
  }
  return { grid, solved: grid.every((d) => d), hardest, steps };
}

/* ── making puzzles ──────────────────────────────────────────────────────── */

/**
 * A finished grid, emptied clue by clue — in symmetric pairs, the way a
 * printed puzzle looks — keeping each removal only if the puzzle still has
 * exactly one solution AND can still be finished by reasoning at this level.
 * A puzzle that comes out easier than asked for is thrown away and another
 * started, so "hard" is never an easy one in disguise.
 */
export function generate({ level = 'medium', seed = 1, maxTries = 200 } = {}) {
  const { max, clues: keepAtLeast } = LEVELS[level];
  const random = rng(seed);
  let last = null;
  for (let t = 1; t <= maxTries; t++) {
    const solution = solve(new Array(81).fill(0), { random })[0];
    const puzzle = solution.slice();
    const order = Array.from({ length: 41 }, (_, i) => i);
    for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(random() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
    for (const i of order) {
      if (puzzle.filter((d) => d).length - 2 < keepAtLeast) break;
      const pair = i === 40 ? [40] : [i, 80 - i];
      const keep = pair.map((p) => puzzle[p]);
      for (const p of pair) puzzle[p] = 0;
      const ok = countSolutions(puzzle, 2) === 1 && logicSolve(puzzle, { maxTechnique: max }).solved;
      if (!ok) pair.forEach((p, k) => { puzzle[p] = keep[k]; });
    }
    const graded = logicSolve(puzzle);
    last = { puzzle, solution, grade: graded.hardest, clues: puzzle.filter((d) => d).length, tries: t };
    const floor = level === 'easy' ? 0 : level === 'medium' ? 2 : 4;
    if (graded.hardest >= floor) return last;
  }
  return last;
}

/** The same puzzle for everybody on a given day, at each level. */
export function dayNumber(date = new Date()) {
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2026, 0, 1)) / 86400000) + 1;
}
export function daily(level, date = new Date()) {
  const salt = { easy: 11, medium: 23, hard: 37 }[level];
  return generate({ level, seed: dayNumber(date) * 1000 + salt });
}

/* ── hints ───────────────────────────────────────────────────────────────── */

const where = (i) => `row ${rowOf(i) + 1}, column ${colOf(i) + 1}`;

/**
 * What to do next, in words. A wrong digit on the board comes first — no
 * reasoning is any use on top of a mistake. Otherwise the next square that
 * reasoning can fill, and if it takes a crossing-out or two to get there,
 * those are said first, because they are the part worth learning.
 */
export function hint(grid, solution) {
  for (let i = 0; i < 81; i++) {
    if (grid[i] && grid[i] !== solution[i]) {
      return { kind: 'wrong', cell: i, cells: [i], text: `The ${grid[i]} at ${where(i)} is wrong. Clear it first — everything built on it will be too.` };
    }
  }
  const g = grid.slice();
  const cand = candidates(g);
  const before = [];
  for (let guard = 0; guard < 200; guard++) {
    const step = nextStep(g, cand);
    if (!step) return null;
    if (step.remove) {
      before.push(step);
      for (const [i, d] of step.remove) cand[i] &= ~bit(d);
      continue;
    }
    const lead = before.length ? `${before.map(describe).join(' ')} Then: ` : '';
    return { kind: 'place', cell: step.cell, digit: step.digit, cells: step.cells, technique: TECHNIQUES[step.technique], text: lead + describe(step) };
  }
  return null;
}

export function describe(step) {
  switch (step.technique) {
    case 0: return `Only a ${step.digit} fits at ${where(step.cell)} — its row, column and box already hold every other digit.`;
    case 1: return `In ${unitName(step.unit)}, the only square that can take a ${step.digit} is ${where(step.cell)}.`;
    case 2: return `In ${unitName(step.unit)} the ${step.digit}s can only be in ${unitName(step.line)}, so no other square of ${unitName(step.line)} can be a ${step.digit}.`;
    case 3: return `In ${unitName(step.unit)} the ${step.digit}s can only be in ${unitName(step.line)}, so the rest of ${unitName(step.line)} cannot have one.`;
    case 4: return `Two squares of ${unitName(step.unit)} can only be ${step.digits.join(' or ')}, so between them they take both — nothing else there can be a ${step.digits[0]} or a ${step.digits[1]}.`;
    case 5: return `In ${unitName(step.unit)} the ${step.digits[0]} and the ${step.digits[1]} fit only in the same two squares, so those two squares can hold nothing else.`;
    case 6: return `Three squares of ${unitName(step.unit)} share just ${step.digits.join(', ')} between them, so those digits are theirs.`;
    case 7: return `X-Wing: the ${step.digit}s in ${unitName(step.lines[0])} and ${unitName(step.lines[1])} sit in the same two lines across, so those lines lose every other ${step.digit}.`;
    default: return '';
  }
}

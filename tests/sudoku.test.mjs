/* tests/sudoku.test.mjs — one answer, reached by reasoning, and hints that
   are never wrong.

   The fast solver is checked against a published puzzle and its published
   answer. The generator is checked for the three things that make a puzzle
   fair: exactly one solution, solvable by the techniques its level allows
   without a single guess, and genuinely as hard as its label. And every step
   the human solver takes — every digit it places and every candidate it
   crosses out — is checked against the known answer, so no technique can be
   quietly unsound. */

import { test, assert } from './harness.mjs';
import {
  parse, show, solve, countSolutions, valid, conflicts, candidates, nextStep, logicSolve,
  generate, daily, dayNumber, hint, LEVELS, TECHNIQUES, UNITS, PEERS,
} from '../play/sudoku/engine.js';

const WIKI = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const WIKI_ANSWER = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

test('the geometry: 27 units, 20 peers each', () => {
  assert.equal(UNITS.length, 27);
  for (const p of PEERS) assert.equal(p.length, 20);
});

test('the published puzzle gets the published answer', () => {
  assert.equal(show(solve(parse(WIKI))[0]), WIKI_ANSWER);
  assert.equal(countSolutions(parse(WIKI)), 1);
});

test('a blank grid has many answers; a broken one has none', () => {
  assert.equal(countSolutions(new Array(81).fill(0), 2), 2);
  const broken = parse(WIKI);
  broken[2] = 5;                                        // a second 5 in the top row
  assert.ok(!valid(broken));
  assert.equal(countSolutions(broken, 2), 0);
  assert.ok(conflicts(broken).has(0) && conflicts(broken).has(2));
});

test('candidates are exactly the digits no peer already holds', () => {
  const g = parse(WIKI);
  const c = candidates(g);
  const has = (i, d) => (c[i] >> d) & 1;
  assert.ok(has(2, 1) && has(2, 2) && has(2, 4));      // row 1, column 3 can be 1, 2 or 4
  assert.ok(!has(2, 5) && !has(2, 3) && !has(2, 9));
});

/* ── making puzzles ───────────────────────────────────────────────────────── */

const made = [];
for (const level of Object.keys(LEVELS)) for (let s = 1; s <= 6; s++) made.push({ level, ...generate({ level, seed: s * 97 }) });

test('every puzzle has exactly one solution, and it is the one it was made from', () => {
  for (const m of made) {
    assert.equal(countSolutions(m.puzzle, 2), 1, `${m.level} has more than one answer`);
    assert.equal(show(solve(m.puzzle)[0]), show(m.solution));
    assert.ok(m.puzzle.every((d, i) => !d || d === m.solution[i]), 'every given agrees with the answer');
  }
});

test('every puzzle can be finished by reasoning alone, at its own level', () => {
  for (const m of made) {
    const r = logicSolve(m.puzzle, { maxTechnique: LEVELS[m.level].max });
    assert.ok(r.solved, `${m.level} puzzle needed more than its level allows`);
    assert.equal(show(r.grid), show(m.solution));
  }
});

test('a hard puzzle is really hard, and an easy one really easy', () => {
  for (const m of made) {
    if (m.level === 'easy') assert.ok(m.grade <= 1, `an easy one needed ${TECHNIQUES[m.grade]}`);
    if (m.level === 'medium') assert.ok(m.grade >= 2 && m.grade <= 3, `a medium one needed ${TECHNIQUES[m.grade]}`);
    if (m.level === 'hard') assert.ok(m.grade >= 4, `a hard one only needed ${TECHNIQUES[m.grade]}`);
  }
});

test('easy puzzles give you enough to start from', () => {
  for (const m of made.filter((x) => x.level === 'easy')) assert.ok(m.clues >= LEVELS.easy.clues, `${m.clues} clues`);
});

test('printed-puzzle symmetry: the clues mirror through the centre', () => {
  for (const m of made) for (let i = 0; i < 81; i++) assert.equal(!!m.puzzle[i], !!m.puzzle[80 - i]);
});

test('no step of the human solver is ever wrong', () => {
  /* The check that keeps every technique honest: each placement is the true
     digit, and no crossing-out ever removes the true digit. */
  let placed = 0, crossed = 0;
  for (const m of made) {
    for (const step of logicSolve(m.puzzle).steps) {
      if (step.remove) {
        for (const [i, d] of step.remove) { assert.ok(m.solution[i] !== d, `${TECHNIQUES[step.technique]} crossed out the answer`); crossed++; }
      } else {
        assert.equal(step.digit, m.solution[step.cell], `${TECHNIQUES[step.technique]} placed a wrong digit`);
        placed++;
      }
    }
  }
  assert.ok(placed > 500 && crossed > 20, `only ${placed} placements and ${crossed} eliminations checked`);
});

test('every technique turns up somewhere', () => {
  const used = new Set();
  for (const m of made) for (const s of logicSolve(m.puzzle).steps) used.add(s.technique);
  for (let s = 1; used.size < TECHNIQUES.length && s < 400; s++) {
    for (const st of logicSolve(generate({ level: 'hard', seed: 5000 + s }).puzzle).steps) used.add(st.technique);
  }
  for (let t = 0; t < TECHNIQUES.length; t++) assert.ok(used.has(t), `${TECHNIQUES[t]} never used`);
});

test('the daily puzzle is the same for everybody, and different tomorrow', () => {
  const d = new Date(2026, 8, 25);
  assert.equal(show(daily('medium', d).puzzle), show(daily('medium', d).puzzle));
  assert.ok(show(daily('medium', d).puzzle) !== show(daily('medium', new Date(2026, 8, 26)).puzzle));
  assert.equal(dayNumber(new Date(2026, 0, 1)), 1);
});

/* ── hints ────────────────────────────────────────────────────────────────── */

test('a hint places the right digit and says why', () => {
  for (const m of made) {
    const h = hint(m.puzzle, m.solution);
    assert.equal(h.kind, 'place');
    assert.equal(h.digit, m.solution[h.cell]);
    assert.ok(h.text.includes(String(h.digit)), h.text);
  }
});

test('a wrong digit is pointed out before anything else', () => {
  const m = made[0];
  const g = m.puzzle.slice();
  const i = g.findIndex((d) => !d);
  g[i] = (m.solution[i] % 9) + 1;
  const h = hint(g, m.solution);
  assert.equal(h.kind, 'wrong');
  assert.equal(h.cell, i);
});

test('following the hints alone finishes every puzzle', () => {
  for (const m of made) {
    const g = m.puzzle.slice();
    for (let k = 0; k < 81 && g.some((d) => !d); k++) {
      const h = hint(g, m.solution);
      assert.ok(h && h.kind === 'place', 'a hint ran dry');
      g[h.cell] = h.digit;
    }
    assert.equal(show(g), show(m.solution));
  }
});

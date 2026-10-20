import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cellName } from '../../src/engine/address';
import { evaluate, finish, references } from '../../src/engine/evaluate';
import { parse } from '../../src/engine/parser';
import type { Source } from '../../src/engine/range';
import { Sheet, literal } from '../../src/engine/sheet';
import { err, type Scalar } from '../../src/engine/values';
import { code, set, sheetOf, val } from './helpers';

describe('recalculation', () => {
  it('follows a chain, a diamond and a range', () => {
    const s = sheetOf({
      A1: '1',
      A2: '=A1+1',
      A3: '=A2+1',
      B1: '=A1*10',
      B2: '=A3+B1',
      C1: '=SUM(A1:A3)',
    });
    expect(val(s, 'B2')).toBe(13);
    expect(val(s, 'C1')).toBe(6);
    set(s, 'A1', '5');
    expect(val(s, 'A3')).toBe(7);
    expect(val(s, 'B2')).toBe(57);
    expect(val(s, 'C1')).toBe(18);
  });

  it('only works out what is downstream of a change', () => {
    const cells: Record<string, string> = { A1: '1', B1: '2' };
    for (let r = 2; r <= 500; r++) {
      cells[`A${r}`] = `=A${r - 1}+1`;
      cells[`B${r}`] = `=B${r - 1}+1`;
    }
    const s = sheetOf(cells);
    set(s, 'A1', '10');
    expect(s.last.evaluated).toBe(499);
    expect(val(s, 'A500')).toBe(509);
    expect(val(s, 'B500')).toBe(501);
  });

  it('sees a change anywhere in a whole-column range', () => {
    const s = sheetOf({ B1: '=SUM(A:A)', C1: '=COUNT(A:A)' });
    expect(val(s, 'B1')).toBe(0);
    set(s, 'A1048576', '7');
    set(s, 'A3', '3');
    expect(val(s, 'B1')).toBe(10);
    expect(val(s, 'C1')).toBe(2);
    set(s, 'A3', null);
    expect(val(s, 'B1')).toBe(7);
  });

  it('marks every cell in a loop as #CYCLE!, and recovers when the loop is broken', () => {
    const s = sheetOf({ A1: '=C1+1', B1: '=A1+1', C1: '=B1+1', D1: '=C1*2', E1: '=E1' });
    for (const c of ['A1', 'B1', 'C1', 'E1']) expect(code(val(s, c))).toBe('#CYCLE!');
    expect(code(val(s, 'D1'))).toBe('#CYCLE!'); // downstream of the loop, the error flows on
    set(s, 'C1', '1');
    expect(val(s, 'A1')).toBe(2);
    expect(val(s, 'B1')).toBe(3);
    expect(val(s, 'D1')).toBe(2);
  });

  it('works out RAND and NOW again on every change, and nothing else', () => {
    const s = sheetOf({ A1: '=RAND()', B1: '=A1*0+1', C1: '5' });
    const first = val(s, 'A1');
    set(s, 'C1', '6');
    expect(val(s, 'A1')).not.toBe(first);
    expect(s.last.evaluated).toBe(2);
  });

  it('shares one parsed tree between filled-down formulas', () => {
    const s = new Sheet();
    s.load(
      Array.from({ length: 1000 }, (_, r) => [r, 1, `=A${r + 1}*2`] as [number, number, string]),
    );
    const trees = new Set(Array.from({ length: 1000 }, (_, r) => s.cell(r, 1)!.formula!.node));
    expect(trees.size).toBe(1);
  });

  it('recalculates a 100,000-formula chain without overflowing the stack', () => {
    const s = new Sheet();
    const cells: [number, number, string][] = [[0, 0, '1']];
    for (let r = 1; r < 100_000; r++) cells.push([r, 0, `=A${r}+1`]);
    s.load(cells);
    expect(s.value(99_999, 0)).toBe(100_000);
    s.apply([{ row: 0, col: 0, input: '2' }]);
    expect(s.value(99_999, 0)).toBe(100_001);
  });

  it('undoes any sequence of edits exactly', () => {
    const grid = fc.constantFrom(...['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
    const input = fc.oneof(
      fc.integer({ min: -9, max: 9 }).map(String),
      fc.constantFrom('', 'hello', '12%', '£3.50', '2025-03-14', 'TRUE', "'007"),
      fc.tuple(grid, grid).map(([a, b]) => `=${a}+${b}`),
      fc.tuple(grid, grid).map(([a, b]) => `=SUM(${a}:${b})`),
    );
    fc.assert(
      fc.property(fc.array(fc.tuple(grid, input), { maxLength: 25 }), (edits) => {
        const s = sheetOf({ A1: '1', B2: '=A1*2' });
        const before = [...s.dump()];
        const undo = edits.map(([cell, text]) => set(s, cell, text));
        for (const back of undo.reverse()) s.apply(back);
        expect([...s.dump()]).toEqual(before);
      }),
      { numRuns: 200 },
    );
  });
});

/* The oracle: an evaluator that knows nothing of the dependency graph or of evaluation order.
   It works each cell out on demand, recursively, and finds loops by brute force: a cell is
   in a loop if it can reach itself through what it reads. */
function oracle(inputs: Map<string, string>, rows: number, cols: number) {
  const name = (r: number, c: number) => cellName(r, c);
  const reads = new Map<string, string[]>();
  for (const [n, text] of inputs) {
    if (!text.startsWith('=')) continue;
    const r = Number(/\d+/.exec(n)![0]) - 1;
    const c = n.charCodeAt(0) - 65;
    const out: string[] = [];
    try {
      for (const [r1, c1, r2, c2] of references(parse(text.slice(1), r, c), r, c)) {
        for (let i = r1; i <= Math.min(r2, rows - 1); i++) {
          for (let j = c1; j <= Math.min(c2, cols - 1); j++) out.push(name(i, j));
        }
      }
    } catch {
      /* a formula that does not parse reads nothing */
    }
    reads.set(n, out);
  }
  const reaches = (from: string, to: string) => {
    const seen = new Set<string>();
    const stack = [...(reads.get(from) ?? [])];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === to) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(reads.get(x) ?? []));
    }
    return false;
  };
  const memo = new Map<string, Scalar>();
  const value = (r: number, c: number): Scalar => {
    const n = name(r, c);
    if (memo.has(n)) return memo.get(n)!;
    const text = inputs.get(n);
    let v: Scalar;
    if (text === undefined) v = null;
    else if (!text.startsWith('=') || text.length === 1) v = literal(text).value;
    else if (reaches(n, n)) v = err('#CYCLE!');
    else {
      try {
        v = finish(
          evaluate(parse(text.slice(1), r, c), { src, row: r, col: c, now: 0, random: () => 0 }),
        );
      } catch {
        v = err('#ERROR!');
      }
    }
    memo.set(n, v);
    return v;
  };
  const src: Source = {
    value: (r, c) => (r < rows && c < cols ? value(r, c) : null),
    each(r1, c1, r2, c2, visit) {
      for (let c = c1; c <= Math.min(c2, cols - 1); c++) {
        for (let r = r1; r <= Math.min(r2, rows - 1); r++) {
          const v = value(r, c);
          if (v !== null) visit(v, r, c);
        }
      }
    },
    rowsIn(c, r1, r2) {
      const out: number[] = [];
      for (let r = r1; r <= Math.min(r2, rows - 1); r++) if (value(r, c) !== null) out.push(r);
      return out;
    },
  };
  return value;
}

describe('incremental recalculation against an oracle', () => {
  const ROWS = 4;
  const COLS = 4;
  const names = Array.from({ length: ROWS * COLS }, (_, i) =>
    cellName(Math.floor(i / COLS), i % COLS),
  );
  const ref = fc.constantFrom(...names);
  const leaf = fc.oneof(fc.integer({ min: -5, max: 5 }).map(String), ref);
  const expr = fc.letrec<{ e: string }>((tie) => ({
    e: fc.oneof(
      { depthSize: 'small' },
      leaf,
      fc
        .tuple(tie('e'), fc.constantFrom('+', '-', '*', '/', '&', '>'), tie('e'))
        .map(([a, op, b]) => `(${a}${op}${b})`),
      fc.tuple(ref, ref).map(([a, b]) => `SUM(${a}:${b})`),
      fc.tuple(ref, ref).map(([a, b]) => `COUNT(${a}:${b})`),
      fc.tuple(tie('e'), tie('e'), tie('e')).map(([a, b, c]) => `IF(${a}>0,${b},${c})`),
      fc.tuple(tie('e')).map(([a]) => `IFERROR(${a},-1)`),
    ),
  })).e;
  const input = fc.oneof(
    fc.integer({ min: -9, max: 9 }).map(String),
    fc.constant(''),
    expr.map((e) => `=${e}`),
  );

  it('gives the same value for every cell after any sequence of edits', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(ref, input), { minLength: 1, maxLength: 30 }), (edits) => {
        const s = new Sheet();
        const inputs = new Map<string, string>();
        for (const [cell, text] of edits) {
          set(s, cell, text);
          if (text === '') inputs.delete(cell);
          else inputs.set(cell, text);
        }
        const expected = oracle(inputs, ROWS, COLS);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) expect(code(s.value(r, c))).toEqual(code(expected(r, c)));
        }
      }),
      { numRuns: 1500 },
    );
  });
});

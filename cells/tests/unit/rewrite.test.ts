import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cellName } from '../../src/engine/address';
import {
  remap,
  rowsChanged,
  colsChanged,
  deletion,
  insertion,
  shift,
} from '../../src/engine/rewrite';
import { inverseOf, type Structure } from '../../src/engine/sheet';
import { MAX_COLS, MAX_ROWS } from '../../src/engine/values';
import { at, code, set, sheetOf, val } from './helpers';

const input = (s: ReturnType<typeof sheetOf>, name: string) =>
  s.editText(at(name).row, at(name).col);

describe('copying a formula', () => {
  it('moves relative references and keeps anchored ones', () => {
    expect(shift('A1+$B$2+$C3+D$4', 2, 1)).toBe('B3+$B$2+$C5+E$4');
    expect(shift('SUM(A1:B2)*2', 1, 0)).toBe('SUM(A2:B3)*2');
    expect(shift('SUM(A:A)', 5, 2)).toBe('SUM(C:C)');
    expect(shift('SUM(1:1)', 5, 2)).toBe('SUM(6:6)');
  });

  it('keeps the spacing, case and strings it was typed with', () => {
    expect(shift('sum( a1 , "A1" ) +  b2', 1, 0)).toBe('sum( A2 , "A1" ) +  B3');
  });

  it('turns a reference pushed off the sheet into #REF!', () => {
    expect(shift('A1+1', -1, 0)).toBe('#REF!+1');
    expect(shift('SUM(A1:A3)', 0, -1)).toBe('SUM(#REF!)');
  });

  it('comes back to where it started', () => {
    const ref = fc
      .tuple(
        fc.integer({ min: 20, max: 80 }),
        fc.integer({ min: 20, max: 80 }),
        fc.boolean(),
        fc.boolean(),
      )
      .map(
        ([r, c, ra, ca]) =>
          `${ca ? '$' : ''}${cellName(r, c).replace(/\d+$/, '')}${ra ? '$' : ''}${r + 1}`,
      );
    fc.assert(
      fc.property(
        fc.array(ref, { minLength: 1, maxLength: 5 }),
        fc.integer({ min: -19, max: 19 }),
        fc.integer({ min: -19, max: 19 }),
        (refs, dr, dc) => {
          const body = `SUM(${refs.join(',')})+${refs[0]}`;
          expect(shift(shift(body, dr, dc), -dr, -dc)).toBe(body);
        },
      ),
    );
  });
});

describe('inserting and deleting rows and columns', () => {
  it('moves references below an inserted row, and stretches ranges it falls inside', () => {
    const m = rowsChanged(insertion(4, 2, MAX_ROWS)); // two rows before row 5
    expect(remap('A4+A5+$A$9', m)).toBe('A4+A7+$A$11');
    expect(remap('SUM(A2:A8)', m)).toBe('SUM(A2:A10)');
    expect(remap('SUM(A5:A8)', m)).toBe('SUM(A7:A10)');
    expect(remap('SUM(B:B)', m)).toBe('SUM(B:B)');
  });

  it('shrinks ranges a deletion cuts into, and turns deleted cells into #REF!', () => {
    const m = rowsChanged(deletion(4, 2)); // rows 5 and 6
    expect(remap('A4+A5+A7', m)).toBe('A4+#REF!+A5');
    expect(remap('SUM(A2:A8)', m)).toBe('SUM(A2:A6)');
    expect(remap('SUM(A5:A6)', m)).toBe('SUM(#REF!)');
    expect(remap('SUM(5:9)', m)).toBe('SUM(5:7)');
  });

  it('does the same for columns', () => {
    const m = colsChanged(deletion(1, 1)); // column B
    expect(remap('A1+B1+C1', m)).toBe('A1+#REF!+B1');
    expect(remap('SUM(A:C)', m)).toBe('SUM(A:B)');
    expect(remap('SUM(1:1)', m)).toBe('SUM(1:1)');
  });

  it('keeps a sheet working through an insert and a delete', () => {
    const s = sheetOf({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)', B2: '=A3*10', C1: '=B2' });
    s.restructure({ kind: 'insertRows', at: 1, count: 1 });
    expect(input(s, 'B1')).toBe('=SUM(A1:A4)');
    expect(input(s, 'B3')).toBe('=A4*10');
    expect(input(s, 'C1')).toBe('=B3');
    expect(val(s, 'C1')).toBe(30);
    set(s, 'A2', '100');
    expect(val(s, 'B1')).toBe(106);
    s.restructure({ kind: 'deleteRows', at: 3, count: 1 }); // the row holding 3
    expect(code(val(s, 'B3'))).toBe('#REF!');
    expect(val(s, 'B1')).toBe(103);
  });

  it('puts everything back when undone, whatever was inserted or deleted', () => {
    const op = fc.record({
      kind: fc.constantFrom('insertRows', 'deleteRows', 'insertCols', 'deleteCols' as const),
      at: fc.integer({ min: 0, max: 5 }),
      count: fc.integer({ min: 1, max: 3 }),
    }) as fc.Arbitrary<Structure>;
    fc.assert(
      fc.property(op, (s0) => {
        const s = sheetOf({
          A1: '1',
          B2: '=A1+C3',
          C3: '=SUM(A1:B2)',
          D4: '=SUM(A:A)+SUM(2:2)',
          E5: 'note',
          F6: '=E5&B2',
          B6: '=$A$1*2',
        });
        const before = [...s.dump()];
        const restore = s.restructure(s0);
        s.restructure(inverseOf(s0));
        s.apply(restore);
        expect([...s.dump()]).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });

  it('carries column widths with their columns', () => {
    const s = sheetOf({});
    s.widths.set(3, 200);
    s.restructure({ kind: 'insertCols', at: 1, count: 2 });
    expect(s.widths.get(5)).toBe(200);
    s.restructure({ kind: 'deleteCols', at: 5, count: 1 });
    expect(s.widths.has(5)).toBe(false);
  });

  it('drops nothing off the edge of a sheet that is not full', () => {
    const m = colsChanged(insertion(0, 1, MAX_COLS));
    expect(remap('XFC1', m)).toBe('XFD1');
    expect(remap('XFD1', m)).toBe('#REF!');
  });
});

describe('cut and paste', () => {
  it('moves cells, and formulas everywhere follow them', () => {
    const s = sheetOf({ A1: '5', A2: '=A1*2', C1: '=A1+A2', D1: '=SUM(A1:A2)' });
    s.move({ r1: 0, c1: 0, r2: 1, c2: 0 }, 0, 1); // A1:A2 to B1:B2
    expect(input(s, 'B2')).toBe('=B1*2');
    expect(input(s, 'C1')).toBe('=B1+B2');
    expect(input(s, 'D1')).toBe('=SUM(B1:B2)');
    expect(val(s, 'C1')).toBe(15);
    expect(s.cell(0, 0)).toBeUndefined();
  });

  it('turns references to the cells it lands on into #REF!, and undoes cleanly', () => {
    const s = sheetOf({ A1: '1', B1: '2', C1: '=B1' });
    const before = [...s.dump()];
    const undo = s.move({ r1: 0, c1: 0, r2: 0, c2: 0 }, 0, 1); // A1 onto B1
    expect(input(s, 'C1')).toBe('=#REF!');
    s.apply(undo);
    expect([...s.dump()]).toEqual(before);
  });
});

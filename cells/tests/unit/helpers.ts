import { parseCellName } from '../../src/engine/address';
import { Sheet } from '../../src/engine/sheet';
import type { Scalar } from '../../src/engine/values';

/** A sheet from { A1: '1', B1: '=A1*2' }, with a fixed clock and random numbers. */
export function sheetOf(cells: Record<string, string> = {}): Sheet {
  const s = new Sheet();
  s.clock = () => new Date(2025, 2, 14, 12, 0, 0);
  let seed = 1;
  s.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  s.apply(Object.entries(cells).map(([name, input]) => ({ ...at(name), input })));
  return s;
}

export function at(name: string) {
  const c = parseCellName(name);
  if (!c) throw new Error(`not a cell: ${name}`);
  return { row: c.row, col: c.col };
}

export function set(s: Sheet, name: string, input: string | null) {
  return s.apply([{ ...at(name), input }]);
}

export function val(s: Sheet, name: string): Scalar {
  const { row, col } = at(name);
  return s.value(row, col);
}

/** The value of one formula, typed into a fresh sheet's Z1 next to some cells. */
export function calc(formula: string, cells: Record<string, string> = {}): Scalar {
  const s = sheetOf({ ...cells, Z1: formula });
  return val(s, 'Z1');
}

export const code = (v: Scalar) => (typeof v === 'object' && v !== null ? v.code : v);

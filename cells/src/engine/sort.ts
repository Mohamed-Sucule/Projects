/* Sorting the rows of a selection by one of its columns. Rows move as wholes, with their
   formats; formulas in them move like a copy and paste, so a total at the end of a row still
   adds up its own row. Empty cells sort last either way, as in Excel, and equal values keep
   their order (the sort is stable). */

import type { Rect } from './address';
import { shift } from './rewrite';
import type { Change, Sheet } from './sheet';
import { compare, isError } from './values';

/** Whether the first row looks like headings: all text, above a row that has a number. */
export function hasHeader(sheet: Sheet, rect: Rect): boolean {
  if (rect.r2 <= rect.r1) return false;
  let text = 0;
  let numbers = 0;
  for (let c = rect.c1; c <= rect.c2; c++) {
    const top = sheet.value(rect.r1, c);
    if (top !== null && typeof top !== 'string') return false;
    if (typeof top === 'string') text++;
    if (typeof sheet.value(rect.r1 + 1, c) === 'number') numbers++;
  }
  return text > 0 && (numbers > 0 || !!sheet.cell(rect.r1, rect.c1)?.format?.bold);
}

export function sortRows(
  sheet: Sheet,
  rect: Rect,
  byCol: number,
  descending: boolean,
  header: boolean,
): Change[] {
  const first = rect.r1 + (header ? 1 : 0);
  const rows: number[] = [];
  for (let r = first; r <= rect.r2; r++) rows.push(r);
  const rank = (v: ReturnType<Sheet['value']>) => (v === null || v === '' ? 2 : isError(v) ? 1 : 0);
  rows.sort((a, b) => {
    const x = sheet.value(a, byCol);
    const y = sheet.value(b, byCol);
    const ra = rank(x);
    const rb = rank(y);
    if (ra || rb) return ra - rb || a - b;
    const d = compare(x, y);
    return (descending ? -d : d) || a - b;
  });
  const changes: Change[] = [];
  rows.forEach((from, i) => {
    const to = first + i;
    if (from === to) return;
    for (let c = rect.c1; c <= rect.c2; c++) {
      const input = sheet.snapshot(from, c);
      const moved = input?.startsWith('=') ? `=${shift(input.slice(1), to - from, 0)}` : input;
      changes.push({ row: to, col: c, input: moved, format: sheet.cell(from, c)?.format ?? null });
    }
  });
  return changes;
}

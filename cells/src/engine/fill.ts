/* Dragging the fill handle. The cells already selected are a pattern, and the new cells
   continue it, line by line along the drag:

   - two or more numbers continue their trend (1, 2 → 3, 4; 10, 20, 35 → by least squares);
   - one number is copied, unless it is a date, which counts on a day at a time;
   - text ending in a number counts on (Q1 → Q2, "Week 09" → "Week 10");
   - day and month names follow the calendar (Mon → Tue, January → February);
   - formulas are copied with their references moved, like copy and paste;
   - anything else repeats.

   Dragging up or left runs the same pattern backwards. */

import type { Rect } from './address';
import { shift } from './rewrite';
import type { Change, Format, Sheet } from './sheet';
import { numberToText } from './values';

export type Direction = 'down' | 'up' | 'right' | 'left';

interface Source {
  input: string | null;
  value: unknown;
  format: Format | null;
  row: number;
  col: number;
}

const CALENDARS = [
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
];

/** The direction a drag from `src` to `target` goes, where `target` contains `src`. */
export function directionOf(src: Rect, target: Rect): Direction | null {
  if (target.r2 > src.r2) return 'down';
  if (target.r1 < src.r1) return 'up';
  if (target.c2 > src.c2) return 'right';
  if (target.c1 < src.c1) return 'left';
  return null;
}

/** The cells to write to extend `src` out to `target`. */
export function fill(sheet: Sheet, src: Rect, target: Rect): Change[] {
  const dir = directionOf(src, target);
  if (!dir) return [];
  const vertical = dir === 'down' || dir === 'up';
  const changes: Change[] = [];
  const lines = vertical ? [src.c1, src.c2] : [src.r1, src.r2];
  for (let line = lines[0]!; line <= lines[1]!; line++) {
    const cells: Source[] = [];
    const [a, b] = vertical ? [src.r1, src.r2] : [src.c1, src.c2];
    for (let k = a; k <= b; k++) {
      const row = vertical ? k : line;
      const col = vertical ? line : k;
      const cell = sheet.cell(row, col);
      cells.push({
        input: sheet.snapshot(row, col),
        value: cell?.value ?? null,
        format: cell?.format ?? null,
        row,
        col,
      });
    }
    const next = series(cells);
    const n = cells.length;
    const span = vertical ? [target.r1, target.r2] : [target.c1, target.c2];
    for (let p = span[0]!; p <= span[1]!; p++) {
      if (p >= a && p <= b) continue;
      const t = p - a; // index relative to the first source cell; negative going up or left
      const from = cells[((t % n) + n) % n]!;
      const row = vertical ? p : line;
      const col = vertical ? line : p;
      changes.push({
        row,
        col,
        input: next(t, from, row - from.row, col - from.col),
        format: from.format,
      });
    }
  }
  return changes;
}

type Next = (t: number, from: Source, dr: number, dc: number) => string | null;

function series(cells: Source[]): Next {
  const copy: Next = (_t, from, dr, dc) =>
    from.input?.startsWith('=') ? `=${shift(from.input.slice(1), dr, dc)}` : from.input;
  const n = cells.length;
  const isFormula = (c: Source) => !!c.input?.startsWith('=');
  if (cells.some(isFormula)) return copy;

  // numbers: a trend through two or more, a day at a time for a single date
  if (cells.every((c) => typeof c.value === 'number')) {
    const ys = cells.map((c) => c.value as number);
    if (n === 1) {
      const isDate = /[dmy]/i.test(cells[0]!.format?.code?.replace(/"[^"]*"/g, '') ?? '');
      return isDate ? (t) => String(ys[0]! + t) : copy;
    }
    const [intercept, slope] = trend(ys);
    return (t) => numberToText(clean(intercept + slope * t));
  }

  // day and month names
  for (const names of CALENDARS) {
    const idx = cells.map((c) =>
      typeof c.value === 'string'
        ? names.findIndex((m) => m.toLowerCase() === (c.value as string).toLowerCase())
        : -1,
    );
    if (idx.every((i) => i >= 0)) {
      const step = n > 1 ? idx[1]! - idx[0]! : 1;
      const style = caseOf(cells[0]!.value as string);
      return (t) => {
        const i = idx[0]! + step * t;
        const name = names[((i % names.length) + names.length) % names.length]!;
        return style(name);
      };
    }
  }

  // text ending in a number
  const parts = cells.map((c) =>
    typeof c.value === 'string' ? /^(.*?)(\d+)(\D*)$/.exec(c.value) : null,
  );
  if (parts.every(Boolean)) {
    const ms = parts as RegExpExecArray[];
    const sameShape = ms.every((m) => m[1] === ms[0]![1] && m[3] === ms[0]![3]);
    if (sameShape) {
      const nums = ms.map((m) => Number(m[2]));
      const [intercept, slope] = n > 1 ? trend(nums) : [nums[0]!, 1];
      const width = ms[0]![2]!.length;
      const padded = ms[0]![2]!.startsWith('0');
      return (t) => {
        const v = Math.round(intercept + slope * t);
        const digits = String(Math.abs(v)).padStart(padded ? width : 1, '0');
        return `${ms[0]![1]}${v < 0 ? '-' : ''}${digits}${ms[0]![3]}`;
      };
    }
  }
  return copy;
}

/** Least-squares line through (0, y0), (1, y1), …: [intercept, slope]. */
function trend(ys: number[]): [number, number] {
  const n = ys.length;
  const mx = (n - 1) / 2;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  const slope = den ? num / den : 0;
  return [my - slope * mx, slope];
}

/** 0.1 + 0.2 steps should give 0.3, not 0.30000000000000004. */
const clean = (x: number) => Number(x.toPrecision(15));

function caseOf(sample: string): (s: string) => string {
  if (sample === sample.toUpperCase()) return (s) => s.toUpperCase();
  if (sample === sample.toLowerCase()) return (s) => s.toLowerCase();
  return (s) => s;
}

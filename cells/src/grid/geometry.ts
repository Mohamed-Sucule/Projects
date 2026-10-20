/* Where things are on screen.

   Columns have their own widths, so a column's left edge is a running total, kept as a
   prefix sum and searched by bisection: finding the first visible column of 16,384 takes
   fourteen steps.

   Rows all have one height, which makes rows trivial except for one thing: 1,048,576 rows of
   24 px is 25.2 million pixels, and browsers will not scroll an element that tall. Firefox
   stops at about 17.9 million, and others misbehave sooner. So the scrollable area is capped
   and the scroll position is scaled: the scroll bar travels over at most 8 million pixels
   while the sheet underneath travels over all 25 million. Wheel and keyboard scrolling are
   divided by the same scale, so a notch of the wheel still moves the sheet by the usual
   amount; only dragging the scroll bar's thumb moves faster, which is what a thumb on a
   sheet that long should do anyway. */

import { MAX_COLS, MAX_ROWS } from '../engine/values';

export const ROW_H = 24;
export const HEADER_H = 26;
export const GUTTER_W = 56;
export const DEFAULT_W = 100;
export const MIN_W = 24;
/** the largest scrollable height to give the browser */
export const MAX_SCROLL = 8_000_000;

export class Columns {
  private readonly starts = new Float64Array(MAX_COLS + 1);

  constructor(widths: ReadonlyMap<number, number> = new Map()) {
    this.update(widths);
  }

  update(widths: ReadonlyMap<number, number>) {
    let x = 0;
    for (let c = 0; c < MAX_COLS; c++) {
      this.starts[c] = x;
      x += widths.get(c) ?? DEFAULT_W;
    }
    this.starts[MAX_COLS] = x;
  }

  /** left edge of a column, in sheet pixels */
  x(col: number) {
    return this.starts[col]!;
  }
  width(col: number) {
    return this.starts[col + 1]! - this.starts[col]!;
  }
  get total() {
    return this.starts[MAX_COLS]!;
  }
  /** the column under a sheet x */
  at(x: number): number {
    if (x <= 0) return 0;
    if (x >= this.total) return MAX_COLS - 1;
    let lo = 0;
    let hi = MAX_COLS - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

export const TOTAL_H = MAX_ROWS * ROW_H;

/** The scale between scroll pixels and sheet pixels, for a viewport of the given height. */
export function scrollScale(viewH: number): number {
  const spacer = Math.min(TOTAL_H, MAX_SCROLL);
  const sheetRange = Math.max(1, TOTAL_H - viewH);
  const scrollRange = Math.max(1, spacer - viewH);
  return sheetRange / scrollRange;
}

export const spacerHeight = () => Math.min(TOTAL_H, MAX_SCROLL);

/** Sheet y at the top of the viewport, from the scroller's scrollTop. */
export const sheetY = (scrollTop: number, viewH: number) => scrollTop * scrollScale(viewH);

/** The scrollTop that puts sheet y at the top of the viewport. */
export const scrollTopFor = (y: number, viewH: number) => y / scrollScale(viewH);

export interface Viewport {
  /** sheet pixels at the top-left of the cell area */
  y: number;
  x: number;
  /** size of the cell area (excluding headers) */
  w: number;
  h: number;
}

export interface Visible {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
}

export function visible(v: Viewport, cols: Columns): Visible {
  const r1 = Math.max(0, Math.floor(v.y / ROW_H));
  const r2 = Math.min(MAX_ROWS - 1, Math.floor((v.y + v.h) / ROW_H));
  const c1 = cols.at(v.x);
  const c2 = cols.at(v.x + v.w);
  return { r1, r2, c1, c2 };
}

/** The sheet y that scrolls a row into view, or null if it is already visible. */
export function scrollToRow(row: number, v: Viewport): number | null {
  const top = row * ROW_H;
  if (top < v.y) return top;
  if (top + ROW_H > v.y + v.h) return top + ROW_H - v.h;
  return null;
}

export function scrollToCol(col: number, v: Viewport, cols: Columns): number | null {
  const left = cols.x(col);
  const right = left + cols.width(col);
  if (left < v.x) return left;
  if (right > v.x + v.w) return Math.min(left, right - v.w);
  return null;
}

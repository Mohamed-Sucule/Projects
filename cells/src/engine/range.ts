/* A reference, as functions receive it: a rectangle of the sheet that is read lazily and,
   where it can be, sparsely. */

import { err, type Scalar } from './values';

/** What the evaluator reads from: the sheet, through the narrowest door. */
export interface Source {
  value(row: number, col: number): Scalar;
  /** Every non-empty cell in the rectangle, a column at a time, top to bottom. */
  each(
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    visit: (v: Scalar, row: number, col: number) => void,
  ): void;
  /** The non-empty rows of one column between r1 and r2, in order. */
  rowsIn(col: number, r1: number, r2: number): readonly number[];
}

export class Range {
  constructor(
    readonly src: Source,
    readonly r1: number,
    readonly c1: number,
    readonly r2: number,
    readonly c2: number,
  ) {}
  get rows() {
    return this.r2 - this.r1 + 1;
  }
  get cols() {
    return this.c2 - this.c1 + 1;
  }
  get size() {
    return this.rows * this.cols;
  }
  at(i: number, j: number): Scalar {
    return this.src.value(this.r1 + i, this.c1 + j);
  }
  /** Non-empty cells only, which is what makes =SUM(A:A) cost the cells in A, not a million. */
  each(visit: (v: Scalar, i: number, j: number) => void): void {
    this.src.each(this.r1, this.c1, this.r2, this.c2, (v, r, c) =>
      visit(v, r - this.r1, c - this.c1),
    );
  }
  /** Non-empty cells in reading order (row by row), for the functions that join text. */
  eachInOrder(visit: (v: Scalar, i: number, j: number) => void): void {
    const cells: [number, number, Scalar][] = [];
    this.each((v, i, j) => cells.push([i, j, v]));
    cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [i, j, v] of cells) visit(v, i, j);
  }
  /** One row or column as a line of positions, for the lookups. */
  get isLine() {
    return this.rows === 1 || this.cols === 1;
  }
  line(k: number): Scalar {
    return this.rows === 1 ? this.at(0, k) : this.at(k, 0);
  }
  get length() {
    return this.rows === 1 ? this.cols : this.rows;
  }
  /** The positions along a column that hold something, in order: a sparse walk for lookups. */
  filled(): readonly number[] {
    if (this.cols === 1) return this.src.rowsIn(this.c1, this.r1, this.r2).map((r) => r - this.r1);
    const out: number[] = [];
    for (let k = 0; k < this.length; k++) if (this.line(k) !== null) out.push(k);
    return out;
  }
}

export type Value = Scalar | Range;

export const isRange = (v: Value): v is Range => v instanceof Range;

/** A value where one value is wanted: a one-cell range is its cell, a bigger one is #VALUE!. */
export function scalar(v: Value): Scalar {
  if (!(v instanceof Range)) return v;
  if (v.size === 1) return v.at(0, 0);
  return err('#VALUE!');
}

export interface Env {
  src: Source;
  /** the cell whose formula this is */
  row: number;
  col: number;
  /** TODAY and NOW are fixed for the whole of one recalculation */
  now: number;
  random: () => number;
}

/* The selection: a rectangle from an anchor to a focus, and an active cell inside it (the one
   that gets typed into). Moving and jumping follow Excel, because muscle memory does:
   Ctrl+↓ goes to the end of the block of filled cells it is in, or to the start of the next
   block, or to the bottom of the sheet. */

import { normalize, type Rect } from '../engine/address';
import { lowerBound, type Sheet } from '../engine/sheet';
import { MAX_COLS, MAX_ROWS } from '../engine/values';

export interface Pos {
  row: number;
  col: number;
}

export interface Selection {
  anchor: Pos;
  focus: Pos;
  active: Pos;
}

export const single = (row: number, col: number): Selection => ({
  anchor: { row, col },
  focus: { row, col },
  active: { row, col },
});

export const rectOf = (s: Selection): Rect =>
  normalize({ r1: s.anchor.row, c1: s.anchor.col, r2: s.focus.row, c2: s.focus.col });

export const isSingle = (s: Selection) =>
  s.anchor.row === s.focus.row && s.anchor.col === s.focus.col;

export const clampPos = (p: Pos): Pos => ({
  row: Math.min(MAX_ROWS - 1, Math.max(0, p.row)),
  col: Math.min(MAX_COLS - 1, Math.max(0, p.col)),
});

export const samePos = (a: Pos, b: Pos) => a.row === b.row && a.col === b.col;

/** Arrow keys: move the cell, or with Shift stretch the selection's far corner. */
export function step(s: Selection, dr: number, dc: number, extend: boolean): Selection {
  if (extend) return { ...s, focus: clampPos({ row: s.focus.row + dr, col: s.focus.col + dc }) };
  const p = clampPos({ row: s.active.row + dr, col: s.active.col + dc });
  return single(p.row, p.col);
}

/** Ctrl+arrow, from a cell in a direction. */
export function jump(sheet: Sheet, from: Pos, dr: number, dc: number): Pos {
  const vertical = dr !== 0;
  const forward = (vertical ? dr : dc) > 0;
  const limit = (vertical ? MAX_ROWS : MAX_COLS) - 1;
  const here = vertical ? from.row : from.col;
  const filled = vertical ? sheet.rowsIn(from.col, 0, MAX_ROWS - 1) : sheet.colsIn(from.row);
  const has = (n: number) => {
    const i = lowerBound(filled, n);
    return filled[i] === n;
  };
  const at = (n: number): Pos => (vertical ? { row: n, col: from.col } : { row: from.row, col: n });
  const next = here + (forward ? 1 : -1);
  if (next < 0 || next > limit) return from;
  if (has(here) && has(next)) {
    // to the end of this block: walk the sorted list while the cells stay consecutive
    let i = lowerBound(filled, next);
    if (forward) while (i + 1 < filled.length && filled[i + 1] === filled[i]! + 1) i++;
    else while (i > 0 && filled[i - 1] === filled[i]! - 1) i--;
    return at(filled[i]!);
  }
  // to the next filled cell, or the edge
  if (forward) {
    const i = lowerBound(filled, next);
    return at(i < filled.length ? filled[i]! : limit);
  }
  const i = lowerBound(filled, here) - 1;
  return at(i >= 0 ? filled[i]! : 0);
}

/** Enter and Tab inside a selection of several cells walk through it and wrap round. */
export function cycle(s: Selection, dr: number, dc: number): Selection {
  const r = rectOf(s);
  let { row, col } = s.active;
  if (dc) {
    col += dc;
    if (col > r.c2) {
      col = r.c1;
      row = row + 1 > r.r2 ? r.r1 : row + 1;
    } else if (col < r.c1) {
      col = r.c2;
      row = row - 1 < r.r1 ? r.r2 : row - 1;
    }
  } else {
    row += dr;
    if (row > r.r2) {
      row = r.r1;
      col = col + 1 > r.c2 ? r.c1 : col + 1;
    } else if (row < r.r1) {
      row = r.r2;
      col = col - 1 < r.c1 ? r.c2 : col - 1;
    }
  }
  return { ...s, active: { row, col } };
}

export const wholeColumns = (r: Rect) => r.r1 === 0 && r.r2 === MAX_ROWS - 1;
export const wholeRows = (r: Rect) => r.c1 === 0 && r.c2 === MAX_COLS - 1;

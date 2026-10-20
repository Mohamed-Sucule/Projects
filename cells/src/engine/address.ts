/* A1 addresses. Columns run A to XFD (16,384) and rows 1 to 1,048,576, as in Excel; inside
   the engine both are zero-based, and a cell's key is row × 16,384 + column, which stays an
   exact integer (it fits in 34 bits). */

import { MAX_COLS, MAX_ROWS } from './values';

export interface Rect {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export const cellKey = (row: number, col: number) => row * MAX_COLS + col;
export const rowOf = (key: number) => Math.floor(key / MAX_COLS);
export const colOf = (key: number) => key % MAX_COLS;

export function colName(col: number): string {
  let s = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

/** 'A' → 0, 'XFD' → 16383; -1 if it is not a column. */
export function colIndex(name: string): number {
  if (!/^[A-Za-z]{1,3}$/.test(name)) return -1;
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n <= MAX_COLS ? n - 1 : -1;
}

export const cellName = (row: number, col: number) => `${colName(col)}${row + 1}`;

/** 'b7', '$B$7' → the cell; null for anything else. */
export function parseCellName(text: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(text.trim());
  if (!m) return null;
  const col = colIndex(m[1]!);
  const row = Number(m[2]) - 1;
  if (col < 0 || row < 0 || row >= MAX_ROWS) return null;
  return { row, col };
}

/** 'A1', 'A1:C9', 'B:D', '3:5' → the rectangle; null for anything else. */
export function parseRectName(text: string): Rect | null {
  const t = text.trim();
  const parts = t.split(':');
  if (parts.length === 1) {
    const c = parseCellName(t);
    return c && { r1: c.row, c1: c.col, r2: c.row, c2: c.col };
  }
  if (parts.length !== 2) return null;
  const [a, b] = parts as [string, string];
  const ca = parseCellName(a);
  const cb = parseCellName(b);
  if (ca && cb) return normalize({ r1: ca.row, c1: ca.col, r2: cb.row, c2: cb.col });
  const cols = [colIndex(a.replace(/\$/g, '')), colIndex(b.replace(/\$/g, ''))] as const;
  if (cols[0] >= 0 && cols[1] >= 0) {
    return normalize({ r1: 0, c1: cols[0], r2: MAX_ROWS - 1, c2: cols[1] });
  }
  const rows = [Number(a.replace(/\$/g, '')), Number(b.replace(/\$/g, ''))] as const;
  if (rows.every((r) => Number.isInteger(r) && r >= 1 && r <= MAX_ROWS)) {
    return normalize({ r1: rows[0] - 1, c1: 0, r2: rows[1] - 1, c2: MAX_COLS - 1 });
  }
  return null;
}

export function normalize(r: Rect): Rect {
  return {
    r1: Math.min(r.r1, r.r2),
    c1: Math.min(r.c1, r.c2),
    r2: Math.max(r.r1, r.r2),
    c2: Math.max(r.c1, r.c2),
  };
}

export const isWholeColumns = (r: Rect) => r.r1 === 0 && r.r2 === MAX_ROWS - 1;
export const isWholeRows = (r: Rect) => r.c1 === 0 && r.c2 === MAX_COLS - 1;

export function rectName(r: Rect): string {
  if (isWholeColumns(r) && !isWholeRows(r)) return `${colName(r.c1)}:${colName(r.c2)}`;
  if (isWholeRows(r) && !isWholeColumns(r)) return `${r.r1 + 1}:${r.r2 + 1}`;
  const a = cellName(r.r1, r.c1);
  return r.r1 === r.r2 && r.c1 === r.c2 ? a : `${a}:${cellName(r.r2, r.c2)}`;
}

export const contains = (r: Rect, row: number, col: number) =>
  row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;

export const cellCount = (r: Rect) => (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);

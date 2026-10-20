/* Rewriting the references in a formula's text, token by token, leaving everything else as it
   was typed. Two different questions get asked of a reference:

   - Copied or filled somewhere else, where should it point? Relative parts move with the
     formula, $-anchored parts stay. That is shift().
   - Rows or columns were inserted, deleted or moved: where did the cell it pointed at go?
     The $ makes no difference to that. That is remap().

   A reference that no longer has anywhere to point becomes #REF!, as in Excel. */

import { colName } from './address';
import { lex, readRef, type RefParts, type Token } from './lexer';
import { MAX_COLS, MAX_ROWS } from './values';

export type RangeKind = 'cells' | 'cols' | 'rows';

export interface Rewriter {
  ref(p: RefParts): RefParts | null;
  range(a: RefParts, b: RefParts, kind: RangeKind): [RefParts, RefParts] | null;
}

export const writeRef = (p: RefParts) =>
  `${p.colAbs ? '$' : ''}${colName(p.col)}${p.rowAbs ? '$' : ''}${p.row + 1}`;

const writeCol = (p: RefParts) => `${p.colAbs ? '$' : ''}${colName(p.col)}`;
const writeRow = (p: RefParts) => `${p.rowAbs ? '$' : ''}${p.row + 1}`;

/** Column and row ranges as RefParts, so one rewriter handles all three kinds. */
function readCols(text: string): [RefParts, RefParts] {
  const [a, b] = text.split(':') as [string, string];
  const part = (s: string): RefParts => ({
    colAbs: s.startsWith('$'),
    col: colNumber(s.replace('$', '')),
    rowAbs: true,
    row: 0,
  });
  const pa = part(a);
  const pb = part(b);
  pb.row = MAX_ROWS - 1;
  return [pa, pb];
}

function readRows(text: string): [RefParts, RefParts] {
  const [a, b] = text.split(':') as [string, string];
  const part = (s: string, col: number): RefParts => ({
    rowAbs: s.startsWith('$'),
    row: Number(s.replace('$', '')) - 1,
    colAbs: true,
    col,
  });
  return [part(a, 0), part(b, MAX_COLS - 1)];
}

function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Rewrite every reference in a formula body (the text after "="). */
export function rewrite(body: string, r: Rewriter): string {
  const tokens = lex(body);
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === 'ref') {
      // A1:B2, allowing spaces around the colon as the parser does
      const j = nextSignificant(tokens, i + 1);
      const k = j >= 0 && tokens[j]!.type === 'colon' ? nextSignificant(tokens, j + 1) : -1;
      if (k >= 0 && tokens[k]!.type === 'ref') {
        const res = r.range(readRef(t.text), readRef(tokens[k]!.text), 'cells');
        out += res ? `${writeRef(res[0])}:${writeRef(res[1])}` : '#REF!';
        i = k;
        continue;
      }
      const p = r.ref(readRef(t.text));
      out += p ? writeRef(p) : '#REF!';
    } else if (t.type === 'cols') {
      const [a, b] = readCols(t.text);
      const res = r.range(a, b, 'cols');
      out += res ? `${writeCol(res[0])}:${writeCol(res[1])}` : '#REF!';
    } else if (t.type === 'rows') {
      const [a, b] = readRows(t.text);
      const res = r.range(a, b, 'rows');
      out += res ? `${writeRow(res[0])}:${writeRow(res[1])}` : '#REF!';
    } else out += t.text;
  }
  return out;
}

function nextSignificant(tokens: Token[], from: number): number {
  for (let i = from; i < tokens.length; i++) if (tokens[i]!.type !== 'space') return i;
  return -1;
}

const inBounds = (p: RefParts) => p.row >= 0 && p.col >= 0 && p.row < MAX_ROWS && p.col < MAX_COLS;

/** Copy or fill: relative parts move by (dr, dc), anchored parts stay. */
export function shift(body: string, dr: number, dc: number): string {
  if (dr === 0 && dc === 0) return body;
  const move = (p: RefParts, rows = true, cols = true): RefParts => ({
    ...p,
    row: p.rowAbs || !rows ? p.row : p.row + dr,
    col: p.colAbs || !cols ? p.col : p.col + dc,
  });
  return rewrite(body, {
    ref: (p) => {
      const q = move(p);
      return inBounds(q) ? q : null;
    },
    range: (a, b, kind) => {
      // a whole-column range only moves sideways, a whole-row range only up and down
      const qa = move(a, kind !== 'cols', kind !== 'rows');
      const qb = move(b, kind !== 'cols', kind !== 'rows');
      return inBounds(qa) && inBounds(qb) ? [qa, qb] : null;
    },
  });
}

/** Where rows (or columns) went after an insert or delete: a cell's new index, or null if it was deleted. */
export interface Remap {
  row(r: number): number | null;
  col(c: number): number | null;
  /** a span of rows (or columns) that may have been cut into, or null if none of it is left */
  rows(r1: number, r2: number): [number, number] | null;
  cols(c1: number, c2: number): [number, number] | null;
}

export function remap(body: string, m: Remap): string {
  return rewrite(body, {
    ref: (p) => {
      const row = m.row(p.row);
      const col = m.col(p.col);
      return row === null || col === null ? null : { ...p, row, col };
    },
    range: (a, b, kind) => {
      const rows = kind === 'cols' ? ([a.row, b.row] as [number, number]) : m.rows(a.row, b.row);
      const cols = kind === 'rows' ? ([a.col, b.col] as [number, number]) : m.cols(a.col, b.col);
      if (!rows || !cols) return null;
      return [
        { ...a, row: rows[0], col: cols[0] },
        { ...b, row: rows[1], col: cols[1] },
      ];
    },
  });
}

const identity = (n: number) => n;
const span = (a: number, b: number): [number, number] => [a, b];

/** Inserting `count` lines before line `at`. A span that the insert falls inside grows. */
export function insertion(at: number, count: number, limit: number) {
  const f = (n: number) => (n >= at ? n + count : n);
  const one = (n: number) => {
    const m = f(n);
    return m < limit ? m : null;
  };
  const many = (a: number, b: number): [number, number] | null => {
    const x = f(a);
    const y = Math.min(f(b), limit - 1);
    return x < limit ? [x, y] : null;
  };
  return { one, many };
}

/** Deleting `count` lines from line `at`. A span cut into shrinks; one deleted entirely is #REF!. */
export function deletion(at: number, count: number) {
  const end = at + count;
  const one = (n: number) => (n < at ? n : n >= end ? n - count : null);
  const many = (a: number, b: number): [number, number] | null => {
    const x = a < at ? a : a >= end ? a - count : at;
    const y = b < at ? b : b >= end ? b - count : at - 1;
    return y < x ? null : [x, y];
  };
  return { one, many };
}

export function rowsChanged(op: {
  one: (n: number) => number | null;
  many: (a: number, b: number) => [number, number] | null;
}): Remap {
  return { row: op.one, rows: op.many, col: identity, cols: span };
}

export function colsChanged(op: {
  one: (n: number) => number | null;
  many: (a: number, b: number) => [number, number] | null;
}): Remap {
  return { col: op.one, cols: op.many, row: identity, rows: span };
}

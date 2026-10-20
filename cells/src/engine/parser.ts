/* Tokens into a tree, by precedence climbing (a Pratt parser). The precedence is Excel's, which
   is not school arithmetic's in one place: negation binds tighter than ^, so =-2^2 is 4, and ^
   associates to the left, so =2^3^2 is 64.

   References are stored relative to the cell the formula lives in (R1C1 style) unless they
   are anchored with $. =A1*2 typed in B1 and =A2*2 filled into B2 are then the same tree,
   "the cell to my left, times two", so a column of 100,000 filled-down formulas is parsed
   once and shares one tree (see Formulas in sheet.ts). */

import { MAX_COLS, MAX_ROWS, type ErrorCode } from './values';
import { lex, readRef, significant, type Token } from './lexer';

/** A coordinate that is either fixed ($) or an offset from the formula's own cell. */
export interface Coord {
  abs: boolean;
  n: number;
}

export interface RefNode {
  type: 'ref';
  row: Coord;
  col: Coord;
}

export interface RangeNode {
  type: 'range';
  kind: 'cells' | 'cols' | 'rows';
  from: { row: Coord; col: Coord };
  to: { row: Coord; col: Coord };
}

export type Node =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'err'; code: ErrorCode }
  | RefNode
  | RangeNode
  | { type: 'name'; name: string }
  | { type: 'missing' }
  | { type: 'unary'; op: '-' | '+' | '%'; arg: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] };

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

export class FormulaError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
  }
}

const INFIX: Record<string, [left: number, right: number]> = {
  '=': [10, 11],
  '<>': [10, 11],
  '<': [10, 11],
  '>': [10, 11],
  '<=': [10, 11],
  '>=': [10, 11],
  '&': [20, 21],
  '+': [30, 31],
  '-': [30, 31],
  '*': [40, 41],
  '/': [40, 41],
  '^': [50, 51],
};
const PREFIX = 60;
const POSTFIX = 70;

/** Parse a formula body (without the "="), typed into the cell at (row, col). */
export function parse(body: string, row: number, col: number): Node {
  return new Parser(significant(lex(body)), row, col, body.length).parse();
}

class Parser {
  private i = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly row: number,
    private readonly col: number,
    private readonly length: number,
  ) {}

  parse(): Node {
    if (this.tokens.length === 0) throw new FormulaError('The formula is empty', 0);
    const node = this.expr(0);
    const extra = this.peek();
    if (extra) throw new FormulaError(`Unexpected "${extra.text}"`, extra.start);
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  private next(): Token {
    const t = this.tokens[this.i++];
    if (!t) throw new FormulaError('The formula ends too soon', this.length);
    return t;
  }

  private expr(minBp: number): Node {
    let left = this.prefix();
    for (;;) {
      const t = this.peek();
      if (!t || t.type !== 'op') break;
      if (t.text === '%') {
        if (POSTFIX < minBp) break;
        this.i++;
        left = { type: 'unary', op: '%', arg: left };
        continue;
      }
      const bp = INFIX[t.text];
      if (!bp || bp[0] < minBp) break;
      this.i++;
      const right = this.expr(bp[1]);
      left = { type: 'binary', op: t.text as BinaryOp, left, right };
    }
    return left;
  }

  private prefix(): Node {
    const t = this.next();
    switch (t.type) {
      case 'number':
        return { type: 'num', value: Number(t.text) };
      case 'string':
        return { type: 'str', value: t.text.slice(1, -1).replace(/""/g, '"') };
      case 'bool':
        return { type: 'bool', value: t.text.toUpperCase() === 'TRUE' };
      case 'error':
        return { type: 'err', code: t.text.toUpperCase() as ErrorCode };
      case 'ref':
        return this.refOrRange(t);
      case 'cols': {
        const [a, b] = t.text.split(':') as [string, string];
        const ca = colPart(a);
        const cb = colPart(b);
        return this.range('cols', { abs: true, n: 0 }, ca, { abs: true, n: MAX_ROWS - 1 }, cb);
      }
      case 'rows': {
        const [a, b] = t.text.split(':') as [string, string];
        return this.range('rows', rowPart(a), { abs: true, n: 0 }, rowPart(b), {
          abs: true,
          n: MAX_COLS - 1,
        });
      }
      case 'func':
        return this.call(t);
      case 'name':
        return { type: 'name', name: t.text.toUpperCase() };
      case 'lparen': {
        const inner = this.expr(0);
        const close = this.next();
        if (close.type !== 'rparen') throw new FormulaError('A bracket is not closed', close.start);
        return inner;
      }
      case 'op':
        if (t.text === '-' || t.text === '+') {
          return { type: 'unary', op: t.text, arg: this.expr(PREFIX) };
        }
        throw new FormulaError(`Unexpected "${t.text}"`, t.start);
      default:
        throw new FormulaError(`Unexpected "${t.text}"`, t.start);
    }
  }

  private refOrRange(t: Token): Node {
    const a = readRef(t.text);
    if (this.peek()?.type === 'colon' && this.tokens[this.i + 1]?.type === 'ref') {
      this.i++;
      const b = readRef(this.next().text);
      return this.range(
        'cells',
        this.coord(a.rowAbs, a.row, this.row),
        this.coord(a.colAbs, a.col, this.col),
        this.coord(b.rowAbs, b.row, this.row),
        this.coord(b.colAbs, b.col, this.col),
      );
    }
    return {
      type: 'ref',
      row: this.coord(a.rowAbs, a.row, this.row),
      col: this.coord(a.colAbs, a.col, this.col),
    };
  }

  private coord(abs: boolean, n: number, host: number): Coord {
    return abs ? { abs, n } : { abs, n: n - host };
  }

  /* For 'cells' the coordinates arrive already relative. A whole-column range (B:D) is
     relative in its columns unless they carry a $, and always spans every row; a whole-row
     range the other way round. */
  private range(kind: RangeNode['kind'], r1: Coord, c1: Coord, r2: Coord, c2: Coord): RangeNode {
    if (kind === 'cols') {
      return {
        type: 'range',
        kind,
        from: { row: r1, col: this.coord(c1.abs, c1.n, this.col) },
        to: { row: r2, col: this.coord(c2.abs, c2.n, this.col) },
      };
    }
    if (kind === 'rows') {
      return {
        type: 'range',
        kind,
        from: { row: this.coord(r1.abs, r1.n, this.row), col: c1 },
        to: { row: this.coord(r2.abs, r2.n, this.row), col: c2 },
      };
    }
    return { type: 'range', kind, from: { row: r1, col: c1 }, to: { row: r2, col: c2 } };
  }

  private call(t: Token): Node {
    const name = t.text.toUpperCase();
    this.next(); // (
    const args: Node[] = [];
    if (this.peek()?.type === 'rparen') {
      this.i++;
      return { type: 'call', name, args };
    }
    for (;;) {
      const p = this.peek();
      if (p?.type === 'comma' || p?.type === 'rparen') args.push({ type: 'missing' });
      else args.push(this.expr(0));
      const sep = this.next();
      if (sep.type === 'rparen') break;
      if (sep.type !== 'comma') throw new FormulaError(`Expected "," or ")" in ${name}`, sep.start);
    }
    return { type: 'call', name, args };
  }
}

const colPart = (text: string): Coord => ({
  abs: text.startsWith('$'),
  n: colIndexOf(text.replace('$', '')),
});
const rowPart = (text: string): Coord => ({
  abs: text.startsWith('$'),
  n: Number(text.replace('$', '')) - 1,
});

function colIndexOf(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Where a coordinate lands for a formula in the given cell. */
export const resolve = (c: Coord, host: number) => (c.abs ? c.n : c.n + host);

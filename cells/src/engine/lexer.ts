/* Formula text into tokens. Every character ends up in exactly one token, spaces included,
   so a formula can be rewritten (when it is filled down, or a row is inserted above what it
   points at) by replacing its reference tokens and joining the rest back verbatim: the
   person's own spacing and capitals survive. */

import { colIndex } from './address';
import { MAX_ROWS } from './values';

export type TokenType =
  | 'number'
  | 'string'
  | 'bool'
  | 'error'
  | 'ref' // A1, $B$2
  | 'cols' // A:C
  | 'rows' // 2:5
  | 'func' // a name followed by (
  | 'name' // anything else that looks like a word
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'colon'
  | 'space'
  | 'invalid';

export interface Token {
  type: TokenType;
  text: string;
  start: number;
  end: number;
}

/* Order matters: a row range ("2:5") before a number, a reference ("A1") before a name,
   and a column range ("A:C") before both. */
const RULES: [TokenType, RegExp][] = [
  ['space', /\s+/y],
  ['string', /"(?:[^"]|"")*"/y],
  ['error', /#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|CYCLE!|ERROR!)/iy],
  ['rows', /\$?\d+:\$?\d+(?![\w.(])/y],
  ['number', /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y],
  ['cols', /\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}(?![\w.(])/y],
  ['ref', /\$?[A-Za-z]{1,3}\$?\d+(?![\w.(])/y],
  ['bool', /(?:TRUE|FALSE)(?![\w.(])/iy],
  ['func', /[A-Za-z_][\w.]*(?=\s*\()/y],
  ['name', /[A-Za-z_][\w.]*/y],
  ['op', /<=|>=|<>|[-+*/^&=<>%]/y],
  ['lparen', /\(/y],
  ['rparen', /\)/y],
  ['comma', /,/y],
  ['colon', /:/y],
];

/** Lex a formula body (the text after "="). Never throws; bad characters become 'invalid'. */
export function lex(src: string, offset = 0): Token[] {
  const out: Token[] = [];
  let i = 0;
  outer: while (i < src.length) {
    for (const [type, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) continue;
      let t: TokenType = type;
      const text = m[0];
      // a reference or range past the edge of the sheet is just a name (=XFE1 is #NAME? in Excel)
      if (t === 'ref' && !validRef(text)) t = 'name';
      if (t === 'cols' && !text.split(':').every((p) => colIndex(p.replace('$', '')) >= 0)) {
        t = 'invalid';
      }
      if (t === 'rows' && !text.split(':').every((p) => validRow(p.replace('$', ''))))
        t = 'invalid';
      out.push({ type: t, text, start: offset + i, end: offset + i + text.length });
      i += text.length;
      continue outer;
    }
    if (src[i] === '"') {
      // an unclosed string runs to the end
      out.push({
        type: 'invalid',
        text: src.slice(i),
        start: offset + i,
        end: offset + src.length,
      });
      break;
    }
    out.push({ type: 'invalid', text: src[i]!, start: offset + i, end: offset + i + 1 });
    i += 1;
  }
  return out;
}

const validRow = (digits: string) => {
  const n = Number(digits);
  return Number.isInteger(n) && n >= 1 && n <= MAX_ROWS;
};

function validRef(text: string): boolean {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(text);
  return !!m && colIndex(m[1]!) >= 0 && validRow(m[2]!);
}

export interface RefParts {
  col: number;
  row: number;
  colAbs: boolean;
  rowAbs: boolean;
}

/** '$B7' → { col: 1, row: 6, colAbs: true, rowAbs: false } */
export function readRef(text: string): RefParts {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(text)!;
  return {
    colAbs: m[1] === '$',
    col: colIndex(m[2]!),
    rowAbs: m[3] === '$',
    row: Number(m[4]) - 1,
  };
}

/** The tokens with spaces taken out, which is what the parser wants. */
export const significant = (tokens: Token[]) => tokens.filter((t) => t.type !== 'space');

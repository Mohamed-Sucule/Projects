/* What the formula editor knows about the text being typed: which references it holds (each
   gets a colour, in the text and as an outline on the grid, as in Excel), whether the caret
   is somewhere a reference could go (so the arrow keys point at cells instead of leaving the
   cell), which function names the word being typed could become, and which argument of
   which function the caret is in. */

import { parseRectName, type Rect } from '../engine/address';
import { FUNCTIONS, FUNCTION_NAMES, type FnDef } from '../engine/functions';
import { lex, type Token } from '../engine/lexer';

export const REF_COLOURS = [
  '#1f6feb',
  '#d1242f',
  '#8250df',
  '#1a7f37',
  '#bf8700',
  '#cf222e',
  '#0969da',
  '#9a6700',
];

export interface Piece {
  text: string;
  kind: 'ref' | 'func' | 'string' | 'number' | 'error' | 'op' | 'paren' | 'plain';
  colour?: number;
}

export interface Highlight {
  rect: Rect;
  colour: number;
}

/** The formula's text in coloured pieces, and the rectangles its references cover. */
export function highlight(text: string): { pieces: Piece[]; rects: Highlight[] } {
  if (!text.startsWith('=')) return { pieces: [{ text, kind: 'plain' }], rects: [] };
  const tokens = lex(text.slice(1), 1);
  const pieces: Piece[] = [{ text: '=', kind: 'op' }];
  const rects: Highlight[] = [];
  const colours = new Map<string, number>();
  const colourFor = (name: string) => {
    const k = name.replace(/\$/g, '').toUpperCase();
    if (!colours.has(k)) colours.set(k, colours.size % REF_COLOURS.length);
    return colours.get(k)!;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === 'ref' || t.type === 'cols' || t.type === 'rows') {
      // A1:B2 is one reference, coloured as one
      let name = t.text;
      let j = i;
      if (t.type === 'ref' && tokens[i + 1]?.type === 'colon' && tokens[i + 2]?.type === 'ref') {
        name = `${t.text}:${tokens[i + 2]!.text}`;
        j = i + 2;
      }
      const colour = colourFor(name);
      pieces.push({ text: text.slice(t.start, tokens[j]!.end), kind: 'ref', colour });
      const rect = parseRectName(name.replace(/\$/g, ''));
      if (rect) rects.push({ rect, colour });
      i = j;
      continue;
    }
    pieces.push({ text: t.text, kind: kindOf(t) });
  }
  return { pieces, rects };
}

function kindOf(t: Token): Piece['kind'] {
  switch (t.type) {
    case 'func':
      return 'func';
    case 'string':
      return 'string';
    case 'number':
    case 'bool':
      return 'number';
    case 'error':
      return 'error';
    case 'op':
    case 'comma':
    case 'colon':
      return 'op';
    case 'lparen':
    case 'rparen':
      return 'paren';
    default:
      return 'plain';
  }
}

const POINTABLE_AFTER = new Set(['=', '(', ',', '+', '-', '*', '/', '^', '&', '<', '>', ':']);

/**
 * Whether a reference can be typed at the caret by pointing at a cell: in a formula, right
 * after an operator, an opening bracket or a comma, with nothing but spaces or a closing
 * bracket after it.
 */
export function canPoint(text: string, caret: number): boolean {
  if (!text.startsWith('=')) return false;
  const before = text.slice(0, caret).trimEnd();
  const after = text.slice(caret).trimStart();
  if (after && ![')', ','].includes(after[0]!)) return false;
  return POINTABLE_AFTER.has(before[before.length - 1] ?? '');
}

export interface Completion {
  start: number;
  end: number;
  matches: FnDef[];
}

/** Function names the word before the caret could become. */
export function completion(text: string, caret: number): Completion | null {
  if (!text.startsWith('=')) return null;
  const head = text.slice(0, caret);
  const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(head);
  if (!m) return null;
  const start = caret - m[1]!.length;
  const prev = head.slice(0, start).trimEnd();
  if (!POINTABLE_AFTER.has(prev[prev.length - 1] ?? '')) return null;
  // a word that is already a cell reference ("A1") is not a function being typed
  if (/^[A-Za-z]{1,3}\d+$/.test(m[1]!)) return null;
  const prefix = m[1]!.toUpperCase();
  const matches = FUNCTION_NAMES.filter((n) => n.startsWith(prefix))
    .slice(0, 8)
    .map((n) => FUNCTIONS.get(n)!);
  if (
    !matches.length ||
    (matches.length === 1 && matches[0]!.name === prefix && text[caret] === '(')
  )
    return null;
  return { start, end: caret, matches };
}

export interface Signature {
  fn: FnDef;
  /** which argument the caret is in, from 0 */
  arg: number;
}

/** The innermost function call the caret is inside. */
export function signatureAt(text: string, caret: number): Signature | null {
  if (!text.startsWith('=')) return null;
  const stack: { name: string | null; arg: number }[] = [];
  for (const t of lex(text.slice(1, caret), 1)) {
    if (t.type === 'func') stack.push({ name: t.text.toUpperCase(), arg: -1 });
    else if (t.type === 'lparen') {
      const top = stack[stack.length - 1];
      if (top && top.arg === -1) top.arg = 0;
      else stack.push({ name: null, arg: 0 });
    } else if (t.type === 'rparen') stack.pop();
    else if (t.type === 'comma' && stack.length) stack[stack.length - 1]!.arg++;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i]!;
    if (s.name && s.arg >= 0) {
      const fn = FUNCTIONS.get(s.name);
      if (fn) return { fn, arg: s.arg };
    }
  }
  return null;
}

/** A signature's arguments, for showing the current one in bold. */
export function signatureParts(sig: string): { name: string; args: string[] } {
  const open = sig.indexOf('(');
  const name = sig.slice(0, open);
  const inner = sig.slice(open + 1, -1);
  return { name, args: inner ? inner.split(', ') : [] };
}

/** Which argument the bold one is, for signatures that end in "…" (it repeats the last). */
export function argIndex(args: string[], arg: number): number {
  if (arg < args.length) return arg;
  const ellipsis = args[args.length - 1] === '…';
  return ellipsis ? args.length - 2 : args.length - 1;
}

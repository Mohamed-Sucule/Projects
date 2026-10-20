/* The criteria of COUNTIF, SUMIFS and friends: 5, ">=10", "<>", "apple*", "?at". A number
   matches equal numbers; text matches without regard to case, with * and ? as wildcards and
   ~ to escape them; an operator in front compares instead. "" matches empty cells. */

import { compare, isError, parseNumber, type Scalar } from './values';

export interface Criterion {
  test: (v: Scalar) => boolean;
  /** whether an empty cell can match, so a sparse range can skip its empty cells otherwise */
  matchesEmpty: boolean;
}

export function wildcard(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '~' && i + 1 < pattern.length) re += escapeRe(pattern[++i]!);
    else if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += escapeRe(ch);
  }
  return new RegExp(`^${re}$`, 'is');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function criterion(c: Scalar): Criterion {
  if (typeof c === 'number') return { test: (v) => v === c, matchesEmpty: false };
  if (typeof c === 'boolean') return { test: (v) => v === c, matchesEmpty: false };
  if (isError(c)) return { test: (v) => v === c, matchesEmpty: false };
  const text = c ?? '';
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(text)!;
  const op = m[1] ?? '';
  const rest = m[2]!;
  const isEmpty = (v: Scalar) => v === null || v === '';

  if (rest === '') {
    if (op === '<>') return { test: (v) => !isEmpty(v), matchesEmpty: false };
    if (op === '' || op === '=') return { test: isEmpty, matchesEmpty: true };
  }
  const num = parseNumber(rest);
  const upper = rest.toUpperCase();
  const target: Scalar =
    num !== null ? num : upper === 'TRUE' ? true : upper === 'FALSE' ? false : rest;

  if (op === '' || op === '=') {
    if (typeof target === 'string') {
      const re = wildcard(target);
      return { test: (v) => typeof v === 'string' && re.test(v), matchesEmpty: false };
    }
    return { test: (v) => v === target, matchesEmpty: false };
  }
  if (op === '<>') {
    if (typeof target === 'string') {
      const re = wildcard(target);
      return { test: (v) => !(typeof v === 'string' && re.test(v)), matchesEmpty: true };
    }
    return { test: (v) => v !== target, matchesEmpty: true };
  }
  // < > <= >= only compare like with like: numbers with numbers, text with text
  const sameKind = (v: Scalar) => v !== null && typeof v === typeof target;
  const cmp = {
    '<': (x: number) => x < 0,
    '>': (x: number) => x > 0,
    '<=': (x: number) => x <= 0,
    '>=': (x: number) => x >= 0,
  }[op]!;
  return { test: (v) => sameKind(v) && cmp(compare(v, target)), matchesEmpty: false };
}

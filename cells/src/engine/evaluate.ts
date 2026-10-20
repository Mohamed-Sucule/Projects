/* Working a tree out to a value.

   A reference is passed to a function as a reference, not as the value in it, because
   functions treat the two differently and people rely on it: =SUM(A1) is 0 when A1 holds
   "abc", but =SUM("abc") is #VALUE!. So a reference evaluates to a Range, and only becomes a
   value where a value is needed (arithmetic, comparison, the cell's own result). */

import type { Node } from './parser';
import { resolve } from './parser';
import { FUNCTIONS } from './functions';
import { Range, scalar, type Env, type Value } from './range';
import {
  MAX_COLS,
  MAX_ROWS,
  compare,
  err,
  finite,
  isError,
  toNumber,
  toText,
  type Scalar,
} from './values';

export function evaluate(node: Node, env: Env): Value {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'str':
      return node.value;
    case 'bool':
      return node.value;
    case 'err':
      return err(node.code);
    case 'missing':
      return null;
    case 'name':
      return err('#NAME?');
    case 'ref': {
      const r = resolve(node.row, env.row);
      const c = resolve(node.col, env.col);
      if (r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS) return err('#REF!');
      return new Range(env.src, r, c, r, c);
    }
    case 'range': {
      const a = [resolve(node.from.row, env.row), resolve(node.from.col, env.col)] as const;
      const b = [resolve(node.to.row, env.row), resolve(node.to.col, env.col)] as const;
      const r1 = Math.min(a[0], b[0]);
      const r2 = Math.max(a[0], b[0]);
      const c1 = Math.min(a[1], b[1]);
      const c2 = Math.max(a[1], b[1]);
      if (r1 < 0 || c1 < 0 || r2 >= MAX_ROWS || c2 >= MAX_COLS) return err('#REF!');
      return new Range(env.src, r1, c1, r2, c2);
    }
    case 'unary': {
      const v = toNumber(scalar(evaluate(node.arg, env)));
      if (isError(v)) return v;
      if (node.op === '-') return finite(-v);
      if (node.op === '%') return finite(v / 100);
      return v;
    }
    case 'binary':
      return binary(node.op, scalar(evaluate(node.left, env)), scalar(evaluate(node.right, env)));
    case 'call': {
      const fn = FUNCTIONS.get(node.name);
      if (!fn) return err('#NAME?');
      if (node.args.length < fn.min || node.args.length > fn.max) return err('#VALUE!');
      if (fn.lazy) return fn.lazy(node.args, env, (n) => evaluate(n, env));
      return fn.call!(
        node.args.map((a) => evaluate(a, env)),
        env,
      );
    }
  }
}

function binary(op: string, a: Scalar, b: Scalar): Scalar {
  if (isError(a)) return a;
  if (isError(b)) return b;
  switch (op) {
    case '&': {
      const x = toText(a) as string;
      const y = toText(b) as string;
      return x + y;
    }
    case '=':
      return compare(a, b) === 0;
    case '<>':
      return compare(a, b) !== 0;
    case '<':
      return compare(a, b) < 0;
    case '>':
      return compare(a, b) > 0;
    case '<=':
      return compare(a, b) <= 0;
    case '>=':
      return compare(a, b) >= 0;
  }
  const x = toNumber(a);
  if (isError(x)) return x;
  const y = toNumber(b);
  if (isError(y)) return y;
  switch (op) {
    case '+':
      return finite(x + y);
    case '-':
      return finite(x - y);
    case '*':
      return finite(x * y);
    case '/':
      return y === 0 ? err('#DIV/0!') : finite(x / y);
    case '^':
      if (x === 0 && y === 0) return err('#NUM!');
      if (x === 0 && y < 0) return err('#DIV/0!');
      return finite(x ** y);
  }
  return err('#VALUE!');
}

/** A formula's final result: an empty cell referred to reads 0 (=A1 where A1 is empty shows 0). */
export function finish(v: Value): Scalar {
  const s = scalar(v);
  return s === null ? 0 : s;
}

/** Every cell a formula reads, as rectangles: what the dependency graph is built from. */
export function references(
  node: Node,
  row: number,
  col: number,
  out: [number, number, number, number][] = [],
) {
  switch (node.type) {
    case 'ref': {
      const r = resolve(node.row, row);
      const c = resolve(node.col, col);
      if (r >= 0 && c >= 0 && r < MAX_ROWS && c < MAX_COLS) out.push([r, c, r, c]);
      break;
    }
    case 'range': {
      const r1 = resolve(node.from.row, row);
      const c1 = resolve(node.from.col, col);
      const r2 = resolve(node.to.row, row);
      const c2 = resolve(node.to.col, col);
      const rect: [number, number, number, number] = [
        Math.min(r1, r2),
        Math.min(c1, c2),
        Math.max(r1, r2),
        Math.max(c1, c2),
      ];
      if (rect[0] >= 0 && rect[1] >= 0 && rect[2] < MAX_ROWS && rect[3] < MAX_COLS) out.push(rect);
      break;
    }
    case 'unary':
      references(node.arg, row, col, out);
      break;
    case 'binary':
      references(node.left, row, col, out);
      references(node.right, row, col, out);
      break;
    case 'call':
      for (const a of node.args) references(a, row, col, out);
      break;
  }
  return out;
}

/** Whether a tree calls a function that changes every time (RAND, NOW, TODAY). */
export function isVolatile(node: Node): boolean {
  switch (node.type) {
    case 'call':
      return !!FUNCTIONS.get(node.name)?.volatile || node.args.some(isVolatile);
    case 'unary':
      return isVolatile(node.arg);
    case 'binary':
      return isVolatile(node.left) || isVolatile(node.right);
    default:
      return false;
  }
}

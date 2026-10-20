/* The functions, with Excel's rules for each, because those rules are what people's formulas
   assume: SUM skips text in a range but not text typed into it, COUNT never counts an error,
   AVERAGE of nothing is #DIV/0!, MOD takes the sign of the divisor, and VLOOKUP's fourth
   argument defaults to an approximate match that expects the first column to be sorted.

   Each entry also carries the signature and one line about it, which the formula bar uses
   for autocomplete and for the hint under the cursor. */

import { criterion, wildcard, type Criterion } from './criteria';
import { daysInMonth, fromSerial, parseDate, toSerial, weekday } from './dates';
import { formatValue, roundTo } from './format';
import type { Node } from './parser';
import { Range, scalar, type Env, type Value } from './range';
import {
  compare,
  err,
  finite,
  isError,
  parseNumber,
  toBoolean,
  toNumber,
  toText,
  type CellError,
  type Scalar,
} from './values';

export type Category =
  'Maths' | 'Statistics' | 'Logic' | 'Lookup' | 'Text' | 'Date' | 'Information';

export interface FnDef {
  name: string;
  min: number;
  max: number;
  sig: string;
  about: string;
  category: Category;
  volatile?: boolean;
  call?: (args: Value[], env: Env) => Value;
  lazy?: (args: Node[], env: Env, ev: (n: Node) => Value) => Value;
}

export const FUNCTIONS = new Map<string, FnDef>();

function def(
  name: string,
  category: Category,
  sig: string,
  about: string,
  [min, max]: [number, number],
  call: (args: Value[], env: Env) => Value,
  volatile = false,
) {
  FUNCTIONS.set(name, { name, category, sig, about, min, max, call, volatile });
}

function lazy(
  name: string,
  category: Category,
  sig: string,
  about: string,
  [min, max]: [number, number],
  impl: (args: Node[], env: Env, ev: (n: Node) => Value) => Value,
) {
  FUNCTIONS.set(name, { name, category, sig, about, min, max, lazy: impl });
}

const MANY = Infinity;

// ── coercion helpers ──────────────────────────────────────────────────────

const num = (v: Value | undefined): number | CellError =>
  toNumber(v === undefined ? null : scalar(v));
const text = (v: Value | undefined): string | CellError =>
  toText(v === undefined ? null : scalar(v));
const bool = (v: Value | undefined): boolean | CellError =>
  toBoolean(v === undefined ? null : scalar(v));
const int = (v: Value | undefined): number | CellError => {
  const n = num(v);
  return isError(n) ? n : Math.trunc(n);
};
const range = (v: Value | undefined): Range | CellError =>
  v instanceof Range ? v : isError(v) ? v : err('#VALUE!');

/** The first error among already-worked-out values, if any. */
function firstError(...vs: (number | string | boolean | CellError | Range)[]): CellError | null {
  for (const v of vs) if (isError(v)) return v;
  return null;
}

/* Numbers the way SUM, AVERAGE, MIN and MAX see them: from a range, only the cells holding
   numbers; typed in directly, anything that reads as a number, booleans included. */
function numbers(args: Value[]): number[] | CellError {
  const out: number[] = [];
  const failed: { e: CellError | null } = { e: null };
  for (const a of args) {
    if (a instanceof Range) {
      a.each((v) => {
        if (typeof v === 'number') out.push(v);
        else if (isError(v) && !failed.e) failed.e = v;
      });
      if (failed.e) return failed.e;
    } else {
      const n = toNumber(a);
      if (isError(n)) return n;
      out.push(n);
    }
  }
  return out;
}

const sum = (ns: number[]) => {
  let s = 0;
  for (const n of ns) s += n;
  return s;
};

// ── maths ─────────────────────────────────────────────────────────────────

def('SUM', 'Maths', 'SUM(number1, [number2], …)', 'Adds numbers and ranges', [1, MANY], (args) => {
  const ns = numbers(args);
  return isError(ns) ? ns : finite(sum(ns));
});

def(
  'PRODUCT',
  'Maths',
  'PRODUCT(number1, [number2], …)',
  'Multiplies numbers together',
  [1, MANY],
  (args) => {
    const ns = numbers(args);
    return isError(ns) ? ns : finite(ns.reduce((p, n) => p * n, 1));
  },
);

def(
  'SUMSQ',
  'Maths',
  'SUMSQ(number1, [number2], …)',
  'Adds the squares of numbers',
  [1, MANY],
  (args) => {
    const ns = numbers(args);
    return isError(ns) ? ns : finite(ns.reduce((s, n) => s + n * n, 0));
  },
);

def(
  'SUMPRODUCT',
  'Maths',
  'SUMPRODUCT(array1, [array2], …)',
  'Multiplies ranges cell by cell and adds the products',
  [1, MANY],
  (args) => {
    const ranges = args.map((a) => (a instanceof Range ? a : null));
    if (ranges.some((r) => !r)) {
      // single values multiply as one-cell arrays
      const ns = args.map((a) => num(a));
      const e = ns.find(isError);
      return e ?? finite((ns as number[]).reduce((p, n) => p * n, 1));
    }
    const rs = ranges as Range[];
    const first = rs[0]!;
    if (rs.some((r) => r.rows !== first.rows || r.cols !== first.cols)) return err('#VALUE!');
    let total = 0;
    // walk the sparse cells of the first range: an empty cell makes its product 0 anyway
    const failed: { e: CellError | null } = { e: null };
    first.each((v, i, j) => {
      if (failed.e) return;
      let p = typeof v === 'number' ? v : 0;
      if (isError(v)) failed.e = v;
      for (let k = 1; k < rs.length && p !== 0; k++) {
        const w = rs[k]!.at(i, j);
        if (isError(w)) failed.e = w;
        p *= typeof w === 'number' ? w : 0;
      }
      total += p;
    });
    return failed.e ?? finite(total);
  },
);

def('ABS', 'Maths', 'ABS(number)', 'The number without its sign', [1, 1], (a) => {
  const n = num(a[0]);
  return isError(n) ? n : Math.abs(n);
});

const rounder = (mode: 'near' | 'up' | 'down') => (a: Value[]) => {
  const n = num(a[0]);
  const d = a.length > 1 ? int(a[1]) : 0;
  const e = firstError(n, d);
  if (e) return e;
  const x = n as number;
  const places = d as number;
  if (mode === 'near') return roundTo(x, places);
  const f = 10 ** places;
  const shifted = Math.abs(x) * f;
  // a whisker of tolerance, so 2.3 * 10 (= 22.999999999999996) does not round up to 24
  const r = mode === 'up' ? Math.ceil(shifted - 1e-9) : Math.floor(shifted + 1e-9);
  return finite((Math.sign(x) * r) / f);
};
def(
  'ROUND',
  'Maths',
  'ROUND(number, digits)',
  'Rounds to a number of decimal places',
  [1, 2],
  rounder('near'),
);
def('ROUNDUP', 'Maths', 'ROUNDUP(number, digits)', 'Rounds away from zero', [1, 2], rounder('up'));
def(
  'ROUNDDOWN',
  'Maths',
  'ROUNDDOWN(number, digits)',
  'Rounds towards zero',
  [1, 2],
  rounder('down'),
);

def('INT', 'Maths', 'INT(number)', 'Rounds down to a whole number', [1, 1], (a) => {
  const n = num(a[0]);
  return isError(n) ? n : Math.floor(n);
});
def('TRUNC', 'Maths', 'TRUNC(number, [digits])', 'Cuts off the decimals', [1, 2], rounder('down'));

def(
  'MOD',
  'Maths',
  'MOD(number, divisor)',
  'The remainder, with the sign of the divisor',
  [2, 2],
  (a) => {
    const n = num(a[0]);
    const d = num(a[1]);
    const e = firstError(n, d);
    if (e) return e;
    if (d === 0) return err('#DIV/0!');
    return finite((n as number) - (d as number) * Math.floor((n as number) / (d as number)));
  },
);

def('POWER', 'Maths', 'POWER(number, power)', 'A number raised to a power', [2, 2], (a) => {
  const n = num(a[0]);
  const p = num(a[1]);
  const e = firstError(n, p);
  if (e) return e;
  if (n === 0 && (p as number) <= 0) return err(p === 0 ? '#NUM!' : '#DIV/0!');
  return finite((n as number) ** (p as number));
});

def('SQRT', 'Maths', 'SQRT(number)', 'The square root', [1, 1], (a) => {
  const n = num(a[0]);
  if (isError(n)) return n;
  return n < 0 ? err('#NUM!') : Math.sqrt(n);
});

def('EXP', 'Maths', 'EXP(number)', 'e raised to a power', [1, 1], (a) => {
  const n = num(a[0]);
  return isError(n) ? n : finite(Math.exp(n));
});
def('LN', 'Maths', 'LN(number)', 'The natural logarithm', [1, 1], (a) => {
  const n = num(a[0]);
  if (isError(n)) return n;
  return n <= 0 ? err('#NUM!') : Math.log(n);
});
def('LOG10', 'Maths', 'LOG10(number)', 'The logarithm to base 10', [1, 1], (a) => {
  const n = num(a[0]);
  if (isError(n)) return n;
  return n <= 0 ? err('#NUM!') : Math.log10(n);
});
def(
  'LOG',
  'Maths',
  'LOG(number, [base])',
  'The logarithm to a base (10 if left out)',
  [1, 2],
  (a) => {
    const n = num(a[0]);
    const b = a.length > 1 && a[1] !== null ? num(a[1]) : 10;
    const e = firstError(n, b);
    if (e) return e;
    if ((n as number) <= 0 || (b as number) <= 0 || b === 1)
      return err(b === 1 ? '#DIV/0!' : '#NUM!');
    return finite(Math.log(n as number) / Math.log(b as number));
  },
);
def('PI', 'Maths', 'PI()', 'π, to 15 digits', [0, 0], () => Math.PI);
def('SIGN', 'Maths', 'SIGN(number)', '1, 0 or -1', [1, 1], (a) => {
  const n = num(a[0]);
  return isError(n) ? n : Math.sign(n) || 0;
});

const toMultiple = (dir: 'up' | 'down') => (a: Value[]) => {
  const n = num(a[0]);
  const s = a.length > 1 ? num(a[1]) : 1;
  const e = firstError(n, s);
  if (e) return e;
  if (s === 0) return 0;
  const step = Math.abs(s as number);
  const q = (n as number) / step;
  return finite((dir === 'up' ? Math.ceil(q - 1e-12) : Math.floor(q + 1e-12)) * step);
};
def(
  'CEILING',
  'Maths',
  'CEILING(number, [significance])',
  'Rounds up to a multiple',
  [1, 2],
  toMultiple('up'),
);
def(
  'FLOOR',
  'Maths',
  'FLOOR(number, [significance])',
  'Rounds down to a multiple',
  [1, 2],
  toMultiple('down'),
);
def(
  'MROUND',
  'Maths',
  'MROUND(number, multiple)',
  'Rounds to the nearest multiple',
  [2, 2],
  (a) => {
    const n = num(a[0]);
    const m = num(a[1]);
    const e = firstError(n, m);
    if (e) return e;
    if (m === 0) return 0;
    if (Math.sign(n as number) * Math.sign(m as number) < 0) return err('#NUM!');
    return finite(roundTo((n as number) / (m as number), 0) * (m as number));
  },
);

def(
  'RAND',
  'Maths',
  'RAND()',
  'A random number from 0 up to 1, new on every change',
  [0, 0],
  (_, env) => env.random(),
  true,
);
def(
  'RANDBETWEEN',
  'Maths',
  'RANDBETWEEN(bottom, top)',
  'A random whole number between two others, new on every change',
  [2, 2],
  (a, env) => {
    const lo = num(a[0]);
    const hi = num(a[1]);
    const e = firstError(lo, hi);
    if (e) return e;
    const l = Math.ceil(lo as number);
    const h = Math.floor(hi as number);
    if (l > h) return err('#NUM!');
    return l + Math.floor(env.random() * (h - l + 1));
  },
  true,
);

// ── statistics ────────────────────────────────────────────────────────────

def(
  'AVERAGE',
  'Statistics',
  'AVERAGE(number1, [number2], …)',
  'The mean of numbers and ranges',
  [1, MANY],
  (args) => {
    const ns = numbers(args);
    if (isError(ns)) return ns;
    return ns.length ? finite(sum(ns) / ns.length) : err('#DIV/0!');
  },
);
def(
  'MIN',
  'Statistics',
  'MIN(number1, [number2], …)',
  'The smallest number (0 if there are none)',
  [1, MANY],
  (args) => {
    const ns = numbers(args);
    if (isError(ns)) return ns;
    return ns.length ? ns.reduce((m, n) => (n < m ? n : m)) : 0;
  },
);
def(
  'MAX',
  'Statistics',
  'MAX(number1, [number2], …)',
  'The largest number (0 if there are none)',
  [1, MANY],
  (args) => {
    const ns = numbers(args);
    if (isError(ns)) return ns;
    return ns.length ? ns.reduce((m, n) => (n > m ? n : m)) : 0;
  },
);
def(
  'MEDIAN',
  'Statistics',
  'MEDIAN(number1, [number2], …)',
  'The middle number',
  [1, MANY],
  (args) => {
    const ns = numbers(args);
    if (isError(ns)) return ns;
    if (!ns.length) return err('#NUM!');
    ns.sort((x, y) => x - y);
    const mid = ns.length >> 1;
    return ns.length % 2 ? ns[mid]! : (ns[mid - 1]! + ns[mid]!) / 2;
  },
);

function variance(ns: number[], sample: boolean): number | CellError {
  const n = ns.length;
  if (n < (sample ? 2 : 1)) return err('#DIV/0!');
  const mean = sum(ns) / n;
  let ss = 0;
  for (const x of ns) ss += (x - mean) ** 2;
  return ss / (sample ? n - 1 : n);
}
const spread = (sample: boolean, root: boolean) => (args: Value[]) => {
  const ns = numbers(args);
  if (isError(ns)) return ns;
  const v = variance(ns, sample);
  return isError(v) ? v : root ? Math.sqrt(v) : v;
};
def(
  'STDEV',
  'Statistics',
  'STDEV(number1, …)',
  'Standard deviation of a sample',
  [1, MANY],
  spread(true, true),
);
def(
  'STDEV.S',
  'Statistics',
  'STDEV.S(number1, …)',
  'Standard deviation of a sample',
  [1, MANY],
  spread(true, true),
);
def(
  'STDEV.P',
  'Statistics',
  'STDEV.P(number1, …)',
  'Standard deviation of a whole population',
  [1, MANY],
  spread(false, true),
);
def(
  'STDEVP',
  'Statistics',
  'STDEVP(number1, …)',
  'Standard deviation of a whole population',
  [1, MANY],
  spread(false, true),
);
def('VAR', 'Statistics', 'VAR(number1, …)', 'Variance of a sample', [1, MANY], spread(true, false));
def(
  'VAR.S',
  'Statistics',
  'VAR.S(number1, …)',
  'Variance of a sample',
  [1, MANY],
  spread(true, false),
);
def(
  'VAR.P',
  'Statistics',
  'VAR.P(number1, …)',
  'Variance of a whole population',
  [1, MANY],
  spread(false, false),
);

const kth = (largest: boolean) => (a: Value[]) => {
  const ns = numbers([a[0] ?? null]);
  const k = int(a[1]);
  if (isError(ns)) return ns;
  if (isError(k)) return k;
  if (k < 1 || k > ns.length) return err('#NUM!');
  ns.sort((x, y) => (largest ? y - x : x - y));
  return ns[k - 1]!;
};
def('LARGE', 'Statistics', 'LARGE(array, k)', 'The k-th largest number', [2, 2], kth(true));
def('SMALL', 'Statistics', 'SMALL(array, k)', 'The k-th smallest number', [2, 2], kth(false));

const rank = (a: Value[]) => {
  const n = num(a[0]);
  const r = range(a[1]);
  const order = a.length > 2 ? num(a[2]) : 0;
  const e = firstError(n, r, order);
  if (e) return e;
  const ns = numbers([r]);
  if (isError(ns)) return ns;
  if (!ns.includes(n as number)) return err('#N/A');
  const ahead = ns.filter((x) => (order ? x < (n as number) : x > (n as number))).length;
  return ahead + 1;
};
def(
  'RANK',
  'Statistics',
  'RANK(number, ref, [order])',
  'Where a number ranks in a list (1 = largest)',
  [2, 3],
  rank,
);
def(
  'RANK.EQ',
  'Statistics',
  'RANK.EQ(number, ref, [order])',
  'Where a number ranks in a list (1 = largest)',
  [2, 3],
  rank,
);

def(
  'COUNT',
  'Statistics',
  'COUNT(value1, [value2], …)',
  'How many numbers there are',
  [1, MANY],
  (args) => {
    let n = 0;
    for (const a of args) {
      if (a instanceof Range) a.each((v) => void (typeof v === 'number' && n++));
      else if (typeof a === 'number' || typeof a === 'boolean') n++;
      else if (typeof a === 'string' && parseNumber(a) !== null) n++;
    }
    return n;
  },
);
def(
  'COUNTA',
  'Statistics',
  'COUNTA(value1, [value2], …)',
  'How many values there are, of any kind',
  [1, MANY],
  (args) => {
    let n = 0;
    for (const a of args) {
      if (a instanceof Range) a.each(() => void n++);
      else if (a !== null) n++;
    }
    return n;
  },
);
def('COUNTBLANK', 'Statistics', 'COUNTBLANK(range)', 'How many cells are empty', [1, 1], (a) => {
  const r = range(a[0]);
  if (isError(r)) return r;
  let filled = 0;
  r.each((v) => void (v !== '' && filled++));
  return r.size - filled;
});

/* The *IF and *IFS family share one walk. With every criterion unable to match an empty cell,
   only the first range's filled cells are visited, so =COUNTIF(A:A, ">5") costs the cells in
   A. Otherwise every position has to be tried. */
interface Condition {
  range: Range;
  crit: Criterion;
}

function conditions(args: Value[], from: number): Condition[] | CellError {
  const out: Condition[] = [];
  for (let i = from; i < args.length; i += 2) {
    const r = range(args[i]);
    if (isError(r)) return r;
    const c = scalar(args[i + 1] ?? null);
    out.push({ range: r, crit: criterion(c) });
  }
  const first = out[0]!.range;
  if (out.some((c) => c.range.rows !== first.rows || c.range.cols !== first.cols))
    return err('#VALUE!');
  return out;
}

function eachMatch(conds: Condition[], visit: (i: number, j: number) => void) {
  const [lead, ...rest] = conds as [Condition, ...Condition[]];
  const passes = (i: number, j: number) => rest.every((c) => c.crit.test(c.range.at(i, j)));
  if (!conds.some((c) => c.crit.matchesEmpty)) {
    lead.range.each((v, i, j) => {
      if (lead.crit.test(v) && passes(i, j)) visit(i, j);
    });
    return;
  }
  for (let i = 0; i < lead.range.rows; i++) {
    for (let j = 0; j < lead.range.cols; j++) {
      if (lead.crit.test(lead.range.at(i, j)) && passes(i, j)) visit(i, j);
    }
  }
}

/** The cells of a "sum range": the same shape as the criteria range, from its top-left. */
const alongside = (target: Range, shape: Range) =>
  new Range(
    target.src,
    target.r1,
    target.c1,
    target.r1 + shape.rows - 1,
    target.c1 + shape.cols - 1,
  );

function collectIf(args: Value[], hasTarget: boolean, single: boolean): number[] | CellError {
  // single: (range, criterion, [target]); multi: (target, range1, crit1, range2, crit2, …)
  let conds: Condition[] | CellError;
  let target: Range;
  if (single) {
    conds = conditions(args.slice(0, 2), 0);
    if (isError(conds)) return conds;
    const t = hasTarget && args.length > 2 ? range(args[2]) : conds[0]!.range;
    if (isError(t)) return t;
    target = alongside(t, conds[0]!.range);
  } else {
    const t = range(args[0]);
    if (isError(t)) return t;
    conds = conditions(args, 1);
    if (isError(conds)) return conds;
    if (t.rows !== conds[0]!.range.rows || t.cols !== conds[0]!.range.cols) return err('#VALUE!');
    target = t;
  }
  const out: number[] = [];
  const failed: { e: CellError | null } = { e: null };
  eachMatch(conds, (i, j) => {
    const v = target.at(i, j);
    if (typeof v === 'number') out.push(v);
    else if (isError(v)) failed.e ??= v;
  });
  return failed.e ?? out;
}

def(
  'COUNTIF',
  'Statistics',
  'COUNTIF(range, criterion)',
  'How many cells meet a condition, like ">10" or "a*"',
  [2, 2],
  (a) => {
    const conds = conditions(a, 0);
    if (isError(conds)) return conds;
    let n = 0;
    eachMatch(conds, () => void n++);
    return n;
  },
);
def(
  'COUNTIFS',
  'Statistics',
  'COUNTIFS(range1, criterion1, [range2, criterion2], …)',
  'How many rows meet every condition',
  [2, MANY],
  (a) => {
    if (a.length % 2) return err('#VALUE!');
    const conds = conditions(a, 0);
    if (isError(conds)) return conds;
    let n = 0;
    eachMatch(conds, () => void n++);
    return n;
  },
);
def(
  'SUMIF',
  'Maths',
  'SUMIF(range, criterion, [sum_range])',
  'Adds the cells that meet a condition',
  [2, 3],
  (a) => {
    const ns = collectIf(a, true, true);
    return isError(ns) ? ns : finite(sum(ns));
  },
);
def(
  'SUMIFS',
  'Maths',
  'SUMIFS(sum_range, range1, criterion1, [range2, criterion2], …)',
  'Adds the cells whose rows meet every condition',
  [3, MANY],
  (a) => {
    if (a.length % 2 === 0) return err('#VALUE!');
    const ns = collectIf(a, true, false);
    return isError(ns) ? ns : finite(sum(ns));
  },
);
def(
  'AVERAGEIF',
  'Statistics',
  'AVERAGEIF(range, criterion, [average_range])',
  'The mean of the cells that meet a condition',
  [2, 3],
  (a) => {
    const ns = collectIf(a, true, true);
    if (isError(ns)) return ns;
    return ns.length ? finite(sum(ns) / ns.length) : err('#DIV/0!');
  },
);
def(
  'AVERAGEIFS',
  'Statistics',
  'AVERAGEIFS(average_range, range1, criterion1, …)',
  'The mean of the cells whose rows meet every condition',
  [3, MANY],
  (a) => {
    const ns = collectIf(a, true, false);
    if (isError(ns)) return ns;
    return ns.length ? finite(sum(ns) / ns.length) : err('#DIV/0!');
  },
);
def(
  'MAXIFS',
  'Statistics',
  'MAXIFS(max_range, range1, criterion1, …)',
  'The largest value whose row meets every condition',
  [3, MANY],
  (a) => {
    const ns = collectIf(a, true, false);
    if (isError(ns)) return ns;
    return ns.length ? Math.max(...ns) : 0;
  },
);
def(
  'MINIFS',
  'Statistics',
  'MINIFS(min_range, range1, criterion1, …)',
  'The smallest value whose row meets every condition',
  [3, MANY],
  (a) => {
    const ns = collectIf(a, true, false);
    if (isError(ns)) return ns;
    return ns.length ? Math.min(...ns) : 0;
  },
);

// ── logic ─────────────────────────────────────────────────────────────────

lazy(
  'IF',
  'Logic',
  'IF(test, [if_true], [if_false])',
  'One value if a test is true, another if not',
  [1, 3],
  (args, _env, ev) => {
    const t = toBoolean(scalar(ev(args[0]!)));
    if (isError(t)) return t;
    const branch = args[t ? 1 : 2];
    if (!branch) return t;
    return branch.type === 'missing' ? 0 : ev(branch);
  },
);
lazy(
  'IFS',
  'Logic',
  'IFS(test1, value1, [test2, value2], …)',
  'The value for the first test that is true',
  [2, MANY],
  (args, _env, ev) => {
    if (args.length % 2) return err('#VALUE!');
    for (let i = 0; i < args.length; i += 2) {
      const t = toBoolean(scalar(ev(args[i]!)));
      if (isError(t)) return t;
      if (t) return ev(args[i + 1]!);
    }
    return err('#N/A');
  },
);
lazy(
  'IFERROR',
  'Logic',
  'IFERROR(value, value_if_error)',
  'A fallback when a value is an error',
  [2, 2],
  (args, _env, ev) => {
    const v = ev(args[0]!);
    return isError(scalar(v)) ? ev(args[1]!) : v;
  },
);
lazy(
  'IFNA',
  'Logic',
  'IFNA(value, value_if_na)',
  'A fallback when a value is #N/A',
  [2, 2],
  (args, _env, ev) => {
    const v = ev(args[0]!);
    const s = scalar(v);
    return isError(s) && s.code === '#N/A' ? ev(args[1]!) : v;
  },
);
lazy(
  'CHOOSE',
  'Lookup',
  'CHOOSE(index, value1, [value2], …)',
  'The value at a position in a list',
  [2, MANY],
  (args, _env, ev) => {
    const i = toNumber(scalar(ev(args[0]!)));
    if (isError(i)) return i;
    const k = Math.trunc(i);
    if (k < 1 || k >= args.length) return err('#VALUE!');
    return ev(args[k]!);
  },
);
lazy(
  'SWITCH',
  'Logic',
  'SWITCH(expression, value1, result1, …, [default])',
  'The result for the first value that matches',
  [3, MANY],
  (args, _env, ev) => {
    const x = scalar(ev(args[0]!));
    if (isError(x)) return x;
    let i = 1;
    for (; i + 1 < args.length; i += 2) {
      const v = scalar(ev(args[i]!));
      if (!isError(v) && compare(x, v) === 0 && typeof x === typeof v) return ev(args[i + 1]!);
    }
    return i < args.length ? ev(args[i]!) : err('#N/A');
  },
);

/* AND, OR and XOR read booleans and numbers from ranges and ignore text and empty cells. */
function truths(args: Value[]): boolean[] | CellError {
  const out: boolean[] = [];
  const failed: { e: CellError | null } = { e: null };
  for (const a of args) {
    if (a instanceof Range) {
      a.each((v) => {
        if (typeof v === 'boolean') out.push(v);
        else if (typeof v === 'number') out.push(v !== 0);
        else if (isError(v)) failed.e ??= v;
      });
      if (failed.e) return failed.e;
    } else if (a !== null) {
      const b = toBoolean(a);
      if (isError(b)) return b;
      out.push(b);
    }
  }
  return out.length ? out : err('#VALUE!');
}
def('AND', 'Logic', 'AND(test1, [test2], …)', 'TRUE if every test is true', [1, MANY], (a) => {
  const t = truths(a);
  return isError(t) ? t : t.every(Boolean);
});
def('OR', 'Logic', 'OR(test1, [test2], …)', 'TRUE if any test is true', [1, MANY], (a) => {
  const t = truths(a);
  return isError(t) ? t : t.some(Boolean);
});
def(
  'XOR',
  'Logic',
  'XOR(test1, [test2], …)',
  'TRUE if an odd number of tests are true',
  [1, MANY],
  (a) => {
    const t = truths(a);
    return isError(t) ? t : t.filter(Boolean).length % 2 === 1;
  },
);
def('NOT', 'Logic', 'NOT(test)', 'The opposite of a test', [1, 1], (a) => {
  const b = bool(a[0]);
  return isError(b) ? b : !b;
});
def('TRUE', 'Logic', 'TRUE()', 'The value TRUE', [0, 0], () => true);
def('FALSE', 'Logic', 'FALSE()', 'The value FALSE', [0, 0], () => false);

// ── information ───────────────────────────────────────────────────────────

const is = (name: string, about: string, test: (v: Scalar) => boolean) =>
  def(name, 'Information', `${name}(value)`, about, [1, 1], (a) => test(scalar(a[0] ?? null)));
is('ISBLANK', 'TRUE if the cell is empty', (v) => v === null);
is('ISNUMBER', 'TRUE if the value is a number', (v) => typeof v === 'number');
is('ISTEXT', 'TRUE if the value is text', (v) => typeof v === 'string');
is('ISLOGICAL', 'TRUE if the value is TRUE or FALSE', (v) => typeof v === 'boolean');
is('ISERROR', 'TRUE if the value is any error', (v) => isError(v));
is(
  'ISERR',
  'TRUE if the value is an error other than #N/A',
  (v) => isError(v) && v.code !== '#N/A',
);
is('ISNA', 'TRUE if the value is #N/A', (v) => isError(v) && v.code === '#N/A');
def('ISEVEN', 'Information', 'ISEVEN(number)', 'TRUE if the number is even', [1, 1], (a) => {
  const n = int(a[0]);
  return isError(n) ? n : n % 2 === 0;
});
def('ISODD', 'Information', 'ISODD(number)', 'TRUE if the number is odd', [1, 1], (a) => {
  const n = int(a[0]);
  return isError(n) ? n : Math.abs(n % 2) === 1;
});
def('NA', 'Information', 'NA()', 'The error #N/A, "no value available"', [0, 0], () => err('#N/A'));
def(
  'N',
  'Information',
  'N(value)',
  'A number for the value: numbers stay, TRUE is 1, the rest 0',
  [1, 1],
  (a) => {
    const v = scalar(a[0] ?? null);
    if (isError(v)) return v;
    return typeof v === 'number' ? v : v === true ? 1 : 0;
  },
);

// ── lookup ────────────────────────────────────────────────────────────────

/* Exact matching treats text without case and with wildcards, like Excel. Approximate
   matching walks only the filled positions and binary-searches them, assuming ascending
   order, and finds the last value that is not greater than the one sought. */
function exactIndex(line: Range, wanted: Scalar, reverse = false, wild = true): number {
  const positions = line.filled();
  const re = wild && typeof wanted === 'string' && /[*?~]/.test(wanted) ? wildcard(wanted) : null;
  const n = positions.length;
  for (let k = 0; k < n; k++) {
    const p = positions[reverse ? n - 1 - k : k]!;
    const v = line.line(p);
    if (re ? typeof v === 'string' && re.test(v) : sameValue(v, wanted)) return p;
  }
  return -1;
}

function sameValue(v: Scalar, wanted: Scalar): boolean {
  if (v === null || isError(v)) return false;
  if (typeof v !== typeof wanted) return false;
  return compare(v, wanted) === 0;
}

function approxIndex(line: Range, wanted: Scalar): number {
  const positions = line.filled();
  let lo = 0;
  let hi = positions.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = line.line(positions[mid]!);
    // values of another type sort out of the way, as in Excel
    if (!isError(v) && typeof v === typeof wanted && compare(v, wanted) <= 0) {
      found = positions[mid]!;
      lo = mid + 1;
    } else if (!isError(v) && typeof v === typeof wanted) {
      hi = mid - 1;
    } else if (compare(v, wanted) < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return found;
}

const column = (r: Range, j: number) => new Range(r.src, r.r1, r.c1 + j, r.r2, r.c1 + j);
const row = (r: Range, i: number) => new Range(r.src, r.r1 + i, r.c1, r.r1 + i, r.c2);

def(
  'VLOOKUP',
  'Lookup',
  'VLOOKUP(lookup_value, table, column, [approximate])',
  'Finds a value in the first column and returns one from the same row',
  [3, 4],
  (a) => {
    const wanted = scalar(a[0] ?? null);
    const table = range(a[1]);
    const col = int(a[2]);
    const approx = a.length > 3 && a[3] !== null ? bool(a[3]) : true;
    const e = firstError(table, col, approx);
    if (e) return e;
    if (isError(wanted)) return wanted;
    const t = table as Range;
    if ((col as number) < 1) return err('#VALUE!');
    if ((col as number) > t.cols) return err('#REF!');
    const first = column(t, 0);
    const i = approx ? approxIndex(first, wanted) : exactIndex(first, wanted);
    return i < 0 ? err('#N/A') : t.at(i, (col as number) - 1);
  },
);
def(
  'HLOOKUP',
  'Lookup',
  'HLOOKUP(lookup_value, table, row, [approximate])',
  'Finds a value in the first row and returns one from the same column',
  [3, 4],
  (a) => {
    const wanted = scalar(a[0] ?? null);
    const table = range(a[1]);
    const r = int(a[2]);
    const approx = a.length > 3 && a[3] !== null ? bool(a[3]) : true;
    const e = firstError(table, r, approx);
    if (e) return e;
    if (isError(wanted)) return wanted;
    const t = table as Range;
    if ((r as number) < 1) return err('#VALUE!');
    if ((r as number) > t.rows) return err('#REF!');
    const first = row(t, 0);
    const j = approx ? approxIndex(first, wanted) : exactIndex(first, wanted);
    return j < 0 ? err('#N/A') : t.at((r as number) - 1, j);
  },
);
def(
  'MATCH',
  'Lookup',
  'MATCH(lookup_value, range, [match_type])',
  'The position of a value in a row or column',
  [2, 3],
  (a) => {
    const wanted = scalar(a[0] ?? null);
    const r = range(a[1]);
    const type = a.length > 2 && a[2] !== null ? int(a[2]) : 1;
    const e = firstError(r, type);
    if (e) return e;
    if (isError(wanted)) return wanted;
    const line = r as Range;
    if (!line.isLine) return err('#N/A');
    let k: number;
    if (type === 0) k = exactIndex(line, wanted);
    else if ((type as number) > 0) k = approxIndex(line, wanted);
    else {
      // descending: the smallest value that is not less than the one sought
      k = -1;
      for (let p = 0; p < line.length; p++) {
        const v = line.line(p);
        if (v === null || isError(v)) continue;
        if (compare(v, wanted) >= 0) k = p;
        else break;
      }
    }
    return k < 0 ? err('#N/A') : k + 1;
  },
);
def(
  'INDEX',
  'Lookup',
  'INDEX(range, row, [column])',
  'The value at a row and column of a range',
  [2, 3],
  (a) => {
    const r = range(a[0]);
    if (isError(r)) return r;
    let i = int(a[1]);
    let j = a.length > 2 && a[2] !== null ? int(a[2]) : 0;
    const e = firstError(i, j);
    if (e) return e;
    // one index into a single row counts along the row
    if (r.rows === 1 && a.length === 2) [i, j] = [1, i];
    const ri = i as number;
    const cj = j as number;
    if (ri < 0 || cj < 0 || ri > r.rows || cj > r.cols) return err('#REF!');
    if (ri === 0 && cj === 0) return r;
    if (ri === 0) return column(r, cj - 1);
    if (cj === 0) return r.cols === 1 ? r.at(ri - 1, 0) : row(r, ri - 1);
    return r.at(ri - 1, cj - 1);
  },
);
def(
  'XLOOKUP',
  'Lookup',
  'XLOOKUP(lookup_value, lookup_range, return_range, [if_not_found], [match_mode], [search_mode])',
  'Finds a value and returns the one beside it, exact by default',
  [3, 6],
  (a) => {
    const wanted = scalar(a[0] ?? null);
    const look = range(a[1]);
    const ret = range(a[2]);
    const mode = a.length > 4 && a[4] !== null ? int(a[4]) : 0;
    const search = a.length > 5 && a[5] !== null ? int(a[5]) : 1;
    const e = firstError(look, ret, mode, search);
    if (e) return e;
    if (isError(wanted)) return wanted;
    const l = look as Range;
    const r = ret as Range;
    if (!l.isLine) return err('#VALUE!');
    const reverse = (search as number) < 0;
    let k = -1;
    if (mode === 0 || mode === 2) k = exactIndex(l, wanted, reverse, mode === 2);
    else {
      // -1: exact or the next smaller; 1: exact or the next larger
      let best: Scalar = null;
      for (let p = 0; p < l.length; p++) {
        const v = l.line(p);
        if (v === null || isError(v) || typeof v !== typeof wanted) continue;
        const c = compare(v, wanted);
        if (c === 0) {
          k = p;
          break;
        }
        const better =
          mode === -1
            ? c < 0 && (best === null || compare(v, best) > 0)
            : c > 0 && (best === null || compare(v, best) < 0);
        if (better) {
          best = v;
          k = p;
        }
      }
    }
    if (k < 0) return a.length > 3 && a[3] !== null ? (a[3] as Value) : err('#N/A');
    if (r.rows === l.rows && l.cols === 1) return r.cols === 1 ? r.at(k, 0) : row(r, k);
    if (r.cols === l.cols && l.rows === 1) return r.rows === 1 ? r.at(0, k) : column(r, k);
    return err('#VALUE!');
  },
);
def('ROWS', 'Lookup', 'ROWS(range)', 'How many rows a range has', [1, 1], (a) => {
  const r = range(a[0]);
  return isError(r) ? r : r.rows;
});
def('COLUMNS', 'Lookup', 'COLUMNS(range)', 'How many columns a range has', [1, 1], (a) => {
  const r = range(a[0]);
  return isError(r) ? r : r.cols;
});
def(
  'ROW',
  'Lookup',
  'ROW([reference])',
  'The row number of a cell (this one if left out)',
  [0, 1],
  (a, env) => {
    if (!a.length || a[0] === null) return env.row + 1;
    const r = range(a[0]);
    return isError(r) ? r : r.r1 + 1;
  },
);
def(
  'COLUMN',
  'Lookup',
  'COLUMN([reference])',
  'The column number of a cell (this one if left out)',
  [0, 1],
  (a, env) => {
    if (!a.length || a[0] === null) return env.col + 1;
    const r = range(a[0]);
    return isError(r) ? r : r.c1 + 1;
  },
);

// ── text ──────────────────────────────────────────────────────────────────

/* Text functions count characters, not UTF-16 code units, so an emoji is one character and
   LEFT never splits it in half. */
const chars = (s: string) => Array.from(s);

function joinText(args: Value[], delimiter: string, skipEmpty: boolean): string | CellError {
  const parts: string[] = [];
  const failed: { e: CellError | null } = { e: null };
  for (const a of args) {
    if (a instanceof Range) {
      a.eachInOrder((v) => {
        const t = toText(v);
        if (isError(t)) failed.e ??= t;
        else if (!skipEmpty || t !== '') parts.push(t);
      });
      if (failed.e) return failed.e;
    } else {
      const t = toText(a);
      if (isError(t)) return t;
      if (!skipEmpty || t !== '') parts.push(t);
    }
  }
  const out = parts.join(delimiter);
  return out.length > 32_767 ? err('#VALUE!') : out;
}

def(
  'CONCAT',
  'Text',
  'CONCAT(text1, [text2], …)',
  'Joins text and ranges into one',
  [1, MANY],
  (a) => joinText(a, '', false),
);
def(
  'CONCATENATE',
  'Text',
  'CONCATENATE(text1, [text2], …)',
  'Joins text into one',
  [1, MANY],
  (a) => joinText(a, '', false),
);
def(
  'TEXTJOIN',
  'Text',
  'TEXTJOIN(delimiter, ignore_empty, text1, …)',
  'Joins text with a delimiter between the pieces',
  [3, MANY],
  (a) => {
    const d = text(a[0]);
    const skip = bool(a[1]);
    const e = firstError(d, skip);
    if (e) return e;
    return joinText(a.slice(2), d as string, skip as boolean);
  },
);
def('LEN', 'Text', 'LEN(text)', 'How many characters', [1, 1], (a) => {
  const t = text(a[0]);
  return isError(t) ? t : chars(t).length;
});
def('LEFT', 'Text', 'LEFT(text, [count])', 'The first characters', [1, 2], (a) => {
  const t = text(a[0]);
  const n = a.length > 1 ? int(a[1]) : 1;
  const e = firstError(t, n);
  if (e) return e;
  if ((n as number) < 0) return err('#VALUE!');
  return chars(t as string)
    .slice(0, n as number)
    .join('');
});
def('RIGHT', 'Text', 'RIGHT(text, [count])', 'The last characters', [1, 2], (a) => {
  const t = text(a[0]);
  const n = a.length > 1 ? int(a[1]) : 1;
  const e = firstError(t, n);
  if (e) return e;
  if ((n as number) < 0) return err('#VALUE!');
  const cs = chars(t as string);
  return n === 0 ? '' : cs.slice(Math.max(0, cs.length - (n as number))).join('');
});
def('MID', 'Text', 'MID(text, start, count)', 'Characters from the middle', [3, 3], (a) => {
  const t = text(a[0]);
  const s = int(a[1]);
  const n = int(a[2]);
  const e = firstError(t, s, n);
  if (e) return e;
  if ((s as number) < 1 || (n as number) < 0) return err('#VALUE!');
  return chars(t as string)
    .slice((s as number) - 1, (s as number) - 1 + (n as number))
    .join('');
});
const mapText = (name: string, about: string, f: (s: string) => string) =>
  def(name, 'Text', `${name}(text)`, about, [1, 1], (a) => {
    const t = text(a[0]);
    return isError(t) ? t : f(t);
  });
mapText('UPPER', 'In capitals', (s) => s.toUpperCase());
mapText('LOWER', 'In lower case', (s) => s.toLowerCase());
// Excel capitalises after anything that is not a letter, so o'brien becomes O'Brien
mapText('PROPER', 'With Each Word Capitalised', (s) =>
  s
    .toLowerCase()
    .replace(/(^|\P{L})(\p{L})/gu, (_, before: string, ch: string) => before + ch.toUpperCase()),
);
mapText('TRIM', 'Without spaces at the ends, and single spaces between words', (s) =>
  s.replace(/ +/g, ' ').trim(),
);

def(
  'SUBSTITUTE',
  'Text',
  'SUBSTITUTE(text, old_text, new_text, [instance])',
  'Replaces text that matches, every time or just once',
  [3, 4],
  (a) => {
    const t = text(a[0]);
    const o = text(a[1]);
    const n = text(a[2]);
    const which = a.length > 3 && a[3] !== null ? int(a[3]) : null;
    const e = firstError(t, o, n, which ?? 0);
    if (e) return e;
    const [s, old, neu] = [t as string, o as string, n as string];
    if (!old) return s;
    if (which === null) return s.split(old).join(neu);
    if ((which as number) < 1) return err('#VALUE!');
    let at = -1;
    for (let k = 0; k < (which as number); k++) {
      at = s.indexOf(old, at + 1);
      if (at < 0) return s;
    }
    return s.slice(0, at) + neu + s.slice(at + old.length);
  },
);
def(
  'REPLACE',
  'Text',
  'REPLACE(text, start, count, new_text)',
  'Replaces characters at a position',
  [4, 4],
  (a) => {
    const t = text(a[0]);
    const s = int(a[1]);
    const n = int(a[2]);
    const neu = text(a[3]);
    const e = firstError(t, s, n, neu);
    if (e) return e;
    if ((s as number) < 1 || (n as number) < 0) return err('#VALUE!');
    const cs = chars(t as string);
    cs.splice((s as number) - 1, n as number, neu as string);
    return cs.join('');
  },
);
const finder = (insensitive: boolean) => (a: Value[]) => {
  const f = text(a[0]);
  const w = text(a[1]);
  const s = a.length > 2 ? int(a[2]) : 1;
  const e = firstError(f, w, s);
  if (e) return e;
  const within = chars(w as string);
  const start = (s as number) - 1;
  if (start < 0 || start > within.length) return err('#VALUE!');
  const hay = within.slice(start).join('');
  let at: number;
  if (insensitive) {
    // the same wildcards as the criteria, but found anywhere rather than matching the whole
    const re = new RegExp(wildcard(f as string).source.slice(1, -1), 'is');
    const found = re.exec(hay);
    at = found ? chars(hay.slice(0, found.index)).length : -1;
  } else {
    const i = hay.indexOf(f as string);
    at = i < 0 ? -1 : chars(hay.slice(0, i)).length;
  }
  return at < 0 ? err('#VALUE!') : start + at + 1;
};
def(
  'FIND',
  'Text',
  'FIND(find_text, within_text, [start])',
  'Where some text starts (case matters)',
  [2, 3],
  finder(false),
);
def(
  'SEARCH',
  'Text',
  'SEARCH(find_text, within_text, [start])',
  'Where some text starts, ignoring case, with wildcards',
  [2, 3],
  finder(true),
);
def('REPT', 'Text', 'REPT(text, times)', 'Text repeated', [2, 2], (a) => {
  const t = text(a[0]);
  const n = int(a[1]);
  const e = firstError(t, n);
  if (e) return e;
  if ((n as number) < 0 || (t as string).length * (n as number) > 32_767) return err('#VALUE!');
  return (t as string).repeat(n as number);
});
def(
  'EXACT',
  'Text',
  'EXACT(text1, text2)',
  'TRUE if two texts are the same, case included',
  [2, 2],
  (a) => {
    const x = text(a[0]);
    const y = text(a[1]);
    const e = firstError(x, y);
    return e ?? x === y;
  },
);
def('VALUE', 'Text', 'VALUE(text)', 'The number some text stands for', [1, 1], (a) => {
  const v = scalar(a[0] ?? null);
  if (typeof v === 'number' || isError(v)) return v;
  const t = toText(v) as string;
  return parseNumber(t) ?? parseDate(t) ?? err('#VALUE!');
});
def(
  'TEXT',
  'Text',
  'TEXT(value, format)',
  'A number written in a format, like "0.00" or "dd/mm/yyyy"',
  [2, 2],
  (a) => {
    const v = scalar(a[0] ?? null);
    const f = text(a[1]);
    if (isError(v)) return v;
    if (isError(f)) return f;
    if (typeof v !== 'number') return toText(v);
    return formatValue(v, f);
  },
);
def('CHAR', 'Text', 'CHAR(number)', 'The character with that code', [1, 1], (a) => {
  const n = int(a[0]);
  if (isError(n)) return n;
  return n < 1 || n > 65_535 ? err('#VALUE!') : String.fromCharCode(n);
});
def('CODE', 'Text', 'CODE(text)', 'The code of the first character', [1, 1], (a) => {
  const t = text(a[0]);
  if (isError(t)) return t;
  return t ? t.codePointAt(0)! : err('#VALUE!');
});

// ── dates ─────────────────────────────────────────────────────────────────

def(
  'DATE',
  'Date',
  'DATE(year, month, day)',
  'The date, as a number; months and days may overflow',
  [3, 3],
  (a) => {
    const y = int(a[0]);
    const m = int(a[1]);
    const d = int(a[2]);
    const e = firstError(y, m, d);
    if (e) return e;
    let year = y as number;
    if (year < 1900) year += 1900; // Excel's rule: DATE(25, 1, 1) is 1925
    if (year < 1900 || year > 9999) return err('#NUM!');
    const s = toSerial(year, m as number, d as number);
    return s < 0 ? err('#NUM!') : s;
  },
);
const datePart = (name: string, about: string, part: (s: number) => number) =>
  def(name, 'Date', `${name}(date)`, about, [1, 1], (a) => {
    const s = num(a[0]);
    if (isError(s)) return s;
    return s < 0 ? err('#NUM!') : part(s);
  });
datePart('YEAR', 'The year of a date', (s) => fromSerial(s).y);
datePart('MONTH', 'The month of a date, 1 to 12', (s) => fromSerial(s).m);
datePart('DAY', 'The day of the month, 1 to 31', (s) => fromSerial(s).d);
datePart(
  'HOUR',
  'The hour of a time, 0 to 23',
  (s) => Math.floor(Math.round((s % 1) * 86_400) / 3600) % 24,
);
datePart(
  'MINUTE',
  'The minute of a time, 0 to 59',
  (s) => Math.floor(Math.round((s % 1) * 86_400) / 60) % 60,
);
datePart('SECOND', 'The second of a time, 0 to 59', (s) => Math.round((s % 1) * 86_400) % 60);
def(
  'WEEKDAY',
  'Date',
  'WEEKDAY(date, [type])',
  'The day of the week: 1 is Sunday (or Monday with type 2)',
  [1, 2],
  (a) => {
    const s = num(a[0]);
    const t = a.length > 1 && a[1] !== null ? int(a[1]) : 1;
    const e = firstError(s, t);
    if (e) return e;
    const w = weekday(s as number);
    if (t === 1) return w + 1;
    if (t === 2) return ((w + 6) % 7) + 1;
    if (t === 3) return (w + 6) % 7;
    return err('#NUM!');
  },
);
def('TODAY', 'Date', 'TODAY()', "Today's date", [0, 0], (_, env) => Math.floor(env.now), true);
def('NOW', 'Date', 'NOW()', 'The date and time now', [0, 0], (_, env) => env.now, true);
def(
  'EDATE',
  'Date',
  'EDATE(start, months)',
  'The same day some months later (or earlier)',
  [2, 2],
  (a) => {
    const s = num(a[0]);
    const m = int(a[1]);
    const e = firstError(s, m);
    if (e) return e;
    const { y, m: mo, d } = fromSerial(s as number);
    const target = mo + (m as number);
    const ty = y + Math.floor((target - 1) / 12);
    const tm = ((((target - 1) % 12) + 12) % 12) + 1;
    return toSerial(ty, tm, Math.min(d, daysInMonth(ty, tm)));
  },
);
def(
  'EOMONTH',
  'Date',
  'EOMONTH(start, months)',
  'The last day of the month, some months away',
  [2, 2],
  (a) => {
    const s = num(a[0]);
    const m = int(a[1]);
    const e = firstError(s, m);
    if (e) return e;
    const { y, m: mo } = fromSerial(s as number);
    return toSerial(y, mo + (m as number) + 1, 0);
  },
);
def('DAYS', 'Date', 'DAYS(end, start)', 'The number of days between two dates', [2, 2], (a) => {
  const x = num(a[0]);
  const y = num(a[1]);
  const e = firstError(x, y);
  return e ?? Math.floor(x as number) - Math.floor(y as number);
});

/** Names in alphabetical order, for autocomplete. */
export const FUNCTION_NAMES = [...FUNCTIONS.keys()].sort();

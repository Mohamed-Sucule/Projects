/* What a cell can hold once it has been worked out, and the rules for turning one kind into
   another. The rules are Excel's, because that is what anyone typing into a grid expects:
   an empty cell is 0 to arithmetic and "" to text, TRUE is 1, "3" + 1 is 4, and "three" + 1
   is #VALUE!. */

export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;

export type ErrorCode =
  '#NULL!' | '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#NUM!' | '#N/A' | '#CYCLE!' | '#ERROR!';

export const ERROR_CODES: readonly ErrorCode[] = [
  '#NULL!',
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#NUM!',
  '#N/A',
  '#CYCLE!',
  '#ERROR!',
];

export interface CellError {
  readonly kind: 'error';
  readonly code: ErrorCode;
}

/** One frozen object per code, so errors compare with === and cost nothing to pass around. */
const ERRORS = new Map<ErrorCode, CellError>(
  ERROR_CODES.map((code) => [code, Object.freeze({ kind: 'error', code })]),
);

export const err = (code: ErrorCode): CellError => ERRORS.get(code)!;

/** null is an empty cell. */
export type Scalar = number | string | boolean | null | CellError;

export const isError = (v: unknown): v is CellError =>
  typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'error';

/* Numbers as text, the way a spreadsheet writes them into a formula's result: at most 15
   significant digits, so 0.1 + 0.2 reads 0.3, and no trailing zeros. */
export function numberToText(n: number): string {
  if (Object.is(n, -0)) return '0';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const precise = Number(n.toPrecision(15));
  return String(precise).replace('e+', 'E+').replace('e-', 'E-');
}

/* Text that reads as a number: "1,234.5", "-3", "12%", "£4.50", "(20)", "1e3". Returns null
   for anything else, including the empty string. Shared by input, coercion and VALUE(). */
const NUMERIC = /^([+-])?([£$€])?(\d{1,3}(?:,\d{3})+|\d*)(\.\d*)?(?:[eE]([+-]?\d+))?(%)?$/;

export function parseNumber(text: string): number | null {
  let s = text.trim();
  if (!s) return null;
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  const m = NUMERIC.exec(s);
  if (!m) return null;
  const [, sign, , whole = '', frac = '', exp, percent] = m;
  if (!whole && frac.length <= 1) return null; // "", ".", "$"
  let n = Number(`${whole.replace(/,/g, '') || '0'}${frac}${exp !== undefined ? `e${exp}` : ''}`);
  if (!Number.isFinite(n)) return null;
  if (percent) n /= 100;
  if (sign === '-') n = -n;
  return negative ? -n : n;
}

/** For arithmetic. */
export function toNumber(v: Scalar): number | CellError {
  if (typeof v === 'number') return v;
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return parseNumber(v) ?? err('#VALUE!');
  return v;
}

/** For & and the text functions. */
export function toText(v: Scalar): string | CellError {
  if (typeof v === 'string') return v;
  if (v === null) return '';
  if (typeof v === 'number') return numberToText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/** For IF, AND, OR and NOT. */
export function toBoolean(v: Scalar): boolean | CellError {
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const u = v.trim().toUpperCase();
    if (u === 'TRUE') return true;
    if (u === 'FALSE') return false;
    return err('#VALUE!');
  }
  return v;
}

/** A finished number: infinities and NaN become #NUM!, and -0 becomes 0. */
export function finite(n: number): number | CellError {
  if (!Number.isFinite(n)) return err('#NUM!');
  return n === 0 ? 0 : n;
}

/* Excel's ordering for comparisons and sorting: numbers, then text, then booleans, with text
   compared without regard to case. An empty cell takes the type of what it is compared with. */
const rank = (v: Exclude<Scalar, null | CellError>) =>
  typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2;

export function compare(a: Scalar, b: Scalar): number {
  if (a === null && b === null) return 0;
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  if (isError(a) || isError(b)) return 0;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'string' && typeof b === 'string') {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return Number(a) - Number(b);
}

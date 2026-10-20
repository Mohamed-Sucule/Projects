/* Number formats, written as Excel format codes ("#,##0.00", "0%", "£#,##0.00", "dd/mm/yyyy"),
   so the cell formats and the TEXT() function share one interpreter and a code copied from
   Excel means the same thing here. It covers the codes people actually use: digit
   placeholders, thousands separators, percentages, literal text, up to three sections
   (positive;negative;zero), and dates and times. Not covered: colours, conditions,
   fractions and scientific notation in codes. */

import { fromSerial, weekday } from './dates';
import { isError, numberToText, type Scalar } from './values';

export const GENERAL = 'General';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** What a cell shows. */
export function formatValue(v: Scalar, code?: string | null): string {
  if (v === null) return '';
  if (isError(v)) return v.code;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string') return v;
  if (!code || code === GENERAL) return general(v);
  return formatNumber(v, code);
}

/* General: what a number looks like with no format, in a column of default width. About
   eleven characters, like Excel: 1/3 shows as 0.333333333, and very large or very small
   numbers switch to scientific notation. */
export function general(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e11) return String(n);
  const a = Math.abs(n);
  if (a !== 0 && (a >= 1e11 || a < 1e-9)) {
    return n
      .toExponential(5)
      .replace(/\.?0+e/, 'e')
      .replace('e+', 'E+')
      .replace('e-', 'E-');
  }
  const digits = Math.max(1, 10 - Math.max(0, Math.floor(Math.log10(a)) + 1));
  return numberToText(Number(n.toFixed(Math.min(digits, 9))));
}

/** Round half away from zero in decimal, not binary: 1.005 to 2 places is 1.01. */
export function roundTo(n: number, places: number): number {
  if (!Number.isFinite(n)) return n;
  const sign = n < 0 ? -1 : 1;
  const shifted = Number(`${Math.abs(n)}e${places}`);
  return sign * Number(`${Math.round(shifted)}e${-places}`) || 0;
}

/** Split a code into its ;-separated sections, ignoring ; inside quotes. */
function sections(code: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    if (ch === '"') quoted = !quoted;
    if (ch === '\\' && i + 1 < code.length) {
      cur += ch + code[++i];
      continue;
    }
    if (ch === ';' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const isDateCode = (code: string) => /[dmyhs]/i.test(code.replace(/"[^"]*"|\\./g, ''));

export function formatNumber(n: number, code: string): string {
  const parts = sections(code);
  let section = parts[0]!;
  let value = n;
  if (n < 0 && parts.length > 1) {
    section = parts[1]!;
    value = -n;
  } else if (n === 0 && parts.length > 2) section = parts[2]!;
  if (isDateCode(section)) return formatDate(n, section);
  const text = formatDigits(value, section);
  return n < 0 && parts.length === 1 && /[1-9]/.test(text) ? `-${text}` : text;
}

/* A numeric section: literal text either side of one run of placeholders (0 # ? , .). */
function formatDigits(n: number, section: string): string {
  let prefix = '';
  let suffix = '';
  let pattern = '';
  let percents = 0;
  let seenPattern = false;
  for (let i = 0; i < section.length; i++) {
    const ch = section[i]!;
    let literal: string;
    if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      literal = section.slice(i + 1, end < 0 ? undefined : end);
      i = end < 0 ? section.length : end;
    } else if (ch === '\\') literal = section[++i] ?? '';
    else if (ch === '_') {
      literal = ' ';
      i++;
    } else if (ch === '%') {
      percents++;
      literal = '%';
    } else if ('0#?,.'.includes(ch) && (!seenPattern || !suffix)) {
      pattern += ch;
      seenPattern = true;
      continue;
    } else literal = ch;
    if (seenPattern) suffix += literal;
    else prefix += literal;
  }
  let value = Math.abs(n) * 100 ** percents;
  // a trailing comma in the pattern divides by a thousand ("#,##0," shows thousands)
  while (pattern.endsWith(',')) {
    pattern = pattern.slice(0, -1);
    value /= 1000;
  }
  const dot = pattern.indexOf('.');
  const intPat = dot < 0 ? pattern : pattern.slice(0, dot);
  const fracPat = dot < 0 ? '' : pattern.slice(dot + 1);
  const places = fracPat.length;
  const rounded = roundTo(value, places);
  let [whole, frac = ''] = rounded.toFixed(places).split('.') as [string, string?];
  const minInt = (intPat.match(/0/g) ?? []).length;
  if (whole === '0' && minInt === 0) whole = '';
  whole = whole.padStart(minInt, '0');
  if (intPat.includes(',')) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // optional decimals (#) are dropped when they are zero
  const required = (fracPat.match(/0/g) ?? []).length;
  while (frac.length > required && frac.endsWith('0')) frac = frac.slice(0, -1);
  return `${prefix}${frac ? `${whole}.${frac}` : whole}${suffix}`;
}

function formatDate(serial: number, section: string): string {
  const { y, m, d } = fromSerial(serial);
  const secondsOfDay = Math.round((serial - Math.floor(serial)) * 86_400) % 86_400;
  const hh = Math.floor(secondsOfDay / 3600);
  const mi = Math.floor((secondsOfDay % 3600) / 60);
  const ss = secondsOfDay % 60;
  const ampm = /AM\/PM/i.test(section);
  const tokens =
    section.match(/"[^"]*"|\\.|AM\/PM|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|./gi) ?? [];
  let out = '';
  // "m" after an hour or before a second is minutes, not months
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const lower = t.toLowerCase();
    const prevTime = tokens.slice(0, i).some((p) => /^h+$/i.test(p));
    const nextSec = tokens.slice(i + 1).some((p) => /^s+$/i.test(p));
    const minutes = (lower === 'm' || lower === 'mm') && (prevTime || nextSec);
    if (t.startsWith('"')) out += t.slice(1, -1);
    else if (t.startsWith('\\')) out += t.slice(1);
    else if (lower === 'am/pm') out += hh < 12 ? 'AM' : 'PM';
    else if (lower === 'yyyy') out += String(y).padStart(4, '0');
    else if (lower === 'yy') out += String(y % 100).padStart(2, '0');
    else if (lower === 'mmmm') out += MONTHS[m - 1];
    else if (lower === 'mmm') out += MONTHS[m - 1]!.slice(0, 3);
    else if (minutes) out += lower === 'mm' ? String(mi).padStart(2, '0') : String(mi);
    else if (lower === 'mm') out += String(m).padStart(2, '0');
    else if (lower === 'm') out += String(m);
    else if (lower === 'dddd') out += DAYS[weekday(serial)];
    else if (lower === 'ddd') out += DAYS[weekday(serial)]!.slice(0, 3);
    else if (lower === 'dd') out += String(d).padStart(2, '0');
    else if (lower === 'd') out += String(d);
    else if (lower === 'hh' || lower === 'h') {
      const h = ampm ? hh % 12 || 12 : hh;
      out += lower === 'hh' ? String(h).padStart(2, '0') : String(h);
    } else if (lower === 'ss') out += String(ss).padStart(2, '0');
    else if (lower === 's') out += String(ss);
    else out += t;
  }
  return out;
}

/** The format presets the toolbar offers. */
export const PRESETS = [
  { id: 'general', label: 'General', code: GENERAL },
  { id: 'number', label: 'Number', code: '#,##0.00' },
  { id: 'whole', label: 'Whole number', code: '#,##0' },
  { id: 'currency', label: 'Pounds', code: '£#,##0.00' },
  { id: 'percent', label: 'Percent', code: '0.0%' },
  { id: 'date', label: 'Date', code: 'dd/mm/yyyy' },
  { id: 'longdate', label: 'Long date', code: 'd mmmm yyyy' },
  { id: 'time', label: 'Time', code: 'hh:mm' },
] as const;

/** One more or one fewer decimal place in a numeric code; General becomes a fixed format. */
export function adjustDecimals(
  code: string | null | undefined,
  delta: 1 | -1,
  sample: number,
): string {
  if (!code || code === GENERAL) {
    const shown = general(sample);
    const places = shown.includes('.') ? shown.split('.')[1]!.length : 0;
    const next = Math.max(0, places + delta);
    return next ? `0.${'0'.repeat(next)}` : '0';
  }
  if (isDateCode(code)) return code;
  return sections(code)
    .map((s) => {
      if (/\.0+/.test(s)) {
        return delta > 0
          ? s.replace(/\.(0+)/, (_, zeros: string) => `.${zeros}0`)
          : s.replace(/\.0(0*)/, (_, rest: string) => (rest ? `.${rest}` : ''));
      }
      return delta > 0 ? s.replace(/0(?![0#,.])/, '0.0') : s;
    })
    .join(';');
}

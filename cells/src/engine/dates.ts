/* Dates are numbers, as in every spreadsheet: days since the end of 1899. Excel counts a
   29 February 1900 that never happened (Lotus 1-2-3 had the bug first, and Excel kept it so
   old sheets would agree), so serial 60 is that day and everything from 1 March 1900 on is
   one more than a plain day count. Keeping the bug is what makes a date typed here mean the
   same number as the same date in a file from Excel. */

const DAY = 86_400_000;
const EPOCH = Date.UTC(1899, 11, 30);

export interface YMD {
  y: number;
  m: number;
  d: number;
}

function utc(y: number, m: number, d: number): number {
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d); // unlike Date.UTC, years 0–99 stay themselves
  return t.getTime();
}

/** The serial for a date. Month and day may overflow, as DATE(2025, 13, 1) does. */
export function toSerial(y: number, m: number, d: number): number {
  const days = Math.round((utc(y, m, d) - EPOCH) / DAY);
  return days < 61 ? days - 1 : days;
}

export function fromSerial(serial: number): YMD {
  const s = Math.floor(serial);
  if (s === 60) return { y: 1900, m: 2, d: 29 };
  const t = new Date(EPOCH + (s < 60 ? s + 1 : s) * DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Now, in the browser's own time zone, as a serial with the time as its fraction. */
export function nowSerial(now: Date): number {
  const date = toSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return date + seconds / 86_400;
}

/** 0 = Sunday, the JavaScript way. */
export function weekday(serial: number): number {
  const { y, m, d } = fromSerial(serial);
  if (y === 1900 && m === 2 && d === 29) return 3; // Excel calls the day that never was a Wednesday
  return new Date(utc(y, m, d)).getUTCDay();
}

export const daysInMonth = (y: number, m: number) => new Date(utc(y, m + 1, 0)).getUTCDate();

/* Dates typed into a cell: ISO (2025-03-14) or day first (14/03/2025), the way they are
   written in Britain. Returns null for anything that is not a real date. */
export function parseDate(text: string): number | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m) || y < 1900 || y > 9999) return null;
  return toSerial(y, m, d);
}

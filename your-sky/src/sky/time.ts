/* Time at the place, not on the visitor's computer. "21:30 in Tokyo" has to mean 21:30 on a
   clock in Tokyo, whatever zone the browser is in, and in whatever offset Tokyo kept that
   year. The zone comes from the coordinates; the offset from the browser's own copy of
   the time zone database, through Intl. */

import tzLookup from '@photostructure/tz-lookup';

/** A wall-clock moment: what a calendar and a clock at the place would read. */
export interface LocalTime {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24-hour */
  time: string;
}

export const MIN_YEAR = 1800;
export const MAX_YEAR = 2200;

/** The IANA time zone at a point, such as "Europe/Paris"; out at sea, a nautical zone. */
export function zoneAt(lat: number, lon: number): string {
  try {
    const zone = tzLookup(lat, lon);
    return isZone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(zone: string) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      era: 'short',
    });
    formatters.set(zone, f);
  }
  return f;
}

export function isZone(zone: string): boolean {
  try {
    partsIn(zone);
    return true;
  } catch {
    return false;
  }
}

/** What the clock in `zone` reads at an instant, as fields. */
function wallClock(ms: number, zone: string) {
  const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0, bc: false };
  for (const p of partsIn(zone).formatToParts(new Date(ms))) {
    if (p.type === 'era') out.bc = p.value === 'BC';
    else if (p.type in out) (out as Record<string, number | boolean>)[p.type] = Number(p.value);
  }
  if (out.bc) out.year = 1 - out.year;
  return out;
}

/** Whole milliseconds of a wall-clock reading, treated as if it were UTC. */
function asUtc(c: ReturnType<typeof wallClock>): number {
  const d = new Date(0);
  d.setUTCFullYear(c.year, c.month - 1, c.day);
  d.setUTCHours(c.hour, c.minute, c.second, 0);
  return d.getTime();
}

/** How far ahead of UTC the clocks in `zone` are at an instant, in milliseconds. */
export function offsetAt(ms: number, zone: string): number {
  const whole = Math.floor(ms / 1000) * 1000;
  return asUtc(wallClock(whole, zone)) - whole;
}

export function parseLocal(t: LocalTime) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.date);
  const h = /^(\d{2}):(\d{2})$/.exec(t.time);
  if (!d || !h) return null;
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], h[1], h[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  if (hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

export function daysIn(year: number, month: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month, 0); // day 0 of the next month is the last of this one
  return d.getUTCDate();
}

/**
 * The instant a wall-clock time at a place stands for.
 *
 * Twice a year in much of the world this is not one answer. When clocks jump forward, a
 * time like 02:30 never happens; it is read as the same distance past the jump, 03:30, as
 * a person (and Temporal's "compatible" rule) would. When clocks go back, 02:30 happens
 * twice; the first one is taken.
 */
export function toInstant(t: LocalTime, zone: string): Date | null {
  const p = parseLocal(t);
  if (!p) return null;
  const d = new Date(0);
  d.setUTCFullYear(p.year, p.month - 1, p.day);
  d.setUTCHours(p.hour, p.minute, 0, 0);
  const naive = d.getTime();
  const DAY = 86_400_000;
  // no zone changes its offset twice within two days, so the offsets either side are all
  const before = offsetAt(naive - DAY, zone);
  const after = offsetAt(naive + DAY, zone);
  const fits = [before, after]
    .map((o) => naive - o)
    .filter((ms) => offsetAt(ms, zone) === naive - ms)
    .sort((a, b) => a - b);
  if (fits.length) return new Date(fits[0]!);
  // a time skipped by the clocks: keep the offset from before the jump
  return new Date(naive - before);
}

/** What a clock at the place reads at an instant. */
export function toLocal(at: Date, zone: string): LocalTime {
  const c = wallClock(at.getTime(), zone);
  return { date: dateString(c.year, c.month, c.day), time: `${pad(c.hour)}:${pad(c.minute)}` };
}

const pad = (n: number) => String(n).padStart(2, '0');

export const dateString = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;

export function clampYear(t: LocalTime): LocalTime {
  const p = parseLocal(t);
  if (!p) return t;
  const year = Math.min(MAX_YEAR, Math.max(MIN_YEAR, p.year));
  if (year === p.year) return t;
  return { ...t, date: dateString(year, p.month, Math.min(p.day, daysIn(year, p.month))) };
}

/* The time slider runs from noon to noon, so a whole night is in one piece: the evening on
   the left, the small hours on the right. */

export const NIGHT_MINUTES = 24 * 60;

/** Which night a moment falls in (the date of its evening), and how far into it, in minutes. */
export function nightOf(t: LocalTime): { evening: string; minute: number } | null {
  const p = parseLocal(t);
  if (!p) return null;
  const minutes = p.hour * 60 + p.minute;
  if (minutes >= 720) return { evening: t.date, minute: minutes - 720 };
  return { evening: shiftDate(t.date, -1), minute: minutes + 720 };
}

export function fromNight(evening: string, minute: number): LocalTime {
  const m = Math.max(0, Math.min(NIGHT_MINUTES - 1, Math.round(minute))) + 720;
  const date = m >= NIGHT_MINUTES ? shiftDate(evening, 1) : evening;
  const of = m % NIGHT_MINUTES;
  return { date, time: `${pad(Math.floor(of / 60))}:${pad(of % 60)}` };
}

export function shiftDate(date: string, days: number): string {
  const p = parseLocal({ date, time: '12:00' });
  if (!p) return date;
  const d = new Date(0);
  d.setUTCFullYear(p.year, p.month - 1, p.day + days);
  return dateString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** "14 February 2025 · 21:30", in the reader's own way of writing dates. */
export function formatWhen(t: LocalTime, locale?: string): string {
  const p = parseLocal(t);
  if (!p) return '';
  const d = new Date(0);
  d.setUTCFullYear(p.year, p.month - 1, p.day);
  d.setUTCHours(p.hour, p.minute, 0, 0);
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return `${date} · ${time}`;
}

/** "UTC+1", "UTC−3:30": how the place's clocks relate to UTC at that moment. */
export function formatOffset(at: Date, zone: string): string {
  const minutes = Math.round(offsetAt(at.getTime(), zone) / 60_000);
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '−';
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return `UTC${sign}${h}${m ? `:${pad(m)}` : ''}`;
}

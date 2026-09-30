/* ───────────────────────────────────────────────────────────────────────────
   frontdesk/diary.js — the restaurant's book, tonight and every other night.

   Tonight is the real thing: the same Saturday the Covers table system opens
   on, thirty-one bookings deep at 19:42, with the same tables, the same
   turn times and the same rules about who can sit where. The receptionist
   does not have its own idea of whether table 12 is free. It asks the engine
   the host stand uses, so it can never promise a table the floor cannot give.

   Every other night is generated, because a receptionist that can only book
   tonight is not a receptionist. The generator places each party through the
   same engine, so a busy Friday is busy in the ways a real one is — the eight
   o'clock sitting full, a gap at half five, the snug taken by a birthday — and
   it is seeded by the date, so Friday is the same Friday every time the page
   loads and a test can assert on it.
   ─────────────────────────────────────────────────────────────────────────── */

import { freshBook, NOW } from '../covers/book.js';
import { findTables, nextAvailable, fitsInService, turnTime, live, tablesFree, SERVICE } from '../covers/schedule.js';
import { byId } from '../covers/floor.js';
import { addDays, weekdayOf, daysBetween } from './understand.js';

export const TODAY = '2026-03-14';

/** The restaurant, as the receptionist knows it. A fictional one. */
export const HOUSE = {
  name: 'Bartlett & Vine',
  closedOn: [1],                 // Mondays
  horizon: 60,                   // days ahead the book is open
  maxParty: 10,                  // larger than this and the manager arranges it
  opens: SERVICE.opens,
  lastOrders: SERVICE.lastOrders,
  closes: SERVICE.closes,
  grace: 15,                     // minutes a table is held for a late party that has not rung
};

export const ZONE_PHRASE = {
  window: 'in the window',
  room: 'in the main room',
  banquette: 'on the banquette',
  snug: 'in the snug',
};

/* ── generated nights ────────────────────────────────────────────────────── */

function rng(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (h + 0x6D2B79F5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SURNAMES = `Abbott Achebe Ahmed Alvarez Andersen Appiah Barker Bhatt Bianco Blake Bose Brady Brook
  Castro Chen Choi Clarke Cohen Costa Dalton Das Devlin Doyle Dubois Duffy Egan Ellis Evans Farah Fischer
  Flynn Foster Garcia Gill Gordon Grant Gupta Hale Hansen Hayes Hughes Hussain Ibrahim Iyer Jansen Jones
  Kaur Keane Khan Kim Klein Lamb Larsen Lee Lopez Lowe Maddox Malik Marsh Mehta Molina Moreau Murphy Nair
  Novak Obi Olsen Osei Owen Park Patel Pereira Quinn Rao Reid Reyes Rossi Russo Saito Santos Sato Shaw
  Silva Singh Sousa Stone Suzuki Tan Tanaka Thorne Torres Tran Varga Vance Vogel Walsh Ward Weber Wong
  Wu Yadav Yilmaz Young Zhang Ziegler`.split(/\s+/).filter(Boolean);

/* How full each night of the week runs, as a share of the room over the
   evening. Monday is dark. */
const BUSY = [0.4, 0, 0.24, 0.3, 0.42, 0.6, 0.66];

const PARTIES = [[2, 50], [3, 8], [4, 26], [5, 4], [6, 7], [7, 1], [8, 3], [10, 1]];
const SLOTS = [];
for (let at = 17 * 60; at <= 21 * 60 + 30; at += 15) {
  /* Most people want to eat between seven and half eight. */
  const peak = Math.exp(-(((at - (19 * 60 + 30)) / 95) ** 2));
  SLOTS.push([at, 0.15 + peak]);
}

const pickWeighted = (r, list) => {
  const total = list.reduce((n, [, w]) => n + w, 0);
  let x = r() * total;
  for (const [v, w] of list) { if ((x -= w) <= 0) return v; }
  return list[list.length - 1][0];
};

/**
 * A night's book for any date that is not tonight.
 *
 * Deterministic in the date, so it is the same book on every visit, and
 * built by asking the scheduler for a table for each party in turn — which is
 * the only way a generated night can be one the room could actually serve.
 */
export function generateNight(date) {
  const dow = weekdayOf(date);
  if (HOUSE.closedOn.includes(dow)) return [];
  const r = rng(`bartlett-vine:${date}`);
  const target = Math.round(BUSY[dow] * 150 * (0.9 + r() * 0.2));
  const book = [];
  let covers = 0, n = 0;
  for (let tries = 0; tries < 400 && covers < target; tries++) {
    const party = pickWeighted(r, PARTIES);
    const at = pickWeighted(r, SLOTS);
    if (!fitsInService(at, turnTime(party))) continue;
    const spot = findTables(party, at, book, { limit: 1 })[0];
    if (!spot) continue;
    n++;
    book.push({
      id: `g${date.replace(/-/g, '')}-${n}`,
      at, party, tableIds: spot.tableIds, status: 'booked',
      name: SURNAMES[Math.floor(r() * SURNAMES.length)],
    });
    covers += party;
  }
  return book.sort((a, b) => a.at - b.at);
}

/* ── the diary ───────────────────────────────────────────────────────────── */

/**
 * Every night the receptionist knows about. Tonight's book is shared with
 * the Covers floor plan through the page; everything else lives here.
 */
export function createDiary({ today = TODAY, now = NOW, tonight = null } = {}) {
  const nights = new Map();
  nights.set(today, tonight ?? freshBook());
  const diary = {
    today,
    now,
    nights,
    bookFor(date) {
      if (!nights.has(date)) nights.set(date, generateNight(date));
      return nights.get(date);
    },
    /** Replace tonight wholesale — what the page does when Covers says what the room looks like. */
    setTonight(book, at = null) {
      nights.set(today, book);
      if (at != null) diary.now = at;
    },
    add(date, booking) { diary.bookFor(date).push(booking); return booking; },
    update(date, id, changes) {
      const b = diary.bookFor(date).find((x) => x.id === id);
      if (b) Object.assign(b, changes);
      return b;
    },
    /** Every booking the diary has touched, with its date. */
    *all() {
      for (const [date, book] of nights) for (const b of book) yield { date, b };
    },
  };
  return diary;
}

/* ── is there a table? ───────────────────────────────────────────────────── */

/**
 * Why a date cannot be booked, in the words a receptionist would use — or
 * null if it can.
 */
export function dateProblem(date, today) {
  const ahead = daysBetween(today, date);
  if (ahead < 0) return { code: 'past', ahead };
  if (ahead > HOUSE.horizon) return { code: 'too-far', ahead };
  if (HOUSE.closedOn.includes(weekdayOf(date))) return { code: 'closed', ahead };
  return null;
}

/** Why a time cannot be booked for this party on this date, or null. */
export function timeProblem({ party, date, time }, { today, now }) {
  const dur = turnTime(party);
  if (time < HOUSE.opens) return { code: time < 15 * 60 ? 'lunch' : 'too-early' };
  if (date === today && time < roundUp(now)) return { code: 'past', earliest: roundUp(now) };
  if (!fitsInService(time, dur)) return { code: 'too-late', latest: latestStart(party) };
  return null;
}

export const roundUp = (m, step = 15) => Math.ceil(m / step) * step;
export const latestStart = (party) => {
  let at = HOUSE.lastOrders;
  while (at > HOUSE.opens && !fitsInService(at, turnTime(party))) at -= 15;
  return at;
};

const optionFrom = (date, spot, at) => ({
  date, at,
  tableIds: spot.tableIds,
  label: spot.label,
  zone: byId.get(spot.tableIds[0]).zone,
});

/**
 * Look for a table.
 *
 * Returns the best table at the time asked for, if there is one — in the
 * zone they asked for, if they asked — and otherwise the nearest times either
 * side, nearest first, the way a receptionist offers "I can do quarter past
 * seven or quarter to nine". If the whole evening is gone, it looks along the
 * week for the same time on another night.
 */
export function lookFor({ party, date, time, prefer = null, ignoreId = null, direction = 0, after = null }, diary) {
  const book = diary.bookFor(date).filter((b) => b.id !== ignoreId);
  const today = diary.today;
  const earliest = date === today ? roundUp(diary.now) : HOUSE.opens;

  let exact = null, missedPreference = false;
  if (direction === 0) {
    const spots = findTables(party, time, book, { limit: 12 });
    if (spots.length) {
      const inZone = prefer ? spots.find((sp) => byId.get(sp.tableIds[0]).zone === prefer) : null;
      exact = optionFrom(date, inZone ?? spots[0], time);
      missedPreference = !!prefer && !inZone;
    }
  }

  let alternatives = [];
  if (!exact) {
    const near = nextAvailable(party, time, book, { span: 180, notBefore: earliest })
      .map((x) => optionFrom(date, x, x.at))
      .filter((o) => o.at !== after && (direction === 0 || Math.sign(o.at - time) === direction));
    const earlier = near.filter((o) => o.at < time).sort((a, b) => b.at - a.at);
    const later = near.filter((o) => o.at > time).sort((a, b) => a.at - b.at);
    if (direction < 0) alternatives = earlier.slice(0, 2);
    else if (direction > 0) alternatives = later.slice(0, 2);
    else if (earlier.length && later.length) alternatives = [earlier[0], later[0]];
    else alternatives = (earlier.length ? earlier : later).slice(0, 2);
    alternatives.sort((a, b) => a.at - b.at);
  }

  /* Nothing all evening: the same time on the nearest night that has it. */
  let otherNight = null;
  if (!exact && !alternatives.length && direction === 0) {
    for (let d = 1; d <= 7; d++) {
      const other = addDays(date, d);
      if (dateProblem(other, today)) continue;
      const t = time < HOUSE.opens ? 19 * 60 : time;
      const spot = findTables(party, t, diary.bookFor(other), { limit: 1 })[0];
      if (spot && fitsInService(t, turnTime(party))) { otherNight = optionFrom(other, spot, t); break; }
    }
  }

  return { exact, missedPreference, alternatives, otherNight };
}

/** Is a held table still free? Somebody at the host stand may have taken it. */
export function stillFree(option, party, diary, ignoreId = null) {
  return tablesFree(option.tableIds, option.at, turnTime(party), diary.bookFor(option.date), ignoreId);
}

/* ── finding a booking somebody already has ──────────────────────────────── */

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/ł/g, 'l').toLowerCase().replace(/[^a-z' -]/g, '').trim();

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/**
 * Does a name on the phone match a name in the book?
 *
 * Surnames are what bookings are kept under, so the last word said is
 * compared with every word in the booking. Accents are ignored — nobody says
 * the ń in Zieliński — and a letter or two of difference is forgiven in a
 * long name, because that is what a recogniser does to a surname it has never
 * heard.
 */
export function sameName(said, booked) {
  const a = fold(said).split(/\s+/).filter((w) => !/^(?:mr|mrs|ms|miss|dr)$/.test(w));
  const b = fold(booked).split(/\s+/);
  if (!a.length) return false;
  const surname = a[a.length - 1];
  return b.some((w) => {
    if (w === surname) return true;
    /* Short names must match exactly — Bell is not Bello — and a long one may
       be a letter or two out, but never at the start. */
    const slack = w.length >= 9 ? 2 : w.length >= 6 ? 1 : 0;
    return slack > 0 && w[0] === surname[0] && editDistance(w, surname) <= slack;
  });
}

/** Live bookings under this name (or number), on this date if one was given. */
export function findBookings(diary, { name = null, phone = null, date = null }) {
  const out = [];
  for (const { date: d, b } of diary.all()) {
    if (!live(b) || b.status === 'noshow') continue;
    if (date && d !== date) continue;
    if (d === diary.today && b.at + 20 < diary.now && !['booked', 'confirmed'].includes(b.status)) continue;
    const byName = name && sameName(name, b.name);
    const byPhone = phone && b.phone && b.phone.replace(/\D/g, '') === phone.replace(/\D/g, '');
    if (byName || byPhone) out.push({ date: d, b });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.b.at - y.b.at);
}

export { NOW };

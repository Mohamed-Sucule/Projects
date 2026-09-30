/* The receptionist: what it hears, what it says, and what it writes in the
   book. The book is the part that matters — a receptionist that talks well
   and double-books table 12 is worse than no receptionist. */

import { test, assert } from './harness.mjs';
import { understand, normalise, sayTime, sayDate } from '../apps/frontdesk/understand.js';
import { CASES, HELD_OUT, HELD_OUT_FIRST_RUN, score } from '../apps/frontdesk/eval.js';
import { createDiary, generateNight, lookFor, findBookings, sameName, dateProblem, TODAY, HOUSE } from '../apps/frontdesk/diary.js';
import { createCall, greet, hear, FAQ } from '../apps/frontdesk/desk.js';
import { CALLS, playThrough, RANDOM_CALLERS } from '../apps/frontdesk/calls.js';
import { conflicts, canSeat, fitsInService, turnTime, live } from '../apps/covers/schedule.js';
import { NOW } from '../apps/covers/book.js';

/* ── reading ── */

test('the tuning set: every case read right', () => {
  const r = score(understand);
  const bad = r.rows.filter((x) => !x.ok).map((x) => `${x.text} → ${x.wrong.map((w) => `${w.field} ${JSON.stringify(w.got)}`).join(', ')}`);
  assert.equal(bad.length, 0, bad.join('\n'));
});

test('the held-out set scores at least what it scored the first time it was run', () => {
  const r = score(understand, HELD_OUT);
  assert.ok(r.right >= HELD_OUT_FIRST_RUN.right, `${r.right}/${r.cases}, first run was ${HELD_OUT_FIRST_RUN.right}`);
  assert.equal(r.cases, HELD_OUT_FIRST_RUN.cases, 'the held-out set changed size — its first-run score no longer describes it');
});

test('no phrasing appears in both sets', () => {
  const tuning = new Set(CASES.map((c) => c[0].toLowerCase()));
  for (const [t] of HELD_OUT) assert.ok(!tuning.has(t.toLowerCase()), `in both sets: ${t}`);
});

test('spoken numbers become digits, and the map points back at the words', () => {
  const n = normalise('table for four at half eight');
  assert.equal(n.s, 'table for 4 at half 8');
  const at = n.s.indexOf('4');
  assert.equal(n.src.slice(n.map[at], n.map[at] + 4), 'four');
});

test('"oh" is a zero only among digits', () => {
  assert.equal(normalise("oh, that's a shame").s.startsWith('oh'), true);
  assert.equal(understand('oh seven seven double oh nine double oh one two three', { expecting: 'phone' }).slots.phone, '07700 900123');
});

test('highlights cover the words that were understood', () => {
  const r = understand('Table for four tonight at half eight, under Collins');
  const said = Object.fromEntries(r.spans.map((sp) => [sp.slot, sp.text]));
  assert.equal(said.party, 'four');
  assert.equal(said.date, 'tonight');
  assert.ok(/half eight/.test(said.time), `time span was ${said.time}`);
  assert.ok(/Collins/.test(said.name), `name span was ${said.name}`);
});

test('a bare number means what the question asked', () => {
  assert.equal(understand('eight', { expecting: 'party' }).slots.party, 8);
  assert.equal(understand('eight', { expecting: 'time' }).slots.time, 20 * 60);
  assert.equal(understand('eight', { expecting: 'party' }).slots.time, undefined);
});

test('"tonight" after a time is still tonight', () => {
  const r = understand('about 8 tonight for three');
  assert.equal(r.slots.date, TODAY);
  assert.equal(r.slots.time, 20 * 60);
  assert.equal(r.slots.party, 3);
});

test('of two times, the one being moved to', () => {
  const r = understand("We've a table at quarter past eight under Whitcombe — could we push it back to nine?");
  assert.equal(r.slots.time, 21 * 60);
  const s = understand('half seven instead of seven');
  assert.equal(s.slots.time, 19 * 60 + 30);
});

test('a weekday that disagrees with its date is flagged, not guessed', () => {
  const r = understand('Friday the 21st');
  assert.ok(r.flags.dateClash, 'expected a clash: the 21st is a Saturday');
});

test('dates are said the way people say them', () => {
  assert.equal(sayDate(TODAY, TODAY), 'tonight');
  assert.equal(sayDate('2026-03-15', TODAY), 'tomorrow');
  assert.equal(sayDate('2026-03-20', TODAY), 'this Friday the 20th');
  assert.equal(sayDate('2026-04-04', TODAY), 'Saturday the 4th of April');
  assert.equal(sayTime(20 * 60 + 30), '8:30');
  assert.equal(sayTime(21 * 60), "9 o'clock");
});

/* ── the diary ── */

test('tonight is the Covers night, at the moment Covers opens on', () => {
  const d = createDiary();
  assert.equal(d.today, TODAY);
  assert.equal(d.now, NOW);
  assert.equal(d.bookFor(TODAY).length, 31);
});

test('generated nights are the same every time, and the room could serve them', () => {
  for (const date of ['2026-03-15', '2026-03-17', '2026-03-20', '2026-03-21', '2026-04-11']) {
    const a = generateNight(date), b = generateNight(date);
    assert.deep(a, b, `${date} is not deterministic`);
    assert.equal(conflicts(a).length, 0, `${date} double-books a table`);
    for (const x of a) assert.ok(fitsInService(x.at, turnTime(x.party)), `${date}: ${x.name} runs past close`);
  }
});

test('Mondays are dark', () => {
  assert.equal(generateNight('2026-03-16').length, 0);
  assert.equal(dateProblem('2026-03-16', TODAY).code, 'closed');
});

test('weekends are busier than weekdays', () => {
  const covers = (d) => generateNight(d).reduce((n, b) => n + b.party, 0);
  assert.ok(covers('2026-03-21') > covers('2026-03-17'), 'a Saturday should out-book a Tuesday');
});

test('a full time is answered with the nearest free times, one either side where possible', () => {
  const d = createDiary();
  const r = lookFor({ party: 2, date: TODAY, time: 20 * 60 + 30 }, d);
  assert.equal(r.exact, null, 'Saturday at 20:30 for two should be full');
  assert.ok(r.alternatives.length > 0);
  for (const o of r.alternatives) {
    const probe = { id: 'probe', party: 2, at: o.at, tableIds: o.tableIds };
    assert.ok(canSeat(probe, o.tableIds, d.bookFor(TODAY)).ok, `offered ${o.at} on ${o.tableIds} but it cannot seat them`);
    assert.ok(o.at >= NOW, 'offered a time that has already gone');
  }
});

test('names match the way they sound, not the way they are spelled', () => {
  assert.ok(sameName('Zielinski', 'Zieliński'));
  assert.ok(sameName('Sorensen', 'Sørensen'));
  assert.ok(sameName('Mrs Castelanos', 'Castellanos'));
  assert.ok(!sameName('Bell', 'Bello'));
  assert.ok(!sameName('Smith', 'Castellanos'));
  const d = createDiary();
  assert.equal(findBookings(d, { name: 'bello' }).length, 1);
});

/* ── whole calls ── */

const play = (lines, diary = createDiary()) => {
  const call = createCall(diary);
  greet(call);
  const replies = [];
  for (const l of lines) replies.push(hear(call, l));
  return { call, diary, replies, last: replies[replies.length - 1] };
};

for (const script of CALLS) {
  test(`sample call "${script.title}" ends the way it should`, () => {
    const diary = createDiary();
    const call = createCall(diary);
    playThrough(call, script, { hear, greet });
    const e = script.expect;
    assert.equal(call.outcome?.kind, e.outcome, `ended as ${call.outcome?.kind}`);
    assert.ok(call.done, 'the call never finished');
    if (e.party) assert.equal(call.outcome.booking.party, e.party);
    if (e.name) assert.equal(call.outcome.booking.name, e.name);
    if (e.date === 'today') assert.equal(call.outcome.date, TODAY);
    if (e.date === 'tomorrow') assert.equal(call.outcome.date, '2026-03-15');
    for (const n of e.notes ?? []) assert.ok(call.outcome.booking.note.toLowerCase().includes(n.toLowerCase().slice(0, 8)), `note missing: ${n}`);
    for (const [, book] of diary.nights) assert.equal(conflicts(book).filter((c) => c.a.id.startsWith('fd') || c.b.id.startsWith('fd') || c.a.edited || c.b.edited).length, 0, 'the call double-booked a table');
  });
}

test('a booking made on the phone is one the floor can seat', () => {
  const { call, diary } = play(['table for 4 tomorrow at 8', 'Ng', '07700 900001', 'no', 'yes']);
  assert.equal(call.outcome.kind, 'booked');
  const b = call.outcome.booking;
  const book = diary.bookFor('2026-03-15');
  assert.ok(canSeat(b, b.tableIds, book).ok, 'the booking it wrote clashes with the book');
});

test('it checks the table again before writing it in', () => {
  const diary = createDiary();
  const call = createCall(diary);
  greet(call);
  hear(call, 'table for 2 tomorrow at 7');
  const held = call.hold;
  assert.ok(held, 'expected a table to be held');
  /* Meanwhile, at the host stand, somebody sits a walk-in on that exact table. */
  diary.add(held.date, { id: 'walkin', at: held.at, party: 2, tableIds: held.tableIds, status: 'seated', name: 'Walk-in' });
  hear(call, 'Rhodes'); hear(call, '07700 900002'); hear(call, 'no');
  const r = hear(call, 'yes');
  const b = call.outcome?.booking;
  if (b) {
    assert.ok(b.tableIds.join() !== held.tableIds.join(), 'booked the table that had just been taken');
    assert.equal(conflicts(diary.bookFor(held.date)).length, 0);
  } else {
    assert.ok(/taken|gone/.test(r.say), `expected an apology, got: ${r.say}`);
  }
});

test('never books in the past', () => {
  const { replies, call } = play(['table for 4 tonight at 6']);
  assert.ok(/already/.test(replies[0].say) && /has gone/.test(replies[0].say), replies[0].say);
  assert.ok(!call.hold || call.hold.at >= NOW);
  for (const o of call.offers) assert.ok(o.date !== TODAY || o.at >= NOW, `offered ${o.at} tonight`);
});

test('never books a party that cannot finish before close', () => {
  const { replies } = play(['table for 6 on tuesday at 10:30pm']);
  assert.ok(/latest/.test(replies[0].say), replies[0].say);
});

test('does not do lunch, and says so', () => {
  const { replies } = play(['table for 2 tomorrow at 1pm']);
  assert.ok(/dinner/.test(replies[0].say), replies[0].say);
});

test('a Monday is turned down with the days either side', () => {
  const { replies } = play(['table for 2 on monday at 8']);
  assert.ok(/closed on Mondays/.test(replies[0].say) && /tomorrow|Sunday/.test(replies[0].say) && /Tuesday/.test(replies[0].say), replies[0].say);
});

test('a date that clashes with its weekday is asked about', () => {
  const { replies } = play(['Friday the 21st at 8 for two']);
  assert.ok(/Saturday/.test(replies[0].say) && /Friday/.test(replies[0].say), replies[0].say);
});

test('more than ten goes to the manager', () => {
  const { call, replies } = play(['book for 14 next saturday', 'Reilly', '07700 900777']);
  assert.equal(call.outcome.kind, 'callback');
  assert.ok(/manager/.test(replies[0].say));
});

test('asking for a person always works', () => {
  const { call } = play(['table for two tomorrow', 'actually can I just talk to a real person', 'Dee', '07700 900003']);
  assert.equal(call.outcome.kind, 'callback');
});

test('three things in a row it cannot follow and it offers a callback instead of looping', () => {
  const { replies } = play(['blah', 'wibble', 'hmm']);
  assert.ok(/ring you back|call you back/.test(replies[2].say), replies[2].say);
});

test('a question mid-booking is answered and the booking picks up where it was', () => {
  const { replies, call } = play(['table for 2 tomorrow at 8', 'oh do you have parking?']);
  assert.ok(/car park/.test(replies[1].say), replies[1].say);
  assert.ok(/name/.test(replies[1].say), `did not go back to asking the name: ${replies[1].say}`);
  assert.equal(call.expecting, 'name');
});

test('every question it can answer has an answer', () => {
  for (const [, , , t] of []) void t;
  for (const topic of ['hours', 'location', 'parking', 'dogs', 'kids', 'dietary', 'menu', 'price', 'byo', 'cake', 'vouchers', 'private', 'dress', 'outside', 'takeaway', 'deposit', 'access', 'walkin']) {
    assert.ok(FAQ[topic] && FAQ[topic].length > 20, `no answer for ${topic}`);
  }
});

test('cancelling frees the table in the book', () => {
  const { call, diary } = play(["we can't make it tonight, it's under Bello", 'yes']);
  assert.equal(call.outcome.kind, 'cancelled');
  assert.equal(diary.bookFor(TODAY).find((b) => b.name === 'Bello').status, 'cancelled');
});

test('running late moves the booking if the table is free, rather than losing it', () => {
  const { call, diary } = play(["it's Castellanos, we're about 20 minutes late"]);
  assert.equal(call.outcome.kind, 'late');
  const b = diary.bookFor(TODAY).find((x) => x.name === 'Castellanos');
  assert.equal(b.at, 19 * 60 + 45 + 20);
  assert.equal(conflicts(diary.bookFor(TODAY)).filter((c) => c.a === b || c.b === b).length, 0);
});

test('adding people moves them to a bigger table, or offers a time that works', () => {
  const { replies, diary } = play(['can we add two more people to our booking tonight', 'Lindqvist']);
  const r = replies[1];
  assert.ok(/I can do|I'm afraid/.test(r.say), r.say);
  assert.equal(diary.bookFor(TODAY).find((x) => x.name === 'Lindqvist').party, 4, 'changed before asking');
});

/* ── random callers ──
   Four hundred callers, each asking for a random party on a random night at
   a random time, in one of several ways, then accepting whatever is offered.
   Whatever happens in each call, the book at the end has to be one the room
   can serve. */

function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

test(`${RANDOM_CALLERS} random callers never break the book`, () => {
  const r = rng(20260314);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const WORD = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const DAYS = ['tonight', 'tomorrow', 'on tuesday', 'on wednesday', 'on thursday', 'this friday', 'on saturday the 21st', 'on the 25th', 'on the 3rd of april'];
  const TIMES = ['at 6', 'at half six', 'at 7', 'at half seven', 'at 8', 'at 8:15', 'at quarter to nine', 'at 9', 'at half nine', 'at 10'];
  const SHAPES = [
    (p, d, t) => `Hi, have you got a table for ${p} ${d} ${t}?`,
    (p, d, t) => `can I book ${d} ${t} for ${p} people`,
    (p, d, t) => `${p} of us ${d}, ${t} please`,
    (p, d, t) => `I'd like to reserve a table ${d} for ${p}, ${t}`,
  ];
  const diary = createDiary();
  let booked = 0, offered = 0;
  for (let i = 0; i < RANDOM_CALLERS; i++) {
    const n = 1 + Math.floor(r() * 8);
    const call = createCall(diary);
    greet(call);
    let res = hear(call, pick(SHAPES)(r() < 0.5 ? String(n) : WORD[n - 1], pick(DAYS), pick(TIMES)));
    for (let turn = 0; turn < 10 && !call.done && call.outcome?.kind !== 'booked'; turn++) {
      const q = res.expecting;
      const reply = q === 'choice' ? (r() < 0.5 ? 'the first one' : 'the later one')
        : q === 'name' ? pick(['Ng', 'Olsen', 'Dr Hale', 'Maya Rao'])
          : q === 'phone' ? `07700 900${String(100 + i).padStart(3, '0')}`
            : q === 'notes' ? pick(['no', 'one of us has a nut allergy', "it's a birthday", 'no thanks'])
              : q === 'confirm' || q === 'confirm-hold' ? 'yes'
                : q === 'date' ? pick(['tomorrow', 'tuesday', 'the 25th'])
                  : q === 'time' ? pick(['7', 'half 7', '8'])
                    : 'bye';
      if (q === 'choice') offered++;
      res = hear(call, reply);
    }
    if (call.outcome?.kind === 'booked') {
      booked++;
      const { date, booking } = call.outcome;
      assert.ok(booking.at >= HOUSE.opens && fitsInService(booking.at, turnTime(booking.party)), `booked outside service: ${booking.at}`);
      if (date === TODAY) assert.ok(booking.at >= NOW, 'booked tonight in the past');
      assert.ok(dateProblem(date, TODAY) === null, `booked on a date it should not: ${date}`);
    }
  }
  for (const [date, book] of diary.nights) {
    const bad = conflicts(book).filter((c) => (c.a.id + c.b.id).includes('fd'));
    assert.equal(bad.length, 0, `${date}: ${bad.map((c) => `${c.a.name}/${c.b.name}`).join(', ')}`);
    for (const b of book.filter((x) => x.id.startsWith('fd') && live(x))) {
      assert.ok(canSeat(b, b.tableIds, book).ok, `${date}: ${b.name} cannot actually sit on ${b.tableIds}`);
    }
  }
  assert.ok(booked > RANDOM_CALLERS * 0.4, `only ${booked} of ${RANDOM_CALLERS} callers got a table`);
  assert.ok(offered > 20, 'no caller was ever offered an alternative — the test is not reaching full nights');
});

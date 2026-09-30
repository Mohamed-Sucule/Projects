/* ───────────────────────────────────────────────────────────────────────────
   frontdesk/desk.js — the receptionist.

   A phone call is a conversation with a job in it. This file keeps track of
   the job — which details are still missing, which table is being held, what
   the caller has already been told — and decides, one turn at a time, what to
   say next and what to do in the book.

   The rules it works to are the ones a good front-of-house person works to:

     • ask for one thing at a time, and never for something already given;
     • check the floor before promising anything, and check it again before
       writing it in, because somebody at the host stand may have just sat a
       walk-in on that table;
     • when the answer is no, offer the nearest thing that is a yes;
     • read everything back before it goes in the book;
     • write down what the kitchen needs to know, and tell the floor;
     • and know when to hand over to a person — a party of fourteen, a
       complaint, a caller who has asked the same thing three times.

   Nothing in here draws anything. `hear()` takes what the caller said and
   returns what to say back, what was done, and what the book should now look
   like, so every conversation can be played in a test in a millisecond.
   ─────────────────────────────────────────────────────────────────────────── */

import { understand, sayTime, sayDate, shortDate, hm, PREFERS, addDays } from './understand.js';
import { HOUSE, ZONE_PHRASE, lookFor, stillFree, dateProblem, timeProblem, findBookings, latestStart, roundUp } from './diary.js';
import { turnTime, tablesFree, findTables, canSeat, nextAvailable, hhmm } from '../covers/schedule.js';
import { byId } from '../covers/floor.js';

/* ── what the house says about itself ────────────────────────────────────── */

export const FAQ = {
  hours: "We're open for dinner Tuesday to Sunday, from five o'clock, and last orders are at half ten. We're closed on Mondays, and we don't do lunch.",
  location: "We're at 12 Vine Yard, just behind the old market — two minutes from the station.",
  parking: "We haven't got our own parking, but the Market Street car park is round the corner and it's free after six.",
  dogs: "Well-behaved dogs are very welcome in the bar, but not in the dining room, I'm afraid.",
  kids: "Children are very welcome — there's a children's menu and we've got highchairs. Just let me know how many.",
  dietary: "The kitchen can do most of the menu gluten-free, there's always a vegan main, and every dish is marked for allergens. If you tell me when you book, I'll put it on the ticket for the chef.",
  menu: "It's modern British, and it changes with the season — the menu's on our website. Tonight the halibut's just sold out, I'm afraid.",
  price: "Starters are around eight to twelve pounds and mains eighteen to thirty, so most people spend about forty-five a head with a drink.",
  byo: "We don't do bring-your-own, I'm afraid — but there's a good list by the glass.",
  cake: "Of course — drop it with us when you arrive and we'll bring it out at the end with a candle. There's no charge for that.",
  vouchers: "Gift vouchers are on our website, for any amount, and they're valid for a year.",
  private: "The snug is our private room — it seats up to twelve with its own door. For that, the manager arranges it with you directly.",
  dress: "No dress code at all — come as you are.",
  outside: "We haven't got outside seating, I'm afraid, but the window tables look right out onto the street.",
  takeaway: "We don't do takeaway or delivery — it's eat-in only.",
  deposit: "There's no deposit for up to eight people. For bigger groups the manager will talk you through it.",
  access: "Yes — there's step-free access from the street and an accessible toilet. If you let me know when you book, we'll keep the route clear.",
  walkin: "We keep the bar for walk-ins, so do come down — but on a weekend it's worth booking.",
};

const TOPIC_NAME = {
  hours: 'opening hours', location: 'where we are', parking: 'parking', dogs: 'dogs', kids: 'children',
  dietary: 'dietary needs', menu: 'the menu', price: 'prices', byo: 'bringing wine', cake: 'bringing a cake',
  vouchers: 'gift vouchers', private: 'the private room', dress: 'dress code', outside: 'outside seating',
  takeaway: 'takeaway', deposit: 'deposits', access: 'access', walkin: 'walk-ins',
};

/* What each question sounds like the first time, and when it has to be asked
   again because the answer was not understood. */
const ASK = {
  party: ['How many people will it be for?', 'Sorry — how many people is the table for?'],
  date: ['And which day were you thinking?', 'Sorry — which day would you like? Tonight, tomorrow, or another day?'],
  time: ['What time would you like?', "Sorry — what time would suit you? We seat from five until half ten."],
  name: ['Lovely. Can I take a name for the booking?', "Sorry, I didn't catch the name — could you say it again, or spell it for me?"],
  phone: ['And a mobile number, in case we need to get hold of you?', "Sorry, I didn't get all of that number — could you read it out again?"],
  notes: ['Any allergies, or anything we should know about — a birthday, a highchair, a wheelchair?', 'Anything we should know about — allergies, or a special occasion? Or just say no.'],
  confirm: ['Shall I book that in?', 'Sorry — shall I go ahead and book that?'],
  choice: ['Would either of those work?', 'Sorry — which time would you like?'],
  late: ["About how late do you think you'll be?", 'Sorry — roughly how many minutes late?'],
  change: ['What would you like to change it to?', 'Sorry — what would you like to change: the time, the day, or the number of people?'],
  lookup: ['Of course — what name is the booking under?', 'Sorry — what name is the booking under? Could you spell the surname?'],
  which: ['Which one is it?', 'Sorry — which of those bookings is it?'],
  'anything-else': ['Is there anything else I can help with?', 'Anything else I can help with?'],
  callback: ['Can I take a name and a number for them to call you back?', 'Sorry — a name and number for the callback?'],
};

/* The question just asked, as the parser should hear the answer: "Kowalski"
   in answer to "what name is the booking under?" is a name, exactly as it is
   in answer to "can I take a name?". */
const EXPECT_AS = { lookup: 'name', callback: 'name', which: 'choice', change: 'time', 'offer-book': 'confirm', 'confirm-hold': 'confirm', 'anything-else': null, fix: null };

/* ── a call ──────────────────────────────────────────────────────────────── */

export function createCall(diary) {
  return {
    diary,
    task: null,             // 'book' | 'cancel' | 'change' | 'late' | 'check' | 'callback'
    slots: { notes: [] },
    hold: null,             // the table being held while details are taken
    offers: [],             // times offered and not yet taken
    target: null,           // { date, b } — a booking being changed
    change: null,           // what they want it changed to
    expecting: null,
    misses: 0,              // questions in a row not understood
    lookups: 0,
    notesAsked: false,
    turns: [],
    events: [],
    done: false,
    lastSay: '',
    outcome: null,
    seq: 0,
  };
}

export function greet(call) {
  const hour = Math.floor(call.diary.now / 60);
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return say(call, `${part}, ${HOUSE.name}, how can I help?`, null);
}

function say(call, text, expecting, events = [], ops = []) {
  call.expecting = expecting;
  call.lastSay = text;
  call.turns.push({ who: 'desk', text });
  call.events.push(...events);
  return { say: text, expecting, events, ops, done: call.done, slots: view(call), hold: call.hold, target: call.target };
}

/** What the screen should show the receptionist has understood so far. */
function view(call) {
  const s = call.slots;
  /* Between jobs the slots are empty; show what the last job left behind,
     so the card still says what was booked after the caller says goodbye. */
  const b = call.outcome?.booking;
  if (!call.task && b && s.party == null && !s.name) {
    return {
      task: { booked: 'booked', cancelled: 'cancelled', late: 'noted late', changed: 'changed', checked: 'checked' }[call.outcome.kind] ?? null,
      party: b.party, date: call.outcome.date, time: b.at, name: b.name, phone: b.phone ?? null,
      notes: (b.note ?? '').replace(/^Booked by Front Desk\.\s*/, '').split(/(?<=\.)\s+/).map((x) => x.replace(/\.$/, '')).filter(Boolean),
    };
  }
  if (!call.task && call.outcome?.kind === 'callback' && !s.name) {
    return { task: 'callback', party: null, date: null, time: null, name: call.outcome.name, phone: call.outcome.phone, notes: [call.outcome.reason] };
  }
  return {
    task: call.task,
    party: s.party ?? null,
    date: s.date ?? null,
    time: s.time ?? null,
    name: s.name ?? null,
    phone: s.phone ?? null,
    notes: s.notes.map((n) => n.text),
  };
}

const zonePhrase = (o) => ZONE_PHRASE[o.zone] ?? '';

/* How a note sounds read back down the phone, as opposed to how it reads on
   a ticket in the kitchen. */
const SPOKEN = {
  'nut allergy': 'the nut allergy', 'gluten-free (coeliac)': 'that it needs to be gluten-free',
  'dairy-free': 'that it needs to be dairy-free', 'shellfish allergy': 'the shellfish allergy',
  'sesame allergy': 'the sesame allergy', 'egg allergy': 'the egg allergy', vegan: 'vegan', vegetarian: 'vegetarian',
  halal: 'halal', birthday: 'the birthday', anniversary: 'the anniversary',
  'proposal — be discreet': "the proposal — we'll be discreet", graduation: 'the graduation', 'leaving do': 'the leaving do',
  'wheelchair — step-free route': 'the wheelchair', highchair: 'a highchair', 'room for a pram': 'the pram',
  'window table': 'that you’d like the window', 'quiet table': 'somewhere quiet', banquette: 'the banquette',
};
const spoken = (t) => SPOKEN[t] ?? (/birthday$|highchairs$/.test(t) ? `the ${t}` : t);
const when = (call, date, at) => `${sayDate(date, call.diary.today)} at ${sayTime(at)}`;
const WORDS = ['no one', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const people = (n) => WORDS[n] ?? String(n);
const tableWord = (o) => (o.tableIds.length > 1 ? `tables ${o.tableIds.join(' and ')}` : `table ${o.tableIds[0]}`);

function reference(date, at, name, party) {
  let h = 7;
  for (const ch of `${date}|${at}|${name}|${party}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `BV-${String(1000 + (h % 9000))}`;
}

/* ── one turn ────────────────────────────────────────────────────────────── */

/**
 * The caller said something. Returns what to say back.
 *
 * `hint` is an intent from somewhere smarter than the parser — the small
 * language model, when it is loaded — used only when the parser found no
 * intent of its own.
 */
export function hear(call, text, { hint = null } = {}) {
  const diary = call.diary;
  const u = understand(text, { expecting: EXPECT_AS[call.expecting] ?? call.expecting, today: diary.today, now: diary.now });
  if (hint && !u.intent && !u.topic && !u.affirm && !u.deny && !u.nothing && !u.bye && !u.repeat) {
    if (hint.startsWith('topic:')) u.topic = hint.slice(6);
    else u.intent = hint;
    u.hinted = hint;
  }
  call.turns.push({ who: 'caller', text, reading: u });

  if (call.done) return say(call, 'The call has ended.', null);

  const pre = [];   // things said before the next question: acknowledgements, answers

  /* ── things that can happen at any point in a call ── */
  if (u.repeat) return say(call, call.lastSay || `${HOUSE.name}, how can I help?`, call.expecting);

  if (u.greet && !call.task) return say(call, `Hello! ${HOUSE.name} — how can I help?`, null);

  if (u.intent === 'human') return startCallback(call, u, /complain|not happy|disgusted|unacceptable/.test(u.text.toLowerCase()) ? 'complaint' : 'asked for the manager');

  if (u.topic) {
    pre.push(FAQ[u.topic]);
    call.events.push({ kind: 'faq', text: `Answered a question about ${TOPIC_NAME[u.topic]}` });
    /* A question on its own, with nothing else in it: answer it and go back
       to whatever was being asked, or ask what else. */
    const hasMore = u.intent || Object.keys(u.slots).some((k) => k !== 'notes') || (u.slots.notes && call.task === 'book');
    if (!hasMore) {
      if (call.expecting && call.task) return reask(call, pre, false);
      const follow = call.task ? '' : call.expecting === 'offer-book' ? 'Anything else I can help with?' : 'Would you like me to book you a table?';
      return say(call, [...pre, follow].filter(Boolean).join(' '), call.task ? call.expecting : 'offer-book');
    }
  }

  if (call.expecting === 'offer-book') {
    if (u.affirm) { call.task = 'book'; return advanceBooking(call, u, ['Lovely.']); }
    if (u.deny || u.nothing || u.bye) return goodbye(call, u);
  }

  if (call.expecting === 'anything-else') {
    if (u.bye || u.nothing || u.deny || (u.thanks && !u.intent && !Object.keys(u.slots).length)) return goodbye(call, u);
    if (u.intent || Object.keys(u.slots).length) {
      resetForNewTask(call);
    } else if (u.affirm) {
      return say(call, 'Of course — what can I do for you?', null);
    }
  }

  if (u.bye && !u.intent) return goodbye(call, u);

  /* ── starting a job ── */
  if (!call.task || (call.task === 'book' && !call.hold && ['cancel', 'late', 'check'].includes(u.intent))) {
    if (u.intent && u.intent !== 'book') call.task = u.intent;
    else if (u.intent === 'book' || u.slots.party != null || u.slots.date || u.slots.time != null) call.task = 'book';
  }
  /* "Can I change my booking" during a fresh booking is a correction, not a
     change to some other booking — unless they mention one they already have. */
  if (call.task === 'book' && u.intent === 'change' && /\b(?:my|our|the) (?:booking|reservation)\b|\b(?:already|we'?ve) (?:got|booked|have)/.test(u.text.toLowerCase()) && !call.hold) {
    call.task = 'change';
  }

  switch (call.task) {
    case 'book': return advanceBooking(call, u, pre);
    case 'cancel': case 'change': case 'late': case 'check': return advanceExisting(call, u, pre);
    case 'callback': return advanceCallback(call, u, pre);
    default: break;
  }

  if (u.thanks) return say(call, [...pre, "You're welcome — is there anything I can help with?"].join(' '), null);
  if (u.affirm && !call.expecting) return say(call, 'Great — are you looking to book a table, or is it about a booking you already have?', null);

  return notUnderstood(call, pre);
}

function resetForNewTask(call) {
  call.task = null;
  call.slots = { notes: [] };
  call.hold = null;
  call.offers = [];
  call.target = null;
  call.change = null;
  call.notesAsked = false;
  call.lookups = 0;
  call.misses = 0;
}

function notUnderstood(call, pre = []) {
  call.misses++;
  if (call.misses >= 3) {
    return startCallback(call, null, 'the receptionist could not understand the caller', ["I'm so sorry, I'm struggling to follow — let me get the manager to ring you back instead."]);
  }
  if (call.expecting && ASK[call.expecting]) return reask(call, pre, true);
  return say(call, [...pre, "Sorry, I didn't quite catch that. Are you looking to book a table, or is it about a booking you already have?"].join(' '), null);
}

function reask(call, pre, missed) {
  const q = ASK[call.expecting];
  if (!q) return say(call, pre.join(' ') || 'Sorry?', call.expecting);
  const again = call.expecting === 'choice' && call.offers.length
    ? offerSentence(call, call.offers)
    : call.expecting === 'confirm' && call.task === 'book'
      ? readBack(call)
      : q[missed ? 1 : 0];
  const lead = !missed && call.expecting !== 'choice' && call.expecting !== 'confirm' ? (pre.length ? 'Now — ' : '') : '';
  return say(call, [...pre, lead + (lead ? again.charAt(0).toLowerCase() + again.slice(1) : again)].join(' '), call.expecting);
}

function goodbye(call, u) {
  call.done = true;
  const unfinished = call.task === 'book' && call.outcome == null && call.slots.party != null;
  const text = unfinished
    ? "No problem — I haven't booked anything. Thanks for calling, bye now."
    : `${u?.thanks || call.outcome ? "You're welcome — thanks" : 'Thanks'} for calling ${HOUSE.name}. Bye now!`;
  if (unfinished) call.outcome = call.outcome ?? { kind: 'no-booking' };
  return say(call, text, null, [{ kind: 'end', text: 'Call ended' }]);
}

/* ── booking a table ─────────────────────────────────────────────────────── */

function mergeBookingSlots(call, u) {
  const s = call.slots;
  const was = key(call);
  const us = u.slots;
  if (us.party != null) s.party = us.party;
  else if (us.partyDelta && s.party != null) s.party = Math.max(1, s.party + us.partyDelta);
  if (us.date) s.date = us.date;
  if (us.time != null) { s.time = us.time; s.approx = !!us.approx; }
  if (us.name) s.name = us.name;
  if (us.phone) s.phone = us.phone;
  for (const n of us.notes ?? []) if (!s.notes.some((x) => x.text === n.text)) s.notes.push(n);
  if (us.maybe && !s.notes.some((x) => x.text === us.maybe)) s.notes.push({ kind: 'party', text: us.maybe });
  if (us.children && !s.notes.some((x) => /children/.test(x.text))) s.notes.push({ kind: 'party', text: `${us.children} children` });
  for (const n of us.notes ?? []) if (PREFERS[n.text]) s.prefer = PREFERS[n.text];
  if (key(call) !== was) { call.hold = null; call.offers = []; }
  return key(call) !== was;
}

const key = (call) => `${call.slots.party}|${call.slots.date}|${call.slots.time}|${call.slots.prefer ?? ''}`;

function advanceBooking(call, u, pre = []) {
  const s = call.slots;
  const diary = call.diary;
  const events = [];

  /* A date that disagrees with its own weekday: ask, don't guess. */
  if (u.flags.dateClash) {
    const { said, date } = u.flags.dateClash;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    mergeBookingSlots(call, { ...u, slots: { ...u.slots, date: undefined } });
    s.date = null;
    const d = new Date(`${date}T12:00:00Z`);
    return say(call, `Just to check — the ${d.getUTCDate()}${ord(d.getUTCDate())} is a ${dayNames[d.getUTCDay()]}. Did you mean ${dayNames[d.getUTCDay()]} the ${d.getUTCDate()}${ord(d.getUTCDate())}, or ${dayNames[said]}?`, 'date');
  }
  if (u.flags.vagueDate && !u.slots.date) {
    mergeBookingSlots(call, u);
    return say(call, [...pre, u.flags.vagueDate === 'weekend' ? 'Of course — would that be Saturday or Sunday?' : 'Which day next week?'].join(' '), 'date');
  }

  /* "Nothing earlier — 9 is still yours if you'd like it." */
  if (call.expecting === 'confirm-hold' && call.hold) {
    if (u.affirm && !Object.keys(u.slots).length) return collectDetails(call, [...pre, 'Lovely.'], events);
    if ((u.deny || u.nothing) && !Object.keys(u.slots).length) {
      call.hold = null;
      s.time = null;
      return say(call, [...pre, 'No problem. Would another day or time work?'].join(' '), 'time', events);
    }
  }

  /* Choosing between offered times */
  if (call.expecting === 'choice' && call.offers.length) {
    let chosen = null;
    if (u.pick != null) chosen = call.offers[Math.min(u.pick, call.offers.length - 1)];
    else if (u.slots.time != null && !u.slots.date) chosen = call.offers.find((o) => o.at === u.slots.time) ?? null;
    else if (u.affirm && call.offers.length === 1) chosen = call.offers[0];
    else if (u.affirm && !u.slots.time && !u.slots.shift) {
      return say(call, `Which would you prefer — ${call.offers.map((o) => sayTime(o.at)).join(' or ')}?`, 'choice');
    }
    if (chosen) {
      s.time = chosen.at;
      s.date = chosen.date;
      call.hold = chosen;
      call.offers = [];
      mergeBookingSlots(call, { slots: { ...u.slots, time: undefined, date: undefined } });
      call.hold = chosen;
      events.push({ kind: 'hold', text: `Holding ${tableWord(chosen)} ${zonePhrase(chosen)} · ${shortDate(chosen.date)} ${hm(chosen.at)}` });
      return collectDetails(call, [...pre, 'Lovely.'], events);
    }
    if (u.slots.shift) {
      const dir = u.slots.shift.dir;
      const from = dir < 0 ? Math.min(...call.offers.map((o) => o.at), s.time) : Math.max(...call.offers.map((o) => o.at), s.time);
      const found = lookFor({ party: s.party, date: s.date, time: from, prefer: s.prefer, direction: dir }, diary);
      events.push({ kind: 'check', text: `Looked ${dir < 0 ? 'earlier' : 'later'} than ${hm(from)} for ${s.party}` });
      if (found.alternatives.length) {
        call.offers = found.alternatives;
        return say(call, [...pre, offerSentence(call, call.offers, dir < 0 ? "The earliest I've got" : 'Later on')].join(' '), 'choice', events);
      }
      return say(call, [...pre, `I'm afraid there's nothing ${dir < 0 ? 'earlier' : 'later'} that evening for ${people(s.party)}. ${offerSentence(call, call.offers, 'I can still do')}`].join(' '), 'choice', events);
    }
    if ((u.deny || u.nothing) && !Object.keys(u.slots).length) {
      call.offers = [];
      s.date = null;
      s.time = null;
      return say(call, [...pre, 'No problem. Would another day work?'].join(' '), 'date', events);
    }
  }

  /* Reading back and the caller says yes */
  if (call.expecting === 'confirm' && u.affirm && !mergeBookingSlots(call, u)) {
    return commitBooking(call, pre);
  }
  /* Reading back and the caller says no */
  if (call.expecting === 'confirm' && (u.deny || u.nothing) && !Object.keys(u.slots).length) {
    return say(call, [...pre, 'Sorry about that — what should I change?'].join(' '), 'fix');
  }

  /* The notes question */
  if (call.expecting === 'notes') {
    call.notesAsked = true;
    const had = s.notes.length;
    const changed = mergeBookingSlots(call, u);
    if (!u.nothing && s.notes.length === had && !changed && !u.affirm && !u.slots.name && !u.slots.phone) {
      /* Something we have no category for — "my friend is pregnant, so no
         raw fish". A receptionist writes it down as said. */
      const said = u.text.trim().replace(/^(?:yes|yeah|well|um|uh|so)[, ]+/i, '').slice(0, 90);
      if (said.length > 3) s.notes.push({ kind: 'said', text: `“${said}”` });
    } else if (u.affirm && s.notes.length === had) {
      return say(call, 'Of course — what should I note down?', 'notes');
    }
    if (s.notes.length > had) {
      for (const n of s.notes.slice(had)) events.push({ kind: 'note', text: `Noted: ${n.text}` });
      pre.push(s.notes.slice(had).some((n) => n.kind === 'occasion') ? "Lovely — I'll let the team know." : "I've put that on the booking.");
    }
    return collectDetails(call, pre, events);
  }

  /* "Anything earlier?" with a table already held, or before one was found */
  if (u.slots.shift && s.time != null && s.party != null && s.date && u.slots.time == null) {
    const dir = u.slots.shift.dir;
    const from = s.time;
    const found = lookFor({ party: s.party, date: s.date, time: from, prefer: s.prefer, direction: dir }, diary);
    events.push({ kind: 'check', text: `Looked ${dir < 0 ? 'earlier' : 'later'} than ${hm(from)} for ${s.party}` });
    if (found.alternatives.length) {
      call.hold = null;
      call.offers = found.alternatives;
      call.offersKey = key(call);
      return say(call, [...pre, offerSentence(call, call.offers, dir < 0 ? 'Earlier, I can do' : 'Later, I can do')].join(' '), 'choice', events);
    }
    return say(call, [...pre, `I'm afraid there's nothing ${dir < 0 ? 'earlier' : 'later'} for ${people(s.party)} that evening.${call.hold ? ` ${sayTime(call.hold.at)} is still yours if you'd like it.` : ''}`].join(' '), call.hold ? 'confirm-hold' : call.expecting, events);
  }

  const before = { ...s, notes: s.notes.length };
  const hadHold = !!call.hold;
  const changed = mergeBookingSlots(call, u);
  if (hadHold && changed && !pre.length) pre.push('No problem.');
  const learned = changed || s.name !== before.name || s.phone !== before.phone || s.notes.length !== before.notes;
  if (s.notes.length > before.notes) {
    for (const n of s.notes.slice(before.notes)) events.push({ kind: 'note', text: `Noted: ${n.text}` });
  }
  if (u.flags.badPhone) {
    return say(call, [...pre, `Sorry, I only got ${u.flags.badPhone} digits there — could you give me the whole number?`].join(' '), 'phone', events);
  }

  if (!learned && call.expecting && call.expecting !== 'fix' && !u.affirm && !pre.length) {
    return notUnderstood(call, pre);
  }
  if (learned) call.misses = 0;

  if (u.affirm && call.expecting === 'confirm') return commitBooking(call, pre);

  /* ── what is still missing? ── */
  if (s.party == null) {
    const lead = s.date || s.time != null ? `Of course${s.date ? ` — ${sayDate(s.date, diary.today)}` : ''}${s.time != null ? ` at ${sayTime(s.time)}` : ''}.` : 'Of course.';
    return say(call, [...pre, lead, ASK.party[0]].join(' '), 'party', events);
  }

  if (s.party > HOUSE.maxParty) {
    return startCallback(call, u, `party of ${s.party}`, [...pre, `A party of ${s.party} — lovely. For groups over ${HOUSE.maxParty} we set up the snug with a set menu, so our manager looks after those personally.`]);
  }

  if (!s.date) {
    return say(call, [...pre, s.time != null ? `${people(s.party)} at ${sayTime(s.time)} — and which day?` : `A table for ${people(s.party)}. ${ASK.date[0]}`].join(' ').replace(/^(\w)/, (c) => c.toUpperCase()), 'date', events);
  }

  const dp = dateProblem(s.date, diary.today);
  if (dp) {
    const was = s.date;
    s.date = null;
    const txt = dp.code === 'closed'
      ? `I'm sorry, we're closed on Mondays. Would ${sayDate(addDays(was, -1), diary.today).replace(/^this /, '')} or ${sayDate(addDays(was, 1), diary.today).replace(/^this /, '')} work instead?`
      : dp.code === 'past' ? `That date's already gone, I'm afraid — which day did you mean?`
        : `The book's only open ${HOUSE.horizon} days ahead, so I can't take ${sayDate(was, diary.today)} yet. Is there a date before then that works?`;
    return say(call, [...pre, txt].join(' '), 'date', events);
  }

  if (s.time == null) {
    return say(call, [...pre, `${sayDate(s.date, diary.today).replace(/^\w/, (c) => c.toUpperCase())} for ${people(s.party)} — ${ASK.time[0].charAt(0).toLowerCase()}${ASK.time[0].slice(1)}`].join(' '), 'time', events);
  }

  const tp = timeProblem({ party: s.party, date: s.date, time: s.time }, diary);
  if (tp) {
    if (tp.code === 'lunch') { s.time = null; return say(call, [...pre, "We only open for dinner, I'm afraid — from five o'clock. Would an evening time work?"].join(' '), 'time', events); }
    if (tp.code === 'too-early') { s.time = null; return say(call, [...pre, "We don't open until five — what time after that would suit?"].join(' '), 'time', events); }
    if (tp.code === 'too-late') {
      s.time = null;
      return say(call, [...pre, `For ${people(s.party)}, the latest I can seat you is ${sayTime(tp.latest)}, so you've time to eat before we close. Would that, or something earlier, work?`].join(' '), 'time', events);
    }
    if (tp.code === 'past') {
      /* It is twenty to eight and they asked for seven. Say so, and offer the
         earliest that is still ahead — never fall through to checking the
         floor at seven, which is free in the book precisely because it has
         already happened. */
      const found = lookFor({ party: s.party, date: s.date, time: tp.earliest, prefer: s.prefer }, diary);
      const offers = found.exact ? [found.exact] : found.alternatives.filter((o) => o.at >= tp.earliest).length
        ? found.alternatives.filter((o) => o.at >= tp.earliest) : found.otherNight ? [found.otherNight] : [];
      events.push({ kind: 'check', text: `${hm(s.time)} has passed — checked the floor for ${s.party} from ${hm(tp.earliest)}` });
      const gone = `It's already ${sayTime(diary.now)} here, so ${sayTime(s.time)} has gone`;
      if (!offers.length) {
        s.date = null;
        s.time = null;
        return say(call, [...pre, `${gone}, and we're full for ${people(s.party)} for the rest of tonight. Would another night work?`].join(' '), 'date', events);
      }
      call.offers = offers;
      call.offersKey = key(call);
      const tonight = offers.every((o) => o.date === s.date);
      return say(call, [...pre, `${gone} — ${tonight ? `the earliest I can do is ${offers.map((o) => sayTime(o.at)).join(' or ')}` : `and tonight's full, but I can do ${when(call, offers[0].date, offers[0].at)}`}. Would that work?`].join(' '), 'choice', events);
    }
  }

  /* Times already offered and the details have not changed: they said
     something else (a name, a question) — offer the same times again rather
     than checking the floor all over. */
  if (!call.hold && call.offers.length && call.offersKey === key(call)) {
    return say(call, [...pre, offerSentence(call, call.offers)].join(' '), 'choice', events);
  }

  /* ── ask the floor ── */
  if (!call.hold) {
    const found = lookFor({ party: s.party, date: s.date, time: s.time, prefer: s.prefer }, diary);
    const free = findTables(s.party, s.time, diary.bookFor(s.date), { limit: 99 }).length;
    events.push({ kind: 'check', text: `Checked the floor for ${s.party} · ${shortDate(s.date)} ${hm(s.time)}${found.exact ? ` — ${free} arrangement${free === 1 ? '' : 's'} free` : ' — nothing free'}` });
    if (found.exact) {
      call.hold = found.exact;
      events.push({ kind: 'hold', text: `Holding ${tableWord(found.exact)} ${zonePhrase(found.exact)}` });
      const pref = found.missedPreference ? ` The ${s.prefer === 'window' ? 'window tables are' : 'banquette is'} all taken then, but I've a lovely table ${zonePhrase(found.exact)}.` : '';
      const opener = pre.length ? (hadHoldBefore(call) ? ['Let me check again…'] : []) : ['Let me have a look…'];
      return collectDetails(call, [...pre, ...opener, `Yes, I can do ${people(s.party)} ${when(call, s.date, s.time)}.${pref}`], events);
    }
    if (found.alternatives.length) {
      call.offers = found.alternatives;
      call.offersKey = key(call);
      events.push({ kind: 'offer', text: `${hm(s.time)} is full — offered ${found.alternatives.map((o) => hm(o.at)).join(' or ')}` });
      const lead = pre.length ? [] : ['Let me have a look…'];
      return say(call, [...pre, ...lead, `I'm afraid ${sayTime(s.time)} is fully booked for ${people(s.party)}. ${offerSentence(call, found.alternatives)}`].join(' '), 'choice', events);
    }
    if (found.otherNight) {
      call.offers = [found.otherNight];
      call.offersKey = key(call);
      events.push({ kind: 'offer', text: `${shortDate(s.date)} is full for ${s.party} — offered ${shortDate(found.otherNight.date)} ${hm(found.otherNight.at)}` });
      return say(call, [...pre, `I'm so sorry — ${sayDate(s.date, diary.today)} is completely full for ${people(s.party)}. The nearest I've got is ${when(call, found.otherNight.date, found.otherNight.at)}. Would that work?`].join(' '), 'choice', events);
    }
    s.date = null;
    s.time = null;
    events.push({ kind: 'offer', text: 'Nothing free that week' });
    return say(call, [...pre, `I'm really sorry, we're fully booked for ${people(s.party)} that whole week. Is there another week you could do?`].join(' '), 'date', events);
  }

  return collectDetails(call, pre, events);
}

const hadHoldBefore = (call) => call.events.some((e) => e.kind === 'hold');

function ord(n) { return n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'; }

function offerSentence(call, offers, lead = 'I can do') {
  const times = offers.map((o) => sayTime(o.at));
  const sameDay = offers.every((o) => o.date === offers[0].date);
  if (offers.length === 1) return `${lead} ${sameDay && offers[0].date === call.slots.date ? sayTime(offers[0].at) : when(call, offers[0].date, offers[0].at)} — would that work?`;
  return `${lead} ${times.slice(0, -1).join(', ')} or ${times[times.length - 1]} — would either of those work?`;
}

/** Name, number, notes, then the read-back. */
function collectDetails(call, pre, events) {
  const s = call.slots;
  if (!s.name) return say(call, [...pre, pre.length ? 'Can I take a name for the booking?' : ASK.name[0]].join(' '), 'name', events);
  if (!s.phone) return say(call, [...pre, `Thanks${s.name.split(' ').length === 1 || /^(?:Mr|Mrs|Ms|Miss|Dr)\b/.test(s.name) ? '' : `, ${s.name.split(' ')[0]}`}. ${ASK.phone[0]}`].join(' '), 'phone', events);
  if (!call.notesAsked) {
    call.notesAsked = true;
    return say(call, [...pre, ASK.notes[0]].join(' '), 'notes', events);
  }
  return say(call, [...pre, readBack(call)].join(' '), 'confirm', events);
}

function readBack(call) {
  const s = call.slots;
  const notes = s.notes.filter((n) => n.kind !== 'said').map((n) => n.text);
  const said = s.notes.some((n) => n.kind === 'said');
  const noteText = notes.length || said
    ? ` — and I've noted ${[...notes.map(spoken), ...(said ? ['what you said for the kitchen'] : [])].join(', ').replace(/, ([^,]*)$/, ' and $1')}`
    : '';
  return `So that's a table for ${people(s.party)}, ${when(call, s.date, s.time)}${call.hold ? ` ${zonePhrase(call.hold)}` : ''}, under ${s.name}, on ${s.phone}${noteText}. Shall I book that in?`;
}

function commitBooking(call, pre = []) {
  const s = call.slots;
  const diary = call.diary;
  const events = [];

  /* Check again. Between "I can do eight" and "yes please" the host may have
     sat a walk-in on that very table; the only safe booking is one checked
     at the moment it is written. */
  if (!call.hold || !stillFree(call.hold, s.party, diary)) {
    const found = lookFor({ party: s.party, date: s.date, time: s.time, prefer: s.prefer }, diary);
    events.push({ kind: 'check', text: 'The held table was taken on the floor meanwhile — checked again' });
    if (found.exact) {
      call.hold = found.exact;
      events.push({ kind: 'hold', text: `Holding ${tableWord(found.exact)} instead` });
    } else {
      call.hold = null;
      call.offers = found.alternatives.length ? found.alternatives : found.otherNight ? [found.otherNight] : [];
      if (!call.offers.length) return say(call, "I'm so sorry — that table's just gone, and there's nothing else that evening. Would another day work?", 'date', events);
      return say(call, `I'm so sorry — somebody's just taken that table. ${offerSentence(call, call.offers)}`, 'choice', events);
    }
  }

  const h = call.hold;
  const allergy = s.notes.some((n) => n.kind === 'allergy');
  const access = s.notes.some((n) => /wheelchair|pram/.test(n.text));
  const booking = {
    id: `fd${Date.now().toString(36).slice(-4)}${++call.seq}`,
    at: h.at,
    name: s.name,
    party: s.party,
    tableIds: [...h.tableIds],
    status: 'confirmed',
    phone: s.phone,
    tag: 'by phone',
    note: ['Booked by Front Desk.', ...s.notes.map((n) => n.text.replace(/^./, (c) => c.toUpperCase()) + '.')].join(' '),
    ...(allergy ? { allergy: true } : {}),
    ...(access ? { access: true } : {}),
    edited: true,
    ref: reference(h.date, h.at, s.name, s.party),
  };
  diary.add(h.date, booking);
  call.outcome = { kind: 'booked', date: h.date, booking };
  events.push({ kind: 'book', text: `Booked ${s.name} · ${s.party} · ${shortDate(h.date)} ${hm(h.at)} · ${tableWord(h)} · ${booking.ref}` });
  if (allergy) events.push({ kind: 'staff', text: `Told the kitchen: ${s.notes.filter((n) => n.kind === 'allergy').map((n) => n.text).join(', ')} on ${tableWord(h)}` });
  if (access) events.push({ kind: 'staff', text: `Told the floor: keep a clear route to ${tableWord(h)}` });
  const sms = `${HOUSE.name}: you're booked for ${s.party} on ${shortDate(h.date)} at ${hm(h.at)}. Ref ${booking.ref}. Reply C to cancel.${allergy ? " We've noted the allergy." : ''}`;
  events.push({ kind: 'sms', text: 'Confirmation text drafted', detail: sms });

  const occasion = s.notes.find((n) => n.kind === 'occasion');
  const extra = occasion ? /birthday/.test(occasion.text) ? ' And happy birthday to them!' : /anniversary/.test(occasion.text) ? ' Happy anniversary!' : '' : '';
  resetKeepOutcome(call);
  return say(call, [...pre, `Lovely, that's all booked. Your reference is ${spellRef(booking.ref)}, and I'll text that over now.${extra}`, ASK['anything-else'][0]].join(' '), 'anything-else', events, [{ op: 'add', date: h.date, booking }]);
}

const spellRef = (ref) => ref.replace('-', ' ').replace(/\d/g, (d) => `${d} `).trim().replace(/\s+/g, ' ').replace(/^BV/, 'B V');

function resetKeepOutcome(call) {
  const outcome = call.outcome;
  resetForNewTask(call);
  call.outcome = outcome;
  call.task = null;
}

/* ── a booking they already have ─────────────────────────────────────────── */

function advanceExisting(call, u, pre = []) {
  const diary = call.diary;
  const s = call.slots;
  if (u.slots.name) s.name = u.slots.name;
  if (u.slots.phone) s.phone = u.slots.phone;
  if (u.slots.date && !call.target) s.date = u.slots.date;
  if (u.slots.late != null) s.late = u.slots.late;

  /* What they want it changed to, gathered from any turn. */
  if (call.task === 'change') {
    call.change ??= {};
    if (u.slots.party != null) call.change.party = u.slots.party;
    if (u.slots.partyDelta) call.change.delta = u.slots.partyDelta;
    if (u.slots.time != null) call.change.time = u.slots.time;
    if (u.slots.shift) call.change.shift = u.slots.shift;
    if (u.slots.date && call.target && u.slots.date !== call.target.date) call.change.date = u.slots.date;
    /* "We've booked for Friday but could we move it to Saturday": the date
       they are moving to, not the one they have. Found by the parser, which
       prefers the day that is not "booked for". */
    if (u.slots.date && !call.target && /\b(?:to|instead|rather|make it)\b/.test(u.text.toLowerCase())) {
      call.change.date = u.slots.date;
      s.date = null;
    }
    if (u.slots.notes) call.change.notes = [...(call.change.notes ?? []), ...u.slots.notes];
  }

  /* ── find the booking ── */
  if (!call.target) {
    if (call.expecting === 'which' && call.candidates) {
      const pick = call.candidates.find((c) => (u.slots.date && c.date === u.slots.date) || (u.slots.time != null && c.b.at === u.slots.time))
        ?? (u.pick != null ? call.candidates[u.pick] : null);
      if (pick) call.target = pick;
      else return reask(call, pre, true);
    } else {
      if (!s.name && !s.phone) return say(call, [...pre, ASK.lookup[0]].join(' '), 'lookup');
      const found = findBookings(diary, { name: s.name, phone: s.phone, date: s.date });
      if (!found.length) {
        call.lookups++;
        if (call.lookups >= 2) {
          return startCallback(call, u, `could not find a booking under ${s.name}`, [...pre, `I'm sorry, I still can't find a booking under ${s.name}${s.date ? ` for ${sayDate(s.date, diary.today)}` : ''} — I'll ask the manager to look into it and ring you back.`]);
        }
        const who = s.name;
        s.name = null;
        return say(call, [...pre, `I can't see a booking under ${who}${s.date ? ` for ${sayDate(s.date, diary.today)}` : ''}. Could you spell the surname for me?`].join(' '), 'lookup', [{ kind: 'check', text: `Searched the book for “${who}” — no match` }]);
      }
      if (found.length > 1) {
        call.candidates = found.slice(0, 3);
        return say(call, [...pre, `I've got ${found.length === 2 ? 'two' : 'a few'} bookings under that name — ${call.candidates.map((c) => `${people(c.b.party)} ${when(call, c.date, c.b.at)}`).join(', or ')}. Which one is it?`].join(' '), 'which');
      }
      call.target = found[0];
    }
    const { date, b } = call.target;
    call.events.push({ kind: 'check', text: `Found ${b.name} · ${b.party} · ${shortDate(date)} ${hm(b.at)} · table ${b.tableIds.join('+')}` });
    pre.push(`Thanks — I've found it: ${people(b.party)} ${when(call, date, b.at)}, under ${b.name}.`);
  }

  const { date, b } = call.target;

  switch (call.task) {
    case 'check': {
      resetKeepOutcome(call);
      call.outcome = { kind: 'checked', date, booking: b };
      return say(call, [...pre, "You're all set — we'll see you then.", ASK['anything-else'][0]].join(' '), 'anything-else');
    }

    case 'cancel': {
      if (call.expecting !== 'confirm') {
        return say(call, [...pre, 'Shall I cancel that for you?'].join(' '), 'confirm');
      }
      if (u.deny || u.nothing) {
        resetKeepOutcome(call);
        return say(call, ["No problem — I've left it as it is.", ASK['anything-else'][0]].join(' '), 'anything-else');
      }
      if (!u.affirm) return reask(call, pre, true);
      const changes = { status: 'cancelled', note: `${b.note ? b.note + ' ' : ''}Cancelled by phone at ${hm(diary.now)}.`, edited: true };
      diary.update(date, b.id, changes);
      const events = [{ kind: 'cancel', text: `Cancelled ${b.name} · ${b.party} · ${shortDate(date)} ${hm(b.at)} — table ${b.tableIds.join('+')} released` }];
      if (date === diary.today) events.push({ kind: 'staff', text: `Told the floor: table ${b.tableIds.join('+')} is free from ${hm(b.at)}` });
      resetKeepOutcome(call);
      call.outcome = { kind: 'cancelled', date, booking: b };
      return say(call, ["That's cancelled — thanks so much for letting us know.", ASK['anything-else'][0]].join(' '), 'anything-else', events, [{ op: 'update', date, id: b.id, changes }]);
    }

    case 'late': {
      if (s.late == null) {

        if (s.late == null) return say(call, [...pre, ASK.late[call.expecting === 'late' ? 1 : 0]].join(' '), 'late');
      }
      return applyLate(call, pre);
    }

    case 'change': return applyChange(call, u, pre);
    default: return notUnderstood(call, pre);
  }
}

function applyLate(call, pre) {
  const diary = call.diary;
  const { date, b } = call.target;
  const late = Math.max(5, Math.round(call.slots.late / 5) * 5);
  const newAt = b.at + late;
  const book = diary.bookFor(date);
  const dur = b.duration ?? turnTime(b.party);
  const events = [];
  let changes, text;

  if (late <= HOUSE.grace) {
    changes = { note: `${b.note ? b.note + ' ' : ''}Rang at ${hm(diary.now)}: running ${late} min late.`, edited: true };
    text = `That's no problem at all — I'll let the team know you'll be about ${late} minutes. See you soon.`;
    events.push({ kind: 'note', text: `Noted: ${b.name} running ${late} late — within the ${HOUSE.grace}-minute hold` });
  } else if (tablesFree(b.tableIds, newAt, dur, book, b.id)) {
    changes = { at: newAt, note: `${b.note ? b.note + ' ' : ''}Rang at ${hm(diary.now)}: running ${late} late — moved from ${hm(b.at)}.`, edited: true };
    text = `That's fine — the table's free, so I've moved you to ${sayTime(newAt)}. See you then.`;
    events.push({ kind: 'move', text: `Moved ${b.name} ${hm(b.at)} → ${hm(newAt)} on table ${b.tableIds.join('+')} — still free` });
  } else {
    const other = findTables(b.party, newAt, book, { ignoreId: b.id, limit: 1 })[0];
    if (other) {
      changes = { at: newAt, tableIds: other.tableIds, note: `${b.note ? b.note + ' ' : ''}Rang at ${hm(diary.now)}: running ${late} late — moved from ${hm(b.at)} on ${b.tableIds.join('+')}.`, edited: true };
      text = `No problem — your table's needed later on, so I've moved you to another one and you're booked for ${sayTime(newAt)} now. See you then.`;
      events.push({ kind: 'move', text: `Moved ${b.name} to table ${other.tableIds.join('+')} at ${hm(newAt)} — the old table is booked after them` });
    } else {
      const until = b.at + HOUSE.grace;
      changes = { note: `${b.note ? b.note + ' ' : ''}Rang at ${hm(diary.now)}: running ${late} late. Can only hold to ${hm(until)}.`, edited: true };
      text = `I'm sorry — we're full tonight and the table's booked again after you, so I can hold it until ${sayTime(until)}. If you can make it by then, you're fine.`;
      events.push({ kind: 'note', text: `Told ${b.name}: held until ${hm(until)} — no other table free at ${hm(newAt)}` });
    }
  }
  diary.update(date, b.id, changes);
  if (date === diary.today) events.push({ kind: 'staff', text: `Told the floor: ${b.name} running ${late} late` });
  resetKeepOutcome(call);
  call.outcome = { kind: 'late', date, booking: b };
  return say(call, [...pre, text, 'Anything else?'].join(' '), 'anything-else', events, [{ op: 'update', date, id: b.id, changes }]);
}

function applyChange(call, u, pre) {
  const diary = call.diary;
  const { date, b } = call.target;
  const ch = call.change ?? {};

  /* Confirming a proposal already made */
  if (call.expecting === 'confirm' && call.proposal) {
    if (u.affirm) return commitChange(call, pre);
    if (u.deny || u.nothing) {
      call.proposal = null;
      resetKeepOutcome(call);
      return say(call, ["No problem — I've left it as it was.", ASK['anything-else'][0]].join(' '), 'anything-else');
    }
  }
  if (call.expecting === 'choice' && call.offers.length) {
    if (u.affirm && call.offers.length > 1 && u.pick == null && u.slots.time == null) {
      return say(call, `Which would you prefer — ${call.offers.map((o) => sayTime(o.at)).join(' or ')}?`, 'choice');
    }
    const pick = u.pick != null ? call.offers[Math.min(u.pick, call.offers.length - 1)]
      : u.slots.time != null ? call.offers.find((o) => o.at === u.slots.time)
        : u.affirm && call.offers.length === 1 ? call.offers[0] : null;
    if (pick) {
      call.proposal = { date: pick.date, at: pick.at, party: ch.newParty ?? b.party, tableIds: pick.tableIds };
      return commitChange(call, pre);
    }
    if (u.deny || u.nothing) {
      call.offers = [];
      resetKeepOutcome(call);
      return say(call, ["No problem — I've left it as it was.", ASK['anything-else'][0]].join(' '), 'anything-else');
    }
  }

  const party = ch.party ?? (ch.delta ? Math.max(1, b.party + ch.delta) : b.party);
  let at = ch.time ?? b.at;
  /* "Push it back to nine": the nine is the answer, the pushing is how they said it. */
  if (ch.shift && ch.time == null) at = b.at + ch.shift.dir * (ch.shift.by ?? 30);
  const newDate = ch.date ?? date;
  ch.newParty = party;

  if (party === b.party && at === b.at && newDate === date) {
    return say(call, [...pre, ASK.change[call.expecting === 'change' ? 1 : 0]].join(' '), 'change');
  }
  if (party > HOUSE.maxParty) {
    return startCallback(call, u, `wants to grow ${b.name} to ${party}`, [...pre, `For more than ${HOUSE.maxParty} the manager arranges it personally.`]);
  }

  const events = [];
  const what = [
    party !== b.party ? `${people(party)} people` : null,
    newDate !== date ? sayDate(newDate, diary.today) : null,
    at !== b.at ? `at ${sayTime(at)}` : null,
  ].filter(Boolean).join(', ');

  const tp = timeProblem({ party, date: newDate, time: at }, diary);
  if (tp && tp.code !== 'past') {
    return say(call, [...pre, tp.code === 'too-late' ? `I can't do that one — for ${people(party)} the latest I can seat is ${sayTime(tp.latest)}. Would that work?` : "We don't open until five — what time after that?"].join(' '), 'change');
  }

  if (newDate === date) {
    /* Same night: can they stay where they are? */
    const probe = { ...b, party, at, duration: undefined };
    const here = canSeat(probe, b.tableIds, diary.bookFor(date));
    if (here.ok) {
      call.proposal = { date, at, party, tableIds: b.tableIds };
      events.push({ kind: 'check', text: `Checked table ${b.tableIds.join('+')} for ${party} at ${hm(at)} — free` });
      return say(call, [...pre, `I can do that — ${what}, on the same table. Shall I change it?`].join(' '), 'confirm', events);
    }
    const other = findTables(party, at, diary.bookFor(date), { ignoreId: b.id, limit: 1 })[0];
    if (other) {
      call.proposal = { date, at, party, tableIds: other.tableIds };
      events.push({ kind: 'check', text: `Table ${b.tableIds.join('+')} can't take it (${here.message}) — ${other.label} can` });
      return say(call, [...pre, `I can do that — ${what}. I'll need to move you to a different table ${ZONE_PHRASE[byId.get(other.tableIds[0]).zone]}, which is no trouble. Shall I change it?`].join(' '), 'confirm', events);
    }
  }

  /* Somewhere else in the evening, or another night */
  const found = lookFor({ party, date: newDate, time: at, ignoreId: b.id }, diary);
  if (found.exact) {
    call.proposal = { date: newDate, at, party, tableIds: found.exact.tableIds };
    events.push({ kind: 'check', text: `Checked ${shortDate(newDate)} ${hm(at)} for ${party} — ${found.exact.label} free` });
    return say(call, [...pre, `I can do that — ${what}. Shall I move it?`].join(' '), 'confirm', events);
  }
  const offers = found.alternatives.length ? found.alternatives : found.otherNight ? [found.otherNight] : [];
  if (!offers.length) {
    resetKeepOutcome(call);
    return say(call, [...pre, `I'm sorry, I can't do that — we're full. Your booking's still there as it was.`, ASK['anything-else'][0]].join(' '), 'anything-else', events);
  }
  call.offers = offers;
  events.push({ kind: 'offer', text: `${hm(at)} is full — offered ${offers.map((o) => hm(o.at)).join(' or ')}` });
  return say(call, [...pre, `I'm afraid ${sayTime(at)} is full${party !== b.party ? ` for ${people(party)}` : ''}. ${offerSentence(call, offers)}`].join(' '), 'choice', events);
}

function commitChange(call, pre) {
  const diary = call.diary;
  const { date, b } = call.target;
  const p = call.proposal;
  const events = [];
  const ops = [];
  const was = `${b.party} at ${hm(b.at)}${p.date !== date ? ` on ${shortDate(date)}` : ''}`;

  if (p.date === date) {
    const changes = { at: p.at, party: p.party, tableIds: [...p.tableIds], note: `${b.note ? b.note + ' ' : ''}Changed by phone at ${hm(diary.now)} — was ${was}.`, edited: true };
    diary.update(date, b.id, changes);
    ops.push({ op: 'update', date, id: b.id, changes });
    events.push({ kind: 'move', text: `Changed ${b.name}: ${was} → ${p.party} at ${hm(p.at)}, table ${p.tableIds.join('+')}` });
  } else {
    const cancel = { status: 'cancelled', note: `${b.note ? b.note + ' ' : ''}Moved to ${shortDate(p.date)} by phone.`, edited: true };
    diary.update(date, b.id, cancel);
    ops.push({ op: 'update', date, id: b.id, changes: cancel });
    const moved = { ...b, id: `fd${Date.now().toString(36).slice(-4)}${++call.seq}`, at: p.at, party: p.party, tableIds: [...p.tableIds], status: 'confirmed', note: `Moved from ${shortDate(date)} by phone.`, edited: true };
    diary.add(p.date, moved);
    ops.push({ op: 'add', date: p.date, booking: moved });
    events.push({ kind: 'move', text: `Moved ${b.name} from ${shortDate(date)} to ${shortDate(p.date)} ${hm(p.at)}` });
  }
  call.proposal = null;
  resetKeepOutcome(call);
  call.outcome = { kind: 'changed', date: p.date, booking: b };
  return say(call, [...pre, `Done — that's changed. You're now booked for ${people(p.party)} ${when(call, p.date, p.at)}.`, ASK['anything-else'][0]].join(' '), 'anything-else', events, ops);
}

/* ── handing over to a person ────────────────────────────────────────────── */

function startCallback(call, u, reason, pre = []) {
  const keepName = call.slots.name, keepPhone = call.slots.phone;
  const party = call.slots.party;
  resetForNewTask(call);
  call.task = 'callback';
  call.callback = { reason, party };
  if (keepName) call.slots.name = keepName;
  if (keepPhone) call.slots.phone = keepPhone;
  if (u?.slots.name) call.slots.name = u.slots.name;
  if (u?.slots.phone) call.slots.phone = u.slots.phone;
  const lead = reason === 'complaint'
    ? ["I'm really sorry to hear that. I'd like the manager to speak to you personally."]
    : reason === 'asked for the manager' ? ["Of course. The manager's on the floor right now, so let me take your details and they'll call you straight back."] : [];
  return advanceCallback(call, { slots: {}, flags: {} }, [...pre, ...lead], true);
}

function advanceCallback(call, u, pre = [], fresh = false) {
  const s = call.slots;
  if (!fresh) {
    if (u.slots.name) s.name = u.slots.name;
    if (u.slots.phone) s.phone = u.slots.phone;
  }
  if (!s.name) return say(call, [...pre, s.phone ? 'And your name?' : ASK.callback[0]].join(' '), 'name');
  if (!s.phone) return say(call, [...pre, pre.length ? "What's the best number to reach you on?" : `Thanks${s.name.includes(' ') ? `, ${s.name.split(' ')[0]}` : ''}. And the best number to reach you on?`].join(' '), 'phone');
  const cb = call.callback;
  const events = [{ kind: 'handoff', text: `Callback for the manager: ${s.name}, ${s.phone} — ${cb.reason}` }];
  call.outcome = { kind: 'callback', name: s.name, phone: s.phone, reason: cb.reason };
  const out = call.outcome;
  resetForNewTask(call);
  call.outcome = out;
  return say(call, [...pre, `Thank you. I've passed that to the manager and they'll ring you on ${out.phone} within the hour.`, ASK['anything-else'][1]].join(' '), 'anything-else', events);
}

export { hhmm, roundUp, latestStart, nextAvailable };

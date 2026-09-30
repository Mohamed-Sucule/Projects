/* ───────────────────────────────────────────────────────────────────────────
   frontdesk/calls.js — people ringing up.

   Only the caller's side is written down here. Every word the receptionist
   says back is worked out live, against the book as it stands at that moment
   — so if somebody at the Covers host stand sits a walk-in on table 11 before
   the call is played, the same caller gets a different answer. A caller line
   can be a function of what was just said to them, the way a real caller
   answers the question they were actually asked.

   `expect` is what the call has to achieve, and the tests hold every call to
   it: a call that is supposed to end in a booking has to end in a booking
   the floor can actually seat.
   ─────────────────────────────────────────────────────────────────────────── */

const pickLater = (reply) => (/ or /.test(reply) ? 'The later one, please.' : 'Yes, that works.');

export const CALLS = [
  {
    id: 'anniversary',
    title: 'A table for tonight',
    blurb: 'Saturday is packed. Watch it find the nearest times that are free.',
    caller: { name: 'Priya', pitch: 1.15, rate: 1.02 },
    lines: [
      "Hi! Have you got a table for two tonight, around half eight? It's our anniversary.",
      (r) => (/ or /.test(r) ? "Oh, that's a shame. Nine would be fine." : 'Lovely.'),
      "It's Priya Shah.",
      'Oh seven seven double oh, nine double oh, one two three.',
      "No, just the anniversary. Thank you!",
      'Yes please.',
      "No, that's everything. Thanks, bye!",
    ],
    expect: { outcome: 'booked', party: 2, date: 'today' },
  },
  {
    id: 'late',
    title: 'Running late',
    blurb: "A regular stuck in traffic. It moves their booking so they don't lose the table.",
    caller: { name: 'Mateo', pitch: 0.85, rate: 1.08 },
    lines: [
      "Hi, it's Castellanos — we've a table at quarter to eight but we're stuck in traffic, about twenty minutes late.",
      'Brilliant, thanks so much. Bye!',
    ],
    expect: { outcome: 'late', name: 'Castellanos' },
  },
  {
    id: 'cancel',
    title: 'A cancellation',
    blurb: 'It finds the booking by name, frees the table and tells the floor.',
    caller: { name: 'Ada', pitch: 1.05, rate: 0.98 },
    lines: [
      "Hello, I'm afraid we can't make it tonight. The booking's under Bello.",
      'Yes please, sorry about that.',
      "No, that's all. Bye.",
    ],
    expect: { outcome: 'cancelled', name: 'Bello' },
  },
  {
    id: 'questions',
    title: 'Questions first',
    blurb: 'Parking, dogs and a coeliac son — then a booking for Sunday.',
    caller: { name: 'Helen', pitch: 1.0, rate: 0.95 },
    lines: [
      'Hello, is there anywhere to park near you?',
      'And can I bring my dog?',
      "Great. Could I book a table for three tomorrow at seven, then?",
      "It's Mrs Whitfield.",
      '07700 900101.',
      'My son is coeliac, so it needs to be gluten free.',
      "That's all correct, thank you.",
      "No, that's everything. Bye!",
    ],
    expect: { outcome: 'booked', party: 3, date: 'tomorrow', notes: ['gluten-free (coeliac)'] },
  },
  {
    id: 'mind',
    title: 'Changing their mind',
    blurb: 'Four becomes five and seven becomes half past, mid-call. Nothing gets lost.',
    caller: { name: 'Sam', pitch: 0.95, rate: 1.1 },
    lines: [
      "Hiya, table for four on Thursday at seven please.",
      'Actually, can you make it five of us? And half seven instead of seven.',
      (r) => (/ or /.test(r) ? pickLater(r) : "It's Sam Okafor."),
      (r) => (/name/.test(r) ? "It's Sam Okafor." : 'oh seven seven double oh nine double oh four five six'),
      (r) => (/number/.test(r) ? 'oh seven seven double oh nine double oh four five six' : "We'll need a highchair for the little one."),
      (r) => (/allerg|anything we should know/.test(r) ? "We'll need a highchair for the little one." : 'Yes, perfect.'),
      (r) => (/Shall I book/.test(r) ? 'Yes, perfect.' : "That's it, thanks. Bye!"),
      "That's it, thanks. Bye!",
    ],
    expect: { outcome: 'booked', party: 5, notes: ['highchair'] },
  },
  {
    id: 'party',
    title: 'Fourteen for a birthday',
    blurb: "Too big for the phone. It knows when to hand over to a person.",
    caller: { name: 'Tom', pitch: 0.8, rate: 1.0 },
    lines: [
      "Hello, I'd like to book for fourteen people next Saturday — it's my dad's sixtieth.",
      "Tom Reilly.",
      '07700 900777',
      "No, that's great. Thanks, bye.",
    ],
    expect: { outcome: 'callback' },
  },
  {
    id: 'change',
    title: 'Moving a booking',
    blurb: 'An hour later on the same table — it checks the table is free for the new time first.',
    caller: { name: 'Leah', pitch: 1.1, rate: 1.0 },
    lines: [
      "Hi, we've got a table at quarter past eight tonight under Whitcombe — could we push it back to nine?",
      'Yes please.',
      "That's all, thanks!",
    ],
    expect: { outcome: 'changed', name: 'Whitcombe' },
  },
];

/** How many random callers the tests put through before every release. */
export const RANDOM_CALLERS = 400;

/** Play a call against a desk to the end. Used by the tests and by the page's "skip to the end". */
export function playThrough(call, script, { hear, greet }) {
  const out = [{ who: 'desk', text: greet(call).say }];
  let last = out[0].text;
  for (const line of script.lines) {
    if (call.done) break;
    const text = typeof line === 'function' ? line(last) : line;
    out.push({ who: 'caller', text });
    const r = hear(call, text);
    out.push({ who: 'desk', text: r.say, r });
    last = r.say;
  }
  return out;
}

/* ───────────────────────────────────────────────────────────────────────────
   callcoach/labels.js — things prospects say, and what a good rep hears.

   Each line is labelled with every moment in it: an objection, a buying
   signal, a pain. Most lines have none — the tagger's other job is to stay
   quiet — and some have two, because people say "it's more than we pay now
   and I'd need to ask Priya" in one breath.

   Scored per label as precision (of the cards it raised, how many were right)
   and recall (of the moments that were there, how many it caught), which is
   the pair a sales team actually feels: low precision is a coach that cries
   wolf and gets ignored; low recall is a coach that misses the objection
   that lost the deal.

   Tuning first, then a held-out set written afterwards and run once, as with
   the other assistants on this site.
   ─────────────────────────────────────────────────────────────────────────── */

export const TAGS = {
  'objection:price': 'Price objection',
  'objection:competitor': 'Already using a competitor',
  'objection:timing': 'Not the right time',
  'objection:authority': 'Someone else decides',
  'objection:contract': 'Locked into a contract',
  'objection:integration': 'Needs to work with other systems',
  'objection:change': 'Worried about the change',
  'objection:trust': 'Reliability or data worries',
  'signal:timeline': 'Has a deadline',
  'signal:implementation': 'Asking how setup works',
  'signal:pricing': 'Asking about price',
  'signal:positive': 'Positive reaction',
  'signal:next-step': 'Asking for a next step',
  'pain:no-shows': 'No-shows',
  'pain:double-booking': 'Double bookings',
  'pain:phones': 'Phones during service',
  'pain:admin': 'Time lost to admin',
};

export const TUNING = [
  ["Yes, go for it. I've got about twenty minutes before lunch service.", []],
  ['Six, yes. Honestly, Saturdays. We had two double bookings at the Harbourside site last weekend and a table of eight stood at the bar for forty minutes.', ['pain:double-booking']],
  ["We use Seatwise for online bookings, then the phone, and then a paper diary at two of the sites because the managers don't trust the tablet.", ['objection:competitor']],
  ["Someone spends the first hour of every shift reconciling them. It's probably five hours a week per site of admin, just on the book.", ['pain:admin']],
  ["No-shows are the other killer. On a Friday or Saturday we'll get twelve, fifteen no-shows across the group, and at about forty pounds a head that adds up.", ['pain:no-shows']],
  ['Seatwise sends an email, but nobody reads emails.', ['objection:competitor']],
  ["I'd be the one running it day to day, but anything over a few thousand a year goes to Priya, our finance director. She signs off.", ['objection:authority']],
  ["Honestly, the numbers. She'll ask what it costs against what we pay Seatwise now.", ['objection:price', 'objection:competitor']],
  ["It's about ninety pounds a month per site, plus a fee per cover, which is where it gets expensive in December.", []],
  ["That's more than double what we pay now, though.", ['objection:price']],
  ['I would have to check, but it was a lot. Maybe four hundred pounds a site.', []],
  ["It has to work with our tills. We're on Tillpoint at every site, and I'm not having staff type things in twice.", ['objection:integration']],
  ['We want something in place before summer. The terraces open in May, and that is when it gets properly busy.', ['signal:timeline']],
  ['That sounds really useful, actually. How does the setup work — who trains the staff?', ['signal:positive', 'signal:implementation']],
  ['Okay. Can you send me something I can show Priya, with the numbers in it?', ['signal:next-step']],
  ["Let's do that. I'll check her diary and send you a couple of times.", ['signal:next-step']],
  ["I'll be honest, I'm not sure we need another system. We're locked into Seatwise until September anyway.", ['objection:contract', 'objection:competitor']],
  ['Three months, so we would have to tell them by June.', []],
  ['Just over two thousand four hundred pounds across the group, for December alone. That did get my attention.', []],
  ['Last year our old till system went down on a Saturday night and we lost the whole book. What happens if your system goes down?', ['objection:trust']],
  ['We ran the night off a printout someone made at six. It was chaos, and I am not going through that again.', []],
  ["That's my next question, actually. Is our data stored in the UK?", ['objection:trust']],
  ['Possibly. Our staff hate new systems, though. The last change took months to bed in.', ['objection:change']],
  ['The hosts and the managers. If the Harbourside team like it, the others will follow.', []],
  ["Send it over and I'll look. Wednesday at two works.", ['signal:next-step']],
  ["Two minutes, go on. We're in the middle of a refurbishment, so it's a bit mad here.", ['objection:timing']],
  ["We're pretty happy with TableTap, to be honest. It does the job.", ['objection:competitor']],
  ["Right. It's not really the right time for us, with the refurb and everything.", ['objection:timing']],
  ['End of April, all being well.', []],
  ["Maybe. Just send me an email and I'll have a look when things calm down.", ['objection:timing']],
  ['How much would it be for all six sites?', ['signal:pricing']],
  ["Is there a discount if we sign up for a year?", ['signal:pricing']],
  ['The phone rings non-stop during service and nobody can get to it.', ['pain:phones']],
  ["We lose so many calls on a Friday night, it's embarrassing.", ['pain:phones']],
  ['Honestly that is a lot more than we were expecting to spend.', ['objection:price']],
  ["We don't really have the budget for this right now.", ['objection:price']],
  ['I need to run it past my business partner first.', ['objection:authority']],
  ["It's not my decision, the owners decide on anything like this.", ['objection:authority']],
  ['Our contract with TableTap has another year to run.', ['objection:contract', 'objection:competitor']],
  ["There's a cancellation fee if we leave early.", ['objection:contract']],
  ['Does it integrate with our EPOS?', ['objection:integration']],
  ["Can it sync with the system we use for deposits?", ['objection:integration']],
  ["My team are not very techy, I'm worried they won't get on with it.", ['objection:change']],
  ['Moving all our bookings over sounds like a nightmare.', ['objection:change']],
  ['How secure is the guest data?', ['objection:trust']],
  ["What's your support like at eleven on a Saturday night?", ['objection:trust']],
  ['Can we revisit this after Christmas?', ['objection:timing']],
  ["We're flat out until the summer, maybe later in the year.", ['objection:timing']],
  ['We need it up and running before the new site opens in March.', ['signal:timeline']],
  ['How quickly could we get going?', ['signal:timeline']],
  ['What does onboarding look like?', ['signal:implementation']],
  ['Who would set it up for us?', ['signal:implementation']],
  ["Oh, that's clever. I love the floor plan.", ['signal:positive']],
  ['That would save us hours every week.', ['signal:positive']],
  ["Could you send over a proposal?", ['signal:next-step']],
  ["Can we do a trial at one site?", ['signal:next-step']],
  ['Empty tables on a Saturday because people just do not turn up.', ['pain:no-shows']],
  ["We keep overbooking the terrace when it rains.", ['pain:double-booking']],
  ['The managers spend ages on spreadsheets every morning.', ['pain:admin']],
  ['Sure, that makes sense.', []],
  ["We've got about forty tables across the two floors.", []],
  ['Our head chef is very particular about the pass.', []],
  ["It's mostly couples midweek and bigger groups at the weekend.", []],
];

/* Written after the tagger was finished, never used to change it. */
export const HELD_OUT = [
  ["We're already with Seatwise and it's fine for what we need.", ['objection:competitor']],
  ["To be honest the price is the sticking point for us.", ['objection:price']],
  ['That feels steep for a restaurant our size.', ['objection:price']],
  ["I'd need our operations director to see it before we commit.", ['objection:authority']],
  ['We signed a two-year deal last spring.', ['objection:contract']],
  ['Would it talk to our till?', ['objection:integration']],
  ['The staff are used to the paper diary and they like it.', ['objection:change']],
  ['What happens to our data if we leave?', ['objection:trust']],
  ["Now's not great, we're short-staffed until the students are back.", ['objection:timing']],
  ['We have to have something by the end of next month.', ['signal:timeline']],
  ['How long does it take to get set up?', ['signal:implementation', 'signal:timeline']],
  ["What's the monthly cost per restaurant?", ['signal:pricing']],
  ['That is exactly what we need, to be honest.', ['signal:positive']],
  ["Let's get a demo booked with the managers.", ['signal:next-step']],
  ['Could you put some prices in writing for me?', ['signal:next-step', 'signal:pricing']],
  ['We had eleven no-shows last Friday alone.', ['pain:no-shows']],
  ['Twice this month we have given the same table to two parties.', ['pain:double-booking']],
  ["Nobody picks up the phone once service starts, we just can't.", ['pain:phones']],
  ['I spend my Monday mornings copying bookings into a spreadsheet.', ['pain:admin']],
  ['We tried something like this before and it went badly.', ['objection:change']],
  ['Is there any lock-in with your contract?', ['objection:contract']],
  ["We're a family business, so my dad has the final say.", ['objection:authority']],
  ['Very interesting, I can see that working for us.', ['signal:positive']],
  ['Can you send me the case study you mentioned?', ['signal:next-step']],
  ['We are open six days a week, closed on Mondays.', []],
  ['The terrace seats about thirty in the summer.', []],
  ['Most of our bookings come in by phone, actually.', []],
  ["It's just me and one other manager on most nights.", []],
];

/* Its first run, before anything was changed: 27 of 28 lines exactly right,
   precision 96%, recall 100%. Better than the other two assistants on this
   site managed on their held-out sets, and it should be read with a pinch
   of salt: the same person wrote the rules and these lines, and people are
   bad at writing test cases that surprise their own rules. The honest test
   of a tagger like this is a week of real call transcripts, which a client
   has and a portfolio does not. */
export const HELD_OUT_FIRST_RUN = { exact: 27, lines: 28, precision: 0.96, recall: 1 };

/** Precision, recall and exact-match rate for a tagger over a set. */
export function score(tag, set = TUNING) {
  let tp = 0, fp = 0, fn = 0, exact = 0;
  const per = {};
  const rows = set.map(([text, want]) => {
    const got = tag(text);
    const w = new Set(want), g = new Set(got);
    for (const t of g) { const p = (per[t] ??= { tp: 0, fp: 0, fn: 0 }); if (w.has(t)) { tp++; p.tp++; } else { fp++; p.fp++; } }
    for (const t of w) if (!g.has(t)) { fn++; (per[t] ??= { tp: 0, fp: 0, fn: 0 }).fn++; }
    const ok = w.size === g.size && [...w].every((t) => g.has(t));
    if (ok) exact++;
    return { text, want, got: [...g], ok };
  });
  return {
    rows, lines: set.length, exact,
    precision: tp + fp ? tp / (tp + fp) : 1,
    recall: tp + fn ? tp / (tp + fn) : 1,
    tp, fp, fn, per,
  };
}

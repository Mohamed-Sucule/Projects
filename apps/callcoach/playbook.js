/* ───────────────────────────────────────────────────────────────────────────
   callcoach/playbook.js — what the sales team knows, written down.

   The product being sold is Covers, the table-management system elsewhere
   on this site, sold by an imagined company to restaurant groups. The
   competitors are invented too; any resemblance to a real booking platform
   is the resemblance every booking platform has to every other.

   A battlecard is the thing a rep wants on screen the moment a prospect
   says "it's more than we pay now": what the objection usually really
   means, the question to ask back, and one line of proof. Real ones are
   written by the best rep on the team after a hundred calls; these are
   written the same way, just shorter.
   ─────────────────────────────────────────────────────────────────────────── */

export const PRODUCT = {
  name: 'Covers',
  seller: 'Covers',
  pricePerSite: 189,         // £ a month, per restaurant
  setupFee: 0,
  pilotWeeks: 4,
  proof: {
    noShows: 'Every booking gets a reminder text the day before with one tap to cancel, so a table that would have sat empty goes back on sale.',
    doubleBooking: "Covers checks every table against turn times and the time it takes to re-lay, so a double-booking can't be saved.",
    phones: 'Front Desk, the AI receptionist, answers the phone during service and books straight into the table plan.',
  },
};

export const COMPETITORS = {
  Seatwise: {
    summary: 'The cheap one. A booking widget and a list, per-cover fees on top of the subscription.',
    vs: [
      'Seatwise charges 25p a cover on top of its monthly fee — at 1,800 covers a week that is £450 a week before anything else.',
      'No floor plan: it knows how many tables you have, not where they are or which can be pushed together.',
      "No turn times, so it will happily book a table that won't be free until half past eight.",
    ],
    ask: 'What do you pay Seatwise in cover fees in a busy month?',
  },
  TableTap: {
    summary: 'The big one. Strong marketplace, slow support, long contracts.',
    vs: [
      'TableTap contracts run 24 months with an early-termination fee; Covers is monthly after the pilot.',
      "Guests booked through TableTap's marketplace belong to TableTap's marketing list, not yours.",
      'Covers has a four-week pilot at one site with no commitment.',
    ],
    ask: 'When does your TableTap contract come up for renewal?',
  },
};

/* The objection types, and the card that goes with each. `means` is what it
   usually really means; `ask` is the question to ask back before answering;
   `say` is one way to answer. */
export const CARDS = {
  price: {
    title: 'Price',
    means: 'Usually "I cannot see the return yet", not "we cannot afford it".',
    ask: 'What does a no-show cost you on a Saturday — and how many do you get?',
    say: `Put the price next to the pain: at £${PRODUCT.pricePerSite} a site a month, it pays for itself if it saves five covers a week.`,
  },
  competitor: {
    title: 'Already using someone',
    means: 'Switching feels like risk. Find what they would keep and what they would change.',
    ask: "What's the one thing you'd change about how it works today?",
    say: 'Offer the pilot at one site, running alongside what they have, so nothing is switched off until they have seen it work.',
  },
  timing: {
    title: 'Not the right time',
    means: 'Often true in hospitality — but "after summer" can mean "never".',
    ask: 'What would have to be true for this to be worth doing before summer?',
    say: 'Tie it to their date: a pilot starting now is live across all sites before the busy season, not during it.',
  },
  authority: {
    title: 'Someone else decides',
    means: 'You are talking to a champion, not the buyer. Help them sell it internally.',
    ask: 'What will they want to see before saying yes — and can we get twenty minutes with them?',
    say: 'Offer a one-page business case with their own numbers in it, written for the person who signs.',
  },
  contract: {
    title: 'Locked into a contract',
    means: 'A date, not a no. Work back from it.',
    ask: 'When exactly does it end, and what notice do you have to give?',
    say: 'Pilot one site now, so the decision is made with evidence months before the notice date.',
  },
  integration: {
    title: 'Does it work with our systems?',
    means: 'A real requirement, and a buying signal: they are picturing using it.',
    ask: 'Which till system, and what do you need to flow between them — covers, spend, both?',
    say: 'Covers exports every booking and the table it sat on; the till integration is on the pilot plan, tested at one site first.',
  },
  change: {
    title: 'Staff will hate it',
    means: 'Fear of disrupting service. Show how little changes on the night.',
    ask: 'Who would use it most — the host, the managers, the floor staff?',
    say: 'The floor plan is the one they already know, drawn on a screen; training is one shift, and the pilot runs next to the paper book.',
  },
  trust: {
    title: 'What if it goes down?',
    means: 'They have been burned by an outage before, or expect to be.',
    ask: 'What happened last time a system let you down on a busy night?',
    say: 'The book works offline on the host stand and syncs when the connection is back; every night can be printed as a run sheet.',
  },
};

/* The qualification framework the summary fills in. Sales teams argue about
   which acronym; this is the common one. */
export const MEDDICC = [
  ['metrics', 'Metrics', 'The numbers the pain costs them'],
  ['buyer', 'Economic buyer', 'Who signs'],
  ['criteria', 'Decision criteria', 'What it has to do'],
  ['process', 'Decision process', 'How they will decide'],
  ['pain', 'Identified pain', 'What hurts'],
  ['champion', 'Champion', 'Who is selling it for you inside'],
  ['competition', 'Competition', 'Who else is in the picture'],
];

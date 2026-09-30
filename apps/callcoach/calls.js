/* ───────────────────────────────────────────────────────────────────────────
   callcoach/calls.js — three sales calls, written as they would be spoken.

   The people and companies are invented. What happens in them is not: the
   first is a good discovery call, the second is a finance director doing her
   job, and the third is the call every rep has once a week, where the
   prospect is polite and nothing is going to happen. The coach has to be
   useful on all three, and honest on the third.

   Only the words are written here. Every card, nudge, score and summary on
   the page is worked out from them as the call plays.
   ─────────────────────────────────────────────────────────────────────────── */

const R = (text) => ({ who: 'rep', text });
const P = (text) => ({ who: 'prospect', text });

export const CALLS = [
  {
    id: 'discovery',
    title: 'The discovery call',
    blurb: 'A group with six restaurants and a bad Saturday. Good call — watch what it picks up.',
    rep: { name: 'Alex', company: 'Covers' },
    prospect: { name: 'Jamie Okoro', role: 'Head of Operations', company: 'Marlow Hospitality' },
    lines: [
      R("Hi Jamie, it's Alex from Covers — thanks for making the time. Is now still good?"),
      P("Yes, go for it. I've got about twenty minutes before lunch service."),
      R("Perfect. I've read a bit about Marlow — six sites across Bristol and Bath? What made you take the call?"),
      P('Six, yes. Honestly, Saturdays. We had two double bookings at the Harbourside site last weekend and a table of eight stood at the bar for forty minutes.'),
      R('Ouch. How are bookings taken at the moment?'),
      P("We use Seatwise for online bookings, then the phone, and then a paper diary at two of the sites because the managers don't trust the tablet."),
      R('So there are three places a booking can live. What happens when they disagree?'),
      P("Someone spends the first hour of every shift reconciling them. It's probably five hours a week per site of admin, just on the book."),
      R("Five hours a site across six sites is thirty hours a week. What about no-shows?"),
      P("No-shows are the other killer. On a Friday or Saturday we'll get twelve, fifteen no-shows across the group, and at about forty pounds a head that adds up."),
      R('It does — fifteen covers at forty pounds is six hundred pounds a night. Do you send reminders?'),
      P('Seatwise sends an email, but nobody reads emails.'),
      R("Covers sends a text the day before with one tap to cancel, so the table goes back on sale. And it knows turn times, so it won't book a table that isn't free. Can I ask how you'd decide on something like this?"),
      P("I'd be the one running it day to day, but anything over a few thousand a year goes to Priya, our finance director. She signs off."),
      R('That helps. What would Priya want to see?'),
      P("Honestly, the numbers. She'll ask what it costs against what we pay Seatwise now."),
      R('Makes sense. What do you pay Seatwise at the moment, roughly?'),
      P("It's about ninety pounds a month per site, plus a fee per cover, which is where it gets expensive in December."),
      R("Covers is a hundred and eighty-nine pounds a site a month, with no per-cover fees and no setup fee."),
      P("That's more than double what we pay now, though."),
      R('On the subscription, yes. How much were the cover fees last December?'),
      P('I would have to check, but it was a lot. Maybe four hundred pounds a site.'),
      R("So in the months that matter it's already more than Covers. What else would it need to do?"),
      P("It has to work with our tills. We're on Tillpoint at every site, and I'm not having staff type things in twice."),
      R("Covers exports every booking with its table, and we'd test the Tillpoint link at one site first. What's your timeline?"),
      P('We want something in place before summer. The terraces open in May, and that is when it gets properly busy.'),
      R('Then a four-week pilot at Harbourside starting next month would be live across the group by May. Would that work?'),
      P('That sounds really useful, actually. How does the setup work — who trains the staff?'),
      R("We do. It's one shift of training, and the pilot runs next to your current book, so nothing gets switched off."),
      P('Okay. Can you send me something I can show Priya, with the numbers in it?'),
      R("Absolutely. I'll send a one-page business case with your figures by Thursday. Could we book twenty minutes with Priya next week?"),
      P("Let's do that. I'll check her diary and send you a couple of times."),
      R('Brilliant. Thanks, Jamie — speak soon.'),
    ],
  },
  {
    id: 'finance',
    title: 'The finance director',
    blurb: 'A sceptical buyer with a contract, a Saturday outage in her past and a hard question on price.',
    rep: { name: 'Alex', company: 'Covers' },
    prospect: { name: 'Priya Nair', role: 'Finance Director', company: 'Marlow Hospitality' },
    lines: [
      R("Hi Priya, thanks for joining. Jamie's filled me in — I'd love to hear what matters most to you."),
      P("I'll be honest, I'm not sure we need another system. We're locked into Seatwise until September anyway."),
      R('Understood. What notice do you have to give on that contract?'),
      P('Three months, so we would have to tell them by June.'),
      R("So a decision made in May, with a pilot behind it, is in time. Jamie mentioned the cover fees in December — do you know what they came to?"),
      P("Just over two thousand four hundred pounds across the group, for December alone. That did get my attention."),
      R("That's more than Covers would cost the whole group for two months. What else would you need to be comfortable?"),
      P("Last year our old till system went down on a Saturday night and we lost the whole book. What happens if your system goes down?"),
      R("The book works offline on the host stand and syncs when the connection comes back, and every night can be printed as a run sheet. What happened last time?"),
      P('We ran the night off a printout someone made at six. It was chaos, and I am not going through that again.'),
      R('That makes sense. Where does the guest data live, for GDPR?'),
      P("That's my next question, actually. Is our data stored in the UK?"),
      R("It is, and the guest list belongs to you, not to us — we don't market to your diners. Would a pilot at one site answer the rest?"),
      P("Possibly. Our staff hate new systems, though. The last change took months to bed in."),
      R("Training is one shift, and the pilot runs next to your current book. Who would use it most?"),
      P('The hosts and the managers. If the Harbourside team like it, the others will follow.'),
      R("Then let's start there. I'll send a pilot plan and the contract terms today — can we review it together next Wednesday?"),
      P("Send it over and I'll look. Wednesday at two works."),
    ],
  },
  {
    id: 'polite-no',
    title: 'The polite no',
    blurb: 'Friendly, busy, happy with what they have. The coach says so — and says what to do next.',
    rep: { name: 'Sam', company: 'Covers' },
    prospect: { name: 'Chris Doyle', role: 'Owner', company: 'The Anchor, Whitstable' },
    lines: [
      R("Hi Chris, it's Sam from Covers. We help restaurants cut no-shows and double bookings — have you got two minutes?"),
      P("Two minutes, go on. We're in the middle of a refurbishment, so it's a bit mad here."),
      R("Covers is a table-management system with a live floor plan, reminder texts, and an AI receptionist that answers the phone during service. It's a hundred and eighty-nine pounds a month, no setup fee, and we can have you live in a week."),
      P("We're pretty happy with TableTap, to be honest. It does the job."),
      R("Lots of our customers came from TableTap. The main difference is that Covers knows your actual floor plan and turn times, so it never double-books, and there's no long contract."),
      P("Right. It's not really the right time for us, with the refurb and everything."),
      R('When does the refurbishment finish?'),
      P('End of April, all being well.'),
      R('Would it be worth a quick demo before you reopen, so you start the new room with it?'),
      P("Maybe. Just send me an email and I'll have a look when things calm down."),
      R("Will do. Thanks, Chris."),
    ],
  },
];

/** Seconds into the call each line starts, from its length at speaking pace. */
export function timeline(lines, wpm = 165) {
  let t = 0;
  return lines.map((l) => {
    const at = t;
    const words = l.text.split(/\s+/).length;
    t += (words / wpm) * 60 + 0.9;
    return { ...l, at, dur: (words / wpm) * 60 };
  });
}

# Call Coach — a live assistant for sales calls

**[Open it](index.html)** · Listen in on three sales calls. As each line is said, the assistant:

- tags the moment (an objection, a buying signal, a pain);
- puts the right card on screen: what "it's more than we pay now" usually means, the question to
  ask back, and one way to answer it;
- brings up a competitor's weak spots when one is named;
- nudges the rep when they pitch before finding a problem or do most of the talking.

When the call ends, it writes the notes in the qualification fields sales teams use, fills in a
CRM record and drafts the follow-up email. You can also type both sides of a call yourself.

The product being sold is [Covers](../covers/), the restaurant system elsewhere on this site. The
people, companies and competitors are fictional.

## Three calls, chosen to be different

| Call | What should happen |
|---|---|
| **The discovery call** | A good call. Pains with numbers, a finance director who signs, a till integration requirement, a summer deadline and a dated next step. Should come out *Qualified*. |
| **The finance director** | The buyer herself, with a contract to run out, a past outage and a GDPR question. The coach should see she's the buyer, and say that no pain came up on this call. |
| **The polite no** | Busy, happy with a competitor, "just send me an email". The coach should call it what it is (*Nurture*), flag that the rep pitched before finding a problem, and draft a short email tied to the prospect's own reopening date. |

The words are scripted. Every tag, card, nudge and note is worked out from them as they play, by
the same code that handles a typed-in call.

## How it's built — [`analyse.js`](analyse.js)

- **Tagging.** 17 kinds of moment (8 objections, 5 buying signals, 4 pains), each a set of
  patterns a sales manager would recognise. Two judgement calls are built in. "Just send me an
  email" is a brush-off, not a next step. And a question about price ("how much for six sites?")
  is interest, not an objection.
- **Numbers as people say them.** "A hundred and eighty-nine pounds a site", "twelve, fifteen
  no-shows at about forty pounds a head", "two thousand four hundred". These are parsed into
  values with their units, so the deal size and the metrics come from what was said.
- **Coaching, once.** Each card appears the first time its moment comes up. Nudges watch talk
  share, pitching before a pain is found, pains without a number, and buying signals that
  weren't followed by a next step.
- **The notes** use MEDDICC (metrics, economic buyer, decision criteria, decision process,
  identified pain, champion, competition). Each field is filled with quotes from the call, or
  marked *missing* and turned into the question to ask next time. The follow-up email quotes
  the prospect's own words. A test checks that every quoted line was actually said.
- **The playbook** ([`playbook.js`](playbook.js)) is the file a real team's best rep would own:
  battlecards, competitors, price.

## How well it hears — [`labels.js`](labels.js)

Prospect lines, each labelled with every moment in it. Most lines have none, because the other
half of the job is staying quiet. The tagger is scored on precision (was the card right?) and
recall (did it catch the moment?).

- Tuning set: 62 of 63 lines exactly right.
- Held-out set, written afterwards and run once: **27 of 28**, precision 96%, recall 100%.

That second number is recorded in the file, with the same caveat the page gives. The same person
wrote the rules and the test lines, so it's optimistic. The real test is a week of a client's own
call transcripts, which is the first thing to ask for on a real project.

## Checked

`tests/callcoach.test.mjs`:

- The tagger holds its scores, and every label and objection has a card.
- Spoken numbers, sums of money and people with roles are read correctly.
- The discovery call comes out *Qualified*, with Priya as the economic buyer, the no-show numbers
  in the metrics, a deal size of six sites, and Jamie as the champion.
- The finance call identifies the buyer on the call, leaves "pain" empty with a question to
  ask, and puts the notice date in the decision process.
- The polite no comes out *Nurture*, with no next step counted and the pitching nudge fired.
- **Every quote in the notes and the email was actually said on the call.**
- No card appears twice in one call, and a typed-in call is analysed the same way.

## Not built here

- **Call audio.** Zoom, Teams and dialler recordings through a speech-to-text service with
  speaker labels. Everything here already works one line at a time.
- **CRM write-back.** The record maps onto Salesforce or HubSpot fields, as a draft the rep
  approves.

# Front Desk — an AI receptionist for a restaurant

**[Open it](index.html)** · A phone receptionist for a busy restaurant. It works out what the
caller wants, checks the real table plan, offers the nearest free times when the one they asked
for has gone, takes allergies and occasions, reads everything back and books it in. It also knows
when to hand over to a person. Listen in on seven calls, or ring it yourself by typing or talking.

The restaurant is fictional. The booking engine, the floor plan and the Saturday night are the ones
in [Covers](../covers/), and a booking made here appears on the Covers floor plan if it's open in
another tab.

## The brief, as a restaurant owner might put it (an imagined one)

> We miss calls during service. When we do pick up, it's someone on the floor who should be
> serving. We want something that answers, books properly, never double-books, writes the
> allergies where the kitchen will see them, and puts anything awkward through to a manager.

Everything below comes from that paragraph.

## How it's built

| Part | File | What it does |
|---|---|---|
| Understanding | [`understand.js`](understand.js) | One sentence in, a structured reading out: intent, party, day, time, name, number, notes, and the exact words each came from. |
| The conversation | [`desk.js`](desk.js) | Keeps track of the job, one turn at a time: what's missing, which table is held, what's been said. Returns what to say and what changed in the book. |
| The book | [`diary.js`](diary.js) | Tonight is the Covers night; other nights are generated through the same engine, seeded by date. |
| The table engine | [`../covers/schedule.js`](../covers/schedule.js) | Unchanged. Turn times, turnaround, joined tables, closing time — the receptionist asks it, it never guesses. |
| Second opinion | [`meaning.js`](meaning.js) | A small on-device embedding model, asked only when the parser finds nothing at all. |
| The calls | [`calls.js`](calls.js) | Only the caller's side is written down. Every reply is worked out live. |
| The score | [`eval.js`](eval.js) | 261 labelled phrasings, in two sets. |

### Why a purpose-built parser and not a large language model

For one narrow job, a parser has four advantages that matter to the client. It's fast, it costs
nothing to run, it can't make up a booking, and every phrasing can be tested before anything
ships. The model is kept for the part a parser is bad at: noticing that "fancy grabbing some food
at yours on Friday?" is a booking request at all. Even then it only ever suggests the *intent*.
The party size, time and name that go into the book always come from code that is tested line by
line.

### The rules it works to

- Ask for one thing at a time, and never for something already given.
- Check the floor before promising anything, and **check it again at the moment of writing**. The
  host may have sat a walk-in on that table between "I can do eight" and "yes please". There's a
  test for exactly that.
- When the answer is no, offer the nearest times either side. If the whole evening is full, offer
  the same time on the nearest night that has it.
- Say no to impossible requests with the reason: a time that has already passed tonight, a
  sitting that would run past closing, lunch (dinner only), Mondays (closed).
- Read everything back before booking.
- Tell the kitchen about allergies and the floor about wheelchairs, and draft the confirmation
  text.
- Hand over to a person for more than ten guests, a complaint, a name it can't find twice, or
  three misunderstandings in a row.

## How well it understands

Two sets of phrasings, lower-case and unpunctuated the way speech recognition writes them out:

- **The tuning set** (179): written first, and used to build the parser.
- **The held-out set** (82): written after the parser was finished. It scored **75 of 82** the
  first time it was run. That number is recorded in `eval.js` and shown on the page, because
  a held-out score is only honest as it stood on the day. The seven misses were real bugs ("8
  tonight" was losing the "tonight"; "we're about ten minutes behind" wasn't read as lateness).
  They have since been fixed, and the tests now fail if the score ever drops below 75.

The page recomputes both scores every time it loads and lists every phrasing with its result.

## Checked

`tests/frontdesk.test.mjs`, run before every deploy:

- Every case in the tuning set is read correctly, and the held-out set never scores below its
  first run. No phrasing is allowed in both sets.
- Every sample call ends the way it should, without double-booking a table.
- **400 random callers.** Random party sizes, nights and times, asked in several different ways,
  each accepting whatever they're offered. Afterwards every night's book is checked: no
  double-bookings, nothing after closing, nothing in the past, and every booking one the floor
  can actually seat.
- Generated nights are identical on every run and servable by the room. Weekends are busier than
  weekdays, and Mondays are closed.
- Names match the way they sound: Zielinski finds Zieliński, Sorensen finds Sørensen, and Bell
  doesn't find Bello.

## Not built here

- **A phone line.** A telephony provider would stream call audio into the same pipeline. The
  conversation logic already takes text in and gives text out, so it wouldn't change.
- **Texts.** The confirmation text is drafted, not sent.
- **Another booking system.** The receptionist asks the book one question — is there a table? —
  so connecting a different booking system would be one adapter, not a rewrite.

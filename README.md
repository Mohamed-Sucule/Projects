# Playground

Four AI products a business could ask me to build, and thirty more things I built
for fun and to learn. All of them run in a browser — no install, no signup, no
API key, no video of someone else using it.

**→ [Open the playground](https://mohamed-sucule.github.io/Projects/)**

| | | |
|---|---|---:|
| **★** | [**Four AI products**](#-four-ai-products) — a receptionist, a knowledge assistant, a sales coach, a claims desk | 4 |
| **0** | [**Inside the models**](#0--inside-the-models) — how language models actually work | 4 |
| **I** | [Fiction](#i--fiction) — things to read, and the two the site opens on | 3 |
| **II** | [Physics you can touch](#ii--physics-you-can-touch) | 2 |
| **III** | [Games](#iii--games) — including a Minesweeper that never makes you guess | 8 |
| **IV** | [Things you would actually use](#iv--things-you-would-actually-use) — QR codes, splitting a bill, a tuner | 6 |
| **V** | [The serious ones](#v--the-serious-ones) — Covers, and six tools for engineers | 7 |

Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies.
Over 850 tests run in CI before anything here is published — including twenty
gradient checks against finite differences, a check that a 95% confidence
interval really does contain the truth about 95% of the time, and one that no
tool result ever answers a call that was not made.

---

## ★ Four AI products

I'm a forward deployed engineer: I sit with a client, find the work that is costing
them, and ship the software that does it. These four start from a sentence a client
might say and end as working software. Each one is measured, with the results (the
bad ones included) on its page. Each runs entirely in the browser, and nothing
typed into it is sent anywhere. The businesses are invented; the software is not.

| | The brief | What it is | Measured |
|---|---|---|---|
| **[Front Desk](apps/frontdesk/)** | "We miss calls during service." | An AI phone receptionist that books straight into the [Covers](apps/covers/) table plan, offers the nearest free times, tells the kitchen about allergies, and hands over to a person when it should. | 75 of 82 new phrasings understood first time; 400 random callers, no double-bookings |
| **[Ask the Handbook](apps/handbook/)** | "Staff ask HR the same questions all day." | Answers from the company's own documents, quoting the sentence and its source, and says "the handbook doesn't say" instead of guessing. Paste in your own documents. | 4 answers made up in 164 test questions, 31 of them unanswerable on purpose |
| **[Call Coach](apps/callcoach/)** | "Our reps lose deals on the same objections." | A live assistant for sales calls: the battlecard on screen the moment a prospect objects, then MEDDICC notes, a CRM record and the follow-up email, all from what was said. | 27 of 28 new lines tagged exactly right, first time; every quote in its notes checked against the call |
| **[Claims Desk](apps/claims/)** | "Our handlers spend their day retyping claims." | Reads an insurance claim (email, scanned form, invoice) with OCR in the browser, checks it against the policy and itself, and recommends approve, decline or refer, with evidence for every line. | 11 of 11 fields read from each scan; on 180 smudged scans a misread only ever sends a claim to a person |

How they're built, and what each one gets wrong, is in its own README. Across all
four, the same few rules apply:

- **The right tool for the job, not the biggest model.** Where a purpose-built parser,
  a search index or a rule is faster, cheaper, testable and can't make things up, it
  does the work. The on-device models (speech recognition, sentence embeddings, OCR)
  handle what those can't: listening, understanding meaning, reading a scan.
- **Measured on questions it never saw.** Each has a held-out test set, written
  after it was built and run once. The first-run score is recorded in the code and
  never edited, even when it's bad. Ask the Handbook's two rounds scored 25/41 and
  21/43, and its README explains what that taught me.
- **Safe when unsure.** The receptionist hands over to a person, the handbook says it
  doesn't know, and the claims desk refers anything it can't read.

The small models load from jsDelivr and the Hugging Face hub the first time a page
asks for them. The OCR engine is served from this repository.

---

## 0 · Inside the models

Four pieces on how language models work, built from the algorithm up rather
than from an API call. Everything runs in the browser: no key, no server,
nothing sent anywhere.

> **If you only read one thing**, read the two bugs in
> [the Attention write-up](apps/attention/README.md). The first made a positional
> copy head look exactly like an induction head; the second made one induction
> head look like eight different ones. Both produced a plausible picture and a
> beautiful number, and neither would ever have thrown. Finding them took longer
> than the build, and it is the only reason the claim is worth anything.

### [Attention](apps/attention/) — a transformer, and the step it learned to copy

**[Open it](apps/attention/)** · 45,440 parameters, trained with an automatic
differentiation engine written from nothing — no PyTorch, no JAX, no library at
all. Drag through thirteen checkpoints and watch eight attention heads go from
an even smear to bright stripes at the exact step the loss falls off a cliff.

The gradient checks came first, because a wrong *forward* pass throws and a
wrong *backward* pass does not — it trains slightly worse and gives you nothing
to chase. Every backward pass in
[`autograd.js`](apps/attention/autograd.js) is verified against central finite
differences before anything was built on it.

The circuit that appears is the **induction head**, and it lands where the
theory says it must: a previous-token head in layer 0 marking each position with
its predecessor, and a head in layer 1 matching on that mark and copying. Loss
4.71 → 2.17 against a floor of 1.72; 98% of the repeated tokens copied
correctly.

**The mistake that mattered.** The first version of the task repeated at a fixed
point, and what appeared scored 0.92 and was not an induction head at all — it
was a *positional* copy head that had memorised "attend to i − 31" and never
read a token. On screen the two are identical. The period is now drawn fresh per
sequence, and the packer scores the model across every period and prints the
spread, so the claim cannot quietly stop being true. There was then a second bug
in the *measurement* of the fix. Both are written up in full, because catching
them is the part of the work worth reading.

### [Tokens](apps/tokens/) — what a model actually reads

**[Open it](apps/tokens/)** · A byte-level byte-pair encoder, trained in the
page on 64,000 characters in about 380ms. Watch the vocabulary build itself one
merge at a time — pairs of letters, then endings, then whole common words with
their leading space.

Then three consequences: `strawberry` is ten characters and six tokens, so the
count of r's is not present in anything the model holds; GPT-2's pre-tokeniser
lets BPE learn `2024` as one token and splits `1999` into `1·99·9`, where the
middle token means nothing arithmetically; and the same sentence costs three
times as much in Japanese. `decode(encode(x)) === x` is asserted for every byte
value, for emoji and for Arabic.

### [Agents](apps/agents/) — the loop is easy, the failure modes are not

**[Open it](apps/agents/)** · Step through a real tool-use loop turn by turn
over a real ledger, then break it on purpose: a tool that throws, a result too
big to send, a model that calls the same thing four times. **Switch the guards
off one at a time and watch what each one was holding back.**

The loop is ten lines and everybody writes it correctly. Everything hard is
elsewhere, so [`harness.js`](apps/agents/harness.js) is mostly guards —
argument validation against each tool's schema, tool errors handed back as
results rather than thrown, loop detection, result truncation from the *middle*
so both ends survive, and a turn limit that cannot be switched off.

Real: the loop, the guards, the tools, the data, the message shapes, and the
token accounting — which runs an actual byte-pair tokeniser over the actual
conversation rather than dividing a length by four. Not real: **the model**,
which is a scripted policy, because there is no API key on that page and it is
not going to ask you for one. The interface between the two is a single
function with the shape of one completion, so a real model drops in behind it
without the harness knowing. That boundary is the thing worth designing.

Same task, same answer, same number of turns: pulling every row back instead of
asking the tool for a total costs **3,554 prompt tokens against 673 — 5.3×**,
because the conversation is stateless on the wire and every turn resends all of
it.

### [Evals](apps/evals/) — 92% versus 89% is not a result

**[Open it](apps/evals/)** · Two real parsers, eight hundred real inputs, graded
live. Drag the sample size and watch the confidence interval on the difference
cross zero. **At a hundred items the better parser scores worse.**

Percentile bootstrap, paired and unpaired; Wilson intervals rather than the
textbook one that returns [1, 1] from twenty observations; McNemar's exact test,
which shows that at 100 items the comparison rests on five disagreements and
p = 1.0; and the power calculation that says detecting three points from a 90%
baseline needs about 1,400 items per side.

Nothing is simulated. Both systems are real programs and the second ships a real
regression, because improvements arrive with breakage attached and an eval that
cannot see the breakage is not doing its job.

---

## I · Fiction

Three things to **read** rather than play. Five minutes each, and each one is doing
something with the browser that a book or a film cannot.

### [The Room](apps/room/) — a murder you solve by looking

Edmund Harkness is dead at his desk, the door was locked from the inside, and
the key was in his pocket. Nineteen things to examine, four people to question,
and five contradictions hidden among them.

**Almost every whodunnit on the web is paragraphs followed by a guess.** You
read the clues, pick a name, and the page tells you whether the author agrees.
There is no reasoning in it — the puzzle is remembering which paragraph
mentioned a train ticket.

Here a **claim** is one plain proposition about the night, and every piece of
evidence assigns it a value. The boot print, the burnt letter, the coat on the
stand and every word anybody says are all the same shape. The whole deduction
is:

```js
const values = new Set(facts.map((f) => f.value));
if (values.size < 2) continue;     // everything agrees
```

Group what you know by claim; any claim holding two different values is a
contradiction. **Nothing in the case file marks which fact is the lie** — there
is a test that greps for it — so the notebook is not a list of things I decided
were interesting. Statements are evidence like anything else, which is why *"Mrs
Pike heard one chair, one man, and no voices"* meets *"Two glasses stood on the
side table; one has left the house"* by the same three lines, printed facing
each other with **BUT** in between.

**Being right is not the same as being right.** Naming the murderer having
looked at four things is a guess, so the verdict has three outcomes: correct and
provable, correct but guessing (and then it lists by name every piece of proof
you never looked at), or wrong — and then it explains why not, specifically for
that person. Daniel Ashe is the one I am happiest with: he lies, the evidence
proves he lies, and he did not do it.

The plate is a pen-and-ink drawing of the study rendered at runtime, in
one-point perspective. Three bugs in it, each of which looked like a slightly
odd drawing rather than a bug: everything was positioned by eye until a desk
hovered in mid-air, every fill was translucent so you could see the chair
through the desk, and the figure was drawn in one pass when a man slumped over
a desk is shoulders behind it and head on top of it.

[Full write-up](apps/room/README.md).

### [The Lamplighter](apps/lamplighter/) — five minutes, one night

A lighthouse keeper's last winter, told while the sun goes down, the gale gets
up, the rain comes sideways and the light keeps turning. There is not an image
file in the directory: the sky, the sea, the rock, the tower, the rain and the
beam are all arithmetic.

**Scrolling is time, not travel.** Almost every scroll-driven page moves a
camera — you scroll, something slides past. Here the scroll position *is the
hour of the night*, and the sun's height, the sky's colour, the wind, the rain
and the state of the sea are all functions of that one number. The words are
pinned to the middle of the frame and cross-fade, because the view should stay
where it is while the night changes around it. You are not walking along a
coast; you are standing still for nine hours.

Which means it all lives in a DOM-free module and every claim the picture makes
is one a test can hold it to — including `the sun is up at both ends of the
night and down in the middle`, which failed: the first version peaked at
midnight, so the story opened at dusk, *brightened* until two, and ended in the
dark. Perfectly fine in a screenshot, nonsense the moment anybody scrolled.

**Two clocks, and keeping them apart is the whole feel.** The reader's clock is
the scroll bar. The lighthouse's is wall time: the beam turns once every 11.2
seconds whether or not anybody is reading. A beam wired to scroll position is a
beam attached to the reader — it stops when you stop, and the place becomes a
diorama that only exists while it is being looked at. The test pins it by the
shape of the function: `assert.equal(beam.length, 1)` — it takes seconds, and
there is nowhere to pass a scroll value.

The bug I liked most: sizing the tower's width from the viewport width and its
height from the viewport height drew a lighthouse on a laptop and a **chimney**
on a phone — nineteen times as tall as it was wide.

[Full write-up](apps/lamplighter/README.md), including why the horizon needed a
sheen and why one triangle never reads as a beam.

### [Nightshift](apps/nightshift/) — a horror story that reads you back

A coastal watch log from one night in 1987. Wind speed, visibility, one ship
passing on schedule, and six entries that say *Nothing to report.* It does not
stay there.

**The page is deliberately boring, and that is most of the work.** The reflex
with a horror piece is to announce it — dark page, flickering serif, a heartbeat
under the text — which tells the reader what they are looking at in the first
half second. This one is a photocopy of a government document about the weather.
There is a test whose only job is to keep it that way: it finds the first entry
that is not weather and fails if anything before it is interesting.

The haunting is **twelve beats in a list**, each a trigger and the name of an
effect. Triggers are how far you have read, how long you have been here, and how
many times you have switched tabs and come back. So the order of a haunting is
a pure function, and it is tested: nothing fires twice, nothing fires early, and
somebody who flings the scrollbar to the bottom still gets the build.

None of it is a canvas. **The tab title changes, but only while you are looking
somewhere else** — and it is back to normal before you can turn round. The
favicon becomes an eye, drawn at runtime. An entry you read ten minutes ago has
changed behind you. The scrollbar grows. The page tells you the time in the room
you are sitting in.

Then it puts everything back exactly as you found it, except for one line.

The bug worth reading about: the ending used to be a beat at 98% scrolled, so
anybody who threw the scrollbar to the bottom got the closing address and the
fade to black in the same frame — the payload of the whole piece managed one
character before the veil covered it. Driving it headlessly and printing the
text is what caught it. The ending has no trigger at all now.

[Full write-up](apps/nightshift/README.md) — after you have read it.

## II · Physics you can touch

Nothing here is a recording. Every pixel is worked out from scratch while you watch,
which is why you can put your finger in it and it responds properly instead of playing
you a canned animation.

### [Mercury](apps/mercury/) — liquid metal you can put your finger in

A sheet of liquid metal under a sunset sky. Drag it and it ripples; drag the sky
and you walk around it.

**There is no 3D model in that page.** No mesh, no vertex data, no texture of
anything, no library, no asset of any kind. The floating shape is four moving
spheres blended by a formula, the metal is a flat plane whose height comes out
of a physics simulation, and the sky is a gradient and a bright dot. Everything
is worked out from those descriptions per pixel, sixty times a second.

Nothing draws the distortion in the reflections. One pass solves a wave equation
across a texture; the other fires a ray per pixel, and where it lands on metal it
bounces off whatever tilt the waves left there and goes to see what is in the new
direction. The ripples move the tilts, the tilts move the rays, and the
reflection bends — the same way it does in the real world.

The wave speed is 0.42 because the discrete wave equation is stable only while c²
stays under a half, and past it the surface reaches infinity inside a second.
There is a test that runs it at 0.69 and asserts it holds, then at 0.75 and
asserts it comes apart — a test that only checked the working value would pass
just as well if the number were meaningless.

[Full write-up](apps/mercury/README.md), including the five things that looked
wrong and why.

### The rest of this chapter

| | |
|---|---|
| **[Sandbox](play/sandbox/)** | Pour sand. Add water. Set it on fire and watch the smoke rise. Ten materials that all behave the way you'd expect — water puts out fire, oil floats, lava turns water to steam, acid eats through stone. |

## III · Games

One long one, then the short ones. The short ones have no instructions, no tutorial and
no menu: the first ten seconds teach you the rest.

### [Ember](play/ember/) — an action game in the dark, three acts long

Your flame is your life and your light. Take a hit and it burns lower, and the dark comes
closer. Three acts, each generated from a seed. A gaoler, a choir of three masks and a king
to beat. Five boons to choose between. Nine ash-stones that, between them, answer the
question on the title screen: who put out the Beacon?

Everything in it is made in the browser. The rooms come from the seed. The light is
recomputed every frame: every wall and pillar casts a real shadow. The score is drums,
bass, choir and bells, synthesised live with Web Audio. There are no image or sound files.

The tests hold it to four things:

- **Nothing hurts you without warning.** Every blow that can land is drawn on the floor
  at least 0.3s before it lands. The tests play the whole game three times and check every
  attack, every shot and every hit against that.
- **It can be finished.** An autopilot plays from the first room to the ending, beating
  each boss through each of its phases in order and finding all nine ash-stones.
- **Nobody walks through walls.** Throughout those runs, nobody (you or an enemy) ends
  up inside a wall or a pillar.
- **Every boon does what its card says.**

A 40-seed sweep caught 4 runs that never finished. In each, the last mite and the player
were pinned against pillars on opposite sides, each walking straight at the other,
forever. Now enemies walk a shortest-path map of the room whenever there is no clear line.

[Full write-up](play/ember/README.md).

### [Ace](play/ace/) — tap to fly a paper plane through a canyon

Don't hit the rocks. That's the whole game, and there is no menu, no difficulty
select, no settings panel and no tutorial, because a game that has to be
explained has already failed.

The rules live in a DOM-free engine, which is what makes a game testable: a
script can play a whole run and assert on the score. The world advances in
fixed 1/120s slices however long the frame took — advancing by whatever `dt`
arrived makes the game measurably easier on a 144Hz monitor, and a test plays an
identical scripted run at 30, 60 and 144fps and asserts they match to six
decimal places.

That test failed twice before it passed, and **both times the test was wrong,
not the engine** — once because the taps didn't land on a whole frame at all
three rates, once because it checked the plane had fallen 0.5s after a flap when
the arc doesn't come back down until 0.537s.

The difficulty curve is tested by playing it: a bot that aims for the next
opening scores 22–25 before dying at ~27 seconds, right about where the openings
stop narrowing.

[Full write-up](play/ace/README.md).

### [Minesweeper](play/sweeper/) — without the guessing

**[Play it](play/sweeper/)** · Classic Minesweeper with the one flaw every version ships taken
out: the moment, twenty minutes in, where two squares cannot be told apart and a coin decides
the game. Every board is played by a solver from your first click, using only what a player can
see — a number that already has its mines, two numbers that share squares, the count at the
end — and thrown away unless it can be finished without a guess. Hard takes about nine attempts
and fourteen milliseconds.

Because every board is solvable, a loss can be explained: open a mine and the page rings the
square you could have proved safe instead, and says why. The solver's reasoning is checked
against brute force — every arrangement of mines consistent with what a player can see is
enumerated, and anything it calls safe has to be safe in all of them.

[Full write-up](play/sweeper/README.md).

### [Sudoku](play/sudoku/) — with reasons

**[Play it](play/sudoku/)** · A daily puzzle at three levels. Every one has exactly one answer
(a fast bitmask solver counts, after every clue removed) and can be finished by reasoning without
trial and error (a second solver, which only uses named human techniques — singles, pointing
pairs, naked and hidden pairs, the X-Wing — grades it). The hint does not fill a square in; it
names the technique and shades where it applies. Every step that second solver takes is checked
against the known answer, so no technique can be quietly unsound.

[Full write-up](play/sudoku/README.md).

### The rest of this chapter

| | |
|---|---|
| **[Stack](play/stack/)** | A block slides past. Tap. Whatever hangs over the edge of the block below is sliced off and falls away, so every sloppy drop makes the next one harder — the width of the top block *is* your remaining margin for error, drawn in the middle of the screen at all times. Land one dead centre and you lose nothing. |
| **[Tether](play/tether/)** | You swing round a planet on a tether. Tap and you let go, flying off in a straight line — exactly the way you were already pointing, which is drawn on screen the whole time. If that line passes close enough to another planet it catches you; if it doesn't, you are in deep space. One button, one decision: when. |
| **[Sumo](play/sumo/)** | Two players, one keyboard, one key each — or two thumbs on one phone. Hold your key and your arrow stops turning and you charge that way, so you are choosing a moment rather than steering. Knock the other one out of the ring before it closes under you. The physics was tuned by having two bots play a few thousand rounds and measuring how often a round was decided by a shove rather than by the ring; the first draft scored 9%. |
| **[Tangle](play/tangle/)** | A daily connection puzzle. Turn the tiles until no connector is left dangling. The board is grown as a spanning tree and then scrambled, so it is provably solvable *before* you see it — the alternative is shipping an impossible board on day 46. Same board for everyone, every day, and a spoiler-free line to paste into a group chat at the end. |

## IV · Things you would actually use

Small, finished tools for ordinary jobs — a QR code for the Wi-Fi, who owes whom after a
weekend away, whether the guitar is in tune, what is in a spreadsheet — each still built from
the algorithm up, and none of them sending anything anywhere.

### [Sift](apps/sift/) — drop a CSV in and see what is actually in it

Every column gets a type, a count of the gaps, a range and a shape. Then sort
and filter a hundred thousand rows without it stuttering. Nothing is uploaded.

**Splitting a line on commas is the single most common data bug in working
software.** It silently truncates any row with a comma inside a quoted field,
the row count still looks about right, and nobody notices until a customer asks
where half their address went. So the parser is a character loop that handles
the whole list — escaped quotes, embedded newlines, CRLF, a byte-order mark,
ragged rows, and a trailing newline that must not invent a record that is not
in the file. There is a test for each, because each is a bug I have seen ship.

It also refuses to guess. `new Date('03/04/2025')` is March in the US and April
almost everywhere else, so anything that is not ISO stays text rather than being
silently wrong by up to eleven months.

A hundred thousand rows across eleven columns is 1.1 million elements, and a
browser handed that allocates for forty seconds and then scrolls at four frames
a second. So it does not make them: a tall empty box keeps the scrollbar honest
and only the ~36 rows actually on screen exist, recycled rather than rebuilt.
Measured: **36 DOM rows at a hundred thousand, and 36 after scrolling to the
bottom.**

[Full write-up](apps/sift/README.md).

### [QR codes](apps/qr/) — from the bits up

**[Open it](apps/qr/)** · Type a link, some text, a Wi-Fi network or an email and it is a QR code
before you finish typing. The encoder is written from the standard: mode selection, Reed–Solomon
error correction in GF(256), interleaving, placement and all eight masks scored by the penalty
rules. Tick *show how it is built* and every module is coloured by what it is for.

A wrong QR code looks exactly like a right one, so the tests never ask the encoder whether it is
right: capacities against the published table, every error-correction block against the algebra,
the textbook "HELLO WORLD" byte for byte — and during development every version, level and mask
was read back by an independent decoder, zxing-cpp: 56 codes, all exact.

[Full write-up](apps/qr/README.md).

### [Split](apps/split/) — who owes whom, in the fewest payments

**[Open it](apps/split/)** · Who paid for what, uneven splits and all, and the smallest number of
bank transfers that settles everybody up. Money is whole cents from the moment it is typed, so
every split sums to its total and every group to exactly zero. The fewest payments is *people
minus the most zero-sum groups they can be divided into*, found by a search over subsets — which
beats the usual biggest-debtor-first method, and is checked against a brute-force search over
every way of dividing hundreds of random groups. The whole group travels in one link; there is
no server.

[Full write-up](apps/split/README.md).

### [Tuner](apps/tuner/) — to the cent

**[Open it](apps/tuner/)** · Play a note and see how sharp or flat it is. A real string's
fundamental is often quieter than its harmonics, so a tuner that picks the loudest frequency
calls a low E an octave too high; this one finds the *period* instead, with YIN — difference
function, cumulative-mean normalisation, the first dip under a threshold, parabolic refinement.
Tested on synthesised notes with known answers, including one with its fundamental removed
altogether. No microphone? There is an out-of-tune string on the page, and a peg to turn.

[Full write-up](apps/tuner/README.md).

### The rest of this chapter

| | |
|---|---|
| **[Beat Lab](play/beats/)** | A drum machine with no sound files in it. Every kick, snare and hat is generated from scratch by the browser. Tap squares, press play, make something. |
| **[Islandsmith](play/island/)** | Press the button and a new world appears: coastline, mountains, forests, rivers, snow and a name. Every island comes from a single random number. |

## V · The serious ones

Same approach, harder subjects — each one takes something normally invisible and
puts it on screen. These are the ones that take longer than ten seconds to get
into, which is why they are at the end rather than at the front.

### [Covers](apps/covers/) — a restaurant floor and booking system

**[Open it](apps/covers/)** · The longest thing here by a distance. You arrive
at **19:42 on a Saturday**. Thirty-one bookings are in the book, eleven parties are eating, four are due in the next
twenty minutes, one is twenty-five minutes late and not answering, three groups
are waiting at the bar, and there is a double-booking on table 2 that somebody
needs to sort out before half past eight.

Drag a party onto a table and it tells you whether they fit — and when they
don't, **why not, and what to do instead**.

**Every table-management demo ever built opens on an empty grid with an "Add
your first booking" button, and all of them are boring.** Not because the design
is bad: an empty restaurant is not a restaurant, and nobody can tell whether an
empty system is any good. So this one opens in the middle of service with the
job already half done and going wrong in the ordinary ways. Everything else
follows from that.

The rules live in a module with no DOM in it, and the interesting part is what
happens when the answer is no. *"Cannot seat"* is a dead end. This says
`Table 1 seats 2. This is a party of 6. → 30 is free at 20:30`. Every refusal is
a sentence a head waiter could say out loud and carries the way forward —
another table at the same time if there is one, a different time if there is
not. A lateral move applies on release; **a move that changes the time does
not**, because that is a decision made with the guest on the phone.

A booking holds a table for the meal *plus* the fifteen minutes to clear and
re-lay it. Tables push together the way the room allows — `10 + 12` is not a
join, because table 11 is between them — and two fours seats **nine**, not
eight, because you gain the two ends that were nobody's seat. A test asserts the
drawing agrees: at one point the floor plan drew eight chairs round a run the
scheduler would happily sell to nine people.

**The one conflict it ships with was not planted.** The night was hand-written
to look fine, and `conflicts()` found it.

Press play and the rest of the evening runs in about half a minute — parties
arrive, sit when their table is clear and not before, work through their
courses, pay and leave.

**"Yes — if one booking moves."** When the answer is no, it searches the night
for a rearrangement that makes it a yes — *"moving Bianchi from 20 to 11 gets
them in at 20:42, half an hour sooner"* — and it will never move somebody who
has already sat down. One click re-plans the whole evening, shows what that buys
before anything happens, and then the moves fly across the floor plan. **Open it
in two windows and they stay in step**, because a restaurant has more than one
screen.

[Full write-up](apps/covers/README.md), including the bug where pressing play
reset the restaurant sixty times a second, and the one where the system offered
a time it would then refuse.

### Six more, for engineers

**You do not need to know the subject.** Every one of these opens with a
plain-English briefing: what it is, what is on screen, why anyone cares, and
how it works underneath. Those briefings live in one file,
[`shared/briefings.js`](shared/briefings.js), which is also what the front page
reads — two copies of an explanation drift apart within a month, one copy
cannot.

| | |
|---|---|
| **[Regex Lab](projects/regex-lab/)** | A search pattern compiled into a machine you can watch run, one character at a time — including the kind of pattern that quietly takes a website down. |
| **[Query Planner](projects/query-planner/)** | A database deciding how to answer a question, with its reasoning attached. Drag a table's size and watch it change its mind. |
| **[Raft Lab](projects/raft-lab/)** | Five servers agreeing with each other. Cut the network in half, crash the leader, and watch the safety guarantees hold. |
| **[Trace Explorer](projects/trace-explorer/)** | Where a slow web request actually spent its time, explained in sentences instead of charts. |
| **[Diff Forge](projects/diff-forge/)** | The merge conflict — software's most hated screen — rebuilt as a choice you can actually read. |
| **[OKLCH Studio](projects/oklch-studio/)** | Building a colour palette that still passes when someone runs an accessibility check on it. |

Each of these has its own README covering the design decisions, the algorithms,
and — deliberately — what it does **not** do.

---

## How it's built

**No frameworks. No build step. No dependencies.** Every page here is plain
HTML, CSS and JavaScript — including the transformer, which is trained by an
automatic differentiation engine written from nothing rather than by a library.
The smallest toys are each a single self-contained file you can open by
double-clicking. Clone this in five years and it still runs.

Everything else loads ES
modules, which browsers refuse to serve from a `file://` address — run
`npx http-server` for those. The
front page says so itself if you open it the wrong way, rather than rendering
a blank section.

**The serious ones split in two:** a pure `engine.js` (the algorithm — no
screen code, testable from a terminal) and an `index.html` (the interface). The
engine has to be *correct*; the interface has to be *understood*. Different jobs.

The machine-learning pieces follow the same rule, which is what makes them
testable at all: `autograd.js` knows nothing about a canvas, so the same file
that trains the model in node runs it in the browser — and the picture on the
page is therefore guaranteed to be a picture of the model that was trained,
rather than a second implementation that agrees with it on the examples someone
checked.

```
index.html              the front page, with a live preview on every card
shared/briefings.js     the plain-English explanation of each serious tool
apps/attention/
  autograd.js           reverse-mode autodiff over matrices, every op grad-checked
  model.js              an attention-only transformer, and the sampling knobs
  optim.js              Adam, gradient clipping, a cosine schedule with warmup
  analysis.js           finding a circuit by its signature, and scoring it
  quantise.js           int8 symmetric quantisation — how the weights ship
  train.mjs / pack.mjs  train it in node; measure it; pack it for the web
apps/tokens/
  bpe.js                byte-level byte-pair encoding, both pre-tokenisers
  corpus.js             64,000 characters of this repo's own prose
apps/evals/
  stats.js              bootstrap, Wilson, McNemar, power — the statistics
  suite.js              two real parsers and the graders that score them
apps/agents/
  harness.js            the tool-use loop, and every guard around it
  tools.js              five tools over 300 deterministic expense lines
  policy.js             the scripted stand-in for a model, and the faults
play/<name>/index.html  a toy — one file, no imports
play/ace/
  engine.js             the rules: gravity, rocks, collision, scoring — DOM-free
  index.html            canvas, parallax, particles, synthesised sound
play/ember/
  engine.js             map, fighting, enemies, bosses, autopilot — DOM-free
  render.js             tiles, fire, the dark and the shadows every wall casts
  audio.js              the score and every noise, synthesised live
  index.html            input, HUD, the screens in between
play/sweeper/
  engine.js             the generator, the logic solver and the game — DOM-free
  index.html            the board, hints and the loss that explains itself
play/sudoku/
  engine.js             the counting solver, the human solver, the grader, the hints
  index.html            the grid, notes and undo
apps/qr/
  qr.js                 modes, Reed–Solomon, placement, masking — the whole encoder
  index.html            the form, the square, and how it is built
apps/split/
  split.js              cents, balances, the fewest payments, the share link
  index.html            the group, the expenses and the plan
apps/tuner/
  pitch.js              YIN, note names, tunings — samples in, a number out
  index.html            the dial, the microphone and the synthesised string
apps/covers/
  floor.js              the room — tables, where they are, what can join what
  optimise.js           turning a no into a yes, and re-planning the night
  schedule.js           the rules — turn times, clashes, and why something is a no
  book.js               a Saturday night, already half underway
  service.js            what the room does while the clock runs
  plan.js               geometry — metres to pixels, and where the chairs go
apps/room/
  case.js               the study, the people, what can be true, and the answer
  engine.js             what you have found, and what in it disagrees with itself
  plate.js              the projection, and the drawing
apps/lamplighter/
  scene.js              the story, and every function that says what the night is doing
  index.html            the canvas that draws it, and the sound
apps/nightshift/
  story.js              the log, the beats, and the pure functions that time them
  index.html            the document, and the map from effect name to what it does
projects/<name>/
  engine.js             the algorithm, pure and DOM-free
  index.html            the interface
  README.md             the design problem, and the limits
tests/run.mjs           484 tests, no framework, no install
```

```bash
npx http-server        # the serious ones use ES modules, so they need a server
node tests/run.mjs     # run the tests
```

## How I work

**I build fast and I'm hard to satisfy.** With modern tooling a working version exists in
minutes, so the job stops being typing and becomes judgement: what's worth building, what's
wrong with it, and what it should say. That's where the time goes.

**Looking at it beats testing it.** Every screen here was rendered and inspected after each
change, which is how these got caught:

- the hourglass leaked sand out of its sides — it had been drawn as an X rather than a funnel
- the forest fire burned one tree and went out, because the match was lit on an isolated
  tree at the edge of the map
- the island generator produced a perfectly smooth green ellipse, because the noise
  frequency was so low the entire map sat inside a single noise cell
- the six "serious" links rendered in shouty uppercase, because a heading and a list both
  claimed the same HTML `id`
- the Tokens page was 516 pixels wide on a 390-pixel phone, because a `1fr` grid column's
  smallest size is its longest unbreakable line — `minmax(0, 1fr)` and it behaves
- the front page's crop marks, a rubber stamp waiting to land and three little pen arrows each
  made a phone lay the whole page out wider than the screen, while looking fine on a desk

Every one of those was *technically working code*, and no test would have flagged a single
one of them.

**But tests catch what looking can't.** The suite here asserts properties rather than
pixels — the NFA agrees with the platform's own `RegExp`; both diff algorithms' edit scripts
reconstruct both inputs across 800 randomised pairs; Raft's safety invariants hold at every
tick of a scripted chaos run. Two of those tests failed because *the test* was wrong, and
two failed because the *engine* was wrong — including a query planner that keyed its scans
by table name while keying its estimates by alias, so every filter silently fell back to a
default selectivity and produced plans that looked entirely plausible. Telling those two
cases apart is the job.

**A beautiful result is not the same as a correct one.** This is the newest thing
in this repo and the one I would want read first. The transformer learned to
copy, the loss fell off a cliff exactly on cue, and a head reached an induction
score of 0.92. It was the wrong mechanism: it had memorised a position rather
than learning to match on content, and on screen those two are identical — the
only tell was that it had appeared in the layer where the circuit does not fit.
Fixing the task then surfaced a second bug, this time in the *measurement* of
the fix, which made one head look like eight.

Neither would ever have thrown. Both produced a plausible picture and a number
you would happily put in a slide. Finding them took longer than the original
build, and the checks that would catch each of them now run on every pack. The
same instinct is why the eval page tests that its 95% interval really does
contain the truth 95% of the time, and why the agent page caught its own
"a tool throws" demonstration never reaching the tool.

**The words are half of it.** "Pour sand. Add water. Then set it on fire" teaches the
sandbox faster than a tutorial would. Deciding what a thing says, and what it refuses to
say, is part of building it.

---

The commit history is the full record.

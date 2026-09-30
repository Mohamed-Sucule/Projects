# Sumo

Two players. One keyboard. One key each.

**→ [Play it](https://mohamed-sucule.github.io/Projects/play/sumo/)**

Your blob has an arrow on it that sweeps round and round on its own. Hold your
key and two things happen at once: **the arrow stops turning, and you charge the
way it points.** Let go and it starts sweeping again.

Knock the other one out of the ring. First to five.

**A** and **L** — far enough apart for two people at one laptop. On a phone the
left half of the screen is player one and the right half is player two, so it
works with a thumb each. There's a one-player mode against a bot.

---

## One key doing both jobs

That control scheme is the whole design. You are not aiming and you are not
steering — you are **choosing a moment**, which is a thing people are good at
without being told, and which is why somebody handed a laptop four seconds ago
can play.

It also means the game needs no explanation, no key chart and no options screen.
There is one thing to press.

## The ring shrinks, and that's not decoration

It's what makes the game finish.

Two players who never press anything are not in a stalemate — they are both
about to be standing outside a circle that used to be under them. Whoever
drifted further from the middle goes first. There's a test that plays sixty
rounds with no input at all and asserts every one of them ends, in under twenty
seconds.

It's also why passivity loses. You can't win by waiting.

## The physics was tuned by measurement, not by feel

Every number in `RULES` was picked by having two bots play a few thousand rounds
and measuring two things: **how long a round lasts**, and **how often it is
decided by a shove rather than by the ring quietly closing under somebody**.

The second one is the real test. A sumo game where the ring does the work is not
a sumo game — and the first draft of these numbers had **the ring deciding 91%
of rounds**. Players were flying out on their own after overcommitting and
barely touching each other.

What fixed it was counterintuitive: *more* drag. Low drag meant a single hold
sent you across the ring and out the far side, so nobody ever arrived anywhere
with an opponent still in front of them. Raising drag made overcommitting
recoverable, which meant players stayed on the floor long enough to actually
collide.

The current numbers, measured over thirty bot matches:

| | |
| --- | --- |
| round length | 10.6s median |
| decided by contact | 100% |
| full match to five | 103s median |

The bounce is deliberately unphysical — a well-timed hit sends somebody across
the ring, because a realistic collision makes contact feel like paperwork. But
**momentum is conserved exactly**, with a test on it: energy may be added on
purpose, momentum appearing from nowhere is the bug that quietly launches
somebody out of the ring off a graze.

## The bot

Not clever, deliberately. It waits until its arrow points at the other blob with
the middle of the ring behind it — that is, until pushing would send them
*towards* the edge — then holds. When it's the one in trouble it aims at the
middle instead.

A `sloppiness` knob blurs the moment it picks, because a bot that never made a
mistake would be a wall rather than an opponent. Two tests keep it honest: a
sharp bot must win some matches and lose some, and a sloppier bot must do worse
than a sharper one — otherwise the knob isn't doing anything.

## Tests

`node tests/run.mjs sumo` — 25 of them:

- holding stops the arrow and letting go starts it again, which is the whole
  control scheme
- you accelerate exactly the way the arrow points
- mashing the key during the countdown buys you nothing
- a clash conserves momentum however springy it is, separates the blobs rather
  than letting them buzz inside each other, and leaves a pair that are already
  moving apart alone
- the ring only ever shrinks and never passes its floor
- both players out in the same instant is decided by who was further out —
  a coin flip for the match point would be indefensible
- a round always ends even with no input at all
- the same match at 30, 60 and 144fps comes out identical
- every round opens somewhere new, facing inwards, so there's no memorised move
- the three playability measurements in the table above

Four of those failed the first time and **all four were the test's fault**:
three tried to fast-forward through the countdown with `step(2)`, which the
backgrounded-tab guard throws away by design, and the frame-rate test built its
hold schedule out of `i / fps`, where a third of a second doesn't exist in
binary — so at 144fps a change landed a frame away from where it landed at 30,
and the test was measuring its own arithmetic.

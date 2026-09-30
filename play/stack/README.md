# Stack

A block slides back and forth. You tap. It drops.

**→ [Play it](https://mohamed-sucule.github.io/Projects/play/stack/)**

Whatever hangs over the edge of the block below is sliced off and falls away,
so the tower gets narrower every time you are sloppy and stays exactly as wide
as it is when you are not.

That single rule is the entire game. There is no tutorial, because there is
nothing to teach — you learn it by dropping one block badly.

---

## Why it's honest

**You never lose to something you couldn't see coming.** The width of the top
block *is* your remaining margin for error, and it is drawn in the middle of
the screen at all times. There is no hidden state, no random punishment, and no
difficulty spike. If the tower is one pixel wide, you can see that it is one
pixel wide.

The bar under the score is that same number again, as a bar, coloured cyan then
amber then red — because a width in the middle of a moving screen is harder to
judge at a glance than a bar in a fixed place.

## The one rule that makes it a game rather than a countdown

A drop within five units of perfect counts as perfect: nothing is sliced, and a
little width is handed *back*.

Without that, the tower can only ever shrink. Every run would end the same way
and the only variable would be how long it took — a game you can only lose
slowly is a chore. With it, a good player can hold a width indefinitely, and
*that* is the skill the game is actually about.

The regain is capped at the starting width, so a long perfect streak can't grow
itself a runway.

## Two properties that came free

**The block travels edge to edge and stays entirely on screen.** The arcade
original lets it slide halfway off, which reads as a rendering bug rather than
as a design, and it hides the thing you're trying to aim at.

Fixing that produced a property worth having for nothing: **a narrow block has
further to travel**, so it spends longer at speed and is harder to time. The
game tightens as you get better without a single extra rule.

## What's underneath

`engine.js` is the rules and knows nothing about canvases, sound, input or the
DOM — a `Tower` you can drive from a script. Everything you can see is in
`index.html`. The split is why the slicing arithmetic and the difficulty of the
thing can be checked from a terminal instead of by playing it a thousand times.

- **Camera.** The view pans up as the tower grows, easing rather than snapping,
  so the tower appears to stay in place while the world drops past it.
- **Colour.** The hue climbs 5.2° per row, so the tower runs blue → purple →
  orange → red as you get higher, and the sky darkens with altitude. Nobody
  needs to be told they are high up.
- **Offcuts** tumble away under gravity with the spin they'd have picked up
  from being sheared off one side.
- **Sound.** Every perfect drop plays the next note up a pentatonic scale, so a
  streak is a rising melody and breaking it is audible before you've read the
  screen. Synthesised with oscillators — there are no audio files.

## Two defects found by looking at it

- **The block travelled 60% off-screen** at the extremes. See above — it looked
  broken, and fixing it improved the game.
- **The PERFECT flash collided with the incoming block.** It was drawn above
  the row it belonged to, which is exactly where the next block enters. It's
  below the row now.

## Is it playable?

A claim about difficulty is a claim about play, so it gets measured by playing.
A bot taps with a fixed reaction delay:

| reaction jitter | median score |
| --- | --- |
| 0ms | endless |
| 20ms | 90 |
| 40ms | 37 |
| 70ms | 24 |

Perfect timing being *unbeatable* is the correct answer for this game — it means
the ceiling is you, not the settings. A human at 40–70ms of jitter lands in the
twenties to thirties, which is a score worth beating.

## Tests

`node tests/run.mjs stack` — 25 of them:

- the slicing arithmetic in both directions, including the exact boundary where
  the overhang leaves nothing to stand on
- a perfect drop snaps flush, hands width back, and the regain is capped
- a miss breaks the perfect streak and a perfect drop starts a new one
- the block stays entirely on screen and turns around at the edges rather than
  wrapping
- a dropped frame can't teleport it across the screen
- the same seed and the same drops build the same tower, to the unit
- the margin readout and the actual width left can never disagree
- a narrower block has further to travel
- the run can't end on the very first drop by accident
- the playability measurement above

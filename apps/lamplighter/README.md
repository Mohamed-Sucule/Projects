# The Lamplighter

A five-minute illustrated story about a lighthouse keeper's last winter.
Scroll, and the night goes by.

**→ [Read it](https://mohamed-sucule.github.io/Projects/apps/lamplighter/)**

There is not an image file in this directory. The sky, the sea, the rock, the
tower, the rain and the light are all arithmetic.

---

## Scrolling is time, not travel

Almost every scroll-driven page on the web moves a camera: you scroll, and
something slides past. Here the scroll position *is the hour of the night*, and
everything on screen is a function of that one number — how high the sun is,
what colour the sky is at the horizon and overhead, how hard it is blowing, how
much rain is falling and how far sideways it is going, how rough the sea is, and
which words are on screen.

The words are pinned to the middle of the frame and cross-fade with their
neighbours rather than scrolling up past you, because the view should stay where
it is while the night changes around it. You are not walking along a coast. You
are standing still for nine hours.

That also means none of it needs a browser to check. `scene.js` has no DOM in
it: hand it a number between 0 and 1 and it hands back the state of the night,
so every claim the picture makes is a claim a test can hold it to.

```
✓ the sun is up at both ends of the night and down in the middle
✓ the gale gets up in the evening, peaks in the small hours, and is gone by dawn
✓ the sky is at its darkest when the storm is at its worst
✓ the sky never jumps
```

Each of those was a real bug. The first version of `sun()` peaked at `t = 0.5`,
so the story opened at dusk, *brightened* until midnight, and ended in the dark
— which looks perfectly fine in a screenshot and is nonsense the moment anybody
scrolls. And the sky keyframes and the storm curve drifted apart: the sky began
lifting towards grey at 0.62 while the gale was still building to its peak at
0.72, so the weather appeared to clear and then get loud again.

## Two clocks, and keeping them apart is the whole feel

The reader's clock is the scroll bar. The lighthouse's clock is wall time.

The beam turns once every 11.2 seconds whether or not anybody is reading, whether
or not the tab is focused, and no matter how fast you scroll. A beam wired to
scroll position is a beam attached to the reader — it stops when you stop, and
the place becomes a diorama that only exists while it is being looked at.

There's a test that pins this down by checking the *shape of the function*:

```js
assert.equal(beam.length, 1);   // it takes seconds. There is nowhere to pass a scroll value.
```

The flash pattern is how you actually tell one lighthouse from another, so it's
`Fl(1) 11s` — one flash every eleven seconds — and it's sharp, not a glow:

```
✓ the light flashes once a revolution, and briefly
```

The foghorn is on the same clock: one note every third revolution, whatever the
reader is doing.

## Drawing a beam that reads as a beam

A lighthouse beam doesn't sweep left and right across a flat picture. It goes
round, and what you see is that circle in perspective. So the far end of the
wedge rides between the horizon (pointing out to sea, away from you) and well
below the bottom of the frame (pointing back at you), while the wedge's width
comes and goes with how side-on it is. Done as a flat rotation it looks like a
searchlight in a car park.

Two things that went wrong and were only visible by looking:

**The beam was drawn before the sea**, so below the horizon it was painted over
by the water, and it ended in a dead flat line halfway down the picture. Light
falls on water. It does not stop at the waterline.

**One triangle reads as a piece of card.** It has a hard edge all the way down
both sides. Five stacked wedges of decreasing width and increasing brightness
give the soft-shouldered cone a beam actually has, without paying for a blur.

## Water

One filled gradient, then a few hundred short strokes for the crests, each one
sampled from the same sum of three sine waves that made the surface, and each
lying along the local slope so the marks follow the water instead of all tilting
the same way. The rows bunch up towards the horizon.

The crests are what sell it. A filled gradient alone reads as a lake no matter
how rough you make the outline.

Two things I got wrong:

**The horizon was a razor.** A lit sky meeting a dark floor at a hard line reads
as a cardboard cut-out standing on a table. The strip just under the horizon is
sky reflected off water almost edge-on, so it's nearly as bright as the sky
itself, and putting that back fixed the whole sense of depth.

**The rows were offset by `sin(y)`** — a smooth function of a smooth function.
The crests lined up into diagonal corduroy that read as hatching. Each row now
gets its own offset and its own slice of the wave field.

The road of light under the sun is the same trick: a low sun on water isn't a
reflected disc, it's a column that widens towards you, because every crest
between you and it turns its own small piece of the sun in your direction.

## One number for the lighthouse

Sizing the tower's width from the viewport width and its height from the
viewport height is the obvious thing to write, and it drew a tower three and a
half times as tall as it was wide on a laptop and **nineteen times** on a phone
— the same code producing a lighthouse and a chimney depending on which way the
screen was turned.

Everything now comes off a single `towerH`, which is also capped against the
viewport width, so a narrow screen gets a smaller lighthouse. That's the better
picture there anyway: more sea, more sky.

## The reader puts the light out

The last chapter opens with *I put the lamp out and go down two hundred and
eleven steps.* The lamp's brightness is tied to that chapter's scroll range, so
scrolling through those four lines is what extinguishes it. It's the only moment
in the piece where the reader does something rather than watches.

## Sound

Sea, wind, rain and a foghorn, all synthesised — no audio file, so nothing to
wait for and nothing that can fail to load. The wind and the rain are wired to
the same `storm()` the picture uses, so they get up together. It waits for a
click, because browsers require one.

## Accessibility

The story is real text in the document, in reading order, and a screen reader
walks it top to bottom. Only one chapter is ever visible, which a test enforces
from both sides:

```
✓ exactly one chapter is readable at any moment
```

That one caught a genuine hole: each chapter used to fade *out* before the next
faded in, leaving about two per cent of the scroll with a beautiful picture and
no words on it — which reads as the page having broken.

## Tests

```
node tests/run.mjs lamplighter
```

21 of them, over the night, the light, the words and the arithmetic underneath.

## Files

```
scene.js     the story, and every function that says what the night is doing
index.html   the canvas that draws it, and the sound
```

No dependencies, no build.

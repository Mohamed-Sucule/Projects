# Morph

One gallery, seven layouts, and not a single CSS transition anywhere in it.

**→ [Open it](https://mohamedsucule-debug.github.io/Projects/play/morph/)**

Switch layout and every tile flies to its new place. Switch again before they
land and they bend into the new arrangement carrying the speed they already
had. Drag one and the rest flow around it. Click one and it grows into the
detail view.

---

## Why not a CSS transition

A transition is a promise about the future: *get from here to there over 300ms
along this curve*. Interrupt it — change the layout while it is still moving —
and the browser has to throw the promise away and make a new one starting from
wherever the element happens to be, **at zero velocity**. Things stop dead and
set off again.

You can see it, and it is the most common single reason an interface feels
cheap.

A spring has no idea where it started or when it is due to arrive. It knows
three things: its position, its velocity, and where it is being pulled. Change
the target and nothing is discarded — the pull turns and the momentum carries
through. Motion stays continuous through any number of interruptions, because
there was never a plan to lose your place in.

That is the whole argument, and every gesture here can interrupt every other
one because of it.

## The bit that surprised me

**There is no expand animation in this codebase.**

Opening a tile writes one very large target rectangle for it. Closing it writes
the old one back. The shared-element transition — where the tile itself grows
into the detail view rather than a copy fading in over the top — is not
implemented anywhere, because it falls out for free the moment every position
is already a spring.

Same for reordering. Dropping a tile in a new slot recomputes the layout, which
writes new targets for everything that moved. Nobody animates anything.

## The layouts are real algorithms

**Justified** is the one every photo site uses and none of them explain. Fill a
row at a rough target height until it is about wide enough, then solve for the
exact height that makes it fill the container:

```
rowHeight = (containerWidth − totalGaps) ÷ sum of aspect ratios
```

Every item in the row gets that height and keeps its own proportions, so the
widths come out right and the row closes **to the pixel**. Nothing is cropped
and nothing is stretched; the row height is the free variable. A test asserts
every row lands within 0.02px of the edge.

The last row is the awkward one — left alone it fills the width by blowing its
handful of items up to enormous heights. It is capped instead, which is what
every implementation of this does and none of them mention.

**Masonry** drops each tile into whichever column is currently shortest.
Packing these perfectly is NP-hard; the greedy answer lands within a few
percent and runs in one pass. A test asserts the columns finish within 12% of
each other.

**Spiral** turns 137.5° between tiles — the angle a sunflower uses. Being
irrational, no two tiles ever line up into a spoke however many you add. Any
round-number angle produces obvious rays.

**Coverflow** does not space the turned-away cards evenly. That reads fine for
five of them and sends the fiftieth a thousand pixels off the side, which then
scrolls. The offset approaches a limit instead, so the furthest card can never
sit more than about 1.5 widths from the middle.

## Two bugs worth naming

**The opened tile rendered behind its own backdrop.** `#field` carries
`perspective` for the 3D layouts, and `perspective` creates a stacking context
— so a tile's `z-index` is only ever compared against its siblings *inside*
that context. No value on earth lifts it above an element outside. The backdrop
had to move inside the field. The fix is one line; finding it is not.

**Distant coverflow cards ran off the side and forced a scrollbar**, because
the offset grew linearly with the index. Now it saturates, and a test checks
every card stays inside the box at 5, 30 and 120 items.

## What it does not do

**Tile sizes are animated as real width and height**, which is layout work
rather than pure compositing. That is affordable only because every tile is
absolutely positioned, so resizing one can never reflow its neighbours. At a
few thousand tiles this would be the wrong trade and the sizes would have to be
faked with a scale plus a counter-scaled child — the technique shared-element
libraries use, at the cost of images that distort mid-flight.

**No virtualisation.** Every tile is a real element whether it is on screen or
not. Push the count to ninety and watch the frame counter; that is the honest
cost, and it is shown rather than hidden.

**`prefers-reduced-motion` snaps everything.** The springs are still there —
they are just told to arrive immediately.

## Tests

`node tests/run.mjs morph` — 29 of them. The ones that earn their place:

- a spring **arrives at the same place at 60Hz, 120Hz and 240Hz**. One that
  behaves differently per refresh rate looks right on my machine and wrong on
  somebody else's.
- a quarter-second dropped frame does not detonate a stiff spring. Semi-implicit
  Euler in one large step is unstable and sends the value into the millions;
  the integrator slices `dt` internally, and this test is why.
- redirecting mid-flight **keeps the velocity** — the property the whole design
  rests on.
- critically damped never overshoots; under-damped does.
- every justified row fills the container to within 0.02px, and no item is
  distorted.
- masonry never overlaps and keeps its columns level.
- `reorder` is a permutation for every from/to pair, including out-of-range
  ones.
- every layout survives an empty list and a single item.

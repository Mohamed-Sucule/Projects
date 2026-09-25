# Portrait

Drop in a photo and watch it rebuilt out of something that is not a photo.

**→ [Open it](https://mohamedsucule-debug.github.io/Projects/play/portrait/)**

Four ways: thousands of dots, a mesh of triangles, tiles in colours the photo
picked for itself, or one bit per pixel. The photograph is thrown away each
time and redrawn from a few thousand primitives — which is why these hold up
when you look closely, and a filter does not.

Your photo never leaves your device. There is no server in this; the whole
thing runs in the tab.

---

## The dots are the point

Each dot owns the patch of picture nearest to it. Every pass, a dot moves to
the **darkness-weighted centre** of its own patch — so dots drift towards dark
areas and away from light ones, and crowd together where the picture needs more
ink. Repeat and they settle into an arrangement where every dot carries an
equal share of the image. That is weighted Lloyd relaxation, and it is what a
stipple engraving does by hand.

They start scattered at **random**, not pre-placed. Starting them roughly where
they belong converges in three or four passes and looks finished before you can
see it happen. Starting from noise takes forty and the picture assembles itself
in front of you. Both settle to the same arrangement; only the journey differs,
and the journey is the product.

### The bit that makes it possible

Doing this honestly means asking, for every pixel, which dot is nearest. At
200,000 pixels and 4,000 dots that is **800 million comparisons per pass** —
several seconds each, so around three minutes for the animation.

Instead the dots go into a uniform grid whose cells are about one dot apart.
Each pixel searches outwards from its own cell and stops as soon as the next
ring is too far away to contain anything closer. That is roughly **ten**
comparisons per pixel instead of four thousand, and it is the difference
between an animation and a progress bar.

A grid that disagrees with brute force even occasionally would make the whole
relaxation quietly wrong, so there is a test that picks 250 random points and
asserts the two agree exactly.

## The other three

**Triangles** scatters points along whatever edges a Sobel pass found, plus a
jittered grid so no large area is empty, plus the frame's own corners. Those
are joined by Bowyer–Watson into the Delaunay triangulation — of all the ways
to join points into triangles, the one that maximises the smallest angle. That
is the difference between a low-poly picture that looks designed and one that
looks like shattered glass. Each triangle then takes a single flat colour
sampled from the photo underneath it.

**Tiles** lets the photo choose its own palette: k-means over the cell colours,
seeded with k-means++ so two starting colours do not land inside the same
dominant one and miss an entire part of the picture.

**Ink** allows one bit per pixel. Every grey you can see is an illusion made
from where the black dots fall — after rounding a pixel, the error is carried
forward into the neighbours not yet decided, in fixed proportions. The errors
cancel across any small area, so the average brightness survives even though
every individual pixel is wrong. The test asserts on the mean, because that is
the claim.

## Two bugs worth naming

**The dot radius cancelled out the canvas transform.** The canvas is already
scaled from image space to display space, so a radius belongs in image pixels.
An earlier version divided it by that scale as well, which drew every dot at
well under one pixel and made the darkness variation invisible. The data was
right the whole time; it just could not be seen. A screenshot caught it
immediately and no test would have.

**The mesh did not reach its own edges.** Corner points were pinned to `w-1`
and `h-1` while scattered points ranged over `[0, w)`, so some points fell
outside the mesh's own convex hull and the last row and column of the picture
were covered by no triangle at all. Caught by a test asserting every point sits
inside the frame.

## What it does not do

**The analysis runs small.** Your photo is reduced to about 420 pixels on its
longest side before anything looks at it, because the relaxation visits every
pixel on every pass. The dots are drawn at full canvas resolution — dot
positions are continuous, so the saved picture is sharp — but fine detail in
the original is gone before the dots ever see it.

**No face detection.** It does not know what a face is. It follows contrast,
which on a well-lit portrait happens to be the eyes, the nostrils and the
hairline — that is why it works on faces, not because anything here understands
one.

**One core, no GPU.** All of this is plain JavaScript. It runs everywhere,
including a locked-down work laptop, and the cost is that 20,000 dots take a
few seconds rather than none.

## Tests

`node tests/run.mjs portrait` — 24 of them. The ones that earn their place:

- the spatial grid agrees with brute force on 250 random probes
- relaxation reduces drift by more than half, keeps every dot inside the
  canvas, and leaves no two dots closer than a quarter of their spacing
- **the triangulation is genuinely Delaunay**: no point lies inside any
  triangle's circumcircle
- every interior edge is shared by exactly two triangles and every hull edge by
  exactly one — no gaps, no folds
- dithering to pure black and white preserves the average brightness to within
  2%
- a nearly-white image still returns the number of dots asked for, instead of
  spinning forever in rejection sampling

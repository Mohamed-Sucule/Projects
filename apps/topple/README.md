# Topple

A perfectly ordinary web page — until you swipe across it.

**→ [Break it](https://mohamedsucule-debug.github.io/Projects/apps/topple/)**

Everything your finger passes through comes loose and falls. Cut the support out
from under a paragraph and what was standing on it collapses on top. Pick a
fallen word up and throw it at a button. Then hit rebuild and watch the page put
itself back together, one row at a time, exactly as it was.

**Swipe to break, drag to throw, rebuild to fix.** Which one you get depends on
what is under your finger — something still standing breaks, something already
fallen gets picked up — so there is nothing to explain and no mode to switch.

---

## The loop is the point

The first version of this was one button that flattened everything, and then a
button to undo it. It was a two-second trick with nowhere to go, and the way
back was a small pill sitting in the middle of the wreckage, the same size and
shape as the debris around it. You had to hunt for it.

Two changes fixed that.

**You do the demolishing.** Every element becomes a physics body the moment the
page loads, but held in place — it collides and it holds things up, and it does
not move until something releases it. So a swipe is a cut: whatever the line
passes through comes loose, and whatever was resting on it comes down. You can
take out one nav link, or slash a diagonal through the headline, or take the
floor out from under the cards. It is different every time because you chose
where to cut.

**The rebuild is the better half.** It is staggered from the top of the page
downwards, so the page visibly assembles rather than snapping back in a single
frame, with a note of a pentatonic scale per row as it lands. That is the bit
worth watching twice.

And the button lives at the **top** of the screen now. Everything falls
downwards, so the bottom is where the debris always is.

## They are real elements the whole time

Nothing here is drawn on a canvas and nothing is a picture. The page above is a
normal one — real headings, real buttons, real paragraphs, laid out by the
browser the way every page is laid out.

Each element is moved with a `transform`, which changes where the browser
**paints** it without changing where it thinks it **is**. So while the page is
in a heap on the floor:

- the text is still text — crisp at any zoom, still selectable
- nothing has reflowed; the layout underneath is untouched
- putting it back is a matter of removing one style

There's a test in the build log for that last part: after a collapse, a throw
and a restore, the headline returns to **exactly** the pixel it started on.

## The physics is written from scratch

`engine.js` is a 2D rigid body engine — about 350 lines, no dependencies. It
knows nothing about web pages. It is a list of rectangles with mass and a `step`
function, which is why it can be tested from a terminal rather than by shaking a
page and forming an opinion.

- **Collision detection** by separating axis: two convex shapes are apart if
  there's any line with one entirely on each side. For rectangles only four
  directions need checking, and the one with the least overlap is the direction
  to push them apart along.
- **Contact points** by clipping one face against the other. A box resting flat
  gets **two** contact points, not one — a single contact in the middle of an
  edge lets the box rock from side to side for ever, like a coin that won't
  settle.
- **Resolution** by sequential impulses: walk the contacts repeatedly, each pass
  removing a little more of the approach speed.

## Four things that separate a pile that stands from a pile that sags

Every one of these was found by watching a stack fall over and working out why.

**1. Contacts have to remember.** Each contact accumulates the total push it has
applied this step, and the accumulated value — not the increment — is clamped to
be non-negative. Clamping the increment is the classic mistake: a box being
pushed out on one pass gets sucked back on the next. Without the memory, twelve
passes are barely better than one.

**2. Overlap correction must not become real velocity.** Pushing overlapping
boxes apart adds energy that came from nowhere. Feed that into the bodies'
actual velocity and a settled pile never quite stops — it creeps sideways across
the floor, several hundred pixels of it, and nothing is ever still enough to be
allowed to sleep. The correction goes into a **separate** velocity that moves
the bodies for one step and is then thrown away.

**3. Contacts have to be recognised between frames.** Each one is tagged with
which pair of faces made it, so next frame the solver can start from the answer
it worked out last time instead of rediscovering from zero that the bottom box
is carrying five others. This is also what makes friction hold — a friction
impulse rebuilt from nothing every frame lets a stack walk.

Warm starting took stable stacks from **four boxes to eight**.

**4. A sleeping body must look exactly like a wall.** If it keeps a real mass it
absorbs a share of every impulse and then throws that share away when it is
skipped at integration — so everything resting on it is under-corrected, every
step, and the error compounds the higher the pile goes. A six-high stack had its
top box drifting at 50px/s while apparently at rest.

## Sleeping, and why it has to be done in groups

Contacts never resolve to exactly zero, so without sleeping a settled pile keeps
twitching, never looks finished, and drains a phone battery redrawing the same
picture.

But sleeping a body on its own doesn't work. The moment it stops taking a share
of the impulses, the body resting against it gets a different answer, twitches,
and wakes it straight back up. A pile of six oscillates between the two states
for ever. **A group that is still together can be stopped together** — so the
engine finds connected islands of touching bodies and sleeps whole islands at
once.

There's one more trap: a body with nothing under it is falling, however slowly.
At the top of a throw it's barely moving for a moment, and a naive check would
put it to sleep hanging in mid-air.

## Where it gives up

Honest limits, measured:

| stack of | result |
| --- | --- |
| 4 | stands, asleep in 0.3s |
| 6 | stands, asleep in 0.4s |
| 8 | stands, keeps twitching |
| 12+ | topples into a heap, then sleeps |

A twelve-high tower of identical boxes falling over is arguably what should
happen anyway, and a collapsing page is a jumble rather than a tower. But a
production engine would hold it, and mine doesn't.

## Splitting the words

The first version sagged rather than shattered, because the headline was a
single nine-hundred-pixel slab with nowhere to fall to, propping everything
above it up. Splitting the big text into one element per word took it from 21
bodies to 46, and from "some boxes moved" to "the page came apart".

That produced a lovely bug: **the second line of the headline vanished entirely.**
Gradient text is painted by clipping a background to the glyphs, so it lives on
whichever element carries the background — split the line into child spans and
each word becomes a transparent box with no background of its own. Every word
gets its own gradient now.

Bodies are also made three pixels smaller than the elements they follow. Page
elements sit flush against each other, so bodies the exact size of their boxes
start out touching on every side: a solid wall that props itself up instead of a
page that falls down.

## Details

- Elements start as **scenery**: real bodies with real mass, but with the
  inverse zeroed so nothing can move them. Storing a mass of zero instead looks
  equivalent and is not — release such a body later and it has nothing to be
  pushed by, so it accelerates under gravity and drops straight through the
  floor. There is a test for exactly that.
- A swipe samples **along the line** since the last pointer event, not just
  where the pointer is now. A quick flick jumps sixty pixels between events and
  would otherwise cut a dotted line through the page.
- A swipe begins wherever your finger goes down, hit or miss. Requiring the
  first touch to land on something means a stroke that starts in the margin —
  which most of them do — cuts nothing at all.
- The higher up the page something is, the harder it's shoved by the
  knock-it-all-down button. A building does not fall from the ground floor.
- Mass comes from area, so a headline is heavy and a footer link is light —
  which is what makes the heap look like a collapsed page rather than a box of
  identical bricks.
- Throw speed comes from how fast the pointer was **actually** moving, smoothed.
  Reading a single last frame gives a wild number whenever that frame happened
  to be a long one.
- Grabbing picks the topmost piece, so where two overlap you get the one you can
  see.
- A soft thud when something lands, in proportion to how hard.
- Resizing mid-collapse puts the page back rather than leaving the walls
  somewhere else from the floor everything is lying on.

## Tests

`node tests/run.mjs topple` — 31 of them, covering the collision detection, the
solver, stacking, sleeping and the restore:

- two boxes with daylight between them are not touching, and two that overlap
  report how much and in which direction
- the normal always points from the first box to the second — get it backwards
  and the solver pulls things together instead of apart
- a box resting flat gives two contact points
- nothing escapes the walls, and something moving at 9000px/s doesn't tunnel
  through the floor
- a stack of six stands, dropped from a height as well as placed exactly
- a settled pile stops completely, and wakes the moment something lands on it
- a body with nothing under it never sleeps in mid-air
- **two boxes meeting in a vacuum conserve momentum** — if momentum can appear,
  a pile slowly fires itself across the screen
- **nothing ever gets faster on its own**, checked every frame for 400 frames —
  this is the failure that ruins every home-made solver
- a box balanced on a corner tips over rather than standing on its point
- the same run at 30 and 120 frames a second ends in the same place
- a body you're holding isn't dragged around by the pile, and doesn't fly home
  out from under your finger
- scenery can be turned into something that falls, and what was resting on it
  comes down with it — and a body built as scenery still knows what it weighs

Three of those failed first time and **all three were the test's fault**: the
separating-axis test correctly finds the *shallowest* way out, so two wide flat
boxes overlapping slightly sideways are pushed apart vertically, not sideways.
A fourth failure was real — a hidden `0.999` velocity damping per step, which is
a third of the momentum gone in four seconds, and no conservation test can pass
against it. It's a named rule now.

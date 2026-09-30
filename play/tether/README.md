# Tether

You swing round a planet on a tether. Tap and you let go.

**→ [Play it](https://mohamed-sucule.github.io/Projects/play/tether/)**

You fly off along the tangent — in a straight line, at the speed you were
already going, in exactly the direction you were already pointing. If that line
passes close enough to another planet, its gravity catches you and you are
swinging again. If it doesn't, you are in deep space and the run is over.

One button. One decision: **when**.

---

## Why it's fair

Every part of the decision is drawn.

- **The circle you are on is drawn**, so the direction you will leave in is
  drawn too — it is the tangent, and you can read it off the picture.
- **A short dotted line comes off the nose** pointing exactly where a release
  would send you. It is deliberately short: long enough to read the direction,
  nowhere near long enough to reach the planet you are aiming at. It tells you
  what you are doing, not whether it will work.
- **The capture radius is drawn too**, as a faint disc round each planet. The
  thing that decides whether you live is not hidden, so no death is arguable.

There is no hidden state anywhere in the game. There is a test asserting the
launch direction is exactly the heading already on screen, because if those two
ever disagreed the dotted line would be a lie.

## The curve

Three numbers move as you get further: the capture radius shrinks, the gap to
the next planet grows, and you launch faster. Together they set **the window** —
how long you have to let go:

| planet | window |
| --- | --- |
| 1st | 228ms |
| 10th | 151ms |
| 25th | 106ms |
| 50th | 82ms |
| 300th | 72ms |

Each number *eases* towards a limit rather than marching linearly into one and
then sitting there. A curve that flattens completely tells a good player they
have finished. One that keeps creeping tells them they have not — and because
it approaches its limit rather than crossing it, the game never becomes
impossible either. Difficulty that climbs without bound is a countdown with
extra steps, and players can feel the difference.

## What's underneath

`engine.js` is the rules and knows nothing about canvases, sound, input or the
DOM. The split is what makes the claims above checkable from a terminal.

### Fixed timestep

The world advances in slices of exactly 1/120th of a second, however long the
browser actually took, with the leftover **carried** rather than simulated.

Chopping each frame into pieces of at most one slice is the obvious version and
it is wrong: at 144fps every frame is shorter than a slice, so the world moves
in 1/144s steps and the capture check samples the flight at different points
than it does at 60. The craft then clips a capture radius at one frame rate and
misses it at another.

That took two fixes, and **the first failure was the engine's fault and the
second was the test's**:

- The engine was slicing each frame instead of accumulating. Real bug, fixed.
- Then 30 and 60 matched exactly and 144 didn't, because adding 1/144 to itself
  forty-eight times lands a *hair* under 40 slices rather than on it, so one
  slice fired a frame late. That is a rounding error, not a rule, so it's
  rounded away with an epsilon — and the same epsilon went into Ace, which had
  the same latent problem.
- And the test itself was wrong once too: its taps were on a schedule that
  didn't divide evenly into all three frame rates, so the release landed a
  fraction of a frame apart at each and the test was measuring its own
  arithmetic. They're at multiples of a sixth of a second now.

### The map

Planets are generated to the right for ever from a seeded source, so a run is
reproducible and nobody has to author a level.

**A pure random walk was the obvious way to place them and it was wrong**: a
walk has no memory, so within a dozen planets it had wandered into the bottom
of the world and stayed there, and the game was being played in a strip along
the bottom with two thirds of the screen empty above it. I only found it by
screenshotting a run twelve planets in and looking at where the picture had
gone. There's a pull back towards the middle now, proportional to
how far out it has drifted — it still wanders, it just can't settle. A test
asserts every fifth of the playable band gets real use over a long run.

## Points, for people who want more than survival

Reaching the next planet is the job and pays 100. Two extras reward doing it
well rather than doing it more:

- **Skip** — fly clean over a planet and catch a later one: +140 per planet
  jumped. The flight is a straight line with no drag, so a long shot is always
  geometrically possible; it is just much harder to aim.
- **Close** — get caught within 26 units of the core rather than at the edge of
  its pull: +80. It rewards aiming at the planet instead of at the disc around
  it.

## Is it playable?

A claim about difficulty is a claim about play, so a bot measures it: it watches
the line it would leave on and lets go when that line points at the next planet,
some number of frames late.

| reaction delay | median planets |
| --- | --- |
| none | never beaten |
| ~65ms | 134 |
| ~130ms | 21 |
| ~230ms | 5 |

Perfect timing being unbeatable is the right answer for a game like this: the
ceiling is the player, not the settings. A human anticipates rather than reacts,
so the real band is the interesting part of that table.

## Tests

`node tests/run.mjs tether` — 29 of them:

- a release sends you exactly the way the screen says you are pointing
- the heading is tangent to the orbit, never through the planet
- a flight is a straight line and stays one
- **every planet is reachable from the one before it** — checked by trying all
  180 release points on each orbit, on the real engine, twenty-five hops into a
  run, across eight seeds. This is the fairness claim, so it is the one test
  that plays the actual game rather than inspecting numbers.
- the same run at 30, 60 and 144fps comes out identical
- a four-minute backgrounded tab doesn't kill you, and nonsense time is ignored
- the window only ever gets tighter, and never closes
- the map doesn't wander into a corner and stay there
- a capture keeps the sense of the swing you arrived with, and never puts you
  inside the planet
- the two bonuses pay only when they've been earned
- the two playability measurements above

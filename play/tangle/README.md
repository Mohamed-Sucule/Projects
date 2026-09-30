# Tangle

Tap a tile to turn it a quarter turn. The board is solved when no connector is
left dangling.

**→ [Play today's](https://mohamed-sucule.github.io/Projects/play/tangle/)**

Everybody in the world gets the same board each day, and finishing gives you a
line you can paste into a group chat. There is no timer pressure, no score to
lose, and nothing to read before you start — grey means loose, blue means
joined, and that is the entire tutorial.

---

## The board is built backwards

This is the whole trick, and it's why it's the interesting part of the project.

The obvious way to make one of these is to scatter pipes and check afterwards
whether the result can be solved. That version ships an impossible board on day
46 and there is nothing anybody can do about it.

Instead it grows a **spanning tree** over the grid — a set of edges reaching
every cell exactly once with no closed circuits — and reads the tiles straight
off it. The tree *is* a solved board, so the puzzle is provably solvable before
it is scrambled. Scrambling is then just turning every tile a random number of
quarter turns, which cannot make it unsolvable: turning them back is always
available.

It uses **randomised Prim** rather than a depth-first walk, and that's a
deliberate aesthetic choice with a test behind it. A depth-first walk produces
long winding corridors and almost nothing but elbows and straights. Growing from
a frontier branches, so the board has stubs, tees and the occasional cross in
it — tiles worth looking at. There's a test asserting forty boards contain a
real mix of tile degrees.

Three tests pin the generator down: every cell is reached (a blank tile in the
middle is a puzzle nobody can finish), nothing points off the edge, and the edge
count is exactly one fewer than the cell count — which is what makes it a tree
rather than a web. More edges means a closed circuit got in; fewer means the
board is in two pieces.

## Solved means solved, not "you matched my answer"

The win check is *no connector is dangling* — deliberately **not** "the board
matches the tree I grew from".

Other arrangements can also leave nothing dangling. A player who finds one has
solved the puzzle in front of them, and telling them otherwise would be the game
marking its own homework. There's a test with two tidy rows of straight pipe
that is solved and is emphatically not the generated tree.

## Par

Par is the number of turns it takes to undo the scramble, counted while
scrambling. It's an honest number rather than a proved minimum — a cleverer
route to a *different* valid arrangement could beat it, which is why beating par
says "perfectly" rather than "impossible".

Over sixty days it averages 46 turns on the 6×6 board. Below thirty it's
too slight to be satisfying; above eighty it's a chore nobody comes back to.
There's a test holding it in that band, so a change to the generator can't
quietly turn the daily puzzle into homework.

## The thing you paste into a chat

```
Tangle #258 — 61 turns (par 50) in 2:14
▰▰▰▰▰▰▰▰▱▱
https://…/play/tangle/
```

**No grid of coloured squares.** That format is the one everybody copies, and
for this puzzle it would be a picture of the finished board — the whole point of
a daily puzzle is that the person you send it to hasn't done it yet. There's a
test that fails if anything positional ever creeps into the share text.

The bar is efficiency: full at par, half at twice par, never empty, because a
bar with nothing in it reads as broken rather than as bad luck.

## Details that cost four lines each

- **Tiles turn, they don't snap.** Ninety milliseconds of rotation is the
  difference between a grid of numbers and something you want to keep touching —
  snapping loses track of which piece you just pressed.
- **Anything that joins up flashes.** The only feedback the game needs.
- **A wave sweeps the board** when the last connector lands.
- **The day rolls over in UTC** so the world turns over together, with a test
  either side of midnight.
- **A clock set to 1999** gets day one rather than a negative day number and a
  board that doesn't exist.
- **Copying can fail** — over http, in an iframe, on a browser wanting a
  different gesture — so a refused clipboard write drops the text into a box you
  can select instead of losing somebody their result.
- **A random board** button, because a daily puzzle you've finished is a dead
  page for the next twenty hours.

## Two bugs worth naming

- **`turn(NaN)` charged you a turn.** `i < 0 || i >= length` waves NaN through,
  because NaN fails every comparison. It's `Number.isInteger` first now.
- **The button after winning wouldn't hide.** `.row { display: flex }` outruns
  the browser's own `[hidden]` rule, so setting `el.hidden = true` did nothing
  at all. This is the second time a `display` rule has beaten `[hidden]` in this
  repo; there's a `!important` override next to the rule that caused it.

## Tests

`node tests/run.mjs tangle` — 27 of them, covering the tile arithmetic, all
three generator guarantees, the scramble, par, the day boundary, and the share
text.

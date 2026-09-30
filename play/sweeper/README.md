# Minesweeper — without the guessing

**[Open it](index.html)** · Classic Minesweeper at the three classic sizes, with one change: every
board can be finished by reasoning alone. Click to open, right-click or long-press to flag, click
a number whose mines are flagged to open everything around it. Arrow keys and Enter work too.

## The flaw every version ships

Most of a Minesweeper board yields to reasoning. Then, twenty minutes in, you reach two squares
that nothing on the board can tell apart, one of them is a mine, and the game is settled by a coin.
Nobody enjoys it and nobody learns anything from it.

## The fix is in the generator

[`engine.js`](engine.js) lays the mines, then plays the board from your first click using only
what a player can see and the reasoning a good player uses:

- a number that already touches all its mines makes its other neighbours safe; one with exactly as
  many hidden neighbours as mines left makes them all mines;
- two numbers that share squares constrain each other — whatever the shared squares hold, the
  squares only one of them touches can sometimes be pinned down (this is how the famous 1-2-1 is
  read);
- at the very end, the number of mines left settles the rest.

If the solver cannot finish without a guess, the board is thrown away and another is laid. Hard
takes about nine attempts and fourteen milliseconds; you never see the ones that failed. The first
click always opens a space.

## What that makes possible

- **A hint that shows its working.** It rings a square that can be proved safe, lights the numbers
  that prove it, shades any mines it had to prove on the way, and says why in a sentence.
- **A loss that can be explained.** Open a mine and the page rings a square you could have proved
  safe instead, with the reason — because on these boards there always was one.

## Checked

- Every board handed out, at every size, is played to the end by the solver.
- The reasoning is **sound**: on hundreds of small boards, every arrangement of mines consistent
  with what a player can see is enumerated by brute force, and anything the solver calls safe has
  to be safe in all of them — not merely in the arrangement the board happens to have.
- Following the hints alone wins every game.

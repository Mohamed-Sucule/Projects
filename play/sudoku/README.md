# Sudoku — with reasons

**[Open it](index.html)** · A daily puzzle at three levels — the same one for everybody that day —
or a fresh one whenever you like. Pencil notes that tidy themselves up, undo, a digit pad that
counts down what is left, and full keyboard play.

## Every puzzle is fair

[`engine.js`](engine.js) holds two solvers that do different jobs.

**The fast one** is a backtracking search over bitmasks, always filling the square with the fewest
options first. It never explains anything; its job is to count. A puzzle is only a puzzle if it has
exactly one solution, and the generator asks after every clue it takes away.

**The human one** solves the way a person does, with named techniques, easiest first: a square
with only one possible digit; a digit with only one possible square in a row, column or box;
candidates locked into a line inside a box; naked and hidden pairs; naked triples; the X-Wing. It
never guesses. It grades each puzzle by the hardest technique it needs, it guarantees every puzzle
can be finished without trial and error, and it writes the hints.

The generator empties a random finished grid in symmetric pairs, the way a printed puzzle looks,
keeping each removal only if the answer is still unique *and* the puzzle can still be finished at
its level. A "hard" puzzle that turns out easier than its label is thrown away, so hard is never
an easy one in disguise.

## A hint that teaches the move

A hint that fills in a square teaches nothing. This one says *why*: "In box 5, the only square that
can take a 7 is row 4, column 6", with the square ringed and the box shaded. If it takes a crossing-
out or two to get there — a pointing pair, say — those are explained first, because they are the
part worth learning. A wrong digit already on the board is pointed out before anything else.

## Checked

- The published Wikipedia puzzle gets its published answer.
- Every generated puzzle has exactly one solution, is solvable by reasoning at its own level, and
  is really as hard as its label.
- Every step the human solver takes — every digit placed, every candidate crossed out — is checked
  against the known answer, so no technique can be quietly unsound.
- Following the hints alone finishes every puzzle.

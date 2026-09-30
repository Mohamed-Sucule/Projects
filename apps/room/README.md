# The Room

Edmund Harkness is dead at his desk. The door was locked from the inside and
the key was in his pocket.

**→ [Solve it](https://mohamed-sucule.github.io/Projects/apps/room/)**

Nineteen things to look at, four people to question, five contradictions hidden
among them, and nothing anywhere that is a multiple-choice question.

---

## The thing that makes it a mystery

Almost every whodunnit on the web is a sequence of paragraphs followed by a
guess. You read the clues, you pick a name, and the page tells you whether the
author agrees. There's no reasoning in it — the puzzle is remembering which
paragraph mentioned a train ticket.

Here the case is data, and a **claim** is one plain proposition about the night:

```js
'victor-in-town': { q: 'Whether Victor went to town',
                    yes: 'He went', no: 'He never left' },
```

Every piece of evidence assigns a claim a value. The boot print, the burnt
letter, the coat on the stand, and every word anybody says are all the same
shape:

```js
// from the coat stand
{ claim: 'victor-in-town', value: 'no',
  says: 'An outward ticket for the 8.40, bought and never used' },

// from Victor
{ claim: 'victor-in-town', value: 'yes',
  says: 'Victor says he took the 8.40 and was at his club all night' },
```

And the entire deduction in the engine is this:

```js
const values = new Set(facts.map((f) => f.value));
if (values.size < 2) continue;      // everything agrees
```

Group what you know by claim; any claim holding two different values is a
contradiction. That's it. **Nothing in the case file says which fact is the
lie** — there's a test that greps for it — so the notebook is not a list of
things I decided were interesting. It is genuinely everything you have turned
over that disagrees with itself.

This matters more than it sounds. A hand-written list of "clue A clashes with
clue B" goes stale the first time the story is edited, and worse, it lets the
game *appear* to reason while really reading out answers. Three lines that
cannot be fooled are better than three hundred that can.

## Statements are evidence, and evidence is a statement

There is no separate machinery for testimony. What Mrs Pike says is a fact
about a claim, exactly like a ring in the dust. So *"Mrs Pike heard one chair,
one man, and no voices"* meets *"Two glasses stood on the side table; one of
them has left the house"* by the same three lines that find any other clash,
and the notebook prints them facing each other with **BUT** in between.

Somebody is wrong. Which one is the player's problem.

## Being right is not the same as being right

Naming the murderer having looked at four things is a guess, and a case that
congratulates a guess has taught the player that looking was optional — which
is the only thing this piece has to sell. So the verdict has three outcomes,
not two:

- **Correct, and you can prove it** — the right man, with the four objects that
  prove it actually examined.
- **Correct, but you were guessing** — and then it lists, by name, every piece
  of proof you never looked at.
- **Not your man** — and then it explains why not, *specifically for that
  person*. Clara gains the business and is the only one who does, which is
  exactly why it isn't her: the will was signed and witnessed a fortnight ago,
  and killing him changed nothing she did not already have.

Daniel Ashe is the one I'm happiest with. He lies, and the evidence proves he
lies, and he isn't the murderer. He came back at nine to warn Edmund about his
brother and denied it afterwards because a secretary who was the last man in
the room is a secretary who hangs.

## One dead end, on purpose

There is a boot print in the wet flowerbed under the window. A man stood there
a while, looking up. It is the most sinister thing in the house and it means
absolutely nothing: the window has not been opened in a year and the paint
across the frame is unbroken.

```
✓ the boot print under the window leads nowhere, on purpose
```

Every case needs one. Without it a player learns that anything the game
bothered to draw is evidence, and stops thinking.

## The plate

A pen-and-ink illustration of the study, drawn at runtime. One-point
perspective, cross-hatching, and a wobble on every line because a page of
geometrically perfect strokes reads as a CAD plot rather than a drawing.

Line art rather than a rendering is a decision, not a dodge. An interior is
furniture, and furniture drawn as shaded solids either needs a modelling
pipeline or looks like a pile of boxes. Ink describes a chair with six lines
and lets the reader do the rest — which is why every illustrator in 1935 was
drawing rooms and nobody was painting them.

Three mistakes worth writing down, because each one looked, at a glance, like a
slightly odd drawing rather than a bug:

**Everything was positioned by eye.** The first plate drew the room's shell at
hand-picked coordinates and then put furniture at other hand-picked
coordinates, and the two had no reason to agree: a desk hovered in mid-air and
a fireplace sat flat against a wall it wasn't on. Now nothing is placed in
screen coordinates at all. Everything is given a position in the room — across,
back, up — and projected through one function, and the vanishing point falls
out of the arithmetic rather than being chosen. A test intersects two lines
that are parallel in the room and fails if they don't meet where they should.

**Every fill was a translucent tint**, which is a perfectly reasonable way to
suggest ink wash and means nothing can ever hide anything. You could see the
chair through the desk and the rug through the pedestals. A 2D canvas has no
depth buffer: the only thing that puts one object in front of another is
drawing it later, in something you cannot see through.

**The figure was drawn in one piece.** A man slumped over a desk is his
shoulders *behind* it and his head and arms *on top of* it, so he has to be
drawn in two passes with the desk in between. Drawn all at once, before the
desk, he came out somewhere between a filing cabinet and a hot-air balloon.

## Hotspots are geometry, not a second list

Where each clue can be clicked lives with the drawing, not with the story —
the case file says what a thing *means* and the plate says where it *is*. Keeping
a copy in both meant every change to the illustration had to be mirrored by
hand, and a clue that had slid off the thing it belonged to looked exactly like
a clue that was working.

The coat stand has been in three places and the desk in two, for one reason
each time:

```
✓ no two clues sit on top of each other
```

A hotspot buried under another one looks, to a player, like a clue that does
not exist.

## Tests

```
node tests/run.mjs room
```

25 of them, over the case's consistency, the reasoning, the verdict and the
perspective.

## Files

```
case.js      the study, the people, what can be true, and the answer
engine.js    what you have found, and what in it disagrees with itself
plate.js     the projection, and the drawing
index.html   the only file that has ever heard of a pixel
```

No dependencies, no build.

# Loom

Build a picture by wiring boxes together.

**→ [Open it](https://mohamedsucule-debug.github.io/Projects/play/loom/)**

Every box produces an image. One makes a cloud of random fog, one bends
whatever it is given using a second image as the map, one swaps grey for
colour. Connect them up and whatever reaches the box marked `Output` is the
picture. Six worked examples come in the box; anything you make saves as a PNG
or copies as a link that carries the whole recipe.

---

## The one decision everything else follows from

**Every box produces the same thing: an RGB image.** Not a number, not a
colour, not a "texture handle". A blur takes an image and returns an image. A
blend takes two and returns one. Noise takes none and returns one.

Because they all speak one language, any output plugs into any input and the
result is always defined. There is no type system to enforce, no compatibility
matrix, no error state for "you cannot connect those". That single constraint
is what makes a node editor tractable in a few hundred lines instead of a few
thousand.

Images are `Float32Array`s rather than clamped bytes. An operation halfway down
a chain can push values past 1.0 and a later one can bring them back without
the detail having been destroyed in between. Clamping happens exactly once, at
the very end, when pixels are handed to a screen.

## Why the sliders feel attached to the picture

Each result is cached against a fingerprint of everything that could change it:
the box's type, its settings, the size requested, and — recursively — the
fingerprints of its inputs.

Drag a slider near the end of a chain and only the boxes after it recompute.
The expensive fog at the start is reused untouched. On the Marble example that
is measured at **5 boxes of 7 redrawn in 30ms**, against 165ms for the whole
graph cold.

While a slider is actually moving it renders at half resolution and switches
back to full when you let go. The two together are the difference between a
control that feels connected to the image and one that feels like a form.

## Layout

```
engine.js     the node types and the evaluator — no DOM, runs under node
presets.js    the six examples, plus the auto-layout that positions them
index.html    the editor: dragging, wiring, panning, exporting
```

Nodes are real DOM elements; only the wires are drawn on a canvas. Ports then
get hover states and generous touch targets for free, rather than me
reimplementing hit-testing and getting it subtly wrong on phones.

Positions are never written down in a preset. They are computed from the shape
of the graph, so an example cannot load looking like spaghetti — and the "Tidy
up" button is the same function called again.

## Four things found by rendering it and looking at it

- The knob labelled **Contrast** was applying a gamma curve. Turning it up
  *brightened* the field (mean 0.501 → 0.587) rather than spreading it, which
  is the opposite of what the label promised. It now pushes values away from
  mid-grey.
- Auto-layout stacked nodes 132px apart when a node is 150px tall, so two
  sources in the same column overlapped each other.
- The empty-state hint carried `display: grid`, which beats the `[hidden]`
  attribute, so it painted straight through the nodes.
- On a phone the shared shell pinned everything to one viewport height and
  clipped every panel to a sliver.

Every one of those was working code. None would have failed a test.

## What it does not do

**No GPU.** This is plain JavaScript on one core — no WebGL, no shaders. That
is a deliberate trade: it runs everywhere, including phones and locked-down
work laptops, and it is a few hundred lines rather than a few thousand. The
cost is that a 2048×2048 export takes a second or two instead of being
instant.

**No animation, no time.** Every box is a pure function of its inputs. Adding a
time input would make the whole thing a video tool and roughly triple it.

**No custom expressions.** There is no node where you type maths. It would be
the most powerful box by far and would also turn a thing anyone can poke at
into a programming language.

## Tests

`node tests/run.mjs loom` — 29 of them. The interesting ones:

- every node type returns an image of exactly the size requested, with no
  non-finite pixel, for every one of its default settings
- noise is actually *smooth* — no two adjacent samples differ by more than 0.1,
  which is the entire reason for gradient noise over random values
- blend modes match their algebra (`multiply(0.5, 0.5) === 0.25`)
- connecting a cycle is refused rather than hanging the evaluator
- **the cache recomputes exactly what changed**: cold is 4 of 4, unchanged is 0
  of 4, and touching the last box before the output is 2 of 4
- a graph survives a round trip through a URL and renders to identical pixels

# Mohamed Sucule, interfaces designed and built

I design and build interfaces people can feel. Four years shipping web applications at Capgemini (Software
Engineer, SC cleared) and SynchrTrade, in React and TypeScript. Birmingham, UK.

This repository is my portfolio. The site shows fifteen projects I designed and built, and
every one of them runs in the browser.

**[Portfolio](https://mohamed-sucule.github.io/Projects/)** ·
**[CV (PDF)](https://mohamed-sucule.github.io/Projects/cv/Mohamed-Sucule-CV.pdf)** ·
**[LinkedIn](https://www.linkedin.com/in/mohamed-sucule-bb8747439)** ·
**[mohamedsucule@gmail.com](mailto:mohamedsucule@gmail.com)**

| | |
|---|---|
| **The night** | [Ember](#ember) · [Your Place](#your-place) · [Flurdle](#flurdle) · [The Lamplighter](#the-lamplighter) · [Nightshift](#nightshift) · [The Room](#the-room) |
| **Morning** | [OKLCH Studio](#oklch-studio) · [Covers](#covers) · [Front Desk](#front-desk) |
| **Small hours** | [Mercury, Islandsmith and Beat Lab](#small-hours), three sketches |
| **Under the surface** | [Cells](#cells), a spreadsheet written from scratch · [Diff Forge and Regex Lab](#tools-for-engineers) |

## The front page

The site is one long page that runs from 17:30 to 08:00. The creative work comes out after dark (a game, map
posters, a daily puzzle site, a story told by scrolling, a horror story, a murder mystery and a few sketches)
and the product work at first light, and the sky behind the page is drawn from the scroll position: the sun
sets, a storm passes at half past nine, the stars come out, and it gets light again for the tools, the products
and the part about me. The clips are recorded from the real apps by
[`assets/media/record.mjs`](assets/media/record.mjs) and play only while they are on screen.

A flock of starlings keeps the same hours ([`assets/flock.js`](assets/flock.js)). When you land it is swirling
over the sunset, each bird keeping to its seven nearest neighbours, the way real murmurations are thought to hold
together. As you scroll into the night it pours down, some of it onto a wire strung along the bottom of the
screen, the rest out of sight below it, and at first light it leaves. The wire is also the
index: each hour of the night is a bird on it, and the one you pick flies ahead to its scene and stands on the
scene's clock while the page catches up. On a phone the index opens from the top bar instead.

The clips, the stars, the rain and the birds all stop when the motion button is pressed or the system asks for
reduced motion. The sky and the flock still follow the scroll bar, standing still.

## Creative work

Pieces where the interface is the experience. None of them has an image or a sound file of its own: every
shadow, sky and note is drawn or synthesised in the browser.

### Ember

**[Ember](play/ember/)** is an action game in the dark. Your flame is your life and your light: take a hit and
it burns lower, and the dark comes closer. Three acts, each generated from a seed, three bosses and nine
ash-stones that answer the question on the title screen: who put out the Beacon?

The light is recomputed every frame as a visibility polygon, so every wall and pillar casts a real shadow. The
bosses are generator functions, so an attack reads like a script. The score is drums, bass, choir and bells,
synthesised live with Web Audio. It plays on a keyboard, a touch screen or a gamepad. Its tests hold it to four
things:

- **Nothing hurts you without warning.** Every blow is drawn on the floor at least 0.3 s before it lands. The
  tests play the whole game three times and check every attack, every shot and every hit against that.
- **It can be finished.** An autopilot plays from the first room to the ending, beating each boss through each
  of its phases in order and finding all nine ash-stones.
- **Nobody walks through walls.** Throughout those runs, nobody (you or an enemy) ends up inside a wall.
- **Every boon does what its card says.**

A 40-seed sweep caught 4 runs that never finished: the last enemy and the player were pinned against pillars on
opposite sides, each walking straight at the other, forever. Enemies now walk a shortest-path map of the room
whenever there is no clear line. [Full write-up](play/ember/README.md).

### The Lamplighter

**[The Lamplighter](apps/lamplighter/)** is a lighthouse keeper's last winter, told in five minutes while the
sun goes down, the gale gets up, the rain comes sideways and the light keeps turning. The sky, the sea, the
rock, the tower, the rain, the beam and the foghorn are all made in code.

**Scrolling is time, not travel.** Almost every scroll-driven page moves a camera. Here the scroll position is
the hour of the night, and the sun's height, the sky's colour, the wind, the rain and the state of the sea are
all functions of that one number. The words are pinned to the middle of the frame and cross-fade, because the
view should stay where it is while the night changes around it.

**Two clocks, kept apart.** The reader's clock is the scroll bar. The lighthouse's is wall time: the beam turns
once every 11.2 seconds whether or not anybody is reading, so the place goes on existing when you stop. The test
pins it by the shape of the function: `assert.equal(beam.length, 1)`, because it takes seconds and there is
nowhere to pass a scroll value. [Full write-up](apps/lamplighter/README.md).

### Nightshift

**[Nightshift](apps/nightshift/)** is a short horror story, told as a coastal watch log from the night of
14 November 1987. It opens with the weather and the shipping, and it does not stay there. There is no video, no
game and nothing to play: you scroll, and the page reads you scrolling. The page is deliberately boring, because
a dark theme and a flickering serif tell a reader what kind of thing they are looking at in the first half
second. [Full write-up](apps/nightshift/README.md), which spoils it, so read the story first.

### The Room

**[The Room](apps/room/)** is a locked-room murder. Edmund Harkness is dead at his desk, the door was locked from
the inside and the key was in his pocket. Nineteen things to look at, four people to question, five
contradictions hidden among them, and nothing anywhere that is a multiple-choice question. The case is data:
every piece of evidence and every word anybody says gives a value to a plain claim about the night, and the
notebook sets two that disagree facing each other, with BUT in between. [Full write-up](apps/room/README.md).

### Small hours

Three sketches, each one idea taken as far as it will go. **[Mercury](apps/mercury/)** is a sheet of liquid
metal under a sunset sky, with no 3D model and no texture: every pixel is worked out on the graphics card, sixty
times a second. **[Islandsmith](play/island/)** grows a coastline, mountains, forests, rivers and a name from a
single number. **[Beat Lab](play/beats/)** is a drum machine with no sound files in it: every kick and snare is
synthesised as it plays.

## Published on its own

### Flurdle

**[Flurdle](https://flurdle.com/)** is a daily puzzle site I launched on its own domain. Four puzzles a day: a
wildfire to hold (Fireline), a riddle with unmarked glasses, an orchard to plant by logic alone and five glasses
to pour by eye. In Fireline every number on the map is a countdown to the flames, and you cut firebreaks before
the fire gets there. Every fire is generated, and an exact constraint solver proves the best possible score, so
the best line you are measured against is the best there is. Today's four are free for everyone; Flurdle Plus
opens every day before today. Its code is not in this repository: the clip on the front page is recorded from
the live site. **[Play today's puzzles](https://flurdle.com/)** ·
[the case study: designing Fireline](https://mohamed-sucule.github.io/Projects/writing/designing-fireline/)

## Products

Software a business would use, designed around the moment it is needed most.

### Your Place

**[Your Place](your-place/)** is any place on Earth as a poster. Type a town, a street or an address, pick a
style and download a file ready to print, drawn in the browser from OpenStreetMap. The map engine is written
from scratch: vector tiles decoded into typed arrays, painted in a Web Worker on an `OffscreenCanvas`, and the
same geometry written out as SVG for print. Two performance fixes took the first poster from 41.7 s to 0.39 s.
**[Make one](https://mohamed-sucule.github.io/Projects/your-place/)** ·
[how it was made fast](https://mohamed-sucule.github.io/Projects/writing/fast-map-posters/) ·
[README](your-place/README.md)

### Covers

**[Covers](apps/covers/)** is a restaurant floor and booking system. You arrive at **19:42 on a Saturday**:
thirty-one bookings are in the book, eleven parties are eating, one is twenty-five minutes late and not
answering, and there is a double-booking on table 2 to sort out before half past eight. Every table-management
demo opens on an empty grid, and an empty restaurant tells nobody whether the system is any good.

Drag a party onto a table and it tells you whether they fit, and when they don't, why not and what to do
instead: `Table 1 seats 2. This is a party of 6. → 30 is free at 20:30`. The rules live in a module with no DOM
in it, and every refusal is a sentence a head waiter could say out loud. When the answer is no, it searches the
night for a rearrangement that makes it a yes, never moving somebody who has already sat down. Open it in two
windows and they stay in step, because a restaurant has more than one screen.

**The one conflict it ships with was not planted.** The night was hand-written to look fine, and the rules found
it. [Full write-up](apps/covers/README.md).

### Front Desk

**[Front Desk](apps/frontdesk/)** starts from a sentence a restaurant owner might say: "we miss calls during
service". It is an AI phone receptionist that books straight into the Covers table plan, offers the nearest free
times, tells the kitchen about allergies, and hands over to a person when it should. It understood 75 of 82 new
phrasings first time, and 400 random callers never double-booked a table. It runs entirely in the browser, and
nothing typed or said into it is sent anywhere.

- **The right tool for the job, not the biggest model.** Where a purpose-built parser or a rule is faster,
  cheaper, testable and can't make things up, it does the work. On-device speech recognition and sentence
  embeddings handle what those can't: listening, and understanding meaning.
- **Measured on questions it never saw.** Its held-out test set was written after it was built and run once. The
  first-run score is recorded in the code and never edited.
- **Safe when unsure.** If it cannot follow three things in a row, it offers a call back instead of looping.

### OKLCH Studio

**[OKLCH Studio](projects/oklch-studio/)** builds a colour palette in a perceptual colour space, so a step down a
ramp is the same visible step in every colour family. Colours with no sRGB equivalent are mapped honestly, each
marked with what it lost, and every pair is checked for contrast against WCAG 2.1 and APCA, with a preview of real
interface in light and dark. [README](projects/oklch-studio/README.md).

## Under the surface

The engineering underneath, for engineers. Cells and Your Place are React 19 and TypeScript in strict mode, with
Vite, ESLint, Vitest and Playwright, and each has its own CI. The end-to-end tests run on a desktop and a phone
against the production build, with axe.

### Cells

**[Cells](cells/)** is a spreadsheet, written from scratch. Its formula engine is a hand-written lexer and Pratt
parser with 116 functions and Excel's rules for blanks, text, errors and dates. A dependency index and Tarjan's
algorithm recalculate only what a change touches and catch circular references. The grid holds 1,048,576 rows,
scrolls past the browser's height limit, takes Excel's keyboard, lets you point at cells while typing a formula,
and is an ARIA grid a screen reader can follow to the last row. Two tabs edit the same sheet live. Profiling took
a 200,001-cell recalculation from 681 ms to 133, and a property test checks every cell against a plain evaluator
after any sequence of edits.
**[Open it](https://mohamed-sucule.github.io/Projects/cells/)** ·
[how it was made fast](https://mohamed-sucule.github.io/Projects/writing/recalculating-a-spreadsheet/) ·
[README](cells/README.md)

### Tools for engineers

The screens engineers fight with every day, rebuilt around the moment they usually leave you on your own. Each
opens with a plain-English briefing of what it is and why it matters, kept in one file,
[`shared/briefings.js`](shared/briefings.js), so two copies of an explanation can't drift apart.

| | |
|---|---|
| **[Diff Forge](projects/diff-forge/)** | The merge conflict, rebuilt as a choice you can read, on Myers diff, patience diff and a three-way merge written from scratch. |
| **[Regex Lab](projects/regex-lab/)** | A search pattern compiled into an automaton you can watch run, with a linear-time engine and a backtracker side by side, including the kind of pattern that quietly takes a website down. |

Each has its own README covering the design decisions, the algorithms and, deliberately, what it does **not**
do.

## How the site is held together

- **The night is checked.** [`tests/front.test.mjs`](tests/front.test.mjs) fails if a project in the lineup has
  no place on the front page, if the scenes, the index and the sky in [`assets/night.js`](assets/night.js)
  disagree about any hour, if a recording is missing or over 1 MB, or if the CV counts different projects from
  the site. [`tests/flock.test.mjs`](tests/flock.test.mjs) flies the flock through the night without a browser:
  it must hold together without collapsing, be down before the night scenes, come back when you scroll up,
  have gone by morning, stay still with the motion off, and part for a falcon.
- **Every page is checked for accessibility.** [`tests/a11y/scan.mjs`](tests/a11y/scan.mjs) serves the site,
  opens every page in Chromium in light and dark mode, and fails CI on any serious or critical axe finding.
- **Every page meets the same baseline** of doctype, language, charset, viewport, description, social card,
  working internal links and unique ids ([`tests/pages.test.mjs`](tests/pages.test.mjs)).
- **Every piece keeps its own look.** The front page has its own stylesheet,
  [`assets/night.css`](assets/night.css); each project was designed as a piece of its own and keeps its style.
- **The poster apps share code instead of copying it.** Your Place is an npm workspace beside
  [`packages/poster-kit`](packages/poster-kit/): undo and redo, poster sizes, typefaces, place search and the
  search box are written and tested once, and CI checks every app that uses it whenever any of it changes.
- **The CV is built from a web page** ([`cv/`](cv/)), so the PDF and the page never disagree, and its text is
  real text that screening software can read.

## How it's built

Everything but the React apps is plain HTML, CSS and JavaScript, with no framework and no build step for
visitors. Cells and Your Place are React and TypeScript with a Vite build, because that is what most product
teams use and it is worth showing the same care in that stack. Each keeps its own `package.json`, lint, types,
unit tests (Vitest) and end-to-end tests (Playwright), run by [`cells.yml`](.github/workflows/cells.yml) and
[`your-place.yml`](.github/workflows/your-place.yml). The site's deploy builds them into `/cells/` and
`/your-place/`.

**The rules and the screen are kept apart.** Every project here splits into a pure module (the rules or the
algorithm, with no DOM, testable from a terminal) and the interface. The module has to be *correct*; the
interface has to be *understood*. Different jobs.

```
index.html                the front page, its sky running from 17:30 to 08:00
assets/night.css          its look
assets/night.js           the sky, the clock and the index, all following the scroll bar
assets/flock.js           the starlings: the murmuration, the night on the wire, and the bird you send ahead
assets/media/record.mjs   records the front page's clips from the real apps
shared/atlas.js           the catalogue: every page in the repo, and the fifteen the site shows
shared/navigator.js       ⌘K on every page: BM25 search over the lineup (search.js)
cells/                    React + TypeScript: the formula engine, the grid, persistence and sync
your-place/               React + TypeScript: the map engine, the worker and the poster UI
play/ember/
  engine.js               map, fighting, enemies, bosses, autopilot — DOM-free
  render.js               tiles, fire, the dark and the shadows every wall casts
  audio.js                the score and every noise, synthesised live
apps/lamplighter/
  scene.js                the story, and every function that says what the night is doing
apps/covers/
  schedule.js             the rules: turn times, clashes, and why something is a no
  optimise.js             turning a no into a yes, and re-planning the night
  floor.js · plan.js      the room, what can join what, and where the chairs go
apps/frontdesk/           an engine, its held-out evaluation, and the interface
projects/<tool>/
  engine.js               the algorithm, pure and DOM-free
  index.html              the interface
  README.md               the design problem, and the limits
tests/run.mjs             the site's test suite: no framework, no install
```

```bash
npx http-server        # the pages use ES modules, so they need a server
node tests/run.mjs     # run the tests
```

Over 850 tests run in CI before anything here is published, on top of each React app's own unit and end-to-end
suites.

### Also in this repository

[Tally](tally/) is a full AI application with a Python backend: it reads supplier contracts and the accounts,
answers questions with Claude using tools and checked citations, and audits every invoice against the contract.
It calls a paid API, so it is not hosted publicly; it runs locally or in Docker with one command. Earlier
experiments that are no longer on the site also stay here, each with its own README and tests.

## How I work

**Looking at it beats testing it.** Every screen here was rendered and inspected after each change, which is how
these got caught:

- The Lamplighter drew a lighthouse on a laptop and a **chimney** on a phone, nineteen times as tall as it was
  wide, because the tower's width came from the viewport's width and its height from the viewport's height.
- Covers' floor plan drew eight chairs round two joined tables that the scheduler would happily sell to nine
  people. A test now asserts that the drawing and the rules agree.
- A page was 516 pixels wide on a 390-pixel phone, because a `1fr` grid column's smallest size is its longest
  unbreakable line. `minmax(0, 1fr)` and it behaves.

Every one of those was *technically working code*, and no unit test would have flagged it.

**But tests catch what looking can't.** The suite asserts properties rather than pixels: every Cells cell agrees
with a plain evaluator after any sequence of edits; the regex engine agrees with the platform's own `RegExp`;
both diff algorithms' edit scripts rebuild both inputs across 400 random pairs each; and Ember's tests play the
whole game and fail if any blow lands with less than 0.3 s of warning.

**The words are half of it.** `Table 1 seats 2. This is a party of 6. → 30 is free at 20:30` teaches a booking
system faster than a manual would. Deciding what a thing says, and what it refuses to say, is part of building
it.

---

The commit history is the full record.

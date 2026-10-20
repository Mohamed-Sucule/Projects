# Mohamed Sucule, frontend engineer

React, TypeScript, accessibility and performance. Four years shipping web applications at Capgemini
(Software Engineer, SC cleared) and SynchrTrade. Birmingham, UK.

This repository is my portfolio. The site shows twelve projects, and every one of them runs in the browser.

**[Portfolio](https://mohamed-sucule.github.io/Projects/)** ·
**[CV (PDF)](https://mohamed-sucule.github.io/Projects/cv/Mohamed-Sucule-CV.pdf)** ·
**[LinkedIn](https://www.linkedin.com/in/mohamed-sucule-bb8747439)** ·
**[mohamedsucule@gmail.com](mailto:mohamedsucule@gmail.com)**

| | |
|---|---|
| **Selected work** | [Cells](#cells), a spreadsheet written from scratch · [Your Place](#your-place), any place on Earth as a map poster |
| **Creative work** | [Ember](#ember), an action game in the dark · [The Lamplighter](#the-lamplighter), a story told by scrolling |
| **Products** | [Covers](#covers), a restaurant floor and booking system · [Front Desk, Claims Desk and Call Coach](#three-ai-products), three AI products |
| **Tools for engineers** | [Trace Explorer, Diff Forge, OKLCH Studio and Regex Lab](#tools-for-engineers) |

Each project also has a case study on the site, at `work/<id>/`.

## Selected work

Both are React 19 and TypeScript in strict mode, with Vite, ESLint, Vitest and Playwright, and each has its own
CI. The end-to-end tests run on a desktop and a phone against the production build, with axe.

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

### Your Place

**[Your Place](your-place/)** is any place on Earth as a poster. Type a town, a street or an address, pick a
style and download a file ready to print, drawn in the browser from OpenStreetMap. The map engine is written
from scratch: vector tiles decoded into typed arrays, painted in a Web Worker on an `OffscreenCanvas`, and the
same geometry written out as SVG for print. Two performance fixes took the first poster from 41.7 s to 0.39 s.
**[Make one](https://mohamed-sucule.github.io/Projects/your-place/)** ·
[how it was made fast](https://mohamed-sucule.github.io/Projects/writing/fast-map-posters/) ·
[README](your-place/README.md)

## Creative work

Two pieces where the interface is the experience. Neither has an image or a sound file.

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

## Products

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

### Three AI products

These start from a sentence somebody at work might say, and end as working software. Each runs entirely in the
browser, and nothing typed or said into it is sent anywhere. The businesses are invented; the software is not.

| | The brief | What it is | Measured |
|---|---|---|---|
| **[Front Desk](apps/frontdesk/)** | "We miss calls during service." | An AI phone receptionist that books straight into the Covers table plan, offers the nearest free times, tells the kitchen about allergies, and hands over to a person when it should. | 75 of 82 new phrasings understood first time; 400 random callers, no double-bookings |
| **[Claims Desk](apps/claims/)** | "Our handlers spend their day retyping claims." | Reads an insurance claim (email, scanned form, invoice) with OCR in the browser, checks it against the policy and itself, and recommends approve, decline or refer, with evidence for every line. | 11 of 11 fields read from each scan; on 180 smudged scans a misread only ever sends a claim to a person |
| **[Call Coach](apps/callcoach/)** | "Our reps lose deals on the same objections." | A live assistant for sales calls: the battlecard on screen the moment a prospect objects, then MEDDICC notes, a CRM record and the follow-up email, all from what was said. | 27 of 28 new lines tagged exactly right, first time; every quote in its notes checked against the call |

The same few rules apply to all three:

- **The right tool for the job, not the biggest model.** Where a purpose-built parser, a search index or a rule
  is faster, cheaper, testable and can't make things up, it does the work. The on-device models (speech
  recognition, sentence embeddings, OCR) handle what those can't: listening, understanding meaning, reading a
  scan.
- **Measured on questions it never saw.** Each has a held-out test set, written after it was built and run
  once. The first-run score is recorded in the code and never edited, even when it's bad.
- **Safe when unsure.** The receptionist hands over to a person, and the claims desk refers anything it can't
  read.

## Tools for engineers

The screens engineers fight with every day, rebuilt around the moment they usually leave you on your own. Each
opens with a plain-English briefing of what it is and why it matters, kept in one file,
[`shared/briefings.js`](shared/briefings.js), so two copies of an explanation can't drift apart.

| | |
|---|---|
| **[Trace Explorer](projects/trace-explorer/)** | Where a slow web request actually spent its time: a span waterfall with the critical path marked, and the findings written in sentences, each with the share of the trace it explains. |
| **[Diff Forge](projects/diff-forge/)** | The merge conflict, rebuilt as a choice you can read, on Myers diff, patience diff and a three-way merge written from scratch. |
| **[OKLCH Studio](projects/oklch-studio/)** | A colour palette built in a perceptual colour space, with honest gamut mapping and every pair checked against WCAG 2.1 and APCA. |
| **[Regex Lab](projects/regex-lab/)** | A search pattern compiled into an automaton you can watch run, with a linear-time engine and a backtracker side by side, including the kind of pattern that quietly takes a website down. |

Each has its own README covering the design decisions, the algorithms and, deliberately, what it does **not**
do.

## How the site is held together

- **Every claim is written once.** [`work/projects.js`](work/projects.js) holds everything the site says about
  the twelve projects, and [`work/build.mjs`](work/build.mjs) writes both the case studies and the front page's
  project sections from it. The tests fail if a page has drifted from the data, if a case study quotes a test
  count that is not the number of tests its file ran, or if a measured line disagrees with the product's own
  evaluation.
- **Every page is checked for accessibility.** [`tests/a11y/scan.mjs`](tests/a11y/scan.mjs) serves the site,
  opens every page in Chromium in light and dark mode, and fails CI on any serious or critical axe finding.
- **Every page meets the same baseline** of doctype, language, charset, viewport, description, social card,
  working internal links and unique ids ([`tests/pages.test.mjs`](tests/pages.test.mjs)).
- **One design system.** The front page and every case study are set from
  [`assets/site.css`](assets/site.css), in the same typefaces as the two React apps.
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
index.html                the front page; its project sections are written by work/build.mjs
assets/site.css           the design system for the front page and the case studies
work/projects.js          everything the site says about each project
work/build.mjs            writes work/<id>/ and the front page's project sections
shared/atlas.js           the catalogue: every page in the repo, and the twelve the site shows
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
apps/frontdesk/ claims/ callcoach/
                          each an engine, its held-out evaluation, and the interface
projects/<tool>/
  engine.js               the algorithm, pure and DOM-free
  index.html              the interface
  README.md               the design problem, and the limits
tests/run.mjs             the site's test suite: no framework, no install
```

```bash
npx http-server        # the pages use ES modules, so they need a server
node tests/run.mjs     # run the tests
node work/build.mjs    # after editing work/projects.js
```

Over 900 tests run in CI before anything here is published, on top of each React app's own unit and end-to-end
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

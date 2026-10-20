/* work/projects.js — what the site says about each of the twelve projects.

   One record per project in the lineup (shared/atlas.js), and everything the
   site claims about it lives here: the card on the front page, and the case
   study at work/<id>/. work/build.mjs writes both from this file, so a number
   changed here changes everywhere it is quoted, and tests/work.test.mjs fails
   if a page has drifted from it.

   Every figure is one the project measures or a test holds it to. `tests`
   names the project's test file in the site's suite; tests/run.mjs checks that
   any count of tests quoted below is the number that file actually ran. */

export const REPO = 'https://github.com/Mohamed-Sucule/Projects';
const doc = (path) => `${REPO}/blob/main/${path}`;
const tree = (path) => `${REPO}/tree/main/${path}`;

export const PROJECTS = {
  /* ── selected work ──────────────────────────────────────────────────── */
  cells: {
    alt: 'Cells with a year of shop orders open, a SUMIFS formula being typed, and each of its references outlined on the grid in its own colour',
    line: 'A spreadsheet, written from scratch.',
    stack: ['React 19', 'TypeScript (strict)', 'Vite', 'Virtualised ARIA grid', 'Vitest', 'fast-check', 'Playwright'],
    intro: 'A spreadsheet is the most used app in any office, and one of the hardest interfaces to build: a million rows, a formula language, and keys that people’s hands already know. Cells is one written from nothing, with a formula engine, a grid and live editing across tabs.',
    hard: [
      'A formula engine of my own: a Pratt parser, 116 functions with Excel’s rules for blanks, text, errors and dates, and a dependency graph that recalculates only what changed and catches circular references.',
      'A grid of 1,048,576 rows that scrolls past the browser’s height limit, works the way Excel does from the keyboard, lets you point at cells while typing a formula, and that a screen reader can follow to the last row.',
      'Profiling took a 100,000-formula recalculation from 681 ms to 133: the cost was in maps keyed by numbers too big for V8’s small integers, not in the formulas.',
    ],
    proof: [['133 ms', '200,001 cells recalculated, down from 681'], ['209', 'unit tests, one checking every cell against a plain evaluator'], ['16', 'end-to-end tests, desktop and phone, with axe']],
    decision: ['Test the engine against a slower, obviously correct one',
      'A recalculation that skips one dependent cell does not throw; it leaves a wrong number on screen. So a property test makes thousands of random edits and, after each one, checks every cell against a plain evaluator that recalculates everything from scratch. The fast engine has to agree with the slow one, always.'],
    links: [['How I made it fast', 'writing/recalculating-a-spreadsheet/'], ['README', doc('cells/README.md')], ['Source', tree('cells')]],
    card: { text: 'A spreadsheet written from scratch: 116 functions, a million rows and Excel’s keyboard.', label: 'React · TypeScript' },
  },
  'your-place': {
    alt: 'Your Place making a poster of Zürich in its Noir and gold style, with the place search, the styles and the download beside it',
    line: 'Any place on Earth, as a print-ready map poster.',
    stack: ['React 19', 'TypeScript (strict)', 'Web Workers', 'OffscreenCanvas', 'SVG', 'Vitest', 'Playwright'],
    intro: 'A poster of a place that matters is a favourite gift, and the free ways to make one are command-line scripts. Type a town, a street or an address, pick a style, and download a file ready to print, drawn in the browser from OpenStreetMap.',
    hard: [
      'A map engine written from scratch: vector tiles are decoded into typed arrays and painted in a Web Worker on an OffscreenCanvas, so dragging the map never waits for drawing.',
      'Profiling took the first poster from 41.7 seconds to 0.39: a third of the tiles showed the same streets, and one Chromium path call grew with the path it was closing.',
      'One geometry pass writes both the canvas and the SVG, so the 300 dpi print matches the preview line for line.',
    ],
    proof: [['0.39 s', 'first poster, down from 41.7 s'], ['62', 'unit tests'], ['12 × 2', 'end-to-end scenarios, desktop and phone']],
    decision: ['Draw off the main thread',
      'A city at print resolution is hundreds of thousands of path segments. Drawn on the main thread, every drag of the map would freeze the page while it painted. In a Web Worker on an OffscreenCanvas, the interface stays responsive and the poster arrives when it is ready.'],
    links: [['How I made it fast', 'writing/fast-map-posters/'], ['README', doc('your-place/README.md')], ['Source', tree('your-place')]],
    card: { text: 'Any place on Earth as a print-ready poster, drawn in a Web Worker from OpenStreetMap.', label: 'React · TypeScript' },
  },

  /* ── creative work ──────────────────────────────────────────────────── */
  ember: {
    tests: 'tests/ember.test.mjs',
    alt: 'Ember mid-fight: the flame lighting a stone hall, braziers burning at either side, and the Warden’s health bar along the bottom',
    line: 'An action game in the dark, where your flame is your light and your life.',
    stack: ['Canvas 2D', 'Web Audio', 'Generator functions', 'Gamepad API', 'Touch'],
    intro: 'Three acts, three bosses and nine ash-stones, in a kingdom where the only light is the flame you carry. Take a hit and it burns lower, and the dark comes closer. There is no engine and no image or sound file: every room, shadow and note of the score is made in the browser as you play.',
    hard: [
      'The light is geometry, not a picture: rays go from the flame to every wall corner in reach, and the shape they make is cut out of the dark on every frame, so shadows swing as you move.',
      'Every run is a new map: a tree of rooms grown on a 5 × 4 grid, with the boss in the deepest dead end. The three bosses are generator functions, so an attack reads like a script: draw the circle, wait 0.8 s, land it.',
      'Fair by construction: the tests play the whole game and fail if any blow lands less than 0.3 s after it was first shown. An autopilot plays from the first room to the ending on every seed.',
    ],
    proof: [['0.38 s', 'the least warning any attack gives, against a rule of 0.3'], ['40', 'generated maps checked, every room reachable'], ['20', 'tests, with an autopilot that plays to the ending']],
    decision: ['Found by playing it, fixed for every seed',
      'A sweep of 40 seeds found 4 runs that never finished: the last enemy and the player were pinned against pillars on opposite sides, each walking straight at the other, forever. Enemies now follow a shortest-path map of the room whenever something is in the way, and the sweep runs with the tests.'],
    links: [['How it works', doc('play/ember/README.md')], ['Source', tree('play/ember')]],
    card: { text: 'An action game in the dark, lit and scored live in the browser.', label: 'Canvas · Web Audio' },
  },
  lamplighter: {
    tests: 'tests/lamplighter.test.mjs',
    alt: 'The Lamplighter at dusk: a lighthouse on a rock against a red sky, its beam out over the sea, and the first lines of the story',
    line: 'One night at a lighthouse, told by scrolling and drawn as you read.',
    stack: ['Canvas 2D', 'Scroll-linked animation', 'Web Audio', 'No image files'],
    intro: 'A lighthouse keeper’s last winter, told in five minutes while the sun goes down, the gale gets up, the rain comes sideways and the light keeps turning. There is not an image or a sound file in its folder: the sky, the sea, the tower, the rain, the beam and the foghorn are all made in code.',
    hard: [
      'Scrolling is time, not travel: the scroll position is the hour of the night, and the sun’s height, the colour of the sky, the wind, the rain and the sea are all functions of that one number.',
      'Two clocks, kept apart: the reader’s is the scroll bar, the lighthouse’s is wall time. The beam turns every 11.2 seconds whether or not anybody is reading, so the place goes on existing when you stop.',
      'The words are pinned to the middle of the frame and cross-fade, with opacities that always add up to one, so the view stays where it is while the night changes around it.',
    ],
    proof: [['0', 'image or sound files: all of it is drawn or synthesised'], ['11.2 s', 'one turn of the beam, on wall time, not scroll'], ['21', 'tests, from the path of the sun to one chapter readable at a time']],
    decision: ['A lighthouse, not a chimney',
      'Sizing the tower’s width from the viewport width and its height from the viewport height drew a tower three and a half times as tall as it was wide on a laptop and nineteen times on a phone. Everything now comes off one tower height, capped against the viewport width, so a narrow screen gets a smaller lighthouse and more sky.'],
    links: [['How it works', doc('apps/lamplighter/README.md')], ['Source', tree('apps/lamplighter')]],
    card: { text: 'A five-minute story where scrolling is the hour of the night.', label: 'Canvas · Scroll' },
  },

  /* ── products ───────────────────────────────────────────────────────── */
  covers: {
    tests: 'tests/covers.test.mjs',
    alt: 'Covers at 19:42 on a Saturday: the parties due at the door on the left, the floor plan with every table’s party, and the night’s totals along the bottom',
    line: 'A restaurant floor and booking system, opened mid-service.',
    stack: ['JavaScript', 'SVG floor plan', 'Drag and drop', 'Constraint-checked scheduling', 'BroadcastChannel'],
    intro: 'You arrive at 19:42 on a Saturday. Thirty-one bookings are in the book, eleven parties are eating, one is twenty-five minutes late and there is a double-booking on table 2 to sort out before half past eight. Every booking demo opens on an empty grid; an empty restaurant tells you nothing about whether the system is any good.',
    hard: [
      'Drag a party onto a table and it says whether they fit, and when they do not, why not and what to do instead: “Table 1 seats 2. This is a party of 6. → 30 is free at 20:30.”',
      'When the answer is no, it searches the night for a rearrangement that makes it a yes, never moving anybody who has already sat down, and shows what a re-plan buys before anything moves.',
      'Turn times, the fifteen minutes to re-lay a table, and tables that join the way the room allows. Open it in two windows and they stay in step, because a restaurant has more than one screen.',
    ],
    proof: [['67', 'tests on the rules, the planner and the floor plan'], ['31', 'bookings in the night it opens on'], ['0', 'refusals without a reason, checked by a test']],
    decision: ['The refusal is the product',
      'The rules live in a module with no interface code in it, every question goes through them, and the screen never has an opinion of its own about the room. That is also how the one conflict it ships with was found: the night was hand-written to look fine, and the rules found the clash.'],
    links: [['How it works', doc('apps/covers/README.md')], ['Source', tree('apps/covers')]],
    card: { text: 'A restaurant’s floor plan and bookings, opened mid-service on a Saturday with a double booking to sort out.', measure: 'Explains every refusal in a sentence a head waiter could say', label: 'Product UI · Drag and drop' },
  },
  frontdesk: {
    tests: 'tests/frontdesk.test.mjs',
    alt: 'Front Desk taking a call: the transcript of a caller booking a table, and what it has understood so far, from party size to phone number',
    line: 'An AI phone receptionist that books straight into the table plan.',
    stack: ['On-device speech recognition (Whisper)', 'Purpose-built language parser', 'MiniLM embeddings', 'Web Audio'],
    intro: 'Restaurants miss calls during service, and whoever does answer should be serving. Front Desk answers instead: it understands a booking request, typed or spoken, checks the real table plan in Covers, offers the nearest free times when the one asked for has gone, and hands over to a person when it should.',
    hard: [
      'Asks for one thing at a time, remembers what it has been told, and copes with a caller who changes their mind halfway through a booking.',
      'Writes allergies where the kitchen will see them, and offers a callback rather than looping when it cannot follow three things in a row.',
      'Speech recognition runs on the visitor’s own device; nothing they say leaves the page.',
    ],
    proof: [['75 / 82', 'new phrasings understood first time'], ['400', 'random callers, no double-booking'], ['40', 'tests']],
    decision: ['A purpose-built parser, not a large language model',
      'For one narrow job a parser is fast, costs nothing to run, cannot make up a booking, and every phrasing can be tested. A small on-device model is asked only when the parser finds nothing at all, and even then it only suggests what the caller wants.'],
    links: [['How it works', doc('apps/frontdesk/README.md')], ['Source', tree('apps/frontdesk')]],
    card: { text: 'A phone receptionist that books real tables, with speech recognition on the caller’s own device.', measure: '75 of 82 new phrasings understood first time', label: 'AI product · Speech' },
  },
  claims: {
    tests: 'tests/claims.test.mjs',
    alt: 'Claims Desk with a burst-pipe claim read: the scanned claim form on the left, and the documents read and the checks on the right',
    line: 'Insurance paperwork to a decision, with the evidence for every line.',
    stack: ['Tesseract OCR in WebAssembly', 'Web Worker', 'OCR-tolerant field reader', 'Policy checks'],
    intro: 'Claims handlers spend their day retyping paperwork and checking it by hand. Claims Desk reads a claim (the email, the scanned form and the invoice) in the browser, checks it against the policy and against itself, and recommends approve, decline or refer, linking every check to the field or clause it rests on.',
    hard: [
      'Reads scanned forms and invoices with OCR in a Web Worker, on the visitor’s device, so nothing is uploaded.',
      'Runs up to thirteen checks, each pointing at the evidence it used, and writes the letter to the customer.',
      'Records who approved or overrode the recommendation, because the person signing it off is still the one deciding.',
    ],
    proof: [['11 / 11', 'fields read from each scan'], ['180', 'smudged scans in the tests'], ['13', 'checks, each tied to its evidence']],
    decision: ['A misread can only ever send a claim to a person',
      'Across 180 deliberately smudged scans the tests enforce a rule stricter than any accuracy figure: a misread may refer a claim, but must never pay one that should not be paid or decline one that should not be declined.'],
    links: [['How it works', doc('apps/claims/README.md')], ['Source', tree('apps/claims')]],
    card: { text: 'Reads an insurance claim with OCR in the browser and recommends a decision, with the evidence for each line.', measure: 'A misread only ever sends a claim to a person', label: 'AI product · OCR' },
  },
  callcoach: {
    tests: 'tests/callcoach.test.mjs',
    alt: 'Call Coach during a sales call: the live transcript with each objection tagged, and the coach’s card for the price objection on the right',
    line: 'A live assistant for sales calls, and honest notes afterwards.',
    stack: ['Moment tagger', 'Spoken-number parser', 'MEDDICC notes', 'CRM record', 'Quote checking'],
    intro: 'Reps lose deals on the same objections, and nobody writes the call up properly afterwards. Call Coach listens along: the right answer is on screen the moment a prospect objects, and when the call ends it writes the notes, the CRM record and the follow-up email from what was actually said.',
    hard: [
      'Puts the right battlecard on screen the moment a prospect raises price, timing, a competitor or someone else deciding.',
      'Nudges the rep when they pitch before finding a problem, or do most of the talking.',
      'Writes MEDDICC notes, a CRM record and the follow-up email when the call ends, quoting the prospect’s own words.',
    ],
    proof: [['27 / 28', 'new lines tagged exactly right, first time'], ['17', 'kinds of moment it recognises'], ['16', 'tests']],
    decision: ['Every quote in the notes was actually said',
      'The notes and the follow-up quote the prospect’s own words, and a test checks every quoted line against the call, so the summary cannot put words in anyone’s mouth.'],
    links: [['How it works', doc('apps/callcoach/README.md')], ['Source', tree('apps/callcoach')]],
    card: { text: 'The answer on screen the moment a prospect objects, and the notes and follow-up written when the call ends.', measure: '27 of 28 new lines tagged right first time', label: 'AI product · Sales' },
  },

  /* ── tools for engineers ────────────────────────────────────────────── */
  'trace-explorer': {
    tests: 'tests/trace.test.mjs',
    alt: 'Trace Explorer: a latency histogram, the span waterfall of a slow checkout request, and its findings written in sentences',
    line: 'Where a slow web request actually spent its time, in sentences.',
    stack: ['Span waterfall', 'Critical-path analysis', 'Log-scaled histogram', 'Seeded telemetry'],
    intro: 'Tracing tools are built for the person who already knows what they are looking for: forty coloured bars and a wall of attributes, and the skill is recognising the shape of the problem. Trace Explorer puts that skill in the product. It opens on the worst trace in a sample of 260 across ten services, and says what is wrong in words.',
    hard: [
      'Findings in prose, with a denominator: “30 sequential calls to postgres.SELECT stock, totalling 129.9 ms, 22% of the trace. A single batched query would collapse this to roughly one round trip.”',
      'The critical path is a first-class object: the spans that set the total are outlined, and the path is broken down by service, which is routinely not the service with the biggest bar.',
      'A log-scaled latency histogram you drag across to filter the traces to a band, because a linear axis renders the interesting tail as one pixel.',
    ],
    proof: [['260', 'traces across ten services'], ['6', 'kinds of finding, from N+1 queries to retries'], ['13', 'tests']],
    decision: ['The analyser never sees the answer',
      'The generator injects problems at random, but the analyser only ever sees spans, exactly as it would with real telemetry. A test asserts the property that makes the critical path correct: its segments tile the trace exactly, with no gaps and nothing counted twice.'],
    links: [['How it works', doc('projects/trace-explorer/README.md')], ['Source', tree('projects/trace-explorer')]],
    card: { text: 'A slow request’s spans as a waterfall, with the critical path marked and the findings in sentences.', measure: 'Opens on the worst of 260 traces, and says why', label: 'Observability' },
  },
  'diff-forge': {
    tests: 'tests/diff.test.mjs',
    alt: 'Diff Forge resolving a merge: the base and both branches on the left, a conflict shown side by side in the middle, and the merged result on the right',
    line: 'The merge conflict, rebuilt as a choice you can read.',
    stack: ['Myers diff', 'Patience diff', 'Three-way merge', 'Word-level highlighting'],
    intro: 'Merge conflicts are the most hated screen in software because, at the moment you most need context, the tool gives you the least: markers, no base, and no idea why this region conflicted when the one above merged silently. Diff Forge rebuilds that moment, with Myers diff, patience diff and a three-way merge written from scratch.',
    hard: [
      'Auto-merged regions are shown, not hidden, each labelled with whose change it took, because a merge can be clean and still wrong.',
      'A conflict is a choice, not a text format: both intents side by side with the changed words highlighted, the base quoted underneath, and ours, theirs, both or revert as buttons.',
      'Myers and patience diff run side by side on every keystroke, and a moved block shows how differently the two read the same change.',
    ],
    proof: [['400 × 2', 'random file pairs: each algorithm’s edit script rebuilds both sides'], ['2', 'diff algorithms, compared on every keystroke'], ['15', 'tests']],
    decision: ['Show the merge that went right',
      'Git resolves most regions silently, and silent success is still a decision. Every region it would have merged on its own gets a band saying which side it came from, so reviewing a merge means reviewing all of it, not just the conflicts.'],
    links: [['How it works', doc('projects/diff-forge/README.md')], ['Source', tree('projects/diff-forge')]],
    card: { text: 'The merge-conflict screen rebuilt around the decision, with two diff algorithms written from scratch.', measure: 'Myers and patience diff, written from scratch', label: 'Interaction design' },
  },
  'oklch-studio': {
    tests: 'tests/color.test.mjs',
    alt: 'OKLCH Studio: ramp controls, a palette of five colour families in eleven steps, and the contrast matrix scoring each pair',
    line: 'A colour palette that still passes when someone audits it.',
    stack: ['OKLCH colour space', 'Gamut mapping', 'WCAG 2.1 contrast', 'APCA contrast'],
    intro: 'Most palette tools generate colour in HSL, which lies: yellow and navy can claim the same lightness. Build a ramp that way and the same text colour passes contrast on one accent and fails on the next, and you find out in the accessibility audit after the brand is signed off. OKLCH Studio builds palettes in a perceptual colour space and audits every pair.',
    hard: [
      'Generates in OKLCH, so a step down the ramp is the same perceptual step in every family, and primary-600 and danger-600 behave the same against the same surface.',
      'Says what the gamut cost: colours with no sRGB equivalent are mapped by bisecting chroma at fixed lightness and hue, and every swatch that was mapped is marked with what it lost.',
      'Audits pairs, not colours, against both WCAG 2.1 and APCA, and previews a real fragment of interface built from the tokens, in light and dark.',
    ],
    proof: [['2', 'contrast models on the same palette'], ['Lc 106', 'black on white, matching APCA’s reference'], ['15', 'tests']],
    decision: ['Never clip silently',
      'The usual answer to an out-of-gamut colour is to clip the channels, which quietly shifts the hue and flattens the end of a ramp. Here saturation is given up instead of lightness or hue, and the swatch says so, because a silent clip is a lie about what you designed.'],
    links: [['How it works', doc('projects/oklch-studio/README.md')], ['Source', tree('projects/oklch-studio')]],
    card: { text: 'A palette builder that works in a perceptual colour space and checks every pair for contrast.', measure: 'Every pair checked against WCAG 2.1 and APCA', label: 'Design systems · Accessibility' },
  },
  'regex-lab': {
    tests: 'tests/regex.test.mjs',
    alt: 'Regex Lab running (a|b)*abb: the pattern’s syntax tree, its automaton drawn as a graph, and the backtracker’s log of decisions',
    line: 'A search pattern compiled into a machine you can watch run.',
    stack: ['Recursive-descent parser', 'Thompson NFA', 'Backtracking matcher', 'Subset construction'],
    intro: 'A regular expression is a program people write without ever seeing it run, and its most expensive failure has no symptom while you write it: (a+)+b looks tidy and takes exponential time on a string of a’s. Regex Lab compiles the pattern into an automaton you can watch, and runs it with two engines side by side.',
    hard: [
      'The pattern drawn as a Thompson NFA; scrub the text and the live states light up, so you can point at the exact character where a match died.',
      'A linear-time simulation and a backtracker, the kind JavaScript actually ships, run side by side; on a nested quantifier the backtracker hits its 200,000-step cap while the other barely moves.',
      'Every decision the backtracker made, in order, tied to the slice of pattern responsible, and errors with a caret under the offending character.',
    ],
    proof: [['2', 'matching engines, side by side'], ['200,000', 'steps before the backtracker is stopped'], ['9', 'tests, checked against the browser’s own RegExp']],
    decision: ['Every piece keeps its place in the pattern',
      'Each node of the parsed pattern records where it came from in the source, which is what lets the trace point back at a substring and an error put a caret under the right character. Without it, the most useful thing on screen would be impossible.'],
    links: [['How it works', doc('projects/regex-lab/README.md')], ['Source', tree('projects/regex-lab')]],
    card: { text: 'A regular expression as an automaton you can watch run, including the kind that takes a website down.', measure: 'Catastrophic backtracking, made visible', label: 'Visualisation' },
  },
};

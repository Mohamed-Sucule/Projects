/* atlas/worlds.js — every project in the Portal Atlas, and the evidence behind it.

   The catalogue (shared/atlas.js) already knows every project's title, link and
   one-line pitch, and the navigator and search trust it. This file adds only what
   the Portal Atlas needs on top: which region a project's world is in, the light
   its picture is lit with, the problem it answers, what it is built with, and where
   the proof lives. tests/atlas.test.mjs checks the two lists agree, so a project
   added to the catalogue and forgotten here fails the build instead of quietly
   going missing from the gallery.

   Tally is the one project that is not a static page: it is a Python service, so it
   is not in the catalogue the navigator searches, and it is described in full here. */

import { byId } from '../shared/atlas.js';

export const REPO = 'https://github.com/Mohamed-Sucule/Projects';
const doc = (path) => `${REPO}/blob/main/${path}`;
const tree = (path) => `${REPO}/tree/main/${path}`;

/* Set this once Tally is deployed (render.yaml) and its island gets a Launch button. */
export const TALLY_URL = null;

export const TALLY = {
  id: 'tally', title: 'Tally', href: TALLY_URL, kind: 'ai', depth: 'study', minutes: 8,
  blurb: 'An AI accounts-payable analyst. It reads supplier contracts and the accounts, answers '
       + 'questions with cited sources, audits every invoice against the contract and drafts the '
       + 'dispute emails a person approves.',
  hook: 'Claude reads the contracts; plain code decides what is owed.',
  tags: ['ai', 'llm', 'claude', 'agent', 'tool use', 'rag', 'retrieval', 'sql', 'python', 'fastapi',
         'backend', 'api', 'invoices', 'accounts payable', 'finance', 'audit', 'contracts', 'documents',
         'evals', 'workflow', 'automation', 'human in the loop', 'production', 'serious', 'client work',
         'product', 'business', 'startup', 'impressive', 'best'],
};

/* Regions, in the order a visitor drifts through them. The first is the one a
   founder came for. */
export const REGIONS = [
  { id: 'products', name: 'The Product Archipelago',
    line: 'Software a business could ask for tomorrow: working, measured, and ready to try.' },
  { id: 'models', name: 'The Observatory Reach',
    line: 'How language models really work, built from nothing so every step can be watched.' },
  { id: 'stories', name: 'The Night Isles',
    line: 'Stories that draw themselves. No image files: the sea, the sky and the dread are code.' },
  { id: 'games', name: 'The Playground Reef',
    line: 'Games, from a two-minute one-button flight to a three-act action game in the dark.' },
  { id: 'workshop', name: 'The Workshop Shallows',
    line: 'Small useful things and physical toys, each with the hard part written from scratch.' },
  { id: 'engines', name: 'The Engine Rooms',
    line: 'The invisible parts of software, made visible: regex, query plans, consensus, traces, merges, colour.' },
];

/* palette: [land, rock, light]; the third is the light in the project's picture */
export const WORLDS = [
  /* ── products ─────────────────────────────────────────────────────────── */
  { id: 'your-place', region: 'products', size: 'lg', palette: ['#5b4636', '#2b2f45', '#ffc98e'],
    problem: 'A poster of a place that matters is a favourite gift, but the free tools are command-line scripts and the easy ones charge.',
    tech: ['React 19 + TypeScript (strict)', 'Vite', 'Web Worker + OffscreenCanvas', 'OpenMapTiles vector tiles', 'Canvas + SVG from one geometry walk', 'Vitest + Playwright + axe'],
    evidence: '55 unit tests and 12 end-to-end scenarios on a desktop and a phone, drawn from real OpenStreetMap tiles of Zürich. Measuring took the first poster from 41.7 s to 0.39 s.',
    study: doc('your-place/README.md'), source: tree('your-place'), tests: tree('your-place/tests') },
  { id: 'your-sky', region: 'products', size: 'lg', palette: ['#1d2a4a', '#2b2f45', '#cfdcff'],
    problem: 'A star map of the night you met is a favourite gift, but the shops that sell one charge for it and keep the file.',
    tech: ['React 19 + TypeScript (strict)', 'Vite', 'Astronomy Engine: precession, nutation, the Moon and planets', 'Stereographic projection', 'Canvas + SVG from one scene', 'Vitest + Playwright + axe'],
    evidence: '60 unit tests check the sky against facts: Polaris as high as the latitude, the solstice noon Sun, a sidereal day, real full and new moons, clocks skipped and doubled. 12 end-to-end scenarios on a desktop and a phone.',
    study: doc('your-sky/README.md'), source: tree('your-sky'), tests: tree('your-sky/tests') },
  { id: 'tally', region: 'products', size: 'lg', palette: ['#2f5d55', '#24314f', '#9AE6D0'],
    problem: 'Supplier invoices get paid without anyone checking them against the contract, so overcharges go through.',
    tech: ['Python', 'FastAPI', 'Claude API: tools + structured outputs', 'SQLite FTS5', 'Read-only SQL sandbox', 'Docker'],
    evidence: '23 of 23 planted billing errors found to the penny, no false positives; 20 of 20 SQL attacks blocked. The model evals run once an API key is added.',
    study: doc('tally/README.md'), source: tree('tally'), tests: tree('tally/tests') },
  { id: 'frontdesk', region: 'products', size: 'lg', palette: ['#6b4a3a', '#2a2a44', '#ff8a6b'],
    problem: 'Restaurants miss calls during service, and whoever does answer should be serving.',
    tech: ['Purpose-built language parser', 'Whisper speech recognition, on device', 'MiniLM embeddings', 'Covers table engine', 'Web Audio'],
    evidence: '75 of 82 new phrasings understood first time; 400 random callers, no double-bookings.',
    study: doc('apps/frontdesk/README.md'), tests: doc('tests/frontdesk.test.mjs') },
  { id: 'handbook', region: 'products', size: 'md', palette: ['#4a4f7a', '#262c4a', '#ffd38a'],
    problem: 'Staff ask HR the same questions all day, and an assistant that guesses at policy is worse than none.',
    tech: ['BM25 over every sentence', 'Porter stemmer, written out', 'Concept synonyms', 'On-device embeddings', 'Refusal rules'],
    evidence: '4 answers made up in 164 test questions, 31 of them unanswerable on purpose.',
    study: doc('apps/handbook/README.md'), tests: doc('tests/handbook.test.mjs') },
  { id: 'callcoach', region: 'products', size: 'md', palette: ['#3d5a6b', '#23304a', '#7fd8ff'],
    problem: 'Reps lose deals on the same objections, and nobody writes the call up properly afterwards.',
    tech: ['Moment tagger: 17 kinds', 'Spoken-number parser', 'MEDDICC notes', 'CRM record + follow-up', 'Quote checking'],
    evidence: '27 of 28 new lines tagged exactly right, first time; every quote in its notes checked against the call.',
    study: doc('apps/callcoach/README.md'), tests: doc('tests/callcoach.test.mjs') },
  { id: 'claims', region: 'products', size: 'md', palette: ['#5b5a46', '#2a2d40', '#f3d27a'],
    problem: 'Claims handlers spend their day retyping paperwork and checking it by hand.',
    tech: ['Tesseract OCR in WebAssembly', 'OCR-tolerant field reader', 'Thirteen policy checks', 'Web Worker', 'Human override'],
    evidence: '11 of 11 fields read from each scan; on 180 smudged scans a misread only ever sends a claim to a person.',
    study: doc('apps/claims/README.md'), tests: doc('tests/claims.test.mjs') },
  { id: 'covers', region: 'products', size: 'md', palette: ['#4b5d3e', '#25304a', '#a9f08a'],
    problem: 'A Saturday night of tables, turn times and late parties is a puzzle solved in someone’s head.',
    tech: ['Constraint-checked scheduling', 'Joined tables + turnaround', 'Drag and drop', 'Explains every refusal'],
    evidence: 'Drop a party on a table and it says whether they fit, and if not, why and what to do instead.',
    study: doc('apps/covers/README.md'), tests: doc('tests/covers.test.mjs') },

  /* ── models ───────────────────────────────────────────────────────────── */
  { id: 'attention', region: 'models', size: 'lg', palette: ['#3b4470', '#20284a', '#b7c8ff'],
    problem: 'Everyone talks about attention heads; almost nobody has watched one form.',
    tech: ['Reverse-mode autograd, hand-written', 'Attention-only transformer', 'Adam + cosine schedule', 'Canvas 2D'],
    evidence: 'Drag through training and the induction head appears at the step the loss falls off a cliff.',
    study: doc('apps/attention/README.md'), tests: doc('tests/attention.test.mjs') },
  { id: 'tokens', region: 'models', size: 'sm', palette: ['#5a4a78', '#272a4c', '#e2b8ff'],
    problem: 'Models miscount letters and charge more for Japanese, and the reason, tokenisation, is invisible.',
    tech: ['Byte-level BPE, 240 lines', 'Trains in the page', 'GPT-2 vs GPT-4 pre-tokenisation'],
    evidence: 'Trains on 64,000 characters in under half a second, with 40 tests.',
    study: doc('apps/tokens/README.md'), tests: doc('tests/tokens.test.mjs') },
  { id: 'evals', region: 'models', size: 'md', palette: ['#3f5f6a', '#22304a', '#9AE6D0'],
    problem: '“92% versus 89%” gets shipped as an improvement when it is noise.',
    tech: ['Percentile bootstrap', 'Wilson intervals', 'McNemar exact test', 'Power analysis'],
    evidence: 'Two real parsers on 800 real inputs, graded live, with 44 tests.',
    study: doc('apps/evals/README.md'), tests: doc('tests/evals.test.mjs') },
  { id: 'agents', region: 'models', size: 'md', palette: ['#5d4f3a', '#272b42', '#ffc277'],
    problem: 'The agent loop is easy. The failures that kill it in production are not, and are rarely shown.',
    tech: ['Real tool-use loop', 'Five tools over 300 ledger lines', 'BPE token counts', 'Switchable guards'],
    evidence: 'The agent’s answer is checked against the ledger; 29 tests.',
    study: doc('apps/agents/README.md'), tests: doc('tests/agents.test.mjs') },

  /* ── stories ──────────────────────────────────────────────────────────── */
  { id: 'lamplighter', region: 'stories', size: 'md', palette: ['#3a4a5a', '#1f2840', '#ffe3a1'],
    problem: 'Telling a story with a page that paints itself: the sun sets and the gale rises as you scroll.',
    tech: ['Canvas 2D, no image files', 'Scroll-driven scene', 'Web Audio'],
    evidence: 'There is not an image file in its directory. The sky, the sea and the light are arithmetic.',
    study: doc('apps/lamplighter/README.md'), tests: doc('tests/lamplighter.test.mjs') },
  { id: 'room', region: 'stories', size: 'md', palette: ['#4a3b3b', '#241f33', '#ffb36b'],
    problem: 'Most mystery games are multiple choice in disguise; here you have to find the contradiction yourself.',
    tech: ['Contradiction engine', 'Nineteen clues, four witnesses', 'Canvas 2D'],
    evidence: 'The notebook works out for itself which two statements cannot both be true.',
    study: doc('apps/room/README.md'), tests: doc('tests/room.test.mjs') },
  { id: 'nightshift', region: 'stories', size: 'sm', palette: ['#2f3d45', '#1a2132', '#ff6b6b'],
    problem: 'Horror on a page with no jump scares: only a log, read in order.',
    tech: ['Canvas 2D', 'Web Audio'],
    evidence: 'It opens with the weather and the shipping, and it does not stay there.',
    study: doc('apps/nightshift/README.md'), tests: doc('tests/nightshift.test.mjs') },

  /* ── games ────────────────────────────────────────────────────────────── */
  { id: 'ember', region: 'games', size: 'lg', palette: ['#3a2e2e', '#1d1a2a', '#ff9a4a'],
    problem: 'A full action game, with lighting, bosses and a score, and not a single downloaded asset.',
    tech: ['Canvas 2D lighting + shadows', 'Generated maps', 'Synthesised score', 'Keyboard, touch, gamepad'],
    evidence: 'Every room, every shadow and every note of the score is made in your browser.',
    study: doc('play/ember/README.md'), tests: doc('tests/ember.test.mjs') },
  { id: 'ace', region: 'games', size: 'sm', palette: ['#6b5a46', '#2b2a3f', '#ffd48a'],
    problem: 'A game that has to be explained has already failed.',
    tech: ['Canvas 2D', 'Web Audio', 'One button'],
    evidence: 'No menu, no settings, no tutorial.',
    study: doc('play/ace/README.md'), tests: doc('tests/ace.test.mjs') },
  { id: 'stack', region: 'games', size: 'sm', palette: ['#4a5a7a', '#262c48', '#8ad1ff'],
    problem: 'One rule, no tutorial, and every sloppy drop carried into the next.',
    tech: ['Canvas 2D', 'Web Audio'],
    evidence: 'The tower stays exactly as wide as you are precise.',
    study: doc('play/stack/README.md'), tests: doc('tests/stack.test.mjs') },
  { id: 'tether', region: 'games', size: 'sm', palette: ['#3d4a6b', '#222845', '#c6a8ff'],
    problem: 'A whole game out of one decision: when to let go.',
    tech: ['Orbital physics', 'Canvas 2D', 'Web Audio'],
    evidence: 'Let go and you fly off along the tangent, exactly as fast as you were going.',
    study: doc('play/tether/README.md'), tests: doc('tests/tether.test.mjs') },
  { id: 'sumo', region: 'games', size: 'sm', palette: ['#6b5b3d', '#2b2b3e', '#ff7aa8'],
    problem: 'Two players on one keyboard, one key each, and it still has to be fair.',
    tech: ['Canvas 2D', 'Web Audio', 'A bot for one player'],
    evidence: 'First to five. There is a bot if you are on your own.',
    study: doc('play/sumo/README.md'), tests: doc('tests/sumo.test.mjs') },
  { id: 'tangle', region: 'games', size: 'sm', palette: ['#3d6a66', '#21304a', '#7af0d8'],
    problem: 'A daily puzzle everyone shares, with no timer and nothing to read first.',
    tech: ['Seeded daily boards', 'Canvas 2D', 'Shareable result'],
    evidence: 'Everybody in the world gets the same board each day.',
    study: doc('play/tangle/README.md'), tests: doc('tests/tangle.test.mjs') },
  { id: 'sweeper', region: 'games', size: 'sm', palette: ['#5a6a5a', '#262f40', '#ff6b6b'],
    problem: 'Every classic Minesweeper ends in a coin flip; every board here is proven solvable first.',
    tech: ['Logic solver', 'Board generation', 'Keyboard play'],
    evidence: 'Lose, and it shows you the square you could have proved safe.',
    study: doc('play/sweeper/README.md'), tests: doc('tests/sweeper.test.mjs') },
  { id: 'sudoku', region: 'games', size: 'sm', palette: ['#5d5470', '#28283f', '#ffd88a'],
    problem: 'Generated puzzles often have two answers or need a guess. Every one here has one answer and a logical path.',
    tech: ['Bitmask backtracking', 'Human-technique solver', 'Daily seed'],
    evidence: 'The hint names the technique and shows you where it applies.',
    study: doc('play/sudoku/README.md'), tests: doc('tests/sudoku.test.mjs') },

  /* ── workshop ─────────────────────────────────────────────────────────── */
  { id: 'sandbox', region: 'workshop', size: 'md', palette: ['#7a6a46', '#2d2b3a', '#ffcf6b'],
    problem: 'Ten materials that behave the way you expect, cheap enough to pour thousands of grains.',
    tech: ['Particle grid simulation', 'Canvas 2D'],
    evidence: 'Pour sand, add water, set it on fire, and watch the smoke rise.',
    source: tree('play/sandbox') },
  { id: 'mercury', region: 'workshop', size: 'md', palette: ['#5a5f78', '#262a44', '#ffb38a'],
    problem: 'A believable liquid-metal surface with no 3D model and no texture.',
    tech: ['WebGL fragment shader', 'Wave equation', 'Raymarched reflections'],
    evidence: 'Every pixel is worked out from scratch, every frame.',
    study: doc('apps/mercury/README.md'), tests: doc('tests/mercury.test.mjs') },
  { id: 'beats', region: 'workshop', size: 'sm', palette: ['#5a3d6b', '#272442', '#ff7ae0'],
    problem: 'A drum machine with no samples: every kick and snare is synthesised.',
    tech: ['Web Audio synthesis', 'Step sequencer'],
    evidence: 'No sound files in it.',
    source: tree('play/beats') },
  { id: 'island', region: 'workshop', size: 'sm', palette: ['#3f6a4a', '#22304a', '#a6f0b0'],
    problem: 'A whole world, coastline to name, from one random number.',
    tech: ['Noise terrain', 'Rivers + biomes', 'Name generator', 'Canvas 2D'],
    evidence: 'Press the button and a brand new world comes out of a single seed.',
    source: tree('play/island') },
  { id: 'qr', region: 'workshop', size: 'sm', palette: ['#4a4a4a', '#22263a', '#e8e8e8'],
    problem: 'Most QR generators are web services. This one is written from scratch and nothing leaves the page.',
    tech: ['QR encoder from scratch', 'Reed–Solomon error correction', 'SVG + PNG export'],
    evidence: 'Tick “show how it is built”: most of a QR code is not your data.',
    study: doc('apps/qr/README.md'), tests: doc('tests/qr.test.mjs') },
  { id: 'split', region: 'workshop', size: 'sm', palette: ['#3d6b55', '#21304a', '#9af0b8'],
    problem: 'Groups settle up with far more bank transfers than they need.',
    tech: ['Minimum-transfer settlement', 'Exact money arithmetic', 'Share by link, no server'],
    evidence: 'Settles everybody to the penny in the fewest transfers.',
    study: doc('apps/split/README.md'), tests: doc('tests/split.test.mjs') },
  { id: 'tuner', region: 'workshop', size: 'sm', palette: ['#6b5a3d', '#2a2b3f', '#d6ff7a'],
    problem: 'Pitch detection that works on real instruments, not just pure tones.',
    tech: ['YIN pitch detection', 'Microphone via Web Audio', 'Canvas 2D'],
    evidence: 'No microphone? There is an out-of-tune string on the page to fix.',
    study: doc('apps/tuner/README.md'), tests: doc('tests/tuner.test.mjs') },
  { id: 'sift', region: 'workshop', size: 'sm', palette: ['#3d5a6b', '#21304a', '#8ae0ff'],
    problem: 'Seeing what is in a big spreadsheet should not mean uploading it somewhere.',
    tech: ['CSV parser', 'Column type inference', 'Gap + distribution profiling'],
    evidence: 'A hundred thousand rows without stuttering. Nothing is uploaded.',
    study: doc('apps/sift/README.md'), tests: doc('tests/sift.test.mjs') },

  /* ── engines ──────────────────────────────────────────────────────────── */
  { id: 'regex-lab', region: 'engines', size: 'md', palette: ['#4a3d6b', '#232546', '#c8a8ff'],
    problem: 'Regular expressions fail invisibly, and sometimes they take a website down.',
    tech: ['Parser', 'NFA compiler', 'Two matchers', 'Determiniser'],
    evidence: 'Catastrophic backtracking, visible.',
    study: doc('projects/regex-lab/README.md'), tests: doc('tests/regex.test.mjs') },
  { id: 'query-planner', region: 'engines', size: 'sm', palette: ['#3d5a6b', '#21304a', '#8ad1ff'],
    problem: 'Why a database chose a slow plan hides behind EXPLAIN output nobody reads.',
    tech: ['Cost model', 'Join ordering', 'Index selection', 'Plans with reasons'],
    evidence: 'Drag a table’s size and watch the planner change its mind.',
    study: doc('projects/query-planner/README.md'), tests: doc('tests/planner.test.mjs') },
  { id: 'raft-lab', region: 'engines', size: 'md', palette: ['#5a4a3d', '#262a40', '#ffd27a'],
    problem: 'Consensus guarantees are taken on faith. Here you can cut the network and check them.',
    tech: ['Raft leader election', 'Log replication', 'Deterministic virtual clock'],
    evidence: 'Crash the leader, partition the cluster, and the safety guarantees still hold.',
    study: doc('projects/raft-lab/README.md'), tests: doc('tests/raft.test.mjs') },
  { id: 'trace-explorer', region: 'engines', size: 'sm', palette: ['#3d6b5a', '#21304a', '#7af0c8'],
    problem: 'Tracing dashboards show where the time went but not why.',
    tech: ['Span waterfall', 'Critical-path analysis', 'Findings in sentences'],
    evidence: '260 traces across ten services, explained in words.',
    study: doc('projects/trace-explorer/README.md'), tests: doc('tests/trace.test.mjs') },
  { id: 'diff-forge', region: 'engines', size: 'sm', palette: ['#6b4a3d', '#2a2840', '#ff9a6b'],
    problem: 'The merge-conflict screen hands you the decision without the information.',
    tech: ['Myers diff', 'Patience diff', 'Three-way merge'],
    evidence: 'Two diff algorithms, side by side, on the same edit.',
    study: doc('projects/diff-forge/README.md'), tests: doc('tests/diff.test.mjs') },
  { id: 'oklch-studio', region: 'engines', size: 'sm', palette: ['#4a4a6b', '#232646', '#ffffff'],
    problem: 'Palettes that look fine fail the accessibility check run on them later.',
    tech: ['OKLCH colour space', 'Honest sRGB gamut mapping', 'WCAG + APCA contrast'],
    evidence: 'Contrast that is checked rather than hoped for.',
    study: doc('projects/oklch-studio/README.md'), tests: doc('tests/color.test.mjs') },
];

/* What each project's panel says beyond its pitch: three things it does, the one
   engineering decision most worth reading about (each taken from the project's own
   README or source), how its world reacts when it is chosen (fx), the silhouette of
   its island (base), and extra words people use when asking the guide for it. */
export const DETAILS = {
  'your-place': {
    features: ['Finds any city, street or address, and starts near you, guessed from your time zone',
      'Seven styles, each previewed on your own place, framed by dragging, pinching or the keys',
      'Downloads a print-ready PNG or an SVG with its fonts inside; the link is the poster'],
    decision: ['Draw the map off the main thread, and never make a drag wait for it',
      'A worker paints on an OffscreenCanvas while the page re-projects the last picture to wherever the map has moved, so the streets follow your finger at once and the fresh paint drops in behind. Measuring found the slow part: Chromium’s Path2D.closePath() grows with the path, and skipping it took 90,000 buildings from 85 s to 77 ms.'] },
  'your-sky': {
    features: ['The real sky over any place at any moment from 1800 to 2200, with the Moon in its phase and the planets where they were',
      'Clock time at the place, not on your computer, with summer time and the history of every zone',
      'A slider through the night, shaded with the real twilight, and a button that plays the stars round'],
    decision: ['Turn the sky with one rotation, and look the Milky Way up rather than fill it',
      'The stars are stored once, as directions; a single rotation from Astronomy Engine turns all 5,044 of them to any moment, so playing the night costs about 11 ms a frame. The Milky Way outline circles the whole sky, which is awkward to fill on a sphere, so it is filled once on a flat map of the sky at build time and every pixel of the chart looks itself up.'] },
  tally: {
    features: ['Answers questions from contracts and accounts, with every quote checked against its source',
      'Audits every invoice line against the contract terms in force on its date',
      'Drafts dispute emails that a person approves before anything is sent'],
    decision: ['The model reads; plain code decides what is owed',
      'Claude extracts contract terms and answers questions, but whether a supplier overcharged is worked out by deterministic Python, tested to the penny against 23 planted errors. No note written on an invoice can talk it out of a finding.'] },
  frontdesk: {
    features: ['Understands booking requests, typed or spoken, and asks for one thing at a time',
      'Checks the real table plan and offers the nearest free times when the one asked for has gone',
      'Writes allergies where the kitchen will see them, and hands over to a person when it should'],
    decision: ['A purpose-built parser, not a large language model',
      'For one narrow job a parser is fast, costs nothing to run, cannot make up a booking, and every phrasing can be tested. A small on-device model is asked only when the parser finds nothing at all, and even then it only suggests the intent.'] },
  handbook: {
    features: ['Every answer is a sentence from the documents, shown with its source',
      'Says “the handbook doesn’t say” and points to the nearest thing it does cover',
      'Paste in your own documents; unanswered questions become a gaps list for whoever writes the policies'],
    decision: ['An answer is a sentence from the documents',
      'Nothing writes new prose about a policy, so nothing can state a policy that does not exist. What is left to go wrong is picking the wrong sentence, and that can be measured: 4 made-up answers in 164 test questions.'] },
  callcoach: {
    features: ['Puts the right battlecard on screen the moment a prospect objects',
      'Writes MEDDICC notes, a CRM record and the follow-up email when the call ends',
      'Nudges the rep when they pitch before finding a problem or do most of the talking'],
    decision: ['Every quote in the notes was actually said',
      'The notes and the follow-up quote the prospect’s own words, and a test checks every quoted line against the call, so the summary cannot put words in anyone’s mouth.'] },
  claims: {
    features: ['Reads scanned forms and invoices with OCR, in the browser',
      'Runs up to thirteen checks, each linked to the field or clause it rests on',
      'Recommends approve, decline or refer, and records who approved or overrode it'],
    decision: ['A misread can only ever send a claim to a person',
      'Across 180 deliberately smudged scans the tests enforce a rule stricter than any accuracy figure: a misread may refer a claim, but must never pay one that should not be paid or decline one that should not be declined.'] },
  covers: {
    features: ['Drop a party on a table and it says whether they fit, and why not',
      'Handles turn times, turnaround and joined tables',
      'When the answer is no, it says what would work instead'],
    decision: ['The refusal is the product',
      'The rules live in a module with no interface code in it, every question goes through them, and the screen never has an opinion of its own about the room. When the answer is no, it says why and what to do instead.'] },
  attention: {
    features: ['A transformer trained from scratch, in the page',
      'Every backward pass hand-written and checked against finite differences',
      'Drag through training and watch an induction head form'],
    decision: ['The gradient checks came first',
      'A wrong backward pass does not throw; the model just trains slightly worse and there is no symptom to chase. So every backward pass was checked against central finite differences before anything was built on top of it.'] },
  tokens: {
    features: ['Trains a byte-pair tokeniser in front of you',
      'Shows why a model cannot count the letters in a word',
      'Shows why the same sentence costs three times as much in Japanese'],
    decision: ['Build the tokeniser rather than call one',
      'The interesting part is the order of the merges, not the finished vocabulary, and a tokeniser you trained is one you can interrogate.'] },
  evals: {
    features: ['Two real parsers graded live on 800 real inputs',
      'Bootstrap and Wilson intervals, McNemar’s test and power analysis',
      'Drag the sample size and watch a difference stop being real'],
    decision: ['Real systems, not a random number generator',
      'Most eval write-ups fake the model, which skips the hard half. Here both systems are real programs, and a test checks that the 95% interval really contains the truth about 95% of the time.'] },
  agents: {
    features: ['A real tool-use loop you can step through turn by turn',
      'Five tools over 300 expense lines, with token counts from a real tokeniser',
      'Every guard can be switched off to see what it was holding back'],
    decision: ['Honest about what is real',
      'The loop, guards, tools, data, message shapes and token accounting are real; the model is a scripted policy that emits the same blocks one would. There is no API key on the page, and it says so.'] },
  lamplighter: {
    features: ['A five-minute illustrated story told by scrolling',
      'Sky, sea, rock and light drawn from scratch, with no image files',
      'Sound that follows the weather'],
    decision: ['Two clocks',
      'The reader’s clock is the scroll bar; the lighthouse’s is wall time. The beam turns every 11.2 seconds whether or not anyone is reading, so the place goes on existing when you stop.'] },
  room: {
    features: ['Nineteen things to look at and four people to question',
      'A notebook that finds contradictions by itself',
      'No multiple-choice question anywhere'],
    decision: ['Statements are evidence',
      'Testimony is a fact about a claim, exactly like a ring in the dust, so the same three lines that find any other clash find one between what a witness said and what the room shows.'] },
  nightshift: {
    features: ['A watch log from one night in 1987, read in order',
      'Twelve timed beats that make up the whole haunting',
      'Sound, and an ending that waits for the last word'],
    decision: ['The haunting is a list',
      'Twelve beats, each a trigger and the name of an effect, so the timing of the whole story can be read, tested and changed in one place.'] },
  ember: {
    features: ['Three acts, three bosses and nine ash-stones',
      'Lighting, shadows and score all generated in the browser',
      'Keyboard, touch or gamepad'],
    decision: ['Fair by construction',
      'Every attack is shown before it can land. The tests play the whole game on three seeds and assert that every hit was visible at least 0.3 seconds beforehand.'] },
  ace: {
    features: ['One button, no menu, no tutorial', 'A fixed timestep, so speed does not depend on the screen', 'A backgrounded tab does not kill your run'],
    decision: ['Deterministic', 'The same seed and the same taps give exactly the same run every time, because the rocks come from a seeded generator rather than Math.random.'] },
  stack: {
    features: ['One rule: whatever overhangs is sliced off', 'A near-perfect drop gives a little width back', 'A run takes about two minutes'],
    decision: ['The rule that makes it a game', 'A drop within five units of perfect slices nothing and hands width back. Without it the tower could only shrink, and a game you can only lose slowly is a chore.'] },
  tether: {
    features: ['Swing round a planet and tap to let go along the tangent', 'Every part of the decision is drawn on screen', 'Points for people who want more than survival'],
    decision: ['Every part of the decision is drawn', 'The tangent, a short aim line and each planet’s capture radius are all visible, so no death is arguable.'] },
  sumo: {
    features: ['Two players, one keyboard, one key each', 'A ring that closes while you fight', 'A bot when you are on your own'],
    decision: ['Tuned by measurement, not feel', 'Every rule was chosen by having bots play thousands of rounds. The first draft let the closing ring decide 91% of rounds; the tuned rules make the shoves decide them.'] },
  tangle: {
    features: ['A daily board everyone shares', 'Solved means no loose ends, not matching a stored answer', 'A result you can paste into a group chat'],
    decision: ['The board is built backwards', 'It grows a spanning tree over the grid and reads the tiles off it, so the board is provably solvable before it is scrambled; turning tiles can never make it unsolvable.'] },
  sweeper: {
    features: ['The three classic sizes', 'Every board solvable by reasoning alone', 'Lose, and it shows the square you could have proved safe'],
    decision: ['The fix is in the generator', 'After laying the mines it plays the board from your first click with only what a player can see. If it cannot finish without a guess, the board is thrown away and another is laid.'] },
  sudoku: {
    features: ['A daily puzzle at three levels', 'Every puzzle has one answer and a path that needs no guessing', 'Hints that name the technique and show where it applies'],
    decision: ['A hint that teaches the move', 'Instead of filling a square, the hint says why, and any crossings-out it needs come first, because they are the part worth learning.'] },
  sandbox: {
    features: ['Ten materials, including sand, water, fire and smoke', 'Prepared scenes, or draw your own', 'Fire that spreads through a tree’s canopy'],
    decision: ['Bottom-up, alternating', 'Cells update from the bottom up so nothing falls twice in one frame, and the scan direction flips every frame so nothing drifts consistently one way.'] },
  mercury: {
    features: ['Drag the metal to draw waves; drag the sky to look around', 'Reflections bend as the ripples spread', 'Measures its own frame rate and adapts'],
    decision: ['It watches its own frame rate', 'Every pixel is traced, twice where there is a reflection, so it measures frame time and asks for more or fewer pixels, with tests that stop it oscillating.'] },
  beats: {
    features: ['A step sequencer with no sound files', 'Every drum synthesised from oscillators and noise', 'Random patterns that still sound like music'],
    decision: ['Synthesis, not samples', 'Kicks, snares and hats are built from oscillators and filtered noise, with a gentle limiter and a reverb made by filling a buffer with decaying noise.'] },
  island: {
    features: ['A new island, its rivers and its name from one seed', 'Gradient-noise terrain with ridged mountains', 'Rivers that walk downhill to the sea'],
    decision: ['Water walks downhill', 'Rivers are made by dropping water on the highest points and letting it walk downhill to the sea, so they always make geographic sense.'] },
  qr: {
    features: ['A link, text, Wi-Fi details or an email becomes a QR code as you type', 'Encoder and error correction written from scratch', 'Warnings before you print a code phones will struggle with'],
    decision: ['Free robustness', 'If the text fits at a stronger error-correction level without making the code any bigger, it takes the stronger level and says so.'] },
  split: {
    features: ['Who paid for what, and who owes whom', 'The fewest bank transfers that settle everyone', 'Share the group by link; nothing is uploaded'],
    decision: ['Money is whole cents', 'Every amount is an integer from the moment it is typed, so every split sums to its total and every group balances to exactly zero, checked on thousands of random groups.'] },
  tuner: {
    features: ['Guitar, bass, ukulele, violin or cello', 'Reads pitch to the cent from your microphone', 'An out-of-tune string on the page if you have no microphone'],
    decision: ['Look for the period, not the loudest frequency', 'A real string’s fundamental is often its quietest part, so picking the loudest frequency reads an octave high. YIN finds the shift at which the waveform lines up with itself.'] },
  sift: {
    features: ['Drop a CSV in and see what each column holds', 'Gaps, types and distributions at a glance', 'A hundred thousand rows without stuttering'],
    decision: ['The parser is the point', 'Splitting on commas silently breaks any row with a comma inside quotes, so the parser is a character loop that handles quoting properly.'] },
  'regex-lab': {
    features: ['A pattern compiled into a machine you can watch run', 'Catastrophic backtracking made visible', 'Errors that point at the offending character'],
    decision: ['Every piece keeps its place in the pattern', 'Each node of the parsed pattern records its source offsets, so the trace can point back at a substring and an error can put a caret under the right character.'] },
  'query-planner': {
    features: ['A query plan with its reasoning attached', 'Drag a table’s size and watch the plan change', 'Shows where an index stops being worth it'],
    decision: ['The bug that justifies showing the workings', 'An early version ignored every filter by looking up aliases in a catalogue filed by table name. The plans still looked plausible; only a test asserting an exact estimate caught it.'] },
  'raft-lab': {
    features: ['Five servers running real leader election and log replication', 'Cut the network in half or crash the leader', 'An invariant checker that keeps score'],
    decision: ['Virtual time and a seeded clock', 'A run is reproducible: the same seed and interventions give the same history, which is what makes the invariant checker meaningful rather than decorative.'] },
  'trace-explorer': {
    features: ['260 traces across ten services', 'A span waterfall with the critical path marked', 'Findings written in sentences'],
    decision: ['The analyser never sees the answer', 'The generator injects problems at random, but the analyser only ever sees spans, exactly as it would with real telemetry.'] },
  'diff-forge': {
    features: ['Myers and patience diff side by side', 'A three-way merge built around the moment you decide', 'Both algorithms rerun on every keystroke'],
    decision: ['Two readings of the same change', 'Myers finds the shortest edit script and can shred a diff; patience anchors on lines that appear once on each side, giving fewer hunks that match what a person actually did.'] },
  'oklch-studio': {
    features: ['Palettes generated in a perceptual colour space', 'Honest mapping into sRGB', 'Every pair audited with two contrast models'],
    decision: ['HSL lies about lightness', 'Yellow and navy can share an HSL lightness, so a ramp built that way fails contrast differently in every hue. Generating in OKLCH keeps each step the same brightness.'] },
};


/* Every world joined to its catalogue entry and its details, so the page needs only one list. */
/* For the projects with AI in them: what the model does, what ordinary code does,
   what keeps it honest, and what is not built yet. Every line is taken from the
   project's own README, which is where the evidence for it lives. */
export const AI = {
  tally: {
    model: [
      'Answers plain-English questions with five tools: document search, document reading, a document list, read-only SQL and a calculator',
      'Reads each contract and its amendments into typed terms, every term with a quote from the source',
      'Drafts one dispute email per supplier',
    ],
    code: [
      'Decides whether money is owed: plain Python checks every invoice line against the terms',
      'Drops any citation that does not quote, word for word, a passage the model was shown',
      'Runs the model\'s SQL read-only, on a separate database file, behind an allow-list, a time budget and a row cap',
    ],
    guards: [
      'A person edits, approves or rejects every draft before it reaches the outbox',
      'A draft must name every disputed invoice, and every £ amount in it must be one the audit produced',
      'Document text reaches the model marked as untrusted evidence; both planted prompt injections are flagged',
      'A daily budget stops model calls once it is spent, and every call\'s tokens and cost are logged',
    ],
    limits: [
      'The model evals (questions, extraction, drafts) need an API key and have not been run for this build; the four offline suites pass in CI',
      'Scanned and encrypted PDFs are refused',
    ],
  },
  frontdesk: {
    model: [
      'A small on-device embedding model, asked only when the parser finds nothing at all',
      'Even then it only suggests the intent: whether this is a booking request at all',
    ],
    code: [
      'A purpose-built parser reads party size, day, time, name and number, and the exact words each came from',
      'The Covers table engine is asked about every table, and asked again at the moment of booking',
      'Hands over to a person for more than ten guests, a complaint, a name it cannot find twice, or three misunderstandings in a row',
    ],
    guards: [
      'Reads everything back before it books',
      'Held-out phrasings: 75 of 82 on the first run, and the tests fail if the score ever drops below that',
      'Four hundred random callers on every test run: no double bookings, nothing after closing, nothing in the past',
    ],
    limits: ['No phone line yet: a telephony provider would stream call audio into the same text pipeline', 'Confirmation texts are drafted, not sent'],
  },
  handbook: {
    model: [
      'Optional: a small sentence-embedding model (MiniLM, 23 MB), loaded in your browser by "Run with the model"',
      'It adds meaning to the ranking. It never writes an answer',
    ],
    code: [
      'Every answer is a sentence from the documents, with its source: nothing writes new prose about a policy',
      'Porter stemming and BM25 rank every sentence in the handbook',
      'Refuses when the question\'s subject is not in the documents, and never cites a replaced policy as the answer',
    ],
    guards: [
      'About a fifth of the test questions are deliberately unanswerable',
      '"Answers made up" is counted across all 164 questions and shown on the page',
      'Held-out first runs are recorded and never edited: 25 of 41, then 21 of 43',
    ],
    limits: ['Word matching copes badly with phrasings the handbook never uses; that is what the model is for', 'Text and Markdown only: no PDFs, Word files, connectors or permissions yet'],
  },
  callcoach: {
    model: ['None. Every tag, card, nudge and note comes from rules a sales manager would recognise, so each one can be read and tested'],
    code: [
      'Tags seventeen kinds of moment: eight objections, five buying signals and four pains',
      'Reads spoken numbers and sums of money into values with their units',
      'Writes MEDDICC notes, a CRM record and the follow-up email from quotes',
    ],
    guards: [
      'A test checks that every quote in the notes and the email was actually said on the call',
      'Held-out lines, run once: 27 of 28, precision 96%, recall 100%',
      'The same person wrote the rules and the test lines, so that score is optimistic, and the page says so',
    ],
    limits: ['No call audio yet: it needs a speech-to-text service with speaker labels', 'CRM records are drafts for the rep to approve'],
  },
  claims: {
    model: ['Tesseract OCR, running in WebAssembly and served from this site, reads the scans into words with their positions on the page'],
    code: [
      'Turns the OCR text into facts, allowing for OCR\'s usual slips (£ read as E, O as 0)',
      'Runs up to thirteen checks against the policy and between the documents, each citing a field or a clause',
      'Recommends approve, decline with the clause quoted, or refer to a person',
    ],
    guards: [
      '180 deliberately smudged scans on every test run: a misread may send a claim to a person, but must never pay or decline wrongly',
      'Records who approved or overrode the recommendation',
      'A referral asks for something and never uses the words fraud, suspicious or investigation',
    ],
    limits: ['Images only: no PDFs or multi-page documents', 'Typed forms only: handwriting would need a handwriting model and a person checking it'],
  },
  agents: {
    model: ['Not real, on purpose: a scripted policy emits the same content blocks a model would, so each failure can be shown on demand'],
    code: [
      'The loop, the five tools and the 300-line expense ledger are real',
      'Guards for bad arguments, tool errors, loops and oversized results, plus a turn limit that cannot be switched off',
      'Token counts come from a real byte-pair tokeniser run over the actual conversation',
    ],
    guards: ['29 tests, including that each turn costs more than the one before'],
    limits: ['A real model drops in behind one function, policy({ messages, tools, turn }), without the harness knowing'],
  },
};

export const ISLANDS = WORLDS.map((w) => ({ ...(w.id === 'tally' ? TALLY : byId.get(w.id)), ...w, ...DETAILS[w.id], ai: AI[w.id] ?? null }));
export const islandById = new Map(ISLANDS.map((i) => [i.id, i]));


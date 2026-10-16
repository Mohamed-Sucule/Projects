/* atlas/worlds.js — what each project looks like as a world, and the evidence behind it.

   The catalogue (shared/atlas.js) already knows every project's title, link and
   one-line pitch, and the navigator and search trust it. This file adds only what
   the Portal Atlas needs on top: which region an island floats in, the colours it
   is drawn in, the problem it answers, what it is built with, and where the proof
   lives. tests/atlas.test.mjs checks the two lists agree, so a project added to the
   catalogue and forgotten here fails the build instead of quietly missing an island.

   Tally is the one project that is not a static page: it is a Python service, so it
   is not in the catalogue the navigator searches, and it is described in full here. */

import { ATLAS, byId } from '../shared/atlas.js';

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

/* palette: [land on top, rock underneath, the light it gives off] */
export const WORLDS = [
  /* ── products ─────────────────────────────────────────────────────────── */
  { id: 'tally', region: 'products', size: 'lg', palette: ['#2f5d55', '#24314f', '#9AE6D0'],
    world: 'A counting-house whose roof is an open ledger. Invoices spill off its edge; a lens checks each one.',
    problem: 'Supplier invoices get paid without anyone checking them against the contract, so overcharges go through.',
    tech: ['Python', 'FastAPI', 'Claude API: tools + structured outputs', 'SQLite FTS5', 'Read-only SQL sandbox', 'Docker'],
    evidence: '23 of 23 planted billing errors found to the penny, no false positives; 20 of 20 SQL attacks blocked. The model evals run once an API key is added.',
    study: doc('tally/README.md'), source: tree('tally'), tests: tree('tally/tests'), shot: 'tally.jpg' },
  { id: 'frontdesk', region: 'products', size: 'lg', palette: ['#6b4a3a', '#2a2a44', '#ff8a6b'],
    world: 'A restaurant terrace beneath a telephone tower that never stops listening.',
    problem: 'Restaurants miss calls during service, and whoever does answer should be serving.',
    tech: ['Purpose-built language parser', 'Whisper speech recognition, on device', 'MiniLM embeddings', 'Covers table engine', 'Web Audio'],
    evidence: '75 of 82 new phrasings understood first time; 400 random callers, no double-bookings.',
    study: doc('apps/frontdesk/README.md'), tests: doc('tests/frontdesk.test.mjs') },
  { id: 'handbook', region: 'products', size: 'md', palette: ['#4a4f7a', '#262c4a', '#ffd38a'],
    world: 'A library of stacked handbooks. The open one shines a single quoted line into the sky.',
    problem: 'Staff ask HR the same questions all day, and an assistant that guesses at policy is worse than none.',
    tech: ['BM25 over every sentence', 'Porter stemmer, written out', 'Concept synonyms', 'On-device embeddings', 'Refusal rules'],
    evidence: '4 answers made up in 164 test questions, 31 of them unanswerable on purpose.',
    study: doc('apps/handbook/README.md'), tests: doc('tests/handbook.test.mjs') },
  { id: 'callcoach', region: 'products', size: 'md', palette: ['#3d5a6b', '#23304a', '#7fd8ff'],
    world: 'An amphitheatre with a radio mast. Speech drifts round it and the right card lights up.',
    problem: 'Reps lose deals on the same objections, and nobody writes the call up properly afterwards.',
    tech: ['Moment tagger: 17 kinds', 'Spoken-number parser', 'MEDDICC notes', 'CRM record + follow-up', 'Quote checking'],
    evidence: '27 of 28 new lines tagged exactly right, first time; every quote in its notes checked against the call.',
    study: doc('apps/callcoach/README.md'), tests: doc('tests/callcoach.test.mjs') },
  { id: 'claims', region: 'products', size: 'md', palette: ['#5b5a46', '#2a2d40', '#f3d27a'],
    world: 'A sorting tower where a beam reads each scanned form and drops it down one of three chutes.',
    problem: 'Claims handlers spend their day retyping paperwork and checking it by hand.',
    tech: ['Tesseract OCR in WebAssembly', 'OCR-tolerant field reader', 'Thirteen policy checks', 'Web Worker', 'Human override'],
    evidence: '11 of 11 fields read from each scan; on 180 smudged scans a misread only ever sends a claim to a person.',
    study: doc('apps/claims/README.md'), tests: doc('tests/claims.test.mjs') },
  { id: 'covers', region: 'products', size: 'md', palette: ['#4b5d3e', '#25304a', '#a9f08a'],
    world: 'A floor plan floating in the night, mid-service, with guests moving between the tables.',
    problem: 'A Saturday night of tables, turn times and late parties is a puzzle solved in someone’s head.',
    tech: ['Constraint-checked scheduling', 'Joined tables + turnaround', 'Drag and drop', 'Explains every refusal'],
    evidence: 'Drop a party on a table and it says whether they fit, and if not, why and what to do instead.',
    study: doc('apps/covers/README.md'), tests: doc('tests/covers.test.mjs') },

  /* ── models ───────────────────────────────────────────────────────────── */
  { id: 'attention', region: 'models', size: 'lg', palette: ['#3b4470', '#20284a', '#b7c8ff'],
    world: 'An observatory under a sky of tokens, joined by the arcs one attention head learns to draw.',
    problem: 'Everyone talks about attention heads; almost nobody has watched one form.',
    tech: ['Reverse-mode autograd, hand-written', 'Attention-only transformer', 'Adam + cosine schedule', 'Canvas 2D'],
    evidence: 'Drag through training and the induction head appears at the step the loss falls off a cliff.',
    study: doc('apps/attention/README.md'), tests: doc('tests/attention.test.mjs') },
  { id: 'tokens', region: 'models', size: 'sm', palette: ['#5a4a78', '#272a4c', '#e2b8ff'],
    world: 'A crystal word that has split along the seams a tokeniser sees.',
    problem: 'Models miscount letters and charge more for Japanese, and the reason, tokenisation, is invisible.',
    tech: ['Byte-level BPE, 240 lines', 'Trains in the page', 'GPT-2 vs GPT-4 pre-tokenisation'],
    evidence: 'Trains on 64,000 characters in under half a second, with 40 tests.',
    study: doc('apps/tokens/README.md'), tests: doc('tests/tokens.test.mjs') },
  { id: 'evals', region: 'models', size: 'md', palette: ['#3f5f6a', '#22304a', '#9AE6D0'],
    world: 'A balance on a hill shaped like a bell curve, still deciding which side is heavier.',
    problem: '“92% versus 89%” gets shipped as an improvement when it is noise.',
    tech: ['Percentile bootstrap', 'Wilson intervals', 'McNemar exact test', 'Power analysis'],
    evidence: 'Two real parsers on 800 real inputs, graded live, with 44 tests.',
    study: doc('apps/evals/README.md'), tests: doc('tests/evals.test.mjs') },
  { id: 'agents', region: 'models', size: 'md', palette: ['#5d4f3a', '#272b42', '#ffc277'],
    world: 'Clockwork: an agent walking its loop past tool stations, with every guard on a switch.',
    problem: 'The agent loop is easy. The failures that kill it in production are not, and are rarely shown.',
    tech: ['Real tool-use loop', 'Five tools over 300 ledger lines', 'BPE token counts', 'Switchable guards'],
    evidence: 'The agent’s answer is checked against the ledger; 29 tests.',
    study: doc('apps/agents/README.md'), tests: doc('tests/agents.test.mjs') },

  /* ── stories ──────────────────────────────────────────────────────────── */
  { id: 'lamplighter', region: 'stories', size: 'md', palette: ['#3a4a5a', '#1f2840', '#ffe3a1'],
    world: 'A lighthouse on its rock, the beam still turning, the last winter coming on.',
    problem: 'Telling a story with a page that paints itself: the sun sets and the gale rises as you scroll.',
    tech: ['Canvas 2D, no image files', 'Scroll-driven scene', 'Web Audio'],
    evidence: 'There is not an image file in its directory. The sky, the sea and the light are arithmetic.',
    study: doc('apps/lamplighter/README.md'), tests: doc('tests/lamplighter.test.mjs') },
  { id: 'room', region: 'stories', size: 'md', palette: ['#4a3b3b', '#241f33', '#ffb36b'],
    world: 'One locked room, floating. The key is inside. So is the answer.',
    problem: 'Most mystery games are multiple choice in disguise; here you have to find the contradiction yourself.',
    tech: ['Contradiction engine', 'Nineteen clues, four witnesses', 'Canvas 2D'],
    evidence: 'The notebook works out for itself which two statements cannot both be true.',
    study: doc('apps/room/README.md'), tests: doc('tests/room.test.mjs') },
  { id: 'nightshift', region: 'stories', size: 'sm', palette: ['#2f3d45', '#1a2132', '#ff6b6b'],
    world: 'A watch hut in the fog. One window lit. The radio is still on.',
    problem: 'Horror on a page with no jump scares: only a log, read in order.',
    tech: ['Canvas 2D', 'Web Audio'],
    evidence: 'It opens with the weather and the shipping, and it does not stay there.',
    study: doc('apps/nightshift/README.md'), tests: doc('tests/nightshift.test.mjs') },

  /* ── games ────────────────────────────────────────────────────────────── */
  { id: 'ember', region: 'games', size: 'lg', palette: ['#3a2e2e', '#1d1a2a', '#ff9a4a'],
    world: 'A dark rock with one beacon still burning. Embers rise from it and do not come down.',
    problem: 'A full action game, with lighting, bosses and a score, and not a single downloaded asset.',
    tech: ['Canvas 2D lighting + shadows', 'Generated maps', 'Synthesised score', 'Keyboard, touch, gamepad'],
    evidence: 'Every room, every shadow and every note of the score is made in your browser.',
    study: doc('play/ember/README.md'), tests: doc('tests/ember.test.mjs') },
  { id: 'ace', region: 'games', size: 'sm', palette: ['#6b5a46', '#2b2a3f', '#ffd48a'],
    world: 'Two canyon spires and a paper plane that has not hit them yet.',
    problem: 'A game that has to be explained has already failed.',
    tech: ['Canvas 2D', 'Web Audio', 'One button'],
    evidence: 'No menu, no settings, no tutorial.',
    study: doc('play/ace/README.md'), tests: doc('tests/ace.test.mjs') },
  { id: 'stack', region: 'games', size: 'sm', palette: ['#4a5a7a', '#262c48', '#8ad1ff'],
    world: 'A tower of slices, each as wide as the last careful drop.',
    problem: 'One rule, no tutorial, and every sloppy drop carried into the next.',
    tech: ['Canvas 2D', 'Web Audio'],
    evidence: 'The tower stays exactly as wide as you are precise.',
    study: doc('play/stack/README.md'), tests: doc('tests/stack.test.mjs') },
  { id: 'tether', region: 'games', size: 'sm', palette: ['#3d4a6b', '#222845', '#c6a8ff'],
    world: 'A tiny planet, and something swinging round it on a line.',
    problem: 'A whole game out of one decision: when to let go.',
    tech: ['Orbital physics', 'Canvas 2D', 'Web Audio'],
    evidence: 'Let go and you fly off along the tangent, exactly as fast as you were going.',
    study: doc('play/tether/README.md'), tests: doc('tests/tether.test.mjs') },
  { id: 'sumo', region: 'games', size: 'sm', palette: ['#6b5b3d', '#2b2b3e', '#ff7aa8'],
    world: 'A ring that is closing, and two blobs who both want the other one out of it.',
    problem: 'Two players on one keyboard, one key each, and it still has to be fair.',
    tech: ['Canvas 2D', 'Web Audio', 'A bot for one player'],
    evidence: 'First to five. There is a bot if you are on your own.',
    study: doc('play/sumo/README.md'), tests: doc('tests/sumo.test.mjs') },
  { id: 'tangle', region: 'games', size: 'sm', palette: ['#3d6a66', '#21304a', '#7af0d8'],
    world: 'Tiles of pipework, turning until nothing is left dangling.',
    problem: 'A daily puzzle everyone shares, with no timer and nothing to read first.',
    tech: ['Seeded daily boards', 'Canvas 2D', 'Shareable result'],
    evidence: 'Everybody in the world gets the same board each day.',
    study: doc('play/tangle/README.md'), tests: doc('tests/tangle.test.mjs') },
  { id: 'sweeper', region: 'games', size: 'sm', palette: ['#5a6a5a', '#262f40', '#ff6b6b'],
    world: 'A field of squares, every one of them provable.',
    problem: 'Every classic Minesweeper ends in a coin flip; every board here is proven solvable first.',
    tech: ['Logic solver', 'Board generation', 'Keyboard play'],
    evidence: 'Lose, and it shows you the square you could have proved safe.',
    study: doc('play/sweeper/README.md'), tests: doc('tests/sweeper.test.mjs') },
  { id: 'sudoku', region: 'games', size: 'sm', palette: ['#5d5470', '#28283f', '#ffd88a'],
    world: 'Terraces of a grid, with exactly one way down.',
    problem: 'Generated puzzles often have two answers or need a guess. Every one here has one answer and a logical path.',
    tech: ['Bitmask backtracking', 'Human-technique solver', 'Daily seed'],
    evidence: 'The hint names the technique and shows you where it applies.',
    study: doc('play/sudoku/README.md'), tests: doc('tests/sudoku.test.mjs') },

  /* ── workshop ─────────────────────────────────────────────────────────── */
  { id: 'sandbox', region: 'workshop', size: 'md', palette: ['#7a6a46', '#2d2b3a', '#ffcf6b'],
    world: 'A hopper of sand pouring off the edge of the world, beside a small fire and a pool.',
    problem: 'Ten materials that behave the way you expect, cheap enough to pour thousands of grains.',
    tech: ['Particle grid simulation', 'Canvas 2D'],
    evidence: 'Pour sand, add water, set it on fire, and watch the smoke rise.',
    source: tree('play/sandbox') },
  { id: 'mercury', region: 'workshop', size: 'md', palette: ['#5a5f78', '#262a44', '#ffb38a'],
    world: 'A pool of liquid metal holding the sunset, rippling where you touched it.',
    problem: 'A believable liquid-metal surface with no 3D model and no texture.',
    tech: ['WebGL fragment shader', 'Wave equation', 'Raymarched reflections'],
    evidence: 'Every pixel is worked out from scratch, every frame.',
    study: doc('apps/mercury/README.md'), tests: doc('tests/mercury.test.mjs') },
  { id: 'beats', region: 'workshop', size: 'sm', palette: ['#5a3d6b', '#272442', '#ff7ae0'],
    world: 'A grid of pads lighting up in time, with nothing recorded anywhere.',
    problem: 'A drum machine with no samples: every kick and snare is synthesised.',
    tech: ['Web Audio synthesis', 'Step sequencer'],
    evidence: 'No sound files in it.',
    source: tree('play/beats') },
  { id: 'island', region: 'workshop', size: 'sm', palette: ['#3f6a4a', '#22304a', '#a6f0b0'],
    world: 'An island drawing a map of an island, which is drawing a map of an island.',
    problem: 'A whole world, coastline to name, from one random number.',
    tech: ['Noise terrain', 'Rivers + biomes', 'Name generator', 'Canvas 2D'],
    evidence: 'Press the button and a brand new world comes out of a single seed.',
    source: tree('play/island') },
  { id: 'qr', region: 'workshop', size: 'sm', palette: ['#4a4a4a', '#22263a', '#e8e8e8'],
    world: 'Terraces of black and white modules, guarded by three square towers.',
    problem: 'Most QR generators are web services. This one is written from scratch and nothing leaves the page.',
    tech: ['QR encoder from scratch', 'Reed–Solomon error correction', 'SVG + PNG export'],
    evidence: 'Tick “show how it is built”: most of a QR code is not your data.',
    study: doc('apps/qr/README.md'), tests: doc('tests/qr.test.mjs') },
  { id: 'split', region: 'workshop', size: 'sm', palette: ['#3d6b55', '#21304a', '#9af0b8'],
    world: 'Three islets and the fewest bridges that settle everyone up.',
    problem: 'Groups settle up with far more bank transfers than they need.',
    tech: ['Minimum-transfer settlement', 'Exact money arithmetic', 'Share by link, no server'],
    evidence: 'Settles everybody to the penny in the fewest transfers.',
    study: doc('apps/split/README.md'), tests: doc('tests/split.test.mjs') },
  { id: 'tuner', region: 'workshop', size: 'sm', palette: ['#6b5a3d', '#2a2b3f', '#d6ff7a'],
    world: 'A tuning fork tower, humming slightly flat.',
    problem: 'Pitch detection that works on real instruments, not just pure tones.',
    tech: ['YIN pitch detection', 'Microphone via Web Audio', 'Canvas 2D'],
    evidence: 'No microphone? There is an out-of-tune string on the page to fix.',
    study: doc('apps/tuner/README.md'), tests: doc('tests/tuner.test.mjs') },
  { id: 'sift', region: 'workshop', size: 'sm', palette: ['#3d5a6b', '#21304a', '#8ae0ff'],
    world: 'A sieve that rains data through it and stacks what it finds in columns.',
    problem: 'Seeing what is in a big spreadsheet should not mean uploading it somewhere.',
    tech: ['CSV parser', 'Column type inference', 'Gap + distribution profiling'],
    evidence: 'A hundred thousand rows without stuttering. Nothing is uploaded.',
    study: doc('apps/sift/README.md'), tests: doc('tests/sift.test.mjs') },

  /* ── engines ──────────────────────────────────────────────────────────── */
  { id: 'regex-lab', region: 'engines', size: 'md', palette: ['#4a3d6b', '#232546', '#c8a8ff'],
    world: 'Stepping stones of a state machine, with a single character hopping between them.',
    problem: 'Regular expressions fail invisibly, and sometimes they take a website down.',
    tech: ['Parser', 'NFA compiler', 'Two matchers', 'Determiniser'],
    evidence: 'Catastrophic backtracking, visible.',
    study: doc('projects/regex-lab/README.md'), tests: doc('tests/regex.test.mjs') },
  { id: 'query-planner', region: 'engines', size: 'sm', palette: ['#3d5a6b', '#21304a', '#8ad1ff'],
    world: 'A tree of operators growing down into its tables.',
    problem: 'Why a database chose a slow plan hides behind EXPLAIN output nobody reads.',
    tech: ['Cost model', 'Join ordering', 'Index selection', 'Plans with reasons'],
    evidence: 'Drag a table’s size and watch the planner change its mind.',
    study: doc('projects/query-planner/README.md'), tests: doc('tests/planner.test.mjs') },
  { id: 'raft-lab', region: 'engines', size: 'md', palette: ['#5a4a3d', '#262a40', '#ffd27a'],
    world: 'Five pillars in a ring, one of them crowned, all of them listening for a heartbeat.',
    problem: 'Consensus guarantees are taken on faith. Here you can cut the network and check them.',
    tech: ['Raft leader election', 'Log replication', 'Deterministic virtual clock'],
    evidence: 'Crash the leader, partition the cluster, and the safety guarantees still hold.',
    study: doc('projects/raft-lab/README.md'), tests: doc('tests/raft.test.mjs') },
  { id: 'trace-explorer', region: 'engines', size: 'sm', palette: ['#3d6b5a', '#21304a', '#7af0c8'],
    world: 'Terraces of spans cascading down, with the critical path lit.',
    problem: 'Tracing dashboards show where the time went but not why.',
    tech: ['Span waterfall', 'Critical-path analysis', 'Findings in sentences'],
    evidence: '260 traces across ten services, explained in words.',
    study: doc('projects/trace-explorer/README.md'), tests: doc('tests/trace.test.mjs') },
  { id: 'diff-forge', region: 'engines', size: 'sm', palette: ['#6b4a3d', '#2a2840', '#ff9a6b'],
    world: 'An anvil where a red stream and a green stream are hammered into one.',
    problem: 'The merge-conflict screen hands you the decision without the information.',
    tech: ['Myers diff', 'Patience diff', 'Three-way merge'],
    evidence: 'Two diff algorithms, side by side, on the same edit.',
    study: doc('projects/diff-forge/README.md'), tests: doc('tests/diff.test.mjs') },
  { id: 'oklch-studio', region: 'engines', size: 'sm', palette: ['#4a4a6b', '#232646', '#ffffff'],
    world: 'A prism tower splitting one beam into a palette that passes.',
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
  tally: {
    features: ['Answers questions from contracts and accounts, with every quote checked against its source',
      'Audits every invoice line against the contract terms in force on its date',
      'Drafts dispute emails that a person approves before anything is sent'],
    decision: ['The model reads; plain code decides what is owed',
      'Claude extracts contract terms and answers questions, but whether a supplier overcharged is worked out by deterministic Python, tested to the penny against 23 planted errors. No note written on an invoice can talk it out of a finding.'],
    fx: { type: 'ledger' }, base: 'shelf',
    guide: ['automate', 'workflow', 'repetitive', 'back office', 'operations', 'finance', 'data', 'documents', 'prototype', 'ai product', 'llm', 'technically interesting'] },
  frontdesk: {
    features: ['Understands booking requests, typed or spoken, and asks for one thing at a time',
      'Checks the real table plan and offers the nearest free times when the one asked for has gone',
      'Writes allergies where the kitchen will see them, and hands over to a person when it should'],
    decision: ['A purpose-built parser, not a large language model',
      'For one narrow job a parser is fast, costs nothing to run, cannot make up a booking, and every phrasing can be tested. A small on-device model is asked only when the parser finds nothing at all, and even then it only suggests the intent.'],
    fx: { type: 'voice', variant: 'call' }, base: 'cone',
    guide: ['automate', 'customer service', 'phone', 'voice', 'prototype', 'ai product', 'restaurant', 'hospitality', 'booking', 'receptionist'] },
  handbook: {
    features: ['Every answer is a sentence from the documents, shown with its source',
      'Says “the handbook doesn’t say” and points to the nearest thing it does cover',
      'Paste in your own documents; unanswered questions become a gaps list for whoever writes the policies'],
    decision: ['An answer is a sentence from the documents',
      'Nothing writes new prose about a policy, so nothing can state a policy that does not exist. What is left to go wrong is picking the wrong sentence, and that can be measured: 4 made-up answers in 164 test questions.'],
    fx: { type: 'neural', variant: 'threads' }, base: 'spire',
    guide: ['knowledge base', 'internal tools', 'hr', 'search', 'documents', 'rag', 'prototype', 'ai product', 'support'] },
  callcoach: {
    features: ['Puts the right battlecard on screen the moment a prospect objects',
      'Writes MEDDICC notes, a CRM record and the follow-up email when the call ends',
      'Nudges the rep when they pitch before finding a problem or do most of the talking'],
    decision: ['Every quote in the notes was actually said',
      'The notes and the follow-up quote the prospect’s own words, and a test checks every quoted line against the call, so the summary cannot put words in anyone’s mouth.'],
    fx: { type: 'voice', variant: 'conversation' }, base: 'shelf',
    guide: ['sales', 'crm', 'automate', 'workflow', 'prototype', 'ai product', 'meetings', 'calls', 'notes'] },
  claims: {
    features: ['Reads scanned forms and invoices with OCR, in the browser',
      'Runs up to thirteen checks, each linked to the field or clause it rests on',
      'Recommends approve, decline or refer, and records who approved or overrode it'],
    decision: ['A misread can only ever send a claim to a person',
      'Across 180 deliberately smudged scans the tests enforce a rule stricter than any accuracy figure: a misread may refer a claim, but must never pay one that should not be paid or decline one that should not be declined.'],
    fx: { type: 'scan' }, base: 'spire',
    guide: ['automate', 'workflow', 'repetitive', 'documents', 'ocr', 'insurance', 'operations', 'data entry', 'ai product', 'paperwork'] },
  covers: {
    features: ['Drop a party on a table and it says whether they fit, and why not',
      'Handles turn times, turnaround and joined tables',
      'When the answer is no, it says what would work instead'],
    decision: ['The refusal is the product',
      'The rules live in a module with no interface code in it, every question goes through them, and the screen never has an opinion of its own about the room. When the answer is no, it says why and what to do instead.'],
    fx: { type: 'grid', variant: 'plan' }, base: 'shelf',
    guide: ['saas', 'scheduling', 'booking', 'restaurant', 'product', 'constraints', 'operations', 'workflow'] },
  attention: {
    features: ['A transformer trained from scratch, in the page',
      'Every backward pass hand-written and checked against finite differences',
      'Drag through training and watch an induction head form'],
    decision: ['The gradient checks came first',
      'A wrong backward pass does not throw; the model just trains slightly worse and there is no symptom to chase. So every backward pass was checked against central finite differences before anything was built on top of it.'],
    fx: { type: 'neural', variant: 'attention' }, base: 'crystal',
    guide: ['machine learning', 'transformer', 'research', 'technically interesting', 'hardest', 'llm', 'neural network'] },
  tokens: {
    features: ['Trains a byte-pair tokeniser in front of you',
      'Shows why a model cannot count the letters in a word',
      'Shows why the same sentence costs three times as much in Japanese'],
    decision: ['Build the tokeniser rather than call one',
      'The interesting part is the order of the merges, not the finished vocabulary, and a tokeniser you trained is one you can interrogate.'],
    fx: { type: 'shards' }, base: 'crystal',
    guide: ['llm', 'tokens', 'cost', 'research', 'learn', 'machine learning'] },
  evals: {
    features: ['Two real parsers graded live on 800 real inputs',
      'Bootstrap and Wilson intervals, McNemar’s test and power analysis',
      'Drag the sample size and watch a difference stop being real'],
    decision: ['Real systems, not a random number generator',
      'Most eval write-ups fake the model, which skips the hard half. Here both systems are real programs, and a test checks that the 95% interval really contains the truth about 95% of the time.'],
    fx: { type: 'bars', variant: 'bell' }, base: 'cone',
    guide: ['data', 'statistics', 'evaluation', 'measure', 'ab test', 'data problem', 'quality', 'machine learning'] },
  agents: {
    features: ['A real tool-use loop you can step through turn by turn',
      'Five tools over 300 expense lines, with token counts from a real tokeniser',
      'Every guard can be switched off to see what it was holding back'],
    decision: ['Honest about what is real',
      'The loop, guards, tools, data, message shapes and token accounting are real; the model is a scripted policy that emits the same blocks one would. There is no API key on the page, and it says so.'],
    fx: { type: 'graph', variant: 'loop' }, base: 'ring',
    guide: ['agents', 'automation', 'automate', 'tool use', 'workflow', 'production', 'reliability', 'ai product', 'llm'] },
  lamplighter: {
    features: ['A five-minute illustrated story told by scrolling',
      'Sky, sea, rock and light drawn from scratch, with no image files',
      'Sound that follows the weather'],
    decision: ['Two clocks',
      'The reader’s clock is the scroll bar; the lighthouse’s is wall time. The beam turns every 11.2 seconds whether or not anyone is reading, so the place goes on existing when you stop.'],
    fx: { type: 'beam' }, base: 'spire',
    guide: ['story', 'creative', 'beautiful', 'storytelling', 'art', 'interactive'] },
  room: {
    features: ['Nineteen things to look at and four people to question',
      'A notebook that finds contradictions by itself',
      'No multiple-choice question anywhere'],
    decision: ['Statements are evidence',
      'Testimony is a fact about a claim, exactly like a ring in the dust, so the same three lines that find any other clash find one between what a witness said and what the room shows.'],
    fx: { type: 'strings' }, base: 'cone',
    guide: ['game', 'mystery', 'story', 'creative', 'logic', 'interactive'] },
  nightshift: {
    features: ['A watch log from one night in 1987, read in order',
      'Twelve timed beats that make up the whole haunting',
      'Sound, and an ending that waits for the last word'],
    decision: ['The haunting is a list',
      'Twelve beats, each a trigger and the name of an effect, so the timing of the whole story can be read, tested and changed in one place.'],
    fx: { type: 'fog' }, base: 'cone',
    guide: ['story', 'horror', 'creative', 'writing', 'interactive'] },
  ember: {
    features: ['Three acts, three bosses and nine ash-stones',
      'Lighting, shadows and score all generated in the browser',
      'Keyboard, touch or gamepad'],
    decision: ['Fair by construction',
      'Every attack is shown before it can land. The tests play the whole game on three seeds and assert that every hit was visible at least 0.3 seconds beforehand.'],
    fx: { type: 'rise' }, base: 'spire',
    guide: ['game', 'action', 'creative', 'technically interesting', 'games', 'fun'] },
  ace: {
    features: ['One button, no menu, no tutorial', 'A fixed timestep, so speed does not depend on the screen', 'A backgrounded tab does not kill your run'],
    decision: ['Deterministic', 'The same seed and the same taps give exactly the same run every time, because the rocks come from a seeded generator rather than Math.random.'],
    fx: { type: 'orbit', variant: 'flight' }, base: 'twin', guide: ['game', 'quick', 'arcade', 'fun'] },
  stack: {
    features: ['One rule: whatever overhangs is sliced off', 'A near-perfect drop gives a little width back', 'A run takes about two minutes'],
    decision: ['The rule that makes it a game', 'A drop within five units of perfect slices nothing and hands width back. Without it the tower could only shrink, and a game you can only lose slowly is a chore.'],
    fx: { type: 'fall', variant: 'slices' }, base: 'cone', guide: ['game', 'quick', 'arcade', 'fun'] },
  tether: {
    features: ['Swing round a planet and tap to let go along the tangent', 'Every part of the decision is drawn on screen', 'Points for people who want more than survival'],
    decision: ['Every part of the decision is drawn', 'The tangent, a short aim line and each planet’s capture radius are all visible, so no death is arguable.'],
    fx: { type: 'orbit', variant: 'tether' }, base: 'ring', guide: ['game', 'physics', 'space', 'quick'] },
  sumo: {
    features: ['Two players, one keyboard, one key each', 'A ring that closes while you fight', 'A bot when you are on your own'],
    decision: ['Tuned by measurement, not feel', 'Every rule was chosen by having bots play thousands of rounds. The first draft let the closing ring decide 91% of rounds; the tuned rules make the shoves decide them.'],
    fx: { type: 'orbit', variant: 'ring' }, base: 'shelf', guide: ['game', 'two player', 'multiplayer', 'party'] },
  tangle: {
    features: ['A daily board everyone shares', 'Solved means no loose ends, not matching a stored answer', 'A result you can paste into a group chat'],
    decision: ['The board is built backwards', 'It grows a spanning tree over the grid and reads the tiles off it, so the board is provably solvable before it is scrambled; turning tiles can never make it unsolvable.'],
    fx: { type: 'grid', variant: 'pipes' }, base: 'crystal', guide: ['game', 'puzzle', 'daily', 'calm', 'algorithm'] },
  sweeper: {
    features: ['The three classic sizes', 'Every board solvable by reasoning alone', 'Lose, and it shows the square you could have proved safe'],
    decision: ['The fix is in the generator', 'After laying the mines it plays the board from your first click with only what a player can see. If it cannot finish without a guess, the board is thrown away and another is laid.'],
    fx: { type: 'grid', variant: 'mines' }, base: 'shelf', guide: ['game', 'puzzle', 'logic', 'classic', 'algorithm'] },
  sudoku: {
    features: ['A daily puzzle at three levels', 'Every puzzle has one answer and a path that needs no guessing', 'Hints that name the technique and show where it applies'],
    decision: ['A hint that teaches the move', 'Instead of filling a square, the hint says why, and any crossings-out it needs come first, because they are the part worth learning.'],
    fx: { type: 'grid', variant: 'sudoku' }, base: 'cone', guide: ['game', 'puzzle', 'daily', 'logic'] },
  sandbox: {
    features: ['Ten materials, including sand, water, fire and smoke', 'Prepared scenes, or draw your own', 'Fire that spreads through a tree’s canopy'],
    decision: ['Bottom-up, alternating', 'Cells update from the bottom up so nothing falls twice in one frame, and the scan direction flips every frame so nothing drifts consistently one way.'],
    fx: { type: 'fall', variant: 'sand' }, base: 'cone', guide: ['physics', 'simulation', 'creative', 'toy', 'fun'] },
  mercury: {
    features: ['Drag the metal to draw waves; drag the sky to look around', 'Reflections bend as the ripples spread', 'Measures its own frame rate and adapts'],
    decision: ['It watches its own frame rate', 'Every pixel is traced, twice where there is a reflection, so it measures frame time and asks for more or fewer pixels, with tests that stop it oscillating.'],
    fx: { type: 'ripple' }, base: 'shelf', guide: ['shader', 'webgl', 'graphics', 'beautiful', 'creative', 'technically interesting'] },
  beats: {
    features: ['A step sequencer with no sound files', 'Every drum synthesised from oscillators and noise', 'Random patterns that still sound like music'],
    decision: ['Synthesis, not samples', 'Kicks, snares and hats are built from oscillators and filtered noise, with a gentle limiter and a reverb made by filling a buffer with decaying noise.'],
    fx: { type: 'voice', variant: 'rhythm' }, base: 'crystal', guide: ['music', 'audio', 'creative', 'sound', 'fun'] },
  island: {
    features: ['A new island, its rivers and its name from one seed', 'Gradient-noise terrain with ridged mountains', 'Rivers that walk downhill to the sea'],
    decision: ['Water walks downhill', 'Rivers are made by dropping water on the highest points and letting it walk downhill to the sea, so they always make geographic sense.'],
    fx: { type: 'contours' }, base: 'shelf', guide: ['generative', 'procedural', 'creative', 'art', 'maps'] },
  qr: {
    features: ['A link, text, Wi-Fi details or an email becomes a QR code as you type', 'Encoder and error correction written from scratch', 'Warnings before you print a code phones will struggle with'],
    decision: ['Free robustness', 'If the text fits at a stronger error-correction level without making the code any bigger, it takes the stronger level and says so.'],
    fx: { type: 'grid', variant: 'qr' }, base: 'crystal', guide: ['utility', 'useful', 'tool', 'printing'] },
  split: {
    features: ['Who paid for what, and who owes whom', 'The fewest bank transfers that settle everyone', 'Share the group by link; nothing is uploaded'],
    decision: ['Money is whole cents', 'Every amount is an integer from the moment it is typed, so every split sums to its total and every group balances to exactly zero, checked on thousands of random groups.'],
    fx: { type: 'graph', variant: 'transfers' }, base: 'twin', guide: ['finance', 'money', 'utility', 'useful', 'algorithm'] },
  tuner: {
    features: ['Guitar, bass, ukulele, violin or cello', 'Reads pitch to the cent from your microphone', 'An out-of-tune string on the page if you have no microphone'],
    decision: ['Look for the period, not the loudest frequency', 'A real string’s fundamental is often its quietest part, so picking the loudest frequency reads an octave high. YIN finds the shift at which the waveform lines up with itself.'],
    fx: { type: 'voice', variant: 'sine' }, base: 'spire', guide: ['audio', 'music', 'signal processing', 'utility'] },
  sift: {
    features: ['Drop a CSV in and see what each column holds', 'Gaps, types and distributions at a glance', 'A hundred thousand rows without stuttering'],
    decision: ['The parser is the point', 'Splitting on commas silently breaks any row with a comma inside quotes, so the parser is a character loop that handles quoting properly.'],
    fx: { type: 'bars', variant: 'columns' }, base: 'cone', guide: ['data', 'csv', 'spreadsheet', 'data problem', 'analysis', 'privacy'] },
  'regex-lab': {
    features: ['A pattern compiled into a machine you can watch run', 'Catastrophic backtracking made visible', 'Errors that point at the offending character'],
    decision: ['Every piece keeps its place in the pattern', 'Each node of the parsed pattern records its source offsets, so the trace can point back at a substring and an error can put a caret under the right character.'],
    fx: { type: 'graph', variant: 'chain' }, base: 'twin', guide: ['compiler', 'regex', 'computer science', 'technically interesting', 'security'] },
  'query-planner': {
    features: ['A query plan with its reasoning attached', 'Drag a table’s size and watch the plan change', 'Shows where an index stops being worth it'],
    decision: ['The bug that justifies showing the workings', 'An early version ignored every filter by looking up aliases in a catalogue filed by table name. The plans still looked plausible; only a test asserting an exact estimate caught it.'],
    fx: { type: 'graph', variant: 'tree' }, base: 'spire', guide: ['database', 'sql', 'backend', 'performance', 'data'] },
  'raft-lab': {
    features: ['Five servers running real leader election and log replication', 'Cut the network in half or crash the leader', 'An invariant checker that keeps score'],
    decision: ['Virtual time and a seeded clock', 'A run is reproducible: the same seed and interventions give the same history, which is what makes the invariant checker meaningful rather than decorative.'],
    fx: { type: 'graph', variant: 'ring' }, base: 'ring', guide: ['distributed systems', 'backend', 'infrastructure', 'technically interesting', 'hardest'] },
  'trace-explorer': {
    features: ['260 traces across ten services', 'A span waterfall with the critical path marked', 'Findings written in sentences'],
    decision: ['The analyser never sees the answer', 'The generator injects problems at random, but the analyser only ever sees spans, exactly as it would with real telemetry.'],
    fx: { type: 'bars', variant: 'waterfall' }, base: 'shelf', guide: ['observability', 'performance', 'backend', 'data', 'debugging'] },
  'diff-forge': {
    features: ['Myers and patience diff side by side', 'A three-way merge built around the moment you decide', 'Both algorithms rerun on every keystroke'],
    decision: ['Two readings of the same change', 'Myers finds the shortest edit script and can shred a diff; patience anchors on lines that appear once on each side, giving fewer hunks that match what a person actually did.'],
    fx: { type: 'merge' }, base: 'cone', guide: ['git', 'developer tools', 'algorithm', 'engineering'] },
  'oklch-studio': {
    features: ['Palettes generated in a perceptual colour space', 'Honest mapping into sRGB', 'Every pair audited with two contrast models'],
    decision: ['HSL lies about lightness', 'Yellow and navy can share an HSL lightness, so a ramp built that way fails contrast differently in every hue. Generating in OKLCH keeps each step the same brightness.'],
    fx: { type: 'spectrum' }, base: 'crystal', guide: ['design', 'design system', 'accessibility', 'colour', 'frontend'] },
};

/* The project the portal opens onto. */
export const FEATURED = 'frontdesk';

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

/* The entries the guide searches: the catalogue plus Tally, each with the extra words
   people use when they describe a problem rather than name a project. */
export const SEARCHABLE = [TALLY, ...ATLAS].map((e) => ({ ...e, tags: [...(e.tags ?? []), ...(DETAILS[e.id]?.guide ?? [])] }));

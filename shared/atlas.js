/* shared/atlas.js — everything in this repo, in one list.

   Thirty-one pages accumulated one at a time, each knowing only about itself.
   That is fine until somebody lands on the Attention page and wants to know
   what else is here, at which point the only answer is "go back to the front
   and scroll" — which is not an answer, it is a chore.

   So: one catalogue. The navigator reads it, the search engine ranks it, and
   the previous/next links between pieces come out of its order. Adding
   something to the site means adding a row here and nothing else.

   `tags` are for retrieval, not for display. They deliberately include the
   words somebody would actually type — "ai", "llm", "chatgpt", "fun",
   "shortest" — rather than the words I would use writing about it, because the
   whole job of a search box is to meet people where their vocabulary is. */

export const KINDS = {
  ai:         { label: 'AI product',       accent: '255,106,82'  },
  ml:         { label: 'machine learning', accent: '125,211,252' },
  fiction:    { label: 'fiction',          accent: '255,209,102' },
  game:       { label: 'game',             accent: '255,77,141'  },
  physics:    { label: 'physics',          accent: '125,211,252' },
  instrument: { label: 'instrument',       accent: '163,230,53'  },
  app:        { label: 'app',              accent: '45,212,191'  },
  product:    { label: 'product',          accent: '90,169,255'  },
  tool:       { label: 'engineering tool', accent: '154,165,184' },
};

/* `depth` answers "how long have you got":
     skim  — you will understand it in ten seconds and can leave happy
     play  — worth a few minutes with your hands on it
     study — it rewards actually reading, and has a write-up */
export const ATLAS = [
  /* ── AI products: the things a client would ask for ────────────────────── */
  {
    id: 'frontdesk', title: 'Front Desk', href: 'apps/frontdesk/index.html',
    kind: 'ai', depth: 'play', minutes: 4,
    blurb: 'An AI phone receptionist for a busy restaurant. It checks the real table plan, '
         + 'offers the nearest free times and books straight into the host-stand system.',
    hook: 'Listen in on a Saturday night, or ring it yourself.',
    tags: ['ai', 'voice', 'voice ai', 'agent', 'ai agent', 'receptionist', 'phone', 'call', 'chatbot',
           'conversational', 'restaurant', 'booking', 'reservation', 'nlu', 'speech', 'whisper',
           'client work', 'product', 'business', 'automation', 'customer service', 'startup',
           'book a table', 'impressive', 'best'],
  },

  {
    id: 'handbook', title: 'Ask the Handbook', href: 'apps/handbook/index.html',
    kind: 'ai', depth: 'play', minutes: 4,
    blurb: 'A knowledge assistant that answers staff questions from company documents, quotes '
         + 'its source, and says “the handbook doesn’t say” rather than guess.',
    hook: 'Ask about holidays or a stolen laptop — then paste in your own documents.',
    tags: ['ai', 'rag', 'retrieval', 'search', 'knowledge base', 'chatbot', 'assistant', 'hr', 'policies',
           'handbook', 'documents', 'citations', 'hallucination', 'evals', 'bm25', 'embeddings', 'semantic search',
           'internal tools', 'client work', 'product', 'business', 'startup', 'impressive'],
  },

  {
    id: 'callcoach', title: 'Call Coach', href: 'apps/callcoach/index.html',
    kind: 'ai', depth: 'play', minutes: 4,
    blurb: 'A live assistant for sales calls: the right answer on screen the moment a prospect '
         + 'objects, and the notes, CRM record and follow-up written when the call ends.',
    hook: 'Three calls — a good one, a hard one and a polite no.',
    tags: ['ai', 'sales', 'sales ai', 'copilot', 'call', 'calls', 'crm', 'meddicc', 'objection handling',
           'battlecards', 'coaching', 'conversation intelligence', 'transcript', 'revenue', 'gong',
           'client work', 'product', 'business', 'startup', 'impressive'],
  },

  {
    id: 'claims', title: 'Claims Desk', href: 'apps/claims/index.html',
    kind: 'ai', depth: 'play', minutes: 3,
    blurb: 'Reads an insurance claim — email, scanned form, invoice — checks it against the policy '
         + 'and itself, and recommends a decision with the evidence for every line.',
    hook: 'Watch it read the scans, then spot what is wrong with the stolen bike.',
    tags: ['ai', 'ocr', 'document ai', 'insurance', 'claims', 'automation', 'tesseract', 'extraction',
           'fraud', 'rules', 'human in the loop', 'workflow', 'insurtech', 'fintech',
           'client work', 'product', 'business', 'startup', 'impressive'],
  },

  /* ── machine learning ─────────────────────────────────────────────────── */
  {
    id: 'attention', title: 'Attention', href: 'apps/attention/index.html',
    kind: 'ml', depth: 'study', minutes: 6,
    blurb: 'A transformer trained from scratch with hand-written backpropagation, '
         + 'and the exact step it learned to copy.',
    hook: 'Drag through training and watch an induction head appear.',
    tags: ['ai', 'llm', 'machine learning', 'ml', 'transformer', 'neural network', 'deep learning',
           'backprop', 'backpropagation', 'autograd', 'gradient', 'induction head', 'circuits',
           'interpretability', 'mechanistic', 'attention', 'heads', 'training', 'loss curve',
           'phase change', 'pytorch', 'from scratch', 'hardest', 'impressive', 'best'],
  },
  {
    id: 'tokens', title: 'Tokens', href: 'apps/tokens/index.html',
    kind: 'ml', depth: 'play', minutes: 4,
    blurb: 'A byte-pair tokeniser that trains itself in front of you, and the three '
         + 'things it explains about why models behave the way they do.',
    hook: 'Why a model cannot count the r’s in strawberry.',
    tags: ['ai', 'llm', 'tokeniser', 'tokenizer', 'machine learning', 'ml', 'tokens', 'bpe', 'byte pair encoding',
           'strawberry', 'spelling', 'count letters', 'arithmetic', 'numbers', 'cost',
           'pricing', 'context window', 'japanese', 'unicode', 'emoji', 'gpt', 'chatgpt',
           'vocabulary', 'merges', 'why is it bad at maths'],
  },
  {
    id: 'evals', title: 'Evals', href: 'apps/evals/index.html',
    kind: 'ml', depth: 'study', minutes: 5,
    blurb: 'Two real parsers, eight hundred real inputs, graded live — and the '
         + 'confidence interval that decides whether the change was real.',
    hook: 'At a hundred items the better parser scores worse.',
    tags: ['ai', 'llm', 'machine learning', 'ml', 'eval', 'evals', 'evaluation', 'benchmark', 'testing', 'statistics',
           'stats', 'bootstrap', 'confidence interval', 'significance', 'p value', 'mcnemar',
           'power analysis', 'sample size', 'ab test', 'a/b', 'measurement', 'rigour',
           'data science', 'noise', 'did it actually improve'],
  },
  {
    id: 'agents', title: 'Agents', href: 'apps/agents/index.html',
    kind: 'ml', depth: 'play', minutes: 4,
    blurb: 'A real tool-use loop you can step through, then break on purpose — with '
         + 'every guard switchable so you can see what it was holding back.',
    hook: 'Switch off error handling and watch the run die on turn one.',
    tags: ['ai', 'llm', 'machine learning', 'ml', 'agent', 'agents', 'agentic', 'tool use', 'function calling', 'tools',
           'loop', 'harness', 'mcp', 'retry', 'guardrails', 'failure modes', 'context window',
           'token cost', 'production', 'reliability', 'error handling', 'orchestration'],
  },

  /* ── the front door ───────────────────────────────────────────────────── */
  {
    id: 'lamplighter', title: 'The Lamplighter', href: 'apps/lamplighter/index.html',
    kind: 'fiction', depth: 'play', minutes: 5,
    blurb: 'One night, and a keeper about to be replaced by a machine. Scroll and the '
         + 'sun goes down, the gale gets up, and the light keeps turning.',
    hook: 'Not a photograph in it — the sea and the sky are drawn from scratch.',
    tags: ['story', 'fiction', 'read', 'reading', 'lighthouse', 'sea', 'storm', 'atmospheric',
           'beautiful', 'scroll', 'scrollytelling', 'canvas', 'generative', 'art', 'pretty',
           'calm', 'quiet', 'alone', 'sad', 'night'],
  },
  {
    id: 'room', title: 'The Room', href: 'apps/room/index.html',
    kind: 'fiction', depth: 'play', minutes: 10,
    blurb: 'Edmund Harkness is dead at his desk and the door was locked from inside. '
         + 'Look at nineteen things, question four people, then name somebody.',
    hook: 'The notebook works out for itself which two statements cannot both be true.',
    tags: ['murder', 'mystery', 'detective', 'puzzle', 'whodunnit', 'locked room', 'clues',
           'story', 'fiction', 'investigate', 'deduction', 'logic', 'contradiction',
           'game', 'think', 'clever', 'agatha christie'],
  },
  {
    id: 'nightshift', title: 'Nightshift', href: 'apps/nightshift/index.html',
    kind: 'fiction', depth: 'play', minutes: 5,
    blurb: 'A coastal watch log from one night in 1987. It opens with the weather and '
         + 'the shipping, and it does not stay there.',
    hook: 'Read it to the end — it is reading you back.',
    tags: ['horror', 'scary', 'creepy', 'story', 'fiction', 'read', 'unsettling', 'ghost',
           'supernatural', 'log', '1987', 'alone', 'dark', 'atmospheric', 'weird', 'best'],
  },

  /* ── the big product ──────────────────────────────────────────────────── */
  {
    id: 'covers', title: 'Covers', href: 'apps/covers/index.html',
    kind: 'product', depth: 'study', minutes: 12,
    blurb: 'A restaurant floor and booking system you drop into at 19:42 on a Saturday, '
         + 'mid-service, with a double-booking to sort out.',
    hook: 'Drag a party onto a table and it tells you why they do not fit, and what to do.',
    tags: ['product', 'app', 'real software', 'restaurant', 'booking', 'reservations',
           'scheduling', 'tables', 'business', 'saas', 'commercial', 'client work',
           'the big one', 'longest', 'most work', 'serious', 'complex', 'drag and drop',
           'constraint solving', 'planner', 'optimisation'],
  },

  /* ── games ────────────────────────────────────────────────────────────── */
  {
    id: 'ember', title: 'Ember', href: 'play/ember/index.html',
    kind: 'game', depth: 'study', minutes: 15,
    blurb: 'An action game in the dark. Your flame is your life and your light: three acts, '
         + 'three bosses, nine ash-stones, and one question — who put out the Beacon?',
    hook: 'Every room, every shadow and every note of the score is made in your browser.',
    tags: ['game', 'play', 'epic', 'action', 'adventure', 'rpg', 'roguelike', 'dungeon', 'boss',
           'bosses', 'fight', 'sword', 'dark', 'fantasy', 'story', 'mystery', 'soulslike', 'zelda',
           'lighting', 'shadows', 'soundtrack', 'longest game', 'biggest', 'impressive', 'best game'],
  },
  {
    id: 'ace', title: 'Ace', href: 'play/ace/index.html',
    kind: 'game', depth: 'skim', minutes: 2,
    blurb: 'Tap to fly a paper plane through a canyon. Do not hit the rocks.',
    hook: 'You will understand it before you finish reading this sentence.',
    tags: ['game', 'play', 'fun', 'arcade', 'quick', 'easy', 'one button', 'tap', 'flappy',
           'plane', 'flying', 'reflex', 'shortest', 'fastest', 'two minutes', 'bored'],
  },
  {
    id: 'stack', title: 'Stack', href: 'play/stack/index.html',
    kind: 'game', depth: 'skim', minutes: 2,
    blurb: 'A block slides past. Tap. Whatever hangs over the edge is sliced off and falls.',
    hook: 'Every sloppy drop makes the next one harder.',
    tags: ['game', 'play', 'fun', 'arcade', 'one button', 'tap', 'tower', 'precision',
           'quick', 'easy', 'shortest', 'bored', 'two minutes'],
  },
  {
    id: 'tether', title: 'Tether', href: 'play/tether/index.html',
    kind: 'game', depth: 'skim', minutes: 3,
    blurb: 'You swing round a planet on a tether. Tap and you let go, flying off exactly '
         + 'the way you were already pointing.',
    hook: 'One decision, and it is only ever when.',
    tags: ['game', 'play', 'fun', 'arcade', 'one button', 'orbit', 'space', 'planets',
           'physics', 'timing', 'quick', 'bored'],
  },
  {
    id: 'sumo', title: 'Sumo', href: 'play/sumo/index.html',
    kind: 'game', depth: 'skim', minutes: 3,
    blurb: 'Two people, one keyboard, one key each. Knock the other one out of the ring '
         + 'before it closes under you.',
    hook: 'There is a bot if you are on your own.',
    tags: ['game', 'play', 'fun', 'two player', 'multiplayer', 'local', 'together', 'friend',
           'party', 'versus', 'keyboard', 'couch', 'with someone'],
  },
  {
    id: 'tangle', title: 'Tangle', href: 'play/tangle/index.html',
    kind: 'game', depth: 'play', minutes: 4,
    blurb: 'Tap a tile to turn it. The board is solved when no connector is left dangling.',
    hook: 'Everybody in the world gets the same board each day.',
    tags: ['game', 'puzzle', 'daily', 'wordle', 'brain', 'relaxing', 'calm', 'think',
           'share', 'streak', 'logic', 'quiet'],
  },

  {
    id: 'sweeper', title: 'Minesweeper', href: 'play/sweeper/index.html',
    kind: 'game', depth: 'play', minutes: 5,
    blurb: 'Classic Minesweeper, except every board is proven solvable by logic before you '
         + 'see it, so it never comes down to a coin flip.',
    hook: 'Lose, and it shows you the square you could have proved safe.',
    tags: ['game', 'minesweeper', 'mines', 'puzzle', 'logic', 'classic', 'windows', 'brain',
           'think', 'no guessing', 'fair', 'solver', 'hint', 'play', 'fun', 'bored', 'deduction'],
  },
  {
    id: 'sudoku', title: 'Sudoku', href: 'play/sudoku/index.html',
    kind: 'game', depth: 'play', minutes: 10,
    blurb: 'A daily Sudoku at three levels, each with exactly one answer and a way to it '
         + 'that needs no guessing.',
    hook: 'The hint names the technique and shows you where it applies.',
    tags: ['game', 'sudoku', 'puzzle', 'daily', 'numbers', 'logic', 'brain', 'newspaper',
           'think', 'relaxing', 'calm', 'hint', 'learn', 'techniques', 'solver', 'play', 'crossword'],
  },

  /* ── physics ──────────────────────────────────────────────────────────── */
  {
    id: 'sandbox', title: 'Sandbox', href: 'play/sandbox/index.html',
    kind: 'physics', depth: 'play', minutes: 5,
    blurb: 'Pour sand. Add water. Set it on fire and watch the smoke rise.',
    hook: 'Ten materials that all behave the way you expect, which is the whole trick.',
    tags: ['physics', 'sandbox', 'toy', 'fun', 'sand', 'water', 'fire', 'falling sand',
           'simulation', 'particles', 'play', 'satisfying', 'relaxing', 'mess about',
           'kids', 'destroy'],
  },
  {
    id: 'mercury', title: 'Mercury', href: 'apps/mercury/index.html',
    kind: 'physics', depth: 'skim', minutes: 3,
    blurb: 'A sheet of liquid metal under a sunset sky. Drag it and the ripples bend the '
         + 'reflections as they spread.',
    hook: 'No 3D model, no texture — every pixel worked out from scratch.',
    tags: ['physics', 'beautiful', 'pretty', 'shader', 'webgl', 'gpu', 'liquid', 'metal',
           'ripples', 'reflection', 'raymarching', 'satisfying', 'relaxing', 'wow', 'art'],
  },

  /* ── instruments ──────────────────────────────────────────────────────── */
  {
    id: 'beats', title: 'Beat Lab', href: 'play/beats/index.html',
    kind: 'instrument', depth: 'play', minutes: 4,
    blurb: 'A drum machine with no sound files in it — every kick and snare is '
         + 'generated from scratch.',
    hook: 'Press play, tap the squares, make something.',
    tags: ['music', 'audio', 'sound', 'drum machine', 'beat', 'sequencer', 'rhythm',
           'synthesis', 'web audio', 'make something', 'creative', 'fun', 'noisy',
           'headphones', 'play'],
  },
  {
    id: 'island', title: 'Islandsmith', href: 'play/island/index.html',
    kind: 'instrument', depth: 'skim', minutes: 3,
    blurb: 'Press the button, get a brand new world: coastline, mountains, forests, rivers '
         + 'and a name.',
    hook: 'Every island comes from a single random number.',
    tags: ['generative', 'procedural', 'world', 'map', 'island', 'terrain', 'noise',
           'fantasy', 'names', 'pretty', 'art', 'relaxing', 'button', 'again', 'seed'],
  },
  {
    id: 'qr', title: 'QR codes', href: 'apps/qr/index.html',
    kind: 'app', depth: 'play', minutes: 2,
    blurb: 'Type a link, some text, a Wi-Fi password or an email and it is a QR code before '
         + 'you finish typing. The encoder is written from scratch.',
    hook: 'Tick "show how it is built" — most of a QR code is not your data.',
    tags: ['qr', 'qr code', 'barcode', 'wifi', 'wi-fi', 'password', 'link', 'url', 'share', 'print',
           'poster', 'menu', 'generator', 'useful', 'practical', 'app', 'reed solomon',
           'error correction', 'encoding', 'download', 'svg', 'png', 'privacy', 'offline', 'make a qr code'],
  },
  {
    id: 'split', title: 'Split', href: 'apps/split/index.html',
    kind: 'app', depth: 'play', minutes: 3,
    blurb: 'Who paid for what on a trip or at dinner, and the fewest bank transfers that '
         + 'settle everybody up, to the penny.',
    hook: 'Share the whole group with one link. Nothing is uploaded.',
    tags: ['money', 'bill', 'split the bill', 'expenses', 'trip', 'holiday', 'flat', 'rent', 'friends',
           'group', 'who owes', 'owe', 'settle up', 'splitwise', 'payments', 'useful', 'practical',
           'app', 'algorithm', 'optimisation', 'finance', 'share', 'dinner'],
  },
  {
    id: 'tuner', title: 'Tuner', href: 'apps/tuner/index.html',
    kind: 'app', depth: 'play', minutes: 2,
    blurb: 'Play a note into your microphone and see how sharp or flat it is, to the cent. '
         + 'Guitar, bass, ukulele, violin or cello.',
    hook: 'No microphone? There is an out-of-tune string on the page to fix.',
    tags: ['music', 'guitar', 'bass', 'ukulele', 'violin', 'cello', 'tuner', 'tune', 'pitch',
           'microphone', 'audio', 'sound', 'notes', 'in tune', 'useful', 'practical', 'app',
           'signal processing', 'dsp', 'yin', 'tune my guitar'],
  },
  {
    id: 'sift', title: 'Sift', href: 'apps/sift/index.html',
    kind: 'app', depth: 'play', minutes: 5,
    blurb: 'Drop a spreadsheet in and it tells you what is actually in it: what each column '
         + 'holds, where the gaps are, what the numbers look like.',
    hook: 'A hundred thousand rows without stuttering. Nothing is uploaded.',
    tags: ['data', 'csv', 'spreadsheet', 'excel', 'table', 'analysis', 'profiling', 'columns',
           'filter', 'sort', 'useful', 'work', 'practical', 'privacy', 'offline', 'upload',
           'my own data', 'data science'],
  },

  /* ── engineering tools ────────────────────────────────────────────────── */
  {
    id: 'regex-lab', title: 'Regex Lab', href: 'projects/regex-lab/index.html',
    kind: 'tool', depth: 'study', minutes: 6,
    blurb: 'A search pattern compiled into a machine you can watch run, one character at a '
         + 'time — including the kind that quietly takes a website down.',
    hook: 'Catastrophic backtracking, visible.',
    tags: ['regex', 'regular expression', 'nfa', 'automata', 'state machine', 'compiler',
           'parsing', 'redos', 'backtracking', 'security', 'computer science', 'theory',
           'engineering', 'learn', 'teaching'],
  },
  {
    id: 'query-planner', title: 'Query Planner', href: 'projects/query-planner/index.html',
    kind: 'tool', depth: 'study', minutes: 6,
    blurb: 'A database deciding how to answer a question, with its reasoning attached. Drag '
         + 'a table’s size and watch it change its mind.',
    hook: 'Where the index stops being worth it.',
    tags: ['database', 'sql', 'query', 'planner', 'optimiser', 'index', 'join', 'postgres',
           'explain', 'cost model', 'backend', 'engineering', 'performance', 'learn'],
  },
  {
    id: 'raft-lab', title: 'Raft Lab', href: 'projects/raft-lab/index.html',
    kind: 'tool', depth: 'study', minutes: 7,
    blurb: 'Five servers agreeing with each other. Cut the network in half, crash the '
         + 'leader, and watch the safety guarantees hold.',
    hook: 'Consensus, with the network under your thumb.',
    tags: ['raft', 'consensus', 'distributed systems', 'replication', 'leader election',
           'partition', 'split brain', 'cap theorem', 'etcd', 'kafka', 'backend',
           'infrastructure', 'engineering', 'learn', 'hard'],
  },
  {
    id: 'trace-explorer', title: 'Trace Explorer', href: 'projects/trace-explorer/index.html',
    kind: 'tool', depth: 'study', minutes: 5,
    blurb: 'Where a slow web request actually spent its time, explained in sentences '
         + 'instead of charts.',
    hook: 'The critical path, named.',
    tags: ['tracing', 'observability', 'performance', 'latency', 'profiling', 'spans',
           'opentelemetry', 'datadog', 'debugging', 'slow', 'backend', 'engineering',
           'critical path', 'p99'],
  },
  {
    id: 'diff-forge', title: 'Diff Forge', href: 'projects/diff-forge/index.html',
    kind: 'tool', depth: 'study', minutes: 5,
    blurb: 'The merge conflict — software’s most hated screen — rebuilt as a '
         + 'choice you can actually read.',
    hook: 'Two diff algorithms, side by side, on the same edit.',
    tags: ['diff', 'merge', 'conflict', 'git', 'version control', 'myers', 'patience',
           'algorithm', 'three way merge', 'rebase', 'engineering', 'developer tools'],
  },
  {
    id: 'oklch-studio', title: 'OKLCH Studio', href: 'projects/oklch-studio/index.html',
    kind: 'tool', depth: 'play', minutes: 4,
    blurb: 'Building a colour palette that still passes when someone runs an accessibility '
         + 'check on it.',
    hook: 'Perceptual colour space, and contrast that is checked rather than hoped for.',
    tags: ['colour', 'color', 'palette', 'oklch', 'design system', 'accessibility', 'a11y',
           'contrast', 'wcag', 'design', 'ui', 'frontend', 'tokens', 'brand', 'useful'],
  },
];

export const HOME = {
  id: 'home', title: 'Playground', href: 'index.html',
  kind: 'ml', depth: 'skim', minutes: 1,
  blurb: 'The front page — everything, with a live preview on every card.',
  hook: 'Start here if you want to browse rather than search.',
  tags: ['home', 'front', 'index', 'everything', 'all', 'start', 'back', 'browse', 'list'],
};

export const byId = new Map(ATLAS.map((e) => [e.id, e]));

/**
 * Turn an entry's root-relative path into one this page can actually follow.
 *
 * `base` is the URL of the module doing the asking — `import.meta.url` — and
 * the repository root is one level above it, because this file lives in
 * shared/. Deriving it that way rather than from location.pathname is the only
 * version that is correct in all four places this site gets opened: the root of
 * a domain, a project subdirectory on GitHub Pages, a preview server rooted
 * anywhere, and a bare file:// path.
 */
export function resolveHref(href, base) {
  return new URL(href, new URL('../', base)).href;
}

/** Which entry, if any, is the page we are currently on. */
export function currentEntry(pathname = location.pathname) {
  const clean = pathname.replace(/index\.html?$/, '').replace(/\/$/, '');
  return ATLAS.find((e) => clean.endsWith(e.href.replace(/\/index\.html$/, ''))) ?? null;
}

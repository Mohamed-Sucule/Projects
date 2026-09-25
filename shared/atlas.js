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
  ml:         { label: 'machine learning', accent: '125,211,252' },
  fiction:    { label: 'fiction',          accent: '255,209,102' },
  game:       { label: 'game',             accent: '255,77,141'  },
  physics:    { label: 'physics',          accent: '125,211,252' },
  instrument: { label: 'instrument',       accent: '163,230,53'  },
  product:    { label: 'product',          accent: '90,169,255'  },
  tool:       { label: 'engineering tool', accent: '154,165,184' },
};

/* `depth` answers "how long have you got":
     skim  — you will understand it in ten seconds and can leave happy
     play  — worth a few minutes with your hands on it
     study — it rewards actually reading, and has a write-up */
export const ATLAS = [
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
    id: 'ace', title: 'Ace', href: 'play/ace/index.html',
    kind: 'game', depth: 'skim', minutes: 2,
    blurb: 'Tap to fly a paper plane through a canyon. Do not hit the rocks.',
    hook: 'You will understand it before you finish reading this sentence.',
    tags: ['game', 'play', 'fun', 'arcade', 'quick', 'easy', 'one button', 'tap', 'flappy',
           'plane', 'flying', 'reflex', 'shortest', 'fastest', 'two minutes', 'bored'],
  },
  {
    id: 'comet', title: 'Comet', href: 'play/orbit/index.html',
    kind: 'game', depth: 'skim', minutes: 3,
    blurb: 'Move the mouse. Collect the gold. Do not touch the red. The levels never run out.',
    hook: 'Mines and a spinning bar arrive about level four.',
    tags: ['game', 'play', 'fun', 'arcade', 'mouse', 'dodge', 'levels', 'quick', 'easy',
           'collect', 'reflex', 'bored', 'two minutes'],
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
    id: 'topple', title: 'Topple', href: 'apps/topple/index.html',
    kind: 'physics', depth: 'skim', minutes: 3,
    blurb: 'A perfectly ordinary web page — until you swipe across it and everything '
         + 'your finger touches comes loose and falls.',
    hook: 'Then hit rebuild and watch it put itself back together.',
    tags: ['physics', 'fun', 'satisfying', 'destroy', 'break', 'demolish', 'gravity',
           'rigid body', 'swipe', 'surprising', 'toy', 'party trick', 'wow'],
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
  {
    id: 'flow', title: 'Flow', href: 'play/flow/index.html',
    kind: 'physics', depth: 'skim', minutes: 3,
    blurb: 'Twenty thousand particles riding an invisible current. Push them around and '
         + 'save the result as a picture.',
    hook: 'The prettiest thing here that you can hang on a wall.',
    tags: ['physics', 'particles', 'flow field', 'generative', 'art', 'beautiful', 'pretty',
           'relaxing', 'calm', 'paint', 'draw', 'wallpaper', 'save', 'export'],
  },

  /* ── instruments ──────────────────────────────────────────────────────── */
  {
    id: 'portrait', title: 'Portrait', href: 'play/portrait/index.html',
    kind: 'instrument', depth: 'play', minutes: 4,
    blurb: 'Drop in a photo of your face and watch six thousand dots crawl out of random '
         + 'noise until it is unmistakably you.',
    hook: 'It never leaves your device.',
    tags: ['photo', 'image', 'picture', 'face', 'selfie', 'upload', 'art', 'generative',
           'stipple', 'dots', 'make something', 'personal', 'yours', 'privacy', 'offline',
           'beautiful', 'wow', 'share'],
  },
  {
    id: 'loom', title: 'Loom', href: 'play/loom/index.html',
    kind: 'instrument', depth: 'play', minutes: 6,
    blurb: 'Make a picture by wiring boxes together. One makes fog, one bends whatever it '
         + 'is given, one swaps grey for colour.',
    hook: 'The last box is the picture.',
    tags: ['node editor', 'graph', 'nodes', 'wiring', 'visual programming', 'blender',
           'touchdesigner', 'generative', 'art', 'make something', 'creative', 'shader',
           'texture', 'noise', 'tinker', 'build'],
  },
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
    id: 'morph', title: 'Morph', href: 'play/morph/index.html',
    kind: 'instrument', depth: 'skim', minutes: 3,
    blurb: 'One gallery, seven layouts, and not one CSS transition anywhere.',
    hook: 'Switch again before the tiles land and they bend into the new arrangement mid-flight.',
    tags: ['animation', 'motion', 'layout', 'interface', 'ui', 'ux', 'design', 'spring',
           'physics', 'transition', 'gallery', 'grid', 'frontend', 'css', 'satisfying',
           'interaction design', 'polish'],
  },
  {
    id: 'sift', title: 'Sift', href: 'apps/sift/index.html',
    kind: 'instrument', depth: 'play', minutes: 5,
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

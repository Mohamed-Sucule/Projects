/* tests/navigator.test.mjs — the catalogue and the retrieval behind it.

   Two jobs. The first is that the navigator can never send somebody to a page
   that is not there, which is checked against the actual filesystem rather than
   against my memory of it. The second is that the search behaves like a search
   rather than like a substring filter — that a rare word outranks a common one,
   that a typo still finds the page, and that "I have two minutes" is understood
   as a constraint rather than searched for as words. */

import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './harness.mjs';
import { ATLAS, KINDS, HOME, byId, resolveHref, currentEntry } from '../shared/atlas.js';
import {
  normalise, tokenise, buildIndex, search, detectIntent, explain,
  nearest, withinOneEdit, FEATURED,
} from '../shared/search.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = buildIndex(ATLAS, KINDS);
const top = (q) => search(q, index, { limit: 1 })[0]?.entry.id;
const ids = (q, n = 3) => search(q, index, { limit: n }).map((h) => h.entry.id);

/* ── the catalogue is true ──────────────────────────────────────────────── */

test('every entry points at a page that exists', () => {
  /* The single most important test here. A navigator that offers a 404 is
     worse than no navigator, and this is checked against the disk rather than
     against my recollection of what I named things. */
  for (const entry of [...ATLAS, HOME]) {
    assert.ok(existsSync(join(root, entry.href)), `${entry.id} points at missing ${entry.href}`);
  }
});

test('every page on disk is in the catalogue', () => {
  /* The other direction, which is the one that rots. Adding a page and
     forgetting to list it means it exists and cannot be found, which is the
     same as it not existing. */
  const onDisk = [];
  for (const dir of ['apps', 'play', 'projects']) {
    for (const name of readdirSync(join(root, dir))) {
      const href = `${dir}/${name}/index.html`;
      if (existsSync(join(root, href))) onDisk.push(href);
    }
  }
  const listed = new Set(ATLAS.map((e) => e.href));
  for (const href of onDisk) assert.ok(listed.has(href), `${href} is not in the atlas`);
  assert.equal(listed.size, onDisk.length);
});

test('ids are unique', () => {
  assert.equal(byId.size, ATLAS.length);
});

test('every entry is completely filled in', () => {
  for (const e of ATLAS) {
    assert.ok(e.id && e.title && e.href, `${e.id} is missing a core field`);
    assert.ok(KINDS[e.kind], `${e.id} has an unknown kind "${e.kind}"`);
    assert.ok(['skim', 'play', 'study'].includes(e.depth), `${e.id} has a strange depth`);
    assert.ok(e.minutes > 0 && e.minutes < 60, `${e.id} claims ${e.minutes} minutes`);
    assert.ok(e.blurb.length > 30, `${e.id} has a thin blurb`);
    assert.ok(e.hook.length > 10, `${e.id} has no hook`);
    assert.ok(e.tags.length >= 8, `${e.id} has only ${e.tags.length} tags to be found by`);
  }
});

test('every featured id is a real entry', () => {
  for (const id of FEATURED) assert.ok(byId.has(id), `featured "${id}" is not in the atlas`);
});

test('every title is findable by its own name', () => {
  /* If searching for a thing by its exact name does not return it first, no
     amount of cleverness elsewhere matters. */
  for (const e of ATLAS) {
    assert.equal(top(e.title), e.id, `searching "${e.title}" did not return it first`);
  }
});

/* ── paths ──────────────────────────────────────────────────────────────── */

test('links resolve correctly however the site is served', () => {
  /* The navigator lives in shared/, so the repository root is one level above
     its own module URL. That holds at the root of a domain, in a project
     subdirectory on GitHub Pages, behind a preview server rooted anywhere, and
     from a bare file:// path — none of which a hardcoded absolute path or a
     guess from location.pathname survives together. */
  const cases = [
    ['https://x.dev/shared/navigator.js', 'https://x.dev/apps/tokens/index.html'],
    ['https://x.dev/Projects/shared/navigator.js', 'https://x.dev/Projects/apps/tokens/index.html'],
    ['http://127.0.0.1:8099/shared/navigator.js', 'http://127.0.0.1:8099/apps/tokens/index.html'],
    ['file:///home/me/Projects/shared/navigator.js', 'file:///home/me/Projects/apps/tokens/index.html'],
  ];
  for (const [base, expected] of cases) {
    assert.equal(resolveHref('apps/tokens/index.html', base), expected);
  }
});

test('a page knows which entry it is', () => {
  assert.equal(currentEntry('/apps/tokens/index.html')?.id, 'tokens');
  assert.equal(currentEntry('/play/ace/')?.id, 'ace');
  assert.equal(currentEntry('/Projects/projects/raft-lab/index.html')?.id, 'raft-lab');
  assert.equal(currentEntry('/index.html'), null);
});

/* ── normalising ────────────────────────────────────────────────────────── */

test('light stemming, not aggressive stemming', () => {
  assert.equal(normalise('Transformers'), 'transformer');
  assert.equal(normalise('training'), 'train');
  assert.equal(normalise('trained'), 'train');
  assert.equal(normalise('databases'), 'database');
  /* Left alone: chopping these produces words that match nothing. */
  assert.equal(normalise('physics'), 'physics');
  assert.equal(normalise('css'), 'css');
  assert.equal(normalise('c++'), 'c++');
});

test('stop words are dropped in both their raw and stemmed spellings', () => {
  /* "something" stems to "someth". The first version of the stop list held
     only the raw spelling and the check ran after stemming, so "something"
     survived as a search term and "something fun" ranked documents whose
     blurbs said "make something" above anything that was actually fun. */
  assert.deep(tokenise('something fun'), ['fun']);
  assert.deep(tokenise('show me the things'), []);
  assert.deep(tokenise('what is the best thing here'), ['best']);
});

test('tokenising keeps the characters that carry meaning', () => {
  assert.ok(tokenise('c++ and c#').includes('c++'));
  /* "A/B" splits on the slash and the "a" is a stop word, so what survives is
     "b" — which is fine, because the tag list carries "a/b" and tokenises the
     same way. The thing worth asserting is the behaviour, not the internals. */
  assert.deep(tokenise('A/B test'), ['b', 'test']);
  assert.equal(search('a/b test', index, { limit: 1 })[0].entry.id, 'evals');
});

/* ── ranking ────────────────────────────────────────────────────────────── */

test('a rare word beats a common one', () => {
  /* "induction" appears in one document; "game" in many. A substring filter
     would treat them identically. */
  assert.equal(top('induction'), 'attention');
  assert.equal(top('mcnemar'), 'evals');
  assert.equal(top('oklch'), 'oklch-studio');
  assert.equal(top('raft'), 'raft-lab');
});

test('matching every word beats matching half of them', () => {
  const hits = search('paper plane canyon', index, { limit: 3 });
  assert.equal(hits[0].entry.id, 'ace');
});

test('a typo still finds the page', () => {
  assert.equal(top('attension'), 'attention');
  assert.equal(top('tokeniser'), 'tokens');
  assert.equal(top('regexp'), 'regex-lab');
});

test('a short word is not "corrected" into a different one', () => {
  /* At four letters almost everything is one edit from something else, and a
     wrong correction is worse than no result. */
  assert.equal(nearest('cat', index.vocabulary), null);
  assert.equal(nearest('flow', index.vocabulary), null);
});

test('edit distance of one, counted properly', () => {
  assert.ok(withinOneEdit('attention', 'attension'));
  assert.ok(withinOneEdit('cat', 'cats'));
  assert.ok(withinOneEdit('cats', 'cat'));
  assert.ok(withinOneEdit('abc', 'abc'));
  assert.ok(!withinOneEdit('abc', 'xyz'));
  assert.ok(!withinOneEdit('abc', 'abcde'));
  assert.ok(!withinOneEdit('kitten', 'sitting'));
});

test('the search never comes back empty', () => {
  /* Every dead end still offers something. A blank result list is where people
     decide the box does not work. */
  for (const q of ['', '   ', 'zzzzqqqq', 'asdfghjkl', '🙂', 'the of and', '12345']) {
    assert.ok(search(q, index, { limit: 5 }).length > 0, `"${q}" returned nothing`);
  }
});

test('the same query twice gives the same answer', () => {
  assert.deep(ids('machine learning', 5), ids('machine learning', 5));
});

/* ── intent ─────────────────────────────────────────────────────────────── */

test('a time budget is understood as a constraint, not as words', () => {
  for (const q of ['i have 2 minutes', 'two minutes', 'got 3 mins', 'something quick']) {
    const hits = search(q, index, { limit: 6 });
    assert.ok(hits.length > 0, `"${q}" found nothing`);
    for (const h of hits) {
      assert.ok(h.entry.minutes <= 3, `"${q}" offered a ${h.entry.minutes}-minute piece`);
    }
  }
});

test('a longer budget opens more up', () => {
  const short = search('2 minutes', index, { limit: 30 }).length;
  const long = search('10 minutes', index, { limit: 30 }).length;
  assert.ok(long > short, `10 minutes offered ${long}, 2 minutes offered ${short}`);
});

test('"surprise me" is random, not a search for the word surprise', () => {
  /* "surprise" stems to a real term that one document happens to hold, so
     without checking the intent first, the one query that means "just pick
     something" returned a single careful result. */
  const intent = detectIntent('surprise me');
  assert.equal(intent.random, true);
  const runs = new Set();
  for (let i = 0; i < 25; i++) runs.add(search('surprise me', index, { limit: 1 })[0].entry.id);
  assert.ok(runs.size > 3, `only ${runs.size} distinct results across 25 rolls`);
});

test('asking for the best gets the flagship pieces', () => {
  for (const q of ['whats the best thing here', 'impress me', 'show off', 'the hardest one']) {
    const first = top(q);
    assert.ok(FEATURED.includes(first), `"${q}" returned ${first}, which is not featured`);
  }
});

test('asking where to start gets somewhere sensible', () => {
  assert.ok(FEATURED.includes(top('where do i start')));
});

test('depth is understood', () => {
  const hits = search('something with real depth', index, { limit: 8 });
  for (const h of hits) assert.equal(h.entry.depth, 'study', `${h.entry.id} is not a study piece`);
});

/* ── the plain-English queries people actually type ─────────────────────── */

const EXPECTED = [
  ['the ai stuff', ['frontdesk', 'attention', 'tokens', 'evals', 'agents']],
  ['machine learning', ['attention', 'tokens', 'evals', 'agents']],
  ['murder mystery', ['room']],
  ['scary', ['nightshift']],
  ['play with a friend', ['sumo']],
  ['my own data', ['sift']],
  ['why is it bad at maths', ['tokens']],
  ['did it actually improve', ['evals']],
  ['tool calling', ['agents']],
  ['distributed systems', ['raft-lab']],
  ['merge conflict', ['diff-forge']],
  ['colour palette', ['oklch-studio']],
  ['split the bill', ['split']],
  ['who owes who after the holiday', ['split']],
  ['tune my guitar', ['tuner']],
  ['make a qr code', ['qr']],
  ['wifi password for guests', ['qr']],
  ['minesweeper', ['sweeper']],
  ['sudoku', ['sudoku']],
  ['make a beat', ['beats']],
  ['restaurant', ['covers']],
  ['slow request', ['trace-explorer']],
];

for (const [query, acceptable] of EXPECTED) {
  test(`"${query}" finds ${acceptable.join(' or ')}`, () => {
    const first = top(query);
    assert.ok(acceptable.includes(first),
      `got "${first}", expected one of ${acceptable.join(', ')}`);
  });
}

test('a generic word does not outrank the meaningful one', () => {
  /* In a thirty-document collection, "work" is RARE — so IDF handed it more
     weight than "ai", and "the ai work" returned the restaurant booking system
     on the strength of its "client work" tag. Filler words that are common in
     English and accidentally rare here are stop words now. */
  for (const q of ['machine learning', 'llm']) {
    const four = ids(q, 4);
    assert.deep(four.slice().sort(), ['agents', 'attention', 'evals', 'tokens'],
      `"${q}" returned ${four.join(', ')}`);
    assert.equal(four[0], 'attention', `"${q}" did not lead with the flagship`);
  }
  /* "AI" now also means the AI products, which is right — what must not come
     back is anything that is neither, on the strength of a filler word. */
  for (const q of ['the ai work', 'the ai stuff']) {
    const four = ids(q, 4);
    for (const id of four) assert.ok(['ai', 'ml'].includes(byId.get(id).kind), `"${q}" returned ${four.join(', ')}`);
  }
});

test('a phrase beats the sum of its words', () => {
  /* "machine learning" is one concept. Matching it whole is stronger evidence
     than matching "machine" somewhere and "learn" somewhere else — which is
     how a regular-expression visualiser came second for it, on the strength of
     a "learn" tag. */
  assert.equal(top('machine learning'), 'attention');
  assert.ok(!ids('machine learning', 4).includes('regex-lab'));
  /* And the word on its own still finds it, because the tag is still there. */
  assert.ok(ids('learn about regular expressions', 3).includes('regex-lab'));
});

test('a word that is genuinely specific still works', () => {
  /* The stop list must not have swallowed meaning: "client work" is what
     somebody looking for commissioned software would type. */
  assert.equal(top('client work'), 'covers');
});

/* ── explanations ───────────────────────────────────────────────────────── */

test('every result can say why it is there', () => {
  for (const q of ['transformer', 'i have 2 minutes', 'surprise me', 'best', 'zzzz']) {
    for (const hit of search(q, index, { limit: 3 })) {
      const why = explain(hit, q);
      assert.ok(typeof why === 'string' && why.length > 2, `"${q}" gave a useless reason`);
    }
  }
});

test('a time-budget result explains itself by time, not by matched words', () => {
  const hit = search('i have 2 minutes', index, { limit: 1 })[0];
  assert.ok(/minute/.test(explain(hit, 'i have 2 minutes')));
});

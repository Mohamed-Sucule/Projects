/* tests/front.test.mjs — the promises the front page makes in large type.

   The headline says thirty, with twenty-nine struck out above it, and the
   contact sheet under it is meant to be all of them. Every one of those is a
   hand-written list or number in a page that gets edited often, and the day a
   thirty-first piece is added to the atlas is exactly the day one of them will
   be forgotten — and a contact sheet that silently leaves a frame off still
   looks complete. So the counts are checked against the atlas, which is the
   one list the navigator and the search already trust. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './harness.mjs';
import { ATLAS as EVERYTHING, byId } from '../shared/atlas.js';

/* The AI products are presented on their own at the top of the page; the
   contact sheet and its counts are everything else. */
const ATLAS = EVERYTHING.filter((e) => e.kind !== 'ai');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five', 'twenty-six',
  'twenty-seven', 'twenty-eight', 'twenty-nine', 'thirty', 'thirty-one', 'thirty-two', 'thirty-three'];

const listIn = (name) => {
  const block = html.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(block, `could not find ${name} in index.html`);
  return [...block[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
};

test('the contact sheet carries every project in the atlas, exactly once', () => {
  const seen = new Set();
  for (const id of listIn('SHEET')) {
    assert.ok(byId.has(id), `the sheet lists "${id}", which is not in the atlas`);
    assert.ok(!seen.has(id), `the sheet lists "${id}" twice`);
    seen.add(id);
  }
  for (const e of ATLAS) assert.ok(seen.has(e.id), `${e.title} is in the atlas but not on the contact sheet`);
});

test('every strip of the contact sheet is full, at every width', () => {
  /* Six to a strip on a desk, five on a tablet, three on a phone. A count
     that does not divide leaves a short strip at the bottom, with frames of
     black film where pieces should be. */
  const n = listIn('SHEET').length;
  for (const cols of [6, 5, 3]) assert.equal(n % cols, 0, `${n} frames do not fill strips of ${cols}`);
});

test('every grease-pencil pick is a frame on the sheet', () => {
  const block = html.match(/const PICKS = \{([\s\S]*?)\};/);
  assert.ok(block, 'could not find PICKS');
  const sheet = new Set(listIn('SHEET'));
  for (const [, id] of block[1].matchAll(/(?:^|[\s,{])([a-z][a-z0-9-]*|'[a-z0-9-]+'):/g)) {
    const key = id.replace(/'/g, '');
    assert.ok(sheet.has(key), `"${key}" is marked in grease pencil but has no frame`);
  }
});

test('the headline counts the AI products, and corrects "demos" to "products"', () => {
  const n = EVERYTHING.filter((e) => e.kind === 'ai').length;
  const said = html.match(/<h1 class="headline">\s*<span class="sr">([^<]*)<\/span>/)?.[1] ?? '';
  assert.ok(said.toLowerCase().startsWith(`${WORDS[n]} ai products`),
    `screen readers hear "${said}", but the atlas has ${n} AI products`);
  const struck = html.match(/<span data-pen="strike"[^>]*>([^<]*)<\/span>/)?.[1] ?? '';
  const written = html.match(/<span class="ins[^"]*"[^>]*>([^<]*)<\/span>/)?.[1] ?? '';
  assert.equal(struck, 'demos');
  assert.equal(written, 'products');
  const cases = (html.match(/<a class="case\b/g) ?? []).length;
  assert.equal(cases, n, `§1 shows ${cases} products; the atlas has ${n}`);
  for (const e of EVERYTHING.filter((x) => x.kind === 'ai')) {
    assert.ok(html.includes(`<a class="case reveal" href="${e.href}"`), `${e.title} has no case on the front page`);
  }
});

test('the specification and the way down agree with the atlas', () => {
  const claimed = Number(html.match(/<dd data-atlas-count>(\d+)<\/dd>/)?.[1]);
  assert.equal(claimed, ATLAS.length, `the specification says ${claimed}; the atlas has ${ATLAS.length}`);
  const ai = EVERYTHING.filter((e) => e.kind === 'ai').length;
  assert.equal(Number(html.match(/<dd data-ai-count>(\d+)<\/dd>/)?.[1]), ai);
  const cue = (html.match(/<a class="cue"[^>]*>([^<]*)</)?.[1] ?? '').replace(/&mdash;/g, '—').replace(/\s*&darr;\s*$/, '').trim();
  assert.equal(cue, `The ${WORDS[ai]} products, then ${WORDS[ATLAS.length]} more to play with`, `the cue says "${cue}"`);
});

test('each running head counts what is under it', () => {
  const head = (id) => html.match(new RegExp(`<section class="section" id="${id}"[\\s\\S]*?<span class="nm">([^<]*)</span>`))?.[1];
  const errata = html.match(/<ol class="errata">([\s\S]*?)<\/ol>/)?.[1] ?? '';
  const corrections = (errata.match(/<li\b/g) ?? []).length;
  assert.equal(head('errata'), `${WORDS[corrections]} corrections`);
  const toys = (html.match(/const TOYS = \[([\s\S]*?)\n\];/)?.[1].match(/^\s{2}\{$/gm) ?? []).length;
  assert.equal(head('run'), `${WORDS[toys]} figures`);
  const ml = (html.match(/<section class="section" id="ml"[\s\S]*?<\/section>/)?.[0].match(/<a class="fig\b/g) ?? []).length;
  assert.equal(head('ml'), `${WORDS[ml]} figures`);
  const cases = (html.match(/<a class="case\b/g) ?? []).length;
  assert.equal(head('work'), `${WORDS[cases]} products`);
});

/* The "measured" line under each product is a claim in large-ish type on
   the page most people see first, so it is checked against the product's own
   numbers — the same numbers its page computes and its tests hold it to. */
import { HELD_OUT_FIRST_RUN as FD_FIRST } from '../apps/frontdesk/eval.js';
import { RANDOM_CALLERS } from '../apps/frontdesk/calls.js';
import { HELD_OUT_FIRST_RUN as CC_FIRST } from '../apps/callcoach/labels.js';
import { DOCS } from '../apps/handbook/corpus.js';
import { buildIndex, ask } from '../apps/handbook/search.js';
import { TUNING, HELD_OUT, ROUND_TWO, report } from '../apps/handbook/questions.js';

test('each product’s "measured" line is what the product measures', () => {
  const proof = (id) => html.match(new RegExp(`data-proof="${id}">([^<]*)<`))?.[1] ?? '';
  assert.ok(proof('frontdesk').startsWith(`${FD_FIRST.right} of ${FD_FIRST.cases} phrasings`), proof('frontdesk'));
  assert.ok(proof('frontdesk').includes(`${RANDOM_CALLERS} random callers`), proof('frontdesk'));
  assert.ok(proof('callcoach').startsWith(`${CC_FIRST.exact} of ${CC_FIRST.lines} new lines`), proof('callcoach'));
  const idx = buildIndex(DOCS);
  const sets = [TUNING, HELD_OUT, ROUND_TWO].map((set) => report((q) => ask(idx, q), set));
  const made = sets.reduce((n, r) => n + r.madeUp, 0);
  const total = sets.reduce((n, r) => n + r.total, 0);
  const unans = sets.reduce((n, r) => n + r.unanswerable, 0);
  assert.equal(proof('handbook').replace(/&middot;/g, '·').split(' · ')[0], `made up ${made} answers in ${total} test questions, ${unans} of them unanswerable on purpose`);
});

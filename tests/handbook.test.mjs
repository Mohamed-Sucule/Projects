/* Ask the Handbook: answers must come from the documents, carry their
   source, and give way to "the handbook doesn't say" when it doesn't. */

import { test, assert } from './harness.mjs';
import { DOCS, SECTIONS } from '../apps/handbook/corpus.js';
import { buildIndex, ask, stem, terms, sentences, questionType, parseDocument, locate } from '../apps/handbook/search.js';
import { TUNING, HELD_OUT, ROUND_TWO, HELD_OUT_FIRST_RUN, ROUND_TWO_FIRST_RUN, report, judge } from '../apps/handbook/questions.js';

const index = buildIndex(DOCS);
const asker = (q) => ask(index, q);

test("Porter's stemmer agrees with the published examples", () => {
  const cases = { caresses: 'caress', ponies: 'poni', cats: 'cat', feed: 'feed', agreed: 'agre', plastered: 'plaster',
    motoring: 'motor', sing: 'sing', hopping: 'hop', filing: 'file', happy: 'happi', relational: 'relat',
    conditional: 'condit', valenci: 'valenc', digitizer: 'digit', generalization: 'gener', hopeful: 'hope',
    goodness: 'good', revival: 'reviv', allowance: 'allow', adjustable: 'adjust', probate: 'probat', controll: 'control' };
  for (const [w, want] of Object.entries(cases)) assert.equal(stem(w), want, `${w} → ${stem(w)}`);
});

test('different words for the same thing meet in one concept', () => {
  const has = (text, c) => terms(text).includes(c);
  for (const w of ['holiday', 'vacation', 'annual leave', 'PTO', 'time off']) assert.ok(has(w, '@leave'), w);
  for (const w of ['stolen', 'lost', 'theft']) assert.ok(has(w, '@lost'), w);
  assert.ok(!terms('sick pay').includes('@sick'), '"sick pay" is about pay, not about being sick');
});

test('a full stop inside an email address does not end the sentence', () => {
  const s = sentences('Report it to it-help@haldenpike.example within one hour. IT will wipe it.');
  assert.equal(s.length, 2);
  assert.ok(s[0].text.includes('within one hour'));
});

test('every section of the handbook is findable by its own heading', () => {
  let found = 0;
  for (const s of SECTIONS) {
    if (s.doc.supersededBy) continue;
    const a = ask(index, `${s.heading} ${s.doc.title}`);
    if (!a.refused && a.section.id === s.id) found++;
  }
  const total = SECTIONS.filter((s) => !s.doc.supersededBy).length;
  assert.ok(found / total >= 0.8, `only ${found} of ${total} sections came back for their own headings`);
});

test('every answer is a sentence that really is in the section it cites', () => {
  for (const [q] of [...TUNING, ...HELD_OUT, ...ROUND_TWO]) {
    const a = asker(q);
    if (a.refused) continue;
    for (const part of a.text.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      assert.ok(a.section.text.includes(part.trim()), `"${q}" quoted text that is not in ${a.section.id}: ${part}`);
    }
    assert.ok(locate(a.section, a.sentence.text), `cannot locate the answer for "${q}" to highlight it`);
  }
});

test('a replaced policy is never the answer', () => {
  for (const [q] of [...TUNING, ...HELD_OUT, ...ROUND_TWO]) {
    const a = asker(q);
    assert.ok(a.refused || !a.section.doc.supersededBy, `"${q}" was answered from a replaced policy`);
  }
});

test('but when the old policy said something different, the answer says so', () => {
  const a = asker('What is the hotel limit in London?');
  assert.ok(!a.refused && /£180/.test(a.text));
  assert.ok(a.superseded, 'expected a note about the 2023 policy');
  assert.ok(/£150/.test(a.superseded.section.text));
});

test('the tuning set: nearly everything right, and nothing made up', () => {
  const r = report(asker, TUNING);
  assert.ok(r.right >= 76, `${r.right}/${r.total}`);
  assert.ok(r.madeUp <= 1, `made up ${r.madeUp} answers`);
});

test('the held-out sets never score below their first runs', () => {
  const one = report(asker, HELD_OUT);
  const two = report(asker, ROUND_TWO);
  assert.ok(one.right >= HELD_OUT_FIRST_RUN.right, `round one ${one.right}, first run was ${HELD_OUT_FIRST_RUN.right}`);
  assert.ok(two.right >= ROUND_TWO_FIRST_RUN.right, `round two ${two.right}, first run was ${ROUND_TWO_FIRST_RUN.right}`);
  assert.equal(one.total, HELD_OUT_FIRST_RUN.total);
  assert.equal(two.total, ROUND_TWO_FIRST_RUN.total);
});

test('no question appears in two sets', () => {
  const seen = new Map();
  for (const [name, set] of [['tuning', TUNING], ['round one', HELD_OUT], ['round two', ROUND_TWO]]) {
    for (const [q] of set) {
      const k = q.toLowerCase().replace(/[^a-z0-9]/g, '');
      assert.ok(!seen.has(k), `"${q}" is in ${seen.get(k)} and ${name}`);
      seen.set(k, name);
    }
  }
});

test('every expected section exists', () => {
  const ids = new Set(SECTIONS.map((s) => s.id));
  for (const [q, sec] of [...TUNING, ...HELD_OUT, ...ROUND_TWO]) if (sec) assert.ok(ids.has(sec), `"${q}" expects ${sec}`);
});

test('refusals say why, and point somewhere', () => {
  const a = asker('Can I bring my dog to the office?');
  assert.ok(a.refused);
  assert.ok(a.unknown.includes(stem('dog')), `unknown words were ${a.unknown}`);
  const b = asker('Do we get a Christmas bonus?');
  assert.ok(b.refused && b.nearest, 'expected a refusal with the nearest section');
});

test('judging: the right number from the wrong section is wrong', () => {
  const fake = { refused: false, section: { id: 'sickness/pay' }, text: 'Everyone gets 25 days' };
  assert.equal(judge(fake, ['q', 'leave/allowance', /25 days/]).kind, 'wrong-source');
});

test('question types are read from the question', () => {
  assert.equal(questionType('How much can I spend on a hotel?'), 'amount');
  assert.equal(questionType('When is payday?'), 'time');
  assert.equal(questionType('Can I claim for alcohol?'), 'yesno');
  assert.equal(questionType('Who do I tell if I am ill?'), 'who');
});

test('short answers are read off the quoted sentence, never invented', () => {
  for (const [q] of TUNING) {
    const a = asker(q);
    if (a.refused || !a.short || /^(?:Yes|No)/.test(a.short)) continue;
    assert.ok(a.text.toLowerCase().includes(a.short.toLowerCase()), `"${q}": short answer "${a.short}" is not in the quote`);
  }
});

test('your own documents: headings become sections, and questions find them', () => {
  const mine = parseDocument(`# Office handbook

Dogs
Well-behaved dogs are welcome in the office on Fridays, as long as they stay at your desk.

Parking
There are twelve parking spaces behind the building, booked through the front desk.`, 'Office handbook', 'mine');
  assert.equal(mine.title, 'Office handbook');
  assert.equal(mine.sections.length, 2);
  const both = buildIndex([...DOCS, mine]);
  const a = ask(both, 'Can I bring my dog to the office?');
  assert.ok(!a.refused, 'refused a question the added document answers');
  assert.equal(a.section.id, 'mine/s1');
  const b = ask(both, 'Is there parking at the office?');
  assert.equal(b.section?.id, 'mine/s2');
});

test('a semantic score, when there is one, can only add evidence', () => {
  /* The model is optional and cannot be run in the test environment; this
     checks the plumbing with a stand-in that likes one particular sentence. */
  const target = index.units.find((u) => /Alcohol is not reimbursed/.test(u.text));
  const a = ask(index, 'Can I get reimbursed for wine at a client dinner?', { semantic: (u) => (u === target ? 0.8 : 0.1) });
  assert.ok(!a.refused && a.section.id === 'expenses/meals', 'the semantic hint was ignored');
});

/* Call Coach: what it hears on a sales call, what it puts on screen, and
   whether its notes afterwards are true to what was said. */

import { test, assert } from './harness.mjs';
import { tag, numbers, money, people, questions, analyseCall, createAnalysis, hear, summarise } from '../apps/callcoach/analyse.js';
import { TUNING, HELD_OUT, HELD_OUT_FIRST_RUN, TAGS, score } from '../apps/callcoach/labels.js';
import { CALLS, timeline } from '../apps/callcoach/calls.js';
import { CARDS } from '../apps/callcoach/playbook.js';

const byId = Object.fromEntries(CALLS.map((c) => [c.id, c]));

test('the tuning lines are tagged right', () => {
  const r = score(tag, TUNING);
  assert.ok(r.exact >= TUNING.length - 1, `${r.exact}/${r.lines}: ${r.rows.filter((x) => !x.ok).map((x) => x.text).join(' | ')}`);
  assert.ok(r.recall === 1, `recall ${r.recall}`);
});

test('the held-out lines never score below their first run', () => {
  const r = score(tag, HELD_OUT);
  assert.equal(r.lines, HELD_OUT_FIRST_RUN.lines);
  assert.ok(r.exact >= HELD_OUT_FIRST_RUN.exact, `${r.exact} < ${HELD_OUT_FIRST_RUN.exact}`);
});

test('no line is in both sets, and every label is a known one', () => {
  const t = new Set(TUNING.map((x) => x[0]));
  for (const [text, want] of HELD_OUT) {
    assert.ok(!t.has(text), `in both: ${text}`);
    for (const w of want) assert.ok(TAGS[w], `unknown label ${w}`);
  }
  for (const [, want] of TUNING) for (const w of want) assert.ok(TAGS[w], `unknown label ${w}`);
});

test('every objection type has a card', () => {
  for (const k of Object.keys(TAGS).filter((k) => k.startsWith('objection:') && k !== 'objection:competitor')) {
    const c = CARDS[k.split(':')[1]];
    assert.ok(c && c.means && c.ask && c.say, `no card for ${k}`);
  }
});

test('"just send me an email" is a brush-off, not a next step', () => {
  const t = tag("Maybe. Just send me an email and I'll have a look when things calm down.");
  assert.ok(!t.includes('signal:next-step'));
  assert.ok(t.includes('objection:timing'));
});

test('a question about price is interest, not an objection', () => {
  assert.deep(tag('How much would it be for all six sites?'), ['signal:pricing']);
});

test('numbers are read the way they are said', () => {
  const v = (s) => numbers(s).map((n) => n.value);
  assert.deep(v('a hundred and eighty-nine pounds'), [189]);
  assert.deep(v('two thousand four hundred pounds'), [2400]);
  assert.deep(v('twelve, fifteen no-shows at forty pounds a head'), [12, 15, 40]);
  assert.deep(v('£1,250 and 3 sites'), [1250, 3]);
  assert.deep(money('about ninety pounds a month per site').map((m) => [m.value, m.per]), [[90, 'month']]);
});

test('people are found with their roles', () => {
  const p = people('anything over a few thousand a year goes to Priya, our finance director.');
  assert.deep(p.map((x) => [x.name, x.role]), [['Priya', 'finance director']]);
});

test('open questions are told apart from closed ones', () => {
  const q = questions('What made you take the call? Do you send reminders?');
  assert.deep(q.map((x) => x.open), [true, false]);
});

test('the discovery call: qualified, with the buyer, the pain and the numbers', () => {
  const { summary: s } = analyseCall(byId.discovery);
  assert.equal(s.stage, 'Qualified');
  const f = Object.fromEntries(s.meddicc.map((m) => [m.key, m]));
  assert.ok(/Priya/.test(f.buyer.found[0].quote), 'did not find Priya as the economic buyer');
  assert.ok(f.pain.found.length >= 3, 'expected no-shows, double bookings and admin');
  assert.ok(f.metrics.found.some((m) => /no-shows/.test(m.quote)), 'the no-show numbers are not in the metrics');
  assert.ok(/6 sites × £189/.test(s.crm.size), s.crm.size);
  assert.ok(s.nextSteps.some((n) => n.agreed && /Thursday/.test(n.text)));
  assert.ok(f.champion.found, 'Jamie is a champion: four buying signals and asked for something to show the buyer');
});

test('the finance call: the buyer is on it, and the missing pain is called out', () => {
  const { summary: s } = analyseCall(byId.finance);
  const f = Object.fromEntries(s.meddicc.map((m) => [m.key, m]));
  assert.ok(/on this call/.test(f.buyer.found[0].quote));
  assert.equal(f.pain.found, null);
  assert.ok(f.pain.ask, 'an empty field should become a question to ask');
  assert.ok(f.process.found.some((q) => /June/.test(q.quote)), 'the notice date belongs in the decision process');
  assert.equal(s.objections.filter((o) => !o.answered).length, 0);
});

test('the polite no is called what it is', () => {
  const { summary: s, events } = analyseCall(byId['polite-no']);
  assert.equal(s.stage, 'Nurture');
  assert.ok(/polite no/.test(s.verdict), s.verdict);
  assert.ok(!s.nextSteps.some((n) => n.agreed), 'a brush-off was counted as a next step');
  assert.ok(events.some((e) => e.nudges.some((n) => /pitch/.test(n.text))), 'the pitch-before-discovery nudge never fired');
  assert.ok(/end of April/.test(s.email.body), 'the follow-up should use their own date');
});

test('every quote in the notes and the email was actually said', () => {
  for (const c of CALLS) {
    const said = c.lines.map((l) => l.text).join(' ');
    const { summary: s } = analyseCall(c);
    const quotes = [
      /* Competition and champion are the coach's own words about the call;
         everything else is meant to be the prospect's. */
      ...s.meddicc.filter((m) => !['competition', 'champion'].includes(m.key)).flatMap((m) => (m.found ?? []).map((x) => x.quote)).filter((q) => !/ — on this call/.test(q)),
      ...[...s.email.body.matchAll(/“([^”]+)”/g)].map((m) => m[1]),
    ];
    for (const q of quotes) {
      const core = q.replace(/…$/, '').replace(/^.*— “/, '').replace(/”$/, '');
      assert.ok(said.includes(core), `${c.id}: "${core}" was not said on the call`);
    }
  }
});

test('each card appears once per call, however often it comes up', () => {
  for (const c of CALLS) {
    const { events } = analyseCall(c);
    const keys = events.flatMap((e) => e.cards.map((k) => `${k.type}:${k.key}`));
    assert.equal(keys.length, new Set(keys).size, `${c.id} repeated a card`);
  }
});

test('a call typed in live is analysed the same way', () => {
  const state = createAnalysis({ rep: { name: 'You' }, prospect: { name: 'Sam Lee', role: 'Owner', company: 'Test' } });
  hear(state, { who: 'rep', text: 'What is hardest about bookings for you right now?' });
  const r = hear(state, { who: 'prospect', text: "Honestly it's the no-shows, we get about ten every Saturday. And it's more than we pay now." });
  assert.ok(r.line.tags.includes('pain:no-shows'));
  assert.ok(r.cards.some((c) => c.key === 'price'));
  const s = summarise(state);
  assert.ok(s.meddicc.find((m) => m.key === 'metrics').found);
});

test('the timeline puts every line after the one before', () => {
  for (const c of CALLS) {
    const t = timeline(c.lines);
    for (let i = 1; i < t.length; i++) assert.ok(t[i].at > t[i - 1].at);
  }
});

/* tests/split.test.mjs — money that adds up, and payments that cannot be fewer.

   Two promises. The first is that no penny is ever created or lost: every
   split adds up to its total exactly, and every group's balances add up to
   zero exactly, checked on thousands of random groups rather than on the
   three examples somebody thought of. The second is that the plan really is
   the fewest payments — checked against a brute-force search over every way
   of dividing a small group into parts, which shares no code with the real
   thing. */

import { test, assert } from './harness.mjs';
import {
  parseAmount, shareOut, owedFor, problemWith, balances, settle, naivePayments,
  pack, unpack, example, EXACT_LIMIT,
} from '../apps/split/split.js';

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));

/* ── typing money ─────────────────────────────────────────────────────────── */

test('amounts are read the way people type them', () => {
  const cases = [
    ['12', 1200], ['12.5', 1250], ['12.50', 1250], ['£12.50', 1250], ['€ 7', 700],
    ['1,234.56', 123456], ['12,50', 1250], ['1,234', 123400], ['0.05', 5], ['.5', 50], ['$3.99', 399],
  ];
  for (const [s, c] of cases) assert.equal(parseAmount(s), c, s);
});

test('nonsense is not money', () => {
  for (const s of ['', 'abc', '1.2.3', '12.345', '.', '-5', '1e5']) assert.ok(Number.isNaN(parseAmount(s)), s);
});

/* ── splitting ────────────────────────────────────────────────────────────── */

test('ten pounds three ways is 334, 333 and 333', () => {
  assert.deep(shareOut(1000, [1, 1, 1]), [334, 333, 333]);
});

test('every split adds up to its total, to the penny', () => {
  for (let k = 0; k < 3000; k++) {
    const total = int(1, 500000);
    const weights = Array.from({ length: int(1, 9) }, () => int(0, 5));
    if (!weights.some((w) => w > 0)) continue;
    const parts = shareOut(total, weights);
    assert.equal(parts.reduce((a, b) => a + b, 0), total, `${total} over ${weights}`);
    weights.forEach((w, i) => { if (!w) assert.equal(parts[i], 0, 'a zero share pays nothing'); });
  }
});

test('shares are honoured: two nights costs twice one', () => {
  const owed = owedFor({ amount: 30000, split: 'shares', shares: { a: 2, b: 1 } });
  assert.equal(owed.get('a'), 20000);
  assert.equal(owed.get('b'), 10000);
});

test('an exact split has to add up', () => {
  const ok = { amount: 1000, paidBy: 'a', split: 'exact', amounts: { a: 600, b: 400 } };
  const bad = { ...ok, amounts: { a: 600, b: 300 } };
  assert.equal(problemWith(ok), '');
  assert.ok(/add up/.test(problemWith(bad)));
});

/* ── balances ─────────────────────────────────────────────────────────────── */

function randomGroup(nPeople, nExpenses) {
  const people = Array.from({ length: nPeople }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const expenses = [];
  for (let k = 0; k < nExpenses; k++) {
    const among = people.filter(() => rand() < 0.7).map((p) => p.id);
    if (!among.length) among.push(people[0].id);
    const paidBy = people[int(0, nPeople - 1)].id;
    const r = rand();
    if (r < 0.6) expenses.push({ amount: int(1, 90000), paidBy, split: 'equal', among });
    else if (r < 0.85) expenses.push({ amount: int(1, 90000), paidBy, split: 'shares', shares: Object.fromEntries(among.map((id) => [id, int(1, 3)])) });
    else expenses.push({ kind: 'payment', from: paidBy, to: people[int(0, nPeople - 1)].id, amount: int(1, 5000) });
  }
  return { people, expenses };
}

test('balances always sum to exactly zero', () => {
  for (let k = 0; k < 2000; k++) {
    const { people, expenses } = randomGroup(int(2, 12), int(0, 25));
    const sum = [...balances(people, expenses).values()].reduce((a, b) => a + b, 0);
    assert.equal(sum, 0);
  }
});

test('paying somebody back is the same arithmetic as spending', () => {
  const people = [{ id: 'a' }, { id: 'b' }];
  const dinner = { amount: 2000, paidBy: 'a', split: 'equal', among: ['a', 'b'] };
  assert.equal(balances(people, [dinner]).get('b'), -1000);
  const paid = { kind: 'payment', from: 'b', to: 'a', amount: 1000 };
  assert.equal(balances(people, [dinner, paid]).get('b'), 0);
  assert.deep(settle(balances(people, [dinner, paid])), []);
});

/* ── settling ─────────────────────────────────────────────────────────────── */

const apply = (bal, transfers) => {
  const b = new Map(bal);
  for (const t of transfers) {
    assert.ok(t.amount > 0, 'no zero or negative payments');
    b.set(t.from, b.get(t.from) + t.amount);
    b.set(t.to, b.get(t.to) - t.amount);
  }
  return b;
};

test('the plan leaves everybody square', () => {
  for (let k = 0; k < 800; k++) {
    const { people, expenses } = randomGroup(int(2, 14), int(1, 30));
    const bal = balances(people, expenses);
    for (const [id, v] of apply(bal, settle(bal))) assert.equal(v, 0, `${id} is left at ${v}`);
  }
});

/* The independent check: the most zero-sum parts a set of balances can be
   divided into, by trying every way of dividing it. Bell(8) is 4,140, which
   is nothing. The fewest payments is (people) − (parts). */
function mostParts(values) {
  if (!values.length) return 0;
  let best = 0;
  const assign = (i, parts) => {
    if (i === values.length) {
      if (parts.every((p) => p === 0)) best = Math.max(best, parts.length);
      return;
    }
    for (let j = 0; j < parts.length; j++) { parts[j] += values[i]; assign(i + 1, parts); parts[j] -= values[i]; }
    parts.push(values[i]); assign(i + 1, parts); parts.pop();
  };
  assign(0, []);
  return best;
}

test('the plan is the fewest payments possible, by brute force', () => {
  for (let k = 0; k < 400; k++) {
    /* Balances built to cancel in interesting ways: some pairs, some
       triples, some noise — the cases where greedy gets it wrong. */
    const n = int(2, 8);
    const vals = [];
    while (vals.length < n - 1) {
      const r = rand();
      if (r < 0.4 && vals.length + 2 <= n - 1) { const x = int(1, 40) * 100; vals.push(x, -x); }
      else vals.push((rand() < 0.5 ? -1 : 1) * int(1, 60) * 100);
    }
    vals.push(-vals.reduce((a, b) => a + b, 0));
    const nonzero = vals.filter((v) => v !== 0);
    const bal = new Map(vals.map((v, i) => [`p${i}`, v]));
    const plan = settle(bal);
    assert.equal(plan.length, nonzero.length - mostParts(nonzero), `balances ${vals}`);
  }
});

test('where the usual method takes four payments, the plan takes three', () => {
  /* +2, +2, +3 against −3, −4. Biggest debtor to biggest creditor sends
     −4 to +3 first, and everything after that is mopping up: four payments.
     But +3 and −3 cancel on their own, and +2, +2, −4 is a second group —
     one payment and two, three in all. Found by searching every small case
     for one where the two disagree; there are hundreds. */
  const bal = new Map([['a', 2], ['b', 2], ['c', 3], ['d', -3], ['e', -4]].map(([k, v]) => [k, v * 100]));
  const plan = settle(bal);
  assert.equal(plan.length, 3);
  assert.ok(plan.some((t) => t.from === 'd' && t.to === 'c' && t.amount === 300), 'the pair that cancels settles on its own');
});

test('a big group still settles, one payment per person at most', () => {
  const { people, expenses } = randomGroup(EXACT_LIMIT + 6, 60);
  const bal = balances(people, expenses);
  const plan = settle(bal);
  const owing = [...bal.values()].filter((v) => v !== 0).length;
  assert.ok(plan.length <= Math.max(0, owing - 1), `${plan.length} payments for ${owing} people`);
  for (const v of apply(bal, plan).values()) assert.equal(v, 0);
});

test('the example weekend beats paying everyone back one by one', () => {
  const g = example();
  const plan = settle(balances(g.people, g.expenses));
  const naive = naivePayments(g.people, g.expenses);
  assert.ok(plan.length < naive, `${plan.length} vs ${naive}`);
  assert.ok(plan.length <= g.people.length - 1);
});

/* ── sharing ──────────────────────────────────────────────────────────────── */

test('a group survives the trip through a link', () => {
  const g = example();
  g.expenses.push({ id: 'p', kind: 'payment', from: 'eli', to: 'ben', amount: 1234 });
  g.expenses.push({ id: 'q', what: 'Café — "the good one"', amount: 999, paidBy: 'dev', split: 'exact', amounts: { dev: 500, amira: 499 } });
  const back = unpack(pack(g));
  assert.equal(back.name, g.name);
  assert.equal(back.currency, 'EUR');
  assert.deep(back.people, g.people);
  assert.deep([...balances(back.people, back.expenses)], [...balances(g.people, g.expenses)]);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(pack(g)), 'safe to put in a URL as it is');
});

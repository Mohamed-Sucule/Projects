/* ───────────────────────────────────────────────────────────────────────────
   split/split.js — who owes whom, and the fewest payments that settle it.

   A group goes away together. Somebody books the flat, somebody pays for
   dinner, somebody buys train tickets for four of the five. At the end the
   question is not "who paid what" — every app answers that — it is "what is
   the smallest number of bank transfers that makes everyone square", and
   most apps answer it badly, or with pennies that do not add up.

   MONEY IS WHOLE CENTS. Every amount is an integer number of the smallest
   unit, from the moment it is typed to the moment it is shown. £10 split
   three ways is 334 + 333 + 333, not 3.3333… three times and a penny lost in
   the rounding; the extra cent goes to whoever is first in the list, the same
   way every time, so the sums always close.

   THE FEWEST PAYMENTS. Work out what each person is up or down overall. Now
   look for groups of people whose balances cancel out among themselves: a
   group of k people can always be settled with k − 1 payments, and never
   fewer. So the fewest payments overall is (people with a balance) minus (the
   largest number of separate groups the balances can be split into). Finding
   that split is a search over subsets — exponential in principle, instant
   for any group of friends that fits round a table — and past sixteen people
   it falls back to the usual greedy match of biggest debtor with biggest
   creditor, which is at most one payment per person.

   No DOM here. Everything is plain data a test can drive.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── typing money ────────────────────────────────────────────────────────── */

/**
 * "12", "12.5", "£12.50", "1,234.56", "12,50" → cents. NaN for nonsense.
 *
 * The comma is the awkward one. "1,234" is a thousand and more in London and
 * "12,50" is twelve and a half in Lisbon. The rule: a single comma followed by
 * exactly one or two digits, with no dot anywhere, is a decimal comma;
 * otherwise commas are thousands separators and are ignored.
 */
export function parseAmount(input) {
  let s = String(input ?? '').trim().replace(/[\s£$€¥₹]/g, '').replace(/^(USD|EUR|GBP)/i, '');
  if (!s) return NaN;
  if (!s.includes('.') && /^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === '.') return NaN;
  const [whole, frac = ''] = s.split('.');
  return Number(whole || 0) * 100 + Number((frac + '00').slice(0, 2));
}

/** Cents → "£12.50" in the group's currency, the way the reader's locale writes it. */
export function money(cents, currency = 'GBP', locale) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/* ── sharing an amount out ───────────────────────────────────────────────── */

/**
 * Split `total` cents in proportion to `weights`, as whole cents that add up
 * to exactly `total`. Largest remainder: everyone gets the floor of their
 * share, and the cents left over go to the largest fractional parts, ties to
 * whoever comes first.
 */
export function shareOut(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}

/**
 * What each person owes towards one expense, as a Map of id → cents.
 *
 *   { split: 'equal',  among: [ids] }
 *   { split: 'shares', shares: { id: n } }      — two shares for the one who had two nights
 *   { split: 'exact',  amounts: { id: cents } } — must add up to the total
 */
export function owedFor(expense) {
  const out = new Map();
  if (expense.split === 'exact') {
    for (const [id, c] of Object.entries(expense.amounts ?? {})) if (c) out.set(id, c);
    return out;
  }
  const ids = expense.split === 'shares'
    ? Object.keys(expense.shares ?? {}).filter((id) => expense.shares[id] > 0)
    : expense.among ?? [];
  const weights = expense.split === 'shares' ? ids.map((id) => expense.shares[id]) : ids.map(() => 1);
  shareOut(expense.amount, weights).forEach((c, i) => out.set(ids[i], (out.get(ids[i]) ?? 0) + c));
  return out;
}

/** Whether an expense is well formed; a reason if it is not. */
export function problemWith(expense) {
  if (expense.kind === 'payment') {
    if (!(expense.amount > 0)) return 'a payment needs an amount';
    if (expense.from === expense.to) return 'somebody cannot pay themselves';
    return '';
  }
  if (!(expense.amount > 0)) return 'it needs an amount';
  if (!expense.paidBy) return 'somebody has to have paid';
  const owed = owedFor(expense);
  if (!owed.size) return 'it has to be split between somebody';
  if (expense.split === 'exact') {
    const sum = [...owed.values()].reduce((a, b) => a + b, 0);
    if (sum !== expense.amount) return `the shares add up to ${sum / 100}, not ${expense.amount / 100}`;
  }
  return '';
}

/* ── balances ────────────────────────────────────────────────────────────── */

/**
 * id → cents. Positive: the group owes them. Negative: they owe the group.
 * Always sums to exactly zero, which the tests check on thousands of random
 * groups, because a balance sheet that is a penny out is a balance sheet
 * nobody trusts again.
 *
 * A payment — somebody settling up — is just another line: the payer is up
 * by it and the payee is down by it, so settling is the same arithmetic as
 * spending, and marking a transfer as paid makes it drop out of the plan.
 */
export function balances(people, expenses) {
  const b = new Map(people.map((p) => [p.id, 0]));
  const add = (id, c) => { if (b.has(id)) b.set(id, b.get(id) + c); };
  for (const e of expenses) {
    if (problemWith(e)) continue;
    if (e.kind === 'payment') { add(e.from, e.amount); add(e.to, -e.amount); continue; }
    add(e.paidBy, e.amount);
    for (const [id, c] of owedFor(e)) add(id, -c);
  }
  return b;
}

/* ── settling ────────────────────────────────────────────────────────────── */

/** Largest debtor pays largest creditor until everyone is square. */
function greedy(entries) {
  const debt = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const cred = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const out = [];
  const byBig = (a, b) => b.v - a.v || (a.id < b.id ? -1 : 1);
  while (debt.length && cred.length) {
    debt.sort(byBig); cred.sort(byBig);
    const d = debt[0], c = cred[0], x = Math.min(d.v, c.v);
    out.push({ from: d.id, to: c.id, amount: x });
    d.v -= x; c.v -= x;
    if (!d.v) debt.shift();
    if (!c.v) cred.shift();
  }
  return out;
}

export const EXACT_LIMIT = 16;

/**
 * The fewest transfers that settle a set of balances.
 *
 * best[mask] is the most zero-sum groups the people in `mask` can be split
 * into: take the best for the set with one person removed, and if the set
 * itself sums to zero, that is one more group. The partition is then read
 * back out one group at a time — each one a zero-sum set that the rest can
 * do without — and each group settled greedily, which inside a group that
 * cannot be split further takes exactly one payment fewer than its size.
 */
export function settle(balanceMap) {
  const entries = [...balanceMap].filter(([, v]) => v !== 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const n = entries.length;
  if (n === 0) return [];
  if (n > EXACT_LIMIT) return greedy(entries);

  const full = (1 << n) - 1;
  const sum = new Float64Array(full + 1);
  const best = new Uint8Array(full + 1);
  for (let m = 1; m <= full; m++) {
    const low = m & -m, i = 31 - Math.clz32(low);
    sum[m] = sum[m ^ low] + entries[i][1];
    let b = 0;
    for (let rest = m; rest; rest &= rest - 1) {
      const bit = rest & -rest;
      if (best[m ^ bit] > b) b = best[m ^ bit];
    }
    best[m] = b + (sum[m] === 0 ? 1 : 0);
  }

  const out = [];
  let mask = full;
  while (mask) {
    /* The group containing the lowest-numbered person still unsettled:
       smallest zero-sum subset that leaves the best partition of the rest. */
    const low = mask & -mask;
    const others = mask ^ low;
    let pick = mask;
    for (let s = others; ; s = (s - 1) & others) {
      const g = s | low;
      if (sum[g] === 0 && best[mask ^ g] === best[mask] - 1) {
        if (popcount(g) < popcount(pick)) pick = g;
      }
      if (!s) break;
    }
    const group = [];
    for (let i = 0; i < n; i++) if (pick & (1 << i)) group.push(entries[i]);
    out.push(...greedy(group));
    mask ^= pick;
  }
  return out;
}

function popcount(x) {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
}

/**
 * How many payments it takes if nobody is clever: everyone pays back each
 * person who paid for something they shared, netted per pair. It is the
 * number the fewest-payments plan is up against, and on a real weekend away
 * it is usually two or three times as many.
 */
export function naivePayments(people, expenses) {
  const pair = new Map();
  const add = (from, to, c) => {
    if (from === to) return;
    const [a, b, sign] = from < to ? [from, to, 1] : [to, from, -1];
    const k = `${a}\u0000${b}`;
    pair.set(k, (pair.get(k) ?? 0) + sign * c);
  };
  const ids = new Set(people.map((p) => p.id));
  for (const e of expenses) {
    if (problemWith(e) || e.kind === 'payment') continue;
    for (const [id, c] of owedFor(e)) if (ids.has(id)) add(id, e.paidBy, c);
  }
  let n = 0;
  for (const v of pair.values()) if (v !== 0) n++;
  return n;
}

/* ── sharing a group ─────────────────────────────────────────────────────── */

/**
 * The whole group as a URL-safe string, so one link puts everybody on the
 * same page. Compact keys, base64url; no server involved, and nothing about
 * the group is ever sent anywhere except inside the link itself.
 */
export function pack(state) {
  const json = JSON.stringify({
    v: 1, c: state.currency, n: state.name,
    p: state.people.map((p) => [p.id, p.name]),
    e: state.expenses.map((e) => e.kind === 'payment'
      ? ['$', e.from, e.to, e.amount]
      : [e.what, e.amount, e.paidBy, e.split === 'equal' ? e.among : e.split === 'shares' ? { s: e.shares } : { x: e.amounts }]),
  });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unpack(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  if (o.v !== 1) throw new Error('not a group this version understands');
  let k = 0;
  return {
    currency: o.c, name: o.n,
    people: o.p.map(([id, name]) => ({ id, name })),
    expenses: o.e.map((e) => {
      const id = `e${++k}`;
      if (e[0] === '$' && e.length === 4) return { id, kind: 'payment', from: e[1], to: e[2], amount: e[3] };
      const [what, amount, paidBy, s] = e;
      if (Array.isArray(s)) return { id, what, amount, paidBy, split: 'equal', among: s };
      if (s.s) return { id, what, amount, paidBy, split: 'shares', shares: s.s };
      return { id, what, amount, paidBy, split: 'exact', amounts: s.x };
    }),
  };
}

/* ── a weekend to start from ─────────────────────────────────────────────── */

/** So the page opens on something worth settling instead of an empty form. */
export function example() {
  const people = ['Amira', 'Ben', 'Chloe', 'Dev', 'Eli'].map((name) => ({ id: name.toLowerCase(), name }));
  const all = people.map((p) => p.id);
  let k = 0;
  const e = (what, amount, paidBy, among = all) => ({ id: `x${++k}`, what, amount, paidBy, split: 'equal', among });
  return {
    name: 'Weekend in Lisbon', currency: 'EUR', people,
    expenses: [
      { ...e('The flat, two nights', 48000, 'ben'), split: 'shares', shares: { amira: 2, ben: 2, chloe: 2, dev: 2, eli: 1 } },
      e('Dinner at Cervejaria', 14260, 'chloe'),
      e('Train to Sintra', 9600, 'amira', ['amira', 'ben', 'chloe', 'dev']),
      e('Palace tickets', 6000, 'dev', ['amira', 'chloe', 'dev', 'eli']),
      e('Groceries', 5325, 'eli'),
      e('Drinks by the river', 3800, 'ben', ['ben', 'dev', 'eli']),
      e('Taxi back from Alfama', 2740, 'amira'),
      e('Pastéis de nata', 1150, 'chloe', ['amira', 'chloe']),
    ],
  };
}

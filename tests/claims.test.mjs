/* Claims Desk: read the paperwork, check it against the policy and against
   itself, recommend — and never recommend without evidence. */

import { test, assert } from './harness.mjs';
import { CASES, POLICIES, WORDING, totals } from '../apps/claims/cases.js';
import { lines } from '../apps/claims/render.js';
import { readForm, readInvoice, readEmail, parseMoney, parseDate, policyNumber } from '../apps/claims/read.js';
import { assess, claimKind } from '../apps/claims/assess.js';

const read = (c, formText = lines(c, 'form').join('\n'), invText = lines(c, 'invoice').join('\n')) => ({
  form: readForm(formText), invoice: readInvoice(invText), email: readEmail(c.email, c.received),
});
const run = (c, r = read(c)) => assess(r, { received: c.received });

/* OCR's usual mistakes, applied at random but reproducibly. */
function noisy(text, seed, p) {
  let s = seed;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const swaps = { 0: 'O', 1: 'l', 5: 'S', 8: 'B', '£': 'E', O: '0', l: '1', ',': '.', '/': '/' };
  let out = '';
  for (const ch of text) {
    if (ch !== '\n' && swaps[ch] && r() < p) out += swaps[ch];
    else if (ch === ' ' && r() < p / 3) out += '  ';
    else out += ch;
  }
  return out;
}

test('every claim gets the decision and payout a claims handler would give', () => {
  for (const c of CASES) {
    const r = run(c);
    assert.equal(r.decision, c.truth.decision, `${c.id}: ${r.decision}`);
    assert.equal(r.payout, c.truth.payout, `${c.id}: paid ${r.payout}`);
  }
});

test('every check points at its evidence', () => {
  for (const c of CASES) {
    for (const k of run(c).checks) {
      assert.ok(k.evidence.length, `${c.id}: "${k.label}" has no evidence`);
      for (const e of k.evidence) if (e.doc === 'wording') assert.ok(WORDING[e.clause], `${c.id}: cites a clause that does not exist: ${e.clause}`);
    }
  }
});

test('a decline quotes the clause that decides it', () => {
  const r = run(CASES.find((c) => c.id === 'laptop'));
  assert.equal(r.decision, 'decline');
  assert.ok(r.reply.body.includes(WORDING['contents-ad'].text));
  assert.ok(/Ombudsman/.test(r.reply.body), 'a decline must say how to appeal');
});

test('a referral asks the customer for something, and accuses them of nothing', () => {
  const r = run(CASES.find((c) => c.id === 'bike'));
  assert.equal(r.decision, 'refer');
  assert.ok(/original receipt/.test(r.reply.body));
  assert.ok(!/fraud|suspici|investigat/i.test(r.reply.body), 'the letter to the customer must not accuse them');
  const flagged = r.checks.filter((k) => k.status === 'refer').map((k) => k.id).sort();
  assert.deep(flagged, ['new-policy', 'receipt-date']);
  assert.ok(r.checks.some((k) => k.status === 'partial' && k.id === 'limit'), 'the unlisted bike limit was missed');
});

test('the paperwork adds up the way the documents say', () => {
  for (const c of CASES) {
    const t = totals(c.invoice);
    const inv = readInvoice(lines(c, 'invoice').join('\n')).fields;
    assert.equal(inv.total, t.total, c.id);
  }
});

test('OCR-style mistakes are read through', () => {
  assert.equal(parseMoney('E2,340.00'), 2340);
  assert.equal(parseMoney('£2,34000'), 2340);
  assert.equal(parseMoney('f640.O0'), 640);
  assert.equal(parseDate('l7/Ol/2026'), '2026-01-17');
  assert.equal(parseDate('O3.O2.2O26'), '2026-02-03');
  assert.equal(policyNumber('Policy number: NG-44Tl-2290'.replace('T', '7')), 'NG-4471-2290');
});

test('on noisy scans, nearly every field still comes through', () => {
  const keys = ['name', 'policy', 'incident', 'reported', 'amount'];
  let right = 0, total = 0, decisions = 0, runs = 0;
  for (const c of CASES) {
    const clean = read(c);
    for (let seed = 1; seed <= 60; seed++) {
      const r = read(c, noisy(lines(c, 'form').join('\n'), seed, 0.04), noisy(lines(c, 'invoice').join('\n'), seed + 999, 0.04));
      for (const k of keys) { total++; if (r.form.fields[k] === clean.form.fields[k]) right++; }
      total++; if (r.invoice.fields.total === clean.invoice.fields.total) right++;
      runs++;
      const got = run(c, r).decision;
      if (got === c.truth.decision) decisions++;
      /* A misread may send a claim to a person. It must never pay a claim
         that should not be paid, or turn down one that should. */
      else assert.equal(got, 'refer', `${c.id} seed ${seed}: noise turned ${c.truth.decision} into ${got}`);
    }
  }
  assert.ok(right / total > 0.95, `only ${right}/${total} fields survived the noise`);
  assert.ok(decisions / runs > 0.9, `only ${decisions}/${runs} decisions survived the noise`);
});

test('the rules follow the policy when the facts change', () => {
  const base = CASES.find((c) => c.id === 'pipe');
  const vary = (formChanges, invChanges = null) => {
    const c = { ...base, form: { ...base.form, ...formChanges }, invoice: invChanges ? { ...base.invoice, ...invChanges } : base.invoice };
    return run(c);
  };
  assert.equal(vary({ 'Date of incident': '10/06/2026' }).decision, 'decline', 'after the policy ended');
  assert.equal(vary({ 'Amount claimed': '£2,900.00' }).decision, 'refer', 'claimed more than the invoice');
  assert.equal(vary({ 'Date reported': '28/02/2026' }).decision, 'refer', 'reported after 30 days');
  assert.equal(vary({ 'Policyholder name': 'Sam Jones' }).decision, 'refer', 'not the policyholder');
  assert.equal(vary({}, { lines: [['Emergency call-out, 17 Jan', 180], ['Repair burst pipe in loft', 240]] }).decision, 'refer', 'invoice total no longer matches the form');
  assert.equal(vary({ 'Policy number': 'NG-0000-0000' }).decision, 'refer', 'unknown policy');
});

test('the kind of claim is read from what happened', () => {
  assert.equal(claimKind('Other', 'water came through the ceiling from a leak'), 'escape of water');
  assert.equal(claimKind('Theft', ''), 'theft');
  assert.equal(claimKind('', 'I knocked it off the table by accident'), 'accidental damage');
});

test('every policy on file is well formed', () => {
  for (const p of Object.values(POLICIES)) {
    assert.ok(p.start < p.end, p.number);
    for (const s of p.sections) assert.ok(WORDING[s], `${p.number}: unknown section ${s}`);
  }
});

/* ───────────────────────────────────────────────────────────────────────────
   claims/assess.js — from facts to a recommendation a person can check.

   The desk never decides a claim. It recommends, and every line of the
   recommendation points at its evidence: a clause of the policy wording, a
   field on the form, a line on the invoice, a sentence of the email. The
   claims handler reads the checks, looks at anything amber or red, and
   approves or overrides. That is not a limitation added for the demo; it is
   what an insurer would require, and it is what makes the tool fast rather
   than risky — nine checks read in thirty seconds instead of three
   documents read in ten minutes.

   Four outcomes:
     approve  — covered, consistent, pay the claim less the excess
     partial  — covered, but a limit applies
     decline  — not covered by this policy, with the clause that says so
     refer    — probably fine, but something a person must look at first
   ─────────────────────────────────────────────────────────────────────────── */

import { WORDING, EXCESS, BIKE_LIMIT, INSURER, POLICIES } from './cases.js';

const day = 864e5;
const days = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / day);
const nice = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—');
const gbp = (n) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const surname = (s) => String(s ?? '').trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, '') ?? '';

/* What kind of claim, from the words on the form. */
export function claimKind(type, what = '') {
  const t = `${type} ${what}`.toLowerCase();
  if (/escape of water|burst|leak|pipe|water came/.test(t)) return 'escape of water';
  if (/theft|stolen|burglar/.test(t)) return 'theft';
  if (/accident|dropped|knocked|spill/.test(t)) return 'accidental damage';
  if (/storm|wind|roof/.test(t)) return 'storm';
  if (/fire|smoke/.test(t)) return 'fire';
  return 'other';
}

/**
 * Assess a claim from what was read off its documents.
 * `read` = { form, invoice, email } — the outputs of read.js.
 */
export function assess({ form, invoice, email }, { received }) {
  const checks = [];
  const add = (id, label, status, detail, evidence = []) => checks.push({ id, label, status, detail, evidence });
  const f = form.fields, inv = invoice.fields;

  /* ── who, and which policy ── */
  const policy = POLICIES[f.policy] ?? null;
  if (!policy) {
    add('policy', 'Policy found', 'fail', `No policy numbered ${f.policy ?? '(unreadable)'} — check the number on the form.`, [{ doc: 'form', field: 'policy' }]);
    return finish(checks, null, f, inv, received, null);
  }
  add('policy', 'Policy found', 'pass', `${policy.number}, ${policy.holder}.`, [{ doc: 'form', field: 'policy' }, { doc: 'policy' }]);

  const nameOK = surname(f.name) === surname(policy.holder);
  add('name', 'Name matches the policy', nameOK ? 'pass' : 'refer',
    nameOK ? `${f.name} is the policyholder.` : `The form says ${f.name}; the policy is in the name of ${policy.holder}.`,
    [{ doc: 'form', field: 'name' }, { doc: 'policy' }]);

  /* ── in force? ── */
  const inForce = f.incident && f.incident >= policy.start && f.incident <= policy.end;
  add('in-force', 'Policy in force on the day', f.incident ? (inForce ? 'pass' : 'fail') : 'refer',
    f.incident ? (inForce ? `${nice(f.incident)} is inside ${nice(policy.start)} – ${nice(policy.end)}.` : `${nice(f.incident)} is outside the policy period (${nice(policy.start)} – ${nice(policy.end)}).`) : 'Could not read the date of the incident.',
    [{ doc: 'form', field: 'incident' }, { doc: 'policy' }]);

  /* ── covered? ── */
  const kind = claimKind(f.type, f.what);
  let cover = null, coverStatus = 'pass', coverDetail = '';
  if (kind === 'accidental damage') {
    cover = policy.options.includes('accidental-damage') ? 'contents' : null;
    coverStatus = cover ? 'pass' : 'fail';
    coverDetail = cover ? 'Accidental damage is on the schedule.' : 'Accidental damage is not on this policy’s schedule — the policy covers contents against fire, storm, flood, theft and escape of water only.';
    add('cover', 'Covered by the policy', coverStatus, coverDetail, [{ doc: 'wording', clause: 'contents-ad' }, { doc: 'policy' }, { doc: 'form', field: 'type' }]);
  } else if (kind === 'theft' && /outside|rack|gym|street|away|station|car park/i.test(f.what ?? '')) {
    cover = policy.options.includes('away') ? 'away' : null;
    coverStatus = cover ? 'pass' : 'fail';
    add('cover', 'Covered by the policy', coverStatus, cover ? 'Theft away from home, under the Out and about option on the schedule.' : 'Stolen away from home, and Out and about is not on the schedule.', [{ doc: 'wording', clause: 'away' }, { doc: 'policy' }, { doc: 'form', field: 'what' }]);
  } else {
    const section = kind === 'escape of water' && policy.sections.includes('buildings') ? 'buildings' : 'contents';
    cover = policy.sections.includes(section) ? section : null;
    coverStatus = cover ? 'pass' : 'fail';
    add('cover', 'Covered by the policy', coverStatus, cover ? `${kind[0].toUpperCase()}${kind.slice(1)} is covered under ${WORDING[section].title.split(' — ')[1]}.` : `${kind} is not covered by the sections on this policy.`, [{ doc: 'wording', clause: section }, { doc: 'policy' }, { doc: 'form', field: 'type' }]);
  }

  /* ── told us in time? ── */
  if (f.incident && f.reported) {
    const late = days(f.incident, f.reported);
    add('notify', 'Reported within 30 days', late <= 30 && late >= 0 ? 'pass' : 'refer', late >= 0 ? `Reported ${late} day${late === 1 ? '' : 's'} after the incident.` : 'The report date is before the incident — check both dates.', [{ doc: 'form', field: 'incident' }, { doc: 'form', field: 'reported' }, { doc: 'wording', clause: 'notify' }]);
  }

  /* ── do the documents agree with each other? ── */
  if (email.incident && f.incident) {
    const same = email.incident === f.incident;
    add('dates-agree', 'Email and form agree on the date', same ? 'pass' : 'refer', same ? `Both say ${nice(f.incident)}.` : `The email says ${nice(email.incident)}; the form says ${nice(f.incident)}.`, [{ doc: 'email', text: email.dates[0]?.text }, { doc: 'form', field: 'incident' }]);
  }
  if (inv.total != null && f.amount != null) {
    const same = Math.abs(inv.total - f.amount) < 0.01;
    add('amounts-agree', 'Amount claimed matches the paperwork', same ? 'pass' : 'refer', same ? `${gbp(f.amount)} on the form, ${gbp(inv.total)} on the ${inv.kind}.` : `${gbp(f.amount)} claimed, but the ${inv.kind} totals ${gbp(inv.total)}.`, [{ doc: 'form', field: 'amount' }, { doc: 'invoice', field: 'total' }]);
  }
  if (inv.items.length && inv.total != null) {
    const net = Math.round(inv.items.reduce((s, i) => s + (i.amount ?? 0), 0) * 100) / 100;
    const expect = inv.vat != null ? Math.round((net + inv.vat) * 100) / 100 : net;
    const vatOK = inv.vat == null || Math.abs(inv.vat - Math.round(net * 20) / 100) < 0.02;
    const ok = Math.abs(expect - inv.total) < 0.02 && vatOK;
    add('arithmetic', `The ${inv.kind} adds up`, ok ? 'pass' : 'refer', ok ? `${inv.items.length} line${inv.items.length === 1 ? '' : 's'}${inv.vat != null ? ' plus VAT at 20%' : ''} make${inv.items.length === 1 && inv.vat == null ? 's' : ''} ${gbp(inv.total)}.` : `The lines come to ${gbp(expect)}, but the total says ${gbp(inv.total)}.`, [{ doc: 'invoice', field: 'items' }, { doc: 'invoice', field: 'total' }]);
  }
  if (inv.to || inv.supplier) {
    const addressed = inv.to ? inv.to.toLowerCase().includes(surname(policy.holder)) : false;
    add('addressed', `The ${inv.kind} is in their name`, addressed ? 'pass' : 'refer', addressed ? `Made out to ${inv.to}.` : `Not made out to ${policy.holder}.`, [{ doc: 'invoice', field: 'to' }]);
  }
  if (inv.date && f.incident) {
    if (inv.kind === 'receipt') {
      /* A receipt is proof of ownership, so it has to come before the loss. */
      const before = inv.date <= f.incident;
      add('receipt-date', 'Proof of purchase is from before the loss', before ? 'pass' : 'refer', before ? `Bought ${nice(inv.date)}.` : `The receipt is dated ${nice(inv.date)} — ${days(f.incident, inv.date)} days after the theft. A receipt for something already stolen needs explaining.`, [{ doc: 'invoice', field: 'date' }, { doc: 'form', field: 'incident' }, { doc: 'wording', clause: 'proof' }]);
    } else {
      const after = inv.date >= f.incident;
      add('repair-date', `The ${inv.kind} is from after the incident`, after ? 'pass' : 'refer', after ? `Dated ${nice(inv.date)}, ${days(f.incident, inv.date)} days after.` : `Dated ${nice(inv.date)}, before the incident happened.`, [{ doc: 'invoice', field: 'date' }, { doc: 'form', field: 'incident' }]);
    }
  }

  /* ── theft conditions ── */
  if (kind === 'theft') {
    add('police', 'Crime reference given', f.crimeRef ? 'pass' : 'refer', f.crimeRef ? `Reported to the police: ${f.crimeRef}.` : 'No crime reference on the form.', [{ doc: 'form', field: 'crimeRef' }, { doc: 'wording', clause: 'police' }]);
  }

  /* ── limits ── */
  let limit = null;
  if (/\bbike|bicycle|cycle\b/i.test(`${f.what} ${inv.items.map((i) => i.desc).join(' ')}`)) {
    const specified = policy.specified.some((s) => /bike|bicycle/i.test(s));
    const value = inv.total ?? f.amount;
    if (!specified && value > BIKE_LIMIT) {
      limit = BIKE_LIMIT;
      add('limit', 'Within the policy limits', 'partial', `The bike is worth ${gbp(value)} but is not listed on the schedule, so the most payable is ${gbp(BIKE_LIMIT)}.`, [{ doc: 'wording', clause: 'bikes' }, { doc: 'policy' }]);
    } else add('limit', 'Within the policy limits', 'pass', specified ? 'The bike is listed on the schedule.' : `Under the ${gbp(BIKE_LIMIT)} unlisted bicycle limit.`, [{ doc: 'wording', clause: 'bikes' }]);
  }

  /* ── things a person should look at ── */
  if (f.incident && days(policy.start, f.incident) <= 14 && days(policy.start, f.incident) >= 0) {
    add('new-policy', 'Not straight after the policy started', 'refer', `The incident was ${days(policy.start, f.incident)} days after the policy started on ${nice(policy.start)}.`, [{ doc: 'policy' }, { doc: 'form', field: 'incident' }, { doc: 'wording', clause: 'new-policy' }]);
  }

  return finish(checks, policy, f, inv, received, { kind, cover, limit });
}

function finish(checks, policy, f, inv, received, ctx) {
  const has = (s) => checks.some((c) => c.status === s);
  let decision;
  if (!policy || has('fail')) decision = 'decline';
  else if (has('refer')) decision = 'refer';
  else if (has('partial')) decision = 'partial';
  else decision = 'approve';
  if (!policy) decision = 'refer';

  const excess = ctx?.kind === 'escape of water' ? EXCESS['escape of water'] : EXCESS.standard;
  const claimed = f.amount ?? inv.total ?? 0;
  const basis = Math.min(claimed, inv.total ?? claimed, ctx?.limit ?? Infinity);
  const payout = decision === 'decline' || !policy ? 0 : Math.max(0, Math.round((basis - excess) * 100) / 100);

  return { checks, decision, payout, excess, basis, claimed, policy, kind: ctx?.kind ?? null, reply: reply(decision, { f, inv, policy, payout, excess, basis, claimed, checks, ctx }) };
}

/* ── the letter ──────────────────────────────────────────────────────────── */

function reply(decision, { f, inv, policy, payout, excess, basis, claimed, checks, ctx }) {
  const first = (policy?.holder ?? f.name ?? 'there').split(' ')[0];
  const sign = `\n\nKind regards,\nClaims team, ${INSURER.name}`;
  const ref = policy ? `Your policy: ${policy.number}` : '';
  if (decision === 'approve') {
    return {
      subject: `Your claim is approved — ${gbp(payout)}`,
      body: `Dear ${first},\n\nThank you for sending everything so quickly. We have approved your claim for ${ctx.kind} on ${nice(f.incident)}.\n\nThe ${inv.kind} comes to ${gbp(claimed)}. Your policy has a ${gbp(excess)} excess for this kind of claim, so we will pay ${gbp(payout)} into your account within five working days.\n\nIf anything else comes to light — damage that appears later as things dry out, for example — just reply to this email.\n\n${ref}${sign}`,
    };
  }
  if (decision === 'decline') {
    const why = checks.find((c) => c.status === 'fail');
    const clause = why?.evidence.find((e) => e.doc === 'wording')?.clause;
    return {
      subject: 'About your claim',
      body: `Dear ${first},\n\nThank you for your claim, and I'm sorry to hear about the ${ctx?.kind ?? 'damage'}. I'm afraid we can't pay it, and I want to explain exactly why.\n\n${why?.detail ?? ''}\n\nThe part of your policy that applies says: “${WORDING[clause]?.text ?? ''}”\n\nIf you think we have misunderstood what happened, or you have cover elsewhere on your schedule that you think applies, please reply and a claims handler will look at it again. You also have the right to ask the Financial Ombudsman Service to review our decision.\n\n${ref}${sign}`,
    };
  }
  if (decision === 'partial') {
    return {
      subject: `Your claim is approved in part — ${gbp(payout)}`,
      body: `Dear ${first},\n\nWe have accepted your claim. ${checks.find((c) => c.status === 'partial')?.detail} After the ${gbp(excess)} excess, we will pay ${gbp(payout)}.\n\n${ref}${sign}`,
    };
  }
  /* refer — the customer is told what happens next, not that they are suspected of anything */
  const asks = [];
  for (const c of checks.filter((x) => x.status === 'refer')) {
    if (c.id === 'receipt-date') asks.push('the original receipt or bank statement from when the bike was bought — the receipt you sent is dated after the theft, which may be a reprint, and the original will settle it');
    else if (c.id === 'name') asks.push('confirmation of who the item belongs to');
    else if (c.id === 'amounts-agree') asks.push('the invoice or quote that matches the amount you have claimed');
    else if (c.id === 'police') asks.push('the police crime reference number');
  }
  const limitNote = checks.find((c) => c.status === 'partial');
  return {
    subject: 'Your claim — one more thing we need',
    body: `Dear ${first},\n\nThank you for your claim. A member of our claims team will look after it personally and will be in touch within two working days.${asks.length ? `\n\nTo keep things moving, please send us:\n${asks.map((a) => `• ${a}`).join('\n')}` : ''}${limitNote ? `\n\nSo you know in advance: ${limitNote.detail.replace('the most payable is', 'the most your policy can pay for it is')}` : ''}\n\n${ref}${sign}`,
  };
}

export { nice, gbp };

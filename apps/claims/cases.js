/* ───────────────────────────────────────────────────────────────────────────
   claims/cases.js — an insurer, its policy wording, three customers and the
   paperwork they sent.

   Northgate Home Insurance does not exist. Its wording is written the way
   home policies are: a cover section, the things that section does not
   cover, an excess, a limit, and the conditions a claim has to meet. Every
   decision the desk makes has to point at a line of this wording or at a
   field on one of the customer's documents — never at nothing.

   The three claims are chosen to need three different answers: one that
   should simply be paid, one the policy does not cover, and one that is
   probably genuine but has three things wrong with it that a claims
   handler is paid to notice.
   ─────────────────────────────────────────────────────────────────────────── */

export const INSURER = { name: 'Northgate Home Insurance', short: 'Northgate', claimsEmail: 'claims@northgate-home.example' };

/* The wording, section by section. `id` is what a check cites. */
export const WORDING = {
  'buildings': { title: 'Section 1 — Buildings', text: 'We cover loss or damage to your buildings caused by fire, storm, flood, theft, subsidence, or escape of water from any fixed water tank, pipe or apparatus.' },
  'contents': { title: 'Section 2 — Contents', text: 'We cover loss or damage to your contents inside your home caused by fire, storm, flood, theft or escape of water.' },
  'contents-ad': { title: 'Section 2 — Contents: accidental damage', text: 'Accidental damage to contents is only covered if the Accidental Damage option is shown on your schedule.' },
  'away': { title: 'Section 3 — Out and about (optional)', text: 'If shown on your schedule, we cover your personal possessions and bicycles against loss, theft or damage anywhere in the UK.' },
  'bikes': { title: 'Section 3 — Bicycles', text: 'Any bicycle worth more than £1,000 must be listed on your schedule. If it is not, the most we will pay for a bicycle is £1,000.' },
  'excess': { title: 'Excesses', text: 'You pay the first part of every claim: £100, or £350 for escape of water.' },
  'notify': { title: 'Claims conditions — telling us', text: 'You must tell us about a claim within 30 days of the incident.' },
  'police': { title: 'Claims conditions — theft', text: 'For theft you must report the loss to the police and give us the crime reference number.' },
  'proof': { title: 'Claims conditions — proof', text: 'You must give us proof of ownership or value, and receipts or quotes for repairs.' },
  'new-policy': { title: 'Referral guidelines (internal)', text: 'Refer to an investigator any claim for an incident within 14 days of the policy starting, or where documents disagree about dates or amounts.' },
};

export const EXCESS = { standard: 100, 'escape of water': 350 };
export const BIKE_LIMIT = 1000;

/* The policy records, as the insurer's own system has them. */
export const POLICIES = {
  'NG-4471-2290': {
    number: 'NG-4471-2290', holder: 'Daniel Reeve', postcode: 'LS6 2QT',
    start: '2025-06-01', end: '2026-05-31', sections: ['buildings', 'contents'], options: [], specified: [], previousClaims: 0,
  },
  'NG-5102-7731': {
    number: 'NG-5102-7731', holder: 'Aisha Karim', postcode: 'M20 6RB',
    start: '2025-09-15', end: '2026-09-14', sections: ['contents'], options: [], specified: [], previousClaims: 1,
  },
  'NG-6620-1184': {
    number: 'NG-6620-1184', holder: 'Tom Hale', postcode: 'BS3 1QD',
    start: '2026-02-20', end: '2027-02-19', sections: ['contents'], options: ['away'], specified: [], previousClaims: 0,
  },
};

const money = (n) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const CASES = [
  {
    id: 'pipe',
    title: 'A burst pipe',
    blurb: 'Frozen pipe in the loft, a ruined ceiling, and the paperwork in order.',
    received: '2026-01-26',
    email: {
      from: 'Daniel Reeve <d.reeve@example.com>',
      subject: 'Claim - burst pipe, policy NG-4471-2290',
      body: `Hello,

A pipe in our loft froze and burst overnight on the 17th of January and water came through the bedroom ceiling below. We called a plumber out the same night. I phoned your helpline on the 19th and was told to send the claim form and the invoice, which are attached.

The total from the plumber and plasterer came to £2,340.

Thanks,
Daniel Reeve
14 Ashgrove Road, Leeds LS6 2QT`,
    },
    form: {
      'Policyholder name': 'Daniel Reeve',
      'Policy number': 'NG-4471-2290',
      'Postcode': 'LS6 2QT',
      'Date of incident': '17/01/2026',
      'Date reported': '19/01/2026',
      'Type of claim': 'Escape of water',
      'What happened': 'Pipe in loft froze and burst overnight. Water came through bedroom ceiling. Plumber called out same night.',
      'Amount claimed': money(2340),
      'Crime reference': 'N/A',
      'Signed': 'D. Reeve',
      'Date signed': '24/01/2026',
    },
    invoice: {
      kind: 'invoice',
      supplier: 'CARTER & SONS PLUMBING AND PLASTERING',
      address: '12 Mill Lane, Leeds LS4 1AB',
      title: 'INVOICE',
      fields: { 'Invoice no': 'CS-10482', 'Invoice date': '24/01/2026', 'Bill to': 'Mr D Reeve, 14 Ashgrove Road, Leeds LS6 2QT' },
      lines: [['Emergency call-out, 17 Jan', 180], ['Repair burst pipe in loft', 240], ['Replaster bedroom ceiling', 1030], ['Redecorate ceiling and walls', 500]],
      vat: true,
    },
    truth: { decision: 'approve', payout: 1990 },
  },
  {
    id: 'laptop',
    title: 'A dropped laptop',
    blurb: 'Knocked off a table at home. Genuine — but is it covered?',
    received: '2026-02-09',
    email: {
      from: 'Aisha Karim <aisha.karim@example.com>',
      subject: 'Claim for laptop damage - NG-5102-7731',
      body: `Hi,

My laptop was knocked off the kitchen table by accident on 3 February and the screen and keyboard are broken. I have a repair quote from FixPoint for £640 and the claim form is attached.

I use it for work so I'd be grateful for a quick answer.

Many thanks,
Aisha Karim`,
    },
    form: {
      'Policyholder name': 'Aisha Karim',
      'Policy number': 'NG-5102-7731',
      'Postcode': 'M20 6RB',
      'Date of incident': '03/02/2026',
      'Date reported': '06/02/2026',
      'Type of claim': 'Accidental damage',
      'What happened': 'Laptop knocked off kitchen table by accident. Screen cracked and keyboard damaged.',
      'Amount claimed': money(640),
      'Crime reference': 'N/A',
      'Signed': 'A. Karim',
      'Date signed': '06/02/2026',
    },
    invoice: {
      kind: 'quote',
      supplier: 'FIXPOINT REPAIRS',
      address: '88 Wilmslow Road, Manchester M20 3BZ',
      title: 'REPAIR QUOTE',
      fields: { 'Quote no': 'FP-2291', 'Quote date': '05/02/2026', 'Customer': 'Ms A Karim, Didsbury, Manchester M20 6RB' },
      lines: [['Replacement screen assembly', 380], ['Replacement keyboard', 100], ['Labour', 53.33]],
      vat: true,
    },
    truth: { decision: 'decline', payout: 0 },
  },
  {
    id: 'bike',
    title: 'A stolen bike',
    blurb: 'Stolen outside a gym nine days after the policy started. Three things to notice.',
    received: '2026-03-06',
    email: {
      from: 'Tom Hale <tomhale88@example.com>',
      subject: 'Stolen bike claim NG-6620-1184',
      body: `Hello,

My road bike was stolen from the rack outside my gym on Coronation Road on the 1st of March, some time between 6pm and 7:30pm. I reported it to the police the same evening and the crime reference is on the form.

I've attached the receipt for the bike, which cost £2,450.

Regards,
Tom Hale`,
    },
    form: {
      'Policyholder name': 'Tom Hale',
      'Policy number': 'NG-6620-1184',
      'Postcode': 'BS3 1QD',
      'Date of incident': '01/03/2026',
      'Date reported': '02/03/2026',
      'Type of claim': 'Theft',
      'What happened': 'Road bike stolen from locked rack outside gym on Coronation Road between 6pm and 7.30pm.',
      'Amount claimed': money(2450),
      'Crime reference': 'AS-26-0301-4471',
      'Signed': 'T. Hale',
      'Date signed': '05/03/2026',
    },
    invoice: {
      kind: 'receipt',
      supplier: 'VELO DEPOT',
      address: '41 North Street, Bristol BS3 1EN',
      title: 'RECEIPT',
      fields: { 'Receipt no': 'VD-77310', 'Date': '04/03/2026', 'Customer': 'T Hale' },
      lines: [['Road bike, Aero SL frame, size 56', 2450]],
      vat: false,
    },
    truth: { decision: 'refer', payout: 900 },
  },
];

/** Invoice arithmetic, the way the supplier would have done it. */
export function totals(inv) {
  const net = Math.round(inv.lines.reduce((s, [, v]) => s + v, 0) * 100) / 100;
  const vat = inv.vat ? Math.round(net * 20) / 100 : 0;
  return { net, vat, total: Math.round((net + vat) * 100) / 100 };
}

export { money };

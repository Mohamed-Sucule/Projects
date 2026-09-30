/* ───────────────────────────────────────────────────────────────────────────
   claims/read.js — from recognised text to facts.

   OCR gets most characters right and a predictable few wrong: a £ read as
   "E" or "f", an O where a 0 was, an l or I for a 1, a full stop dropped
   from a price. So labels are matched loosely (a letter or two either way),
   values are cleaned according to what they are supposed to be — a policy
   number is letters then digits, a date is digits and slashes — and every
   field carries where it came from, so the page can draw a box round it on
   the scan and a person can check it.
   ─────────────────────────────────────────────────────────────────────────── */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Digits as OCR tends to mangle them, put back. Only used where a digit is expected. */
export const digits = (s) => String(s).replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/[S$]/g, '5').replace(/B/g, '8').replace(/Z/g, '2');

/** A sum of money, from "£2,340.00", "E2,340.00", "£2340", "2.340,00"… */
export function parseMoney(s) {
  if (s == null) return null;
  const m = /(?:[£Ef€]\s?)?([0-9OoSlI][0-9OoSlI,.\s]*[0-9OoSlI])/.exec(String(s));
  if (!m) return null;
  let t = digits(m[1]).replace(/\s/g, '');
  /* Whichever separator comes last with exactly two digits after it is the
     decimal point; every other comma or full stop is a thousands separator.
     That reads "2,340.00", "2.340,00" and OCR's "2.340.00" all the same way. */
  const dec = /[.,](\d{2})$/.exec(t);
  t = dec ? `${t.slice(0, dec.index).replace(/[.,]/g, '')}.${dec[1]}` : t.replace(/[.,]/g, '');
  if (!/\./.test(t) && t.length > 4 && /00$/.test(t) && /[£Ef]/.test(s)) t = `${t.slice(0, -2)}.${t.slice(-2)}`;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

/** An ISO date from "17/01/2026", "17-01-2026", "l7/Ol/2026", "17 January 2026". */
export function parseDate(s, { year = null } = {}) {
  if (s == null) return null;
  const str = String(s);
  let m = /([0-9OoIl]{1,2})\s*[/.\-]\s*([0-9OoIl]{1,2})\s*[/.\-]\s*([0-9OoIlSZ]{2,4})/.exec(str);
  if (m) {
    const d = +digits(m[1]), mo = +digits(m[2]);
    let y = +digits(m[3]);
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTHS.join('|')}|${MONTHS.map((x) => x.slice(0, 3)).join('|')})\\w*(?:\\s+(\\d{4}))?`, 'i').exec(str);
  if (m) {
    const mo = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3))) + 1;
    const y = m[3] ? +m[3] : year;
    if (y) return `${y}-${String(mo).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  }
  return null;
}

export const policyNumber = (s) => {
  const m = /\b([NM][GC6])\s?[-–—]?\s?([0-9OoIlSZB]{4})\s?[-–—]?\s?([0-9OoIlSZB]{4})\b/.exec(String(s));
  return m ? `NG-${digits(m[2])}-${digits(m[3])}` : null;
};

/* ── the form ────────────────────────────────────────────────────────────── */

export const FORM_FIELDS = [
  ['name', 'Policyholder name'], ['policy', 'Policy number'], ['postcode', 'Postcode'],
  ['incident', 'Date of incident'], ['reported', 'Date reported'], ['type', 'Type of claim'],
  ['what', 'What happened'], ['amount', 'Amount claimed'], ['crimeRef', 'Crime reference'],
  ['signed', 'Signed'], ['signedDate', 'Date signed'],
];

/** Find "Label: value" lines, forgiving a letter or two in the label. */
function labelled(textLines, labels) {
  const out = {};
  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];
    const colon = line.indexOf(':');
    const head = (colon > 0 ? line.slice(0, colon) : line.split(/\s{2,}/)[0]).trim().toLowerCase().replace(/[^a-z ]/g, '');
    let best = null, bestD = Infinity;
    for (const [key, label] of labels) {
      const lab = label.toLowerCase();
      const d = editDistance(head, lab);
      if (d < bestD && d <= Math.max(2, Math.floor(lab.length / 6))) { best = key; bestD = d; }
    }
    if (best && !(best in out)) {
      let value = colon > 0 ? line.slice(colon + 1).trim() : line.slice(head.length).trim();
      /* "What happened" runs on over several lines until the next label */
      if (best === 'what') {
        let j = i + 1;
        while (j < textLines.length && !/^[A-Za-z ]{3,24}:/.test(textLines[j])) { value += ` ${textLines[j].trim()}`; j++; }
      }
      out[best] = { value, line: i };
    }
  }
  return out;
}

export function readForm(text) {
  const textLines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const raw = labelled(textLines, FORM_FIELDS);
  const v = (k) => raw[k]?.value ?? null;
  const fields = {
    name: v('name')?.replace(/[^A-Za-z .'-]/g, '').trim() || null,
    policy: policyNumber(v('policy') ?? '') ?? policyNumber(text),
    postcode: v('postcode')?.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim() || null,
    incident: parseDate(v('incident')),
    reported: parseDate(v('reported')),
    type: v('type')?.replace(/[^A-Za-z ]/g, '').trim() || null,
    what: v('what'),
    amount: parseMoney(v('amount')),
    crimeRef: (() => { const c = v('crimeRef'); return !c || /^n\s?\/?\s?a$/i.test(c.trim()) ? null : c.trim(); })(),
    signed: v('signed'),
    signedDate: parseDate(v('signedDate')),
  };
  return { fields, raw, lines: textLines };
}

/* ── the invoice, quote or receipt ───────────────────────────────────────── */

export function readInvoice(text) {
  const textLines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const kind = /\bquote\b/i.test(text) ? 'quote' : /\breceipt\b/i.test(text) ? 'receipt' : 'invoice';
  const raw = labelled(textLines, [['number', 'Invoice no'], ['number', 'Quote no'], ['number', 'Receipt no'], ['date', 'Invoice date'], ['date', 'Quote date'], ['date', 'Date'], ['to', 'Bill to'], ['to', 'Customer']]);
  const moneyLine = /^(.*?)\s*([£Ef€]\s?[0-9OoSlI][0-9OoSlI,.\s]*)$/;
  const items = [];
  let subtotal = null, vat = null, total = null;
  const at = {};
  for (const [i, l] of textLines.entries()) {
    const m = moneyLine.exec(l);
    if (!m) continue;
    const label = m[1].trim(), amount = parseMoney(m[2]);
    if (/^sub\s?total/i.test(label)) { subtotal = amount; at.subtotal = i; }
    else if (/^vat/i.test(label)) { vat = amount; at.vat = i; }
    else if (/^total/i.test(label)) { total = amount; at.total = i; }
    else if (label && !/:/.test(label)) items.push({ desc: label, amount, line: i });
  }
  return {
    fields: {
      supplier: textLines[0] ?? null,
      kind,
      number: raw.number?.value ?? null,
      date: parseDate(raw.date?.value),
      to: raw.to?.value ?? null,
      items, subtotal, vat, total,
    },
    raw, at, lines: textLines,
  };
}

/* ── the email ───────────────────────────────────────────────────────────── */

/** Dates and sums mentioned in the customer's own words. */
export function readEmail(email, received) {
  const year = +received.slice(0, 4);
  const body = email.body;
  const dateRe = new RegExp(`\\b(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?\\s+(?:${MONTHS.join('|')})\\b`, 'gi');
  const dates = [...body.matchAll(dateRe)].map((m) => ({ text: m[0], iso: parseDate(m[0], { year }) }));
  const amounts = [...body.matchAll(/£\s?[\d,]+(?:\.\d{2})?/g)].map((m) => ({ text: m[0], value: parseMoney(m[0]) }));
  const policy = policyNumber(`${email.subject} ${body}`);
  return { dates, amounts, policy, incident: dates[0]?.iso ?? null, amount: amounts[0]?.value ?? null };
}

/** Where on the scan each field was read, from the OCR's word boxes. */
export function boxesFor(ocrLines, lineIndex) {
  const l = ocrLines?.[lineIndex];
  return l ? l.bbox : null;
}

/* ───────────────────────────────────────────────────────────────────────────
   claims/render.js — the paperwork, as the scanner would have seen it.

   The claim form and the invoice are drawn onto a canvas and then roughed up
   the way a phone photo or a cheap scanner roughs them up: off-white paper,
   a slight tilt, speckle, a fold, ink that is not quite black. The page then
   reads them back with a real text recogniser — the same OCR engine a
   production system would use — rather than being handed the text. What the
   desk knows about the claim, it read.

   `lines()` gives the same content as plain text, which is what the tests
   use: Node has no canvas, but it can check every field survives the kinds
   of mistake OCR makes.
   ─────────────────────────────────────────────────────────────────────────── */

import { INSURER, totals, money } from './cases.js';

/** The document as lines of text, in the order they are drawn. */
export function lines(c, which) {
  if (which === 'form') {
    return [
      INSURER.name.toUpperCase(),
      'HOME INSURANCE CLAIM FORM',
      ...Object.entries(c.form).map(([k, v]) => `${k}: ${v}`),
    ];
  }
  const inv = c.invoice;
  const t = totals(inv);
  return [
    inv.supplier,
    inv.address,
    inv.title,
    ...Object.entries(inv.fields).map(([k, v]) => `${k}: ${v}`),
    ...inv.lines.map(([d, v]) => `${d} ${money(v)}`),
    ...(inv.vat ? [`Subtotal ${money(t.net)}`, `VAT 20% ${money(t.vat)}`] : []),
    `${inv.kind === 'receipt' ? 'Total paid' : 'Total'} ${money(t.total)}`,
  ];
}

/* A small deterministic random, so the same scan is the same every time. */
function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const W = 1000, H = 1300;
const SERIF = '"Newsreader", Georgia, serif';
const MONO = '"JetBrains Mono Var", ui-monospace, Menlo, monospace';

function paper(g, r, tilt) {
  g.fillStyle = '#e9e6de';
  g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(tilt);
  g.translate(-W / 2, -H / 2);
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#fbf9f2');
  grad.addColorStop(1, '#f1ede1');
  g.fillStyle = grad;
  g.fillRect(18, 14, W - 36, H - 28);
  /* the fold */
  g.fillStyle = 'rgba(0,0,0,.035)';
  g.fillRect(18, H * 0.49, W - 36, 3);
  return () => {
    /* speckle, on top of everything, like dust on the glass */
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(40,35,25,${0.05 + r() * 0.18})`;
      g.fillRect(18 + r() * (W - 36), 14 + r() * (H - 28), 1 + r() * 1.6, 1 + r() * 1.6);
    }
    g.restore();
  };
}

function wrap(g, text, x, y, width, lh) {
  const words = text.split(/\s+/);
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > width && line) { g.fillText(line, x, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) g.fillText(line, x, yy);
  return yy;
}

/** Draw the claim form. Returns the canvas. */
export function drawForm(c, canvas = document.createElement('canvas')) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const r = rng(`${c.id}:form`);
  const done = paper(g, r, -0.004);
  g.fillStyle = '#1d2b4a';
  g.fillRect(60, 60, W - 120, 92);
  g.fillStyle = '#fbf9f2';
  g.font = `600 34px ${SERIF}`;
  g.fillText(INSURER.name.toUpperCase(), 84, 118);
  g.fillStyle = '#1d2b4a';
  g.font = `600 26px ${SERIF}`;
  g.fillText('HOME INSURANCE CLAIM FORM', 64, 208);
  g.font = `italic 17px ${SERIF}`;
  g.fillStyle = '#4b4a45';
  g.fillText('Please complete every section. Send with receipts, quotes or invoices.', 64, 238);
  let y = 300;
  for (const [k, v] of Object.entries(c.form)) {
    g.fillStyle = '#2c2a26';
    g.font = `500 21px ${SERIF}`;
    g.fillText(`${k}:`, 64, y);
    g.fillStyle = '#18214a';
    g.font = `500 22px ${MONO}`;
    const last = k === 'What happened' ? wrap(g, v, 330, y, W - 400, 32) : (g.fillText(v, 330, y), y);
    g.strokeStyle = 'rgba(40,40,60,.25)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(326, last + 9); g.lineTo(W - 64, last + 9); g.stroke();
    y = last + 64;
  }
  g.fillStyle = '#4b4a45';
  g.font = `italic 15px ${SERIF}`;
  g.fillText('I confirm the information above is true and complete.', 64, H - 70);
  done();
  return canvas;
}

/** Draw the invoice, quote or receipt. */
export function drawInvoice(c, canvas = document.createElement('canvas')) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const r = rng(`${c.id}:inv`);
  const inv = c.invoice;
  const t = totals(inv);
  const done = paper(g, r, 0.005);
  g.fillStyle = '#231f1a';
  g.font = `700 30px ${SERIF}`;
  g.fillText(inv.supplier, 70, 110);
  g.font = `400 20px ${SERIF}`;
  g.fillStyle = '#4b4a45';
  g.fillText(inv.address, 70, 146);
  g.fillStyle = '#231f1a';
  g.font = `700 40px ${SERIF}`;
  g.fillText(inv.title, 70, 240);
  let y = 300;
  g.font = `500 21px ${SERIF}`;
  for (const [k, v] of Object.entries(inv.fields)) { g.fillText(`${k}: ${v}`, 70, y); y += 40; }
  y += 30;
  g.strokeStyle = '#231f1a';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(70, y); g.lineTo(W - 70, y); g.stroke();
  y += 44;
  const right = (text, yy) => { g.fillText(text, W - 70 - g.measureText(text).width, yy); };
  g.font = `400 22px ${SERIF}`;
  for (const [d, v] of inv.lines) { g.fillText(d, 70, y); right(money(v), y); y += 46; }
  y += 10;
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(W / 2, y); g.lineTo(W - 70, y); g.stroke();
  y += 44;
  if (inv.vat) {
    g.fillText('Subtotal', W / 2, y); right(money(t.net), y); y += 42;
    g.fillText('VAT 20%', W / 2, y); right(money(t.vat), y); y += 42;
  }
  g.font = `700 24px ${SERIF}`;
  g.fillText(inv.kind === 'receipt' ? 'Total paid' : 'Total', W / 2, y); right(money(t.total), y);
  g.font = `italic 16px ${SERIF}`;
  g.fillStyle = '#4b4a45';
  g.fillText(inv.kind === 'receipt' ? 'Paid by card. Thank you for shopping with us.' : inv.kind === 'quote' ? 'Quote valid for 30 days.' : 'Payment due within 14 days.', 70, H - 90);
  done();
  return canvas;
}

#!/usr/bin/env node
/* cv/build.mjs — prints cv/index.html to cv/Mohamed-Sucule-CV.pdf, A4, and writes
   the same CV as cv/Mohamed-Sucule-CV.docx for the applications that ask for Word.

     node cv/build.mjs

   The PDF is made by Chromium from the same page people read on the site, and the
   Word file is written from that page's structure as Chromium sees it, so the three
   never disagree. Both keep their text as real text, which is what application
   tracking systems read. Run it after editing the page, and commit all three. */

import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, LevelFormat, Packer, Paragraph, TabStopType, TextRun } from 'docx';

const page = fileURLToPath(new URL('./index.html', import.meta.url));
const out = fileURLToPath(new URL('./Mohamed-Sucule-CV.pdf', import.meta.url));
const word = fileURLToPath(new URL('./Mohamed-Sucule-CV.docx', import.meta.url));

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const tab = await browser.newPage();
await tab.goto(pathToFileURL(page).href, { waitUntil: 'load' });
await tab.evaluate(() => document.fonts.ready);

/* The CV as data: what the page says, in the order it says it. */
const cv = await tab.evaluate(() => {
  const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const head = (el) => {
    const h3 = el.querySelector('h3');
    const when = el.querySelector('.when');
    return {
      title: text(h3.firstChild),
      rest: text(h3.querySelector('span')),
      when: text(when),
      href: when?.href ?? null,
      items: [...el.querySelectorAll('li')].map(text),
    };
  };
  const main = document.querySelector('main');
  return {
    name: text(main.querySelector('h1')),
    role: text(main.querySelector('.role')),
    facts: [...main.querySelectorAll('header .facts > *')].map(text),
    links: [...main.querySelectorAll('header .links a')].map((a) => ({ text: text(a), href: a.href })),
    sections: [...main.querySelectorAll(':scope > section')].map((s) => ({
      title: text(s.querySelector('h2')),
      blocks: [...s.children].filter((c) => c.tagName !== 'H2').map((c) => {
        if (c.matches('dl')) return { kind: 'skills', rows: [...c.querySelectorAll('dt')].map((dt) => [text(dt), text(dt.nextElementSibling)]) };
        if (c.matches('.job, .proj')) return { kind: 'entry', ...head(c) };
        if (c.matches('.row')) return { kind: 'row', bold: text(c.querySelector('b')), rest: text(c.querySelector('p')).replace(text(c.querySelector('b')), '').trim(), when: text(c.querySelector('.when')) };
        return { kind: 'text', text: text(c) };
      }),
    })),
  };
});

await tab.emulateMedia({ media: 'print' });
const pdf = await tab.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
// one page object per page; a CV that has crept onto a second page should be noticed when it is built
const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
console.log(`wrote ${out}: ${pages} page${pages === 1 ? '' : 's'}`);

/* ── the Word file ───────────────────────────────────────────────────── */

const INK = '16181D';
const SOFT = '3F4450';
const ACCENT = '1F4FD1';
const FONT = 'Calibri';
const pt = (n) => n * 2; // docx sizes are in half-points
/* The page is A4 (11,906 twips) less two margins of 800. A right tab stop at its
   edge puts the dates flush right in Word, LibreOffice and Google Docs alike. */
const EDGE = 11906 - 800 * 2;
const RIGHT_TAB = [{ type: TabStopType.RIGHT, position: EDGE }];
const right = (text, extra = {}) => [new TextRun({ text: `\t${text}`, color: SOFT, size: pt(9.5), ...extra })];
const link = (text, href, opts = {}) => new ExternalHyperlink({ link: href, children: [new TextRun({ text, color: INK, ...opts })] });

const body = [
  new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: cv.name, bold: true, size: pt(24), color: INK })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: cv.role, bold: true, size: pt(11.5), color: ACCENT })] }),
  new Paragraph({ spacing: { after: 20 }, children: cv.facts.flatMap((f, i) => [
    ...(i ? [new TextRun({ text: '  ·  ', color: SOFT, size: pt(9.5) })] : []),
    f.includes('@') ? link(f, `mailto:${f}`, { size: pt(9.5) }) : new TextRun({ text: f, color: SOFT, size: pt(9.5) }),
  ]) }),
  new Paragraph({ spacing: { after: 80 }, children: cv.links.flatMap((l, i) => [
    ...(i ? [new TextRun({ text: '  ·  ', color: SOFT, size: pt(9.5) })] : []),
    link(l.text, l.href, { size: pt(9.5) }),
  ]) }),
];

for (const s of cv.sections) {
  body.push(new Paragraph({
    spacing: { before: 140, after: 70 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: INK, space: 2 } },
    children: [new TextRun({ text: s.title.toUpperCase(), bold: true, size: pt(9.5), color: INK, characterSpacing: 30 })],
  }));
  for (const b of s.blocks) {
    if (b.kind === 'text') body.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: b.text })] }));
    if (b.kind === 'skills') {
      for (const [label, value] of b.rows) {
        body.push(new Paragraph({
          spacing: { after: 20 },
          indent: { left: 1900, hanging: 1900 },
          tabStops: [{ type: TabStopType.LEFT, position: 1900 }],
          children: [new TextRun({ text: label, bold: true }), new TextRun({ text: `\t${value}` })],
        }));
      }
    }
    if (b.kind === 'entry') {
      body.push(new Paragraph({
        spacing: { before: 60, after: 20 },
        keepNext: true,
        children: [
          new TextRun({ text: b.title, bold: true, size: pt(10.5) }),
          ...(b.rest ? [new TextRun({ text: ` ${b.rest}`, color: SOFT, size: pt(10.5) })] : []),
          ...(b.href ? [new TextRun({ text: '\t' }), new ExternalHyperlink({ link: b.href, children: [new TextRun({ text: b.when, color: SOFT, size: pt(9.5) })] })]
            : right(b.when)),
        ],
        tabStops: RIGHT_TAB,
      }));
      for (const item of b.items) body.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 10 }, children: [new TextRun({ text: item })] }));
    }
    if (b.kind === 'row') {
      body.push(new Paragraph({ tabStops: RIGHT_TAB, children: [new TextRun({ text: b.bold, bold: true }), new TextRun({ text: ` ${b.rest}` }), ...right(b.when)] }));
    }
  }
}

const doc = new Document({
  creator: cv.name,
  title: `${cv.name} — CV`,
  styles: { default: { document: { run: { font: FONT, size: pt(10), color: INK } } } },
  numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 220 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 680, bottom: 620, left: 800, right: 800 } } }, children: body }],
});
writeFileSync(word, await Packer.toBuffer(doc));
console.log(`wrote ${word}`);

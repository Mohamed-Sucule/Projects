#!/usr/bin/env node
/* cv/build.mjs — prints cv/index.html to cv/Mohamed-Sucule-CV.pdf, A4.

     node cv/build.mjs

   The PDF is made by Chromium from the same page people read on the site, so the two
   never disagree. Its text stays real text, which is what application tracking systems
   read. Run it after editing the page, and commit both. */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const page = fileURLToPath(new URL('./index.html', import.meta.url));
const out = fileURLToPath(new URL('./Mohamed-Sucule-CV.pdf', import.meta.url));

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const tab = await browser.newPage();
await tab.goto(pathToFileURL(page).href, { waitUntil: 'load' });
await tab.evaluate(() => document.fonts.ready);
await tab.emulateMedia({ media: 'print' });
const pdf = await tab.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
// one page object per page; a CV that has crept onto a second page should be noticed when it is built
const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
console.log(`wrote ${out}: ${pages} page${pages === 1 ? '' : 's'}`);

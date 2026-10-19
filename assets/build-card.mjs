#!/usr/bin/env node
/* assets/build-card.mjs — draws assets/og-card.html to assets/og-card.png, 1200×630.

     node assets/build-card.mjs                                                        */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const card = fileURLToPath(new URL('./og-card.html', import.meta.url));
const out = fileURLToPath(new URL('./og-card.png', import.meta.url));

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await tab.goto(pathToFileURL(card).href, { waitUntil: 'load' });
await tab.evaluate(() => document.fonts.ready);
await tab.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);

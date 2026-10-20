#!/usr/bin/env node
/* assets/shots/shoot.mjs — the screenshot of each project in the lineup.

     node assets/shots/shoot.mjs              every project the site shows
     node assets/shots/shoot.mjs covers ember just these

   Each project is opened in a 1280 x 800 window at 1.5x, put into the state
   that shows what it does (a call playing, a claim read, a boss fight, the
   lighthouse at dusk), and saved as <id>-1920.webp and <id>-960.webp. The
   site's navigator is hidden so the picture is only the project. Uses
   Playwright, a development tool; the output is committed.

   Cells and Your Place are React apps whose folders hold source, so this
   server cannot run them: shoot those from their production build
   (`npm run build -w cells && npm run preview -w cells`) with BUILT=<url>. */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ATLAS } from '../../shared/atlas.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const only = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

/* What to do before the picture is taken. Anything not listed is shot as it opens. */
const SETUP = {
  frontdesk: async (p) => { await p.click('#fast'); await p.click('#playBtn'); await p.waitForTimeout(9000); },
  callcoach: async (p) => { await p.click('#fast'); await p.click('#playBtn'); await p.waitForTimeout(16000); },
  claims: async (p) => {
    await p.click('#readBtn');
    await p.waitForFunction(() => document.getElementById('readBtn').textContent.includes('Read and checked'), null, { timeout: 90000 });
    await p.click('.tabs button[data-id="form"]');
    await p.waitForTimeout(400);
  },
  /* An autopilot plays a real game until the first boss is on screen. */
  ember: async (p) => {
    await p.evaluate(async () => {
      const { autopilot } = await import('./engine.js');
      window.__ember.begin(null);
      const g = window.__ember.game;
      g.cheat.invulnerable = true;
      const mem = {};
      const step = g.step.bind(g);
      g.step = (dt) => step(dt, autopilot(g, mem));
    });
    await p.waitForFunction(() => window.__ember.game?.boss && window.__ember.game.mode === 'play', null, { timeout: 180000 });
    await p.waitForTimeout(5000);
  },
  /* Dusk, with the beam out over the water. */
  lamplighter: async (p) => {
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.15));
    await p.waitForTimeout(1500);
  },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
const BUILT = new Set(['cells', 'your-place']);
for (const entry of ATLAS) {
  if (only.length && !only.includes(entry.id)) continue;
  if (BUILT.has(entry.id) && !process.env.BUILT) { console.log(`${entry.id}: skipped, needs BUILT=<preview url>`); continue; }
  const page = await ctx.newPage();
  await page.goto(BUILT.has(entry.id) ? process.env.BUILT : `${base}/${entry.href}`, { waitUntil: 'load' });
  await page.addStyleTag({ content: '[data-navigator] { display: none !important; }' });
  await page.waitForTimeout(2000);
  await SETUP[entry.id]?.(page);
  const png = await page.screenshot({ type: 'png' });
  /* encode in the page, which already knows WebP */
  const [big, small] = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const out = [];
    for (const w of [1920, 960]) {
      const c = document.createElement('canvas');
      c.width = w; c.height = Math.round(w * img.height / img.width);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
      out.push(c.toDataURL('image/webp', 0.86).split(',')[1]);
    }
    return out;
  }, png.toString('base64'));
  await writeFile(join(here, `${entry.id}-1920.webp`), Buffer.from(big, 'base64'));
  await writeFile(join(here, `${entry.id}-960.webp`), Buffer.from(small, 'base64'));
  console.log(entry.id);
  await page.close();
}
await browser.close();
server.close();

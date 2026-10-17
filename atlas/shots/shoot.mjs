#!/usr/bin/env node
/* atlas/shots/shoot.mjs — the screenshot of each project, as it first opens.

     node atlas/shots/shoot.mjs              every project (serves the repo itself)
     node atlas/shots/shoot.mjs covers qr    just these

   Each app is opened in a 960 x 600 window at twice the pixel density, given a
   moment to draw, and saved as <id>-1920.webp and <id>-960.webp. Tally is a
   Python service, so its picture is taken from a running copy by hand and
   kept. Uses Playwright, a development tool; the output is committed. */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ISLANDS } from '../worlds.js';

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

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
for (const i of ISLANDS) {
  if (i.id === 'tally' || (only.length && !only.includes(i.id))) continue;
  const page = await ctx.newPage();
  await page.goto(`${base}/${i.href}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
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
  await writeFile(join(here, `${i.id}-1920.webp`), Buffer.from(big, 'base64'));
  await writeFile(join(here, `${i.id}-960.webp`), Buffer.from(small, 'base64'));
  console.log(i.id);
  await page.close();
}
await browser.close();
server.close();

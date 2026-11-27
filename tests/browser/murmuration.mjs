#!/usr/bin/env node
/* tests/browser/murmuration.mjs — Murmuration's flock, run on a real
   graphics pipeline and read back.

     node tests/browser/murmuration.mjs

   The flock lives in textures on the graphics card, so the only honest test
   of it is to run it there. This opens the page in Chromium (in CI that is a
   software GPU, which is slow but runs the same shaders), drives the evening
   from the page's test hooks, reads every bird's position back off the card,
   and checks what tests/murmuration.test.mjs checks of the processor version:
   the birds arrive, hold together, stay over the reeds, scatter from the
   falcon, and are all down in the reeds by the end. It also opens the
   processor fallback and the reduced-motion start. Exits 1 on any failure. */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { EVENING, SPACE } from '../../apps/murmuration/field.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(root, '.' + path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try { res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/apps/murmuration/index.html`;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
let failed = 0;
const check = (ok, name, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`);
  if (!ok) failed++;
};

async function open(query, options = {}) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.__evening);
  return { page, errors };
}
/* The evening, a few seconds at a time, so a slow software GPU never times out. */
async function run(page, seconds, hunt = null) {
  for (let left = seconds; left > 0; left -= 5) await page.evaluate(([s, h]) => window.__evening.run(s, 1 / 30, h), [Math.min(5, left), hunt]);
}
const up = (pos) => {
  const out = [];
  for (let i = 0; i < pos.length; i += 4) if (pos[i + 1] > -5000) out.push([pos[i], pos[i + 1], pos[i + 2]]);
  return out;
};

try {
  /* ── on the graphics card ── */
  const { page, errors } = await open('test&rows=24');
  const kind = await page.evaluate(() => window.__evening.kind);
  check(kind === 'gpu', 'the flock runs on the graphics card', `it ran on the ${kind}`);
  const count = await page.evaluate(() => window.__evening.count);

  await run(page, EVENING.arrive + 12);
  let pos = await page.evaluate(() => window.__evening.positions());
  const bad = pos.filter((x) => !Number.isFinite(x)).length;
  check(bad === 0, 'every number read back is a number', `${bad} are not`);
  let birds = up(pos);
  check(birds.length === count, `all ${count} birds have arrived`, `${birds.length} are up`);
  const mid = birds.reduce((s, b) => s.map((v, k) => v + b[k] / birds.length), [0, 0, 0]);
  const strays = birds.filter((b) => Math.hypot(b[0] - mid[0], (b[1] - mid[1]) * 2, b[2] - mid[2]) > SPACE.rx * 1.6).length;
  check(strays / birds.length < 0.03, 'the flock holds together', `${strays} birds have strayed`);
  const low = birds.filter((b) => b[1] < SPACE.floor * 0.5).length;
  check(low === 0, 'no bird skims the reeds before the drop', `${low} are down low`);
  const sample = birds.filter((_, i) => i % 61 === 0).map((a) => Math.min(...birds.filter((b) => b !== a).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))));
  sample.sort((a, b) => a - b);
  check(sample[sample.length >> 1] > 1, 'the birds keep their distance', `median gap ${sample[sample.length >> 1]?.toFixed(2)}`);

  /* The falcon, into the thickest part of the flock. */
  const near = (list, p) => list.filter((b) => Math.hypot(b[0] - p[0], b[1] - p[1], b[2] - p[2]) < 30).length;
  let at = birds[0];
  for (const b of birds.filter((_, i) => i % 37 === 0)) if (near(birds, b) > near(birds, at)) at = b;
  const before = near(birds, at);
  await run(page, 0.5, { at, reach: 135 });
  const after = near(up(await page.evaluate(() => window.__evening.positions())), at);
  check(before >= 10 && after <= before * 0.25, 'a falcon opens a hole in the flock', `${after} of ${before} birds stayed by it`);

  await run(page, EVENING.down + 6 - (await page.evaluate(() => window.__evening.t)));
  pos = await page.evaluate(() => window.__evening.positions());
  check(up(pos).length === 0, 'by nightfall the whole flock is down in the reeds', `${up(pos).length} still up`);
  const real = errors.filter((e) => !/swiftshader|GPU stall|software WebGL/i.test(e));
  check(real.length === 0, 'no errors on the page', real.join('\n    '));

  /* ── the fallback, on the processor ── */
  const cpu = await open('test&cpu');
  check(await cpu.page.evaluate(() => window.__evening.kind) === 'cpu', 'without the graphics features, a smaller flock runs on the processor');
  check(await cpu.page.isVisible('#smaller'), 'and the page says so');
  await run(cpu.page, 3);
  check(cpu.errors.length === 0, 'with no errors', cpu.errors.join('\n    '));

  /* ── asked for less motion ── */
  const calm = await open('test&rows=24', { reducedMotion: 'reduce' });
  await calm.page.waitForTimeout(500);
  check((await calm.page.textContent('#pause')).trim() === 'Play', 'with reduced motion it starts paused, on a still of the flock');
  check(calm.errors.filter((e) => !/swiftshader|GPU stall|software WebGL/i.test(e)).length === 0, 'with no errors', calm.errors.join('\n    '));
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

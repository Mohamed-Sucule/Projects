#!/usr/bin/env node
/* tests/a11y/scan.mjs — every page of the site, through axe, in a real browser.

     node tests/a11y/scan.mjs            every page; exits 1 on any serious or critical issue
     node tests/a11y/scan.mjs apps/qr    just the pages whose path contains this

   Four pages are scanned at a time; set A11Y_JOBS to change that.

   The site is served from this checkout by a small static server, so the scan
   needs nothing but Playwright and axe (installed at the root by npm ci). Your
   Place and Your Sky are left out: they are built at deploy time and their own
   end-to-end suites run axe against the production build. */

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const only = process.argv[2];
const SKIP = new Set(['node_modules', '.git', 'tally', 'your-place', 'your-sky', 'packages', 'tests', 'dist']);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.wasm': 'application/wasm', '.txt': 'text/plain', '.ico': 'image/x-icon',
};

async function pages(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...(await pages(p)));
    else if (name.endsWith('.html')) out.push(relative(root, p));
  }
  return out;
}

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(root, '.' + path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const list = (await pages(root)).filter((p) => !only || p.includes(only)).sort();
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
/* One page in one colour scheme: the lines to print, and how many serious or critical issues. */
async function scan(page, scheme) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: scheme, reducedMotion: 'reduce' });
  const tab = await ctx.newPage();
  // the models the AI pages load come from the network; the scan is about the page, not them
  await ctx.route(/huggingface\.co|cdn\.jsdelivr\.net|photon\.komoot\.io/, (r) => r.abort());
  try {
    await tab.goto(base + page, { waitUntil: 'load', timeout: 30_000 });
    await tab.waitForTimeout(1200);
    const result = await new AxeBuilder({ page: tab }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    if (!bad.length) return { lines: [`✓ ${page} (${scheme})`], issues: 0 };
    const lines = [`✗ ${page} (${scheme})`];
    for (const v of bad) {
      lines.push(`    ${v.id}: ${v.help} — ${v.nodes.length} element${v.nodes.length === 1 ? '' : 's'}`);
      for (const n of v.nodes.slice(0, 4)) lines.push(`      ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
    }
    return { lines, issues: bad.length };
  } catch (e) {
    return { lines: [`✗ ${page} (${scheme}) did not load: ${e.message.split('\n')[0]}`], issues: 1 };
  } finally {
    await ctx.close();
  }
}

/* A few pages at once: each has its own context, so they cannot see each other. */
const jobs = list.flatMap((page) => [[page, 'light'], [page, 'dark']]);
const workers = Math.max(1, Number(process.env.A11Y_JOBS) || 4);
let failures = 0;
let next = 0;
await Promise.all(Array.from({ length: workers }, async () => {
  while (next < jobs.length) {
    const { lines, issues } = await scan(...jobs[next++]);
    failures += issues;
    console.log(lines.join('\n'));
  }
}));
await browser.close();
server.close();
console.log(`\n${list.length} pages, light and dark: ${failures ? `${failures} serious or critical issue(s)` : 'no serious or critical issues'}`);
process.exit(failures ? 1 : 0);

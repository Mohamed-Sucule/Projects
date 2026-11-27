#!/usr/bin/env node
/* assets/media/record.mjs — the short motion loops on the front page.

     node assets/media/record.mjs              every clip
     node assets/media/record.mjs ember covers just these

   Each project is opened in a 1280 x 800 window, put into the state worth
   watching (a boss fight, a storm, a Saturday service running), and recorded
   with Playwright. ffmpeg then cuts the part worth keeping and writes
   <id>.mp4 (H.264, so it plays in every browser including Safari on a phone)
   and <id>.webp, its first frame, which the page shows until the video plays
   and instead of it when someone has asked for reduced motion. The clips are
   muted, short and loop. Development tools only; the output is committed. */

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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

/* Scroll the page from one fraction of its height to another over `ms`, smoothly. */
const glide = (p, from, to, ms) => p.evaluate(([from, to, ms]) => new Promise((done) => {
  const h = document.documentElement.scrollHeight - innerHeight;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    scrollTo(0, h * (from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step); else done();
  };
  requestAnimationFrame(step);
}), [from, to, ms]);

/* Each clip: where it opens, what to do before recording, and what happens on camera. */
const CLIPS = {
  ember: {
    href: 'play/ember/index.html',
    seconds: 9,
    /* An autopilot plays a real game until the first boss is in the room. */
    before: async (p) => {
      await p.evaluate(async () => {
        const { autopilot } = await import('./engine.js');
        window.__ember.begin(null);
        const g = window.__ember.game;
        g.cheat.invulnerable = true;
        const mem = {};
        const step = g.step.bind(g);
        g.step = (dt) => step(dt, autopilot(g, mem));
      });
      await p.waitForFunction(() => window.__ember.game?.boss && window.__ember.game.mode === 'play', null, { timeout: 240000 });
      await p.waitForTimeout(1500);
    },
    during: async (p) => p.waitForTimeout(9000),
  },
  lamplighter: {
    href: 'apps/lamplighter/index.html',
    seconds: 10,
    before: async (p) => { await p.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.06)); await p.waitForTimeout(1500); },
    /* Dusk into the storm. */
    during: async (p) => { await glide(p, 0.06, 0.5, 9500); await p.waitForTimeout(500); },
  },
  covers: {
    href: 'apps/covers/index.html',
    seconds: 10,
    before: async (p) => { await p.waitForTimeout(1500); },
    /* Press play and the evening runs. */
    during: async (p) => { await p.click('#play'); await p.waitForTimeout(10000); },
  },
  frontdesk: {
    href: 'apps/frontdesk/index.html',
    seconds: 10,
    before: async (p) => { await p.waitForTimeout(1500); },
    during: async (p) => { await p.click('#playBtn'); await p.waitForTimeout(10000); },
  },
  'oklch-studio': {
    href: 'projects/oklch-studio/index.html',
    seconds: 8,
    before: async (p) => { await p.waitForTimeout(1500); },
    /* Swing the primary family's hue round the wheel and back. */
    during: async (p) => {
      await p.evaluate(() => new Promise((done) => {
        const t0 = performance.now();
        const start = +[...document.querySelectorAll('input[aria-label="hue"]')][1].value;
        const step = (now) => {
          const k = Math.min(1, (now - t0) / 7600);
          const hue = (start + 140 * Math.sin(k * Math.PI)) % 360;
          const el = [...document.querySelectorAll('input[aria-label="hue"]')][1];
          el.value = String(Math.round((hue + 360) % 360));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          if (k < 1) requestAnimationFrame(step); else done();
        };
        requestAnimationFrame(step);
      }));
      await p.waitForTimeout(400);
    },
  },
};

const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const tmp = await mkdtemp(join(tmpdir(), 'clips-'));
for (const [id, clip] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(id)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: tmp, size: { width: 1280, height: 800 } } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${base}/${clip.href}`, { waitUntil: 'load' });
  await page.addStyleTag({ content: '[data-navigator] { display: none !important; }' });
  await clip.before(page);
  const from = (Date.now() - t0) / 1000;
  await clip.during(page);
  const video = page.video();
  await ctx.close();
  const raw = await video.path();
  const at = from.toFixed(2);
  ffmpeg(['-ss', at, '-i', raw, '-t', String(clip.seconds), '-vf', 'fps=25,scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(here, `${id}.mp4`)]);
  ffmpeg(['-ss', at, '-i', raw, '-frames:v', '1', '-vf', 'scale=1280:-2', '-c:v', 'libwebp', '-quality', '82', join(here, `${id}.webp`)]);
  console.log(`${id}: ${clip.seconds}s from ${at}s`);
}
await rm(tmp, { recursive: true, force: true });
await browser.close();
server.close();

#!/usr/bin/env node
/* atlas/build.mjs — the Portal Atlas's markup, generated from worlds.js.

   The gallery on the main page and every project's own page (atlas/projects/<id>/)
   are plain HTML written by this script, so all of it reads without script, to
   a search engine, and to a screen reader in a hurry. The page's script only
   adds the project sheet and the live preview on top.

     node atlas/build.mjs           write the files
     node atlas/build.mjs --check   exit 1 if any file is out of date (the tests run this)

   The site has no build step for visitors; this runs when the data changes, and
   its output is committed like any other page. */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS } from '../shared/atlas.js';
import { ISLANDS, REGIONS, REPO, TALLY_URL } from './worlds.js';
import { FORMS } from './art/scenes.js';

const here = dirname(fileURLToPath(import.meta.url));
const check = process.argv.includes('--check');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kindLabel = (i) => (i.id === 'tally' ? 'AI product · Python service' : `${KINDS[i.kind]?.label ?? i.kind} · about ${i.minutes} min`);
const regionOf = (i) => REGIONS.find((r) => r.id === i.region);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const SITE = 'https://mohamed-sucule.github.io/Projects';

function launchHref(i, depth) {
  if (i.id === 'tally') return TALLY_URL;
  return `${'../'.repeat(depth)}${i.href}`;
}
const sourceHref = (i) => i.source ?? (i.study ? i.study.replace('/blob/main/', '/tree/main/').replace(/\/README\.md$/, '') : null);

/* the pictures: art/<id>-{900,1800}.webp, and the screenshot at one or two sizes */
const art = (i, pre) => ({
  src: `${pre}art/${i.id}-900.webp`,
  srcset: `${pre}art/${i.id}-900.webp 900w, ${pre}art/${i.id}-1800.webp 1800w`,
  alt: FORMS[i.id]?.alt ?? '',
});
function shot(i, pre) {
  const big = existsSync(join(here, 'shots', `${i.id}-1920.webp`));
  return {
    src: `${pre}shots/${i.id}-960.webp`,
    srcset: big ? `${pre}shots/${i.id}-960.webp 960w, ${pre}shots/${i.id}-1920.webp 1920w` : null,
  };
}

/* ── the gallery ─────────────────────────────────────────────────────── */

function tile(i) {
  const a = art(i, '');
  const s = shot(i, '');
  const launch = launchHref(i, 1);
  const feature = i.size === 'lg';
  const sizes = feature ? '(min-width: 980px) 60vw, 100vw' : '(min-width: 980px) 46vw, (min-width: 640px) 50vw, 100vw';
  return `          <li class="tile${feature ? ' feature' : ''}" data-id="${i.id}" data-alt="${esc(a.alt)}">
            <a class="tile-media" href="projects/${i.id}/" data-open="${i.id}" tabindex="-1" aria-hidden="true">
              <img class="art" src="${a.src}" srcset="${a.srcset}" sizes="${sizes}" width="1800" height="1200" alt="" loading="lazy" decoding="async" />
              <img class="shot" src="${s.src}"${s.srcset ? ` srcset="${s.srcset}" sizes="(min-width: 980px) 20vw, 40vw"` : ''} width="960" height="600" alt="" loading="lazy" decoding="async" />
            </a>
            <div class="tile-body">
              <p class="kind">${esc(kindLabel(i))}</p>
              <h4><a href="projects/${i.id}/" data-open="${i.id}">${esc(i.title)}</a></h4>
              <p class="blurb">${esc(i.blurb)}</p>
              <p class="tile-links">${launch ? `<a href="${esc(launch)}">Launch <span aria-hidden="true">&#8599;</span></a>` : '<span>Runs on a server</span>'}<a href="projects/${i.id}/">How it&rsquo;s built</a></p>
            </div>
          </li>`;
}

function gallery() {
  const regions = REGIONS.map((r, n) => {
    const items = ISLANDS.filter((i) => i.region === r.id);
    return `      <section class="region" id="r-${r.id}" data-region="${r.id}" aria-labelledby="rh-${r.id}">
        <header class="region-head">
          <p class="num">${ROMAN[n]}</p>
          <h3 id="rh-${r.id}">${esc(r.name)}</h3>
          <p class="line">${esc(r.line)}</p>
        </header>
        <ol class="tiles">
${items.map(tile).join('\n')}
        </ol>
      </section>`;
  }).join('\n');
  return `<!-- gallery:start -->\n${regions}\n      <!-- gallery:end -->`;
}

function contents() {
  const rows = REGIONS.map((r, n) => {
    const count = ISLANDS.filter((i) => i.region === r.id).length;
    return `          <li><a href="#r-${r.id}"><span class="n">${ROMAN[n]}</span><span class="t">${esc(r.name)}</span><span class="c">${count}</span></a></li>`;
  }).join('\n');
  return `<!-- contents:start -->\n        <ol class="contents">\n${rows}\n        </ol>\n        <!-- contents:end -->`;
}

/* ── a project's own page ────────────────────────────────────────────── */

function projectPage(i, prev, next) {
  const region = regionOf(i);
  const launch = launchHref(i, 3);
  const src = sourceHref(i);
  const a = art(i, '../../');
  const s = shot(i, '../../');
  const actions = [
    launch ? `<a class="btn primary" href="${esc(launch)}">Launch ${esc(i.title)} <span aria-hidden="true">&#8599;</span></a>` : '',
    i.study ? `<a class="btn" href="${esc(i.study)}">Engineering case study</a>` : '',
    src ? `<a class="btn" href="${esc(src)}">Source</a>` : '',
  ].filter(Boolean).join('\n        ');
  const note = launch ? '' : '\n      <p class="note">Tally is a Python service rather than a page, so it runs on a server. It deploys in one step from <code>render.yaml</code>; until then, the case study and the source are the way in.</p>';
  const list = (xs) => `<ul>${xs.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="../../../favicon.svg" />
<meta name="theme-color" content="#0c0d10" />
<title>${esc(i.title)} — ${esc(KINDS[i.kind]?.label ?? i.kind)} by Mohamed Sucule</title>
<meta name="description" content="${esc(i.blurb)}" />
<meta property="og:title" content="${esc(i.title)} — Portal Atlas" />
<meta property="og:description" content="${esc(i.problem)}" />
<meta property="og:type" content="article" />
<meta property="og:image" content="${SITE}/atlas/art/${i.id}-1800.webp" />
<link rel="canonical" href="${SITE}/atlas/projects/${i.id}/" />
<link rel="stylesheet" href="../project.css" />
</head>
<body>
<header class="top">
  <a class="home" href="../../">&larr; Portal Atlas</a>
  <a class="list" href="../../#r-${region.id}">${esc(region.name)}</a>
</header>
<main class="project">
  <figure class="art">
    <img src="${a.src}" srcset="${a.srcset}" sizes="100vw" width="1800" height="1200" alt="${esc(a.alt)}" />
  </figure>
  <div class="intro">
    <p class="kicker">${esc(kindLabel(i))} &middot; ${esc(region.name)}</p>
    <h1>${esc(i.title)}</h1>
    <p class="blurb">${esc(i.blurb)}</p>
    <div class="actions">
        ${actions}
    </div>${note}
  </div>
  <div class="glance">
    <section><h2>The problem</h2><p>${esc(i.problem)}</p></section>
    <section><h2>Evidence</h2><p>${esc(i.evidence)}${i.tests ? ` <a href="${esc(i.tests)}">Read its tests</a>` : ''}</p></section>
  </div>
  <figure class="shot"><img src="${s.src}"${s.srcset ? ` srcset="${s.srcset}" sizes="(min-width: 1000px) 920px, 100vw"` : ''} width="960" height="600" alt="${esc(i.title)} as it first opens" loading="lazy" /><figcaption>${i.id === 'tally' ? 'Tally&rsquo;s audit view.' : `${esc(i.title)}, as it opens.`}</figcaption></figure>
  <section class="row"><h2>What it does</h2>${list(i.features)}</section>
  <section class="row"><h2>The most interesting decision</h2><div><p class="dtitle">${esc(i.decision[0])}</p><p>${esc(i.decision[1])}</p></div></section>
${i.ai ? `  <section class="row ai"><h2>Where the AI is, and where it isn&rsquo;t</h2><div>
    <div class="split"><div><h3>The model</h3>${list(i.ai.model)}</div><div><h3>Ordinary code</h3>${list(i.ai.code)}</div></div>
    <h3>What keeps it honest</h3>${list(i.ai.guards)}
    <h3>Not built yet</h3>${list(i.ai.limits)}
  </div></section>\n` : ''}  <section class="row"><h2>Built with</h2><ul class="chips">${i.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
  <nav class="pn" aria-label="Other projects">
    <a href="../${prev.id}/"><span>Previous</span>${esc(prev.title)}</a>
    <a href="../${next.id}/"><span>Next</span>${esc(next.title)}</a>
  </nav>
</main>
<script type="module" src="../../../shared/navigator.js"></script>
</body>
</html>
`;
}

/* ── write ───────────────────────────────────────────────────────────── */

const outputs = new Map();
ISLANDS.forEach((i, n) => {
  const prev = ISLANDS[(n - 1 + ISLANDS.length) % ISLANDS.length];
  const next = ISLANDS[(n + 1) % ISLANDS.length];
  outputs.set(join(here, 'projects', i.id, 'index.html'), projectPage(i, prev, next));
});
const indexPath = join(here, 'index.html');
const page = readFileSync(indexPath, 'utf8')
  .replace(/<!-- gallery:start -->[\s\S]*?<!-- gallery:end -->/, gallery())
  .replace(/<!-- contents:start -->[\s\S]*?<!-- contents:end -->/, contents());
outputs.set(indexPath, page);

const stale = [];
for (const [file, text] of outputs) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === text) continue;
  stale.push(file.slice(here.length + 1));
  if (!check) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); }
}
/* pages for projects that no longer exist */
const dir = join(here, 'projects');
if (existsSync(dir)) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory() && !ISLANDS.some((i) => i.id === name.name)) {
      stale.push(`projects/${name.name}/ (removed)`);
      if (!check) rmSync(join(dir, name.name), { recursive: true });
    }
  }
}
if (check) {
  if (stale.length) { console.error(`out of date: ${stale.join(', ')}\nrun: node atlas/build.mjs`); process.exit(1); }
  console.log('atlas pages are up to date');
} else {
  console.log(stale.length ? `wrote ${stale.length} file(s)` : 'nothing to write');
}
export { REPO };

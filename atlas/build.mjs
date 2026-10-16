#!/usr/bin/env node
/* atlas/build.mjs — the plain-HTML half of the Portal Atlas, generated from worlds.js.

   The worlds are drawn by script, which is no use to a search engine, a screen
   reader in a hurry, or anyone whose browser has no WebGL. So every project also
   gets an ordinary page with a direct URL (atlas/projects/<id>/), and the main
   page carries the full list as static links. Both come from the same data as
   the islands, written by this script:

     node atlas/build.mjs           write the files
     node atlas/build.mjs --check   exit 1 if any file is out of date (the tests run this)

   The site has no build step for visitors; this runs when the data changes, and
   its output is committed like any other page. */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS } from '../shared/atlas.js';
import { ISLANDS, REGIONS, REPO, TALLY_URL } from './worlds.js';
import { islandSVG } from './islands.js';

const here = dirname(fileURLToPath(import.meta.url));
const check = process.argv.includes('--check');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kindLabel = (i) => (i.id === 'tally' ? 'AI product · Python service' : `${KINDS[i.kind]?.label ?? i.kind} · about ${i.minutes} min`);
const regionOf = (i) => REGIONS.find((r) => r.id === i.region);
const SITE = 'https://mohamed-sucule.github.io/Projects';

function launchHref(i, depth) {
  if (i.id === 'tally') return TALLY_URL;
  return `${'../'.repeat(depth)}${i.href}`;
}

function projectPage(i, prev, next) {
  const region = regionOf(i);
  const launch = launchHref(i, 3);
  const actions = [
    launch ? `<a class="btn primary" href="${esc(launch)}">Launch ${esc(i.title)} &rarr;</a>` : '',
    i.study ? `<a class="btn" href="${esc(i.study)}">Engineering case study</a>` : '',
    i.source || i.study ? `<a class="btn" href="${esc(i.source ?? i.study.replace('/blob/main/', '/tree/main/').replace(/\/README\.md$/, ''))}">Source</a>` : '',
    `<a class="btn" href="../../#world/${i.id}">See its world in the atlas</a>`,
  ].filter(Boolean).join('\n        ');
  const note = launch ? '' : '\n      <p class="note">Tally is a Python service rather than a page, so it runs on a server. It deploys in one step from <code>render.yaml</code>; until then, the case study and the source are the way in.</p>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="../../../favicon.svg" />
<meta name="theme-color" content="#080B14" />
<title>${esc(i.title)} — ${esc(KINDS[i.kind]?.label ?? i.kind)} by Mohamed Sucule</title>
<meta name="description" content="${esc(i.blurb)}" />
<meta property="og:title" content="${esc(i.title)} — Portal Atlas" />
<meta property="og:description" content="${esc(i.problem)}" />
<meta property="og:type" content="article" />
<meta property="og:image" content="${SITE}/atlas/shots/${esc(i.shot ?? `${i.id}.jpg`)}" />
<link rel="canonical" href="${SITE}/atlas/projects/${i.id}/" />
<link rel="stylesheet" href="../project.css" />
</head>
<body>
<header class="top">
  <a class="home" href="../../">&larr; Portal Atlas</a>
  <a class="list" href="../../#projects">Every project</a>
</header>
<main class="project" style="--glow:${i.palette[2]}">
  <div class="intro">
    <div class="art" aria-hidden="true">${islandSVG(i)}</div>
    <div>
      <p class="kicker">${esc(kindLabel(i))} &middot; ${esc(region.name)}</p>
      <h1>${esc(i.title)}</h1>
      <p class="blurb">${esc(i.blurb)}</p>
      <div class="actions">
        ${actions}
      </div>${note}
    </div>
  </div>
  <figure class="shot"><img src="../../shots/${esc(i.shot ?? `${i.id}.jpg`)}" alt="${esc(i.title)} as it first opens" width="960" height="600" loading="lazy" /><figcaption>${i.id === 'tally' ? 'Tally&rsquo;s audit view.' : `${esc(i.title)}, as it opens.`}</figcaption></figure>
  <section><h2>The problem</h2><p>${esc(i.problem)}</p></section>
  <section><h2>What it does</h2><ul>${i.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></section>
  <section><h2>The most interesting decision</h2><div><p class="dtitle">${esc(i.decision[0])}</p><p>${esc(i.decision[1])}</p></div></section>
${i.ai ? `  <section class="ai"><h2>Where the AI is, and where it isn&rsquo;t</h2><div>
    <div class="split"><div><h3>The model</h3><ul>${i.ai.model.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div><div><h3>Ordinary code</h3><ul>${i.ai.code.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>
    <h3>What keeps it honest</h3><ul>${i.ai.guards.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <h3>Not built yet</h3><ul>${i.ai.limits.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  </div></section>\n` : ''}  <section><h2>Built with</h2><ul class="chips">${i.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
  <section><h2>Evidence</h2><p>${esc(i.evidence)}${i.tests ? ` <a href="${esc(i.tests)}">Read its tests</a>` : ''}</p></section>
  <section><h2>Its world</h2><p>${esc(i.world)}</p></section>
  <nav class="pn" aria-label="Other projects">
    <a href="../${prev.id}/">&larr; ${esc(prev.title)}</a>
    <a href="../${next.id}/">${esc(next.title)} &rarr;</a>
  </nav>
</main>
<script type="module" src="../../../shared/navigator.js"></script>
</body>
</html>
`;
}

function projectList() {
  const groups = REGIONS.map((r) => {
    const items = ISLANDS.filter((i) => i.region === r.id).map((i) => {
      const launch = launchHref(i, 1);
      return `          <li>
            <a class="pname" href="projects/${i.id}/">${esc(i.title)}</a>
            <span class="pkind">${esc(kindLabel(i))}</span>
            <p>${esc(i.blurb)}</p>
            <span class="plinks">${launch ? `<a href="${esc(launch)}">Launch</a>` : '<span>Runs on a server</span>'}<a href="projects/${i.id}/">How it&rsquo;s built</a><a href="#world/${i.id}" data-world="${i.id}">Its world</a></span>
          </li>`;
    }).join('\n');
    return `      <section class="pgroup" aria-labelledby="pg-${r.id}">
        <h3 id="pg-${r.id}">${esc(r.name)}</h3>
        <p>${esc(r.line)}</p>
        <ul>
${items}
        </ul>
      </section>`;
  }).join('\n');
  return `<!-- projects:start -->\n      <div class="plist">\n${groups}\n      </div>\n      <!-- projects:end -->`;
}

const outputs = new Map();
ISLANDS.forEach((i, n) => {
  const prev = ISLANDS[(n - 1 + ISLANDS.length) % ISLANDS.length];
  const next = ISLANDS[(n + 1) % ISLANDS.length];
  outputs.set(join(here, 'projects', i.id, 'index.html'), projectPage(i, prev, next));
});
const indexPath = join(here, 'index.html');
const page = readFileSync(indexPath, 'utf8');
const updated = page.replace(/<!-- projects:start -->[\s\S]*?<!-- projects:end -->/, projectList());
outputs.set(indexPath, updated);

let stale = [];
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

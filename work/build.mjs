#!/usr/bin/env node
/* work/build.mjs — the case studies, and the project sections of the front page.

     node work/build.mjs           write the files
     node work/build.mjs --check   exit 1 if any file is out of date (the tests run this)

   Everything the site says about a project is in work/projects.js. This writes
   it out twice: as the project's own page at work/<id>/, and as its case study
   or card on the front page, between the <!-- build:<section> --> markers in
   index.html. The rest of the front page is written by hand. The site has no
   build step for visitors; this runs when the data changes, and its output is
   committed like any other page. */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATLAS, SECTIONS } from '../shared/atlas.js';
import { PROJECTS } from './projects.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const check = process.argv.includes('--check');
const SITE = 'https://mohamed-sucule.github.io/Projects';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sectionOf = (id) => SECTIONS.find((s) => s.ids.includes(id));
const verb = (e) => (e.kind === 'game' ? 'Play' : e.kind === 'fiction' ? 'Read' : 'Open');
/* A link in the data is either a full URL or a path from the site's root. */
const href = (to, up) => (/^https?:/.test(to) ? to : `${up}${to}`);
const shot = (id, up) => ({
  src: `${up}assets/shots/${id}-960.webp`,
  srcset: `${up}assets/shots/${id}-960.webp 960w, ${up}assets/shots/${id}-1920.webp 1920w`,
});

const proofHtml = (p, indent) => p.proof.map(([b, s]) => `${indent}<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('\n');
const hardHtml = (p, indent) => p.hard.map((h) => `${indent}<li>${esc(h)}</li>`).join('\n');

/* ── the front page ──────────────────────────────────────────────────── */

/* A case study: the picture on one side, what was hard and the numbers on the other. */
function caseStudy(e, i) {
  const p = PROJECTS[e.id];
  const s = shot(e.id, '');
  const internal = p.links.filter(([, to]) => !/^https?:/.test(to));
  const source = p.links.find(([label]) => label === 'Source');
  const links = [
    `<a class="go" href="${e.href}">${verb(e)} ${esc(e.title)}</a>`,
    `<a href="work/${e.id}/">Case study</a>`,
    ...internal.map(([label, to]) => `<a href="${to}">${esc(label)}</a>`),
    source ? `<a href="${source[1]}">Source</a>` : '',
  ].filter(Boolean);
  return `      <article class="case${i % 2 ? ' flip' : ''}" aria-labelledby="${e.id}-title">
        <a class="shot" href="${e.href}" tabindex="-1" aria-hidden="true"><img src="${s.src}" srcset="${s.srcset}" sizes="(min-width: 900px) 460px, 92vw" width="960" height="600" alt="" loading="lazy" decoding="async" /></a>
        <div>
          <p class="label">${esc(p.stack.slice(0, 4).join(' · '))}</p>
          <h3 id="${e.id}-title">${esc(e.title)}</h3>
          <p class="line">${esc(p.line)}</p>
          <ul class="hard">
${hardHtml(p, '            ')}
          </ul>
          <div class="proof">
${proofHtml(p, '            ')}
          </div>
          <div class="links">
            ${links.join('\n            ')}
          </div>
        </div>
      </article>`;
}

/* A card: the picture, what it is, one measured line. The whole card goes to its case study. */
function card(e) {
  const p = PROJECTS[e.id];
  return `        <li><a class="card" href="work/${e.id}/">
          <img src="assets/shots/${e.id}-960.webp" width="960" height="600" alt="" loading="lazy" decoding="async" />
          <div>
            <h3>${esc(e.title)}</h3>
            <p>${esc(p.card.text)}</p>
            <p class="measure">${esc(p.card.measure)}</p>
            <span class="label">${esc(p.card.label)}</span>
          </div>
        </a></li>`;
}

const BLOCKS = {
  work: (list) => list.map(caseStudy).join('\n\n'),
  creative: (list) => list.map(caseStudy).join('\n\n'),
  products: (list) => `      <ul class="cards two">\n${list.map(card).join('\n')}\n      </ul>`,
  tools: (list) => `      <ul class="cards four">\n${list.map(card).join('\n')}\n      </ul>`,
};

function frontPage(html) {
  let out = html;
  for (const section of SECTIONS) {
    const open = `<!-- build:${section.id} -->`;
    const close = `<!-- /build:${section.id} -->`;
    const a = out.indexOf(open);
    const b = out.indexOf(close);
    if (a === -1 || b === -1) throw new Error(`index.html has no ${open} … ${close} block`);
    const list = section.ids.map((id) => ATLAS.find((e) => e.id === id));
    out = `${out.slice(0, a + open.length)}\n${BLOCKS[section.id](list)}\n      ${out.slice(b)}`;
  }
  return out;
}

/* ── a project's own page ────────────────────────────────────────────── */

function studyPage(e) {
  const p = PROJECTS[e.id];
  const up = '../../';
  const section = sectionOf(e.id);
  const at = ATLAS.indexOf(e);
  const prev = ATLAS[at - 1];
  const next = ATLAS[at + 1];
  const s = shot(e.id, up);
  const night = section.id === 'creative';
  const title = `${e.title}: ${p.line.replace(/\.$/, '')} — Mohamed Sucule`;
  const description = p.intro.length > 200 ? `${p.intro.slice(0, p.intro.lastIndexOf(' ', 196))}…` : p.intro;
  const pager = [
    prev ? `      <a class="prev" href="../${prev.id}/"><span class="label">Previous</span><b>${esc(prev.title)}</b></a>` : '',
    next ? `      <a class="next" href="../${next.id}/"><span class="label">Next</span><b>${esc(next.title)}</b></a>` : '',
  ].filter(Boolean).join('\n');
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="icon" href="${up}favicon.svg" />
<meta name="theme-color" content="${night ? '#0e0b09' : '#f6f5f1'}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(`${e.title} — ${p.line.replace(/\.$/, '')}`)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${SITE}/work/${e.id}/" />
<meta property="og:image" content="${SITE}/assets/og-card.png" />
<link rel="canonical" href="${SITE}/work/${e.id}/" />
<link rel="preload" href="${up}assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="${up}assets/fonts/outfit.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="${up}assets/site.css" />
</head>
<body${night ? ' class="night"' : ''}>
<a class="skip" href="#main">Skip to the project</a>
<header class="top">
  <div class="wrap">
    <a class="mark" href="${up}">Mohamed Sucule</a>
    <nav aria-label="Main">
      <a href="${up}#work">Work</a>
      <a href="${up}#writing">Writing</a>
      <a href="${up}#experience">Experience</a>
      <a href="${up}#contact">Contact</a>
      <a class="cv" href="${up}cv/">CV</a>
    </nav>
  </div>
</header>

<main id="main">
  <section class="study-head" aria-labelledby="title">
    <div class="wrap">
      <p class="crumbs"><a href="${up}#${section.id}">${esc(section.title)}</a> · ${at + 1} of ${ATLAS.length}</p>
      <p class="label">${esc(p.stack.join(' · '))}</p>
      <h1 id="title">${esc(e.title)}</h1>
      <p class="line">${esc(p.line)}</p>
      <p class="lede">${esc(p.intro)}</p>
      <div class="links">
        <a class="go" href="${up}${e.href}">${verb(e)} ${esc(e.title)}</a>
        ${p.links.map(([label, to]) => `<a href="${href(to, up)}">${esc(label)}</a>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="study-shot" aria-label="Screenshot">
    <div class="wrap">
      <a href="${up}${e.href}"><img src="${s.src}" srcset="${s.srcset}" sizes="(min-width: 1200px) 1120px, 94vw" width="960" height="600" alt="${esc(p.alt)}" /></a>
    </div>
  </section>

  <section class="study-body" aria-label="How it works">
    <div class="wrap">
      <div>
        <h2>What’s hard about it</h2>
        <ul class="hard">
${hardHtml(p, '          ')}
        </ul>
        <div class="decision">
          <h2>A decision worth explaining</h2>
          <h3>${esc(p.decision[0])}</h3>
          <p>${esc(p.decision[1])}</p>
        </div>
      </div>
      <div>
        <h2>In numbers</h2>
        <div class="proof">
${proofHtml(p, '          ')}
        </div>
        <h2>Built with</h2>
        <ul class="built">
${p.stack.map((t) => `          <li>${esc(t)}</li>`).join('\n')}
        </ul>
      </div>
    </div>
  </section>

  <nav class="pager" aria-label="More projects">
    <div class="wrap">
${pager}
    </div>
  </nav>
</main>

<footer>
  <div class="wrap">
    <p>© 2026 Mohamed Sucule · Birmingham, UK</p>
    <p><a href="${up}">All work</a> · <a href="${up}cv/">CV</a> · <a href="https://github.com/Mohamed-Sucule/Projects">Source on GitHub</a></p>
  </div>
</footer>
<script type="module" src="${up}shared/navigator.js"></script>
</body>
</html>
`;
}

/* ── write, or check ─────────────────────────────────────────────────── */

const files = new Map();
for (const e of ATLAS) {
  if (!PROJECTS[e.id]) throw new Error(`work/projects.js has nothing on ${e.id}`);
  files.set(join(here, e.id, 'index.html'), studyPage(e));
}
const indexPath = join(root, 'index.html');
files.set(indexPath, frontPage(readFileSync(indexPath, 'utf8')));

let stale = 0;
for (const [path, body] of files) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === body) continue;
  stale++;
  if (check) { console.error(`out of date: ${path.slice(root.length + 1)}`); continue; }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  console.log(`wrote ${path.slice(root.length + 1)}`);
}
if (check && stale) { console.error('run: node work/build.mjs'); process.exit(1); }
if (!check && !stale) console.log('everything is up to date');

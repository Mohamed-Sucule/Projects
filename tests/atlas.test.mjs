/* tests/atlas.test.mjs — the Portal Atlas keeps its promises.

   The page's design rule is that every visual element leads to a real project,
   an interaction or evidence. So every island must be a project in the
   catalogue (or Tally), every project in the catalogue must have an island,
   and everything an island's panel points at (the app, its screenshot, its
   case study, its tests) must exist. These are exactly the things that rot
   when a project is added or renamed months later. */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { test, assert } from './harness.mjs';
import { ATLAS } from '../shared/atlas.js';
import { WORLDS, ISLANDS, REGIONS, REPO, FEATURED, DETAILS, AI, islandById, SEARCHABLE } from '../atlas/worlds.js';
import { islandSVG, SCENE_IDS } from '../atlas/islands.js';
import { FX_TYPES } from '../atlas/fx.js';
import { sceneLayout, dialAt, moonPhase, phaseName } from '../atlas/sky.js';
import { buildIndex, search } from '../shared/search.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const local = (url) => url.replace(`${REPO}/blob/main/`, '').replace(`${REPO}/tree/main/`, '');

test('every project in the catalogue has an island, and every island is a project', () => {
  const worlds = new Set(WORLDS.map((w) => w.id));
  for (const e of ATLAS) assert.ok(worlds.has(e.id), `${e.title} is in the catalogue but has no island`);
  for (const w of WORLDS) assert.ok(w.id === 'tally' || ATLAS.some((e) => e.id === w.id), `island "${w.id}" is not a project`);
  assert.equal(new Set(WORLDS.map((w) => w.id)).size, WORLDS.length, 'an island is listed twice');
});

test('the page counts its islands correctly', () => {
  const html = readFileSync(join(root, 'atlas/index.html'), 'utf8');
  const n = ISLANDS.length;
  assert.equal(n, 35, `the page says thirty-five; there are ${n}`);
  assert.ok(html.includes('thirty-five projects') && html.includes('<b>35</b>'), 'the counts on the page have drifted');
});

test('every island floats in a known region, and every region has islands', () => {
  const regions = new Set(REGIONS.map((r) => r.id));
  for (const w of WORLDS) assert.ok(regions.has(w.region), `${w.id} is in unknown region ${w.region}`);
  for (const r of REGIONS) assert.ok(WORLDS.some((w) => w.region === r.id), `${r.name} is empty`);
});

test('every island has the facts its panel shows', () => {
  for (const i of ISLANDS) {
    assert.ok(i.title && i.blurb && i.hook, `${i.id} is missing its catalogue text`);
    assert.ok(i.problem?.length > 20, `${i.id} has no problem statement`);
    assert.ok(i.world?.length > 20, `${i.id} has no description of its world`);
    assert.ok(i.evidence?.length > 10, `${i.id} has no evidence`);
    assert.ok(Array.isArray(i.tech) && i.tech.length >= 2, `${i.id} lists too little of what it is built with`);
    assert.ok(['lg', 'md', 'sm'].includes(i.size), `${i.id} has size ${i.size}`);
    assert.ok(i.palette.length === 3 && i.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c)), `${i.id} has a bad palette`);
  }
});

test('every island can be drawn, and is well-formed SVG', () => {
  for (const i of ISLANDS) {
    assert.ok(SCENE_IDS.includes(i.id), `${i.id} has no scene`);
    const svg = islandSVG(i);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${i.id} is not one SVG`);
    for (const tag of ['g', 'defs', 'linearGradient', 'radialGradient', 'clipPath']) {
      const open = (svg.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
      const close = (svg.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
      assert.equal(open, close, `${i.id}: ${open} <${tag}> but ${close} </${tag}>`);
    }
    assert.ok(!/NaN|undefined/.test(svg), `${i.id} drew NaN or undefined into its SVG`);
  }
});

test('a second copy of an island keeps its gradient ids to itself', () => {
  const svg = islandSVG(islandById.get('tether'), { uid: 'panel' });
  const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(ids.length && ids.every((id) => id.endsWith('-panel')), 'an id was not suffixed');
  for (const r of refs) assert.ok(ids.includes(r), `url(#${r}) points at nothing`);
});

test('every Launch button opens a page that exists', () => {
  for (const i of ISLANDS) {
    if (i.id === 'tally') continue;
    assert.ok(i.href && existsSync(join(root, i.href)), `${i.id} launches ${i.href}, which does not exist`);
  }
});

test('every island has a screenshot', () => {
  for (const i of ISLANDS) {
    const file = join(root, 'atlas/shots', i.shot ?? `${i.id}.jpg`);
    assert.ok(existsSync(file), `no screenshot for ${i.id}`);
  }
});

test('every case study, source and test link points into this repository at something real', () => {
  for (const i of ISLANDS) {
    assert.ok(i.study || i.source, `${i.id} has neither a case study nor a source link`);
    for (const url of [i.study, i.source, i.tests].filter(Boolean)) {
      assert.ok(url.startsWith(REPO), `${i.id} links outside the repo: ${url}`);
      assert.ok(existsSync(join(root, local(url))), `${i.id} links to ${local(url)}, which does not exist`);
    }
  }
});

test('the portal opens onto a project you can launch', () => {
  const f = islandById.get(FEATURED);
  assert.ok(f && f.href, `the featured island "${FEATURED}" cannot be launched`);
});

test('the guide can find Tally, which the site-wide navigator does not know about', () => {
  const index = buildIndex(SEARCHABLE);
  const hits = search('audit invoices against contracts', index, { limit: 3 });
  assert.equal(hits[0]?.entry.id, 'tally');
  for (const h of search('a game in the dark', index, { limit: 3 })) assert.ok(islandById.has(h.entry.id));
});

test('every result the guide can give is an island', () => {
  for (const e of SEARCHABLE) assert.ok(islandById.has(e.id), `the guide could suggest ${e.id}, which has no island`);
});

test('every island has what its panel promises: features, a decision, a world effect', () => {
  const forms = ['cone', 'spire', 'shelf', 'twin', 'crystal', 'ring'];
  for (const i of ISLANDS) {
    assert.ok(DETAILS[i.id], `${i.id} has no details`);
    assert.equal(i.features?.length, 3, `${i.id} should list three things it does`);
    for (const f of i.features) assert.ok(f.length > 8 && f.length < 120, `${i.id}: "${f}" is not a feature line`);
    assert.ok(Array.isArray(i.decision) && i.decision[0]?.length > 5 && i.decision[1]?.length > 40, `${i.id} has no interesting decision`);
    assert.ok(FX_TYPES.includes(i.fx?.type), `${i.id} has a world effect "${i.fx?.type}" that is not drawn`);
    assert.ok(forms.includes(i.base), `${i.id} has an unknown silhouette "${i.base}"`);
  }
  for (const id of Object.keys(DETAILS)) assert.ok(islandById.has(id), `details for "${id}", which has no island`);
});

test('the islands do not all share one silhouette', () => {
  const counts = {};
  for (const i of ISLANDS) counts[i.base] = (counts[i.base] ?? 0) + 1;
  assert.ok(Object.keys(counts).length >= 5, `only ${Object.keys(counts).length} silhouettes`);
  for (const [form, n] of Object.entries(counts)) assert.ok(n <= ISLANDS.length / 3, `${n} islands are ${form}`);
});

test('every island has its own page, and the generated pages are up to date', () => {
  for (const i of ISLANDS) assert.ok(existsSync(join(root, 'atlas/projects', i.id, 'index.html')), `no page for ${i.id}`);
  /* build.mjs --check exits 1 if any page, or the list in the atlas, differs from worlds.js */
  execFileSync(process.execPath, [join(root, 'atlas/build.mjs'), '--check'], { stdio: 'pipe' });
});

test('the plain list on the page links every project, without needing script', () => {
  const html = readFileSync(join(root, 'atlas/index.html'), 'utf8');
  const list = html.match(/<!-- projects:start -->([\s\S]*?)<!-- projects:end -->/)?.[1] ?? '';
  for (const i of ISLANDS) {
    assert.ok(list.includes(`href="projects/${i.id}/"`), `the list has no page link for ${i.id}`);
    if (i.id !== 'tally') assert.ok(list.includes(`href="../${i.href}"`), `the list cannot launch ${i.id}`);
  }
});

test('the threshold says what the brief asked it to say', () => {
  const html = readFileSync(join(root, 'atlas/index.html'), 'utf8');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, '\u2019').replace(/\s+/g, ' ');
  assert.ok(/Ideas that escape the ordinary\./i.test(text), 'the headline has changed');
  assert.ok(text.includes('I build AI-powered products, immersive tools, and unconventional solutions to real problems.'), 'the line under the headline has changed');
  assert.ok(/Explore my worlds/i.test(text), 'no way into the worlds');
  const nav = html.match(/<nav aria-label="Main">([\s\S]*?)<\/nav>/)?.[1] ?? '';
  for (const [href, name] of [['#worlds', 'Worlds'], ['#projects', 'Projects'], ['#about', 'About'], ['#contact', 'Contact']]) {
    assert.ok(nav.includes(`href="${href}">${name}<`), `the nav has no ${name}`);
    assert.ok(html.includes(`id="${href.slice(1)}"`), `${name} points at nothing`);
  }
});

test('the guide opens with the question and the four starting points', () => {
  const html = readFileSync(join(root, 'atlas/index.html'), 'utf8');
  assert.ok(html.includes('Every world here solves a different problem.') && html.includes('What are you trying to build?'));
  for (const q of ['I want to automate a repetitive workflow.', 'I need an AI-powered product prototype.', 'I have a data problem.', 'Show me your most technically interesting project.']) {
    assert.ok(html.includes(q), `the guide is missing "${q}"`);
    const index = buildIndex(SEARCHABLE);
    const hits = search(q, index, { limit: 3 });
    assert.ok(hits.length > 0, `the guide has nothing to say to "${q}"`);
  }
});

const SIZES = [[1440, 900], [1920, 1080], [1280, 800], [1024, 768], [390, 844], [360, 740], [768, 1024], [2560, 1080]];

test('the ring, the moon, the lamp and the person are on screen at every common size', () => {
  for (const [W, H] of SIZES) {
    const L = sceneLayout(W, H);
    const half = L.a / 2;
    const [cx, cy, R] = L.portal;
    const outer = R * 1.3;
    assert.ok(cx - outer > -half && cx + outer < half, `${W}x${H}: the ring runs off the side`);
    assert.ok(cy + outer < 0.5, `${W}x${H}: the ring runs off the top`);
    /* it hangs: its lowest edge is clear of the water at its own distance */
    assert.ok(cy - R > L.hz - 0.03, `${W}x${H}: the ring is standing in the sea, not hanging over it`);
    if (L.light) assert.ok(Math.abs(L.light[0]) < half - 0.01 && L.light[1] < 0.5, `${W}x${H}: the lamp is off screen`);
    assert.ok(Math.abs(L.moon[0]) < half - L.moon[2], `${W}x${H}: the moon is off screen`);
    const [fx, fy] = L.figure;
    assert.ok(Math.abs(fx) < half && fy > -0.5 && fy < L.hz, `${W}x${H}: the person on the causeway is off screen`);
    assert.ok(L.cliff[0] > cx && L.cliff[0] < half, `${W}x${H}: the cliff is not to the right of the ring`);
  }
});

test('every block of the dial is a world, and the dial is only the dial', () => {
  for (const [W, H] of SIZES) {
    const L = sceneLayout(W, H);
    const [cx, cy, R] = L.portal;
    const ox = cx / 0.95, oy = L.hz + (cy - L.hz) / 0.95;
    const rr = (R * 1.09) / 0.95;
    const found = new Set();
    for (let i = 0; i < 35; i++) {
      const a = Math.PI / 2 - ((i + 0.5) / 35) * Math.PI * 2;
      found.add(dialAt(L, [ox + Math.cos(a) * rr, oy + Math.sin(a) * rr], 0));
    }
    assert.equal(found.size, 35, `${W}x${H}: the dial does not have thirty-five distinct blocks`);
    assert.ok([...found].every((b) => b >= 0 && b < ISLANDS.length));
    assert.equal(dialAt(L, [ox, oy], 0), -1, 'the middle of the ring is not a block');
    assert.equal(dialAt(L, [ox + R * 3, oy], 0), -1, 'empty sky is not a block');
  }
  assert.equal(ISLANDS.length, 35, 'the dial has thirty-five blocks; the atlas must have thirty-five worlds');
});

test('where the AI is: every claim about a model is backed by the project\'s own README', () => {
  const readme = (id) => readFileSync(join(root, id === 'tally' ? 'tally/README.md' : `apps/${id}/README.md`), 'utf8');
  for (const [id, ai] of Object.entries(AI)) {
    assert.ok(islandById.has(id), `AI notes for ${id}, which has no island`);
    for (const key of ['model', 'code', 'guards', 'limits']) assert.ok(ai[key]?.length, `${id} says nothing under ${key}`);
    const text = readme(id).replace(/,(?=\d{3})/g, '');
    for (const line of Object.values(ai).flat()) {
      for (const n of line.match(/\d+(?:\.\d+)?/g) ?? []) {
        assert.ok(text.includes(n), `${id}: "${n}" in "${line}" is not in its README`);
      }
    }
  }
  for (const id of ['tally', 'frontdesk', 'handbook', 'claims']) assert.ok(AI[id], `${id} uses a model and must say where`);
});

test('the moon in the sky is the moon outside', () => {
  /* two eclipses: the total solar eclipse at new moon, and a lunar one at full */
  const nw = moonPhase(new Date(Date.UTC(2024, 3, 8, 18, 21)));
  const full = moonPhase(new Date(Date.UTC(2025, 2, 14, 6, 55)));
  assert.ok(Math.min(nw, 1 - nw) < 0.02, `new moon came out as phase ${nw.toFixed(3)}`);
  assert.ok(Math.abs(full - 0.5) < 0.02, `full moon came out as phase ${full.toFixed(3)}`);
  assert.equal(phaseName(full), 'full moon');
  assert.equal(phaseName(nw), 'new moon');
});

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
import { test, assert } from './harness.mjs';
import { ATLAS } from '../shared/atlas.js';
import { WORLDS, ISLANDS, REGIONS, REPO, FEATURED, islandById, SEARCHABLE } from '../atlas/worlds.js';
import { islandSVG, SCENE_IDS } from '../atlas/islands.js';
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
  assert.ok(html.includes('Thirty-five islands') && html.includes('<b>35</b>'), 'the counts on the page have drifted');
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
    for (const tag of ['g', 'defs', 'linearGradient', 'radialGradient']) {
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

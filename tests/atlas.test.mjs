/* tests/atlas.test.mjs — the Portal Atlas keeps its promises.

   The page is a gallery: every project has a world (a picture rendered from
   atlas/art/scenes.js), a screenshot of the real thing, its facts, and links to
   the app, its case study, its source and its tests. These are exactly the
   things that rot when a project is added or renamed months later, so each is
   checked here, along with the claims the page makes about itself. */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { test, assert } from './harness.mjs';
import { ATLAS } from '../shared/atlas.js';
import { WORLDS, ISLANDS, REGIONS, REPO, DETAILS, AI, islandById } from '../atlas/worlds.js';
import { FORMS, SCENES, SKIES, picture } from '../atlas/art/scenes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const local = (url) => url.replace(`${REPO}/blob/main/`, '').replace(`${REPO}/tree/main/`, '');
const html = readFileSync(join(root, 'atlas/index.html'), 'utf8');
const kb = (path) => statSync(join(root, path)).size / 1024;

test('every project in the catalogue is in the atlas, and everything in the atlas is a project', () => {
  const worlds = new Set(WORLDS.map((w) => w.id));
  for (const e of ATLAS) assert.ok(worlds.has(e.id), `${e.title} is in the catalogue but not in the atlas`);
  for (const w of WORLDS) assert.ok(w.id === 'tally' || ATLAS.some((e) => e.id === w.id), `"${w.id}" is not a project`);
  assert.equal(worlds.size, WORLDS.length, 'a project is listed twice');
});

test('the page counts its projects correctly', () => {
  assert.equal(ISLANDS.length, 36, `the page says thirty-six; there are ${ISLANDS.length}`);
  assert.ok(html.includes('Thirty-six worlds, in six rooms') && html.includes('Thirty-six of them') && html.includes('<b>36</b>'), 'the counts on the page have drifted');
  for (const r of REGIONS) {
    const n = ISLANDS.filter((i) => i.region === r.id).length;
    assert.ok(html.includes(`<span class="t">${r.name}</span><span class="c">${n}</span>`), `the contents miscount ${r.name}`);
  }
});

test('every project is in a known region, and every region has projects', () => {
  const regions = new Set(REGIONS.map((r) => r.id));
  for (const w of WORLDS) assert.ok(regions.has(w.region), `${w.id} is in unknown region ${w.region}`);
  for (const r of REGIONS) assert.ok(WORLDS.some((w) => w.region === r.id), `${r.name} is empty`);
  for (const r of REGIONS) assert.ok(SKIES[r.id], `${r.name} has no sky to light its pictures`);
});

test('every project has the facts its sheet shows', () => {
  for (const i of ISLANDS) {
    assert.ok(i.title && i.blurb && i.hook, `${i.id} is missing its catalogue text`);
    assert.ok(i.problem?.length > 20, `${i.id} has no problem statement`);
    assert.ok(i.evidence?.length > 10, `${i.id} has no evidence`);
    assert.ok(Array.isArray(i.tech) && i.tech.length >= 2, `${i.id} lists too little of what it is built with`);
    assert.ok(['lg', 'md', 'sm'].includes(i.size), `${i.id} has size ${i.size}`);
    assert.ok(i.palette.length === 3 && i.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c)), `${i.id} has a bad palette`);
    assert.ok(DETAILS[i.id], `${i.id} has no details`);
    assert.equal(i.features?.length, 3, `${i.id} should list three things it does`);
    for (const f of i.features) assert.ok(f.length > 8 && f.length < 120, `${i.id}: "${f}" is not a feature line`);
    assert.ok(Array.isArray(i.decision) && i.decision[0]?.length > 5 && i.decision[1]?.length > 40, `${i.id} has no interesting decision`);
  }
  for (const id of Object.keys(DETAILS)) assert.ok(islandById.has(id), `details for "${id}", which is not a project`);
});

test('every project has a world of its own: a scene, a caption, and the rendered pictures', () => {
  for (const i of ISLANDS) {
    const f = FORMS[i.id];
    assert.ok(f, `${i.id} has no scene in atlas/art/scenes.js`);
    assert.ok(f.alt?.length > 10 && f.alt.endsWith('.'), `${i.id}'s picture has no caption`);
    const pic = picture(i.id, { region: i.region, accent: i.palette[2] });
    assert.ok(pic.frag.includes('vec2 scene(vec3 p) {') && pic.u.uStone.length === 3, `${i.id} does not build into a shader`);
    for (const size of [900, 1800]) assert.ok(existsSync(join(root, `atlas/art/${i.id}-${size}.webp`)), `no ${size}px picture for ${i.id}: run node atlas/art/render.mjs ${i.id}`);
  }
  for (const id of Object.keys(FORMS)) assert.ok(islandById.has(id), `a scene for "${id}", which is not a project`);
  for (const f of ['portal-960', 'portal-1600', 'portal-2560', 'portal-tall-750', 'portal-tall-1200']) {
    assert.ok(existsSync(join(root, `atlas/art/${f}.webp`)), `the opening picture ${f} is missing`);
  }
  assert.ok(SCENES.portal.alt && html.includes(SCENES.portal.alt), 'the opening picture has lost its description');
});

test('no picture on the page is heavy enough to make it wait', () => {
  for (const f of ['portal-2560', 'portal-1600', 'portal-tall-1200']) assert.ok(kb(`atlas/art/${f}.webp`) < 400, `${f} is ${kb(`atlas/art/${f}.webp`).toFixed(0)} KB`);
  for (const i of ISLANDS) {
    assert.ok(kb(`atlas/art/${i.id}-900.webp`) < 120, `${i.id}-900 is ${kb(`atlas/art/${i.id}-900.webp`).toFixed(0)} KB`);
    assert.ok(kb(`atlas/art/${i.id}-1800.webp`) < 300, `${i.id}-1800 is ${kb(`atlas/art/${i.id}-1800.webp`).toFixed(0)} KB`);
  }
});

test('the way in has its film and its flight, and neither is heavy', () => {
  for (const name of ['portal-loop']) {
    for (const ext of ['mp4', 'webm']) {
      const f = `atlas/art/${name}.${ext}`;
      assert.ok(existsSync(join(root, f)), `${f} is missing: run node atlas/art/motion.mjs loop`);
      assert.ok(kb(f) < 3500, `${f} is ${kb(f).toFixed(0)} KB`);
    }
  }
  for (const set of ['wide', 'tall']) {
    let total = 0;
    for (let i = 0; i < 32; i++) {
      const f = `atlas/art/flight/${set}-${String(i).padStart(2, '0')}.webp`;
      assert.ok(existsSync(join(root, f)), `${f} is missing: run node atlas/art/motion.mjs flight`);
      total += kb(f);
    }
    assert.ok(total < 4000, `the ${set} flight is ${total.toFixed(0)} KB`);
  }
});

test('the gallery is six rooms, and every project hangs in its own', () => {
  const gallery = html.match(/<!-- gallery:start -->([\s\S]*?)<!-- gallery:end -->/)?.[1] ?? '';
  const rooms = [...gallery.matchAll(/<section class="room" id="r-([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(rooms.join(' '), REGIONS.map((r) => r.id).join(' '), 'the rooms are not the regions, in order');
  for (const r of REGIONS) {
    const room = gallery.slice(gallery.indexOf(`id="r-${r.id}"`)).split('<section class="room"')[0];
    for (const i of ISLANDS.filter((x) => x.region === r.id)) assert.ok(room.includes(`data-id="${i.id}"`), `${i.title} is not hung in ${r.name}`);
  }
  assert.equal((gallery.match(/class="painting /g) ?? []).length, ISLANDS.length, 'a painting is missing or hung twice');
});

test('every project has a screenshot of the real thing', () => {
  for (const i of ISLANDS) assert.ok(existsSync(join(root, `atlas/shots/${i.id}-960.webp`)), `no screenshot for ${i.id}`);
});

test('every Launch link opens a page that exists', () => {
  for (const i of ISLANDS) {
    if (i.id === 'tally') continue;
    assert.ok(i.href && existsSync(join(root, i.href)), `${i.id} launches ${i.href}, which does not exist`);
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

test('every project has its own page, and the generated markup is up to date', () => {
  for (const i of ISLANDS) assert.ok(existsSync(join(root, 'atlas/projects', i.id, 'index.html')), `no page for ${i.id}`);
  /* build.mjs --check exits 1 if any page, or the gallery, differs from worlds.js */
  execFileSync(process.execPath, [join(root, 'atlas/build.mjs'), '--check'], { stdio: 'pipe' });
});

test('the gallery links every project without needing script', () => {
  const gallery = html.match(/<!-- gallery:start -->([\s\S]*?)<!-- gallery:end -->/)?.[1] ?? '';
  for (const i of ISLANDS) {
    assert.ok(gallery.includes(`href="projects/${i.id}/"`), `the gallery has no page link for ${i.id}`);
    assert.ok(gallery.includes(`src="art/${i.id}-900.webp"`), `the gallery does not show ${i.id}'s world`);
    if (i.id !== 'tally') assert.ok(gallery.includes(`href="../${i.href}"`), `the gallery cannot launch ${i.id}`);
  }
  for (const r of REGIONS) assert.ok(gallery.includes(`id="r-${r.id}"`) && html.includes(`href="#r-${r.id}"`), `${r.name} cannot be reached from the contents`);
});

test('the opening says what the brief asked it to say, and every way out leads somewhere', () => {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ');
  assert.ok(/Ideas that escape the ordinary\./i.test(text), 'the headline has changed');
  assert.ok(text.includes('I build AI-powered products, immersive tools, and unconventional solutions to real problems.'), 'the line under the headline has changed');
  const nav = html.match(/<nav aria-label="Main">([\s\S]*?)<\/nav>/)?.[1] ?? '';
  for (const [href, name] of [['#work', 'Work'], ['#about', 'About'], ['#contact', 'Contact']]) {
    assert.ok(nav.includes(`href="${href}">${name}<`), `the nav has no ${name}`);
    assert.ok(html.includes(`id="${href.slice(1)}"`), `${name} points at nothing`);
  }
  assert.ok(nav.includes('class="search"'), 'the nav has lost its search');
  assert.ok(html.includes('href="mailto:mohamedsucule@gmail.com"'), 'the contact address has gone');
  for (const gone of ['sky.js', 'hero.js', 'stage.js', 'islands.js', 'fx.js']) assert.ok(!html.includes(gone), `the page still loads ${gone}`);
});

test('the project pages show the same world as the gallery', () => {
  for (const i of ISLANDS) {
    const page = readFileSync(join(root, 'atlas/projects', i.id, 'index.html'), 'utf8');
    assert.ok(page.includes(`art/${i.id}-900.webp`), `${i.id}'s page does not show its world`);
    assert.ok(page.includes(`shots/${i.id}-960.webp`), `${i.id}'s page does not show its screenshot`);
  }
});

test('where the AI is: every claim about a model is backed by the project\'s own README', () => {
  const readme = (id) => readFileSync(join(root, id === 'tally' ? 'tally/README.md' : `apps/${id}/README.md`), 'utf8');
  for (const [id, ai] of Object.entries(AI)) {
    assert.ok(islandById.has(id), `AI notes for ${id}, which is not a project`);
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

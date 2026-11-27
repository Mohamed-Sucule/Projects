/* tests/front.test.mjs — the front page, its night and the CV agree with the
   lineup.

   The front page is one night, from 17:30 to 08:00, with a scene for each hour
   (SECTIONS in shared/atlas.js says which projects are in it). Its hours are
   written in four places: the scenes, the index down the side, the clock, and
   the sky's colours in assets/night.js. The day a scene moves, one of the four
   will be forgotten, so they are checked against each other here, along with
   the counts a person reads with nothing beside them to check against. */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './harness.mjs';
import { ATLAS, EVERYTHING, SECTIONS } from '../shared/atlas.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const home = read('index.html');
const cv = read('cv/index.html');
const script = read('assets/night.js');

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

const scenes = [...home.matchAll(/<section id="([a-z-]+)" class="scene[^"]*" data-at="(\d+)" data-hour="(\d\d:\d\d)" data-name="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)]
  .map(([, id, at, hour, name, html]) => ({ id, at: Number(at), hour, name, html }));
const section = (id) => SECTIONS.find((s) => s.id === id);
/* The element whose id is the project's: a scene, a print in the sketchbook, or a line in the footnote. */
const placeOf = (id) => home.match(new RegExp(`<(section|li) id="${id}"[\\s\\S]*?</\\1>`))?.[0] ?? '';

test('the night is in order, and every project in it has a scene of its own', () => {
  assert.ok(scenes.length > 0, 'found no scenes');
  for (let i = 1; i < scenes.length; i++) assert.ok(scenes[i].at > scenes[i - 1].at, `${scenes[i].id} comes before ${scenes[i - 1].id} in the night`);
  const night = scenes.map((s) => s.id).filter((id) => section('night').ids.includes(id));
  assert.deep(night, section('night').ids, `the night runs ${night.join(', ')}`);
});

test('every project in the lineup has a place on the front page that opens it', () => {
  for (const e of ATLAS) {
    const html = placeOf(e.id);
    assert.ok(html, `nothing on the front page has the id "${e.id}"`);
    assert.ok(html.includes(`href="${e.href}"`), `${e.title}'s place on the front page does not open ${e.href}`);
  }
  /* The sketchbook holds the small hours; the footnote holds the engineering. */
  const sketches = scenes.find((s) => s.id === 'small-hours').html;
  for (const id of section('sketches').ids) assert.ok(sketches.includes(`id="${id}"`), `${id} is not in the small hours`);
  const under = home.match(/<aside class="under"[\s\S]*?<\/aside>/)?.[0] ?? '';
  for (const id of section('engineering').ids) assert.ok(under.includes(`id="${id}"`), `${id} is not under the surface`);
});

test('each scene says its own hour, and the clock agrees', () => {
  for (const s of scenes) {
    const minutes = (17 * 60 + 30 + s.at) % (24 * 60);
    const hour = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    assert.equal(s.hour, hour, `${s.id} is at ${s.at} minutes, which is ${hour}, not ${s.hour}`);
    assert.ok(s.html.includes(`<time>${s.hour}</time>`), `${s.id} does not show ${s.hour}`);
  }
});

test('the index down the side lists every scene at its hour', () => {
  const rail = home.match(/<nav class="rail"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const listed = [...rail.matchAll(/<a href="#([a-z-]+)"><time>(\d\d:\d\d)<\/time><span>([^<]+)<\/span><\/a>/g)].map(([, id, hour, name]) => ({ id, hour, name }));
  assert.deep(listed.map((l) => l.id), scenes.map((s) => s.id), 'the index and the scenes disagree');
  for (const [i, l] of listed.entries()) {
    assert.equal(l.hour, scenes[i].hour, `the index puts ${l.id} at ${l.hour}`);
    assert.equal(l.name, scenes[i].name, `the index calls ${l.id} "${l.name}"; the clock will say "${scenes[i].name}"`);
  }
});

test('the sky has a look for every scene, at the same hour', () => {
  /* night.js pairs the n-th scene with the n-th sky. */
  const keys = [...script.matchAll(/\{ at: (\d+), top: '#[0-9a-f]{6}'/g)].map((m) => Number(m[1]));
  assert.deep(keys, scenes.map((s) => s.at), 'assets/night.js has a different set of hours from the page');
});

test('each scene shows its work once', () => {
  for (const sc of scenes) {
    const frames = (sc.html.match(/<figure class="frame/g) ?? []).length;
    assert.ok(frames <= 1, `${sc.id} shows ${frames} recordings`);
  }
});

test('every picture and recording on the front page is there, and the recordings are light', () => {
  const files = new Set();
  for (const m of home.matchAll(/(?:src|poster)="(assets\/[^"]+)"/g)) files.add(m[1]);
  for (const m of home.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(',')) files.add(part.trim().split(' ')[0]);
  for (const f of files) assert.ok(existsSync(join(root, f)), `${f} is missing`);
  const videos = [...home.matchAll(/<video([^>]*)>([\s\S]*?)<\/video>/g)];
  assert.ok(videos.length >= 5, `only ${videos.length} recordings`);
  for (const [, attrs, inner] of videos) {
    /* Silent, looping, inline on a phone, and nothing fetched until it is on screen. */
    for (const a of ['muted', 'loop', 'playsinline', 'preload="none"', 'poster="']) assert.ok(attrs.includes(a), `a recording is missing ${a}: ${attrs}`);
    const src = inner.match(/src="([^"]+\.mp4)"/)?.[1];
    assert.ok(src && existsSync(join(root, src)), `a recording has no file: ${inner}`);
    assert.ok(statSync(join(root, src)).size < 1_000_000, `${src} is over 1 MB`);
  }
});

test('the moving parts can be stopped', () => {
  /* WCAG 2.2.2: anything that moves on its own for more than five seconds can be paused. */
  assert.ok(/<button class="motion" type="button" aria-pressed="true" aria-label="Motion"/.test(home), 'no motion button');
  assert.ok(script.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'night.js ignores prefers-reduced-motion');
});

test('nothing left off the site is linked from it', () => {
  /* A project outside the lineup still runs at its address, but the site does
     not point at it. */
  const shown = new Set(ATLAS.map((e) => e.href));
  const hidden = EVERYTHING.filter((e) => !shown.has(e.href));
  for (const page of ['index.html', 'cv/index.html']) {
    const html = read(page);
    for (const e of hidden) {
      const path = e.href.replace(/index\.html$/, '');
      assert.ok(!new RegExp(`href="(?:\\.\\./)*${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`).test(html), `${page} links ${e.title}, which is not in the lineup`);
    }
  }
});

test('the front page and the CV count the projects the site shows', () => {
  const said = home.match(/<span data-count="night">([^<]*)<\/span>/)?.[1];
  assert.equal(said, WORDS[section('night').ids.length], `the front page says "${said}" projects in the evening; there are ${section('night').ids.length}`);
  const cvSaid = Number(cv.match(/Portfolio <span>· (\d+) projects/)?.[1]);
  assert.equal(cvSaid, ATLAS.length, `the CV says ${cvSaid}; the lineup has ${ATLAS.length}`);
});

test('the CV is offered as a PDF wherever it is linked', () => {
  /* The PDF is printed from cv/index.html by cv/build.mjs. A link to a file
     that was never built is the worst possible broken link on this site. */
  const pdf = 'cv/Mohamed-Sucule-CV.pdf';
  assert.ok(home.includes(`href="${pdf}"`), 'the front page does not link the CV PDF');
  assert.ok(cv.includes('href="Mohamed-Sucule-CV.pdf"'), 'the CV page does not link its PDF');
  assert.ok(existsSync(join(root, pdf)), `${pdf} has not been built: run node cv/build.mjs`);
  /* The same CV in Word, for the applications that ask for one. */
  assert.ok(cv.includes('href="Mohamed-Sucule-CV.docx"'), 'the CV page does not offer the Word version');
  assert.ok(existsSync(join(root, 'cv/Mohamed-Sucule-CV.docx')), 'the Word CV has not been built: run node cv/build.mjs');
});

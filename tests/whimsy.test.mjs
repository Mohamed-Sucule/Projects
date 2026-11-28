/* tests/whimsy.test.mjs — the small pleasures on the front page (assets/whimsy.js
   and the notes in the margin of index.html).

   The sun has to stay under the hand that pulls it, which is arithmetic: the
   scroll position the pull asks for has to put the sun back where the pointer
   is. The constellations have to fit the gap they are drawn in and come out in
   order, stars first. And all of it is decoration: hidden from assistive
   technology and never in the way of a click. */

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.mjs';
import { sunTop, invert, pullTo, SHAPES, stars, chartPlace, ROOM } from '../assets/whimsy.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = read('assets/night.css');
const night = read('assets/night.js');
const whimsy = read('assets/whimsy.js');
const home = read('index.html');
const rule = (sel) => { const i = css.indexOf(sel); assert.ok(i >= 0, `no rule for ${sel}`); return css.slice(i, css.indexOf('}', i)); };

/* The page's own easing, read from night.js so the two cannot drift apart. */
const easeSource = night.match(/const ease = \(t\) => ([^;]+);/);
const ease = new Function('t', `return ${easeSource[1]};`);

test('the sky and the pull agree on where the sun is', () => {
  assert.ok(/--sun-y', `\$\{sunTop\(sun\)/.test(night), 'night.js places the sun some other way than sunTop');
  assert.equal(sunTop(1), 18);
  assert.equal(sunTop(0), 100, 'a set sun is not at the bottom of the screen');
});

test('the sun stays under the hand that pulls it', () => {
  const from = 0, to = 930, sunFrom = 0.9, sunTo = 0;
  /* Pull it to a height, scroll where the pull says, and the evening puts the sun back at that height. */
  for (let top = sunTop(sunFrom); top <= 100; top += 2.5) {
    const y = pullTo({ top, from, to, sunFrom, sunTo, ease });
    const sun = sunFrom + (sunTo - sunFrom) * ease((y - from) / (to - from));
    assert.ok(Math.abs(sunTop(sun) - top) < 1e-6, `pulled to ${top}vh, the sun ends up at ${sunTop(sun)}vh`);
  }
  /* Further down is further into the evening, and the ends hold. */
  let last = -1;
  for (let top = 20; top <= 100; top += 1) {
    const y = pullTo({ top, from, to, sunFrom, sunTo, ease });
    assert.ok(y >= last, `pulling lower went back up the page at ${top}vh`);
    last = y;
  }
  assert.equal(pullTo({ top: 0, from, to, sunFrom, sunTo, ease }), from, 'pulling up past dusk scrolls above the page');
  assert.ok(Math.abs(pullTo({ top: 140, from, to, sunFrom, sunTo, ease }) - to) < 1e-6, 'pulling past the horizon goes beyond Ember');
});

test('invert finds where a rising curve reaches a value', () => {
  for (const v of [0, 0.1, 0.37, 0.5, 0.92, 1]) assert.ok(Math.abs(ease(invert(ease, v)) - v) < 1e-9, `ease(invert(${v}))`);
});

test('letting go most of the way down lets the sun set, at Ember', () => {
  assert.ok(/\(scrollY - anchors\[0\]\) \/ span > 0\.6\) scrollTo\(\{ top: anchors\[1\]/.test(night), 'the sun does not finish setting on release');
  assert.ok(/behavior: moving \? 'smooth' : 'auto'/.test(night), 'the sun glides down with motion off');
});

test('every scene after dusk has a constellation, inside its square', () => {
  const ids = [...home.matchAll(/<section id="([\w-]+)" class="scene[^"]*" data-at="(\d+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10, `only ${ids.length} scenes found`);
  for (const id of ids.slice(1)) assert.ok(SHAPES[id], `no constellation before ${id}`);
  const names = new Set();
  for (const [id, shape] of Object.entries(SHAPES)) {
    assert.ok(ids.includes(id), `a constellation for ${id}, which is not on the page`);
    assert.ok(/^the [A-Z]/.test(shape.name), `${id}'s constellation is called ${shape.name}`);
    assert.ok(!names.has(shape.name), `two constellations called ${shape.name}`);
    names.add(shape.name);
    for (const [x, y] of stars(shape)) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `${shape.name} has a star outside its square at ${x}, ${y}`);
    assert.ok(stars(shape).length >= 4 && stars(shape).length <= 24, `${shape.name} has ${stars(shape).length} stars`);
  }
});

test('a constellation shares each star between the lines that meet there', () => {
  const pin = SHAPES['your-place'];
  const ends = pin.lines.flat().length + (pin.dots?.length ?? 0);
  assert.ok(stars(pin).length <= ends);
  const hex = stars(SHAPES.flurdle);
  assert.equal(hex.length, 7, 'a closed hexagon and its centre should be seven stars');
});

test('a constellation fits its gap and comes out stars first', () => {
  const vh = 900, vw = 1440;
  assert.equal(chartPlace(400, 400 + ROOM - 1, vh, vw), null, 'drawn in a gap too small for it');
  assert.equal(chartPlace(3000, 3300, vh, vw), null, 'drawn while its gap is off screen');
  const centred = chartPlace(300, 600, vh, vw);
  assert.ok(centred.shown > 0.99 && centred.stars === 1 && centred.lines === 1 && centred.label === 1, 'not all there when centred');
  assert.ok(centred.size <= 300 * 0.62 + 1e-9, 'bigger than its gap');
  assert.ok(chartPlace(-500, 1400, vh, 400).size <= 200, 'wider than half a narrow screen');
  for (let top = -700; top < 1300; top += 20) {
    const at = chartPlace(top, top + 280, vh, vw);
    if (!at) continue;
    assert.ok(at.stars >= at.lines && at.lines >= at.label, `out of order at ${top}: stars ${at.stars}, lines ${at.lines}, name ${at.label}`);
  }
});

test('the constellations never sit on a note in the margin', () => {
  assert.ok(/s\.querySelectorAll\('\.scribble'\)/.test(whimsy), 'the notes are not counted as content when the gaps are measured');
});

test('the notes in the margin are a few, and only decoration', () => {
  const notes = [...home.matchAll(/<(p|span) class="scribble[^"]*"([^>]*)>/g)];
  assert.ok(notes.length >= 4 && notes.length <= 8, `${notes.length} notes: charming, or busy?`);
  for (const m of notes) assert.ok(m[2].includes('aria-hidden="true"'), 'a note is read aloud');
  assert.ok(rule('.scribble {').includes('pointer-events: none'), 'a note can take a click');
  /* Telling someone with a touch screen to move their mouse is not whimsy. */
  assert.ok(/@media \(hover: none\), \(pointer: coarse\) \{ \.scribble\.in-frame \{ display: none; \} \}/.test(css), 'the mouse note shows on touch screens');
  assert.ok(home.includes('scribble in-frame') && home.includes('move your mouse'), 'the mouse note is not the in-frame one');
  /* A figure's caption stays its first or last child. */
  for (const fig of home.match(/<figure class="frame[\s\S]*?<\/figure>/g)) {
    const kids = fig.replace(/^<figure[^>]*>/, '').replace(/<\/figure>$/, '').trim();
    if (kids.includes('<figcaption')) assert.ok(kids.endsWith('</figcaption>') || kids.startsWith('<figcaption'), 'a note pushed a caption into the middle of its figure');
  }
});

test('the sun and the stars are decoration too', () => {
  assert.ok(night.includes("grip.setAttribute('aria-hidden', 'true')"), 'the sun handle is announced');
  assert.ok(whimsy.includes("host.setAttribute('aria-hidden', 'true')"), 'the constellations are announced');
  assert.ok(rule('.sky-chart {').includes('pointer-events: none'), 'the constellations take clicks');
  assert.ok(rule('.sun-grip .hint {').includes('pointer-events: none'), 'the hint takes clicks');
  /* The handle only exists while the sun is the evening's, and the hint goes once you scroll. */
  assert.ok(rule('.sun-grip {').includes('display: none'), 'the handle is there all night');
  assert.ok(css.includes('.sun-up .sun-grip { display: block; }'));
  assert.ok(css.includes('.at-dusk .sun-grip .hint { opacity: 1; }'));
  /* A finger pushing up over the sun still scrolls the page where the browser allows it. */
  assert.ok(rule('.sun-grip {').includes('touch-action: pan-down'), 'the sun traps a finger scrolling down the page');
});

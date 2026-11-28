/* tests/takeover.test.mjs — the three projects that take over the night (assets/takeover.js).

   The effects are drawn in a browser, but what decides them is arithmetic that
   can be checked here: when a scene counts as the one being looked at, how far
   the streets have drawn, that a flame's flicker stays a flicker and the beam
   keeps the story's period. The rest is checked against the stylesheet and the
   script: decoration that never takes a click, never sits over the words, and
   stands still when motion is off. */

import { readFileSync } from 'node:fs';
import { test, assert } from './harness.mjs';
import { presence, through, flicker, drawnShare, beamAngle, BEAM_PERIOD } from '../assets/takeover.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = read('assets/night.css');
const script = read('assets/takeover.js');
const home = read('index.html');

test('a scene takes over only while it is the one on screen', () => {
  const vh = 900, h = 1000;
  const centred = (vh - h) / 2;
  assert.equal(presence(centred, h, vh), 1, 'a centred scene is not fully present');
  assert.equal(presence(vh * 2, h, vh), 0, 'a scene two screens down still takes over');
  assert.equal(presence(-h - vh, h, vh), 0, 'a scene already scrolled past still takes over');
  for (let top = -h; top < vh; top += 25) {
    const p = presence(top, h, vh);
    assert.ok(p >= 0 && p <= 1, `presence ${p} at ${top}`);
  }
  /* And it rises and falls smoothly either side of the middle, with no jumps. */
  for (let top = -h; top < vh; top += 5) assert.ok(Math.abs(presence(top + 5, h, vh) - presence(top, h, vh)) < 0.02, `presence jumps at ${top}`);
});

test('the streets draw in order, as the scene comes up, and are all there once it has', () => {
  const vh = 900, h = 1000;
  assert.equal(through(vh, h, vh), 0, 'drawing before the scene is on screen');
  assert.equal(through(0, h, vh), 1, 'not finished once the scene is in place');
  for (let top = vh; top > -200; top -= 10) assert.ok(through(top - 10, h, vh) >= through(top, h, vh), 'the drawing goes backwards while scrolling down');
  const bands = 8;
  for (let band = 1; band < bands; band++) {
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) assert.ok(drawnShare(p, band, bands) <= drawnShare(p, band - 1, bands), `band ${band} gets ahead of band ${band - 1}`);
  }
  for (let band = 0; band < bands; band++) assert.equal(drawnShare(1, band, bands), 1, `band ${band} is unfinished at the end`);
  assert.equal(drawnShare(0, 0, bands), 0);
});

test('a flame flickers, it does not pulse', () => {
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 120; t += 1 / 60) { const f = flicker(t); lo = Math.min(lo, f); hi = Math.max(hi, f); }
  assert.ok(lo > 0.88 && hi < 1.12, `the flame swings from ${lo.toFixed(3)} to ${hi.toFixed(3)}`);
  assert.ok(hi - lo > 0.1, 'the flame hardly moves');
});

test('the beam keeps the story\'s time: once round every 11.2 seconds', () => {
  assert.equal(BEAM_PERIOD, 11.2);
  assert.ok(Math.abs(beamAngle(BEAM_PERIOD / 4) - Math.PI / 2) < 1e-9);
  assert.ok(beamAngle(BEAM_PERIOD) < 1e-9 || Math.abs(beamAngle(BEAM_PERIOD) - 2 * Math.PI) < 1e-9);
  /* And the front page says the same number. */
  assert.ok(home.includes('once every 11.2 seconds'), 'the page and the beam disagree on the period');
});

test('it is decoration: hidden, never in the way of a click, and stills with motion off', () => {
  assert.ok(script.includes("el.setAttribute('aria-hidden', 'true')"), 'the layers are not hidden from assistive technology');
  for (const sel of ['canvas.takeover {', '.flame {', '.streets {']) {
    const rule = css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
    assert.ok(rule.includes('pointer-events: none'), `${sel} can take a click`);
  }
  /* With motion off: no flicker, no trailing, no drawing, no turning. */
  assert.ok(/const f = on \? flicker\(t\) : 1/.test(script), 'the flame flickers with motion off');
  assert.ok(/const progress = on \? through\(/.test(script), 'the streets animate with motion off');
  assert.ok(/const a = on \? beamAngle\(t\)/.test(script), 'the beam turns with motion off');
  /* The words sit over the dark: Ember's copy is above the front layer. */
  const front = Number(css.match(/canvas\.takeover\.front \{ z-index: (\d+)/)[1]);
  const words = Number(css.match(/\.scene\.feature \.copy, \.scene\.feature \.frame figcaption \{ position: relative; z-index: (\d+)/)[1]);
  assert.ok(words > front, `Ember's words (${words}) are under the dark (${front})`);
});

test('the streets are there to fetch, and drawn in bands', () => {
  const svg = read('assets/streets.svg');
  const bands = [...svg.matchAll(/data-band="(\d)"/g)].map((m) => Number(m[1]));
  assert.ok(bands.length >= 8, `only ${bands.length} drawing groups`);
  assert.deep([...new Set(bands)].sort(), [0, 1, 2, 3, 4, 5, 6, 7], 'a band is missing');
  assert.ok(svg.length < 120_000, `assets/streets.svg is ${svg.length} bytes`);
  for (const m of svg.matchAll(/<path class="(\w+)" data-band/g)) assert.ok(['major', 'mid', 'minor', 'fine'].includes(m[1]), `an unknown kind of street: ${m[1]}`);
});

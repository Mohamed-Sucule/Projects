/* tests/tuner.test.mjs — the pitch detector, on sounds with known answers.

   Every signal here is synthesised, so the right answer is known exactly and
   the detector has nowhere to hide. The hard cases are the point: a note
   whose fundamental is quieter than its harmonics, and one whose fundamental
   has been removed altogether — both of which a tuner that picks the loudest
   frequency reports an octave or more too high. */

import { test, assert } from './harness.mjs';
import { yin, noteOf, freqOf, nearestString, Steady, pluck, INSTRUMENTS, nameOfMidi } from '../apps/tuner/pitch.js';

const RATE = 48000;
const buf = (f, n = 4096) => {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = f(i / RATE);
  return b;
};
const cents = (a, b) => 1200 * Math.log2(a / b);

test('a pure tone is found to within a cent, bass to top string', () => {
  for (const f of [41.2, 55, 82.41, 110, 146.83, 196, 246.94, 329.63, 440, 659.25, 987.77, 1318.5]) {
    const r = yin(buf((t) => 0.5 * Math.sin(2 * Math.PI * f * t)), RATE);
    assert.ok(r, `nothing found at ${f} Hz`);
    assert.ok(Math.abs(cents(r.freq, f)) < 1, `${f} Hz came out as ${r.freq.toFixed(2)}`);
  }
});

test('a note whose harmonics are louder than its fundamental is not an octave out', () => {
  for (const f of [82.41, 110, 196]) {
    const r = yin(pluck(new Float32Array(4096), RATE, f, 0.05), RATE);
    assert.ok(Math.abs(cents(r.freq, f)) < 2, `${f} Hz came out as ${r.freq.toFixed(2)}`);
  }
});

test('a note with its fundamental removed is still heard at its pitch', () => {
  /* Harmonics 2 to 6 of 100 Hz and nothing at 100 Hz itself. The ear hears
     100 Hz — the "missing fundamental" — because the waveform still repeats
     every hundredth of a second. So does this. */
  const r = yin(buf((t) => [2, 3, 4, 5, 6].reduce((s, k) => s + Math.sin(2 * Math.PI * 100 * k * t) / k, 0) * 0.3), RATE);
  assert.ok(Math.abs(cents(r.freq, 100)) < 2, `heard ${r.freq.toFixed(2)} Hz`);
});

test('silence and noise have no pitch', () => {
  assert.equal(yin(new Float32Array(4096), RATE), null);
  let s = 12345;
  const noise = buf(() => ((s = (s * 1103515245 + 12345) >>> 0) / 2147483648 - 1) * 0.4);
  assert.equal(yin(noise, RATE), null);
});

test('a slightly flat A is read as slightly flat', () => {
  const f = 440 * 2 ** (-7 / 1200);
  const r = yin(buf((t) => 0.4 * Math.sin(2 * Math.PI * f * t)), RATE);
  const n = noteOf(r.freq);
  assert.equal(n.name, 'A');
  assert.ok(Math.abs(n.cents + 7) < 1, `read as ${n.cents.toFixed(2)} cents`);
});

test('notes are named and numbered the way musicians do', () => {
  assert.deep([noteOf(440).name, noteOf(440).octave, Math.round(noteOf(440).cents)], ['A', 4, 0]);
  assert.deep([noteOf(261.63).name, noteOf(261.63).octave], ['C', 4]);
  assert.deep([noteOf(82.41).name, noteOf(82.41).octave], ['E', 2]);
  assert.ok(Math.abs(noteOf(445).cents - 19.56) < 0.05);
  assert.equal(nameOfMidi(64), 'E4');
  assert.ok(Math.abs(freqOf(69) - 440) < 1e-9);
  assert.ok(Math.abs(noteOf(432, 432).cents) < 1e-9, 'the reference pitch moves with the setting');
});

test('on a guitar, a very flat E is a flat E and not a sharp D♯', () => {
  const eFlat = freqOf(40) * 2 ** (-60 / 1200);             // E2, sixty cents flat
  const s = nearestString(eFlat, INSTRUMENTS.guitar.strings);
  assert.equal(s.midi, 40);
  assert.ok(Math.abs(s.cents + 60) < 1e-6);
  assert.equal(noteOf(eFlat).name, 'D♯', 'whereas the nearest NOTE is D♯');
});

test('the needle ignores one wild reading', () => {
  const st = new Steady(5);
  for (const v of [0, 1, -1, 0]) st.push(v);
  assert.equal(st.push(1200), 0, 'an octave jump for one frame moves nothing');
});

test('the tunings are the standard ones', () => {
  assert.deep(INSTRUMENTS.guitar.strings.map(nameOfMidi), ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  assert.deep(INSTRUMENTS.bass.strings.map(nameOfMidi), ['E1', 'A1', 'D2', 'G2']);
  assert.deep(INSTRUMENTS.ukulele.strings.map(nameOfMidi), ['G4', 'C4', 'E4', 'A4']);
  assert.deep(INSTRUMENTS.violin.strings.map(nameOfMidi), ['G3', 'D4', 'A4', 'E5']);
});

/* ───────────────────────────────────────────────────────────────────────────
   tuner/pitch.js — what note is that, and how far off is it.

   A tuner has one hard part: hearing the pitch of a real instrument, which is
   not a sine wave. A guitar string rings at its fundamental and at twice it,
   three times it, four times it, and the fundamental is often the QUIETEST of
   them — a low E through a phone microphone is mostly its second and third
   harmonics. Pick the loudest frequency off a spectrum and the tuner calls
   the note an octave or a fifth too high and sends you off to snap a string.

   So this does not look for the loudest frequency. It looks for the PERIOD:
   the smallest shift at which the waveform lines up with itself. That is the
   YIN method (de Cheveigné and Kawahara, 2002), in its five steps:

     1. The difference function: for each shift τ, how different the signal
        is from itself τ samples later. Zero at τ = 0, and near zero again
        at every multiple of the period.
     2. Normalise it by its own running mean, so the dip at the true period
        is not beaten by the smaller dips a busy signal has everywhere.
     3. Take the FIRST shift that dips under a threshold — not the deepest,
        because the dips at 2τ and 3τ are as deep, and choosing one of those
        is the octave error the whole method exists to avoid.
     4. Walk down to the bottom of that dip.
     5. Fit a parabola through the bottom three points, because a period is
        not a whole number of samples and a tuner has to be right to a cent.

   A signal with no clear period — silence, breath, a room — has no dip under
   the threshold and gets no pitch at all, which is the correct answer.

   No DOM, no audio APIs. Samples in, a number out.
   ─────────────────────────────────────────────────────────────────────────── */

export const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/**
 * The fundamental frequency of a buffer of samples, or null if it has none.
 *
 * Returns { freq, clarity } — clarity is 1 minus the depth of the dip, near
 * 1 for a clean note and falling towards the threshold for a noisy one.
 */
export function yin(buf, sampleRate, { threshold = 0.12, minFreq = 30, maxFreq = 1600, gate = 0.008 } = {}) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < gate) return null;                       // nobody is playing

  const W = Math.floor(n / 2);
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(W, Math.ceil(sampleRate / minFreq));
  const d = new Float32Array(tauMax + 2);

  /* 1. The difference function. */
  for (let tau = 1; tau <= tauMax + 1 && tau < n - W; tau++) {
    let s = 0;
    for (let j = 0; j < W; j++) {
      const x = buf[j] - buf[j + tau];
      s += x * x;
    }
    d[tau] = s;
  }

  /* 2. Cumulative mean normalised difference. */
  const c = new Float32Array(tauMax + 2);
  c[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    running += d[tau];
    c[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  /* 3 and 4. The first dip under the threshold, followed to its bottom. */
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (c[t] < threshold) {
      while (t + 1 <= tauMax && c[t + 1] < c[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  /* 5. A parabola through the bottom three points; its vertex is the period
     to a fraction of a sample. */
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = c[tau - 1], b = c[tau], e = c[tau + 1];
    const denom = a - 2 * b + e;
    if (denom !== 0) better = tau + (a - e) / (2 * denom);
  }
  return { freq: sampleRate / better, clarity: 1 - c[tau] };
}

/**
 * Frequency → the nearest note and how far off it is, in cents (hundredths
 * of a semitone). `a4` is the reference; orchestras disagree about it.
 */
export function noteOf(freq, a4 = 440) {
  const midi = 69 + 12 * Math.log2(freq / a4);
  const nearest = Math.round(midi);
  return {
    midi: nearest,
    name: NAMES[((nearest % 12) + 12) % 12],
    octave: Math.floor(nearest / 12) - 1,
    cents: (midi - nearest) * 100,
    target: a4 * 2 ** ((nearest - 69) / 12),
  };
}

/** A note number → its frequency. */
export function freqOf(midi, a4 = 440) {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** The usual tunings, lowest string first, as note numbers. */
export const INSTRUMENTS = {
  chromatic: { label: 'Any note', strings: [] },
  guitar:    { label: 'Guitar',   strings: [40, 45, 50, 55, 59, 64] },     // E2 A2 D3 G3 B3 E4
  bass:      { label: 'Bass',     strings: [28, 33, 38, 43] },             // E1 A1 D2 G2
  ukulele:   { label: 'Ukulele',  strings: [67, 60, 64, 69] },             // G4 C4 E4 A4
  violin:    { label: 'Violin',   strings: [55, 62, 69, 76] },             // G3 D4 A4 E5
  cello:     { label: 'Cello',    strings: [36, 43, 50, 57] },             // C2 G2 D3 A3
};

export function nameOfMidi(midi) {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * On an instrument, the string being tuned is the nearest one — measured in
 * cents, not hertz, because the strings are evenly spaced in pitch and not
 * in frequency. Cents from THAT string, not from the nearest note: a guitar
 * string tuned down to D♯ is a very flat E, not a perfect D♯.
 */
export function nearestString(freq, strings, a4 = 440) {
  const midi = 69 + 12 * Math.log2(freq / a4);
  let best = null;
  for (const s of strings) {
    const cents = (midi - s) * 100;
    if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { midi: s, cents };
  }
  return best;
}

/**
 * The needle, steadied. A plucked string wobbles for its first moment and
 * the estimate wobbles with it; a median of the last few readings ignores a
 * single wild one, which an average would drag the needle towards.
 */
export class Steady {
  constructor(size = 5) { this.size = size; this.values = []; }
  push(v) {
    this.values.push(v);
    if (this.values.length > this.size) this.values.shift();
    const s = [...this.values].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  clear() { this.values = []; }
}

/* ── a note to tune when there is no microphone ─────────────────────────── */

/**
 * A plucked string, synthesised: a fundamental and its harmonics, each one
 * quieter and dying faster than the last, with the fundamental deliberately
 * weak — the case that fools a spectrum-peak tuner, and the one a real low
 * string through a small microphone actually looks like.
 */
export function pluck(out, sampleRate, freq, t0 = 0, { harmonics = 8, weakFundamental = true } = {}) {
  for (let i = 0; i < out.length; i++) {
    const t = t0 + i / sampleRate;
    let s = 0;
    for (let k = 1; k <= harmonics; k++) {
      const amp = (k === 1 && weakFundamental ? 0.35 : 1) / k;
      s += amp * Math.exp(-t * 0.6 * k) * Math.sin(2 * Math.PI * freq * k * t + k * 0.7);
    }
    out[i] = 0.35 * s;
  }
  return out;
}

/* play/ember/audio.js — the score and every noise, synthesised live; there are no sound files. */

const SCALES = {
  1: { root: 38, steps: [0, 2, 3, 5, 7, 8, 10], chords: [0, 8, 3, 10] },
  2: { root: 40, steps: [0, 3, 5, 7, 10], chords: [0, 8, 5, 3] },
  3: { root: 36, steps: [0, 2, 3, 5, 7, 8, 11], chords: [0, 8, 5, 7] },
};
const MOTIF = {
  1: [[0, 2], [3, 1], [5, 1], [7, 3], [5, 1], [3, 2], [2, 2], [0, 4]],
  2: [[7, 2], [5, 2], [3, 2], [5, 2], [10, 4], [7, 2], [5, 2]],
  3: [[0, 1], [3, 1], [7, 2], [8, 2], [7, 1], [11, 1], [12, 4], [8, 2], [7, 2]],
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Sound {
  constructor() {
    this.ac = null;
    this.muted = false;
    this.want = { mode: 'title', act: 1, phase: 1 };
    this.playing = null;
    this.held = [];
    this.beat = 0;
    this.next = 0;
    this.timer = null;
  }

  start() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = (this.ac = new AC());
    this.master = ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ac.destination);
    this.music = ac.createGain(); this.music.gain.value = 0.55; this.music.connect(this.master);
    this.fx = ac.createGain(); this.fx.gain.value = 0.9; this.fx.connect(this.master);
    this.verb = ac.createConvolver();
    const len = ac.sampleRate * 2.8, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
    this.verb.buffer = ir;
    this.wet = ac.createGain(); this.wet.gain.value = 0.35;
    this.verb.connect(this.wet).connect(this.master);
    this.noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.next = ac.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ac.currentTime, 0.05);
  }

  setMusic(mode, act = this.want.act, phase = 1) { this.want = { mode, act, phase }; }

  /* ── building blocks ── */

  tone({ f, to, type = 'sine', t = 0, dur = 0.2, gain = 0.2, attack = 0.005, bus = this.fx, verb = 0, filter, q = 1 }) {
    const ac = this.ac, at = ac.currentTime + t;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node = o;
    if (filter) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; fl.Q.value = q; node.connect(fl); node = fl; }
    node.connect(g).connect(bus);
    if (verb) { const s = ac.createGain(); s.gain.value = verb; g.connect(s).connect(this.verb); }
    o.start(at); o.stop(at + dur + 0.05);
  }

  noise({ t = 0, dur = 0.2, gain = 0.2, type = 'lowpass', f = 1000, to, q = 1, bus = this.fx, verb = 0, attack = 0.004 }) {
    const ac = this.ac, at = ac.currentTime + t;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, at); fl.Q.value = q;
    if (to) fl.frequency.exponentialRampToValueAtTime(to, at + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(fl).connect(g).connect(bus);
    if (verb) { const s = ac.createGain(); s.gain.value = verb; g.connect(s).connect(this.verb); }
    src.start(at, Math.random() * 0.5); src.stop(at + dur + 0.05);
  }

  /* ── effects ── */

  play(e) {
    if (!this.ac || this.muted) return;
    const r = Math.random();
    switch (e.type) {
      case 'swing': this.noise({ dur: e.combo === 3 ? 0.16 : 0.1, gain: e.combo === 3 ? 0.22 : 0.13, type: 'bandpass', f: 900, to: 3500, q: 1.2 }); break;
      case 'hit':
        if (e.weak) { this.tone({ f: 900, type: 'triangle', dur: 0.12, gain: 0.08 }); break; }
        this.tone({ f: e.boss ? 120 : 160, to: 50, dur: 0.12, gain: e.heavy ? 0.4 : 0.28 });
        this.noise({ dur: 0.05, gain: 0.18, f: 2500 });
        if (e.boss) this.tone({ f: 330 + r * 40, type: 'square', dur: 0.06, gain: 0.05, filter: 1800 });
        break;
      case 'clang': this.tone({ f: 1250, type: 'triangle', dur: 0.25, gain: 0.1, verb: 0.3 }); this.tone({ f: 1870, type: 'triangle', dur: 0.2, gain: 0.06 }); break;
      case 'kill': this.noise({ dur: 0.3, gain: 0.22, f: 700, to: 150 }); this.tone({ f: 90, to: 40, dur: 0.25, gain: 0.3 }); break;
      case 'hurt': this.tone({ f: 110, to: 38, dur: 0.3, gain: 0.45 }); this.noise({ dur: 0.18, gain: 0.25, f: 1200, to: 300 }); break;
      case 'dash': this.noise({ dur: 0.18, gain: 0.14, type: 'bandpass', f: 400, to: 1800, q: 0.8 }); break;
      case 'flare':
        this.noise({ dur: 0.7, gain: 0.3, type: 'bandpass', f: 300, to: 2400, q: 0.6, verb: 0.4 });
        this.tone({ f: 220, to: 880, type: 'triangle', dur: 0.6, gain: 0.12, verb: 0.5 });
        for (let i = 0; i < 4; i++) this.tone({ f: 1500 + i * 450, type: 'sine', t: i * 0.04, dur: 0.5, gain: 0.03, verb: 0.6 });
        break;
      case 'cinder': this.tone({ f: [1760, 1976, 2349, 2637][(r * 4) | 0], dur: 0.18, gain: 0.04, verb: 0.3 }); break;
      case 'brazier': this.noise({ dur: 0.9, gain: 0.18, f: 600, to: 3000, attack: 0.2, verb: 0.3 }); this.tone({ f: 70, to: 45, dur: 0.6, gain: 0.3 }); break;
      case 'lock': this.noise({ dur: 0.25, gain: 0.35, f: 400 }); this.tone({ f: 190, type: 'square', dur: 0.12, gain: 0.07, filter: 900 }); this.tone({ f: 60, to: 35, dur: 0.4, gain: 0.35 }); break;
      case 'clear': [0, 4, 7, 12].forEach((s, i) => this.tone({ f: hz(74 + s), type: 'triangle', t: i * 0.09, dur: 1.2, gain: 0.07, verb: 0.6 })); break;
      case 'spawn': this.noise({ dur: 0.7, gain: 0.08, f: 200, to: 1400, attack: 0.6, verb: 0.3 }); break;
      case 'lunge': this.noise({ dur: 0.2, gain: 0.12, f: 300, to: 120 }); break;
      case 'shoot': this.tone({ f: 700, to: 300, type: 'sine', dur: 0.2, gain: 0.08, verb: 0.3 }); break;
      case 'sing': this.tone({ f: hz(64 + [0, 3, 7][(r * 3) | 0]), type: 'sawtooth', dur: 0.6, gain: 0.05, filter: 1100, q: 4, attack: 0.08, verb: 0.6 }); break;
      case 'slam': this.tone({ f: 80, to: 28, dur: 0.8, gain: 0.6 }); this.noise({ dur: 0.6, gain: 0.4, f: 500, to: 80 }); break;
      case 'sweep': this.noise({ dur: 0.3, gain: 0.25, type: 'bandpass', f: 300, to: 1500, q: 0.7 }); break;
      case 'charge': this.noise({ dur: 0.8, gain: 0.25, f: 180, to: 400 }); break;
      case 'crash': this.tone({ f: 70, to: 30, dur: 0.7, gain: 0.55 }); this.noise({ dur: 0.5, gain: 0.35, f: 900, to: 100 }); this.tone({ f: 240, type: 'square', dur: 0.2, gain: 0.06, filter: 1200 }); break;
      case 'roar': this.tone({ f: 110, to: 60, type: 'sawtooth', dur: 1.3, gain: 0.25, filter: 700, attack: 0.1, verb: 0.4 }); this.noise({ dur: 1.2, gain: 0.2, f: 500, to: 200, attack: 0.1 }); break;
      case 'blink': this.noise({ dur: 0.35, gain: 0.12, type: 'highpass', f: 5000, to: 1200, attack: 0.25 }); break;
      case 'snuff': this.noise({ dur: 0.6, gain: 0.18, type: 'highpass', f: 3000, to: 600 }); break;
      case 'grasp': this.tone({ f: 70, to: 45, type: 'sawtooth', dur: 0.5, gain: 0.08, filter: 300 }); break;
      case 'spikes': this.noise({ dur: 0.4, gain: 0.2, f: 800, to: 200 }); break;
      case 'summon': this.tone({ f: 200, to: 50, type: 'sawtooth', dur: 0.9, gain: 0.1, filter: 600, verb: 0.5 }); break;
      case 'eclipse': case 'lastlight':
        this.tone({ f: 220, to: 27, type: 'sawtooth', dur: 2.4, gain: 0.25, filter: 500, attack: 0.05, verb: 0.6 });
        this.noise({ dur: 2, gain: 0.2, f: 1200, to: 60, verb: 0.5 });
        break;
      case 'exposed': this.tone({ f: 60, dur: 0.15, gain: 0.5 }); this.tone({ f: 60, t: 0.22, dur: 0.15, gain: 0.4 }); break;
      case 'bossIntro': [55, 82.4, 110, 164.8].forEach((f, i) => this.tone({ f, type: i ? 'triangle' : 'sine', dur: 4, gain: 0.25 / (i + 1), attack: 0.01, verb: 0.8 })); this.noise({ dur: 2, gain: 0.15, f: 300, verb: 0.6 }); break;
      case 'bossDown':
        this.tone({ f: 60, to: 25, dur: 2.5, gain: 0.7 });
        this.noise({ dur: 2.5, gain: 0.35, f: 1400, to: 60, verb: 0.7 });
        [0, 7, 12, 16].forEach((s, i) => this.tone({ f: hz(57 + s), type: 'sawtooth', t: 0.4, dur: 4, gain: 0.04, filter: 1300, attack: 0.8, verb: 0.9 }));
        break;
      case 'die': [0, -3, -7, -12].forEach((s, i) => this.tone({ f: hz(62 + s), type: 'triangle', t: i * 0.3, dur: 1.2, gain: 0.1, verb: 0.7 })); this.tone({ f: 80, to: 30, dur: 1.5, gain: 0.4 }); break;
      case 'respawn': this.noise({ dur: 1, gain: 0.12, f: 400, to: 4000, attack: 0.5, verb: 0.5 }); break;
      case 'lore': [0, 7, 12].forEach((s, i) => this.tone({ f: hz(69 + s), t: i * 0.12, dur: 2, gain: 0.06, verb: 0.8 })); break;
      case 'boon': [0, 4, 7, 11, 14].forEach((s, i) => this.tone({ f: hz(72 + s), type: 'triangle', t: i * 0.07, dur: 1.5, gain: 0.05, verb: 0.7 })); break;
      case 'boonTaken': this.tone({ f: 330, to: 990, type: 'triangle', dur: 0.5, gain: 0.1, verb: 0.6 }); break;
      case 'secondwind': this.noise({ dur: 0.8, gain: 0.3, type: 'bandpass', f: 200, to: 3000, verb: 0.5 }); break;
      case 'exit': [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ f: hz(62 + s), type: 'triangle', t: i * 0.15, dur: 3, gain: 0.06, verb: 0.8 })); break;
      case 'grieve': this.tone({ f: 880, to: 440, type: 'sine', dur: 1.4, gain: 0.1, attack: 0.2, verb: 0.8 }); break;
      case 'chorus': [0, 3, 7].forEach((s) => this.tone({ f: hz(52 + s), type: 'sawtooth', dur: 2.2, gain: 0.05, filter: 900, q: 5, attack: 0.5, verb: 0.7 })); break;
      case 'dive': this.noise({ dur: 0.5, gain: 0.15, type: 'bandpass', f: 2000, to: 500 }); break;
      case 'fizz': this.noise({ dur: 0.08, gain: 0.03, type: 'highpass', f: 4000 }); break;
      case 'slash': this.noise({ dur: 0.15, gain: 0.18, type: 'bandpass', f: 1200, to: 4000 }); break;
      default: break;
    }
  }

  /* ── the score ── */

  stopHeld(fade = 1.2) {
    const t = this.ac.currentTime;
    for (const h of this.held) {
      h.g.gain.cancelScheduledValues(t);
      h.g.gain.setValueAtTime(h.g.gain.value, t);
      h.g.gain.linearRampToValueAtTime(0, t + fade);
      for (const o of h.o) o.stop(t + fade + 0.1);
    }
    this.held = [];
  }

  hold(freqs, { type = 'sawtooth', gain = 0.05, filter = 400, lfo = 0.1, attack = 2 } = {}) {
    const ac = this.ac, t = ac.currentTime;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; fl.Q.value = 2;
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = lfo; lg.gain.value = filter * 0.4;
    l.connect(lg).connect(fl.frequency);
    const os = [l];
    for (const f of freqs) for (const det of [-7, 7]) {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      o.connect(fl); o.start(t); os.push(o);
    }
    l.start(t);
    fl.connect(g).connect(this.music);
    const s = ac.createGain(); s.gain.value = 0.4; g.connect(s).connect(this.verb);
    this.held.push({ g, o: os });
  }

  schedule() {
    if (!this.ac) return;
    const w = this.want;
    const key = `${w.mode}:${w.act}:${w.phase}`;
    if (key !== this.playing) {
      const was = this.playing?.split(':')[0];
      this.playing = key;
      const sameBed = (was === 'explore' || was === 'combat') && (w.mode === 'explore' || w.mode === 'combat');
      if (!sameBed) {
        this.stopHeld(w.mode === 'silence' ? 0.6 : 1.5);
        const sc = SCALES[w.act] ?? SCALES[1];
        if (w.mode === 'explore' || w.mode === 'combat' || w.mode === 'title') this.hold([hz(sc.root), hz(sc.root + 7)], { filter: w.mode === 'title' ? 500 : 350, gain: 0.05 });
        if (w.mode === 'calm' || w.mode === 'ending') this.hold([hz(sc.root + 12), hz(sc.root + 19), hz(sc.root + 15 + (w.mode === 'ending' ? 1 : 0))], { filter: 900, gain: 0.035, attack: 3 });
        if (w.mode === 'boss' && w.act === 2) this.hold([hz(sc.root + 12), hz(sc.root + 19)], { filter: 1100, gain: 0.03, attack: 1 });
      }
      this.beat = 0;
      this.next = Math.max(this.next, this.ac.currentTime + 0.05);
    }
    if (this.muted) { this.next = this.ac.currentTime + 0.1; return; }
    const tempo = w.mode === 'boss' ? 126 + (w.phase - 1) * 8 : w.mode === 'combat' ? 100 : 72;
    const step = 60 / tempo / 4;
    while (this.next < this.ac.currentTime + 0.2) {
      this.sixteenth(this.beat, this.next - this.ac.currentTime, w, step);
      this.beat++;
      this.next += step;
    }
  }

  sixteenth(i, t, w, step) {
    const sc = SCALES[w.act] ?? SCALES[1];
    const note = (deg, oct = 0) => { const s = sc.steps; const d = ((deg % s.length) + s.length) % s.length; return sc.root + s[d] + 12 * (oct + Math.floor(deg / s.length)); };
    const bar = Math.floor(i / 16), pos = i % 16;
    const chord = sc.chords[Math.floor(bar / 2) % sc.chords.length];
    const m = this.music;
    if (w.mode === 'explore' || w.mode === 'title' || w.mode === 'calm' || w.mode === 'ending') {
      if (pos % 4 === 0 && Math.random() < (w.mode === 'title' ? 0.35 : 0.22)) {
        this.tone({ f: hz(note(Math.floor(Math.random() * 8), 3)), t, dur: 3, gain: 0.05, type: 'triangle', bus: m, verb: 0.9 });
      }
      if (w.mode === 'ending' && pos === 0 && bar % 2 === 0) {
        const mo = MOTIF[w.act === 3 ? 3 : 1];
        let at = t;
        for (const [s, len] of mo.slice(0, 4)) { this.tone({ f: hz(sc.root + 24 + s), t: at, dur: len * step * 3, gain: 0.04, type: 'sine', bus: m, verb: 0.8 }); at += len * step * 2; }
      }
      return;
    }
    if (w.mode === 'combat') {
      if (pos % 8 === 0) this.tone({ f: 110, to: 40, t, dur: 0.25, gain: 0.35, bus: m });
      if (pos % 2 === 0) this.tone({ f: hz(sc.root + chord - 12 + 12), type: 'sawtooth', t, dur: step * 1.6, gain: 0.06, filter: 500, bus: m });
      if (pos % 4 === 2) this.noise({ t, dur: 0.04, gain: 0.03, type: 'highpass', f: 7000, bus: m });
      if (pos === 0 && Math.random() < 0.5) this.tone({ f: hz(note(Math.floor(Math.random() * 7), 3)), t, dur: 2, gain: 0.04, type: 'triangle', bus: m, verb: 0.8 });
      return;
    }
    if (w.mode === 'boss') {
      if (pos % 4 === 0) this.tone({ f: 120, to: 38, t, dur: 0.3, gain: 0.5, bus: m });
      if (pos === 4 || pos === 12) { this.noise({ t, dur: 0.16, gain: 0.22, type: 'bandpass', f: 1800, q: 0.7, bus: m, verb: 0.3 }); this.tone({ f: 190, to: 140, t, dur: 0.1, gain: 0.12, bus: m }); }
      if (pos % 2 === 1) this.noise({ t, dur: 0.03, gain: 0.04, type: 'highpass', f: 8000, bus: m });
      const arp = [0, 7, 12, 7, 3, 7, 12, 15][pos % 8];
      this.tone({ f: hz(sc.root + chord + arp - 12 + (w.phase >= 3 ? 12 : 0)), type: 'sawtooth', t, dur: step * 0.9, gain: 0.05, filter: 700 + w.phase * 350, bus: m });
      if (bar % 4 === 2 && pos === 0) {
        const mo = MOTIF[w.act] ?? MOTIF[1];
        let at = t;
        for (const [s, len] of mo) {
          for (const det of [-6, 6]) this.tone({ f: hz(sc.root + 24 + s) * 2 ** (det / 1200), type: w.act === 2 ? 'sawtooth' : 'square', t: at, dur: len * step * 0.95, gain: 0.03, filter: 2200, bus: m, verb: 0.35 });
          at += len * step;
        }
      }
      if (bar % 8 === 7 && pos >= 12) this.tone({ f: 160 - (pos - 12) * 18, to: 60, t, dur: 0.15, gain: 0.25, bus: m });
    }
  }
}

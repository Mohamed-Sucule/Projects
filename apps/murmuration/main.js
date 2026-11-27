/* apps/murmuration/main.js — the evening: the sky, the reeds, the flock on
   the graphics card, the falcon, the sound, and the controls.

   The rules the birds fly by are in field.js and the programs that run them
   in shaders.js. This file does the plumbing: it keeps the birds in two pairs
   of textures (where each one is, and where it is going) and swaps them every
   frame, and it draws everything that is not a bird on ordinary canvases. */

import { BOX, LEVELS, RULES, EVENING, FALCON, FALCON_SHAPE, space, arrival, camera, centre as centreAt, evening, falconAt, project, random, shuffle, startingPlace, createReference, createFalcon } from './field.js';
import { COUNT_VERT, COUNT_FRAG, QUAD_VERT, FLY_FRAG, DRAW_VERT, DRAW_FRAG, FALCON_VERT, BIRD } from './shaders.js';
import { createScenery } from './scenery.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SPEED = Number(params.get('speed')) || 1;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

const skyCanvas = $('sky');
const birdCanvas = $('birds');
const reedCanvas = $('reeds');
const scenery = createScenery(skyCanvas, reedCanvas);

let W = 0, H = 0, dpr = 1;
/* Where the flock's space is and how big, for the shape of this screen. */
const centre = (time) => centreAt(time, W / H || 16 / 9);
let cam = camera(1);
let t = Number(params.get('t')) || 0;
let running = !reduced;
let flock = null; // the graphics-card flock, or the smaller one on the processor

/* ── the falcon ───────────────────────────────────────────────────────── */

/* The pointer says where the falcon should go, at the depth of the flock; the
   falcon (field.js) gets there under its own steam. Hold the button, or keep a
   finger down, and it dives. */
const falcon = createFalcon();
let pointer = null; // where the pointer is, on the screen, while it is hunting
let stooping = false;

/* The falcon flies nearer than the flock, about halfway out to it: big enough
   to read as a falcon, not a speck among specks. The flock feels it where it
   would be at the flock's own distance, on the same line from the eye, so the
   hole opens right behind it on the screen. */
const NEAR = 0.52;
const toward = (p, k) => p.map((v, i) => cam.eye[i] + (v - cam.eye[i]) * k);
const flockDepth = () => { const c = centre(t); return Math.hypot(c[0] - cam.eye[0], c[1] - cam.eye[1], c[2] - cam.eye[2]); };

function aimAt(x, y) {
  return falconAt(cam, (x / W) * 2 - 1, 1 - (y / H) * 2, flockDepth() * NEAR);
}
function threat() {
  const th = falcon.threat();
  return th && { at: toward(th.at, 1 / NEAR), reach: th.reach };
}

function hunt(e) {
  idleSince = performance.now();
  pointer = [e.clientX, e.clientY];
  clearTimeout(hunt.timer);
  /* A still mouse, or a lifted finger, and the falcon gives up and goes. */
  hunt.timer = setTimeout(() => { pointer = null; }, e.pointerType === 'mouse' ? 12000 : 2500);
}
const stage = $('stage');
stage.addEventListener('pointermove', hunt);
stage.addEventListener('pointerdown', (e) => { hunt(e); stooping = true; hideHint(); });
addEventListener('pointerup', () => { stooping = false; });
stage.addEventListener('pointerleave', () => { pointer = null; stooping = false; });

function stepFalcon(dt) {
  falcon.aim(pointer ? aimAt(...pointer) : null, stooping);
  falcon.step(dt);
}

function sendFalcon() {
  falcon.pass(toward(flock.middle(), NEAR));
  if (!running) play(true);
}

/* ── sound ────────────────────────────────────────────────────────────── */

/* Off until asked for. The wind over the reeds, the rush of wings, which
   swells when the falcon is among them, and the flock's chatter, which grows
   as they come down. All of it made here; there are no sound files. */
const sound = { ctx: null, on: false, wings: null, wind: null, rush: 0, next: 0 };

function startSound() {
  const ctx = new AudioContext();
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  let b = 0;
  for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; }
  const loop = (freq, type, q, level) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = level;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    return gain;
  };
  sound.wind = loop(380, 'lowpass', 0.5, 0.35);
  sound.wings = loop(1100, 'bandpass', 0.7, 0);
  sound.ctx = ctx;
}

function stepSound(dt, ev) {
  if (!sound.on || !sound.ctx) return;
  const ctx = sound.ctx;
  /* The rush of wings swells as the falcon gets among the flock. */
  const f = falcon.state;
  const c = centre(t);
  const where = toward(f.p, 1 / NEAR);
  const near = falcon.flying ? Math.max(0, 1 - Math.hypot(where[0] - c[0], where[1] - c[1], where[2] - c[2]) / 420) : 0;
  sound.rush = Math.max(near * (f.stoop ? 1 : 0.6), sound.rush - dt * 0.6);
  sound.wings.gain.setTargetAtTime(0.04 + sound.rush * 0.55, ctx.currentTime, 0.15);
  /* Chatter: quick rising whistles and clicks, more of them as the flock comes down. */
  if (ctx.currentTime > sound.next && running) {
    const busy = 0.15 + ev.down * 0.85;
    sound.next = ctx.currentTime + (0.05 + Math.random() * 0.4) / busy;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const f0 = 2200 + Math.random() * 1800;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.9), ctx.currentTime + 0.05 + Math.random() * 0.06);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.012 * (0.4 + ev.down), ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    pan.pan.value = Math.random() * 1.6 - 0.8;
    o.connect(g).connect(pan).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.14);
  }
}

/* ── the flock on the graphics card ───────────────────────────────────── */

function gpuFlock() {
  const gl = birdCanvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true, alpha: true, powerPreference: 'high-performance' });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
  const floatBlend = !!gl.getExtension('EXT_float_blend');

  const SIDE = 256;
  const MAXROWS = 192;
  let rows = Number(params.get('rows')) || (coarse ? 48 : 128);
  rows = Math.min(MAXROWS, Math.max(8, rows));

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = new Proxy({}, { get: (c, name) => (c[name] ??= gl.getUniformLocation(p, name)) });
    return { p, u };
  }
  const count = program(COUNT_VERT, COUNT_FRAG);
  const fly = program(QUAD_VERT, FLY_FRAG);
  const draw = program(DRAW_VERT, DRAW_FRAG);
  const hunter = program(FALCON_VERT, DRAW_FRAG);

  function texture(w, h, format, data = null) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, gl.RGBA, format === gl.RGBA16F ? gl.HALF_FLOAT : gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  function target(a, b) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer');
    return fb;
  }

  /* Where each bird is and where it is going, twice over: read one pair, write the other. */
  const state = [0, 1].map(() => {
    const pos = texture(SIDE, SIDE, gl.RGBA32F);
    const vel = texture(SIDE, SIDE, gl.RGBA32F);
    return { pos, vel, fb: target(pos, vel) };
  });
  let read = 0;

  /* The boxes, at three sizes. Full-precision sums where the card can blend them. */
  const gridFormat = floatBlend ? gl.RGBA32F : gl.RGBA16F;
  const grids = LEVELS.map((g) => {
    const sum = texture(g * g, g, gridFormat);
    const at = texture(g * g, g, gridFormat);
    return { g, sum, at, fb: target(sum, at) };
  });

  const shape = gl.createVertexArray();
  gl.bindVertexArray(shape);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, BIRD, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  const empty = gl.createVertexArray();
  const falconShape = gl.createVertexArray();
  gl.bindVertexArray(falconShape);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, FALCON_SHAPE, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);

  /* Every bird gets a place in the evening (when it arrives) that stays the
     same however many birds this screen can manage. */
  function seed() {
    const rand = random(7);
    const from = t; // starting part-way through the evening: everyone due by now is already up
    const order = shuffle(SIDE * SIDE, rand);
    const pos = new Float32Array(SIDE * SIDE * 4);
    const vel = new Float32Array(SIDE * SIDE * 4);
    for (let i = 0; i < SIDE * SIDE; i++) {
      const rank = (order[i] + 0.5) / (SIDE * SIDE);
      pos[i * 4 + 3] = rank;
      vel[i * 4 + 3] = rand() * 6.28;
      if (arrival(rank) <= from) {
        const [p, v] = startingPlace(rand, from);
        pos.set(p, i * 4);
        vel.set(v, i * 4);
      } else {
        pos[i * 4 + 1] = -9000;
      }
    }
    for (const s of state) {
      gl.bindTexture(gl.TEXTURE_2D, s.pos);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIDE, SIDE, gl.RGBA, gl.FLOAT, pos);
      gl.bindTexture(gl.TEXTURE_2D, s.vel);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIDE, SIDE, gl.RGBA, gl.FLOAT, vel);
    }
  }
  seed();

  const bind = (unit, tex, prog, name) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(prog.u[name], unit);
  };

  function step(dt, before, now, hunt) {
    const c = centre(now);
    const min = [c[0] - BOX / 2, c[1] - BOX / 2, c[2] - BOX / 2];
    const n = SIDE * rows;
    const src = state[read];
    gl.bindVertexArray(empty);
    /* 1. Count the birds into the boxes. */
    gl.useProgram(count.p);
    bind(0, src.pos, count, 'u_pos');
    bind(1, src.vel, count, 'u_vel');
    gl.uniform1i(count.u.u_side, SIDE);
    gl.uniform3fv(count.u.u_min, min);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.blendEquation(gl.FUNC_ADD);
    for (const G of grids) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.fb);
      gl.viewport(0, 0, G.g * G.g, G.g);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1i(count.u.u_g, G.g);
      gl.drawArrays(gl.POINTS, 0, n);
    }
    gl.disable(gl.BLEND);
    /* 2. Move every bird. */
    const dst = state[1 - read];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, SIDE, rows);
    gl.useProgram(fly.p);
    bind(0, src.pos, fly, 'u_pos');
    bind(1, src.vel, fly, 'u_vel');
    grids.forEach((G, k) => { bind(2 + k * 2, G.sum, fly, `u_sum${k}`); bind(3 + k * 2, G.at, fly, `u_at${k}`); });
    const ev = evening(now);
    gl.uniform1i(fly.u.u_side, SIDE);
    gl.uniform3fv(fly.u.u_min, min);
    gl.uniform3fv(fly.u.u_centre, c);
    const room = space(W / H);
    gl.uniform3f(fly.u.u_radii, room.rx, room.ry, room.rz);
    gl.uniform1f(fly.u.u_t, now);
    gl.uniform1f(fly.u.u_before, before);
    gl.uniform1f(fly.u.u_dt, dt);
    gl.uniform1f(fly.u.u_down, ev.down);
    gl.uniform4f(fly.u.u_falcon, ...(hunt ? [...hunt.at, hunt.reach] : [0, 0, 0, 0]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    read = 1 - read;
  }

  function render() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, birdCanvas.width, birdCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(draw.p);
    gl.bindVertexArray(shape);
    bind(0, state[read].pos, draw, 'u_pos');
    bind(1, state[read].vel, draw, 'u_vel');
    gl.uniform1i(draw.u.u_side, SIDE);
    gl.uniformMatrix4fv(draw.u.u_viewProj, false, cam.viewProj);
    gl.uniform1f(draw.u.u_pixels, birdCanvas.height / 2 / cam.tan);
    gl.uniform1f(draw.u.u_size, Number(params.get('size')) || 1.35);
    gl.uniform3f(draw.u.u_ink, 0.075, 0.055, 0.1);
    gl.uniform3fv(draw.u.u_haze, scenery.haze);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 12, SIDE * rows);
    /* The falcon, in the same sky and the same ink, a shade darker. */
    if (falcon.flying) {
      const f = falcon.state;
      gl.useProgram(hunter.p);
      gl.bindVertexArray(falconShape);
      gl.uniformMatrix4fv(hunter.u.u_viewProj, false, cam.viewProj);
      gl.uniform3fv(hunter.u.u_p, f.p);
      gl.uniform3fv(hunter.u.u_fwd, f.v);
      gl.uniform1f(hunter.u.u_bank, f.bank);
      gl.uniform1f(hunter.u.u_beat, Math.sin(f.wing) * f.beat);
      gl.uniform1f(hunter.u.u_tuck, f.tuck);
      gl.uniform1f(hunter.u.u_size, FALCON.size);
      gl.uniform3f(hunter.u.u_ink, 0.045, 0.032, 0.06);
      gl.uniform3fv(hunter.u.u_haze, scenery.haze);
      gl.drawArrays(gl.TRIANGLES, 0, FALCON_SHAPE.length / 4);
    }
    gl.disable(gl.BLEND);
  }

  /* Where the flock is, from a sample of it: one row of birds read back from
     the card. Only asked for when the falcon is about to be sent. */
  function middle() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, state[read].fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    const row = new Float32Array(SIDE * 4 * 2);
    gl.readPixels(0, 0, SIDE, 2, gl.RGBA, gl.FLOAT, row);
    return average(row, 4);
  }

  /* For the browser test: every bird's position, read back from the card. */
  function positions() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, state[read].fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    const out = new Float32Array(SIDE * rows * 4);
    gl.readPixels(0, 0, SIDE, rows, gl.RGBA, gl.FLOAT, out);
    return out;
  }

  return {
    kind: 'gpu',
    get count() { return SIDE * rows; },
    setRows(r) { rows = Math.min(MAXROWS, Math.max(8, r)); },
    get rows() { return rows; },
    step,
    render,
    restart: seed,
    positions,
    middle,
    resize() {},
  };
}

/* ── or, without the graphics features, on the processor ──────────────── */

function cpuFlock() {
  const ref = createReference({ count: coarse ? 900 : 1800, seed: 7 });
  const ctx = birdCanvas.getContext('2d');
  return {
    kind: 'cpu',
    count: ref.count,
    step(dt, before, now, hunt) { ref.step(dt, { falcon: hunt?.at, stoop: hunt?.reach === RULES.stoop }); },
    render() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      /* Each bird as the graphics card draws it, seen from below: its wings
         across its line of flight, looking longer and shorter as they beat. */
      ctx.strokeStyle = 'rgba(19,14,26,.92)';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < ref.count; i++) {
        const b = ref.bird(i);
        if (b.state !== 1) continue;
        const p = project(cam, [b.x, b.y, b.z]);
        if (p.w <= 0) continue;
        const q = project(cam, [b.x + b.vx * 0.05, b.y + b.vy * 0.05, b.z + b.vz * 0.05]);
        const x = (p.x + 1) / 2 * W, y = (1 - p.y) / 2 * H;
        let hx = (q.x - p.x) * W, hy = (p.y - q.y) * H;
        const len = Math.hypot(hx, hy) || 1;
        hx /= len; hy /= len;
        const span = Math.max(0.9, 2.4 * (850 / p.w)) * (0.4 + 0.6 * Math.abs(Math.cos(b.wing)));
        ctx.moveTo(x - hy * span - hx * span * 0.35, y + hx * span - hy * span * 0.35);
        ctx.lineTo(x + hx * span * 0.3, y + hy * span * 0.3);
        ctx.lineTo(x + hy * span - hx * span * 0.35, y - hx * span - hy * span * 0.35);
      }
      ctx.stroke();
      if (falcon.flying) {
        ctx.fillStyle = '#0b0810';
        ctx.beginPath();
        const tri = falcon.triangles();
        for (let k = 0; k < tri.length; k += 3) {
          for (let m = 0; m < 3; m++) {
            const q = project(cam, tri[k + m]);
            const x = (q.x + 1) / 2 * W, y = (1 - q.y) / 2 * H;
            if (m === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
        }
        ctx.fill();
      }
    },
    restart() { ref.restart(); },
    middle() {
      const all = new Float32Array(ref.count * 4);
      for (let i = 0; i < ref.count; i++) { const b = ref.bird(i); all.set([b.x, b.state === 1 ? b.y : -9000, b.z, 0], i * 4); }
      return average(all, 4);
    },
    resize() {},
  };
}

/* The middle of the birds that are up, from x, y, z, _ quadruples. */
function average(data, stride) {
  let n = 0, x = 0, y = 0, z = 0;
  for (let i = 0; i < data.length; i += stride) {
    if (!(data[i + 1] > -5000) || !Number.isFinite(data[i])) continue;
    n++; x += data[i]; y += data[i + 1]; z += data[i + 2];
  }
  return n ? [x / n, y / n, z / n] : centre(t);
}

/* ── the evening ──────────────────────────────────────────────────────── */

function size() {
  dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  for (const c of [skyCanvas, birdCanvas, reedCanvas]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  cam = camera(W / H);
  scenery.resize(W, H, dpr, cam);
  paintSky(evening(t));
  scenery.drawReeds(t, evening(t).light, false);
}
const paintSky = (ev) => scenery.paintSky(ev);

let shownLight = -1;
let last = performance.now();
let frames = [];
let frame = 0;
let tuned = false;
let upgraded = 0; // the rows before trying more birds, if it has
let painted = -1;

function tick(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  advance(dt * SPEED);
  frames.push(dt);
  if (frames.length >= 40) {
    const sorted = [...frames].sort((a, b) => a - b);
    const typical = sorted[20];
    $('fps').textContent = Math.round(1 / typical);
    if (flock.kind === 'gpu' && !tuned && now > 2500) {
      /* Fewer birds on a screen that cannot keep up, more on one with room to spare. */
      if (upgraded && typical > 1 / 50) { flock.setRows(upgraded); tuned = true; showCount(); }
      else if (typical > 1 / 40 && flock.rows > 16) { flock.setRows(Math.round(flock.rows / 2)); showCount(); }
      else if (!upgraded && typical < 1 / 75 && !coarse && flock.rows < 192) { upgraded = flock.rows; flock.setRows(192); showCount(); }
      else tuned = true;
    }
    frames = [];
  }
  if (running) frame = requestAnimationFrame(tick);
}

/* Nobody hunting for a while: the falcon comes by on its own now and then. */
let idleSince = performance.now();
let nextRaid = 32;
function raid() {
  if (params.has('test')) return; // the tests send the falcon themselves
  if (falcon.flying || pointer || performance.now() - idleSince < 9000) return;
  if (t < nextRaid || t > EVENING.dropFrom - 4) return;
  sendFalcon();
  nextRaid = t + 11 + Math.random() * 8;
}

function advance(dt) {
  const before = t;
  t += dt;
  raid();
  stepFalcon(dt);
  const ev = evening(t);
  /* The sky changes slowly: repaint it a few times a second, not every frame. */
  if (Math.abs(ev.light - shownLight) > 0.004 || (ev.sun > -2 && t - painted > 0.15)) { paintSky(ev); shownLight = ev.light; painted = t; }
  flock.step(dt, before, t, threat());
  flock.render();
  scenery.drawReeds(t, ev.light, running);
  stepSound(dt, ev);
  if (ev.over && $('end').hidden) finish();
}

function finish() {
  $('intro').classList.add('gone');
  hideHint();
  $('end').hidden = false;
  $('said').textContent = 'The flock has gone down into the reeds for the night.';
  play(false);
}

function again() {
  $('end').hidden = true;
  $('said').textContent = '';
  t = 0;
  painted = -1;
  nextRaid = 32;
  pointer = null;
  shownLight = -1;
  flock.restart();
  paintSky(evening(0));
  play(true);
}

function play(on) {
  running = on;
  const b = $('pause');
  b.querySelector('span').textContent = on ? 'Pause' : 'Play';
  b.querySelector('svg path').setAttribute('d', on ? 'M7 5h3.5v14H7V5Zm6.5 0H17v14h-3.5V5Z' : 'M8 5.5v13l10-6.5-10-6.5Z');
  cancelAnimationFrame(frame);
  if (on) { last = performance.now(); frame = requestAnimationFrame(tick); }
}

function showCount() {
  $('count').textContent = $('count-live').textContent = flock.count.toLocaleString('en-GB');
}

/* ── the controls ─────────────────────────────────────────────────────── */

function hideHint() { $('hint').classList.add('gone'); }

$('pause').addEventListener('click', () => { if (!$('end').hidden) return; play(!running); });
$('falcon').addEventListener('click', () => { idleSince = performance.now(); sendFalcon(); hideHint(); });
$('again').addEventListener('click', again);
$('sound').addEventListener('click', async () => {
  sound.on = !sound.on;
  if (sound.on && !sound.ctx) startSound();
  if (sound.ctx) await (sound.on ? sound.ctx.resume() : sound.ctx.suspend());
  $('sound').setAttribute('aria-pressed', String(sound.on));
});
const how = $('how');
const howButton = $('how-open');
howButton.addEventListener('click', () => {
  const open = how.hidden;
  how.hidden = !open;
  howButton.setAttribute('aria-expanded', String(open));
  if (open) how.querySelector('h2').focus();
});
$('how-close').addEventListener('click', () => { how.hidden = true; howButton.setAttribute('aria-expanded', 'false'); howButton.focus(); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !how.hidden) $('how-close').click();
});
setTimeout(() => $('intro').classList.add('gone'), 5200);
setTimeout(hideHint, 14000);

/* ── start ────────────────────────────────────────────────────────────── */

size();
/* Asked for less motion: the evening starts a minute in, the flock already up. */
if (reduced && !params.get('t')) t = 60;
try {
  flock = params.has('cpu') ? null : gpuFlock(); // ?cpu tries the fallback on purpose
} catch (e) {
  console.warn('Murmuration: falling back to the processor', e);
  flock = null;
}
if (!flock) {
  flock = cpuFlock();
  $('smaller').hidden = false;
}
showCount();
$('hint').querySelector('.touch').hidden = !coarse;
$('hint').querySelector('.mouse').hidden = coarse;
addEventListener('resize', size);

if (reduced) {
  /* A moment for the flock to find its shape, then still until Play is pressed. */
  for (let k = 0; k < 45; k++) {
    const before = t;
    t += 1 / 30;
    flock.step(1 / 30, before, t, null);
  }
  paintSky(evening(t));
  flock.render();
  scenery.drawReeds(t, evening(t).light, false);
  play(false);
} else {
  play(true);
}

/* The browser test drives the evening itself and reads the birds back. */
if (params.has('test')) {
  window.__evening = {
    kind: flock.kind,
    get t() { return t; },
    get count() { return flock.count; },
    run(seconds, dt = 1 / 30, hunt = null) {
      play(false);
      for (let k = 0; k < Math.round(seconds / dt); k++) {
        const before = t;
        t += dt;
        flock.step(dt, before, t, hunt);
      }
      paintSky(evening(t));
      flock.render();
      scenery.drawReeds(t, evening(t).light, false);
      return t;
    },
    positions: () => Array.from(flock.positions?.() ?? []),
    falconAt: (nx, ny) => { const c = centre(t); return falconAt(cam, nx, ny, Math.hypot(c[0] - cam.eye[0], c[1] - cam.eye[1], c[2] - cam.eye[2])); },
    centre: () => centre(t),
    middle: () => flock.middle(),
    /* One whole frame, falcon, sky and all: for recording a clip frame by frame. */
    frame: (dt) => { play(false); advance(dt); },
    falcon: () => sendFalcon(),
    get hunter() { return falcon.state; },
    onScreen: (p) => { const q = project(cam, p); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; },
  };
}

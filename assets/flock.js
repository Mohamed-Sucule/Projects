/* assets/flock.js — the starlings over the front page.

   Starlings gather at dusk and swirl over the place they will sleep, then drop
   into it as the light goes. At first light they leave together. The front
   page is one night, so the flock keeps the same hours: it swirls over the
   sunset, settles as the evening goes on (some of the birds on the wire along
   the bottom of the screen, the rest out of sight below it), and goes at dawn.

   Where a bird should be is a matter of the hour, so scrolling back up the
   page brings the flock back. How it gets there is a small simulation: each
   bird keeps its distance from, turns with and stays near its seven nearest
   neighbours, which is how real starlings are thought to do it (Ballerini and
   others, PNAS, 2008). Seven, not everyone within a distance: it is why a
   murmuration holds together while it stretches and folds.

   Nothing here touches the page. night.js owns the canvases, the wire and the
   scroll, and tells the flock the hour, the size of the screen and where the
   pointer is. That also means the flock can be tested without a browser. */

/* A perched starling, facing right, in a 32 by 32 box with its feet at the
   bottom middle. night.css draws the birds of the index with the same shape. */
export const PERCH_SHAPE = 'M28 10.4 24.6 9.4C24 7 22 5.8 19.9 6c-2.5.3-3.7 2.3-3.8 4.4-3.3 1.5-5.7 4.6-6.9 8.3L3.6 27.6l2 .9 5.9-5.2c1.7 1.4 3.9 2 6.1 1.7 4.2-.8 6.8-4.8 6.6-9.1-.1-2.3-.7-3.9-.4-4.9ZM15 24.3h1.3V32H15Zm2.6-.3h1.3v8h-1.3Z';

/* The night, in minutes after 17:30 (the front page's own clock). */
export const HOURS = {
  settleFrom: 150, // 20:00: the first birds come down
  settled: 250, //    21:40: the last are down, before the night scenes
  leaveFrom: 770, //  06:20: first light, and the first birds go
  gone: 860, //       07:50: the last have gone by the time it is morning
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* How much of the flock should be down for the night, and how much has left. */
export function shares(minute) {
  return {
    down: smooth(HOURS.settleFrom, HOURS.settled, minute),
    gone: smooth(HOURS.leaveFrom, HOURS.gone, minute),
  };
}

/* What a bird is doing. */
export const FLY = 0; //      in the murmuration
export const DROP = 1; //     going down into the roost, out of sight
export const ASLEEP = 2; //   in the roost
export const LAND = 3; //     coming in to its place on the wire
export const PERCHED = 4; //  on the wire
export const LEAVE = 5; //    off for the day
export const GONE = 6; //     off the screen

const NEIGHBOURS = 7;
const SEE = 46; //       how far a bird looks for its neighbours, in pixels
const ROOM = 13; //      how close it lets them come
const CRUISE = 165; //   pixels a second
const SLOWEST = 110;
const FASTEST = 270;
const FOCAL = 760; //    the camera, for the depth of the flock
const BAND = 46; //      the strip at the bottom where the wire is drawn over the page

/* A small, seeded random number generator, so the flock comes out the same
   shape every evening and the tests can count on it. */
function random(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function createFlock({ count, seed = 1830 } = {}) {
  const N = count;
  const rand = random(seed);
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N);
  const wing = new Float32Array(N); //    where the wings are in their beat
  const beat = new Float32Array(N); //    each bird's own rhythm of flapping and gliding
  const size = new Float32Array(N);
  const settleAt = new Float32Array(N);
  const leaveAt = new Float32Array(N);
  const roostX = new Float32Array(N); //  where along the bottom it drops out of sight
  const facing = new Int8Array(N);
  const slot = new Int16Array(N).fill(-1);
  const mode = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    wing[i] = rand() * Math.PI * 2;
    beat[i] = rand() * 100;
    size[i] = 0.82 + rand() * 0.36;
    settleAt[i] = 0.02 + rand() * 0.96;
    leaveAt[i] = 0.02 + rand() * 0.84;
    roostX[i] = 0.18 + rand() * 0.64;
    facing[i] = rand() < 0.5 ? -1 : 1;
  }
  /* Which birds sleep on the wire, if there is one: a fixed shuffle, so the
     same birds take the same places every night. */
  const order = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

  let W = 1, H = 1;
  let slots = [];
  let down = 0, gone = 0;
  let clock = 0;
  let hawk = null; //        the pointer, when there is one
  let raider = null; //      a falcon of the flock's own, now and then, when nobody is playing
  let nextRaid = 6;

  /* The neighbour search: the flying birds sorted into cells as wide as a bird can see. */
  const flying = new Int32Array(N);
  const cellOf = new Int32Array(N);
  const sorted = new Int32Array(N);
  let starts = new Int32Array(1);
  let fill = new Int32Array(1);
  /* Where each bird was in the flock before the night, for putting it back with the motion off. */
  const fx = new Float32Array(N), fy = new Float32Array(N), fz = new Float32Array(N);
  const nearD = new Float32Array(NEIGHBOURS);
  const nearJ = new Int32Array(NEIGHBOURS);

  /* The middle of the murmuration, which wanders over the sunset. */
  function centre(t) {
    const wide = W > 900;
    return {
      x: W * ((wide ? 0.63 : 0.56) + 0.07 * Math.sin(t * 0.11) + 0.02 * Math.sin(t * 0.37)),
      y: H * ((wide ? 0.17 : 0.2) + 0.025 * Math.sin(t * 0.17 + 1)),
      z: 70 * Math.sin(t * 0.07),
      rx: Math.max(80, W * (wide ? 0.16 : 0.24)),
      ry: Math.max(55, H * (wide ? 0.075 : 0.07)),
      rz: 130,
    };
  }

  /* The flock as it is first seen: a long, folded ribbon of birds over the sun. */
  function formation() {
    const c = centre(0);
    for (let i = 0; i < N; i++) {
      const s = i / N;
      const a = s * Math.PI * 2.6;
      const spread = () => (rand() + rand() + rand() - 1.5) * 0.5;
      px[i] = c.x + c.rx * (Math.cos(a) * 0.9 + spread() * 0.35);
      py[i] = c.y + c.ry * (Math.sin(a * 1.5) * 0.7 + spread() * 0.4);
      pz[i] = c.rz * (Math.sin(a) * 0.8 + spread() * 0.3);
      vx[i] = -Math.sin(a) * CRUISE;
      vy[i] = Math.cos(a * 1.5) * CRUISE * 0.35;
      vz[i] = Math.cos(a) * CRUISE * 0.5;
      mode[i] = FLY;
    }
  }

  function resize(width, height, perches = []) {
    const first = W === 1;
    W = width; H = height;
    slots = perches;
    slot.fill(-1);
    for (let k = 0; k < Math.min(perches.length, N); k++) slot[order[k]] = k;
    if (first) {
      formation();
      /* A few seconds of flying before anyone looks, so the flock has found its shape. */
      for (let k = 0; k < 45; k++) step(1 / 30);
      fx.set(px); fy.set(py); fz.set(pz);
    }
    for (let i = 0; i < N; i++) {
      if (mode[i] === PERCHED) {
        if (slot[i] < 0) mode[i] = ASLEEP;
        else { px[i] = slots[slot[i]].x; py[i] = slots[slot[i]].y; }
      } else if (mode[i] === LAND && slot[i] < 0) mode[i] = DROP;
    }
  }

  /* Where the hour says bird i should be. */
  function wanted(i) {
    /* The birds on the wire go last, and nearly together. */
    const leave = slot[i] >= 0 ? 0.9 + leaveAt[i] * 0.06 : leaveAt[i];
    if (gone > 0 && gone >= leave) return LEAVE;
    if (down >= settleAt[i]) return slot[i] >= 0 ? PERCHED : ASLEEP;
    return FLY;
  }

  function fromRoost(i, up) {
    px[i] = W * roostX[i] + (rand() - 0.5) * 80;
    py[i] = H + 30 + rand() * 40;
    pz[i] = (rand() - 0.5) * 80;
    vx[i] = (rand() - 0.5) * 60;
    vy[i] = -up - rand() * 80;
    vz[i] = 0;
  }

  /* Move each bird on to what the hour wants of it. */
  function follow(i) {
    const want = wanted(i);
    const m = mode[i];
    if (want === FLY) {
      if (m === ASLEEP || m === GONE) { fromRoost(i, 230); mode[i] = FLY; }
      else if (m === PERCHED) { vy[i] = -140; vx[i] = facing[i] * 60; mode[i] = FLY; }
      else if (m !== FLY) mode[i] = FLY;
    } else if (want === ASLEEP) {
      if (m === GONE) mode[i] = ASLEEP;
      else if (m === PERCHED) { vy[i] = -60; mode[i] = DROP; }
      else if (m === FLY || m === LAND || m === LEAVE) mode[i] = DROP;
    } else if (want === PERCHED) {
      if (m === GONE) { px[i] = slots[slot[i]].x + (rand() - 0.5) * W * 0.4; py[i] = -30; pz[i] = 0; vx[i] = 0; vy[i] = 120; vz[i] = 0; mode[i] = LAND; }
      else if (m === ASLEEP) { fromRoost(i, 200); mode[i] = LAND; }
      else if (m === FLY || m === DROP || m === LEAVE) mode[i] = LAND;
    } else if (want === LEAVE) {
      if (m === ASLEEP) { fromRoost(i, 300); mode[i] = LEAVE; }
      else if (m === PERCHED) { vy[i] = -170 - rand() * 60; vx[i] = facing[i] * (40 + rand() * 60); mode[i] = LEAVE; }
      else if (m === FLY || m === DROP || m === LAND) mode[i] = LEAVE;
    }
  }

  function setMinute(minute) {
    ({ down, gone } = shares(minute));
  }

  /* With the motion off: every bird straight to where the hour says, and still. */
  function snap() {
    for (let i = 0; i < N; i++) {
      const want = wanted(i);
      if (want === FLY) {
        if (mode[i] !== FLY) { mode[i] = FLY; px[i] = fx[i]; py[i] = fy[i]; pz[i] = fz[i]; }
      }
      else if (want === PERCHED) { mode[i] = PERCHED; px[i] = slots[slot[i]].x; py[i] = slots[slot[i]].y; pz[i] = 0; vx[i] = 0; vy[i] = 0; vz[i] = 0; }
      else mode[i] = want === ASLEEP ? ASLEEP : GONE;
    }
  }

  function neighbours(nf) {
    let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (let k = 0; k < nf; k++) {
      const i = flying[k];
      if (px[i] < minx) minx = px[i]; if (px[i] > maxx) maxx = px[i];
      if (py[i] < miny) miny = py[i]; if (py[i] > maxy) maxy = py[i];
      if (pz[i] < minz) minz = pz[i]; if (pz[i] > maxz) maxz = pz[i];
    }
    let cs = SEE;
    let gx = Math.floor((maxx - minx) / cs) + 1, gy = Math.floor((maxy - miny) / cs) + 1, gz = Math.floor((maxz - minz) / cs) + 1;
    /* A flock scattered right across a big screen: coarser cells rather than a huge grid. */
    while (gx * gy * gz > 60000) { cs *= 1.5; gx = Math.floor((maxx - minx) / cs) + 1; gy = Math.floor((maxy - miny) / cs) + 1; gz = Math.floor((maxz - minz) / cs) + 1; }
    const cells = gx * gy * gz;
    if (starts.length < cells + 1) starts = new Int32Array(cells + 1);
    else starts.fill(0, 0, cells + 1);
    for (let k = 0; k < nf; k++) {
      const i = flying[k];
      const c = (Math.floor((pz[i] - minz) / cs) * gy + Math.floor((py[i] - miny) / cs)) * gx + Math.floor((px[i] - minx) / cs);
      cellOf[k] = c;
      starts[c + 1]++;
    }
    for (let c = 0; c < cells; c++) starts[c + 1] += starts[c];
    if (fill.length < cells) fill = new Int32Array(starts.length);
    fill.set(starts.subarray(0, cells));
    for (let k = 0; k < nf; k++) sorted[fill[cellOf[k]]++] = flying[k];
    return { minx, miny, minz, cs, gx, gy, gz };
  }

  function step(dt) {
    clock += dt;
    let nf = 0;
    for (let i = 0; i < N; i++) {
      follow(i);
      if (mode[i] === FLY) flying[nf++] = i;
    }

    /* Now and then a falcon makes a pass at the flock, and the flock folds away
       from it: the ripple that runs through a murmuration starts like this. */
    const c = centre(clock);
    if (!hawk && nf > 20) {
      if (!raider && clock > nextRaid) {
        const a = rand() * Math.PI * 2;
        raider = { x0: c.x + Math.cos(a) * c.rx * 1.6, y0: c.y + Math.sin(a) * c.ry * 1.6, x1: c.x - Math.cos(a) * c.rx * 1.6, y1: c.y - Math.sin(a) * c.ry * 1.6, t: 0 };
        nextRaid = clock + 7 + rand() * 6;
      }
      if (raider) { raider.t += dt / 1.8; if (raider.t >= 1) raider = null; }
    } else raider = null;
    const threat = hawk ?? (raider && { x: raider.x0 + (raider.x1 - raider.x0) * raider.t, y: raider.y0 + (raider.y1 - raider.y0) * raider.t, r: 110 });

    if (nf) {
      /* The middle of everyone still flying: a murmuration is one flock, so a
         bird that has drifted off with a few others is drawn back to it. */
      let gx0 = 0, gy0 = 0, gz0 = 0;
      for (let k = 0; k < nf; k++) { const i = flying[k]; gx0 += px[i]; gy0 += py[i]; gz0 += pz[i]; }
      gx0 /= nf; gy0 /= nf; gz0 /= nf;
      const g = neighbours(nf);
      for (let k = 0; k < nf; k++) {
        const i = flying[k];
        const cx = Math.floor((px[i] - g.minx) / g.cs), cy = Math.floor((py[i] - g.miny) / g.cs), cz = Math.floor((pz[i] - g.minz) / g.cs);
        let found = 0;
        for (let dz = -1; dz <= 1; dz++) {
          const z = cz + dz; if (z < 0 || z >= g.gz) continue;
          for (let dy = -1; dy <= 1; dy++) {
            const y = cy + dy; if (y < 0 || y >= g.gy) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const x = cx + dx; if (x < 0 || x >= g.gx) continue;
              const cell = (z * g.gy + y) * g.gx + x;
              for (let s = starts[cell], e = starts[cell + 1]; s < e; s++) {
                const j = sorted[s];
                if (j === i) continue;
                const ex = px[j] - px[i], ey = py[j] - py[i], ez = pz[j] - pz[i];
                const d2 = ex * ex + ey * ey + ez * ez;
                if (d2 > SEE * SEE) continue;
                /* Keep the seven nearest, nearest first. */
                if (found < NEIGHBOURS) found++;
                else if (d2 >= nearD[NEIGHBOURS - 1]) continue;
                let p = found - 1;
                while (p > 0 && nearD[p - 1] > d2) { nearD[p] = nearD[p - 1]; nearJ[p] = nearJ[p - 1]; p--; }
                nearD[p] = d2; nearJ[p] = j;
              }
            }
          }
        }
        let ax = 0, ay = 0, az = 0;
        if (found) {
          let mx = 0, my = 0, mz = 0, ux = 0, uy = 0, uz = 0;
          for (let n = 0; n < found; n++) {
            const j = nearJ[n];
            mx += vx[j]; my += vy[j]; mz += vz[j];
            ux += px[j]; uy += py[j]; uz += pz[j];
            if (nearD[n] < ROOM * ROOM) {
              const d2 = Math.max(4, nearD[n]);
              ax += ((px[i] - px[j]) / d2) * 2600; ay += ((py[i] - py[j]) / d2) * 2600; az += ((pz[i] - pz[j]) / d2) * 2600;
            }
          }
          ax += (mx / found - vx[i]) * 2.4; ay += (my / found - vy[i]) * 2.4; az += (mz / found - vz[i]) * 2.4;
          ax += (ux / found - px[i]) * 1.1; ay += (uy / found - py[i]) * 1.1; az += (uz / found - pz[i]) * 1.1;
        }
        ax += (gx0 - px[i]) * 0.35; ay += (gy0 - py[i]) * 0.35; az += (gz0 - pz[i]) * 0.35;
        /* Stay over the roost: free inside the flock's space, pulled back once outside it. */
        const ox = (px[i] - c.x) / c.rx, oy = (py[i] - c.y) / c.ry, oz = (pz[i] - c.z) / c.rz;
        const out = Math.sqrt(ox * ox + oy * oy + oz * oz);
        if (out > 1) {
          const pull = (out - 1) / out;
          ax -= ox * c.rx * pull * 2.4; ay -= oy * c.ry * pull * 3.2; az -= oz * c.rz * pull * 2.4;
        }
        if (threat) {
          const ex = px[i] - threat.x, ey = py[i] - threat.y;
          const d = Math.hypot(ex, ey) || 1;
          const r = threat.r ?? 150;
          if (d < r) {
            const push = (1 - d / r) * 1500;
            ax += (ex / d) * push; ay += (ey / d) * push; az += (pz[i] >= 0 ? 1 : -1) * push * 0.4;
          }
        }
        ax += (rand() - 0.5) * 50; ay += (rand() - 0.5) * 50; az += (rand() - 0.5) * 50;
        const sp = Math.hypot(vx[i], vy[i], vz[i]) || 1;
        const urge = (CRUISE - sp) * 1.4;
        ax += (vx[i] / sp) * urge; ay += (vy[i] / sp) * urge; az += (vz[i] / sp) * urge;
        vx[i] += ax * dt; vy[i] += ay * dt; vz[i] += az * dt;
        limit(i, SLOWEST, FASTEST);
      }
    }

    for (let i = 0; i < N; i++) {
      const m = mode[i];
      if (m === ASLEEP || m === GONE || m === PERCHED) continue;
      if (m === DROP) {
        /* Down into the roost, steeply, the way a murmuration ends. */
        const tx = W * roostX[i] - px[i], ty = H + 120 - py[i];
        const d = Math.hypot(tx, ty) || 1;
        vx[i] += ((tx / d) * 280 - vx[i]) * 2.2 * dt;
        vy[i] += ((ty / d) * 280 - vy[i]) * 2.2 * dt;
        vz[i] += (-pz[i] * 2 - vz[i]) * 2 * dt;
        limit(i, 120, 340);
        if (py[i] > H + 24) mode[i] = ASLEEP;
      } else if (m === LAND) {
        const s = slots[slot[i]];
        const tx = s.x - px[i], ty = s.y - py[i];
        const d = Math.hypot(tx, ty);
        if (d < 2.5) { mode[i] = PERCHED; px[i] = s.x; py[i] = s.y; pz[i] = 0; vx[i] = vy[i] = vz[i] = 0; continue; }
        /* Come in from above and slow down to land. */
        const sp = Math.min(260, d * 2.6 + 20);
        const above = d > 60 ? -Math.min(90, d * 0.25) : 0;
        const dx = tx / d, dy = (ty + above) / Math.hypot(tx, ty + above);
        vx[i] += (dx * sp - vx[i]) * 5 * dt;
        vy[i] += (dy * sp - vy[i]) * 5 * dt;
        vz[i] += (-pz[i] * 3 - vz[i]) * 5 * dt;
        if (Math.abs(vx[i]) > 1) facing[i] = vx[i] > 0 ? 1 : -1;
      } else if (m === LEAVE) {
        /* Out and away from the roost in every direction at once, as they really
           leave: on weather radar it shows as a ring, spreading. */
        const ex = px[i] - W * 0.5, ey = py[i] - H * 1.35;
        const d = Math.hypot(ex, ey) || 1;
        vx[i] += (ex / d) * 260 * dt;
        vy[i] += ((ey / d) * 260 - 50) * dt;
        limit(i, 160, 520);
        if (py[i] < -40 || px[i] < -40 || px[i] > W + 40 || py[i] > H + 200) mode[i] = GONE;
      }
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
      /* Flap and glide: each bird beats in bursts of its own. */
      const flapping = m !== FLY || Math.sin(clock * 0.9 + beat[i]) > -0.25;
      wing[i] += dt * (flapping ? 52 : 6);
    }
  }

  function limit(i, lo, hi) {
    const sp = Math.hypot(vx[i], vy[i], vz[i]);
    if (sp > hi) { const k = hi / sp; vx[i] *= k; vy[i] *= k; vz[i] *= k; }
    else if (sp < lo && sp > 0) { const k = lo / sp; vx[i] *= k; vy[i] *= k; vz[i] *= k; }
  }

  /* Where a bird is on the screen, and how big it looks. */
  function seen(i) {
    const s = FOCAL / (FOCAL + pz[i]);
    return { x: W / 2 + (px[i] - W / 2) * s, y: H / 2 + (py[i] - H / 2) * s, s };
  }

  /* One flying bird, as you see one in a murmuration from the ground: its
     wings across its line of flight, swept back a little, and looking
     shorter and longer as they beat. */
  function wings(ctx, i, scale) {
    const p = seen(i);
    const sp = Math.hypot(vx[i], vy[i]) || 1;
    const hx = vx[i] / sp, hy = vy[i] / sp;
    const span = 3.3 * size[i] * p.s * scale * (0.35 + 0.65 * Math.abs(Math.cos(wing[i])));
    const back = 2.1 * size[i] * p.s * scale * 0.45;
    const nx = -hy, ny = hx;
    const head = 1.6 * size[i] * p.s * scale;
    ctx.moveTo(p.x + nx * span - hx * back, p.y + ny * span - hy * back);
    ctx.lineTo(p.x + hx * head * 0.4, p.y + hy * head * 0.4);
    ctx.lineTo(p.x - nx * span - hx * back, p.y - ny * span - hy * back);
    ctx.moveTo(p.x + hx * head, p.y + hy * head);
    ctx.lineTo(p.x - hx * head * 0.9, p.y - hy * head * 0.9);
  }

  /* The birds behind the page: the murmuration, the drop into the roost, and
     the roost leaving in the morning, seen between the things on the page. */
  function drawBehind(ctx, ink) {
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    /* Nearer birds are drawn heavier, in three passes. */
    for (const [lo, hi, width] of [[-Infinity, -40, 1.7], [-40, 50, 1.35], [50, Infinity, 1.05]]) {
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const m = mode[i];
        const behind = m === FLY || m === DROP || (m === LAND && py[i] < H - BAND) || (m === LEAVE && slot[i] < 0);
        if (behind && pz[i] >= lo && pz[i] < hi) wings(ctx, i, 1);
      }
      ctx.stroke();
    }
  }

  /* The birds in front of the page: those on the wire or about to land on it,
     and, when the morning comes, the same birds leaving the wire, which fly
     up over everything. */
  function drawInFront(ctx, { perch, leave, shape }) {
    ctx.fillStyle = perch;
    for (let i = 0; i < N; i++) {
      if (mode[i] !== PERCHED) continue;
      ctx.save();
      ctx.translate(px[i], py[i]);
      const k = (13 * size[i]) / 32;
      ctx.scale(k * facing[i], k);
      ctx.translate(-16, -32);
      ctx.fill(shape);
      ctx.restore();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = perch;
    ctx.beginPath();
    for (let i = 0; i < N; i++) if (mode[i] === LAND && py[i] >= H - BAND) wings(ctx, i, 1.3);
    ctx.stroke();
    ctx.strokeStyle = leave;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    for (let i = 0; i < N; i++) if (mode[i] === LEAVE && slot[i] >= 0) wings(ctx, i, 1.45);
    ctx.stroke();
  }

  /* How many birds are doing each thing, for the tests and for knowing when
     there is nothing left to draw. */
  function census() {
    const n = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) n[mode[i]]++;
    return { fly: n[FLY], drop: n[DROP], asleep: n[ASLEEP], land: n[LAND], perched: n[PERCHED], leave: n[LEAVE], gone: n[GONE] };
  }

  return {
    count: N,
    resize,
    setMinute,
    step,
    snap,
    drawBehind,
    drawInFront,
    census,
    seen,
    setHawk(point) { hawk = point; },
    bird: (i) => ({ x: px[i], y: py[i], z: pz[i], vx: vx[i], vy: vy[i], vz: vz[i], mode: mode[i], slot: slot[i] }),
    get still() { const c = census(); return c.fly + c.drop + c.land + c.leave === 0; },
  };
}

/* ── the messenger ────────────────────────────────────────────────────── */

/* A bird of the index, sent to a scene: it leaves its place on the wire,
   flies across the page to the scene's hour and stands on the numbers, then
   goes home. The page scrolls under it, so where it is going is asked again
   on every frame: target() gives the spot, whether it is off the screen, and
   while it is, the nearest point on the screen to make for instead. */
export function createMessenger({ from, target, home, colour, onHome }) {
  let phase = 'out';
  let t = 0;
  let wait = 2.6;
  let late = 0;
  let start = { ...from };
  let at = { ...from };
  let face = 1;
  let wing = 0;
  const bend = (a, b) => ({ x: a.x + (b.x - a.x) * 0.35, y: Math.min(a.y, b.y) - 130 });
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
  const along = (a, c, b, k) => ({
    x: (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * c.x + k * k * b.x,
    y: (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * c.y + k * k * b.y,
  });

  function step(dt) {
    wing += dt * 50;
    const before = at;
    if (phase === 'out') {
      /* While the scene is still off the screen, aim for the edge it will come in at. */
      const to = target();
      const aim = to.off && to.near ? to.near : to;
      t = Math.min(1, t + dt / 1.35);
      at = along(start, bend(start, aim), aim, ease(t));
      if (t >= 1) {
        if (!to.off) phase = 'perched';
        else if ((late += dt) > 2) { phase = 'home'; start = at; t = 0; }
      }
    } else if (phase === 'perched') {
      const to = target();
      wait -= dt;
      if (to.off || wait <= 0) { phase = 'home'; start = at; t = 0; }
      else at = { x: to.x, y: to.y };
    } else if (phase === 'home') {
      const to = home();
      t = Math.min(1, t + dt / 1.15);
      at = along(start, bend(start, to), to, ease(t));
      if (t >= 1) { onHome?.(); return false; }
    }
    if (Math.abs(at.x - before.x) > 0.3) face = at.x > before.x ? 1 : -1;
    return true;
  }

  function draw(ctx, shape) {
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    if (phase === 'perched') {
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.scale((20 / 32) * face, 20 / 32);
      ctx.translate(-16, -32);
      ctx.fill(shape);
      ctx.restore();
      return;
    }
    /* In flight: a bigger bird than the flock's, seen from the side. */
    const s = 9;
    const flap = Math.sin(wing);
    ctx.save();
    ctx.translate(at.x, at.y - 8);
    ctx.scale(face, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.9, s * 0.32, -0.08, 0, Math.PI * 2);
    ctx.moveTo(s * 0.7, -s * 0.12);
    ctx.arc(s * 0.85, -s * 0.12, s * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, 0);
    ctx.quadraticCurveTo(-s * 0.2, -s * (0.2 + flap * 0.9), -s * 1.1, -s * (0.3 + flap * 1.3));
    ctx.quadraticCurveTo(-s * 0.1, -s * (flap * 0.4), s * 0.35, 0);
    ctx.fill();
    ctx.restore();
  }

  return { step, draw, get phase() { return phase; }, get at() { return at; }, recall() { if (phase !== 'home') { phase = 'home'; start = at; t = 0; } } };
}

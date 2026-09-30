import { readFileSync } from 'node:fs';
import { test, assert } from './harness.mjs';
import {
  Game, makeMap, visibility, pointInPoly, autopilot, lightRadius,
  RULES, TILE, T, ACTS, LORE, BOONS, opaque,
} from '../play/ember/engine.js';

const center = (room) => ({ x: room.mx * T + T / 2, y: room.my * T + T / 2 });

function reachable(map, from) {
  const seen = new Uint8Array(map.W * map.H);
  const q = [from];
  seen[from] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % map.W, y = (c / map.W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * map.W + nx;
      if (nx < 0 || ny < 0 || nx >= map.W || ny >= map.H || seen[n] || opaque(map.tiles[n])) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

function play(seed, { limit = 60 * 60 * 20, onStep } = {}) {
  const g = new Game({ seed });
  g.cheat.invulnerable = true;
  const mem = {}, log = [];
  for (let i = 0; i < limit && g.mode !== 'ending'; i++) {
    g.step(1 / 60, autopilot(g, mem));
    for (const e of g.drain()) log.push({ ...e, act: g.act });
    onStep?.(g, i);
  }
  return { g, log };
}

/* ── the map ────────────────────────────────────────────────────────────── */

test('every room of every act can be walked to from the start', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (let act = 1; act <= 3; act++) {
      const m = makeMap(seed, act);
      const s = m.start;
      const seen = reachable(m, s.my * m.W + s.mx);
      for (const room of m.rooms) assert.ok(seen[room.my * m.W + room.mx], `seed ${seed} act ${act}: room ${room.id} (${room.kind}) is sealed off`);
      for (const b of m.braziers) assert.ok(seen[Math.floor(b.y / T) * m.W + Math.floor(b.x / T)], `seed ${seed} act ${act}: a brazier is out of reach`);
      for (const st of m.stones) assert.ok(seen[Math.floor(st.y / T) * m.W + Math.floor(st.x / T)], `seed ${seed} act ${act}: an ash-stone is out of reach`);
    }
  }
});

test('each act has one start, one shrine and one boss, and the boss is at the far end', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (let act = 1; act <= 3; act++) {
      const m = makeMap(seed, act);
      const kinds = m.rooms.map((r) => r.kind);
      assert.equal(m.rooms.length, ACTS[act].rooms);
      assert.equal(kinds.filter((k) => k === 'start').length, 1);
      assert.equal(kinds.filter((k) => k === 'shrine').length, 1);
      assert.equal(kinds.filter((k) => k === 'boss').length, 1);
      assert.ok(m.boss.depth >= 3, `seed ${seed} act ${act}: the boss is only ${m.boss.depth} rooms in`);
      assert.equal(m.boss.links.length, 1, 'the boss room should be a dead end, not a way through');
      assert.equal(m.boss.depth, Math.max(...m.rooms.map((r) => r.depth)));
    }
  }
});

test('the nine ash-stones are split three to an act, and each has words', () => {
  const ids = [];
  for (let act = 1; act <= 3; act++) {
    const m = makeMap(11, act);
    assert.equal(m.stones.length, 3);
    for (const s of m.stones) {
      ids.push(s.id);
      assert.equal(m.tiles[Math.floor(s.y / T) * m.W + Math.floor(s.x / T)], TILE.FLOOR, 'an ash-stone is standing in water or on a pillar');
      assert.ok(m.rooms[s.room].kind !== 'boss' && m.rooms[s.room].kind !== 'start');
    }
  }
  assert.deep(ids.sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(LORE).size, 9);
});

test('the same seed makes the same kingdom, and a different one does not', () => {
  const a = makeMap(5, 2), b = makeMap(5, 2), c = makeMap(6, 2);
  assert.deep([...a.tiles], [...b.tiles]);
  assert.ok([...a.tiles].join() !== [...c.tiles].join());
});

/* ── light and shadow ───────────────────────────────────────────────────── */

test('light stops at walls and pillars', () => {
  let checkedPillar = false;
  for (let seed = 1; seed <= 30 && !checkedPillar; seed++) {
    const m = makeMap(seed, 1);
    const room = m.rooms.find((r) => r.kind === 'fight' && (() => {
      for (let y = r.y0; y < r.y0 + r.h; y++) for (let x = r.x0; x < r.x0 + r.w; x++) if (m.tiles[y * m.W + x] === TILE.PILLAR) return true;
      return false;
    })());
    const c = center(m.start);
    const poly = visibility(m, c.x, c.y, 900);
    assert.ok(pointInPoly(poly, c.x + 40, c.y + 20), 'a point in plain view is dark');
    assert.ok(!pointInPoly(poly, c.x, (m.start.y0 - 3) * T), 'light went straight through the wall above the start');
    if (!room) continue;
    const rc = center(room);
    const rp = visibility(m, rc.x, rc.y, 900);
    for (let y = room.y0; y < room.y0 + room.h && !checkedPillar; y++) {
      for (let x = room.x0; x < room.x0 + room.w && !checkedPillar; x++) {
        if (m.tiles[y * m.W + x] !== TILE.PILLAR) continue;
        const px = x * T + T / 2, py = y * T + T / 2;
        const dx = px - rc.x, dy = py - rc.y, d = Math.hypot(dx, dy);
        const bx = px + (dx / d) * 40, by = py + (dy / d) * 40;
        const bt = m.tiles[Math.floor(by / T) * m.W + Math.floor(bx / T)];
        if (bt !== TILE.FLOOR && bt !== TILE.WATER) continue;
        const fx = px - (dx / d) * 30, fy = py - (dy / d) * 30;
        let clear = true;
        for (let k = 0; k <= 1; k += 0.02) {
          const sx = rc.x + (fx - rc.x) * k, sy = rc.y + (fy - rc.y) * k;
          if (opaque(m.tiles[Math.floor(sy / T) * m.W + Math.floor(sx / T)])) clear = false;
        }
        if (!clear) continue;
        assert.ok(!pointInPoly(rp, bx, by), 'the floor behind a pillar was lit');
        assert.ok(pointInPoly(rp, fx, fy), 'the floor in front of a pillar was dark');
        checkedPillar = true;
      }
    }
  }
  assert.ok(checkedPillar, 'found no pillar to test against');
});

test('the more ember you have, the further you can see', () => {
  assert.ok(lightRadius(100) > lightRadius(50));
  assert.ok(lightRadius(50) > lightRadius(10));
  assert.ok(lightRadius(0) > 0, 'even at nothing, you can see your own feet');
});

/* ── the whole game ─────────────────────────────────────────────────────── */

const runs = [1, 2, 3].map((seed) => {
  const hazards = [], shots = [];
  let clipped = null;
  const { g, log } = play(seed, {
    onStep(g, i) {
      if (i === 0) {
        const hz = g.hazard.bind(g), bu = g.bullet.bind(g);
        g.hazard = (o) => { const h = hz(o); hazards.push(h); return h; };
        g.bullet = (x, y, a, s, warnAt, o) => { shots.push({ t: g.t, warnAt }); return bu(x, y, a, s, warnAt, o); };
      }
      if (i % 5 || clipped) return;
      const p = g.player;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) clipped = 'the player position is not a number';
      else if (!g.free(p.x, p.y, p.r - 0.5)) clipped = `the player is inside a wall at ${p.x.toFixed(0)},${p.y.toFixed(0)}`;
      for (const e of g.enemies) {
        if (e.dead || e.kind === 'mask' || e.state === 'spawn') continue;
        if (!g.free(e.x, e.y, e.r - 1)) { clipped = `a ${e.kind} is inside a wall`; break; }
      }
    },
  });
  return { seed, g, log, hazards, shots, clipped };
});

test('a player can get from the first room to the ending, on every seed tried', () => {
  for (const { seed, g, log } of runs) {
    assert.equal(g.mode, 'ending', `seed ${seed} stopped in act ${g.act}, mode ${g.mode}`);
    const downs = log.filter((e) => e.type === 'bossDown').map((e) => e.act);
    assert.deep(downs, [1, 2, 3], `seed ${seed}: bosses fell in the order ${downs}`);
    assert.ok(g.stats.time < 20 * 60, `seed ${seed} took ${g.stats.time.toFixed(0)}s`);
    assert.equal(g.lore.size, 9, `seed ${seed}: only ${g.lore.size} ash-stones were reachable`);
    assert.equal(g.boons.length, 5, 'two shrines and two stairways and one more shrine is five boons');
  }
});

test('every boss goes through all of its phases, in order', () => {
  for (const { seed, log } of runs) {
    const seq = log.filter((e) => ['bossIntro', 'roar', 'grieve', 'eclipse', 'lastlight', 'bossDown'].includes(e.type)).map((e) => `${e.act}:${e.type}`);
    const want = ['1:bossIntro', '1:roar', '1:bossDown', '2:bossIntro', '2:grieve', '2:grieve', '2:bossDown', '3:bossIntro', '3:eclipse', '3:lastlight', '3:bossDown'];
    assert.deep(seq, want, `seed ${seed}`);
  }
});

test('nothing hurts you without being shown on the floor first', () => {
  for (const { seed, g, hazards, shots } of runs) {
    for (const h of g.hitLog) assert.ok(h.warned >= RULES.minWarn - 1e-9, `seed ${seed}: a ${h.by} landed with ${h.warned.toFixed(3)}s of warning`);
    for (const h of hazards) if (h.dmg > 0) assert.ok(h.liveAt - h.warnAt >= RULES.minWarn - 1e-9, `seed ${seed}: a ${h.by} was drawn for only ${(h.liveAt - h.warnAt).toFixed(3)}s`);
    for (const s of shots) assert.ok(s.t - s.warnAt >= RULES.minWarn - 1e-9, `seed ${seed}: a shot was fired with ${(s.t - s.warnAt).toFixed(3)}s of wind-up`);
    assert.ok(hazards.filter((h) => h.dmg > 0).length > 40, 'too few attacks to have tested anything');
    assert.ok(shots.length > 200, 'too few shots to have tested anything');
  }
});

test('no one ever ends up inside a wall', () => {
  for (const { seed, clipped } of runs) assert.equal(clipped, null, `seed ${seed}: ${clipped}`);
});

test('the same inputs play out the same way, exactly', () => {
  const a = play(9, { limit: 60 * 45 }).g, b = play(9, { limit: 60 * 45 }).g;
  assert.deep([a.player.x, a.player.y, a.player.ember, a.stats.kills, a.t], [b.player.x, b.player.y, b.player.ember, b.stats.kills, b.t]);
});

/* ── rules ──────────────────────────────────────────────────────────────── */

const src = { warnAt: 0, liveAt: 1, by: 'test' };

test('a hit costs ember, and you cannot be hit twice in the same instant', () => {
  const g = new Game({ seed: 3 });
  g.hurtPlayer(20, src);
  assert.equal(g.player.ember, 80);
  assert.ok(!g.hurtPlayer(20, src), 'hit again during the flinch');
  assert.equal(g.player.ember, 80);
});

test('nothing can touch you mid-dash', () => {
  const g = new Game({ seed: 3 });
  g.step(1 / 60, { mx: 1, my: 0, dash: true });
  assert.ok(g.player.dashT > 0);
  assert.ok(!g.hurtPlayer(20, src));
  assert.equal(g.player.ember, 100);
});

test('Gentle halves every blow', () => {
  const g = new Game({ seed: 3, gentle: true });
  g.hurtPlayer(20, src);
  assert.equal(g.player.ember, 90);
});

test('a flare costs ember, and cinders give it back, up to the brim', () => {
  const g = new Game({ seed: 3 });
  g.player.ember = 50;
  g.step(1 / 60, { flare: true });
  assert.equal(g.player.ember, 50 - RULES.flareCost);
  g.player.ember = 99;
  const p = g.player;
  g.cinders.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: 1 });
  g.step(1 / 60, {});
  assert.equal(g.player.ember, 100);
});

test('when the flame goes out you wake at the last lit brazier', () => {
  const g = new Game({ seed: 4 });
  const room = g.map.rooms.find((r) => r.kind === 'fight');
  g.clearRoom(room);
  g.player.x += 300;
  g.hurtPlayer(500, src);
  assert.equal(g.mode, 'dead');
  for (let i = 0; i < 200 && g.mode === 'dead'; i++) g.step(1 / 60, {});
  assert.equal(g.mode, 'play');
  assert.ok(Math.hypot(g.player.x - room.brazier.x, g.player.y - room.brazier.y) < 60, 'woke somewhere other than the brazier');
  assert.ok(g.player.ember >= 60);
  assert.equal(g.stats.deaths, 1);
});

test('dying in a boss fight puts the boss back to full', () => {
  const g = new Game({ seed: 4 });
  const room = g.map.boss;
  g.player.x = room.mx * T + T / 2; g.player.y = (room.my + 3) * T + T / 2;
  g.step(1 / 60, {});
  assert.ok(g.boss, 'walking into the boss room did not start the fight');
  for (let i = 0; i < 240; i++) g.step(1 / 60, {});
  g.boss.body.hp -= 500;
  g.player.iframes = 0;
  g.hurtPlayer(500, src);
  for (let i = 0; i < 200 && g.mode === 'dead'; i++) g.step(1 / 60, {});
  assert.equal(g.boss, null);
  assert.ok(!room.locked);
  g.player.x = room.mx * T + T / 2; g.player.y = (room.my + 3) * T + T / 2;
  g.step(1 / 60, {});
  assert.equal(g.bossHp(), g.boss.maxHp);
});

test('the King wears the dark as armour, and a lit brazier takes it off', () => {
  const g = new Game({ seed: 4, act: 3 });
  const room = g.map.boss;
  g.player.x = room.mx * T + T / 2; g.player.y = (room.my + 3) * T + T / 2;
  g.step(1 / 60, {});
  const B = g.boss, k = B.body;
  B.phase = 2;
  for (const b of room.braziers) b.lit = false;
  k.x = B.cx; k.y = B.cy;
  assert.equal(g.bossDamageMul(k), 0.5);
  const near = room.braziers[0];
  near.lit = true;
  k.x = near.x + 20; k.y = near.y;
  assert.equal(g.bossDamageMul(k), 1);
  k.exposed = 1;
  assert.equal(g.bossDamageMul(k), 2);
});

/* ── boons do what they say ─────────────────────────────────────────────── */

test('every boon changes what its card says it changes', () => {
  const base = new Game({ seed: 2 }).player;
  const with_ = (id) => new Game({ seed: 2, boons: [id] });
  assert.equal(with_('kindling').player.maxEmber, base.maxEmber + 25);
  assert.close(with_('longblade').player.reach, base.reach * 4 / 3, 1e-9);
  assert.close(with_('quick').player.strikeCdMul, 0.8, 1e-9);
  assert.close(with_('ashheart').player.cinderMul, 1.5, 1e-9);
  const bright = with_('bright').player;
  assert.close(bright.flareR, base.flareR * 1.4, 1e-9);
  assert.equal(bright.flareCost, 10, '"a third less" than 15 is 10');

  const sw = with_('secondwind');
  sw.hurtPlayer(500, src);
  assert.equal(sw.mode, 'play');
  assert.equal(sw.player.ember, 30);
  sw.player.iframes = 0;
  sw.hurtPlayer(500, src);
  assert.equal(sw.mode, 'dead', 'second wind saved you twice in one act');

  const hitFor = (boons, ember) => {
    const g = new Game({ seed: 2, boons });
    g.player.ember = ember;
    const p = g.player;
    const e = g.addEnemy('husk', p.x + 20, p.y);
    e.state = 'chase';
    e.hp = 1000;
    g.player.face = 0;
    g.strike();
    return 1000 - e.hp;
  };
  assert.equal(hitFor([], 90), RULES.strikeDmg[0]);
  assert.equal(hitFor(['blaze'], 90), RULES.strikeDmg[0] * 1.5);
  assert.equal(hitFor(['blaze'], 60), RULES.strikeDmg[0], 'Blaze worked below 70');

  const wf = with_('wildfire');
  for (let i = 0; i < 3; i++) { wf.player.strikeCd = 0; wf.player.comboT = 1; wf.strike(); }
  assert.equal(wf.shots.length, 1, 'the third blow threw no flame');

  const td = with_('tinder');
  td.step(1 / 60, { mx: 1, my: 0, dash: true });
  for (let i = 0; i < 12; i++) td.step(1 / 60, { mx: 1, my: 0 });
  assert.ok(td.fires.length > 0, 'the dash left no fire');
  assert.equal(BOONS.length, 9);
});

/* ── the story holds together ───────────────────────────────────────────── */

test('the King’s last words agree with the ledger', () => {
  const page = readFileSync(new URL('../play/ember/index.html', import.meta.url), 'utf8');
  assert.ok(LORE[2].includes('212'), 'the ledger no longer counts 212 bearers');
  assert.ok(page.includes('Two hundred and twelve'), 'the King no longer counts them');
  assert.ok(LORE[8].includes('213'), 'you are no longer bearer 213');
  assert.ok(page.includes('two hundred and thirteenth'));
});

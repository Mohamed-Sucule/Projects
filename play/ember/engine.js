/* play/ember/engine.js — the rules of Ember: the map, the fighting, the bosses. No DOM, no canvas, no sound. */

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mix = (a, b) => (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35)) >>> 0;

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const hyp = Math.hypot;

export const T = 32;
export const TILE = { VOID: 0, FLOOR: 1, WALL: 2, WATER: 3, PILLAR: 4, DOOR: 5 };
export const opaque = (t) => t === 0 || t === 2 || t === 4;

export const RULES = {
  step: 1 / 120,
  playerR: 10,
  speed: 150,
  waterSlow: 0.62,
  dashSpeed: 540, dashTime: 0.16, dashCd: 0.5, dashIframes: 0.24,
  reach: 46, arc: 2.1, strikeCd: 0.24, comboWindow: 0.55, comboEndCd: 0.42,
  strikeDmg: [14, 14, 26],
  flareCost: 15, flareCd: 2.4, flareR: 130, flareDmg: 22,
  maxEmber: 100, hurtIframes: 0.75,
  cinder: 4, cinderPull: 95,
  lightBase: 60, lightPerEmber: 1.9,
  brazierLight: 250,
  minWarn: 0.3,
};

export const lightRadius = (ember) => RULES.lightBase + RULES.lightPerEmber * Math.max(0, ember);

export const ACTS = [null,
  { name: 'The Undercroft', line: 'Where they kept the bearers before the climb.', rooms: 7, pool: ['mite', 'mite', 'husk'], budget: [7, 10], waves: 2 },
  { name: 'The Drowned Nave', line: 'Where the Choir sang, before the water came in.', rooms: 8, pool: ['mite', 'husk', 'wraith'], budget: [10, 14], waves: 2 },
  { name: 'The Crown of Ash', line: 'Where the Beacon stood, and the King beside it.', rooms: 8, pool: ['mite', 'husk', 'wraith', 'shade'], budget: [13, 17], waves: 3 },
];

export const BOSSES = [null,
  { name: 'The Warden', title: 'who kept the gate' },
  { name: 'The Choir', title: 'who sang them down' },
  { name: 'The Hollow King', title: 'last of the line' },
];

export const LORE = [
  'By order of the King the Undercroft gate is locked. None go down. None come up.\n\nThe key is on the inside.',
  'Scratched low on the wall, where a child could reach:\n\nThey took Maren to carry the flame. The Beacon was brighter that winter.',
  'A ledger, water-stained.\n\nBearers sent up to the Beacon: 212.\nBearers who came back: 0.',
  'A hymn sheet, mostly pulp:\n\nSing it bright and sing it high,\ngive the flame a child to fly.',
  'The Choir’s rule, carved over the door: THOSE WHO SING SHALL NEVER CARRY.\n\nSomeone has scratched a word beside it. The word is “cowards”.',
  'A letter in a careful hand, never sent:\n\nI have heard them sing a child into the fire for the last time. I will not light it again.',
  'An order, nailed to the Beacon’s door and signed with the royal seal:\n\nLet it go out.',
  'A map of the mountain. One stair is marked in red, climbing past the top of the page:\n\nUp — to the thing the old books call the sun.',
  'The same ledger, the last page.\n\nBearer 213. Your name. No date beside it yet.',
];

export const BOONS = [
  { id: 'kindling', name: 'Kindling', text: 'Your ember holds 25 more.' },
  { id: 'longblade', name: 'Long Blade', text: 'Your strike reaches a third further.' },
  { id: 'tinder', name: 'Tinder Step', text: 'Dashing leaves a trail of fire that burns what follows.' },
  { id: 'ashheart', name: 'Ashen Heart', text: 'Cinders give back half as much again.' },
  { id: 'wildfire', name: 'Wildfire', text: 'The third blow of a combo throws a wave of flame.' },
  { id: 'bright', name: 'Bright Flare', text: 'Your flare reaches further and costs a third less.' },
  { id: 'secondwind', name: 'Second Wind', text: 'Once in each act, a killing blow leaves you burning at 30.' },
  { id: 'quick', name: 'Quick Hands', text: 'You strike a fifth faster.' },
  { id: 'blaze', name: 'Blaze', text: 'While your ember is above 70, you hit half as hard again.' },
];

const ENEMY = {
  mite:   { hp: 16, r: 7,  speed: 100, cinders: 1 },
  husk:   { hp: 55, r: 13, speed: 46,  cinders: 3 },
  wraith: { hp: 38, r: 10, speed: 72,  cinders: 2 },
  shade:  { hp: 44, r: 10, speed: 70,  cinders: 3 },
};
const COST = { mite: 1, husk: 3, wraith: 3, shade: 4 };

/* ── the map ────────────────────────────────────────────────────────────── */

const GW = 5, GH = 4, CW = 25, CH = 19;
const FIGHT_SIZES = [[13, 9], [15, 11], [17, 11], [15, 13], [17, 13]];

export function makeMap(seed, act) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const m = tryMap(rng(mix(seed, act * 97 + attempt)), act);
    if (m) return m;
  }
  throw new Error('no map');
}

function tryMap(r, act) {
  const spec = ACTS[act];
  const cells = new Map();
  const rooms = [];
  const add = (cx, cy, parent) => {
    const room = { id: rooms.length, cx, cy, parent, depth: parent ? parent.depth + 1 : 0, links: [] };
    rooms.push(room);
    cells.set(cy * GW + cx, room);
    if (parent) { parent.links.push(room); room.links.push(parent); }
    return room;
  };
  add(0, (r() * GH) | 0, null);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let guard = 0; rooms.length < spec.rooms && guard < 800; guard++) {
    const maxD = Math.max(...rooms.map((x) => x.depth));
    const pool = r() < 0.6 ? rooms.filter((x) => x.depth === maxD) : rooms;
    const from = pool[(r() * pool.length) | 0];
    const [dx, dy] = dirs[(r() * 4) | 0];
    const cx = from.cx + dx, cy = from.cy + dy;
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH || cells.has(cy * GW + cx)) continue;
    add(cx, cy, from);
  }
  if (rooms.length < spec.rooms) return null;
  const leaves = rooms.filter((x) => x.links.length === 1 && x.depth > 0);
  const boss = leaves.reduce((a, b) => (!a || b.depth > a.depth ? b : a), null);
  if (!boss || boss.depth < 3) return null;

  const others = rooms.filter((x) => x !== boss && x.depth > 0);
  const shrineCands = leaves.filter((x) => x !== boss);
  const shrine = (shrineCands.length ? shrineCands : others.filter((x) => x !== boss.parent))[0];
  if (!shrine) return null;
  for (const room of rooms) {
    room.kind = room.depth === 0 ? 'start' : room === boss ? 'boss' : room === shrine ? 'shrine' : 'fight';
    const [w, h] = room.kind === 'start' ? [13, 9] : room.kind === 'boss' ? [21, 15] : room.kind === 'shrine' ? [11, 9]
      : FIGHT_SIZES[(r() * FIGHT_SIZES.length) | 0];
    room.w = w; room.h = h;
    room.x0 = room.cx * CW + ((CW - w) >> 1);
    room.y0 = room.cy * CH + ((CH - h) >> 1);
    room.mx = room.x0 + (w >> 1); room.my = room.y0 + (h >> 1);
    room.doors = [];
    room.cleared = room.kind !== 'fight' && room.kind !== 'boss';
    room.locked = false; room.active = false; room.visited = false; room.wave = 0;
  }

  const W = GW * CW, H = GH * CH;
  const tiles = new Uint8Array(W * H);
  const roomOf = new Int16Array(W * H).fill(-1);
  const doorOf = new Int16Array(W * H).fill(-1);
  const set = (x, y, t) => { tiles[y * W + x] = t; };
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : tiles[y * W + x]);

  for (const room of rooms) {
    for (let y = room.y0 - 1; y <= room.y0 + room.h; y++) {
      for (let x = room.x0 - 1; x <= room.x0 + room.w; x++) {
        const inside = x >= room.x0 && x < room.x0 + room.w && y >= room.y0 && y < room.y0 + room.h;
        if (inside) { set(x, y, TILE.FLOOR); roomOf[y * W + x] = room.id; }
        else if (get(x, y) === TILE.VOID) set(x, y, TILE.WALL);
      }
    }
  }
  const door = (x, y, room) => { set(x, y, TILE.DOOR); doorOf[y * W + x] = room.id; room.doors.push(y * W + x); };
  for (const room of rooms) {
    const p = room.parent;
    if (!p) continue;
    const [a, b] = p.cx < room.cx || p.cy < room.cy ? [p, room] : [room, p];
    if (a.cy === b.cy) {
      const c = a.my, x1 = a.x0 + a.w, x2 = b.x0 - 1;
      for (let x = x1; x <= x2; x++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (x === x1) door(x, c + dy, a);
          else if (x === x2) door(x, c + dy, b);
          else set(x, c + dy, TILE.FLOOR);
        }
        if (x > x1 && x < x2) {
          if (get(x, c - 2) === TILE.VOID) set(x, c - 2, TILE.WALL);
          if (get(x, c + 2) === TILE.VOID) set(x, c + 2, TILE.WALL);
        }
      }
    } else {
      const c = a.mx, y1 = a.y0 + a.h, y2 = b.y0 - 1;
      for (let y = y1; y <= y2; y++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (y === y1) door(c + dx, y, a);
          else if (y === y2) door(c + dx, y, b);
          else set(c + dx, y, TILE.FLOOR);
        }
        if (y > y1 && y < y2) {
          if (get(c - 2, y) === TILE.VOID) set(c - 2, y, TILE.WALL);
          if (get(c + 2, y) === TILE.VOID) set(c + 2, y, TILE.WALL);
        }
      }
    }
  }

  const braziers = [];
  const px = (tx) => tx * T + T / 2;
  const addBrazier = (room, tx, ty) => { const b = { x: px(tx), y: px(ty), room: room.id, lit: false }; braziers.push(b); return b; };
  const clearOfCross = (room, x, y) => Math.abs(x - room.mx) > 1 && Math.abs(y - room.my) > 1;
  const pillar = (room, dx, dy) => {
    const x = room.mx + dx, y = room.my + dy;
    if (x <= room.x0 || y <= room.y0 || x >= room.x0 + room.w - 1 || y >= room.y0 + room.h - 1) return;
    if (clearOfCross(room, x, y)) set(x, y, TILE.PILLAR);
  };

  for (const room of rooms) {
    const hw = room.w >> 1, hh = room.h >> 1;
    if (room.kind === 'boss') {
      if (act === 1) for (const sx of [-1, 1]) for (const sy of [-1, 1]) pillar(room, sx * 5, sy * 3);
      if (act === 2) {
        for (let y = room.y0; y < room.y0 + room.h; y++) for (let x = room.x0; x < room.x0 + room.w; x++) {
          const d = hyp((x - room.mx) / 1.4, y - room.my);
          if (d > 7.2) set(x, y, TILE.WATER);
        }
      }
      room.braziers = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) room.braziers.push(addBrazier(room, room.mx + sx * (act === 3 ? 7 : 9), room.my + sy * (act === 3 ? 4 : 6)));
      continue;
    }
    if (room.kind === 'shrine') { room.altar = { x: px(room.mx), y: px(room.my) }; room.brazier = addBrazier(room, room.mx, room.my - 3); continue; }
    room.brazier = addBrazier(room, room.mx, room.my);
    if (room.kind === 'start') continue;
    const style = (r() * 4) | 0;
    if (style === 1) for (const sx of [-1, 1]) for (const sy of [-1, 1]) pillar(room, sx * (hw - 2), sy * (hh - 2));
    if (style === 2) for (let dx = -hw + 2; dx <= hw - 2; dx += 3) { pillar(room, dx, -2); pillar(room, dx, 2); }
    if (style === 3) for (const sx of [-1, 1]) for (const sy of [-1, 1]) { pillar(room, sx * 3, sy * 2); pillar(room, sx * (hw - 1), sy * (hh - 1)); }
    if (act === 2) {
      const blobs = 2 + ((r() * 2) | 0);
      for (let i = 0; i < blobs; i++) {
        const bx = room.x0 + 1 + r() * (room.w - 2), by = room.y0 + 1 + r() * (room.h - 2), br = 1.6 + r() * 1.8;
        for (let y = room.y0; y < room.y0 + room.h; y++) for (let x = room.x0; x < room.x0 + room.w; x++) {
          if (get(x, y) === TILE.FLOOR && hyp(x - bx, y - by) < br && clearOfCross(room, x, y)) set(x, y, TILE.WATER);
        }
      }
    }
  }

  const fights = rooms.filter((x) => x.kind === 'fight');
  const [lo, hi] = spec.budget;
  for (const room of fights) {
    let budget = lo + Math.floor(r() * (hi - lo + 1)) + Math.floor(room.depth / 2);
    const waves = [];
    for (let i = 0; i < spec.waves; i++) {
      const share = i === spec.waves - 1 ? budget : Math.max(2, Math.round(budget / (spec.waves - i)));
      budget -= share;
      const wave = [];
      let left = share;
      while (left > 0) {
        const opts = spec.pool.filter((k) => COST[k] <= left);
        if (!opts.length) break;
        const k = opts[(r() * opts.length) | 0];
        wave.push(k); left -= COST[k];
      }
      if (!wave.length) wave.push('mite');
      waves.push(wave);
    }
    room.waves = waves;
  }

  const loreRooms = [...fights, shrine].sort((a, b) => (a.links.length - b.links.length) || (r() - 0.5)).slice(0, 3);
  const stones = [];
  loreRooms.forEach((room, k) => {
    for (let tries = 0; tries < 200; tries++) {
      const x = room.x0 + 1 + ((r() * (room.w - 2)) | 0), y = room.y0 + 1 + ((r() * (room.h - 2)) | 0);
      if (get(x, y) !== TILE.FLOOR || !clearOfCross(room, x, y)) continue;
      if (hyp(x - room.mx, y - room.my) < 3) continue;
      stones.push({ id: (act - 1) * 3 + k, x: px(x), y: px(y), room: room.id });
      break;
    }
  });
  if (stones.length < 3) return null;

  const map = { act, W, H, tiles, roomOf, doorOf, rooms, braziers, stones, start: rooms[0], boss, shrine, exit: null };
  map.segs = buildSegments(map);
  map.buckets = bucketSegments(map);
  return map;
}

/* ── walls as line segments, for light and shadow ───────────────────────── */

function buildSegments(map) {
  const { W, H, tiles } = map;
  const op = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? true : opaque(tiles[y * W + x]));
  const segs = [];
  for (let y = 0; y <= H; y++) {
    let runA = -1, runB = -1;
    for (let x = 0; x <= W; x++) {
      const above = y > 0 && x < W ? op(x, y - 1) : true, below = y < H && x < W ? op(x, y) : true;
      const edgeA = x < W && !above && below;
      const edgeB = x < W && above && !below;
      if (edgeA) { if (runA < 0) runA = x; } else if (runA >= 0) { segs.push([runA * T, y * T, x * T, y * T]); runA = -1; }
      if (edgeB) { if (runB < 0) runB = x; } else if (runB >= 0) { segs.push([runB * T, y * T, x * T, y * T]); runB = -1; }
    }
  }
  for (let x = 0; x <= W; x++) {
    let runA = -1, runB = -1;
    for (let y = 0; y <= H; y++) {
      const left = x > 0 && y < H ? op(x - 1, y) : true, right = x < W && y < H ? op(x, y) : true;
      const edgeA = y < H && !left && right;
      const edgeB = y < H && left && !right;
      if (edgeA) { if (runA < 0) runA = y; } else if (runA >= 0) { segs.push([x * T, runA * T, x * T, y * T]); runA = -1; }
      if (edgeB) { if (runB < 0) runB = y; } else if (runB >= 0) { segs.push([x * T, runB * T, x * T, y * T]); runB = -1; }
    }
  }
  return segs;
}

const BUCKET = 8 * T;
function bucketSegments(map) {
  const bw = Math.ceil((map.W * T) / BUCKET) + 1, bh = Math.ceil((map.H * T) / BUCKET) + 1;
  const b = Array.from({ length: bw * bh }, () => []);
  map.segs.forEach((s, i) => {
    const x0 = Math.floor(Math.min(s[0], s[2]) / BUCKET), x1 = Math.floor(Math.max(s[0], s[2]) / BUCKET);
    const y0 = Math.floor(Math.min(s[1], s[3]) / BUCKET), y1 = Math.floor(Math.max(s[1], s[3]) / BUCKET);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) b[y * bw + x].push(i);
  });
  return { bw, bh, b, stamp: new Uint32Array(map.segs.length), mark: 0 };
}

/** The polygon a light at (x, y) can reach within radius R, walls and pillars casting shadow. */
export function visibility(map, x, y, R) {
  const K = map.buckets;
  K.mark++;
  const near = [];
  const bx0 = Math.max(0, Math.floor((x - R) / BUCKET)), bx1 = Math.min(K.bw - 1, Math.floor((x + R) / BUCKET));
  const by0 = Math.max(0, Math.floor((y - R) / BUCKET)), by1 = Math.min(K.bh - 1, Math.floor((y + R) / BUCKET));
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
    for (const i of K.b[by * K.bw + bx]) {
      if (K.stamp[i] === K.mark) continue;
      K.stamp[i] = K.mark;
      near.push(map.segs[i]);
    }
  }
  const box = R + 4;
  const bounds = [[x - box, y - box, x + box, y - box], [x + box, y - box, x + box, y + box],
    [x + box, y + box, x - box, y + box], [x - box, y + box, x - box, y - box]];
  const all = near.concat(bounds);
  const angles = [];
  for (const s of all) {
    for (const [px, py] of [[s[0], s[1]], [s[2], s[3]]]) {
      if (Math.abs(px - x) > box + 1 || Math.abs(py - y) > box + 1) continue;
      const a = Math.atan2(py - y, px - x);
      angles.push(a - 0.0004, a, a + 0.0004);
    }
  }
  angles.sort((a, b) => a - b);
  const pts = [];
  for (const a of angles) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = Infinity;
    for (const s of all) {
      const sx = s[2] - s[0], sy = s[3] - s[1];
      const den = dx * sy - dy * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((s[0] - x) * sy - (s[1] - y) * sx) / den;
      const u = ((s[0] - x) * dy - (s[1] - y) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    if (best < Infinity) pts.push(x + dx * best, y + dy * best);
  }
  return pts;
}

export function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ── the game ───────────────────────────────────────────────────────────── */

export const NO_INPUT = Object.freeze({ mx: 0, my: 0, ax: 0, ay: 0, strike: false, dash: false, flare: false });
const PAUSED = new Set(['boon', 'lore', 'ending']);

function makePlayer() {
  return {
    x: 0, y: 0, r: RULES.playerR, vx: 0, vy: 0, kx: 0, ky: 0, face: 0,
    ember: RULES.maxEmber, maxEmber: RULES.maxEmber,
    reach: RULES.reach, dmgMul: 1, strikeCdMul: 1, flareR: RULES.flareR, flareCost: RULES.flareCost, cinderMul: 1,
    flags: new Set(),
    dashT: 0, dashX: 0, dashY: 0, dashCd: 0, strikeCd: 0, combo: 0, comboT: 0, flareCd: 0, iframes: 0, lag: 0,
    buf: { strike: 0, dash: 0, flare: 0 }, trail: 0, secondWindUsed: false, moving: false,
  };
}

export class Game {
  constructor({ seed = 1, act = 1, boons = [], lore = [], gentle = false } = {}) {
    this.seed = seed >>> 0;
    this.gentle = gentle;
    this.player = makePlayer();
    this.lore = new Set(lore);
    this.boons = [];
    for (const id of boons) this.applyBoon(id);
    this.stats = { deaths: 0, time: 0, kills: 0 };
    this.events = [];
    this.hitLog = [];
    this.cheat = { invulnerable: false };
    this.enterAct(act);
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drain() { const e = this.events; this.events = []; return e; }

  enterAct(act) {
    this.act = act;
    this.map = makeMap(this.seed, act);
    this.rand = rng(mix(this.seed, act * 13 + 7));
    this.enemies = []; this.bullets = []; this.hazards = []; this.cinders = []; this.shots = []; this.fires = [];
    this.boss = null; this.bossDone = false; this.arena = null; this.eclipse = false;
    this.offer = null; this.afterBoon = null; this.loreOpen = null;
    this.t = 0; this.acc = 0; this.hitstop = 0; this.timeScale = 1; this.shake = 0;
    const s = this.map.start;
    s.visited = true;
    s.brazier.lit = true;
    this.checkpoint = s;
    const p = this.player;
    p.x = s.mx * T + T / 2; p.y = s.my * T + T / 2 + 56; p.face = -Math.PI / 2;
    p.ember = p.maxEmber; p.secondWindUsed = false; p.kx = p.ky = 0; p.dashT = 0;
    this.mode = 'play';
    this.emit('act', { act });
    this.emit('music', { mode: 'explore' });
  }

  /* ── time ── */

  step(dt, input = NO_INPUT) {
    if (PAUSED.has(this.mode)) return;
    const p = this.player;
    if (input.strike) p.buf.strike = 0.16;
    if (input.dash) p.buf.dash = 0.12;
    if (input.flare) p.buf.flare = 0.12;
    this.acc += Math.min(dt, 0.1) * this.timeScale;
    let n = 0;
    while (this.acc >= RULES.step && n++ < 20) {
      this.acc -= RULES.step;
      if (PAUSED.has(this.mode)) { this.acc = 0; break; }
      if (this.hitstop > 0) { this.hitstop -= RULES.step; continue; }
      this.tick(RULES.step, input);
    }
  }

  tick(h, input) {
    this.t += h;
    this.stats.time += h;
    this.shake = Math.max(0, this.shake - h * 30);
    const p = this.player;
    for (const k of ['strike', 'dash', 'flare']) if (p.buf[k] > 0) p.buf[k] -= h;
    if (this.mode === 'dead') {
      this.deadT -= h;
      if (this.deadT <= 0) this.respawn();
      return;
    }
    if (this.mode === 'intro') {
      this.introT -= h;
      this.updateBoss(h, true);
      if (this.introT <= 0) { this.mode = 'play'; this.emit('music', { mode: 'boss', act: this.act }); }
      return;
    }
    if (this.mode === 'down') {
      this.downT -= h;
      this.timeScale = this.downT > 1.6 ? 0.35 : 1;
      this.updateCinders(h);
      if (this.downT <= 0) this.finishBoss();
      return;
    }
    this.updatePlayer(h, input);
    this.updateRooms();
    this.updateEnemies(h);
    this.updateBoss(h, false);
    this.updateBullets(h);
    this.updateHazards(h);
    this.updateShots(h);
    this.updateCinders(h);
    this.updateArena(h);
    this.updatePickups();
  }

  /* ── tiles and movement ── */

  tileAt(px, py) {
    const x = Math.floor(px / T), y = Math.floor(py / T), m = this.map;
    return x < 0 || y < 0 || x >= m.W || y >= m.H ? TILE.VOID : m.tiles[y * m.W + x];
  }

  blocked(tx, ty) {
    const m = this.map;
    if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) return true;
    const i = ty * m.W + tx, t = m.tiles[i];
    if (opaque(t)) return true;
    if (t === TILE.DOOR) { const r = m.doorOf[i]; return r >= 0 && m.rooms[r].locked; }
    return false;
  }

  /** Move an entity as an axis-aligned box of half-size r; returns whether anything stopped it. */
  move(e, dx, dy) {
    let hit = false;
    const r = e.r;
    if (dx) {
      e.x += dx;
      const y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r - 0.01) / T);
      const tx = Math.floor((dx > 0 ? e.x + r - 0.01 : e.x - r) / T);
      for (let ty = y0; ty <= y1; ty++) {
        if (this.blocked(tx, ty)) { e.x = dx > 0 ? tx * T - r : (tx + 1) * T + r; hit = true; break; }
      }
    }
    if (dy) {
      e.y += dy;
      const x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r - 0.01) / T);
      const ty = Math.floor((dy > 0 ? e.y + r - 0.01 : e.y - r) / T);
      for (let tx = x0; tx <= x1; tx++) {
        if (this.blocked(tx, ty)) { e.y = dy > 0 ? ty * T - r : (ty + 1) * T + r; hit = true; break; }
      }
    }
    return hit;
  }

  free(x, y, r) {
    for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (this.blocked(Math.floor((x + dx) / T), Math.floor((y + dy) / T))) return false;
    return true;
  }

  roomAt(x, y) {
    const m = this.map;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) return null;
    const id = m.roomOf[ty * m.W + tx];
    return id >= 0 ? m.rooms[id] : null;
  }

  insideRoom(e, room) {
    return e.x - e.r >= room.x0 * T + 2 && e.x + e.r <= (room.x0 + room.w) * T - 2
      && e.y - e.r >= room.y0 * T + 2 && e.y + e.r <= (room.y0 + room.h) * T - 2;
  }

  /* ── the player ── */

  updatePlayer(h, input) {
    const p = this.player;
    p.dashCd -= h; p.strikeCd -= h; p.flareCd -= h; p.iframes -= h; p.comboT -= h; p.lag -= h;
    let mx = input.mx || 0, my = input.my || 0;
    const ml = hyp(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.moving = ml > 0.1;
    const water = this.tileAt(p.x, p.y) === TILE.WATER;

    if (p.dashT > 0) {
      p.dashT -= h;
      this.move(p, p.dashX * RULES.dashSpeed * h, p.dashY * RULES.dashSpeed * h);
      if (p.flags.has('tinder') && (p.trail -= RULES.dashSpeed * h) <= 0) {
        p.trail = 20;
        this.fires.push({ x: p.x, y: p.y, r: 16, t: 1.3, hit: new Set() });
      }
    } else {
      const sp = RULES.speed * (water ? RULES.waterSlow : 1) * (p.lag > 0 ? 0.45 : 1);
      this.move(p, (mx * sp + p.kx) * h, (my * sp + p.ky) * h);
    }
    const damp = Math.exp(-9 * h);
    p.kx *= damp; p.ky *= damp;

    if (input.ax || input.ay) p.face = Math.atan2(input.ay, input.ax);
    else {
      const t = this.nearestFoe(p.x, p.y, p.reach + 90);
      if (t) p.face = Math.atan2(t.y - p.y, t.x - p.x);
      else if (p.moving) p.face = Math.atan2(my, mx);
    }

    if (p.buf.dash > 0 && p.dashCd <= 0 && p.dashT <= 0) {
      p.buf.dash = 0;
      const dx = p.moving ? mx / Math.max(ml, 1e-6) * Math.min(1, ml) : Math.cos(p.face);
      const dy = p.moving ? my / Math.max(ml, 1e-6) * Math.min(1, ml) : Math.sin(p.face);
      const dl = hyp(dx, dy) || 1;
      p.dashX = dx / dl; p.dashY = dy / dl;
      p.dashT = RULES.dashTime; p.dashCd = RULES.dashCd;
      p.iframes = Math.max(p.iframes, RULES.dashIframes);
      p.trail = 0;
      this.emit('dash', { x: p.x, y: p.y, a: Math.atan2(p.dashY, p.dashX) });
    }
    if (p.buf.strike > 0 && p.strikeCd <= 0 && p.dashT <= 0) { p.buf.strike = 0; this.strike(); }
    if (p.buf.flare > 0 && p.flareCd <= 0 && p.ember > p.flareCost + 1) { p.buf.flare = 0; this.flare(); }
  }

  nearestFoe(x, y, within) {
    let best = null, bd = within;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const d = hyp(e.x - x, e.y - y) - e.r;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  strike() {
    const p = this.player;
    p.combo = p.comboT > 0 ? (p.combo % 3) + 1 : 1;
    p.comboT = RULES.comboWindow;
    p.strikeCd = (p.combo === 3 ? RULES.comboEndCd : RULES.strikeCd) * p.strikeCdMul;
    p.lag = 0.12;
    p.kx += Math.cos(p.face) * 70; p.ky += Math.sin(p.face) * 70;
    const blaze = p.flags.has('blaze') && p.ember > 70 ? 1.5 : 1;
    const dmg = RULES.strikeDmg[p.combo - 1] * p.dmgMul * blaze;
    const reach = p.reach * (p.combo === 3 ? 1.12 : 1);
    this.emit('swing', { x: p.x, y: p.y, a: p.face, combo: p.combo, reach });
    let hits = 0;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const d = hyp(e.x - p.x, e.y - p.y);
      if (d > reach + e.r) continue;
      if (d > e.r + 4 && Math.abs(angDiff(Math.atan2(e.y - p.y, e.x - p.x), p.face)) > RULES.arc / 2) continue;
      const nx = (e.x - p.x) / (d || 1), ny = (e.y - p.y) / (d || 1);
      if (this.hurtEnemy(e, dmg, nx, ny, p.combo === 3 ? 260 : 150, p.combo === 3)) hits++;
    }
    if (hits) this.hitstop = p.combo === 3 ? 0.075 : 0.04;
    if (p.combo === 3 && p.flags.has('wildfire')) {
      this.shots.push({ x: p.x + Math.cos(p.face) * 20, y: p.y + Math.sin(p.face) * 20, vx: Math.cos(p.face) * 330, vy: Math.sin(p.face) * 330, r: 16, dmg: 20 * p.dmgMul, t: 0.7, hit: new Set() });
    }
  }

  flare() {
    const p = this.player;
    p.ember -= p.flareCost;
    p.flareCd = RULES.flareCd;
    const R = p.flareR;
    this.emit('flare', { x: p.x, y: p.y, r: R });
    this.shake = Math.max(this.shake, 6);
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const d = hyp(e.x - p.x, e.y - p.y);
      if (d > R + e.r) continue;
      const nx = (e.x - p.x) / (d || 1), ny = (e.y - p.y) / (d || 1);
      this.hurtEnemy(e, RULES.flareDmg * p.dmgMul, nx, ny, 320, true);
      if (!e.boss) { e.stun = 1.2; e.atk = null; e.state = 'chase'; }
    }
    this.bullets = this.bullets.filter((b) => hyp(b.x - p.x, b.y - p.y) > R);
    for (const b of this.map.braziers) {
      if (!b.lit && !b.gone && hyp(b.x - p.x, b.y - p.y) < R * 0.75) {
        const room = this.map.rooms[b.room];
        if (room.kind === 'boss' || room.cleared) { b.lit = true; this.emit('brazier', { x: b.x, y: b.y }); }
      }
    }
  }

  hurtPlayer(dmg, src, nx = 0, ny = 0) {
    const p = this.player;
    if (this.mode !== 'play' || p.iframes > 0 || p.dashT > 0) return false;
    this.hitLog.push({ t: this.t, warned: src.liveAt - src.warnAt, by: src.by || 'unknown' });
    p.iframes = RULES.hurtIframes;
    p.kx += nx * 260; p.ky += ny * 260;
    this.hitstop = 0.07;
    this.shake = Math.max(this.shake, 9);
    if (this.cheat.invulnerable) return true;
    const d = dmg * (this.gentle ? 0.5 : 1);
    p.ember -= d;
    this.emit('hurt', { x: p.x, y: p.y, dmg: d });
    if (p.ember <= 0) {
      if (p.flags.has('secondwind') && !p.secondWindUsed) {
        p.secondWindUsed = true; p.ember = 30; p.iframes = 1.5;
        this.emit('secondwind', { x: p.x, y: p.y });
      } else this.die();
    }
    return true;
  }

  die() {
    const p = this.player;
    p.ember = 0;
    this.mode = 'dead';
    this.deadT = 2.4;
    this.stats.deaths++;
    this.emit('die', { x: p.x, y: p.y });
    this.emit('music', { mode: 'silence' });
  }

  respawn() {
    const m = this.map;
    for (const room of m.rooms) {
      if (room.active) { room.active = false; room.locked = false; room.wave = 0; }
    }
    this.enemies = []; this.bullets = []; this.hazards = []; this.fires = []; this.shots = [];
    this.boss = null; this.arena = null; this.eclipse = false;
    if (!this.bossDone) for (const b of m.boss.braziers) { b.lit = false; b.gone = false; }
    const c = this.checkpoint, p = this.player;
    const b = c.brazier ?? c.braziers[0];
    p.x = b.x; p.y = b.y + 44; p.kx = p.ky = 0; p.dashT = 0;
    p.ember = Math.max(p.maxEmber * 0.7, 60);
    p.iframes = 1.5;
    this.mode = 'play';
    this.emit('respawn', { x: p.x, y: p.y });
    this.emit('music', { mode: 'explore' });
  }

  /* ── rooms ── */

  updateRooms() {
    const p = this.player, m = this.map;
    const room = this.roomAt(p.x, p.y);
    if (!room) return;
    if (!room.visited) {
      room.visited = true;
      if (room.kind === 'shrine') { room.brazier.lit = true; this.checkpoint = room; this.emit('brazier', { x: room.brazier.x, y: room.brazier.y }); }
      this.emit('enter', { room: room.id, kind: room.kind });
    }
    if (!room.active && !room.cleared && this.insideRoom(p, room)) {
      if (room.kind === 'fight') {
        room.active = true; room.locked = true; room.wave = 0; room.waveT = 0.35;
        this.emit('lock', { room: room.id });
        this.emit('music', { mode: 'combat' });
      } else if (room.kind === 'boss' && !this.bossDone) {
        room.active = true; room.locked = true;
        this.startBoss(room);
      }
    }
    for (const r of m.rooms) {
      if (!r.active || r.kind !== 'fight') continue;
      if (r.waveT > 0) {
        r.waveT -= RULES.step;
        if (r.waveT <= 0) this.spawnWave(r, r.waves[r.wave]);
        continue;
      }
      if (this.enemies.some((e) => !e.dead)) continue;
      r.wave++;
      if (r.wave < r.waves.length) r.waveT = 0.7;
      else this.clearRoom(r);
    }
  }

  spawnWave(room, kinds) {
    const p = this.player;
    for (const kind of kinds) {
      let x = 0, y = 0;
      for (let tries = 0; tries < 60; tries++) {
        const tx = room.x0 + 1 + Math.floor(this.rand() * (room.w - 2)), ty = room.y0 + 1 + Math.floor(this.rand() * (room.h - 2));
        const t = this.map.tiles[ty * this.map.W + tx];
        if (t !== TILE.FLOOR && !(t === TILE.WATER && kind !== 'husk')) continue;
        x = tx * T + T / 2; y = ty * T + T / 2;
        if (hyp(x - p.x, y - p.y) > 130) break;
      }
      this.addEnemy(kind, x, y);
    }
    this.emit('wave', { room: room.id });
  }

  nearestFree(x, y, r) {
    if (this.free(x, y, r)) return { x, y };
    const home = this.roomAt(x, y);
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    for (let rad = 1; rad < 6; rad++) {
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const cx = (tx + dx) * T + T / 2, cy = (ty + dy) * T + T / 2;
        if (this.free(cx, cy, r) && (!home || this.roomAt(cx, cy) === home)) return { x: cx, y: cy };
      }
    }
    return { x, y };
  }

  addEnemy(kind, x, y, extra = {}) {
    const s = ENEMY[kind];
    ({ x, y } = this.nearestFree(x, y, s.r + 1));
    const e = {
      kind, x, y, r: s.r, hp: s.hp, maxHp: s.hp, speed: s.speed, cinders: s.cinders,
      kx: 0, ky: 0, face: 0, state: 'spawn', t: 0.8, stun: 0, stagger: 0, flash: 0, atk: null,
      cd: 0.8 + this.rand() * 1.4, weave: this.rand() * TAU, dead: false, stuck: 0, ...extra,
    };
    this.enemies.push(e);
    this.emit('spawn', { x, y, kind });
    return e;
  }

  clearRoom(room) {
    room.active = false; room.locked = false; room.cleared = true;
    this.checkpoint = room;
    if (room.brazier) {
      room.brazier.lit = true;
      this.emit('brazier', { x: room.brazier.x, y: room.brazier.y });
      for (let i = 0; i < 3; i++) this.dropCinder(room.brazier.x, room.brazier.y);
    }
    this.emit('clear', { room: room.id });
    this.emit('music', { mode: 'explore' });
  }

  /* ── enemies ── */

  hurtEnemy(e, dmg, nx, ny, kb, heavy) {
    if (e.dead || e.state === 'spawn') return false;
    if (e.invuln > 0) { this.emit('clang', { x: e.x, y: e.y }); return false; }
    const mul = e.boss ? this.bossDamageMul(e) : 1;
    const d = dmg * mul;
    e.hp -= d;
    e.flash = 0.1;
    if (!e.boss) {
      e.kx += nx * kb; e.ky += ny * kb;
      e.stagger = heavy ? 0.28 : 0.12;
      if (heavy || e.kind === 'mite') { e.atk = null; if (e.state !== 'spawn') { e.state = 'chase'; e.t = 0; } }
    }
    this.emit('hit', { x: e.x, y: e.y, dmg: d, kind: e.kind, boss: !!e.boss, heavy, weak: mul < 1, strong: mul > 1 });
    if (e.hp <= 0) this.killEnemy(e);
    return true;
  }

  killEnemy(e) {
    e.dead = true;
    e.hp = 0;
    this.stats.kills++;
    this.emit('kill', { x: e.x, y: e.y, kind: e.kind, boss: !!e.boss });
    if (e.kind === 'mask') {
      const left = this.boss.masks.filter((m) => !m.dead).length;
      if (left) { this.emit('grieve', { left }); this.emit('music', { mode: 'boss', act: 2, phase: 4 - left }); }
    }
    for (let i = 0; i < e.cinders; i++) this.dropCinder(e.x, e.y);
    this.hitstop = Math.max(this.hitstop, e.boss ? 0.12 : 0.06);
  }

  dropCinder(x, y) {
    const a = this.rand() * TAU, s = 60 + this.rand() * 90;
    this.cinders.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0 });
  }

  updateEnemies(h) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash -= h;
      if (e.invuln > 0) e.invuln -= h;
      if (e.boss) continue;
      if (e.state === 'spawn') { e.t -= h; if (e.t <= 0) { e.state = 'chase'; e.t = 0; } continue; }
      const damp = Math.exp(-10 * h);
      if (e.kx || e.ky) { this.move(e, e.kx * h, e.ky * h); e.kx *= damp; e.ky *= damp; if (Math.abs(e.kx) + Math.abs(e.ky) < 1) e.kx = e.ky = 0; }
      if (e.stun > 0) { e.stun -= h; continue; }
      if (e.stagger > 0) { e.stagger -= h; continue; }
      AI[e.kind](this, e, h, p);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead || a.boss) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead || b.boss) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy), min = a.r + b.r;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          this.move(a, (-dx / d) * push, (-dy / d) * push);
          this.move(b, (dx / d) * push, (dy / d) * push);
        }
      }
      const dx = a.x - p.x, dy = a.y - p.y, d = hyp(dx, dy), min = a.r + p.r;
      if (d > 0 && d < min && a.state !== 'spawn') this.move(a, (dx / d) * (min - d), (dy / d) * (min - d));
    }
    this.enemies = this.enemies.filter((e) => !e.dead || e.boss);
  }

  lineClear(x0, y0, x1, y1) {
    const d = hyp(x1 - x0, y1 - y0), n = Math.ceil(d / 8);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      if (this.blocked(Math.floor((x0 + (x1 - x0) * k) / T), Math.floor((y0 + (y1 - y0) * k) / T))) return false;
    }
    return true;
  }

  /** Distance in tiles from every reachable tile to the player, for walking round pillars. */
  flow() {
    const p = this.player, m = this.map, W = m.W;
    const key = Math.floor(p.y / T) * W + Math.floor(p.x / T);
    const F = this._flow;
    if (F && F.key === key && this.t - F.at < 0.5) return F.dist;
    const dist = F && F.dist.length === W * m.H ? F.dist.fill(-1) : new Int16Array(W * m.H).fill(-1);
    const q = [key];
    dist[key] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * W + nx;
        if (dist[n] >= 0 || this.blocked(nx, ny)) continue;
        dist[n] = dist[c] + 1;
        q.push(n);
      }
    }
    this._flow = { key, dist, at: this.t };
    return dist;
  }

  /** Where to head next to reach the player: straight at them if nothing is in the way, else round it. */
  towardPlayer(e) {
    const p = this.player;
    if (e.stuck < 0.2 && this.lineClear(e.x, e.y, p.x, p.y)) return null;
    const dist = this.flow(), W = this.map.W;
    const ex = Math.floor(e.x / T), ey = Math.floor(e.y / T);
    let best = dist[ey * W + ex], bx = -1, by = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (dx && dy && (this.blocked(ex + dx, ey) || this.blocked(ex, ey + dy))) continue;
      const d = dist[(ey + dy) * W + ex + dx];
      if (d >= 0 && (best < 0 || d < best)) { best = d; bx = ex + dx; by = ey + dy; }
    }
    return bx < 0 ? null : { x: bx * T + T / 2, y: by * T + T / 2 };
  }

  walk(e, tx, ty, speed, h, chase = false) {
    if (chase) { const step = this.towardPlayer(e); if (step) { tx = step.x; ty = step.y; } }
    const dx = tx - e.x, dy = ty - e.y, d = hyp(dx, dy);
    if (d < 1) return;
    const water = this.tileAt(e.x, e.y) === TILE.WATER && e.kind !== 'wraith' ? RULES.waterSlow : 1;
    let vx = (dx / d) * speed * water, vy = (dy / d) * speed * water;
    if (e.stuck > 0.25) { const s = e.weave > Math.PI ? 1 : -1; [vx, vy] = [vx * 0.3 - vy * s, vy * 0.3 + vx * s]; }
    const ox = e.x, oy = e.y;
    this.move(e, vx * h, vy * h);
    const moved = hyp(e.x - ox, e.y - oy);
    e.stuck = moved < speed * h * 0.3 ? e.stuck + h : Math.max(0, e.stuck - h * 2);
    if (e.stuck > 1.2) { e.stuck = 0; e.weave = this.rand() * TAU; }
    e.face = Math.atan2(dy, dx);
  }

  contact(e, h) {
    const a = e.atk, p = this.player;
    if (!a || a.hit || this.t < a.liveAt || this.t > a.endAt) return;
    if (hyp(e.x - p.x, e.y - p.y) < e.r + p.r + (a.pad ?? 2)) {
      a.hit = true;
      const d = hyp(p.x - e.x, p.y - e.y) || 1;
      this.hurtPlayer(a.dmg, a, (p.x - e.x) / d, (p.y - e.y) / d);
    }
  }

  /* ── hazards: every blow that can land is drawn on the floor first ── */

  hazard(o) {
    const warnAt = o.warnAt ?? this.t;
    const liveAt = o.liveAt ?? this.t + (o.warn ?? 0);
    const hz = { r: 0, a: 0, arc: 0, len: 0, w: 0, dmg: 0, dur: 0.12, ...o, warnAt, liveAt };
    hz.endAt = liveAt + hz.dur;
    this.hazards.push(hz);
    return hz;
  }

  inHazard(hz, x, y, pad) {
    switch (hz.shape) {
      case 'circle': return hyp(x - hz.x, y - hz.y) < hz.r + pad;
      case 'ring': { const d = hyp(x - hz.x, y - hz.y); return Math.abs(d - hz.cur) < hz.w / 2 + pad; }
      case 'arc': {
        const d = hyp(x - hz.x, y - hz.y);
        if (d > hz.r + pad) return false;
        return d < pad + 6 || Math.abs(angDiff(Math.atan2(y - hz.y, x - hz.x), hz.a)) < hz.arc / 2 + pad / Math.max(d, 1);
      }
      case 'line': case 'beam': {
        const dx = x - hz.x, dy = y - hz.y, c = Math.cos(hz.a), s = Math.sin(hz.a);
        const along = dx * c + dy * s, across = -dx * s + dy * c;
        return along > -pad && along < hz.len + pad && Math.abs(across) < hz.w / 2 + pad;
      }
      default: return false;
    }
  }

  updateHazards(h) {
    const p = this.player;
    for (const hz of this.hazards) {
      if (hz.anchor) { hz.x = hz.anchor.x; hz.y = hz.anchor.y; }
      if (hz.shape === 'ring') {
        hz.cur = Math.max(0, (this.t - hz.liveAt) * hz.speed);
        if (this.t >= hz.liveAt && hz.cur >= hz.maxR) hz.endAt = this.t;
      }
      if (hz.shape === 'beam' && this.t >= hz.liveAt) hz.a += hz.spin * h;
      if (!hz.dmg || this.t < hz.liveAt || this.t > hz.endAt) continue;
      if (hz.shape === 'beam' ? this.t < (hz.nextHit ?? 0) : hz.hit) continue;
      if (this.inHazard(hz, p.x, p.y, p.r)) {
        const d = hyp(p.x - hz.x, p.y - hz.y) || 1;
        if (this.hurtPlayer(hz.dmg, hz, (p.x - hz.x) / d, (p.y - hz.y) / d)) {
          hz.hit = true; hz.nextHit = this.t + 0.5;
        }
      }
    }
    if (this.hazards.length) this.hazards = this.hazards.filter((hz) => this.t <= (hz.shape === 'ring' ? hz.endAt : hz.endAt + 0.25));
  }

  bullet(x, y, a, speed, warnAt, o = {}) {
    this.bullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 7, dmg: 12, t: 4, warnAt, liveAt: this.t, by: 'bullet', ...o });
  }

  updateBullets(h) {
    const p = this.player;
    for (const b of this.bullets) {
      b.x += b.vx * h; b.y += b.vy * h; b.t -= h;
      const tx = Math.floor(b.x / T), ty = Math.floor(b.y / T);
      if (this.blocked(tx, ty)) { b.t = 0; this.emit('fizz', { x: b.x, y: b.y }); continue; }
      if (hyp(b.x - p.x, b.y - p.y) < b.r + p.r - 2) {
        const sp = hyp(b.vx, b.vy) || 1;
        if (this.hurtPlayer(b.dmg, b, b.vx / sp, b.vy / sp)) b.t = 0;
      }
    }
    if (this.bullets.length) this.bullets = this.bullets.filter((b) => b.t > 0);
  }

  updateShots(h) {
    for (const s of this.shots) {
      s.x += s.vx * h; s.y += s.vy * h; s.t -= h;
      if (this.blocked(Math.floor(s.x / T), Math.floor(s.y / T))) s.t = 0;
      for (const e of this.enemies) {
        if (e.dead || s.hit.has(e) || hyp(e.x - s.x, e.y - s.y) > s.r + e.r) continue;
        s.hit.add(e);
        const d = hyp(s.vx, s.vy) || 1;
        this.hurtEnemy(e, s.dmg, s.vx / d, s.vy / d, 180, false);
      }
    }
    this.shots = this.shots.filter((s) => s.t > 0);
    for (const f of this.fires) {
      f.t -= h;
      for (const e of this.enemies) {
        if (e.dead || f.hit.has(e) || hyp(e.x - f.x, e.y - f.y) > f.r + e.r) continue;
        f.hit.add(e);
        this.hurtEnemy(e, 10 * this.player.dmgMul, 0, 0, 0, false);
      }
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }

  updateCinders(h) {
    const p = this.player;
    for (const c of this.cinders) {
      c.t += h;
      const damp = Math.exp(-4 * h);
      c.vx *= damp; c.vy *= damp;
      const dx = p.x - c.x, dy = p.y - c.y, d = hyp(dx, dy);
      if (c.t > 0.35 && d < RULES.cinderPull) { c.vx += (dx / d) * 900 * h; c.vy += (dy / d) * 900 * h; }
      c.x += c.vx * h; c.y += c.vy * h;
      if (c.t > 0.35 && d < p.r + 8 && this.mode !== 'dead') {
        c.taken = true;
        p.ember = Math.min(p.maxEmber, p.ember + RULES.cinder * p.cinderMul);
        this.emit('cinder', { x: c.x, y: c.y });
      }
    }
    if (this.cinders.length) this.cinders = this.cinders.filter((c) => !c.taken && c.t < 30);
  }

  updatePickups() {
    const p = this.player, m = this.map;
    for (const s of m.stones) {
      if (this.lore.has(s.id) || hyp(s.x - p.x, s.y - p.y) > 24) continue;
      if (m.rooms[s.room].active) continue;
      this.lore.add(s.id);
      this.loreOpen = s.id;
      this.mode = 'lore';
      this.emit('lore', { id: s.id });
      return;
    }
    const sh = m.shrine;
    if (!sh.used && hyp(sh.altar.x - p.x, sh.altar.y - p.y) < 26) {
      sh.used = true;
      this.offerBoons(null);
      return;
    }
    if (m.exit && hyp(m.exit.x - p.x, m.exit.y - p.y) < 22) {
      m.exit = null;
      this.offerBoons('next');
    }
  }

  /* ── boons ── */

  offerBoons(after) {
    const left = BOONS.filter((b) => !this.boons.includes(b.id));
    const pick = [];
    while (pick.length < 3 && left.length) pick.push(left.splice(Math.floor(this.rand() * left.length), 1)[0]);
    this.offer = pick;
    this.afterBoon = after;
    this.mode = 'boon';
    this.emit('boon', { offer: pick.map((b) => b.id) });
  }

  chooseBoon(id) {
    if (this.mode !== 'boon' || !this.offer.some((b) => b.id === id)) return false;
    this.applyBoon(id);
    this.offer = null;
    this.emit('boonTaken', { id });
    if (this.afterBoon === 'next') this.enterAct(this.act + 1);
    else this.mode = 'play';
    return true;
  }

  applyBoon(id) {
    const p = this.player;
    this.boons.push(id);
    switch (id) {
      case 'kindling': p.maxEmber += 25; p.ember += 25; break;
      case 'longblade': p.reach *= 4 / 3; break;
      case 'ashheart': p.cinderMul *= 1.5; break;
      case 'bright': p.flareR *= 1.4; p.flareCost = 10; break;
      case 'quick': p.strikeCdMul *= 0.8; break;
      default: p.flags.add(id);
    }
  }

  closeLore() {
    if (this.mode !== 'lore') return;
    this.loreOpen = null;
    this.mode = 'play';
  }

  /* ── bosses ── */

  startBoss(room) {
    const cx = room.mx * T + T / 2, cy = room.my * T + T / 2;
    const B = { act: this.act, room, cx, cy, phase: 1, wait: 0, last: null, rep: 0, done: false, drops: 0 };
    if (this.act === 1) {
      B.body = this.addBoss('warden', cx, cy - 60, 30, 1100);
      B.brain = wardenBrain(this, B);
    } else if (this.act === 2) {
      B.masks = [0, 1, 2].map((i) => this.addBoss('mask', cx, cy, 20, 380, { slot: i }));
      B.orbitA = -Math.PI / 2;
      B.brain = choirBrain(this, B);
    } else {
      B.body = this.addBoss('king', cx, cy - 70, 26, 1800);
      B.brain = kingBrain(this, B);
    }
    B.parts = B.body ? [B.body] : B.masks;
    B.maxHp = B.parts.reduce((s, e) => s + e.maxHp, 0);
    this.boss = B;
    for (const b of room.braziers) { b.lit = true; b.gone = false; }
    this.mode = 'intro';
    this.introT = 2.8;
    this.emit('bossIntro', { act: this.act, ...BOSSES[this.act] });
    this.emit('music', { mode: 'silence' });
  }

  addBoss(kind, x, y, r, hp, extra = {}) {
    const e = { kind, x, y, r, hp, maxHp: hp, boss: true, face: Math.PI / 2, flash: 0, invuln: 0, atk: null, motion: null, pose: 'idle', glow: null, dead: false, state: 'boss', ...extra };
    this.enemies.push(e);
    return e;
  }

  bossHp() {
    const B = this.boss;
    return B ? B.parts.reduce((s, e) => s + Math.max(0, e.hp), 0) : 0;
  }

  bossDamageMul(e) {
    const B = this.boss;
    if (!B) return 1;
    let m = 1;
    if (e.dazed > 0) m *= 1.5;
    if (e.exposed > 0) m *= 2;
    if (e.kind === 'king' && B.phase >= 2 && !this.inBrazierLight(e.x, e.y)) m *= 0.5;
    return m;
  }

  inBrazierLight(x, y) {
    const room = this.boss?.room;
    if (!room) return false;
    return room.braziers.some((b) => b.lit && hyp(b.x - x, b.y - y) < 210);
  }

  updateBoss(h, frozen) {
    const B = this.boss;
    if (!B || B.done) return;
    const p = this.player;
    for (const e of B.parts) {
      if (e.dead) continue;
      if (e.dazed > 0) e.dazed -= h;
      if (e.exposed > 0) e.exposed -= h;
      if (e.glow && this.t > e.glow.until) e.glow = null;
    }
    if (B.masks) this.orbitMasks(B, h);
    if (frozen) return;
    for (const e of B.parts) {
      if (e.dead) continue;
      if (B.masks) { this.contact(e, h); continue; }
      const mo = e.motion;
      if (mo?.type === 'chase') {
        const d = hyp(p.x - e.x, p.y - e.y);
        if (d > e.r + p.r + 20) this.walkBoss(e, p.x, p.y, mo.speed, h);
        e.face = Math.atan2(p.y - e.y, p.x - e.x);
      } else if (mo?.type === 'dash') {
        mo.t -= h;
        const hit = this.move(e, mo.vx * h, mo.vy * h);
        if (hit) { e.motion = null; e.hitWall = true; }
        else if (mo.t <= 0) e.motion = null;
      }
      this.contact(e, h);
      const dx = p.x - e.x, dy = p.y - e.y, d = hyp(dx, dy), min = e.r + p.r;
      if (d > 0 && d < min && !e.float) this.move(p, (dx / d) * (min - d), (dy / d) * (min - d));
    }
    if (B.wait > 0) B.wait -= h;
    for (let guard = 0; B.wait <= 0 && guard < 50; guard++) {
      const r = B.brain.next();
      if (r.done) break;
      B.wait += r.value;
    }
    if (B.parts.every((e) => e.dead)) this.bossDown();
  }

  walkBoss(e, tx, ty, speed, h) {
    const dx = tx - e.x, dy = ty - e.y, d = hyp(dx, dy) || 1;
    this.move(e, (dx / d) * speed * h, (dy / d) * speed * h);
  }

  orbitMasks(B, h) {
    B.orbitA += h * 0.45;
    const alive = B.masks.filter((m) => !m.dead);
    alive.forEach((m, i) => {
      if (m.motion?.type === 'dash') {
        m.motion.t -= h;
        if (this.move(m, m.motion.vx * h, m.motion.vy * h) || m.motion.t <= 0) m.motion = null;
        this.contact(m, h);
        return;
      }
      if (m.hold) return;
      const a = B.orbitA + (i * TAU) / alive.length;
      const tx = B.cx + Math.cos(a) * 165, ty = B.cy + Math.sin(a) * 120;
      const k = 1 - Math.exp(-3 * h);
      m.x += (tx - m.x) * k; m.y += (ty - m.y) * k;
      m.face = Math.atan2(this.player.y - m.y, this.player.x - m.x);
    });
  }

  dropBossCinders(B) {
    const lost = 1 - this.bossHp() / B.maxHp;
    while (B.drops < Math.floor(lost * 10)) {
      B.drops++;
      const src = B.parts.find((e) => !e.dead) ?? B.parts[0];
      this.dropCinder(src.x, src.y); this.dropCinder(src.x, src.y);
    }
  }

  bossDown() {
    const B = this.boss;
    B.done = true;
    this.bossDone = true;
    this.hazards = []; this.bullets = []; this.arena = null;
    for (const e of this.enemies) if (!e.boss && !e.dead) this.killEnemy(e);
    const last = B.parts[B.parts.length - 1];
    for (let i = 0; i < 12; i++) this.dropCinder(last.x, last.y);
    this.mode = 'down';
    this.downT = 2.6;
    this.shake = 16;
    this.emit('bossDown', { act: this.act, x: last.x, y: last.y });
    this.emit('music', { mode: 'silence' });
  }

  finishBoss() {
    this.timeScale = 1;
    const B = this.boss, room = B.room;
    room.active = false; room.locked = false; room.cleared = true;
    for (const b of room.braziers) { b.lit = true; b.gone = false; }
    this.checkpoint = room;
    this.enemies = [];
    this.eclipse = false;
    if (this.act < 3) {
      this.map.exit = { x: B.cx, y: B.cy };
      this.mode = 'play';
      this.emit('exit', { x: B.cx, y: B.cy });
      this.emit('music', { mode: 'calm' });
    } else {
      this.mode = 'ending';
      this.emit('ending', {});
      this.emit('music', { mode: 'ending' });
    }
  }

  updateArena(h) {
    const A = this.arena;
    if (!A) return;
    const k = clamp((this.t - A.start) / A.dur, 0, 1);
    A.r = A.r0 + (A.r1 - A.r0) * (k * k * (3 - 2 * k));
    const p = this.player;
    for (const b of this.boss?.room.braziers ?? []) if (hyp(b.x - A.x, b.y - A.y) > A.r) { b.lit = false; b.gone = true; }
    if (hyp(p.x - A.x, p.y - A.y) > A.r - p.r && this.mode === 'play') {
      A.outside = (A.outside ?? 0) + h;
      if (!this.cheat.invulnerable) p.ember -= 14 * h * (this.gentle ? 0.5 : 1);
      if (p.ember <= 0) this.die();
    } else A.outside = 0;
  }
}

/* ── enemy behaviour ─────────────────────────────────────────────────────── */

const AI = {
  mite(g, e, h, p) {
    const d = hyp(p.x - e.x, p.y - e.y);
    if (e.state === 'chase') {
      e.weave += h * 5;
      const step = g.towardPlayer(e);
      const a = step ? Math.atan2(step.y - e.y, step.x - e.x) : Math.atan2(p.y - e.y, p.x - e.x);
      const side = step ? 0 : Math.sin(e.weave) * 0.6;
      g.walk(e, e.x + Math.cos(a + side) * 40, e.y + Math.sin(a + side) * 40, e.speed, h);
      e.cd -= h;
      if (d < 64 && e.cd < 0) {
        e.state = 'crouch'; e.t = 0.38; e.lock = a;
        e.atk = { warnAt: g.t, liveAt: g.t + 0.38, endAt: g.t + 0.38 + 0.24, dmg: 8, by: 'mite' };
      }
    } else if (e.state === 'crouch') {
      if ((e.t -= h) <= 0) { e.state = 'leap'; e.t = 0.24; }
    } else if (e.state === 'leap') {
      g.move(e, Math.cos(e.lock) * 280 * h, Math.sin(e.lock) * 280 * h);
      g.contact(e, h);
      if ((e.t -= h) <= 0) { e.state = 'recover'; e.t = 0.5; e.atk = null; }
    } else if (e.state === 'recover') {
      if ((e.t -= h) <= 0) { e.state = 'chase'; e.cd = 0.3 + g.rand() * 0.6; }
    }
  },

  husk(g, e, h, p) {
    const d = hyp(p.x - e.x, p.y - e.y);
    if (e.state === 'chase') {
      g.walk(e, p.x, p.y, e.speed, h, true);
      e.cd -= h;
      if (d < 130 && e.cd < 0 && g.lineClear(e.x, e.y, p.x, p.y)) {
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        e.state = 'windup'; e.t = 0.6; e.lock = a; e.face = a;
        e.atk = { warnAt: g.t, liveAt: g.t + 0.6, endAt: g.t + 0.6 + 0.32, dmg: 18, by: 'husk', pad: 4 };
        e.tele = g.hazard({ shape: 'line', x: e.x, y: e.y, a, len: 120, w: 30, warn: 0.6, dur: 0.32, anchor: e });
      }
    } else if (e.state === 'windup') {
      if ((e.t -= h) <= 0) { e.state = 'lunge'; e.t = 0.32; g.emit('lunge', { x: e.x, y: e.y }); }
    } else if (e.state === 'lunge') {
      g.move(e, Math.cos(e.lock) * 330 * h, Math.sin(e.lock) * 330 * h);
      g.contact(e, h);
      if ((e.t -= h) <= 0) { e.state = 'recover'; e.t = 0.9; e.atk = null; }
    } else if (e.state === 'recover') {
      if ((e.t -= h) <= 0) { e.state = 'chase'; e.cd = 0.4 + g.rand(); }
    }
    if (e.state !== 'windup' && e.state !== 'lunge' && e.tele) { e.tele.endAt = g.t; e.tele = null; }
  },

  wraith(g, e, h, p) {
    const d = hyp(p.x - e.x, p.y - e.y);
    if (e.state === 'chase') {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.weave += h * 0.8;
      let tx = e.x, ty = e.y;
      if (d < 170) { tx = e.x - Math.cos(a) * 60; ty = e.y - Math.sin(a) * 60; }
      else if (d > 260 || !g.lineClear(e.x, e.y, p.x, p.y)) { const step = g.towardPlayer(e); tx = step?.x ?? p.x; ty = step?.y ?? p.y; }
      else { tx = e.x + Math.cos(a + Math.PI / 2) * 60 * Math.sign(Math.sin(e.weave)); ty = e.y + Math.sin(a + Math.PI / 2) * 60 * Math.sign(Math.sin(e.weave)); }
      g.walk(e, tx, ty, e.speed, h);
      e.face = a;
      if ((e.cd -= h) < 0 && d < 420) { e.state = 'cast'; e.t = 0.65; e.warnAt = g.t; }
    } else if (e.state === 'cast') {
      e.face = Math.atan2(p.y - e.y, p.x - e.x);
      if ((e.t -= h) <= 0) {
        const spread = g.act === 3 ? [-0.28, 0, 0.28] : [0];
        for (const s of spread) g.bullet(e.x, e.y, e.face + s, 165, e.warnAt, { by: 'wraith' });
        g.emit('shoot', { x: e.x, y: e.y });
        e.state = 'chase'; e.cd = 2.2 + g.rand() * 1.2;
      }
    }
  },

  shade(g, e, h, p) {
    if (e.state === 'chase') {
      g.walk(e, p.x, p.y, e.speed, h, true);
      if ((e.cd -= h) < 0) {
        let tx = p.x, ty = p.y;
        for (let i = 0; i < 12; i++) {
          const a = p.face + Math.PI + (g.rand() - 0.5) * 2.4;
          tx = p.x + Math.cos(a) * 56; ty = p.y + Math.sin(a) * 56;
          if (g.free(tx, ty, e.r + 1) && g.roomAt(tx, ty) === g.roomAt(e.x, e.y)) break;
          tx = e.x; ty = e.y;
        }
        e.state = 'fade'; e.t = 0.55; e.to = { x: tx, y: ty };
        g.hazard({ shape: 'circle', x: tx, y: ty, r: 16, warn: 0.55, dur: 0 });
      }
    } else if (e.state === 'fade') {
      if ((e.t -= h) <= 0) {
        e.x = e.to.x; e.y = e.to.y; e.to = null;
        g.emit('blink', { x: e.x, y: e.y });
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        e.face = a; e.state = 'slash'; e.t = 0.4;
        g.hazard({ shape: 'arc', x: e.x, y: e.y, r: 58, a, arc: 1.9, warn: 0.4, dmg: 16, by: 'shade' });
      }
    } else if (e.state === 'slash') {
      if ((e.t -= h) <= 0) { e.state = 'recover'; e.t = 0.6; g.emit('slash', { x: e.x, y: e.y, a: e.face }); }
    } else if (e.state === 'recover') {
      if ((e.t -= h) <= 0) { e.state = 'chase'; e.cd = 2.6 + g.rand() * 1.4; }
    }
  },
};

/* ── the bosses, as scripts that yield how long to wait ──────────────────── */

const toward = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

function* wardenBrain(g, B) {
  const b = B.body, p = g.player;
  yield 0.5;
  for (;;) {
    b.dazed = 0;
    if (B.phase === 1 && b.hp < b.maxHp * 0.5) {
      B.phase = 2;
      b.invuln = 1.7; b.motion = null; b.pose = 'roar';
      g.emit('roar', { x: b.x, y: b.y, phase: 2 });
      g.emit('music', { mode: 'boss', act: 1, phase: 2 });
      g.shake = 14;
      const d = hyp(p.x - b.x, p.y - b.y) || 1;
      p.kx += ((p.x - b.x) / d) * 420; p.ky += ((p.y - b.y) / d) * 420;
      for (let i = 0; i < 4; i++) g.addEnemy('mite', b.x + Math.cos(i * 1.57) * 70, b.y + Math.sin(i * 1.57) * 70);
      yield 1.7;
      b.pose = 'idle';
    }
    const tempo = B.phase === 2 ? 0.8 : 1;
    const d = hyp(p.x - b.x, p.y - b.y), r = g.rand();
    let pick = d > 240 ? (r < 0.6 ? 'charge' : 'walk') : d < 140 ? (r < 0.5 ? 'sweep' : r < 0.85 ? 'slam' : 'charge') : (r < 0.45 ? 'slam' : r < 0.72 ? 'charge' : 'sweep');
    if (pick === B.last && ++B.rep >= 2) { pick = pick === 'slam' ? 'sweep' : 'slam'; B.rep = 0; }
    if (pick !== B.last) B.rep = 0;
    B.last = pick;

    if (pick === 'walk') {
      b.motion = { type: 'chase', speed: 78 };
      yield 1.0;
      b.motion = null;
    } else if (pick === 'slam') {
      const tx = clamp(p.x + p.kx * 0.1, B.room.x0 * T + 40, (B.room.x0 + B.room.w) * T - 40);
      const ty = clamp(p.y + p.ky * 0.1, B.room.y0 * T + 40, (B.room.y0 + B.room.h) * T - 40);
      const warn = 0.85 * tempo;
      b.face = Math.atan2(ty - b.y, tx - b.x); b.pose = 'raise';
      const hz = g.hazard({ shape: 'circle', x: tx, y: ty, r: 86, warn, dmg: 24, by: 'slam' });
      yield warn;
      b.pose = 'slam';
      g.shake = 12;
      g.emit('slam', { x: tx, y: ty });
      g.hazard({ shape: 'ring', x: tx, y: ty, speed: 250, w: 16, maxR: 320, warnAt: hz.warnAt, dmg: 14, dur: 9, by: 'shockwave' });
      if (B.phase === 2) {
        g.hazard({ shape: 'ring', x: tx, y: ty, speed: 250, w: 16, maxR: 320, warnAt: hz.warnAt, liveAt: g.t + 0.4, dmg: 14, dur: 9, by: 'shockwave' });
        if (g.enemies.filter((e) => e.kind === 'mite' && !e.dead).length < 5) g.addEnemy('mite', tx, ty);
      }
      yield 0.6;
      b.pose = 'idle';
    } else if (pick === 'sweep') {
      const a = toward(b, p), warn = 0.8 * tempo;
      b.face = a; b.pose = 'wind';
      g.hazard({ shape: 'arc', x: b.x, y: b.y, r: 150, a, arc: 3.3, warn, dmg: 20, by: 'sweep' });
      yield warn;
      b.pose = 'sweep';
      g.emit('sweep', { x: b.x, y: b.y, a });
      yield 0.45;
      b.pose = 'idle';
    } else {
      const a = toward(b, p), warn = 0.75 * tempo;
      b.face = a; b.pose = 'crouch';
      const tele = g.hazard({ shape: 'line', x: b.x, y: b.y, a, len: 900, w: 64, warn, dur: 0 });
      yield warn;
      b.pose = 'charge';
      b.hitWall = false;
      b.atk = { warnAt: tele.warnAt, liveAt: g.t, endAt: g.t + 1.4, dmg: 22, by: 'charge', pad: 6 };
      b.motion = { type: 'dash', vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, t: 1.4 };
      g.emit('charge', { x: b.x, y: b.y, a });
      while (b.motion) yield 0.02;
      b.atk = null;
      if (b.hitWall) {
        b.pose = 'dazed'; b.dazed = 1.8;
        g.shake = 16;
        g.emit('crash', { x: b.x, y: b.y });
        if (B.phase === 2) {
          for (let i = 0; i < 3; i++) {
            const ang = g.rand() * TAU, rr = 40 + g.rand() * 120;
            g.hazard({ shape: 'circle', x: p.x + Math.cos(ang) * rr, y: p.y + Math.sin(ang) * rr, r: 40, warn: 0.9 + i * 0.15, dmg: 14, by: 'debris' });
          }
        }
        yield 1.8;
      } else yield 0.3;
      b.pose = 'idle';
    }
    g.dropBossCinders(B);
    yield 0.4 * tempo;
  }
}

function* choirBrain(g, B) {
  const p = g.player;
  yield 0.6;
  for (;;) {
    const alive = B.masks.filter((m) => !m.dead);
    if (!alive.length) return;
    const tempo = [1, 0.7, 0.85, 1][alive.length];
    const r = g.rand();
    let pick = r < 0.38 ? 'hymn' : r < 0.66 ? 'chorus' : 'dive';
    if (alive.length === 1 && g.rand() < 0.45) pick = 'requiem';
    if (pick === B.last) pick = pick === 'hymn' ? 'dive' : 'hymn';
    B.last = pick;

    if (pick === 'hymn') {
      for (const m of alive) {
        if (m.dead) continue;
        const warn = 0.7 * tempo, warnAt = g.t;
        m.glow = { until: g.t + warn, warnAt };
        yield warn;
        if (m.dead) continue;
        const n = 14, gap = Math.floor(g.rand() * n), base = g.rand() * TAU;
        for (let i = 0; i < n; i++) {
          if ((i - gap + n) % n < 3) continue;
          g.bullet(m.x, m.y, base + (i * TAU) / n, 120, warnAt, { by: 'hymn' });
        }
        g.emit('sing', { x: m.x, y: m.y });
        yield 0.3 * tempo;
      }
    } else if (pick === 'chorus') {
      const warn = 1.0 * tempo;
      alive.forEach((m, i) => {
        m.hold = true;
        const a = toward(m, p) + (i - (alive.length - 1) / 2) * 0.35;
        g.hazard({ shape: 'beam', x: m.x, y: m.y, a, len: 640, w: 16, warn, dur: 1.5, spin: (i % 2 ? 1 : -1) * 0.55, dmg: 14, anchor: m, by: 'beam' });
      });
      g.emit('chorus', {});
      yield warn + 1.5;
      for (const m of alive) m.hold = false;
    } else if (pick === 'dive') {
      const m = alive.reduce((a, c) => (hyp(c.x - p.x, c.y - p.y) < hyp(a.x - p.x, a.y - p.y) ? c : a));
      const a = toward(m, p), warn = 0.7 * tempo;
      m.hold = true;
      const tele = g.hazard({ shape: 'line', x: m.x, y: m.y, a, len: 520, w: 44, warn, dur: 0 });
      yield warn;
      if (!m.dead) {
        m.atk = { warnAt: tele.warnAt, liveAt: g.t, endAt: g.t + 1.0, dmg: 16, by: 'dive', pad: 4 };
        m.motion = { type: 'dash', vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, t: 1.0 };
        g.emit('dive', { x: m.x, y: m.y });
        while (m.motion && !m.dead) yield 0.02;
        m.atk = null;
      }
      yield 0.5;
      m.hold = false;
    } else {
      const m = alive[0], warn = 0.9, warnAt = g.t;
      m.glow = { until: g.t + warn, warnAt };
      m.hold = true;
      yield warn;
      let th = g.rand() * TAU;
      for (let k = 0; k < 34 && !m.dead; k++) {
        g.bullet(m.x, m.y, th, 115, warnAt, { by: 'requiem' });
        g.bullet(m.x, m.y, th + Math.PI, 115, warnAt, { by: 'requiem' });
        th += 0.23;
        yield 0.09;
      }
      m.hold = false;
    }
    g.dropBossCinders(B);
    yield 0.55 * tempo;
  }
}

function* kingBrain(g, B) {
  const b = B.body, p = g.player;
  yield 0.6;
  for (;;) {
    const f = b.hp / b.maxHp;
    if (B.phase === 1 && f < 0.66) {
      b.invuln = 2.4; b.motion = null; b.pose = 'raise';
      g.eclipse = true;
      for (const br of B.room.braziers) br.lit = false;
      g.emit('eclipse', {});
      g.emit('music', { mode: 'boss', act: 3, phase: 2 });
      yield 2.4;
      B.phase = 2; b.pose = 'idle';
    }
    if (B.phase === 2 && f < 0.33) {
      b.invuln = 2.2; b.motion = null; b.pose = 'raise';
      const R0 = hyp(B.room.w, B.room.h) * T * 0.5;
      g.arena = { x: B.cx, y: B.cy, r0: R0, r1: 235, r: R0, start: g.t, dur: 6 };
      g.emit('lastlight', {});
      g.emit('music', { mode: 'boss', act: 3, phase: 3 });
      yield 2.2;
      B.phase = 3; b.pose = 'idle';
    }
    const tempo = [1, 1, 0.92, 0.82][B.phase];
    const r = g.rand();
    const shades = g.enemies.filter((e) => e.kind === 'shade' && !e.dead).length;
    let pick;
    if (B.phase === 1) pick = r < 0.4 ? 'combo' : r < 0.7 ? 'spikes' : r < 0.85 && shades < 2 ? 'summon' : 'approach';
    else if (B.phase === 2) {
      const lit = B.room.braziers.filter((x) => x.lit).length;
      pick = r < 0.26 ? 'spiral' : r < 0.5 ? 'grasp' : r < 0.74 ? 'blink' : r < 0.9 && lit ? 'snuff' : 'approach';
    } else pick = r < 0.5 ? 'dashslash' : r < 0.72 ? 'spiral' : 'grasp';
    if (pick === B.last && pick !== 'dashslash') pick = B.phase === 1 ? 'combo' : 'blink';
    if (pick === B.last && pick === 'combo') pick = 'spikes';
    B.last = pick;

    if (pick === 'approach') {
      b.motion = { type: 'chase', speed: 95 };
      yield 0.9;
      b.motion = null;
    } else if (pick === 'combo') {
      for (const w of [0.55, 0.42, 0.6]) {
        const a = toward(b, p);
        b.face = a; b.pose = 'wind';
        const d = hyp(p.x - b.x, p.y - b.y);
        if (d > 70) g.move(b, Math.cos(a) * Math.min(40, d - 60), Math.sin(a) * Math.min(40, d - 60));
        g.hazard({ shape: 'arc', x: b.x, y: b.y, r: 108, a, arc: 2.3, warn: w * tempo, dmg: 16, by: 'kingslash' });
        yield w * tempo;
        b.pose = 'slash';
        g.emit('slash', { x: b.x, y: b.y, a, big: true });
        yield 0.14;
      }
      b.pose = 'idle';
    } else if (pick === 'spikes') {
      const a = toward(b, p);
      b.pose = 'raise';
      for (let i = 0; i < 8; i++) {
        g.hazard({ shape: 'circle', x: b.x + Math.cos(a) * (50 + i * 46), y: b.y + Math.sin(a) * (50 + i * 46), r: 30, warn: (0.55 + i * 0.07) * tempo, dmg: 15, by: 'spikes' });
      }
      g.emit('spikes', { x: b.x, y: b.y, a });
      yield 1.2;
      b.pose = 'idle';
    } else if (pick === 'summon') {
      b.pose = 'raise';
      g.emit('summon', { x: b.x, y: b.y });
      for (let i = 0; i < 2; i++) {
        const a = g.rand() * TAU;
        g.addEnemy('shade', B.cx + Math.cos(a) * 160, B.cy + Math.sin(a) * 110);
      }
      yield 0.9;
      b.pose = 'idle';
    } else if (pick === 'spiral') {
      const warnAt = g.t, warn = 0.9 * tempo;
      b.glow = { until: g.t + warn, warnAt };
      b.pose = 'raise';
      g.hazard({ shape: 'circle', x: b.x, y: b.y, r: 36, warn, dur: 0 });
      yield warn;
      let th = g.rand() * TAU;
      const n = B.phase === 3 ? 22 : 30;
      for (let k = 0; k < n; k++) {
        for (let arm = 0; arm < 3; arm++) g.bullet(b.x, b.y, th + (arm * TAU) / 3, 125, warnAt, { by: 'spiral' });
        th += 0.19;
        yield 0.1;
      }
      b.pose = 'idle';
    } else if (pick === 'grasp') {
      for (let i = 0; i < 3; i++) {
        g.hazard({ shape: 'circle', x: p.x + p.kx * 0.05, y: p.y + p.ky * 0.05, r: 52, warn: 0.85 * tempo, dmg: 18, by: 'grasp' });
        g.emit('grasp', { x: p.x, y: p.y });
        yield 0.45 * tempo;
      }
      yield 0.6;
    } else if (pick === 'blink') {
      let tx = b.x, ty = b.y;
      for (let i = 0; i < 16; i++) {
        const a = g.rand() * TAU, x = p.x + Math.cos(a) * 80, y = p.y + Math.sin(a) * 80;
        if (g.roomAt(x, y) === B.room && g.free(x, y, b.r + 1)) { tx = x; ty = y; break; }
      }
      g.hazard({ shape: 'circle', x: tx, y: ty, r: 28, warn: 0.6, dur: 0 });
      yield 0.6;
      b.x = tx; b.y = ty;
      g.emit('blink', { x: tx, y: ty, big: true });
      const a = toward(b, p);
      b.face = a; b.pose = 'wind';
      g.hazard({ shape: 'arc', x: b.x, y: b.y, r: 112, a, arc: 2.2, warn: 0.45 * tempo, dmg: 18, by: 'blinkslash' });
      yield 0.45 * tempo;
      b.pose = 'slash';
      g.emit('slash', { x: b.x, y: b.y, a, big: true });
      yield 0.35;
      b.pose = 'idle';
    } else if (pick === 'snuff') {
      const lit = B.room.braziers.filter((x) => x.lit);
      const br = lit[Math.floor(g.rand() * lit.length)];
      b.pose = 'raise';
      g.hazard({ shape: 'circle', x: br.x, y: br.y, r: 40, warn: 1.2, dur: 0, snuff: true });
      yield 1.2;
      br.lit = false;
      g.emit('snuff', { x: br.x, y: br.y });
      b.pose = 'idle';
      yield 0.3;
    } else {
      const a = toward(b, p), warn = 0.55 * tempo;
      b.face = a; b.pose = 'crouch';
      const tele = g.hazard({ shape: 'line', x: b.x, y: b.y, a, len: 520, w: 50, warn, dur: 0 });
      yield warn;
      b.pose = 'charge';
      b.atk = { warnAt: tele.warnAt, liveAt: g.t, endAt: g.t + 0.6, dmg: 18, by: 'kingdash', pad: 6 };
      b.motion = { type: 'dash', vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, t: 0.6 };
      while (b.motion) yield 0.02;
      b.atk = null;
      const a2 = toward(b, p);
      b.face = a2; b.pose = 'wind';
      g.hazard({ shape: 'arc', x: b.x, y: b.y, r: 108, a: a2, arc: 2.2, warn: 0.38, dmg: 16, by: 'kingslash' });
      yield 0.38;
      b.pose = 'slash';
      g.emit('slash', { x: b.x, y: b.y, a: a2, big: true });
      yield 0.12;
      b.exposed = 1.3; b.pose = 'exposed';
      g.emit('exposed', { x: b.x, y: b.y });
      yield 1.3;
      b.pose = 'idle';
    }
    g.dropBossCinders(B);
    yield 0.45 * tempo;
  }
}

/* ── a player that plays itself, for the front page and the tests ───────── */

export function autopilot(g, mem = {}) {
  const input = { mx: 0, my: 0, ax: 0, ay: 0, strike: false, dash: false, flare: false };
  if (g.mode === 'boon') { g.chooseBoon(g.offer[0].id); return input; }
  if (g.mode === 'lore') { g.closeLore(); return input; }
  if (g.mode !== 'play') return input;
  const p = g.player;

  let ex = 0, ey = 0, urgent = false;
  for (const hz of g.hazards) {
    if (g.t > hz.endAt || hz.snuff || g.t - hz.warnAt < (mem.react ?? 0)) continue;
    const soon = hz.liveAt - g.t;
    if (soon > 0.9) continue;
    const test = hz.shape === 'ring' ? { ...hz, cur: Math.max(0, (g.t - hz.liveAt) * hz.speed) } : hz;
    if (hz.shape === 'ring' && g.t < hz.liveAt) continue;
    if (!g.inHazard(test, p.x, p.y, p.r + 10)) continue;
    let dx, dy;
    if (hz.shape === 'line' || hz.shape === 'beam') {
      const c = Math.cos(hz.a), s = Math.sin(hz.a);
      const across = -(p.x - hz.x) * s + (p.y - hz.y) * c;
      const sg = across >= 0 ? 1 : -1;
      dx = -s * sg; dy = c * sg;
    } else if (hz.shape === 'ring') {
      dx = hz.x - p.x; dy = hz.y - p.y;
    } else { dx = p.x - hz.x; dy = p.y - hz.y; }
    const d = hyp(dx, dy) || 1;
    ex += dx / d; ey += dy / d;
    if (soon < 0.14) urgent = true;
  }
  for (const b of g.bullets) {
    const dx = p.x - b.x, dy = p.y - b.y, d = hyp(dx, dy);
    if (d > (mem.react ? 60 : 90)) continue;
    const sp = hyp(b.vx, b.vy) || 1;
    if ((b.vx * dx + b.vy * dy) / sp < d * 0.7) continue;
    const side = (-b.vy * dx + b.vx * dy) >= 0 ? 1 : -1;
    ex += (-b.vy / sp) * side; ey += (b.vx / sp) * side;
    if (d < 40) urgent = true;
  }
  if (g.arena && hyp(p.x - g.arena.x, p.y - g.arena.y) > g.arena.r - 50) { ex += g.arena.x - p.x; ey += g.arena.y - p.y; }

  const foe = g.nearestFoe(p.x, p.y, 2000);
  const inFight = foe && g.roomAt(foe.x, foe.y) === g.roomAt(p.x, p.y);
  if (ex || ey) {
    const d = hyp(ex, ey);
    input.mx = ex / d; input.my = ey / d;
    if (urgent && p.dashCd <= 0) input.dash = true;
  } else if (inFight) {
    const d = hyp(foe.x - p.x, foe.y - p.y);
    const want = p.reach * 0.75 + foe.r;
    const clear = g.lineClear(p.x, p.y, foe.x, foe.y);
    const step = clear ? foe : pathStep(g, p.x, p.y, foe.x, foe.y, mem);
    if (!clear && step) { const sd = hyp(step.x - p.x, step.y - p.y) || 1; input.mx = (step.x - p.x) / sd; input.my = (step.y - p.y) / sd; }
    else if (d > want) { input.mx = (foe.x - p.x) / d; input.my = (foe.y - p.y) / d; }
    else if (d < want * 0.5) { input.mx = -(foe.x - p.x) / d; input.my = -(foe.y - p.y) / d; }
  } else {
    const goal = botGoal(g);
    if (goal) {
      const step = pathStep(g, p.x, p.y, goal.x, goal.y, mem);
      if (step) { const d = hyp(step.x - p.x, step.y - p.y) || 1; input.mx = (step.x - p.x) / d; input.my = (step.y - p.y) / d; }
    }
  }
  if (inFight) {
    const d = hyp(foe.x - p.x, foe.y - p.y);
    input.ax = foe.x - p.x; input.ay = foe.y - p.y;
    if (d < p.reach + foe.r) input.strike = true;
    const crowd = g.enemies.filter((e) => !e.dead && !e.boss && e.state !== 'spawn' && hyp(e.x - p.x, e.y - p.y) < p.flareR).length;
    if ((crowd >= 3 || g.bullets.length > 12) && p.ember > 50) input.flare = true;
    if (g.eclipse && g.boss) {
      const dark = g.boss.room.braziers.find((b) => !b.lit && !b.gone && hyp(b.x - p.x, b.y - p.y) < 80);
      if (dark && p.ember > 30) input.flare = true;
    }
  }
  return input;
}

function botGoal(g) {
  const m = g.map, p = g.player;
  const reachable = (room) => room.cleared || !room.locked;
  const stone = m.stones.find((s) => !g.lore.has(s.id) && m.rooms[s.room].cleared);
  if (stone) return stone;
  if (!m.shrine.used) return m.shrine.altar;
  if (m.exit) return m.exit;
  const fights = m.rooms.filter((r) => r.kind === 'fight' && !r.cleared && reachable(r));
  if (fights.length) {
    const r = fights.reduce((a, b) => (hyp(b.mx * T - p.x, b.my * T - p.y) < hyp(a.mx * T - p.x, a.my * T - p.y) ? b : a));
    return { x: r.mx * T + T / 2, y: r.my * T + T / 2 };
  }
  if (!g.bossDone) return { x: m.boss.mx * T + T / 2, y: m.boss.my * T + T / 2 };
  return null;
}

function pathStep(g, x, y, gx, gy, mem) {
  const m = g.map, W = m.W;
  const sx = Math.floor(x / T), sy = Math.floor(y / T), tx = Math.floor(gx / T), ty = Math.floor(gy / T);
  const key = `${tx},${ty}`;
  if (mem.key !== key || !mem.path || g.t - (mem.at ?? -9) > 0.5) {
    const prev = new Int32Array(W * m.H).fill(-1);
    const q = [sy * W + sx];
    prev[q[0]] = q[0];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      if (c === ty * W + tx) break;
      const cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, n = ny * W + nx;
        if (g.blocked(nx, ny) || prev[n] >= 0) continue;
        prev[n] = c;
        q.push(n);
      }
    }
    const path = [];
    let c = ty * W + tx;
    if (prev[c] < 0) { mem.path = null; return null; }
    while (c !== sy * W + sx) { path.push(c); c = prev[c]; }
    mem.path = path.reverse(); mem.key = key; mem.at = g.t;
  }
  while (mem.path.length) {
    const c = mem.path[0];
    const cx = (c % W) * T + T / 2, cy = ((c / W) | 0) * T + T / 2;
    if (hyp(cx - x, cy - y) < 10 && mem.path.length > 1) { mem.path.shift(); continue; }
    return { x: cx, y: cy };
  }
  return null;
}

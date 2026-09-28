/* play/ember/render.js — draws a Game: stone, water, fire, and the dark that the light has to push back. */

import { T, TILE, opaque, visibility, lightRadius } from './engine.js';

const TAU = Math.PI * 2;
const hyp = Math.hypot;
const hash = (x, y) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

export const STYLE = {
  1: { floor: ['#2b2723', '#2e2925', '#282420', '#312b26'], seam: '#1b1815', top: '#131110', face: '#3b352f', faceLine: '#26221d', ambient: [3, 2, 4, 0.955], void: '#050405', water: '#15282c', moteColor: '255,210,160' },
  2: { floor: ['#1f292b', '#222e2e', '#1c2527', '#253130'], seam: '#131c1d', top: '#0d1314', face: '#2d3c3d', faceLine: '#1b2627', ambient: [2, 5, 10, 0.94], void: '#030608', water: '#0f3239', moteColor: '170,220,255' },
  3: { floor: ['#241918', '#281b19', '#211615', '#2c1d1a'], seam: '#140c0b', top: '#0e0808', face: '#3a2420', faceLine: '#261614', ambient: [6, 2, 2, 0.958], void: '#070303', water: '#2a1512', moteColor: '255,140,90' },
};

function sprite(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function buildSprites(act) {
  const S = STYLE[act];
  let seed = 1234 + act * 77;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const floors = S.floor.map((base, v) => sprite(T, T, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, T, T);
    for (let i = 0; i < 26; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.08)';
      c.fillRect(rnd() * T, rnd() * T, 1 + rnd() * 3, 1 + rnd() * 2);
    }
    c.fillStyle = S.seam;
    c.fillRect(0, 0, T, 1); c.fillRect(0, 0, 1, T);
    if (v % 2) c.fillRect(T / 2, 0, 1, T / 2);
    if (v === 3) {
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(6, 22); c.lineTo(13, 17); c.lineTo(19, 19); c.lineTo(27, 11); c.stroke();
    }
  }));
  const face = sprite(T, T, (c) => {
    c.fillStyle = S.top; c.fillRect(0, 0, T, T);
    c.fillStyle = S.face; c.fillRect(0, 12, T, T - 12);
    c.fillStyle = S.faceLine;
    c.fillRect(0, 12, T, 1); c.fillRect(0, 22, T, 1);
    c.fillRect(10, 12, 1, 10); c.fillRect(25, 22, 1, 10);
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(0, 12, T, 2);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, T - 3, T, 3);
  });
  const top = sprite(T, T, (c) => {
    c.fillStyle = S.top; c.fillRect(0, 0, T, T);
    for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(255,255,255,.02)'; c.fillRect(rnd() * T, rnd() * T, 2, 2); }
  });
  const aoTop = sprite(T, T, (c) => { const g = c.createLinearGradient(0, 0, 0, 14); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, T, 14); });
  const aoLeft = sprite(T, T, (c) => { const g = c.createLinearGradient(0, 0, 10, 0); g.addColorStop(0, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 10, T); });
  const aoRight = sprite(T, T, (c) => { const g = c.createLinearGradient(T, 0, T - 10, 0); g.addColorStop(0, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(T - 10, 0, 10, T); });
  const pillar = sprite(T + 16, T + 16, (c) => {
    c.fillStyle = 'rgba(0,0,0,.45)';
    c.beginPath(); c.ellipse(T / 2 + 12, T / 2 + 14, 15, 12, 0, 0, TAU); c.fill();
    const g = c.createRadialGradient(T / 2 + 4, T / 2 + 4, 2, T / 2 + 8, T / 2 + 8, 16);
    g.addColorStop(0, S.face); g.addColorStop(1, S.top);
    c.fillStyle = g;
    c.beginPath(); c.arc(T / 2 + 8, T / 2 + 8, 15, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(T / 2 + 8, T / 2 + 8, 12, Math.PI * 1.1, Math.PI * 1.8); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.5)';
    c.beginPath(); c.arc(T / 2 + 8, T / 2 + 8, 15, 0, TAU); c.stroke();
  });
  return { floors, face, top, aoTop, aoLeft, aoRight, pillar };
}

export class Renderer {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.swings = [];
    this.decals = [];
    this.ghosts = [];
    this.bursts = [];
    this.cam = null;
    this.act = 0;
    this.spr = null;
    this.polys = new Map();
    this.dark = document.createElement('canvas');
    this.dctx = this.dark.getContext('2d');
    this.flash = 0; this.hurt = 0; this.white = 0;
    this.amb = 1;
    this.shake = 0;
    this.motes = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random(), p: Math.random() * TAU }));
    this.lowPower = false;
  }

  part(o) { if (this.parts.length < (this.lowPower ? 260 : 700)) this.parts.push({ vx: 0, vy: 0, g: 0, drag: 2, size: 2, life: 0.6, max: 0.6, add: true, ...o, max: o.life ?? 0.6 }); }

  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.a ?? Math.random() * TAU) + (Math.random() - 0.5) * (o.spread ?? TAU);
      const s = (o.speed ?? 160) * (0.35 + Math.random() * 0.8);
      this.part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.7), size: (o.size ?? 2) * (0.6 + Math.random() * 0.8), color: o.color ?? '255,170,80', add: o.add ?? true, g: o.g ?? 0, drag: o.drag ?? 3, kind: o.kind ?? 'spark' });
    }
  }

  fx(e, g) {
    switch (e.type) {
      case 'act': this.polys.clear(); this.cam = null; this.decals = []; this.parts = []; this.amb = 1; break;
      case 'swing': this.swings.push({ ...e, t: 0 }); break;
      case 'hit':
        this.burst(e.x, e.y, e.boss ? 14 : 8, { color: e.weak ? '190,190,210' : e.strong ? '255,90,60' : '255,200,120', speed: e.heavy ? 260 : 190, life: 0.35 });
        if (!e.boss) this.burst(e.x, e.y, 5, { color: '10,8,12', add: false, speed: 90, life: 0.6, size: 3, kind: 'blob' });
        break;
      case 'kill':
        this.burst(e.x, e.y, e.boss ? 40 : 16, { color: '12,10,14', add: false, speed: 140, life: 0.9, size: 4, kind: 'blob', drag: 3 });
        this.burst(e.x, e.y, e.boss ? 30 : 10, { color: '255,150,60', speed: 120, life: 0.8, g: -40, kind: 'ember' });
        this.rings.push({ x: e.x, y: e.y, r: 6, to: e.boss ? 120 : 40, t: 0, life: 0.35, color: '255,190,120' });
        break;
      case 'hurt': this.hurt = 1; this.burst(e.x, e.y, 12, { color: '255,120,50', speed: 200, life: 0.5 }); break;
      case 'dash': this.burst(e.x, e.y, 6, { color: '255,200,140', speed: 60, life: 0.3, a: e.a + Math.PI, spread: 1 }); break;
      case 'flare':
        this.rings.push({ x: e.x, y: e.y, r: 10, to: e.r, t: 0, life: 0.45, color: '255,210,140', w: 6 });
        this.bursts.push({ x: e.x, y: e.y, r: e.r * 1.4, t: 0, life: 0.55 });
        this.burst(e.x, e.y, 40, { color: '255,180,90', speed: 320, life: 0.6, kind: 'ember' });
        this.flash = Math.max(this.flash, 0.35);
        break;
      case 'cinder': this.burst(e.x, e.y, 3, { color: '255,210,120', speed: 50, life: 0.3 }); break;
      case 'brazier': this.burst(e.x, e.y - 6, 26, { color: '255,170,70', speed: 150, life: 0.8, g: -80, kind: 'ember' }); this.rings.push({ x: e.x, y: e.y, r: 8, to: 90, t: 0, life: 0.6, color: '255,200,120' }); break;
      case 'lock': this.flash = Math.max(this.flash, 0.12); break;
      case 'spawn': this.burst(e.x, e.y, 14, { color: '20,14,24', add: false, speed: -70, life: 0.7, size: 3, kind: 'blob' }); break;
      case 'slam':
        this.decals.push({ x: e.x, y: e.y, t: 0, life: 6, kind: 'crack', r: 60, seed: Math.random() * 1000 });
        this.burst(e.x, e.y, 30, { color: '120,110,100', add: false, speed: 240, life: 0.7, size: 3, kind: 'blob' });
        this.burst(e.x, e.y, 18, { color: '255,160,80', speed: 260, life: 0.5 });
        break;
      case 'crash': this.burst(e.x, e.y, 24, { color: '140,130,120', add: false, speed: 200, life: 0.8, size: 3, kind: 'blob' }); this.burst(e.x, e.y, 16, { color: '255,220,160', speed: 300, life: 0.4 }); break;
      case 'roar': this.rings.push({ x: e.x, y: e.y, r: 20, to: 420, t: 0, life: 0.7, color: '255,120,80', w: 10 }); this.flash = 0.25; break;
      case 'sweep': case 'slash': this.swings.push({ x: e.x, y: e.y, a: e.a, combo: 3, reach: e.big ? 108 : 150, t: 0, foe: true }); break;
      case 'blink': this.burst(e.x, e.y, e.big ? 30 : 16, { color: '120,60,170', speed: 120, life: 0.6, size: 3, kind: 'blob', add: true }); break;
      case 'snuff': this.burst(e.x, e.y, 20, { color: '40,30,40', add: false, speed: 60, life: 1.2, g: -50, size: 5, kind: 'blob' }); break;
      case 'secondwind': this.rings.push({ x: e.x, y: e.y, r: 10, to: 160, t: 0, life: 0.6, color: '255,120,40', w: 8 }); this.flash = 0.5; break;
      case 'bossDown': this.white = 1; this.rings.push({ x: e.x, y: e.y, r: 10, to: 600, t: 0, life: 1.2, color: '255,230,190', w: 14 }); this.burst(e.x, e.y, 80, { color: '255,190,110', speed: 360, life: 1.4, kind: 'ember', g: -30 }); break;
      case 'eclipse': this.rings.push({ x: g.player.x, y: g.player.y, r: 400, to: 0, t: 0, life: 1.4, color: '80,40,120', w: 20 }); break;
      case 'exposed': this.burst(e.x, e.y, 14, { color: '255,60,60', speed: 100, life: 0.6 }); break;
      case 'shoot': case 'sing': this.burst(e.x, e.y, 6, { color: '200,230,255', speed: 80, life: 0.3 }); break;
      case 'respawn': this.burst(e.x, e.y, 30, { color: '255,170,80', speed: 140, life: 0.8, g: -60, kind: 'ember' }); this.cam = null; break;
      case 'exit': this.rings.push({ x: e.x, y: e.y, r: 10, to: 200, t: 0, life: 1.2, color: '255,230,180', w: 6 }); break;
      default: break;
    }
  }

  /** Draw a frame. `view` = { w, h, scale, dpr, dt, now, preview }. */
  draw(ctx, g, view) {
    const { w, h, scale, dt } = view;
    const now = view.now / 1000;
    if (this.act !== g.act || !this.spr) { this.act = g.act; this.spr = buildSprites(g.act); this.polys.clear(); }
    const S = STYLE[g.act], p = g.player, m = g.map;

    const B = g.boss && !g.boss.done ? g.boss : null;
    let tx = p.x + Math.cos(p.face) * 24, ty = p.y + Math.sin(p.face) * 24;
    if (B) { tx = tx * 0.62 + B.cx * 0.38; ty = ty * 0.62 + B.cy * 0.38; }
    if (!this.cam) this.cam = { x: tx, y: ty };
    const k = 1 - Math.exp(-6 * dt);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    this.shake = Math.max(this.shake * Math.exp(-8 * dt), g.shake);
    const sx = (Math.random() - 0.5) * this.shake * 0.7, sy = (Math.random() - 0.5) * this.shake * 0.7;
    const vw = w / scale, vh = h / scale;
    const left = this.cam.x - vw / 2 + sx, topY = this.cam.y - vh / 2 + sy;
    this.left = left; this.top = topY; this.scale = scale;

    ctx.save();
    ctx.fillStyle = S.void;
    ctx.fillRect(0, 0, w, h);
    ctx.scale(scale, scale);
    ctx.translate(-left, -topY);

    this.drawTiles(ctx, g, left, topY, vw, vh, now);
    this.drawDecals(ctx, dt);
    this.drawObjects(ctx, g, now);
    this.drawEntities(ctx, g, now);
    ctx.restore();

    this.drawDark(ctx, g, view, left, topY, now);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-left, -topY);
    this.drawGlow(ctx, g, now, left, topY, vw, vh);
    this.drawHazards(ctx, g);
    this.drawLuminous(ctx, g, now, dt);
    this.drawParticles(ctx, dt);
    ctx.restore();

    this.drawScreen(ctx, g, view, dt, now);
  }

  drawTiles(ctx, g, left, top, vw, vh, now) {
    const m = g.map, sp = this.spr, S = STYLE[g.act];
    const x0 = Math.max(0, Math.floor(left / T) - 1), x1 = Math.min(m.W - 1, Math.ceil((left + vw) / T) + 1);
    const y0 = Math.max(0, Math.floor(top / T) - 1), y1 = Math.min(m.H - 1, Math.ceil((top + vh) / T) + 1);
    const at = (x, y) => (x < 0 || y < 0 || x >= m.W || y >= m.H ? 0 : m.tiles[y * m.W + x]);
    const pillars = [];
    this.cracks = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = m.tiles[y * m.W + x];
        if (t === TILE.VOID) continue;
        const px = x * T, py = y * T;
        if (t === TILE.WALL) {
          ctx.drawImage(opaque(at(x, y + 1)) ? sp.top : sp.face, px, py);
          continue;
        }
        if (t === TILE.WATER) {
          ctx.fillStyle = S.water; ctx.fillRect(px, py, T, T);
          const ph = now * 1.6 + (x * 0.7 + y * 1.3);
          ctx.fillStyle = 'rgba(160,220,230,.07)';
          ctx.fillRect(px + 4 + Math.sin(ph) * 3, py + 9, 12, 1);
          ctx.fillRect(px + 14 + Math.cos(ph * 0.8) * 4, py + 22, 10, 1);
        } else {
          const hv = hash(x, y);
          ctx.drawImage(sp.floors[hv % 11 === 0 ? 3 : hv & 1 ? 1 : (hv >> 3) & 1 ? 2 : 0], px, py);
          if (g.act === 3 && hv % 5 === 0) this.cracks.push(px, py, hv);
        }
        if (opaque(at(x, y - 1))) ctx.drawImage(sp.aoTop, px, py);
        if (opaque(at(x - 1, y))) ctx.drawImage(sp.aoLeft, px, py);
        if (opaque(at(x + 1, y))) ctx.drawImage(sp.aoRight, px, py);
        if (t === TILE.PILLAR) pillars.push(px, py);
        if (t === TILE.DOOR) {
          const room = m.rooms[m.doorOf[y * m.W + x]];
          if (room?.locked) {
            const vertical = !opaque(at(x, y - 1)) && !opaque(at(x, y + 1));
            ctx.fillStyle = '#0c0a09';
            ctx.fillRect(px, py, T, T);
            ctx.fillStyle = '#6b5a4a';
            for (let i = 4; i < T; i += 7) vertical ? ctx.fillRect(px + i, py, 2, T) : ctx.fillRect(px, py + i, T, 2);
            ctx.fillStyle = 'rgba(255,120,60,.25)';
            vertical ? ctx.fillRect(px, py, T, 2) : ctx.fillRect(px, py, 2, T);
          }
        }
      }
    }
    for (let i = 0; i < pillars.length; i += 2) ctx.drawImage(sp.pillar, pillars[i] - 8, pillars[i + 1] - 8);
  }

  drawDecals(ctx, dt) {
    for (const d of this.decals) {
      d.t += dt;
      const a = Math.max(0, 1 - d.t / d.life);
      if (d.kind === 'crack') {
        ctx.strokeStyle = `rgba(0,0,0,${0.55 * a})`;
        ctx.lineWidth = 2;
        let s = d.seed;
        const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * TAU + r() * 0.5;
          ctx.moveTo(d.x, d.y);
          let x = d.x, y = d.y;
          for (let j = 0; j < 3; j++) { x += Math.cos(ang + (r() - 0.5)) * d.r / 3; y += Math.sin(ang + (r() - 0.5)) * d.r / 3; ctx.lineTo(x, y); }
        }
        ctx.stroke();
      }
    }
    this.decals = this.decals.filter((d) => d.t < d.life);
  }

  drawObjects(ctx, g, now) {
    const m = g.map;
    for (const b of m.braziers) {
      if (b.gone) continue;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + 5, 13, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2521';
      ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#4a4038'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, TAU); ctx.stroke();
      ctx.fillStyle = b.lit ? '#ff7a2a' : '#1a1512';
      ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, TAU); ctx.fill();
    }
    if (g.act === 3) {
      const r = m.boss, bx = r.mx * T + T / 2, by = r.my * T + T / 2;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.ellipse(bx + 6, by + 10, 50, 40, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2322';
      ctx.beginPath(); ctx.arc(bx, by, 44, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#46393a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(bx, by, 42, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#0d0a0a';
      ctx.beginPath(); ctx.arc(bx, by, 30, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(80,70,70,.35)';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.fillRect(bx + Math.cos(a) * 36 - 1.5, by + Math.sin(a) * 36 - 1.5, 3, 3); }
    }
    const sh = m.shrine;
    if (sh?.altar) {
      const { x, y } = sh.altar;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x - 18, y - 10, 40, 26);
      ctx.fillStyle = '#3a3531'; ctx.fillRect(x - 20, y - 14, 40, 26);
      ctx.fillStyle = '#4b4540'; ctx.fillRect(x - 20, y - 14, 40, 5);
    }
    for (const s of m.stones) {
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.ellipse(s.x + 3, s.y + 8, 9, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#34302e';
      ctx.beginPath(); ctx.moveTo(s.x - 8, s.y + 8); ctx.lineTo(s.x - 7, s.y - 10); ctx.quadraticCurveTo(s.x, s.y - 17, s.x + 7, s.y - 10); ctx.lineTo(s.x + 8, s.y + 8); ctx.closePath(); ctx.fill();
    }
    if (m.exit) {
      const { x, y } = m.exit;
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 20, y - 20, 40, 40);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(90,80,70,${0.8 - i * 0.14})`; ctx.fillRect(x - 20 + i * 2, y - 20 + i * 8, 40 - i * 4, 5); }
    }
  }

  drawEntities(ctx, g, now) {
    const list = g.enemies.filter((e) => !e.dead);
    list.push(g.player);
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e === g.player) { this.drawPlayer(ctx, g, now); continue; }
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.state === 'spawn') ctx.globalAlpha = Math.max(0, 1 - e.t / 0.8);
      DRAW[e.kind]?.(ctx, e, now, g);
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,240,220,${Math.min(1, e.flash * 8) * 0.6})`;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 2, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawPlayer(ctx, g, now) {
    const p = g.player;
    if (g.mode === 'dead') return;
    if (p.dashT > 0) this.ghosts.push({ x: p.x, y: p.y, t: 0 });
    for (const gh of this.ghosts) {
      ctx.fillStyle = `rgba(255,170,90,${0.25 * (1 - gh.t / 0.25)})`;
      ctx.beginPath(); ctx.arc(gh.x, gh.y, p.r, 0, TAU); ctx.fill();
    }
    if (p.iframes > 0 && p.dashT <= 0 && Math.floor(now * 20) % 2) ctx.globalAlpha = 0.5;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.ellipse(2, 8, 11, 6, 0, 0, TAU); ctx.fill();
    const a = p.face;
    ctx.rotate(a);
    ctx.fillStyle = '#3b2c24';
    ctx.beginPath(); ctx.moveTo(-12, -9); ctx.quadraticCurveTo(-4, -13, 6, -8); ctx.lineTo(9, 0); ctx.lineTo(6, 8); ctx.quadraticCurveTo(-4, 13, -12, 9); ctx.quadraticCurveTo(-8, 0, -12, -9); ctx.fill();
    ctx.fillStyle = '#5a4336';
    ctx.beginPath(); ctx.arc(1, 0, 6.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#22180f';
    ctx.beginPath(); ctx.arc(3, 0, 4, -1.2, 1.2); ctx.fill();
    const swinging = p.lag > 0;
    ctx.strokeStyle = '#d8d0c4'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (swinging) { ctx.moveTo(6, 0); ctx.lineTo(6 + p.reach * 0.62, 0); }
    else { ctx.moveTo(2, 7); ctx.lineTo(16, 13); }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawDark(ctx, g, view, left, top, now) {
    const { w, h, scale } = view;
    const q = view.preview ? 0.5 : this.lowPower ? 0.35 : 0.5;
    const dw = Math.max(2, Math.round(w * q)), dh = Math.max(2, Math.round(h * q));
    if (this.dark.width !== dw || this.dark.height !== dh) { this.dark.width = dw; this.dark.height = dh; }
    const d = this.dctx, S = STYLE[g.act];
    const target = g.eclipse ? 1.35 : 1;
    this.amb += (target - this.amb) * 0.05;
    const [r, gg, b, a] = S.ambient;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, dw, dh);
    d.fillStyle = `rgba(${r},${gg},${b},${Math.min(0.992, a * this.amb)})`;
    d.fillRect(0, 0, dw, dh);
    d.globalCompositeOperation = 'destination-out';
    const k = scale * q;
    const X = (x) => (x - left) * k, Y = (y) => (y - top) * k;
    const light = (x, y, R, pts, strength = 1) => {
      if (x + R < left || x - R > left + w / scale || y + R < top || y - R > top + h / scale) return;
      const grad = d.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), R * k);
      grad.addColorStop(0, `rgba(0,0,0,${strength})`);
      grad.addColorStop(0.5, `rgba(0,0,0,${0.82 * strength})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = grad;
      d.beginPath();
      if (pts) { d.moveTo(X(pts[0]), Y(pts[1])); for (let i = 2; i < pts.length; i += 2) d.lineTo(X(pts[i]), Y(pts[i + 1])); d.closePath(); }
      else d.arc(X(x), Y(y), R * k, 0, TAU);
      d.fill();
    };
    const p = g.player;
    if (g.mode !== 'dead') {
      const R = lightRadius(p.ember) * (0.97 + Math.sin(now * 11) * 0.015 + Math.sin(now * 3.7) * 0.015);
      light(p.x, p.y, R, visibility(g.map, p.x, p.y, R));
    }
    for (const br of g.map.braziers) {
      if (!br.lit) continue;
      const R = 250;
      const key = `${g.act}:${br.x},${br.y}`;
      let pts = this.polys.get(key);
      if (!pts) { pts = visibility(g.map, br.x, br.y, R); this.polys.set(key, pts); }
      light(br.x, br.y, R * (0.96 + Math.sin(now * 7 + br.x) * 0.02), pts);
    }
    if (g.map.exit) light(g.map.exit.x, g.map.exit.y, 170, null, 0.9);
    for (const bu of this.bursts) {
      bu.t += view.dt;
      const f = 1 - bu.t / bu.life;
      if (f > 0) light(bu.x, bu.y, bu.r, null, f);
    }
    this.bursts = this.bursts.filter((bu) => bu.t < bu.life);
    for (const bl of g.bullets) light(bl.x, bl.y, 46, null, 0.55);
    for (const f of g.fires) light(f.x, f.y, 56, null, 0.6 * Math.min(1, f.t));
    for (const s of g.map.stones) if (!g.lore.has(s.id)) light(s.x, s.y, 50, null, 0.35 + Math.sin(now * 2.4) * 0.1);
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.kind === 'warden') light(e.x + Math.cos(e.face) * 15 + Math.sin(e.face) * 23, e.y + Math.sin(e.face) * 15 - Math.cos(e.face) * 23, 130, null, 0.7);
      if (e.kind === 'king') light(e.x, e.y - 14, 90, null, e.exposed > 0 ? 0.9 : 0.55);
      if (e.kind === 'mask') light(e.x, e.y, 80, null, 0.45);
      if (e.kind === 'wraith' && e.state === 'cast') light(e.x, e.y, 60, null, 0.5);
    }
    if (g.arena) {
      d.globalCompositeOperation = 'source-over';
      d.fillStyle = 'rgba(0,0,0,.9)';
      d.beginPath();
      d.rect(0, 0, dw, dh);
      d.arc(X(g.arena.x), Y(g.arena.y), g.arena.r * k, 0, TAU, true);
      d.fill('evenodd');
    }
    ctx.drawImage(this.dark, 0, 0, w, h);
  }

  drawGlow(ctx, g, now) {
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, R, color, a) => {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(${color},${a})`);
      gr.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(x - R, y - R, R * 2, R * 2);
    };
    const p = g.player;
    if (g.mode !== 'dead') glow(p.x, p.y, lightRadius(p.ember) * 0.75, '255,140,60', 0.1);
    for (const br of g.map.braziers) if (br.lit) glow(br.x, br.y, 190, '255,130,50', 0.09 + Math.sin(now * 9 + br.y) * 0.015);
    if (g.act === 2) for (const br of g.map.braziers) if (br.lit) glow(br.x, br.y, 120, '120,200,255', 0.02);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawHazards(ctx, g) {
    const t = g.t;
    for (const hz of g.hazards) {
      const warn = Math.max(1e-6, hz.liveAt - hz.warnAt);
      const f = Math.min(1, Math.max(0, (t - hz.warnAt) / warn));
      const live = t >= hz.liveAt && t <= hz.endAt;
      const after = t > hz.endAt ? 1 - (t - hz.endAt) / 0.25 : 1;
      const harmless = !hz.dmg;
      const col = hz.snuff ? '150,90,220' : harmless ? '255,190,150' : '255,70,50';
      ctx.save();
      ctx.globalAlpha = Math.max(0, after);
      const path = (scale = 1) => {
        ctx.beginPath();
        if (hz.shape === 'circle') ctx.arc(hz.x, hz.y, hz.r * scale, 0, TAU);
        else if (hz.shape === 'arc') { ctx.moveTo(hz.x, hz.y); ctx.arc(hz.x, hz.y, hz.r * scale, hz.a - hz.arc / 2, hz.a + hz.arc / 2); ctx.closePath(); }
        else if (hz.shape === 'line' || hz.shape === 'beam') {
          const c = Math.cos(hz.a), s = Math.sin(hz.a), L = hz.len * scale, W = hz.w / 2;
          ctx.moveTo(hz.x - s * W, hz.y + c * W); ctx.lineTo(hz.x + c * L - s * W, hz.y + s * L + c * W);
          ctx.lineTo(hz.x + c * L + s * W, hz.y + s * L - c * W); ctx.lineTo(hz.x + s * W, hz.y - c * W); ctx.closePath();
        }
      };
      if (hz.shape === 'ring') {
        if (t >= hz.liveAt) {
          ctx.strokeStyle = 'rgba(255,190,130,.85)'; ctx.lineWidth = hz.w;
          ctx.beginPath(); ctx.arc(hz.x, hz.y, Math.max(0, hz.cur ?? 0), 0, TAU); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,230,.9)'; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      if (hz.shape === 'beam' && live) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,220,150,.55)'; path(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,240,.9)';
        const c = Math.cos(hz.a), s = Math.sin(hz.a);
        ctx.beginPath(); ctx.moveTo(hz.x - s * 2, hz.y + c * 2); ctx.lineTo(hz.x + c * hz.len - s * 2, hz.y + s * hz.len + c * 2); ctx.lineTo(hz.x + c * hz.len + s * 2, hz.y + s * hz.len - c * 2); ctx.lineTo(hz.x + s * 2, hz.y - c * 2); ctx.fill();
        ctx.restore();
        continue;
      }
      if (live && !harmless) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,210,160,.5)';
        path(); ctx.fill();
      } else if (t < hz.liveAt) {
        ctx.fillStyle = `rgba(${col},${harmless ? 0.05 : 0.09})`;
        path(); ctx.fill();
        ctx.fillStyle = `rgba(${col},${harmless ? 0.1 : 0.22})`;
        if (hz.shape === 'line' || hz.shape === 'beam') path(f); else path(f);
        ctx.fill();
        ctx.strokeStyle = `rgba(${col},${harmless ? 0.35 : 0.7})`;
        ctx.lineWidth = harmless ? 1 : 1.5;
        if (harmless) ctx.setLineDash([6, 6]);
        path(); ctx.stroke();
      }
      ctx.restore();
    }
    if (g.arena) {
      ctx.strokeStyle = 'rgba(140,60,200,.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(g.arena.x, g.arena.y, g.arena.r, 0, TAU); ctx.stroke();
    }
  }

  drawLuminous(ctx, g, now, dt) {
    const p = g.player;
    ctx.globalCompositeOperation = 'lighter';
    if (this.cracks?.length) {
      ctx.lineWidth = 1.2;
      for (let i = 0; i < this.cracks.length; i += 3) {
        const x = this.cracks[i], y = this.cracks[i + 1], hv = this.cracks[i + 2];
        const a = 0.12 + 0.1 * Math.sin(now * 1.3 + (hv % 97));
        ctx.strokeStyle = `rgba(255,${90 + (hv % 60)},30,${a})`;
        ctx.beginPath();
        ctx.moveTo(x + (hv % 7) + 3, y + 6 + ((hv >> 4) % 6));
        ctx.lineTo(x + 13, y + 14 + ((hv >> 7) % 5));
        ctx.lineTo(x + 20 + ((hv >> 9) % 6), y + 12);
        ctx.lineTo(x + 28, y + 22 + ((hv >> 11) % 6));
        ctx.stroke();
      }
    }
    for (const s of g.map.stones) {
      const read = g.lore.has(s.id);
      ctx.fillStyle = read ? 'rgba(120,150,200,.25)' : `rgba(140,190,255,${0.55 + Math.sin(now * 2.4) * 0.2})`;
      for (let i = 0; i < 3; i++) ctx.fillRect(s.x - 3 + (i % 2) * 3, s.y - 9 + i * 5, 3, 2);
    }
    const sh = g.map.shrine;
    if (sh?.altar && !sh.used) {
      const { x, y } = sh.altar;
      ctx.fillStyle = `rgba(255,200,120,${0.45 + Math.sin(now * 3) * 0.2})`;
      ctx.beginPath(); ctx.arc(x, y - 4, 5, 0, TAU); ctx.fill();
      if (Math.random() < 0.3) this.part({ x: x + (Math.random() - 0.5) * 30, y: y - 6, vy: -30, life: 1, size: 1.5, color: '255,200,120', kind: 'ember', drag: 0.5 });
    }
    for (const br of g.map.braziers) {
      if (!br.lit) continue;
      for (let i = 0; i < 3; i++) {
        const fl = Math.sin(now * 14 + i * 2 + br.x) * 2;
        ctx.fillStyle = `rgba(255,${120 + i * 50},${40 + i * 30},${0.55 - i * 0.12})`;
        ctx.beginPath(); ctx.ellipse(br.x + fl * 0.3, br.y - 4 - i * 3, 6 - i * 1.5, 9 - i * 2 + fl, 0, 0, TAU); ctx.fill();
      }
      if (Math.random() < 0.25) this.part({ x: br.x + (Math.random() - 0.5) * 8, y: br.y - 8, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 40, life: 0.9, size: 1.5, color: '255,170,80', kind: 'ember', drag: 0.8 });
    }
    if (g.map.exit) {
      const { x, y } = g.map.exit;
      const gr = ctx.createLinearGradient(x, y + 20, x, y - 120);
      gr.addColorStop(0, 'rgba(255,230,180,.35)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - 20, y - 120, 40, 140);
    }
    for (const c of g.cinders) {
      ctx.fillStyle = `rgba(255,${170 + Math.sin(now * 20 + c.x) * 40},80,.95)`;
      ctx.beginPath(); ctx.arc(c.x, c.y, 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,40,.25)';
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, TAU); ctx.fill();
    }
    for (const f of g.fires) {
      const a = Math.min(1, f.t);
      ctx.fillStyle = `rgba(255,120,40,${0.35 * a})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.8 + Math.sin(now * 20 + f.x) * 0.1), 0, TAU); ctx.fill();
      if (Math.random() < 0.2) this.part({ x: f.x, y: f.y, vy: -50, life: 0.5, size: 1.5, color: '255,150,60', kind: 'ember' });
    }
    for (const s of g.shots) {
      ctx.fillStyle = 'rgba(255,150,60,.6)';
      const a = Math.atan2(s.vy, s.vx);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, a - 1.2, a + 1.2); ctx.lineTo(s.x - Math.cos(a) * 6, s.y - Math.sin(a) * 6); ctx.fill();
    }
    for (const b of g.bullets) {
      const col = b.by === 'wraith' ? '120,220,255' : b.by === 'spiral' ? '200,90,255' : '255,220,150';
      ctx.fillStyle = `rgba(${col},.3)`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${col},1)`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU); ctx.fill();
    }
    for (const e of g.enemies) {
      if (e.dead) continue;
      const vis = e.state === 'spawn' ? Math.max(0, 1 - e.t / 0.8) : 1;
      EYES[e.kind]?.(ctx, e, now, vis, g);
    }
    if (g.mode !== 'dead') {
      const ox = p.x + Math.cos(p.face - 1.9) * 9, oy = p.y + Math.sin(p.face - 1.9) * 9;
      const f = 0.85 + Math.sin(now * 17) * 0.1 + Math.sin(now * 5.3) * 0.05;
      const size = 2 + Math.min(1, p.ember / p.maxEmber) * 2.5;
      ctx.fillStyle = 'rgba(255,110,30,.35)';
      ctx.beginPath(); ctx.arc(ox, oy, size * 3 * f, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,110,.95)';
      ctx.beginPath(); ctx.arc(ox, oy, size * f, 0, TAU); ctx.fill();
      if (Math.random() < 0.35) this.part({ x: ox, y: oy, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, life: 0.7, size: 1.2, color: '255,170,80', kind: 'ember', drag: 1 });
    }
    for (const s of this.swings) {
      s.t += dt;
      const life = s.foe ? 0.2 : 0.14;
      const f = 1 - s.t / life;
      if (f <= 0) continue;
      const arc = s.foe ? 2.6 : 2.1;
      const R = s.reach;
      const sweep = Math.min(1, s.t / (life * 0.5));
      const a0 = s.a - arc / 2, a1 = a0 + arc * sweep;
      ctx.fillStyle = s.foe ? `rgba(255,90,70,${0.35 * f})` : s.combo === 3 ? `rgba(255,150,70,${0.55 * f})` : `rgba(255,225,190,${0.45 * f})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, R, a0, a1);
      ctx.arc(s.x, s.y, R * 0.55, a1, a0, true);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,250,235,${0.8 * f})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, R, a0, a1); ctx.stroke();
    }
    this.swings = this.swings.filter((s) => s.t < 0.25);
    for (const gh of this.ghosts) gh.t += dt;
    this.ghosts = this.ghosts.filter((gh) => gh.t < 0.25);
    for (const r of this.rings) {
      r.t += dt;
      const f = Math.min(1, r.t / r.life);
      const rad = r.r + (r.to - r.r) * (1 - (1 - f) * (1 - f));
      ctx.strokeStyle = `rgba(${r.color},${(1 - f) * 0.8})`;
      ctx.lineWidth = (r.w ?? 3) * (1 - f) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(0, rad), 0, TAU); ctx.stroke();
    }
    this.rings = this.rings.filter((r) => r.t < r.life);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawParticles(ctx, dt) {
    for (const q of this.parts) {
      q.life -= dt;
      const damp = Math.exp(-q.drag * dt);
      q.vx *= damp; q.vy = q.vy * damp + q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      const f = Math.max(0, q.life / q.max);
      ctx.globalCompositeOperation = q.add ? 'lighter' : 'source-over';
      ctx.fillStyle = `rgba(${q.color},${q.kind === 'blob' ? f * 0.8 : f})`;
      if (q.kind === 'spark') {
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = q.size * 0.7;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (q.kind === 'blob' ? 0.6 + f * 0.6 : 1), 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    this.parts = this.parts.filter((q) => q.life > 0);
  }

  drawScreen(ctx, g, view, dt, now) {
    const { w, h } = view;
    const S = STYLE[g.act];
    if (!view.preview) {
      ctx.globalCompositeOperation = 'lighter';
      for (const m of this.motes) {
        m.y -= dt * (0.01 + m.s * 0.02) * (g.act === 3 ? 1.6 : 1);
        m.x += Math.sin(now * 0.5 + m.p) * dt * 0.01;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        ctx.fillStyle = `rgba(${S.moteColor},${0.05 + m.s * 0.08})`;
        ctx.fillRect(m.x * w, m.y * h, 1 + m.s * 2, 1 + m.s * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    const p = g.player;
    const low = g.mode === 'dead' ? 1 : Math.max(0, 1 - p.ember / 35);
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    const red = Math.max(this.hurt * 0.55, low * (0.25 + Math.sin(now * 6) * 0.1));
    if (red > 0.01) {
      const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(120,10,0,${red})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    }
    this.flash = Math.max(0, this.flash - dt * 2);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,220,170,${this.flash * 0.35})`; ctx.fillRect(0, 0, w, h); }
    this.white = Math.max(0, this.white - dt * 0.6);
    if (this.white > 0) { ctx.fillStyle = `rgba(255,245,230,${this.white * 0.85})`; ctx.fillRect(0, 0, w, h); }
  }
}

/* ── the things in the dark ─────────────────────────────────────────────── */

const DRAW = {
  mite(ctx, e, now) {
    const stretch = e.state === 'leap' ? 1.5 : e.state === 'crouch' ? 0.75 : 1;
    ctx.rotate(e.lock ?? e.face);
    ctx.scale(stretch, 1 / stretch);
    ctx.fillStyle = '#0d0b10';
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, r = i % 2 ? e.r * 0.7 : e.r * (1.25 + Math.sin(now * 20 + i + e.weave) * 0.12);
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  },
  husk(ctx, e, now) {
    const lean = e.state === 'windup' ? -5 : e.state === 'lunge' ? 5 : Math.sin(now * 3 + e.weave) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(3, 9, 15, 8, 0, 0, TAU); ctx.fill();
    ctx.rotate(e.lock && (e.state === 'windup' || e.state === 'lunge') ? e.lock : e.face);
    ctx.translate(lean, 0);
    ctx.fillStyle = '#29241f';
    ctx.beginPath(); ctx.ellipse(-2, 0, 14, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a322b';
    ctx.beginPath(); ctx.ellipse(-6, -8, 7, 6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-6, 8, 7, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b1714';
    ctx.beginPath(); ctx.arc(7, 0, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a322b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, -12); ctx.lineTo(14, -14); ctx.moveTo(2, 12); ctx.lineTo(14, 14); ctx.stroke();
  },
  wraith(ctx, e, now) {
    const bob = Math.sin(now * 3 + e.weave) * 3;
    ctx.translate(0, bob - 4);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, 16 - bob, 9, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(150,190,210,.55)';
    ctx.beginPath();
    ctx.moveTo(-10, 12);
    for (let i = 0; i <= 5; i++) ctx.lineTo(-10 + i * 4, 12 + (i % 2 ? 5 : 0) + Math.sin(now * 8 + i) * 2);
    ctx.lineTo(10, 12); ctx.quadraticCurveTo(12, -8, 0, -14); ctx.quadraticCurveTo(-12, -8, -10, 12);
    ctx.fill();
    ctx.fillStyle = '#0c1418';
    ctx.beginPath(); ctx.ellipse(0, -6, 6, 7, 0, 0, TAU); ctx.fill();
  },
  shade(ctx, e, now) {
    const flick = 0.6 + Math.sin(now * 23 + e.weave) * 0.2;
    ctx.globalAlpha *= e.state === 'fade' ? Math.max(0.1, e.t / 0.55) : flick;
    ctx.rotate(e.face);
    ctx.fillStyle = '#07050b';
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -11); ctx.quadraticCurveTo(-3, 0, -8, 11); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,90,220,.6)'; ctx.lineWidth = 1; ctx.stroke();
  },
  warden(ctx, e, now) {
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.ellipse(5, 24, 38, 17, 0, 0, TAU); ctx.fill();
    ctx.rotate(e.face);
    if (e.pose === 'dazed') ctx.rotate(Math.sin(now * 8) * 0.15);
    if (e.pose === 'charge' || e.pose === 'crouch') ctx.translate(e.pose === 'charge' ? 6 : -4, 0);
    ctx.fillStyle = '#1c1918';
    ctx.beginPath(); ctx.ellipse(-12, 0, 22, 30, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3b3736';
    ctx.beginPath(); ctx.ellipse(0, 0, 19, 25, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2625';
    ctx.fillRect(-4, -24, 3, 48);
    ctx.fillStyle = '#6b5d52';
    for (const sy of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(-2, sy * 24, 15, 11, sy * 0.25, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8c7b6c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(-2, sy * 24, 15, 11, sy * 0.25, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.fillStyle = '#a08c7a';
      for (const rx of [-9, 0, 9]) { ctx.beginPath(); ctx.arc(-2 + rx, sy * 24, 1.3, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#6b5d52';
    }
    ctx.fillStyle = '#4d4643';
    ctx.beginPath(); ctx.arc(8, 0, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5f5754';
    ctx.beginPath(); ctx.arc(6, -3, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0c0a0a';
    ctx.fillRect(15, -6, 3, 12);
    const key = { idle: [0.9, 30], wind: [2.2, 30], raise: [Math.PI, 18], slam: [0.05, 44], sweep: [-1.3, 42], crouch: [0.6, 30], charge: [0.15, 40], dazed: [1.4, 28], roar: [Math.PI * 0.9, 20] }[e.pose] ?? [0.9, 30];
    const [ka, kl] = key;
    const hx = 4, hy = 22;
    const tx = hx + Math.cos(ka) * kl, ty = hy + Math.sin(ka) * kl * (ka > 2 ? -1 : 1) * 0.6 - (ka > 2 ? 26 : 0);
    ctx.strokeStyle = '#2b2624'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-2, 18); ctx.lineTo(hx, hy); ctx.stroke();
    const dx = tx - hx, dy = ty - hy, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    ctx.strokeStyle = '#7a6a5a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(hx - ux * 6, hy - uy * 6); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hx - ux * 12, hy - uy * 12, 6, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#7a6a5a';
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(Math.atan2(uy, ux));
    ctx.fillRect(-10, 2, 5, 9); ctx.fillRect(-2, 2, 4, 13);
    ctx.restore();
    ctx.fillStyle = '#3d2e20';
    ctx.fillRect(10, -30, 11, 13);
    ctx.strokeStyle = '#1c1612'; ctx.lineWidth = 1.5; ctx.strokeRect(10, -30, 11, 13);
  },
  mask(ctx, e, now) {
    const bob = Math.sin(now * 2 + e.slot * 2) * 4;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 26, 14, 5, 0, 0, TAU); ctx.fill();
    ctx.translate(0, bob - 10);
    ctx.strokeStyle = 'rgba(200,170,110,.35)'; ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath(); ctx.moveTo(i * 10, 14);
      ctx.quadraticCurveTo(i * 16, 28 + Math.sin(now * 3 + i) * 6, i * 8, 42); ctx.stroke();
    }
    ctx.fillStyle = '#e6dccb';
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 21, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#b8914a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 21, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#1b1411';
    const brow = [0.25, -0.25, 0][e.slot] ?? 0;
    for (const sx of [-1, 1]) { ctx.save(); ctx.translate(sx * 6.5, -4); ctx.rotate(brow * sx); ctx.beginPath(); ctx.ellipse(0, 0, 4, 2.6, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.beginPath(); ctx.ellipse(0, 10, 4, e.glow ? 6 : 3.5, 0, 0, TAU); ctx.fill();
  },
  king(ctx, e, now, g) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath(); ctx.ellipse(4, 18, 26, 12, 0, 0, TAU); ctx.fill();
    if (g.boss?.phase >= 2) {
      ctx.fillStyle = 'rgba(40,10,60,.35)';
      ctx.beginPath(); ctx.arc(0, 0, 38 + Math.sin(now * 4) * 3, 0, TAU); ctx.fill();
    }
    ctx.save();
    ctx.rotate(e.face);
    ctx.fillStyle = '#16121a';
    ctx.beginPath(); ctx.moveTo(-24, -20); ctx.quadraticCurveTo(0, -30, 14, -12); ctx.lineTo(16, 12); ctx.quadraticCurveTo(0, 30, -24, 20); ctx.quadraticCurveTo(-30, 0, -24, -20); ctx.fill();
    ctx.fillStyle = '#2a2230';
    ctx.beginPath(); ctx.arc(2, 0, 11, 0, TAU); ctx.fill();
    const up = e.pose === 'raise' ? -1 : e.pose === 'slash' ? 1 : 0;
    ctx.strokeStyle = '#c9c2d6'; ctx.lineWidth = 3;
    ctx.beginPath();
    if (up < 0) { ctx.moveTo(4, 14); ctx.lineTo(-10, 40); }
    else if (up > 0) { ctx.moveTo(8, 10); ctx.lineTo(44, 24); }
    else { ctx.moveTo(8, 14); ctx.lineTo(30, 30); }
    ctx.stroke();
    ctx.restore();
    if (e.exposed > 0) {
      ctx.fillStyle = `rgba(255,50,50,${0.7 + Math.sin(now * 20) * 0.3})`;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    }
  },
};

const EYES = {
  mite(ctx, e, now, vis) {
    const c = Math.cos(e.lock ?? e.face), s = Math.sin(e.lock ?? e.face);
    const hot = e.state === 'crouch' ? 1 : 0.7;
    ctx.fillStyle = `rgba(255,${e.state === 'crouch' ? 60 : 90},60,${hot * vis})`;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(e.x + c * 3 - s * side * 3, e.y + s * 3 + c * side * 3, e.state === 'crouch' ? 1.8 : 1.3, 0, TAU); ctx.fill(); }
  },
  husk(ctx, e, now, vis) {
    const a = e.lock && (e.state === 'windup' || e.state === 'lunge') ? e.lock : e.face;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.fillStyle = `rgba(255,180,60,${(e.state === 'windup' ? 1 : 0.75) * vis})`;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(e.x + c * 10 - s * side * 3, e.y + s * 10 + c * side * 3, 1.8, 0, TAU); ctx.fill(); }
  },
  wraith(ctx, e, now, vis) {
    const y = e.y - 10 + Math.sin(now * 3 + e.weave) * 3;
    ctx.fillStyle = `rgba(140,230,255,${0.9 * vis})`;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(e.x + side * 2.5, y, 1.4, 0, TAU); ctx.fill(); }
    if (e.state === 'cast') {
      const f = 1 - e.t / 0.65;
      ctx.fillStyle = `rgba(140,230,255,${0.3 + f * 0.5})`;
      ctx.beginPath(); ctx.arc(e.x + Math.cos(e.face) * 14, e.y + Math.sin(e.face) * 14, 3 + f * 5, 0, TAU); ctx.fill();
    }
  },
  shade(ctx, e, now, vis) {
    if (e.state === 'fade') return;
    const c = Math.cos(e.face), s = Math.sin(e.face);
    ctx.fillStyle = `rgba(190,120,255,${0.9 * vis})`;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(e.x + c * 5 - s * side * 3, e.y + s * 5 + c * side * 3, 1.4, 0, TAU); ctx.fill(); }
  },
  warden(ctx, e, now) {
    const c = Math.cos(e.face), s = Math.sin(e.face);
    ctx.fillStyle = e.dazed > 0 ? 'rgba(255,240,200,.5)' : 'rgba(255,120,40,.95)';
    for (let i = -4; i <= 4; i += 2) ctx.fillRect(e.x + c * 16.5 - s * i - 1, e.y + s * 16.5 + c * i - 1, 2, 2);
    const c2 = Math.cos(e.face), s2 = Math.sin(e.face);
    const lx = e.x + c2 * 15.5 + s2 * 23.5, ly = e.y + s2 * 15.5 - c2 * 23.5;
    ctx.fillStyle = 'rgba(255,170,70,.35)';
    ctx.beginPath(); ctx.arc(lx, ly, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,215,130,.95)';
    ctx.beginPath(); ctx.arc(lx, ly, 3.5 + Math.sin(now * 12) * 0.7, 0, TAU); ctx.fill();
    if (e.dazed > 0) {
      ctx.fillStyle = 'rgba(255,240,200,.9)';
      for (let i = 0; i < 3; i++) { const a = now * 5 + (i * TAU) / 3; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * 20, e.y - 30 + Math.sin(a) * 6, 2, 0, TAU); ctx.fill(); }
    }
  },
  mask(ctx, e, now, vis, g) {
    const y = e.y - 10 + Math.sin(now * 2 + e.slot * 2) * 4;
    ctx.fillStyle = 'rgba(255,220,150,.9)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(e.x + sx * 6.5, y - 4, 1.4, 0, TAU); ctx.fill(); }
    if (e.glow) {
      const f = Math.min(1, Math.max(0, (g.t - e.glow.warnAt) / Math.max(0.01, e.glow.until - e.glow.warnAt)));
      ctx.strokeStyle = `rgba(255,230,160,${0.4 + f * 0.5})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, y, 34 - f * 14, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,230,160,${f * 0.35})`;
      ctx.beginPath(); ctx.arc(e.x, y, 20, 0, TAU); ctx.fill();
    }
  },
  king(ctx, e, now, vis, g) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i - (n - 1) / 2) / n) * 2.2;
      const x = e.x + Math.cos(a) * 10, y = e.y - 6 + Math.sin(a) * 10 - 6;
      const fl = Math.sin(now * 12 + i * 1.7) * 1.5;
      ctx.fillStyle = g.boss?.phase >= 2 ? 'rgba(190,120,255,.85)' : 'rgba(230,230,255,.85)';
      ctx.beginPath(); ctx.ellipse(x, y - 3, 1.8, 4 + fl, 0, 0, TAU); ctx.fill();
    }
    const c = Math.cos(e.face), s = Math.sin(e.face);
    ctx.fillStyle = 'rgba(200,190,255,.95)';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(e.x + c * 6 - s * side * 3, e.y + s * 6 + c * side * 3, 1.3, 0, TAU); ctx.fill(); }
    if (e.glow) {
      ctx.strokeStyle = 'rgba(200,120,255,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, 32 + Math.sin(now * 30) * 2, 0, TAU); ctx.stroke();
    }
  },
};

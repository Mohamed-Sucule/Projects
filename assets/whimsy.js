/* assets/whimsy.js — two small pleasures in the night.

   The sun can be pulled down. At 17:30 it says so in pencil, and if you take
   hold of it, it stays under your hand while you drag it to the horizon: the
   page scrolls to wherever the evening puts the sun there, so the dusk falls
   as you pull and you let go at Ember, in the dark. It is the scroll bar in
   another shape, so it works the same with motion off, and the keyboard and
   the scroll wheel lose nothing by not having it.

   Between one project and the next, where the sky is empty, the stars join
   into the next one's emblem and are named like a star chart: the Pin before
   Your Place, the Lighthouse before The Lamplighter, the Bell before Front Desk. They are drawn by the
   scroll bar, not a clock: the stars come out as the gap comes up and the lines
   between them join as it reaches the middle of the screen. They only appear
   where there is room for them, which is mostly not on a phone.

   Both are decoration, hidden from assistive technology. The arithmetic is
   exported here so the tests can check it; night.js does the drawing. */

/* ── the sun ──────────────────────────────────────────────────────────── */

/** Where the sun's top edge sits, in vh, for how much sun there is (1 high, 0 set). */
export const sunTop = (sun) => 18 + (1 - sun) * 82;

/** The x in [0, 1] where f(x) = v, for f rising from f(0) to f(1). */
export function invert(f, v) {
  if (v <= f(0)) return 0;
  if (v >= f(1)) return 1;
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (f(mid) < v) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** The scroll position that puts the sun's top edge at `top` vh, between the
    first two scenes: `from` and `to` are their scroll positions, `sunFrom` and
    `sunTo` how much sun each has, and `ease` how the sky moves between them. */
export function pullTo({ top, from, to, sunFrom, sunTo, ease }) {
  const sun = 1 - (top - 18) / 82;
  const share = Math.max(0, Math.min(1, (sun - sunFrom) / (sunTo - sunFrom)));
  return from + invert(ease, share) * (to - from);
}

/* ── the constellations ───────────────────────────────────────────────── */

const ring = (cx, cy, r, n, start = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos(start + (i / n) * Math.PI * 2), cy + r * Math.sin(start + (i / n) * Math.PI * 2)]);
const closed = (pts) => [...pts, pts[0]];

/** Each scene's emblem, in a unit square: lines drawn star to star, and lone stars. */
export const SHAPES = {
  ember: { name: 'the Flame', lines: [[[.5, 0], [.66, .24], [.8, .5], [.74, .8], [.5, 1], [.26, .8], [.2, .5], [.36, .3], [.5, 0]], [[.5, .48], [.62, .76], [.5, .9], [.38, .76], [.5, .48]]] },
  'your-place': { name: 'the Pin', lines: [ring(.5, .32, .26, 7).slice(1, 7), [[.28, .45], [.5, 1], [.72, .45]]] },
  flurdle: { name: 'the Hexagon', lines: [closed(ring(.5, .5, .46, 6, -Math.PI / 6))], dots: [[.5, .5]] },
  lamplighter: { name: 'the Lighthouse', lines: [[[.4, .96], [.45, .34], [.55, .34], [.6, .96], [.4, .96]], [[.45, .34], [.5, .22], [.55, .34]], [[.5, .22], [.04, .04]], [[.5, .22], [.04, .4]]] },
  nightshift: { name: 'the Mast', lines: [[[.3, .96], [.5, .08], [.7, .96]], [[.41, .5], [.59, .5]], [[.36, .74], [.64, .74]]], dots: [[.72, .1], [.8, .2], [.28, .1], [.2, .2]] },
  room: { name: 'the Key', lines: [closed(ring(.24, .5, .17, 6)), [[.41, .5], [.96, .5]], [[.78, .5], [.78, .68]], [[.9, .5], [.9, .64]]] },
  'small-hours': { name: 'the Cup', lines: [[[.24, .38], [.3, .88], [.64, .88], [.7, .38]], [[.7, .46], [.86, .52], [.68, .68]]], dots: [[.4, .22], [.5, .1], [.58, .24]] },
  'oklch-studio': { name: 'the Wheel', lines: [closed(ring(.5, .5, .44, 8))], dots: [[.5, .5]] },
  covers: { name: 'the Table', lines: [[[.3, .36], [.7, .36], [.7, .64], [.3, .64], [.3, .36]]], dots: [[.5, .16], [.5, .84], [.12, .5], [.88, .5]] },
  frontdesk: { name: 'the Bell', lines: [[[.1, .8], [.9, .8]], [[.18, .74], [.22, .56], [.34, .42], [.5, .37], [.66, .42], [.78, .56], [.82, .74], [.18, .74]], [[.5, .37], [.5, .26]]], dots: [[.5, .19]] },
  morning: { name: 'the Sun', lines: [closed(ring(.5, .5, .22, 8)), ...ring(.5, .5, 1, 8).map((_, i) => { const a = -Math.PI / 2 + (i / 8) * Math.PI * 2; return [[.5 + .32 * Math.cos(a), .5 + .32 * Math.sin(a)], [.5 + .46 * Math.cos(a), .5 + .46 * Math.sin(a)]]; })] },
};

/** Every star in a shape once, whether it ends a line or stands alone. */
export function stars(shape) {
  const seen = new Map();
  for (const p of [...shape.lines.flat(), ...(shape.dots ?? [])]) seen.set(p.map((v) => v.toFixed(3)).join(), p);
  return [...seen.values()];
}

/** Where a constellation goes in the gap between two scenes' content (`above`
    is where the first ends and `below` where the next begins, on screen), or
    null when there is no room. `shown` is how much the gap is the one being
    looked at, 1 in the middle of the screen; the stars come out first and the
    lines join after them. */
export const ROOM = 200;
export function chartPlace(above, below, vh, vw) {
  const gap = below - above;
  if (gap < ROOM) return null;
  const mid = (above + below) / 2;
  const shown = Math.max(0, Math.min(1, 1 - Math.abs(mid - vh / 2) / (vh * 0.55)));
  if (shown === 0) return null;
  const size = Math.min(240, gap * 0.62, vw * 0.5);
  return {
    x: vw / 2, y: mid - 22, size, shown,
    stars: Math.min(1, shown * 2),
    lines: Math.max(0, Math.min(1, (shown - 0.35) / 0.45)),
    label: Math.max(0, Math.min(1, (shown - 0.5) * 2.5)),
  };
}

/** Builds the chart layer for the scenes and returns what night.js calls: measure
    when the page changes height, draw when it scrolls. */
export function startConstellations(scenes) {
  const NS = 'http://www.w3.org/2000/svg';
  const host = document.createElement('div');
  host.className = 'sky-chart';
  host.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(NS, 'svg');
  host.append(svg);
  document.body.append(host);

  const charts = [];
  for (let i = 1; i < scenes.length; i++) {
    const shape = SHAPES[scenes[i].id];
    if (!shape) continue;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'c');
    for (const line of shape.lines) {
      const pl = document.createElementNS(NS, 'polyline');
      pl.setAttribute('points', line.map(([x, y]) => `${(x * 100).toFixed(1)},${(y * 100).toFixed(1)}`).join(' '));
      pl.setAttribute('pathLength', '1');
      g.append(pl);
    }
    stars(shape).forEach(([x, y], k) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', (x * 100).toFixed(1));
      c.setAttribute('cy', (y * 100).toFixed(1));
      c.setAttribute('r', k % 3 === 0 ? '2.6' : '1.8');
      g.append(c);
    });
    svg.append(g);
    const label = document.createElement('p');
    label.className = 'name';
    label.innerHTML = `<b>${shape.name}</b><span>${scenes[i].dataset.hour} · ${scenes[i].dataset.name}</span>`;
    host.append(label);
    charts.push({ i, g, label, lines: [...g.querySelectorAll('polyline')], on: false });
  }

  /* Where each scene's content begins and ends on the page, kept so scrolling
     only does arithmetic. */
  let spans = [];
  const measure = () => {
    spans = scenes.map((s) => {
      /* The notes in the margin count as content, so a constellation never sits on one. */
      const parts = [...(s.querySelector(':scope > .wrap') ?? s).children, ...s.querySelectorAll('.scribble')]
        .map((k) => k.getBoundingClientRect()).filter((r) => r.height > 0);
      if (!parts.length) { const r = s.getBoundingClientRect(); parts.push(r); }
      return { top: Math.min(...parts.map((r) => r.top)) + scrollY, bottom: Math.max(...parts.map((r) => r.bottom)) + scrollY };
    });
  };

  const draw = () => {
    if (!spans.length) return;
    const vh = innerHeight, vw = innerWidth, y = scrollY;
    for (const c of charts) {
      const at = chartPlace(spans[c.i - 1].bottom - y, spans[c.i].top - y, vh, vw);
      if (!at) {
        if (c.on) { c.on = false; c.g.style.display = c.label.style.display = 'none'; }
        continue;
      }
      if (!c.on) { c.on = true; c.g.style.display = c.label.style.display = ''; }
      c.g.setAttribute('transform', `translate(${(at.x - at.size / 2).toFixed(1)} ${(at.y - at.size / 2).toFixed(1)}) scale(${(at.size / 100).toFixed(4)})`);
      c.g.style.opacity = at.stars.toFixed(3);
      c.g.style.strokeWidth = (100 / at.size).toFixed(3); // a hairline at any size
      for (const l of c.lines) l.style.strokeDashoffset = (1 - at.lines).toFixed(3);
      c.label.style.transform = `translate(${at.x.toFixed(1)}px, ${(at.y + at.size / 2 + 8).toFixed(1)}px) translateX(-50%)`;
      c.label.style.opacity = at.label.toFixed(3);
    }
  };

  for (const c of charts) c.g.style.display = c.label.style.display = 'none';
  return { measure, draw };
}

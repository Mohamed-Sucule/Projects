/* atlas/islands.js — every project drawn as a small floating world.

   One shared island (rock, cap of land, roots, a light underneath it) and, on
   top, a scene that is the project rather than a picture with its name pasted
   on: Claims Desk is a tower whose scan line reads a form, Raft Lab is five
   pillars passing a heartbeat, Ember is the last beacon still burning.

   Everything is SVG built from strings, so an island costs a few kilobytes and
   no requests. Motion is a handful of CSS classes (a-*) plus SMIL where a
   rotation needs an exact centre; atlas.css pauses both for anyone who has
   asked for reduced motion, and the page pauses islands that are off screen. */

const STAR = '#E8C7AA';
const PAPER = '#efe6d6';
const LIT = '#ffd98a';
const INK = '#141b2e';

/* ── tiny helpers ───────────────────────────────────────────────────────── */

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(c, amt) {
  const [r, g, b] = hex(c);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const c = (x, y, rad, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}" ${extra}/>`;
const e = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const p = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w = 1, extra = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const d = (s) => `style="--d:${s}s"`;
const spin = (cx, cy, dur, dir = 1) =>
  `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="${360 * dir} ${cx} ${cy}" dur="${dur}s" repeatCount="indefinite"/>`;
const sway = (cx, cy, deg, dur) =>
  `<animateTransform attributeName="transform" type="rotate" values="${-deg} ${cx} ${cy};${deg} ${cx} ${cy};${-deg} ${cx} ${cy}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>`;
const along = (path, dur, delay = 0) =>
  `<animateMotion path="${path}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" rotate="0"/>`;

/* A box seen from the front and a little above: the building block of every
   piece of architecture here. (x, y) is the bottom-left of the front face. */
function box(x, y, w, h, dep, col, extra = '') {
  const k = dep * 0.5;
  return `<g ${extra}>`
    + poly(`${x},${y - h} ${x + dep},${y - h - k} ${x + w + dep},${y - h - k} ${x + w},${y - h}`, shade(col, 0.28))
    + poly(`${x + w},${y} ${x + w},${y - h} ${x + w + dep},${y - h - k} ${x + w + dep},${y - k}`, shade(col, -0.32))
    + r(x, y - h, w, h, col)
    + '</g>';
}
const windows = (x, y, cols, rows, gapX, gapY, size, lit = LIT, cls = '') => {
  let s = '';
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    s += r(x + i * gapX, y + j * gapY, size, size * 1.3, lit, `class="${cls}" ${d(((i * 7 + j * 3) % 5) * 0.7)} opacity="${0.75 + ((i + j) % 2) * 0.25}"`);
  }
  return s;
};

/* ── the island every scene stands on ───────────────────────────────────── */

/* Six silhouettes, so no two neighbouring worlds share an outline: a cone of rock,
   a needle, a flat shelf with a waterfall, a pair joined by a bridge, a faceted
   crystal, and a cap held up by a ring of orbiting stones. */
function body(form, rand) {
  const pts = [];
  if (form === 'spire') {
    pts.push([46, 118], [64, 140], [84, 150], [100, 182], [112, 226], [124, 190], [140, 160], [160, 146], [182, 132], [194, 118]);
  } else if (form === 'shelf') {
    for (let i = 0; i <= 8; i++) { const x = 40 + i * 20; pts.push([x + (rand() - 0.5) * 6, 150 + (i % 2) * 8 + rand() * 10 - (i === 0 || i === 8 ? 26 : 0)]); }
  } else if (form === 'twin') {
    pts.push([40, 118], [56, 156], [78, 190], [96, 162], [112, 150], [128, 166], [146, 200], [168, 172], [188, 140], [200, 118]);
  } else if (form === 'crystal') {
    pts.push([40, 118], [58, 150], [72, 142], [86, 176], [104, 166], [118, 214], [134, 170], [150, 182], [166, 146], [184, 152], [200, 118]);
  } else {
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([40 + t * 160 + (rand() - 0.5) * 8, 120 + Math.sin(Math.PI * t) * (form === 'ring' ? 22 + rand() * 6 : 62 + rand() * 18) + (rand() - 0.5) * 8]);
    }
  }
  return pts;
}

function base(id, [land, rock, glow], form = 'cone', region = '') {
  const rand = rng(id);
  const pts = body(form, rand);
  const tip = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const path = `M38,118 ${pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L202,118 Z`;
  const strata = [0.35, 0.6].map((k) => {
    const y = 122 + k * (tip[1] - 122);
    const half = 80 * (1 - k * 0.8);
    return `<path d="M${120 - half},${y} Q120,${y + 6} ${120 + half},${y - 2}" stroke="${shade(rock, -0.35)}" stroke-width="1.4" fill="none" opacity=".6"/>`;
  }).join('');
  let roots = '';
  for (let i = 0; i < 5; i++) {
    const x = 60 + i * 30 + (rand() - 0.5) * 12;
    const len = 14 + rand() * 26;
    roots += `<path d="M${x},${126 + rand() * 6} q${(rand() - 0.5) * 10},${len / 2} ${(rand() - 0.5) * 6},${len}" stroke="${shade(land, -0.2)}" stroke-width="1.2" fill="none" opacity=".7"/>`;
    roots += c(x + (rand() - 0.5) * 6, 126 + len + 4, 1.4, glow, 'opacity=".7"');
  }
  let extra = '';
  if (form === 'shelf') {
    /* water pouring off the edge of the shelf and never landing */
    extra += `<defs><linearGradient id="${id}-fall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".7"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></linearGradient></defs>`
      + r(186, 120, 5, 90, `url(#${id}-fall)`) + r(188, 124, 1.4, 70, '#ffffff', `opacity=".5" class="a-pulse" ${d(0.4)}`);
  } else if (form === 'twin') {
    /* the smaller half, with a bridge back to the main island */
    extra += `<g class="frag frag-r">${e(214, 92, 18, 5, shade(land, -0.1))}${p('M196,92 L214,128 L232,92 Z', `url(#${id}-rock)`)}</g>`
      + `<path d="M190,104 Q203,98 200,93" stroke="${STAR}" stroke-width="1.4" fill="none" opacity=".6"/>`;
  } else if (form === 'crystal') {
    /* shards hanging under the rock, lit from inside */
    for (const [x, y, h] of [[80, 170, 22], [118, 210, 30], [150, 184, 18]]) {
      extra += poly(`${x - 4},${y} ${x + 4},${y} ${x},${y + h}`, glow, `opacity=".55" class="a-pulse" ${d(x / 50)}`);
    }
    extra += `<path d="M72,142 L104,166 L118,214" stroke="${glow}" stroke-width=".8" fill="none" opacity=".45"/>`;
  } else if (form === 'ring') {
    /* stones orbiting under a thin cap, holding it up by no visible means */
    const stones = [0, 1, 2, 3, 4, 5].map((i) => poly(`${-5},0 0,${-4} 6,${-1} 2,5`, `url(#${id}-rock)`, `transform="rotate(${i * 60}) translate(46 0)"`)).join('');
    extra += `<g transform="translate(120 160) scale(1 .3)"><g>${spin(0, 0, 18)}${stones}</g></g>`
      + e(120, 160, 46, 14, 'none', `stroke="${glow}" stroke-width=".8" stroke-dasharray="2 5" opacity=".5"`);
  }
  const g = grammar(region, id, pts, tip, [land, rock, glow], rand);
  return `
  <defs>
    <clipPath id="${id}-clip"><path d="${path}"/></clipPath>
    <linearGradient id="${id}-rock" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${shade(rock, 0.18)}"/><stop offset=".55" stop-color="${rock}"/><stop offset="1" stop-color="${shade(rock, -0.55)}"/>
    </linearGradient>
    <linearGradient id="${id}-land" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(land, 0.22)}"/><stop offset="1" stop-color="${shade(land, -0.25)}"/>
    </linearGradient>
    <radialGradient id="${id}-glow">
      <stop offset="0" stop-color="${glow}" stop-opacity=".55"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g class="glow-under">${e(120, tip[1] + 10, 74, 22, `url(#${id}-glow)`, 'class="a-pulse slow"')}</g>
  ${g.back}
  ${p(path, `url(#${id}-rock)`)}
  ${strata}${roots}${extra}
  <g clip-path="url(#${id}-clip)">${g.on}</g>
  ${e(120, 118, 84, 21, shade(land, -0.35))}
  ${e(120, 115, 82, 19, `url(#${id}-land)`)}
  ${g.front}
  <path d="M42,112 Q120,90 198,112" stroke="${STAR}" stroke-width="1.2" fill="none" opacity=".35"/>
  <g class="frag frag-l"><g class="a-bob" ${d(rand() * 3)}>${poly(`${14},${96} ${24},${92} ${28},${100} ${20},${108}`, `url(#${id}-rock)`)}</g></g>
  <g class="frag frag-r"><g class="a-bob" ${d(1.5 + rand() * 3)}>${poly(`${210},${128} ${222},${124} ${226},${134} ${214},${140}`, `url(#${id}-rock)`)}</g></g>`;
}

/* ── the regions: one material language each ───────────────────────────── */

/* Every island has its own silhouette and scene, and every region has a grammar
   its islands share, so a group is recognisable at a glance: the archipelago is
   masonry and lit windows, the observatory crystal with light running in its
   veins and a ring in orbit, the night isles dark rock in a pool of black water
   with one lamp, the reef bright and bubbled, the shallows brass and liquid, and
   the engine rooms drawn as their own blueprint. Each returns what goes behind
   the rock, on it (clipped to its outline) and in front of the cap. */
function grammar(region, id, pts, tip, [land, rock, glow], rand) {
  const out = { back: '', on: '', front: '' };
  const lit = (x, y, w = 3, h = 4, dd = 0) => r(x, y, w, h, LIT, `class="a-flicker" ${d(dd)} opacity=".9"`);
  if (region === 'products') {
    let m = '';
    for (const [y, off] of [[127, 0], [135, 9], [143, 4], [151, 12]]) {
      m += line(40, y, 200, y, shade(rock, -0.45), 0.9, 'opacity=".55"');
      for (let x = 46 + off; x < 196; x += 18) m += line(x, y, x, y + 8, shade(rock, -0.45), 0.8, 'opacity=".45"');
    }
    out.on = m + [[70, 129], [94, 137], [138, 129], [160, 137], [116, 145]].map(([x, y], i) => lit(x, y, 3, 4, i * 0.6)).join('');
    out.back = e(120, 127, 76, 12, shade(rock, 0.12), 'opacity=".9"');
    out.front = r(197, 92, 2, 22, shade(rock, 0.3)) + c(198, 91, 2.4, LIT, 'class="a-pulse"') + c(198, 91, 6, LIT, 'opacity=".18"');
  } else if (region === 'models') {
    const nodes = [[70, 128], [96, 140], [118, 158], [142, 138], [166, 128], [124, 186], [104, 170]].filter(([, y]) => y < tip[1] - 6);
    let v = '';
    for (let i = 1; i < nodes.length; i++) v += line(...nodes[i - 1], ...nodes[i], glow, 1, 'opacity=".55"');
    v += nodes.map(([x, y], i) => c(x, y, 1.8, glow, `class="a-pulse" ${d(i * 0.4)}`)).join('');
    out.on = r(30, 110, 180, 130, '#1b2350', 'opacity=".35"') + v;
    const orbit = 'M14,124 A106,26 0 1 0 226,124 A106,26 0 1 0 14,124';
    out.back = `<path d="M14,124 A106,26 0 0 1 226,124" fill="none" stroke="${glow}" stroke-width=".9" opacity=".35"/>`;
    out.front = `<path d="M226,124 A106,26 0 0 1 14,124" fill="none" stroke="${glow}" stroke-width="1" opacity=".55"/>`
      + `<circle r="2.6" fill="${STAR}">${along(orbit, 9 + rand() * 4)}</circle>`;
  } else if (region === 'stories') {
    out.back = e(120, 121, 104, 25, '#070b18', 'opacity=".92"') + e(120, 121, 104, 25, 'none', `stroke="${glow}" stroke-width=".6" opacity=".25"`);
    out.on = r(30, 110, 180, 130, '#05070f', 'opacity=".45"');
    out.front = `<g class="a-drift">${e(96, 128, 60, 4, '#cfd8ee', 'opacity=".14"')}</g>`
      + r(44, 96, 1.6, 18, shade(rock, 0.25)) + c(44.8, 95, 2.4, LIT, 'class="a-flicker"') + c(44.8, 95, 8, LIT, 'opacity=".16"')
      + `<path d="M44.8,124 L44.8,138" stroke="${LIT}" stroke-width="1.6" opacity=".35" class="a-pulse"/>`;
  } else if (region === 'games') {
    const blobs = pts.filter((_, i) => i % 2 === 1).map(([x, y], i) => {
      const rr = 3 + rand() * 4;
      const col = i % 2 ? glow : shade(glow, 0.35);
      return `<g class="a-bob" ${d(i * 0.5)}>${c(x + (rand() - 0.5) * 6, y + rr * 0.6, rr, col, 'opacity=".9"')}${c(x - rr * 0.3, y + rr * 0.2, rr * 0.35, '#ffffff', 'opacity=".5"')}</g>`;
    }).join('');
    out.front = blobs + `<path d="M48,108 Q120,86 192,108" stroke="${shade(glow, 0.4)}" stroke-width="2" fill="none" opacity=".55" stroke-linecap="round"/>`;
  } else if (region === 'workshop') {
    const gear = (cx, cy, rad, dur, dir) => {
      let teeth = '';
      for (let i = 0; i < 8; i++) teeth += `<rect x="${cx - 1.6}" y="${cy - rad - 2.6}" width="3.2" height="4" fill="#b08a4a" transform="rotate(${i * 45} ${cx} ${cy})"/>`;
      return `<g>${spin(cx, cy, dur, dir)}${teeth}${c(cx, cy, rad, '#b08a4a')}${c(cx, cy, rad * 0.4, '#5a4424')}</g>`;
    };
    out.on = `<path d="M44,132 Q90,140 120,134 T196,132" stroke="#c08a52" stroke-width="2.2" fill="none" opacity=".75"/>` + gear(72, 146, 8, 9, 1) + gear(86, 158, 5, 6, -1);
    out.front = e(154, 113, 22, 5, '#a8d4ee', 'opacity=".55"') + `<g class="a-pulse">${line(140, 112, 166, 112, '#ffffff', 1, 'opacity=".7"')}</g>`;
  } else if (region === 'engines') {
    let g = '';
    for (let x = 40; x <= 200; x += 10) g += line(x, 112, x, 230, '#9AE6D0', 0.5, 'opacity=".22"');
    for (let y = 118; y <= 230; y += 10) g += line(30, y, 210, y, '#9AE6D0', 0.5, 'opacity=".22"');
    out.on = r(30, 110, 180, 130, '#0c2533', 'opacity=".55"') + g;
    const outline = `M38,118 ${pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L202,118`;
    out.front = `<path d="${outline}" fill="none" stroke="#9AE6D0" stroke-width="1.1" opacity=".75"/>`
      + pts.filter((_, i) => i % 3 === 0).map(([x, y]) => r(x - 1.8, y - 1.8, 3.6, 3.6, 'none', 'stroke="#9AE6D0" stroke-width=".9" opacity=".8"')).join('')
      + `<g opacity=".6">${line(40, tip[1] + 14, 200, tip[1] + 14, '#9AE6D0', 0.8)}${line(40, tip[1] + 10, 40, tip[1] + 18, '#9AE6D0', 0.8)}${line(200, tip[1] + 10, 200, tip[1] + 18, '#9AE6D0', 0.8)}</g>`;
  }
  return out;
}

/* ── the scenes ─────────────────────────────────────────────────────────── */

const SCENES = {
  tally([land, , glow]) {
    let slips = '';
    for (let i = 0; i < 6; i++) slips += r(44 + (i % 2) * 6, 118, 7, 9, PAPER, `class="a-fall" ${d(i * 0.45)} rx="1"`);
    return `
      ${box(80, 120, 60, 30, 16, '#34436a')}
      ${[0, 1, 2, 3].map((i) => r(86 + i * 14, 94, 4, 26, shade('#34436a', 0.35))).join('')}
      ${r(104, 104, 12, 16, '#1d2540')}${r(108, 108, 4, 6, LIT, 'class="a-flicker"')}
      <g transform="translate(0,-2)">
        ${p('M80,88 Q98,74 117,84 L117,90 Q98,80 80,94 Z', PAPER)}
        ${p('M156,88 Q138,74 119,84 L119,90 Q138,80 156,94 Z', shade(PAPER, -0.08))}
        ${[0, 1, 2].map((i) => line(86 + i * 2, 88 - i * 3, 112, 84 - i * 2.4, '#b9ab93', 0.8)).join('')}
        ${[0, 1, 2].map((i) => line(124, 84 - i * 2.4, 150 - i * 2, 88 - i * 3, '#b9ab93', 0.8)).join('')}
        ${line(118, 84, 118, 92, '#8c7f6a', 1.6)}
      </g>
      ${slips}
      <g class="a-wander">${r(26, 140, 8, 10, '#ff6b6b', 'rx="1" transform="rotate(-18 30 145)"')}</g>
      <g class="a-scanx">
        ${c(160, 96, 10, glow, 'opacity=".18"')}
        <circle cx="160" cy="96" r="10" fill="none" stroke="${STAR}" stroke-width="2.2"/>
        ${line(167, 103, 176, 112, STAR, 3)}
      </g>
      ${c(184, 112, 2, land)}`;
  },

  frontdesk([, , glow]) {
    const tables = [[70, 116], [92, 124], [118, 128], [146, 124], [100, 108]];
    return `
      ${box(56, 112, 44, 22, 12, '#5a3f3a')}
      ${windows(61, 96, 3, 1, 12, 0, 6)}
      ${[0, 1, 2, 3, 4].map((i) => r(56 + i * 9, 88, 9, 5, i % 2 ? '#e8d9c4' : glow)).join('')}
      ${tables.map(([x, y]) => e(x, y, 7, 3, PAPER) + c(x - 9, y, 1.6, STAR) + c(x + 9, y, 1.6, STAR) + c(x, y - 0.5, 1.2, LIT, 'class="a-flicker"')).join('')}
      ${r(152, 50, 4, 70, '#3c3550')}
      ${p('M140,46 C140,26 168,26 168,46', 'none', `stroke="${STAR}" stroke-width="6" stroke-linecap="round"`)}
      ${e(140, 48, 6, 4, STAR)}${e(168, 48, 6, 4, STAR)}
      ${[0, 1, 2].map((i) => `<circle cx="154" cy="34" r="10" fill="none" stroke="${glow}" stroke-width="1.5" class="a-ripple" ${d(i * 0.9)}/>`).join('')}`;
  },

  handbook([, , glow]) {
    const books = [['#7a4a4a', 74, 0], ['#4a6a7a', 68, 3], ['#6a6a3a', 62, -2], ['#5a4a7a', 56, 2]];
    let y = 120;
    let s = '';
    for (const [col, w, rot] of books) {
      s += `<g transform="rotate(${rot} 120 ${y - 5})">${r(120 - w / 2, y - 11, w, 11, col, 'rx="1.5"')}${r(120 - w / 2, y - 11, w, 2.5, shade(col, 0.35))}${r(120 + w / 2 - 6, y - 11, 2, 11, STAR, 'opacity=".55"')}</g>`;
      y -= 11;
    }
    return `
      <g class="a-pulse">${poly(`110,${y + 1} 130,${y + 1} 152,14 88,14`, glow, 'opacity=".18"')}</g>
      ${s}
      ${p(`M120,${y + 2} Q104,${y - 6} 92,${y} L92,${y + 4} Q104,${y - 2} 120,${y + 5} Z`, PAPER)}
      ${p(`M120,${y + 2} Q136,${y - 6} 148,${y} L148,${y + 4} Q136,${y - 2} 120,${y + 5} Z`, shade(PAPER, -0.08))}
      <text x="120" y="40" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-size="30" fill="${glow}" class="a-bob">&#8220;</text>
      ${r(150, 104, 3, 20, '#c75a5a', 'class="a-sway"')}${r(86, 96, 3, 18, glow, 'class="a-sway" style="--d:1.2s"')}`;
  },

  callcoach([, , glow]) {
    const steps = [0, 1, 2].map((i) => `<path d="M${64 + i * 8},${118 - i * 6} Q120,${92 - i * 10} ${176 - i * 8},${118 - i * 6}" stroke="${shade('#3d5a6b', 0.2 + i * 0.12)}" stroke-width="5" fill="none"/>`).join('');
    return `
      ${steps}
      ${r(108, 112, 24, 8, '#2a3a4a')}
      ${poly('168,28 162,104 174,104', '#53647a')}
      ${line(164, 60, 172, 60, '#8aa0b8')}${line(163, 80, 173, 80, '#8aa0b8')}
      ${c(168, 26, 3, '#ff6b6b', 'class="a-blink"')}
      <g class="a-bob">${r(70, 50, 34, 18, PAPER, 'rx="9"')}${poly('80,67 86,67 78,74', PAPER)}
        ${c(80, 59, 2, INK)}${c(87, 59, 2, INK)}${c(94, 59, 2, INK)}</g>
      <g class="a-bob" ${d(1.4)}>${r(120, 36, 30, 16, glow, 'rx="8"')}${poly('140,51 146,51 148,58', glow)}
        ${line(127, 44, 143, 44, INK, 1.6)}</g>
      <path d="M58,92 l6,-6 l6,10 l6,-14 l6,18 l6,-12 l6,6" stroke="${glow}" stroke-width="1.6" fill="none" class="a-dash" stroke-dasharray="4 3"/>`;
  },

  claims([, , glow]) {
    return `
      ${box(94, 120, 52, 54, 14, '#3b4466')}
      ${r(104, 72, 30, 40, PAPER, 'rx="1"')}
      ${[0, 1, 2, 3, 4].map((i) => line(108, 80 + i * 6, 128 - (i % 2) * 6, 80 + i * 6, '#a89e8a', 1)).join('')}
      ${r(122, 100, 9, 7, 'none', 'stroke="#c75a5a" stroke-width="1.2"')}
      <g class="a-scan">${r(101, 74, 36, 2.2, glow)}${r(101, 70, 36, 9, glow, 'opacity=".18"')}</g>
      ${[['#7ad18a', 0], ['#ff7a7a', 1], [glow, 2]].map(([col, i]) => poly(`${150 + i * 9},${118} ${156 + i * 9},${118} ${168 + i * 9},${146} ${162 + i * 9},${146}`, col, 'opacity=".85"')).join('')}
      <g class="a-bob" ${d(0.8)}>${r(64, 62, 18, 12, PAPER, 'rx="1"')}${p('M64,62 L73,69 L82,62', 'none', 'stroke="#a89e8a" stroke-width="1"')}</g>`;
  },

  covers([, , glow]) {
    const tabs = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const x = 76 + i * 30 + j * 6;
      const y = 102 + j * 9;
      tabs.push(i === 1 && j === 1 ? e(x + 6, y, 8, 3.5, PAPER) : r(x, y - 3, 13, 6, PAPER, 'rx="1"'));
      tabs.push(c(x - 3, y, 1.4, STAR) + c(x + 16, y, 1.4, STAR));
    }
    return `
      ${poly('62,96 178,96 190,128 50,128', '#3b4a34')}
      ${poly('62,96 178,96 178,93 62,93', shade('#3b4a34', 0.3))}
      ${r(70, 84, 100, 6, '#5a3f3a')}${r(70, 82, 100, 2, shade('#5a3f3a', 0.4))}
      ${tabs.join('')}
      <g class="a-wander">${c(110, 112, 2.6, glow)}</g>
      <g class="a-wander" ${d(2.2)}>${c(140, 106, 2.6, '#ff8a6b')}</g>
      <g class="a-wander" ${d(4)}>${c(86, 120, 2.6, LIT)}</g>`;
  },

  attention([, , glow]) {
    const stars = [[48, 46], [72, 34], [98, 28], [124, 26], [150, 30], [176, 38], [198, 50]];
    const arcs = [[0, 2], [1, 4], [2, 5], [3, 6]].map(([a, b], i) => {
      const [x1, y1] = stars[a];
      const [x2, y2] = stars[b];
      return `<path d="M${x1},${y1} Q${(x1 + x2) / 2},${Math.min(y1, y2) - 26} ${x2},${y2}" stroke="${glow}" stroke-width="${i === 2 ? 2.4 : 1}" fill="none" opacity="${i === 2 ? 0.9 : 0.35}" ${i === 2 ? 'class="a-pulse"' : ''}/>`;
    }).join('');
    return `
      ${arcs}
      ${stars.map(([x, y], i) => c(x, y, i === 5 ? 3.4 : 2.4, i === 5 ? glow : STAR, `class="a-twinkle" ${d(i * 0.4)}`)).join('')}
      ${box(96, 120, 44, 22, 14, '#3b4470')}
      ${p('M96,98 A22,22 0 0 1 140,98 Z', shade('#3b4470', 0.3))}
      ${r(116, 78, 4, 20, INK)}
      <g transform="rotate(-34 124 86)">${r(118, 70, 30, 7, '#8a96c8', 'rx="2"')}${r(146, 69, 4, 9, STAR)}</g>`;
  },

  tokens([, , glow]) {
    /* strawberry, split exactly as the page's trained tokeniser splits it */
    const parts = ['st', 'ra', 'w', 'ber', 'r', 'y'];
    let x = 62;
    let out = '';
    parts.forEach((t, i) => {
      const w = t.length * 8 + 9;
      const y = 74 - (i % 2) * 12;
      out += `<g class="a-bob" ${d(i * 0.35)}>${r(x, y, w, 18, shade('#5a4a78', 0.15), 'rx="4"')}${r(x, y, w, 3.5, shade('#5a4a78', 0.45), 'rx="2"')}
        <text x="${x + 4.5}" y="${y + 13.5}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="11" fill="${glow}">${t}</text></g>`;
      x += w + 3;
    });
    return `${out}
      ${poly('92,118 98,96 104,118', shade(glow, -0.2), 'opacity=".75"')}${poly('128,120 136,100 142,120', glow, 'opacity=".6"')}
      ${poly('150,116 154,104 158,116', STAR, 'opacity=".6"')}`;
  },

  evals([land, , glow]) {
    return `
      ${p('M54,118 C86,118 98,72 120,72 C142,72 154,118 186,118 Z', shade(land, 0.12))}
      ${line(120, 72, 120, 42, STAR, 2)}
      <g>${sway(120, 42, 6, 6)}
        ${line(92, 42, 148, 42, STAR, 2.2)}
        ${line(94, 42, 88, 58, STAR, 0.8)}${line(94, 42, 100, 58, STAR, 0.8)}${p('M86,58 Q94,64 102,58 Z', glow)}
        ${line(146, 42, 140, 58, STAR, 0.8)}${line(146, 42, 152, 58, STAR, 0.8)}${p('M138,58 Q146,64 154,58 Z', '#ff8a6b')}
      </g>
      ${c(120, 40, 3, STAR)}
      ${[[66, 92, 108], [174, 96, 110]].map(([x, y1, y2]) => line(x, y1, x, y2, glow, 1.4) + line(x - 4, y1, x + 4, y1, glow, 1.4) + line(x - 4, y2, x + 4, y2, glow, 1.4) + c(x, (y1 + y2) / 2, 2.2, glow)).join('')}`;
  },

  agents([, , glow]) {
    const gear = (cx, cy, rad, col, dir, dur) =>
      `<g>${spin(cx, cy, dur, dir)}<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${col}" stroke-width="5" stroke-dasharray="3.2 2.6"/>${c(cx, cy, rad - 2.5, col)}${c(cx, cy, rad / 3, INK)}</g>`;
    const track = 'M70,112 C70,98 170,98 170,112 C170,126 70,126 70,112 Z';
    return `
      ${gear(150, 66, 16, '#c99a4a', 1, 9)}${gear(124, 80, 10, '#a07a3a', -1, 5.6)}
      <path d="${track}" fill="none" stroke="${glow}" stroke-width="1.4" stroke-dasharray="3 3" opacity=".8"/>
      ${box(80, 108, 10, 9, 6, '#4a5a7a')}${box(116, 102, 10, 9, 6, '#4a5a7a')}${box(150, 116, 10, 9, 6, '#4a5a7a')}
      <g>${along(track, 7)}${r(-4, -10, 8, 9, STAR, 'rx="2"')}${c(-1.5, -6.5, 1, INK)}${c(1.5, -6.5, 1, INK)}${line(0, -10, 0, -13, STAR, 1)}${c(0, -14, 1.3, glow)}</g>`;
  },

  lamplighter([, , glow]) {
    return `
      ${poly('76,120 96,96 132,92 162,104 170,120', '#2c3542')}
      ${poly('108,96 132,96 128,48 112,48', PAPER)}
      ${poly('109.2,86 130.8,86 130,76 110,76', '#c75a5a')}${poly('110.6,66 129.4,66 128.8,58 111.2,58', '#c75a5a')}
      ${r(106, 44, 28, 4, INK)}
      ${r(112, 32, 16, 12, glow, 'class="a-flicker"')}
      ${p('M110,32 Q120,20 130,32 Z', INK)}
      <defs><linearGradient id="lamplighter-beam" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${glow}" stop-opacity=".75"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></linearGradient></defs>
      <g transform="translate(120 38)"><g>
        <animateTransform attributeName="transform" type="scale" values="1 1;-1 1;1 1" dur="6s" repeatCount="indefinite"/>
        ${poly('0,-3 104,-20 104,18 0,3', 'url(#lamplighter-beam)')}
      </g></g>
      ${[0, 1, 2].map((i) => `<path d="M${70 + i * 30},124 q8,-5 16,0" stroke="${STAR}" stroke-width="1.2" fill="none" opacity=".5" class="a-bob" ${d(i * 0.7)}/>`).join('')}`;
  },

  room([, , glow]) {
    return `
      ${box(88, 120, 56, 46, 22, '#4b3a3a')}
      ${r(98, 86, 14, 14, LIT, 'class="a-flicker"')}${line(105, 86, 105, 100, '#4b3a3a', 1.4)}${line(98, 93, 112, 93, '#4b3a3a', 1.4)}
      ${r(122, 92, 14, 28, '#2a1f24')}${c(132, 106, 1.6, STAR)}
      ${c(129, 101, 2, glow, 'class="a-pulse"')}${p('M128,102 L127,107 L131,107 L130,102 Z', glow, 'class="a-pulse"')}
      ${poly('84,74 116,52 170,52 166,56 118,57 92,75', shade('#4b3a3a', 0.4))}
      <g class="a-bob" ${d(0.6)}><circle cx="150" cy="34" r="5" fill="none" stroke="${glow}" stroke-width="2"/>${line(155, 34, 170, 34, glow, 2)}${line(166, 34, 166, 38, glow, 2)}${line(170, 34, 170, 39, glow, 2)}</g>`;
  },

  nightshift([, , glow]) {
    return `
      ${box(98, 120, 38, 24, 14, '#2f3a40')}
      ${poly('94,96 117,80 140,96', '#232b30')}${poly('140,96 117,80 124,76 152,90', shade('#232b30', -0.3))}
      ${r(106, 102, 8, 9, LIT, 'class="a-flicker slow"')}
      ${line(146, 88, 146, 28, '#5a6670', 1.6)}${line(140, 44, 152, 44, '#5a6670', 1.2)}${line(142, 56, 150, 56, '#5a6670', 1.2)}
      ${c(146, 26, 2.6, glow, 'class="a-blink"')}
      ${[0, 1, 2].map((i) => e(90 + i * 34, 108 + i * 4, 46, 6, STAR, `opacity=".1" class="a-drift" ${d(i * 2)}`)).join('')}`;
  },

  ember([, , glow]) {
    let sparks = '';
    for (let i = 0; i < 7; i++) sparks += c(112 + (i * 37) % 18, 54, 1.4 + (i % 3) * 0.5, glow, `class="a-rise" ${d(i * 0.55)}`);
    return `
      ${poly('70,120 86,74 98,120', '#1d1a24')}${poly('140,120 156,64 172,120', '#221d2a')}
      ${poly('104,120 112,70 128,70 136,120', '#2a2230')}
      ${e(120, 54, 40, 30, glow, 'style="--o:.22" class="a-pulse"')}
      ${p('M106,70 L134,70 L130,62 L110,62 Z', '#4a3a3a')}
      <g class="a-flame">${p('M120,26 C128,40 132,48 128,58 C126,63 114,63 112,58 C108,48 114,40 120,26 Z', glow)}
        ${p('M120,40 C124,48 125,52 123,58 C121,61 119,61 117,58 C115,52 117,48 120,40 Z', LIT)}</g>
      ${sparks}`;
  },

  ace([, , glow]) {
    return `
      ${poly('62,120 74,36 88,30 96,120', '#5a4a3e')}${poly('74,36 88,30 84,52 76,60', shade('#5a4a3e', 0.3))}
      ${poly('146,120 152,44 168,40 182,120', '#4f4236')}${poly('152,44 168,40 166,58', shade('#4f4236', 0.3))}
      ${e(170, 26, 16, 5, STAR, 'opacity=".25" class="a-drift"')}
      <g class="a-fly">${poly('100,72 132,80 108,86', PAPER)}${poly('100,72 112,80 108,86', shade(PAPER, -0.2))}
        <path d="M98,82 q-10,4 -20,0" stroke="${glow}" stroke-width="1" fill="none" stroke-dasharray="2 3" opacity=".7"/></g>`;
  },

  stack([, , glow]) {
    let s = '';
    let w = 64;
    let x = 88;
    let y = 118;
    for (let i = 0; i < 6; i++) {
      const col = shade('#4a5a7a', -0.1 + i * 0.08);
      s += box(x, y, w, 9, 10, col);
      x += i % 2 ? 3 : -1;
      w -= 5;
      y -= 9;
    }
    return `
      ${s}
      <g class="a-slide">${box(x, y, w, 9, 10, glow)}</g>
      <g class="a-fall" ${d(0.5)}>${box(150, 60, 8, 6, 6, shade(glow, -0.2))}</g>`;
  },

  tether([, , glow]) {
    return `
      <defs><radialGradient id="tether-planet" cx=".35" cy=".35"><stop offset="0" stop-color="#9a8ad8"/><stop offset="1" stop-color="#2a2a5a"/></radialGradient></defs>
      ${e(120, 76, 50, 16, 'none', `stroke="${glow}" stroke-width="1" stroke-dasharray="2 4" opacity=".6"`)}
      ${c(120, 76, 22, 'url(#tether-planet)')}
      ${e(120, 76, 30, 6, 'none', `stroke="${STAR}" stroke-width="1.6" opacity=".5"`)}
      <g transform="translate(120 76) scale(1 .32)"><g>${spin(0, 0, 5)}${line(0, 0, 50, 0, STAR, 1.2, 'opacity=".7"')}${c(50, 0, 6, glow)}</g></g>
      ${line(120, 98, 120, 112, '#3d4a6b', 4)}`;
  },

  sumo([, , glow]) {
    return `
      ${e(120, 108, 58, 14, '#7a6a4a')}${e(120, 106, 56, 13, '#9a8a5a')}
      ${e(120, 106, 46, 10, 'none', `stroke="${STAR}" stroke-width="2.4" stroke-dasharray="6 3"`)}
      <g class="a-nudge">${c(100, 98, 9, glow)}<g>${spin(100, 98, 3)}${line(100, 98, 112, 98, INK, 2)}</g></g>
      <g class="a-nudge rev">${c(142, 100, 9, '#8ad1ff')}<g>${spin(142, 100, 2.4, -1)}${line(142, 100, 130, 100, INK, 2)}</g></g>`;
  },

  tangle([, , glow]) {
    const tiles = [];
    const pipes = ['M0,8 H16', 'M8,0 V8 H16', 'M8,0 V16', 'M0,8 H8 V16', 'M8,0 V8 H0', 'M0,8 H16 M8,8 V16'];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const x = 88 + i * 22;
      const y = 72 + j * 22;
      const k = i + j * 3;
      const tile = `${r(0, 0, 18, 18, shade('#3d6a66', 0.1 + (k % 2) * 0.08), 'rx="3"')}<path d="${pipes[k]}" transform="translate(1 1)" stroke="${k === 4 ? STAR : glow}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
      tiles.push(k === 4
        ? `<g transform="translate(${x} ${y})"><g><animateTransform attributeName="transform" type="rotate" values="0 9 9;0 9 9;90 9 9;90 9 9" keyTimes="0;.6;.75;1" dur="4s" repeatCount="indefinite"/>${tile}</g></g>`
        : `<g transform="translate(${x} ${y})">${tile}</g>`);
    }
    return `${box(82, 120, 76, 6, 10, '#2a4a46')}${tiles.join('')}`;
  },

  sweeper([, , glow]) {
    const nums = { '1,0': '1', '2,0': '2', '0,1': '1', '1,1': '3', '3,1': '1' };
    let s = '';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const x = 84 + i * 18;
      const y = 66 + j * 18;
      const open = nums[`${i},${j}`] !== undefined || (i === 0 && j === 0);
      s += r(x, y, 16, 16, open ? '#2c3a3a' : shade('#5a6a5a', 0.2), 'rx="2"');
      if (!open) s += r(x, y, 16, 3, shade('#5a6a5a', 0.45), 'rx="1.5"');
      if (nums[`${i},${j}`]) s += `<text x="${x + 8}" y="${y + 12}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="${['', '#8ad1ff', '#9af0b8', '#ffb36b'][nums[`${i},${j}`]]}">${nums[`${i},${j}`]}</text>`;
    }
    return `
      ${box(80, 120, 80, 8, 10, '#3a4a40')}${s}
      ${line(150, 106, 150, 88, STAR, 1.4)}${poly('150,88 160,92 150,96', glow, 'class="a-sway"')}
      ${r(120, 102, 16, 16, glow, 'rx="2" style="--o:.3" class="a-pulse"')}`;
  },

  sudoku([, , glow]) {
    const digits = ['5', '3', '7', '6', '1', '9', '8', '4', '2'];
    let s = box(78, 120, 84, 10, 12, '#4a4460') + box(88, 110, 64, 10, 12, '#5d5470') + box(98, 100, 44, 30, 12, '#6d6488');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      s += `<text x="${106 + i * 14}" y="${82 + j * 9}" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-size="9" fill="${i === 1 && j === 1 ? glow : STAR}">${digits[i * 3 + j]}</text>`;
    }
    s += line(112, 72, 112, 98, STAR, 0.5, 'opacity=".5"') + line(126, 72, 126, 98, STAR, 0.5, 'opacity=".5"');
    return s + c(120, 79, 6, glow, 'style="--o:.3" class="a-pulse"');
  },

  sandbox([, , glow]) {
    let grains = '';
    for (let i = 0; i < 6; i++) grains += c(88 + (i % 3), 68, 1.3, '#e8c27a', `class="a-fall" ${d(i * 0.3)}`);
    return `
      ${line(74, 66, 70, 112, '#5a5060', 2)}${line(102, 66, 106, 112, '#5a5060', 2)}
      ${poly('70,44 106,44 94,66 82,66', '#6a6070')}${poly('70,44 106,44 104,40 72,40', '#8a8090')}
      ${r(87, 66, 2.5, 34, '#e8c27a', 'opacity=".75"')}${grains}
      ${p('M64,120 Q88,92 112,120 Z', '#d9b36b')}
      ${e(152, 116, 18, 5, '#5aa0d8', 'opacity=".9"')}${e(148, 115, 6, 1.4, STAR, 'opacity=".5"')}
      <g class="a-flame">${p('M168,108 C172,100 174,96 172,90 C176,94 178,100 176,108 Z', glow)}${p('M170,108 C171,104 172,102 172,99 C174,102 174,105 173,108 Z', LIT)}</g>
      ${c(172, 84, 3, STAR, `opacity=".25" class="a-rise" ${d(0.4)}`)}`;
  },

  mercury([, , glow]) {
    return `
      <defs><linearGradient id="mercury-liquid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffcf9a"/><stop offset=".45" stop-color="#c88ab8"/><stop offset="1" stop-color="#2a3352"/></linearGradient></defs>
      ${e(120, 112, 68, 16, '#3a3e58')}
      ${e(120, 110, 62, 13, 'url(#mercury-liquid)')}
      ${e(104, 106, 22, 2.2, '#fff4e0', 'opacity=".55"')}
      ${[0, 1, 2].map((i) => `<ellipse cx="132" cy="111" rx="10" ry="2.6" fill="none" stroke="#fff4e0" stroke-width="1" class="a-ripple" ${d(i * 1.1)}/>`).join('')}
      ${c(150, 54, 14, glow, 'opacity=".9"')}${c(150, 54, 22, glow, 'style="--o:.2" class="a-pulse"')}`;
  },

  beats([, , glow]) {
    let s = box(84, 120, 72, 10, 12, '#3d2f4a');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      s += r(88 + i * 16, 78 + j * 12, 12, 9, shade('#5a3d6b', 0.15), 'rx="2"');
      s += r(88 + i * 16, 78 + j * 12, 12, 9, [glow, '#8ad1ff', LIT][j], `rx="2" class="a-beat" ${d(i * 0.3 + j * 0.1)}`);
    }
    return s + r(92, 64, 56, 8, '#2a2236', 'rx="2"') + c(170, 96, 10, '#2a2236') + c(170, 96, 6, '#4a3a5a') + c(170, 96, 2.5, glow, 'class="a-pulse"');
  },

  island([, , glow]) {
    return `
      ${line(96, 118, 104, 76, '#5a4a3a', 2)}${line(144, 118, 136, 76, '#5a4a3a', 2)}${line(120, 118, 120, 80, '#5a4a3a', 2)}
      ${poly('92,52 148,48 152,84 88,88', PAPER)}
      ${p('M104,72 C100,62 112,56 120,60 C128,54 140,60 136,70 C138,78 124,82 116,78 C108,82 102,78 104,72 Z', '#7ab88a')}
      ${p('M110,70 C110,64 118,62 122,65 C128,62 132,66 130,70 C130,74 120,76 116,74 C112,75 110,73 110,70 Z', 'none', 'stroke="#4a7a5a" stroke-width=".8"')}
      ${c(124, 68, 1.6, '#c75a5a')}
      <g class="a-bob" ${d(0.8)}>${e(160, 34, 12, 3, glow)}${poly('148,34 172,34 160,46', '#3d4a5a')}${c(160, 30, 3, '#7ab88a')}</g>
      ${poly('70,30 72,24 74,30 80,32 74,34 72,40 70,34 64,32', STAR, 'opacity=".7"')}`;
  },

  qr([, , glow]) {
    const rand = rng('qr-modules');
    let mods = '';
    for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) {
      if ((i < 2 && j < 2) || (i > 4 && j < 2)) continue;
      if (rand() > 0.48) mods += box(78 + i * 11, 106 + j * 4 - i * 0.2, 7, 3 + (rand() * 6 | 0), 5, (i + j) % 5 ? '#d8d8d8' : glow);
    }
    const finder = (x, y) => box(x, y, 18, 22, 10, '#e8e8e8') + r(x + 4, y - 18, 10, 10, INK) + r(x + 7, y - 15, 4, 4, '#e8e8e8');
    return `${finder(74, 102)}${finder(142, 102)}${finder(90, 84)}${mods}
      ${r(130, 66, 6, 6, glow, 'class="a-blink"')}`;
  },

  split([, , glow]) {
    const left = 'M82,106 Q64,84 44,92';
    const right = 'M158,106 Q176,84 196,92';
    return `
      ${e(44, 96, 16, 5, '#3d6b55')}${p('M28,96 L44,114 L60,96 Z', '#2a3a4a')}
      ${e(196, 96, 16, 5, '#3d6b55')}${p('M180,96 L196,114 L212,96 Z', '#2a3a4a')}
      <path d="${left}" stroke="${STAR}" stroke-width="2" fill="none" opacity=".75"/>
      <path d="${right}" stroke="${STAR}" stroke-width="2" fill="none" opacity=".75"/>
      ${box(98, 116, 44, 22, 12, '#3d5a4a')}${r(110, 102, 8, 14, LIT, 'opacity=".85"')}
      <g>${along(left, 3)}${c(0, -3, 3.2, glow)}</g>
      <g>${along(right, 3.6, 1)}${c(0, -3, 3.2, LIT)}</g>
      ${c(44, 88, 2, STAR)}${c(196, 88, 2, STAR)}`;
  },

  tuner([, , glow]) {
    return `
      ${r(114, 92, 12, 26, '#5a4a3a')}
      ${p('M106,92 L106,40 Q106,32 112,32 L112,86 L128,86 L128,32 Q134,32 134,40 L134,92 Z', '#c8c0b0')}
      ${[0, 1].map((i) => `<path d="M${98 - i * 6},48 q-4,10 0,20" stroke="${glow}" stroke-width="1.4" fill="none" class="a-pulse" ${d(i * 0.4)}/>`
        + `<path d="M${142 + i * 6},48 q4,10 0,20" stroke="${glow}" stroke-width="1.4" fill="none" class="a-pulse" ${d(i * 0.4)}/>`).join('')}
      <path d="M150,104 A22,22 0 0 1 194,104" fill="none" stroke="${STAR}" stroke-width="1.4" opacity=".7"/>
      ${line(172, 104, 172, 86, '#ff7a7a', 1.6, `transform="rotate(-12 172 104)"`)}
      <g>${sway(172, 104, 8, 2.6)}${line(172, 104, 172, 86, glow, 1.8)}</g>
      ${c(172, 104, 2.4, STAR)}`;
  },

  sift([, , glow]) {
    let drops = '';
    for (let i = 0; i < 5; i++) drops += c(112 + i * 4, 70, 1.4, glow, `class="a-fall short" ${d(i * 0.35)}`);
    const bars = [16, 28, 20, 34, 12, 24].map((h, i) => r(84 + i * 12, 118 - h, 8, h, i === 3 ? glow : shade('#3d5a6b', 0.25 + i * 0.05), 'rx="1"')).join('');
    return `
      ${poly('86,40 154,40 132,66 108,66', '#4a6a7a')}${poly('86,40 154,40 150,36 90,36', shade('#4a6a7a', 0.35))}
      ${[0, 1, 2, 3].map((i) => line(98 + i * 12, 44, 112 + i * 5, 62, '#2a3a4a', 1)).join('')}
      ${drops}${bars}`;
  },

  'regex-lab'([, , glow]) {
    const states = [[66, 104], [100, 92], [136, 98], [172, 88]];
    const path = 'M66,104 Q83,84 100,92 Q118,80 136,98 Q154,78 172,88';
    return `
      <defs><marker id="regex-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${STAR}"/></marker></defs>
      ${[[0, 1], [1, 2], [2, 3]].map(([a, b]) => {
        const [x1, y1] = states[a];
        const [x2, y2] = states[b];
        return `<path d="M${x1 + 8},${y1 - 4} Q${(x1 + x2) / 2},${Math.min(y1, y2) - 18} ${x2 - 8},${y2 - 4}" stroke="${STAR}" stroke-width="1.2" fill="none" marker-end="url(#regex-arrow)" opacity=".8"/>`;
      }).join('')}
      <path d="M128,102 C120,124 152,124 144,102" stroke="${STAR}" stroke-width="1.1" fill="none" marker-end="url(#regex-arrow)" opacity=".6"/>
      ${states.map(([x, y], i) => e(x, y + 4, 12, 4, '#2a2a4a') + c(x, y, 9, shade('#4a3d6b', 0.25)) + (i === 3 ? `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${glow}" stroke-width="1.6"/>` : '')).join('')}
      <g>${along(path, 4)}${c(0, -10, 3, glow)}</g>`;
  },

  'query-planner'([, , glow]) {
    const node = (x, y, w, col) => r(x - w / 2, y - 7, w, 14, col, 'rx="4"');
    const cyl = (x, y) => e(x, y - 12, 9, 3, shade('#3d5a6b', 0.5)) + r(x - 9, y - 12, 18, 12, '#3d5a6b') + e(x, y, 9, 3, shade('#3d5a6b', -0.2));
    return `
      ${line(120, 40, 92, 66, STAR, 1.2, 'opacity=".7"')}${line(120, 40, 148, 66, STAR, 1.2, 'opacity=".7"')}
      ${line(92, 66, 78, 96, STAR, 1.2, 'opacity=".7"')}${line(92, 66, 106, 96, STAR, 1.2, 'opacity=".7"')}${line(148, 66, 160, 96, STAR, 1.2, 'opacity=".7"')}
      ${node(120, 40, 34, glow)}${node(92, 66, 28, shade('#3d5a6b', 0.4))}${node(148, 66, 28, shade('#3d5a6b', 0.4))}
      ${cyl(78, 112)}${cyl(106, 116)}${cyl(160, 112)}
      ${c(120, 40, 18, glow, 'style="--o:.2" class="a-pulse"')}`;
  },

  'raft-lab'([, , glow]) {
    const pts = [[120, 70], [160, 86], [146, 114], [94, 114], [80, 86]];
    let links = '';
    pts.slice(1).forEach(([x, y]) => { links += line(120, 70, x, y, STAR, 1, 'opacity=".35"'); });
    let beats = '';
    pts.slice(1).forEach(([x, y], i) => { beats += `<g>${along(`M120,64 L${x},${y - 6}`, 1.6, i * 0.1)}${c(0, 0, 2, glow)}</g>`; });
    return `
      ${links}
      ${pts.map(([x, y], i) => box(x - 6, y, 12, i === 0 ? 30 : 20, 8, i === 0 ? '#7a6a4a' : '#5a4a3d')).join('')}
      ${poly('112,36 116,30 120,35 124,30 128,36 128,40 112,40', glow)}
      ${beats}`;
  },

  'trace-explorer'([, , glow]) {
    const spans = [[64, 50, 112, 1], [72, 62, 60, 1], [134, 62, 40, 0], [78, 74, 30, 0], [96, 74, 34, 1], [100, 86, 26, 1], [130, 86, 20, 0], [104, 98, 18, 1]];
    return `
      ${line(60, 112, 182, 112, STAR, 1, 'opacity=".5"')}
      ${[0, 1, 2, 3, 4].map((i) => line(60 + i * 30, 110, 60 + i * 30, 114, STAR, 1, 'opacity=".5"')).join('')}
      ${spans.map(([x, y, w, crit], i) => box(x, y + 8, w, 8, 6, crit ? glow : shade('#3d6b5a', 0.25 + (i % 3) * 0.08), crit ? `class="a-pulse" ${d(i * 0.2)}` : '')).join('')}`;
  },

  'diff-forge'([, , glow]) {
    let sparks = '';
    for (let i = 0; i < 5; i++) sparks += c(118 + (i * 13) % 12, 76, 1.2, LIT, `class="a-rise fast" ${d(i * 0.3)}`);
    return `
      ${p('M88,90 L152,90 L146,98 L132,100 L136,116 L104,116 L108,100 L94,98 Z', '#3a3a4a')}
      ${p('M88,90 L152,90 L150,86 L90,86 Z', '#5a5a6a')}
      <path d="M50,40 C80,44 100,60 118,84" stroke="#ff7a7a" stroke-width="4" fill="none" class="a-dash" stroke-dasharray="6 4"/>
      <path d="M190,40 C160,44 140,60 122,84" stroke="#7ad18a" stroke-width="4" fill="none" class="a-dash" stroke-dasharray="6 4"/>
      ${c(120, 84, 5, glow, 'class="a-pulse"')}
      ${sparks}`;
  },

  'oklch-studio'() {
    const hues = ['#ff6b8a', '#ffa86b', '#ffe06b', '#7ad18a', '#6bb8ff', '#a88aff'];
    return `
      ${line(40, 70, 104, 76, '#ffffff', 2.4, 'opacity=".9"')}
      ${hues.map((h, i) => poly(`132,${74 + i * 2} 200,${46 + i * 12} 200,${56 + i * 12} 132,${76 + i * 2}`, h, `opacity=".85" class="a-pulse" ${d(i * 0.2)}`)).join('')}
      ${poly('102,104 120,44 140,104', '#c8d0ff', 'opacity=".35"')}
      <polygon points="102,104 120,44 140,104" fill="none" stroke="#ffffff" stroke-width="1.4" opacity=".8"/>
      ${line(120, 44, 126, 104, '#ffffff', 0.8, 'opacity=".4"')}
      ${r(96, 104, 50, 14, '#3a3a5a')}`;
  },
};

/** The SVG for one island. `label` becomes its accessible name when the art stands alone;
    `uid` keeps its gradient ids unique when the same island is on the page twice. */
export function islandSVG(island, { label = '', uid = '' } = {}) {
  const scene = SCENES[island.id];
  if (!scene) throw new Error(`no scene for ${island.id}`);
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  let svg = `<svg viewBox="0 0 240 230" xmlns="http://www.w3.org/2000/svg" ${a11y}>${base(island.id, island.palette, island.base, island.region)}<g class="scene">${scene(island.palette)}</g></svg>`;
  if (uid) svg = svg.replace(/id="([^"]+)"/g, `id="$1-${uid}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-${uid})`);
  return svg;
}

export const SCENE_IDS = Object.keys(SCENES);

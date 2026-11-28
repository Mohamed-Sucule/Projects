#!/usr/bin/env node
/* assets/streets.mjs — the streets that draw themselves across the sky at 19:30.

     node assets/streets.mjs                       Zürich, from the tile Your Place's tests keep
     node assets/streets.mjs 52.4797,-1.9026 3x2   any place: live tiles, 3 across and 2 down

   When the front page reaches Your Place, a city's streets draw across the night
   in gold, from the middle outwards, the way the poster beside them was drawn.
   This writes them: OpenMapTiles vector tiles at zoom 14, decoded the same way
   Your Place decodes them, kept to the streets and the water, simplified, and
   sorted into bands by their distance from the middle so the page can draw one
   band after another. Without an argument it uses the Zürich tile in Your Place's
   test fixtures, which needs no network and matches the Zürich poster in that
   scene. With a place, it fetches the tiles from OpenFreeMap (tiles.openfreemap.org
   has to be reachable). Writes assets/streets.svg. Development tool only. */

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

const here = new URL('.', import.meta.url);
const out = new URL('streets.svg', here);
const Z = 14;
const SIZE = 1000;   // each tile is drawn 1000 units across
const BANDS = 8;     // rings of distance from the middle, drawn one after another

/* Which streets, and how heavy: the main roads brightest, the side streets and
   service roads finer, and the footpaths finest of all. Rail is left out. */
const CLASSES = { motorway: 'major', trunk: 'major', primary: 'major', secondary: 'mid', tertiary: 'mid',
  minor: 'minor', service: 'minor', track: 'fine', path: 'fine' };

async function tiles() {
  const [where, grid = '3x2'] = process.argv.slice(2);
  if (!where) {
    const fixture = new URL('../your-place/tests/fixtures/zurich-14-8581-5739.pbf.gz', here);
    return { cols: 1, rows: 1, list: [{ dx: 0, dy: 0, data: gunzipSync(readFileSync(fixture)) }] };
  }
  const [lat, lon] = where.split(',').map(Number);
  const [cols, rows] = grid.split('x').map(Number);
  const n = 2 ** Z;
  const cx = Math.floor(((lon + 180) / 360) * n);
  const cy = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  const meta = await (await fetch('https://tiles.openfreemap.org/planet')).json();
  const template = meta.tiles[0];
  const list = [];
  for (let dy = 0; dy < rows; dy++) for (let dx = 0; dx < cols; dx++) {
    const x = cx - Math.floor((cols - 1) / 2) + dx, y = cy - Math.floor((rows - 1) / 2) + dy;
    const res = await fetch(template.replace('{z}', Z).replace('{x}', x).replace('{y}', y));
    if (!res.ok) throw new Error(`tile ${Z}/${x}/${y}: ${res.status}`);
    list.push({ dx, dy, data: new Uint8Array(await res.arrayBuffer()) });
  }
  return { cols, rows, list };
}

/* Douglas–Peucker, in drawing units: a point is kept only if leaving it out would
   move the line by more than a fraction of a unit. */
function simplify(pts, tolerance) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, worst = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > worst) { worst = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const { cols, rows, list } = await tiles();
const W = cols * SIZE, H = rows * SIZE;
const lines = { major: [], mid: [], minor: [], fine: [] };
const water = [];
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const d = (pts, close) => 'M' + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + (close ? 'Z' : '');

for (const { dx, dy, data } of list) {
  const tile = new VectorTile(new PbfReader(data));
  const road = tile.layers.transportation, lake = tile.layers.water;
  const scale = (layer) => SIZE / layer.extent;
  for (let i = 0; road && i < road.length; i++) {
    const f = road.feature(i);
    const kind = CLASSES[f.properties.class];
    if (f.type !== 2 || !kind || f.properties.brunnel === 'tunnel') continue;
    const s = scale(road);
    for (const ring of f.loadGeometry()) {
      const pts = simplify(ring.map((p) => [dx * SIZE + p.x * s, dy * SIZE + p.y * s]), 0.6);
      if (pts.length < 2) continue;
      const [mx, my] = pts[pts.length >> 1];
      lines[kind].push({ pts, far: Math.hypot(mx - W / 2, my - H / 2) });
    }
  }
  for (let i = 0; lake && i < lake.length; i++) {
    const f = lake.feature(i);
    if (f.type !== 3) continue;
    const s = scale(lake);
    /* Water is a handful of closed shapes; it is kept as it comes. */
    water.push(f.loadGeometry().map((r) => d(r.map((p) => [dx * SIZE + p.x * s, dy * SIZE + p.y * s]), true)).join(''));
  }
}

/* Bands by distance from the middle, so the city draws itself outwards: each band
   holds the same share of the streets, nearest first, whatever lies in the middle. */
const all = Object.values(lines).flat().sort((a, b) => a.far - b.far);
all.forEach((l, i) => { l.band = Math.floor((i / all.length) * BANDS); });
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">`;
if (water.length) svg += `<path class="water" d="${water.join('')}"/>`;
let count = 0;
for (const kind of ['fine', 'minor', 'mid', 'major']) {
  for (let band = 0; band < BANDS; band++) {
    const these = lines[kind].filter((l) => l.band === band);
    if (!these.length) continue;
    count += these.length;
    svg += `<path class="${kind}" data-band="${band}" pathLength="1" d="${these.map((l) => d(l.pts)).join('')}"/>`;
  }
}
svg += '</svg>\n';
writeFileSync(out, svg);
console.log(`streets: ${count} streets in ${cols}x${rows} tiles, ${(svg.length / 1024).toFixed(0)} KB`);

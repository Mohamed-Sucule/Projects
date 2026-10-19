#!/usr/bin/env node
/* Builds the sky's data from d3-celestial's catalogues into compact files the app ships.

     npm run data

   Stars: the 5,044 stars to magnitude 6 (the naked-eye limit) from XHIP, the extended
   Hipparcos compilation, as right ascension, declination, magnitude and colour.
   Constellation lines and names, and the names of the brightest stars. The Milky Way's
   outline, in five steps of brightness, is painted into a small image of the whole sky.
   Coordinates are J2000; the app turns them to the sky of any date. The output is
   committed, so building the app never needs this script or the network. */

import { readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const src = new URL('../node_modules/d3-celestial/data/', import.meta.url);
const out = new URL('../src/sky/data/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, src), 'utf8'));
const write = (f, v) => {
  const json = JSON.stringify(v);
  writeFileSync(new URL(f, out), json + '\n');
  console.log(`${f}  ${(json.length / 1024).toFixed(0)} KB`);
};
const ra = (lon) => (lon < 0 ? lon + 360 : lon);
const r = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/* stars: flat [ra, dec, mag, b-v, ...], faintest first so the bright ones draw on top */
const stars = read('stars.6.json')
  .features.map((f) => ({
    id: f.id,
    ra: ra(f.geometry.coordinates[0]),
    dec: f.geometry.coordinates[1],
    mag: f.properties.mag,
    bv: Number(f.properties.bv),
  }))
  .filter((s) => Number.isFinite(s.mag))
  .sort((a, b) => b.mag - a.mag);
write(
  'stars.json',
  stars.flatMap((s) => [
    r(s.ra, 3),
    r(s.dec, 3),
    r(s.mag, 2),
    Number.isFinite(s.bv) ? r(s.bv, 2) : 0.6,
  ]),
);

/* the proper names of stars bright enough to label */
const names = read('starnames.json');
const named = stars
  .filter((s) => s.mag < 1.6 && names[s.id]?.name)
  .map((s) => [names[s.id].name, r(s.ra, 3), r(s.dec, 3), r(s.mag, 2)]);
write('starnames.json', named);

/* constellation lines, as polylines of [ra, dec] */
const lines = read('constellations.lines.json').features.map((f) => [
  f.id,
  f.geometry.coordinates.map((line) => line.map(([lon, lat]) => [r(ra(lon), 2), r(lat, 2)])),
]);
write('lines.json', lines);

/* constellation names (in Latin, as star charts print them), where to set them, and how
   important they are (1 is the most) */
const cons = read('constellations.json').features.map((f) => {
  const [lon, lat] = f.properties.display ?? f.geometry.coordinates;
  return [f.id, f.properties.name, r(ra(lon), 2), r(lat, 2), Number(f.properties.rank)];
});
write('constellations.json', cons);

/* The Milky Way: five nested outlines, from its faint edge to its brightest clouds. Filling
   them on the sphere is awkward (the outermost one circles the whole sky), so they are
   filled here once, on a map of the sky in right ascension and declination, and the app
   looks each point up. Each column is filled between the places the outlines cross it,
   in pairs (even-odd), which needs no idea of which ring is a hole. */
const W = 1024;
const H = 512;
const levels = read('mw.json').features.map((f) => f.geometry.coordinates.flat());
const sky = new Float32Array(W * H);
for (const rings of levels) {
  for (let x = 0; x < W; x++) {
    const lon = ((x + 0.5) / W) * 360;
    const decs = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [a, ad] = ring[i];
        const [b0, bd] = ring[(i + 1) % ring.length];
        const ra1 = ra(a);
        let d = ra(b0) - ra1;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        if (d === 0) continue;
        const ra2 = ra1 + d;
        for (const at of [lon - 360, lon, lon + 360]) {
          if (at >= Math.min(ra1, ra2) && at < Math.max(ra1, ra2)) {
            decs.push(ad + ((at - ra1) / d) * (bd - ad));
          }
        }
      }
    }
    if (decs.length % 2) throw new Error(`Milky Way column ${x} crosses an odd number of edges`);
    decs.sort((p, q) => q - p);
    for (let k = 0; k < decs.length; k += 2) {
      const top = Math.max(0, Math.ceil(((90 - decs[k]) / 180) * H - 0.5));
      const bottom = Math.min(H - 1, Math.floor(((90 - decs[k + 1]) / 180) * H - 0.5));
      for (let y = top; y <= bottom; y++) sky[y * W + x] += 1 / levels.length;
    }
  }
}
// soften the steps between outlines into a glow: three box blurs make a near-Gaussian one
function blur(src, radius) {
  const out = new Float32Array(src.length);
  const n = 2 * radius + 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[y * W + ((x + k + W) % W)];
      out[y * W + x] = s / n;
    }
  }
  const back = new Float32Array(src.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += out[Math.min(H - 1, Math.max(0, y + k)) * W + x];
      back[y * W + x] = s / n;
    }
  }
  return back;
}
const soft = blur(blur(blur(sky, 3), 3), 3);
const grey = new Uint8Array(W * H);
for (let i = 0; i < grey.length; i++) grey[i] = Math.round(Math.min(1, soft[i]) * 255);
writeFileSync(new URL('milkyway.png', out), png(W, H, grey));
console.log(`milkyway.png  ${W} × ${H}`);

/** A greyscale PNG: each row stored as the difference from the pixel before (filter 1). */
function png(width, height, data) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 1;
    for (let x = 0; x < width; x++) {
      const left = x ? data[y * width + x - 1] : 0;
      raw[y * (width + 1) + 1 + x] = (data[y * width + x] - left) & 255;
    }
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(typed));
    return Buffer.concat([head, typed, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per sample
  header[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

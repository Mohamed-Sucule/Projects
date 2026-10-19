/* Reads the greyscale PNG that scripts/data.mjs writes (8-bit, one filter type per row),
   so the tests can look at the real Milky Way map without a browser. */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type { SkyMap } from '../../src/sky/milkyway';

export function readSkyMap(): SkyMap {
  const buf = readFileSync(new URL('../../src/sky/data/milkyway.png', import.meta.url));
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off);
    if (buf.toString('ascii', off + 4, off + 8) === 'IDAT')
      idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)];
    if (filter !== 1) throw new Error(`unexpected PNG filter ${filter}`);
    for (let x = 0; x < width; x++) {
      const left = x ? data[y * width + x - 1]! : 0;
      data[y * width + x] = (raw[y * (width + 1) + 1 + x]! + left) & 255;
    }
  }
  return { width, height, data };
}

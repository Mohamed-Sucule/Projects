#!/usr/bin/env node
/* Fetches the map data the end-to-end tests draw: real OpenStreetMap vector tiles of
   Zurich in the OpenMapTiles schema, from the test data that TileServer GL publishes.
   ~36 MB, downloaded once into .cache/ and never committed. */

import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';

const URL = 'https://github.com/maptiler/tileserver-gl/releases/download/v1.3.0/test_data.zip';
const dir = new globalThis.URL('../.cache/', import.meta.url).pathname;
const zip = `${dir}test_data.zip`;
const out = `${dir}zurich.mbtiles`;

if (existsSync(out) && statSync(out).size > 1e6) {
  console.log(`fixtures: ${out} is already here`);
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
if (!existsSync(zip)) {
  console.log(`fixtures: downloading ${URL}`);
  const res = await fetch(URL);
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${zip}.part`));
  await rename(`${zip}.part`, zip);
}
execFileSync('unzip', ['-o', '-j', zip, 'zurich_switzerland.mbtiles', '-d', dir], {
  stdio: 'inherit',
});
await rename(`${dir}zurich_switzerland.mbtiles`, out);
console.log(`fixtures: ${out} ready`);

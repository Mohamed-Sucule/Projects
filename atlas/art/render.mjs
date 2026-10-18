#!/usr/bin/env node
/* atlas/art/render.mjs — renders the Atlas's pictures from scenes.js into WebP.

     node atlas/art/render.mjs                 every picture
     node atlas/art/render.mjs portal tally    just these
     node atlas/art/render.mjs --draft --out=/tmp/x tally   small and quick, somewhere else

   Each scene is drawn by gpu.mjs with 2 x 2 samples a pixel (the smaller sizes,
   more) and saved at the sizes the page asks for. The output is committed;
   visitors only ever download the images. The opening's motion is motion.mjs. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { picture, ids, SCENES } from './scenes.js';
import { renderer, bytes } from './gpu.mjs';
import { ISLANDS } from '../worlds.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const draft = args.includes('--draft');
const out = args.find((a) => a.startsWith('--out='))?.slice(6) ?? here;
const only = args.filter((a) => !a.startsWith('--'));
const want = only.length ? only : ids();

/* every project picture is 3:2; the opening comes wide (desktop) and tall (phones) */
const JOBS = [];
for (const id of want) {
  if (SCENES[id]) {
    JOBS.push({ id, view: 'wide', w: 2560, h: 1440, sizes: [[2560, `${id}-2560`], [1600, `${id}-1600`], [960, `${id}-960`]] });
    JOBS.push({ id, view: 'tall', w: 1200, h: 2000, sizes: [[1200, `${id}-tall-1200`], [750, `${id}-tall-750`]] });
  } else {
    JOBS.push({ id, view: 'wide', w: 1800, h: 1200, sizes: [[1800, `${id}-1800`], [900, `${id}-900`]] });
  }
}

const gpu = await renderer();
mkdirSync(out, { recursive: true });

for (const job of JOBS) {
  const isle = ISLANDS.find((i) => i.id === job.id);
  const pic = picture(job.id, isle ? { region: isle.region, accent: isle.palette[2] } : {}, job.view);
  const scale = draft ? 0.36 : 1;
  const w = Math.round(job.w * scale), h = Math.round(job.h * scale);
  const sizes = draft ? [[w, `${job.id}${job.view === 'tall' ? '-tall' : ''}-draft`]] : job.sizes;
  const t0 = Date.now();
  const files = await gpu.draw({ frag: pic.frag, u: pic.u, w, h, ss: draft ? 1 : 2, sizes });
  for (const [name, url] of files) {
    const buf = bytes(url);
    writeFileSync(join(out, `${name}.webp`), buf);
    console.log(`${name}.webp  ${(buf.length / 1024).toFixed(0)} KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}
await gpu.close();

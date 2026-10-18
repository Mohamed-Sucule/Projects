#!/usr/bin/env node
/* atlas/art/motion.mjs — the opening's two kinds of movement, rendered offline.

     FFMPEG=/path/to/ffmpeg node atlas/art/motion.mjs loop flight

   loop    the portal at rest, three seconds that come back to where they began:
           the sea drifts in a small circle in its own noise, so the last
           frame leads into the first. Only the sea is drawn again each frame. Encoded as MP4 (H.264) and WebM (VP9), for wide screens.
   flight  the camera leaving the shore, lining up with the ring's axis and
           going through it into the evening on the other side, as frames the
           page draws while you scroll. The last few brighten into the light the
           gallery begins in.

   Both use the same scene and shader as the stills (scenes.js, gpu.mjs). */

import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { picture } from './scenes.js';
import { renderer, bytes } from './gpu.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const what = process.argv.slice(2);
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const gpu = await renderer();

const LOOP = 60;   /* frames, at 20 a second */
const FLIGHT = 32; /* frames, drawn as you scroll; the page blends between them */

const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const ease = (t) => t * t * (3 - 2 * t);
function bezier(P, t) {
  const u = 1 - t;
  return P[0].map((_, i) => u * u * u * P[0][i] + 3 * u * u * t * P[1][i] + 3 * u * t * t * P[2][i] + t * t * t * P[3][i]);
}

/* the camera's path through the ring: from where the opening stands to the far side */
const PATHS = {
  wide: { P: [[-6.2, 0.55, 48], [-4.6, 1.5, 30], [-0.6, 3.0, 12], [0, 3.0, -16]], L: [[-11.5, 4.4, 0], [0, 2.6, -80]], fov: [0.66, 0.8], size: [1280, 720] },
  tall: { P: [[0.2, 0.6, 58], [0.15, 1.6, 36], [0, 3.0, 12], [0, 3.0, -16]], L: [[0, -5.6, 0], [0, 2.2, -80]], fov: [0.86, 0.92], size: [720, 1280] },
};

if (what.includes('loop')) {
  /* wide screens only: on a phone the still stands in, and saves the download */
  for (const [view, w, h] of [['wide', 1600, 900]]) {
    const dir = join(tmpdir(), `atlas-loop-${view}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    for (let f = 0; f < LOOP; f++) {
      /* only the sea moves, so after the first frame only the rows below the horizon are drawn again */
      const pic = picture('portal', {}, view, { time: f / LOOP });
      const band = f === 0 ? null : [0, Math.ceil(h * 0.44)];
      const [[, url]] = await gpu.draw({ frag: pic.frag, u: pic.u, w, h, ss: 2, sizes: [[w, 'f']], type: 'image/png', band });
      writeFileSync(join(dir, `f${String(f).padStart(3, '0')}.png`), bytes(url));
      if (f % 12 === 0) console.log(`loop ${view} ${f}/${LOOP}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    const name = join(here, `portal-loop${view === 'tall' ? '-tall' : ''}`);
    const input = ['-y', '-loglevel', 'error', '-framerate', '20', '-i', join(dir, 'f%03d.png')];
    execFileSync(FFMPEG, [...input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', '-an', `${name}.mp4`]);
    execFileSync(FFMPEG, [...input, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-an', `${name}.webm`]);
    for (const ext of ['mp4', 'webm']) console.log(`${name}.${ext}  ${(statSync(`${name}.${ext}`).size / 1024).toFixed(0)} KB`);
    rmSync(dir, { recursive: true, force: true });
  }
}

if (what.includes('flight')) {
  mkdirSync(join(here, 'flight'), { recursive: true });
  for (const [view, path] of Object.entries(PATHS)) {
    const [w, h] = path.size;
    const t0 = Date.now();
    for (let f = 0; f < FLIGHT; f++) {
      const t = f / (FLIGHT - 1);
      const k = ease(t);
      const shot = {
        cam: bezier(path.P, k),
        look: mix(path.L[0], path.L[1], ease(Math.min(1, t * 1.25))),
        fov: path.fov[0] + (path.fov[1] - path.fov[0]) * k,
        /* through the ring, the evening grows until it is all there is */
        lift: 1 + 2.4 * Math.max(0, (t - 0.74) / 0.26) ** 2,
        time: 0,
      };
      const pic = picture('portal', {}, view, shot);
      const [[, url]] = await gpu.draw({ frag: pic.frag, u: pic.u, w, h, ss: 2, sizes: [[w, 'f']], quality: 0.8 });
      writeFileSync(join(here, 'flight', `${view}-${String(f).padStart(2, '0')}.webp`), bytes(url));
      if (f % 8 === 0) console.log(`flight ${view} ${f}/${FLIGHT}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
}
await gpu.close();

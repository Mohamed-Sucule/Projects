#!/usr/bin/env node
/* atlas/art/render.mjs — renders the Atlas's pictures from scenes.js into WebP.

     node atlas/art/render.mjs                 every picture
     node atlas/art/render.mjs portal tally    just these
     node atlas/art/render.mjs --draft --out=/tmp/x tally   small and quick, somewhere else

   It drives a headless Chromium through Playwright (a development tool, not a
   dependency of the site), draws each scene with WebGL 2 in tiles so no single
   draw runs long, averages 2 x 2 samples a pixel (the smaller sizes, more), and
   saves the result at the sizes the page asks for. The output is committed;
   visitors only ever download the images. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { picture, ids, SCENES } from './scenes.js';
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

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'],
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
mkdirSync(out, { recursive: true });

for (const job of JOBS) {
  const isle = ISLANDS.find((i) => i.id === job.id);
  const pic = picture(job.id, isle ? { region: isle.region, accent: isle.palette[2] } : {}, job.view);
  const scale = draft ? 0.36 : 1;
  const w = Math.round(job.w * scale), h = Math.round(job.h * scale);
  const sizes = draft ? [[w, `${job.id}${job.view === 'tall' ? '-tall' : ''}-draft`]] : job.sizes;
  const t0 = Date.now();
  const files = await page.evaluate(async ({ frag, u, w, h, ss, sizes }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const gl = c.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('no WebGL 2');
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0,1);}'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(prog, 0, 'a');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const [k, v] of Object.entries(u)) {
      const loc = gl.getUniformLocation(prog, k);
      if (!loc) continue;
      const a = Array.isArray(v) ? v : [v];
      gl[`uniform${a.length}fv`](loc, a);
    }
    gl.uniform2f(gl.getUniformLocation(prog, 'uRes'), w, h);
    gl.uniform1i(gl.getUniformLocation(prog, 'uSS'), ss);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.SCISSOR_TEST);
    const T = 96, px = new Uint8Array(4);
    for (let y = 0; y < h; y += T) {
      for (let x = 0; x < w; x += T) {
        gl.scissor(x, y, T, T);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    /* step down by halves so the smaller sizes stay sharp */
    const shrink = (src, tw) => {
      let cur = src;
      while (cur.width / 2 >= tw) {
        const n = document.createElement('canvas');
        n.width = Math.round(cur.width / 2); n.height = Math.round(cur.height / 2);
        const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, n.width, n.height);
        cur = n;
      }
      if (cur.width === tw) return cur;
      const n = document.createElement('canvas');
      n.width = tw; n.height = Math.round(src.height * tw / src.width);
      const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, n.width, n.height);
      return n;
    };
    return sizes.map(([tw, name]) => [name, shrink(c, tw).toDataURL('image/webp', 0.84)]);
  }, { frag: pic.frag, u: pic.u, w, h, ss: draft ? 1 : 2, sizes });
  for (const [name, url] of files) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    writeFileSync(join(out, `${name}.webp`), buf);
    console.log(`${name}.webp  ${(buf.length / 1024).toFixed(0)} KB  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}
await browser.close();

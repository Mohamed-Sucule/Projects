/* atlas/art/gpu.mjs — draws a picture from scenes.js in a headless Chromium.

   Shared by render.mjs (the stills) and motion.mjs (the opening's loop and the
   flight through the ring). Each picture is drawn with WebGL 2 in small tiles,
   so no single draw runs long enough for the browser to give up on it, then
   saved at the sizes asked for, stepping down by halves so they stay sharp.
   Playwright is a development tool here, not a dependency of the site. */

import { createRequire } from 'node:module';

export async function renderer() {
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }
  const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });

  /** Draw one picture; returns [[name, dataURL], ...] for each requested size. */
  /* band: [from, to] rows, counted from the bottom, to draw only part of the picture over the last one */
  async function draw({ frag, u, w, h, ss = 2, sizes, type = 'image/webp', quality = 0.84, band = null }) {
    return page.evaluate(async ({ frag, u, w, h, ss, sizes, type, quality, band }) => {
      const cache = (window.__progs ??= new Map());
      let c = window.__canvas;
      if (!c) { c = window.__canvas = document.createElement('canvas'); }
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const gl = (window.__gl ??= c.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false }));
      if (!gl) throw new Error('no WebGL 2');
      let prog = cache.get(frag);
      if (!prog) {
        const sh = (t, src) => {
          const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
          return s;
        };
        prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0,1);}'));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
        gl.bindAttribLocation(prog, 0, 'a');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        cache.set(frag, prog);
        if (!window.__buf) {
          window.__buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, window.__buf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        }
      }
      gl.useProgram(prog);
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
      const [y0, y1] = band ?? [0, h];
      for (let y = y0; y < y1; y += T) {
        for (let x = 0; x < w; x += T) {
          gl.scissor(x, y, T, Math.min(T, y1 - y));
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
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
      return sizes.map(([tw, name]) => [name, shrink(c, tw).toDataURL(type, quality)]);
    }, { frag, u, w, h, ss, sizes, type, quality, band });
  }

  return { draw, close: () => browser.close() };
}

export const bytes = (dataURL) => Buffer.from(dataURL.split(',')[1], 'base64');

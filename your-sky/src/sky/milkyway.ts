/* The Milky Way, as a glow. Its outline has been painted once onto a map of the whole sky
   (scripts/data.mjs). To draw it on a chart, each pixel of the chart is turned back into a
   direction in the sky, and the map says how bright the Milky Way is there. */

import mapUrl from './data/milkyway.png?url';
import type { Matrix } from './astro';
import { context2d, makeCanvas } from './canvas';

/** Brightness over the sky: x is right ascension from 0° to 360°, y declination from +90°. */
export interface SkyMap {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Brightness, 0 to 1, in a direction (J2000 equatorial), blending the four nearest pixels. */
export function brightness(map: SkyMap, x: number, y: number, z: number): number {
  const ra = Math.atan2(y, x) / (2 * Math.PI);
  const u = (ra < 0 ? ra + 1 : ra) * map.width - 0.5;
  const v = (0.5 - Math.asin(Math.max(-1, Math.min(1, z))) / Math.PI) * map.height - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.max(0, Math.min(map.height - 2, Math.floor(v)));
  const fx = u - x0;
  const fy = Math.max(0, Math.min(1, v - y0));
  const w = map.width;
  const left = ((x0 % w) + w) % w;
  const right = (left + 1) % w;
  const d = map.data;
  const top = d[y0 * w + left]! * (1 - fx) + d[y0 * w + right]! * fx;
  const bottom = d[(y0 + 1) * w + left]! * (1 - fx) + d[(y0 + 1) * w + right]! * fx;
  return (top * (1 - fy) + bottom * fy) / 255;
}

/**
 * The Milky Way over a square chart `size` pixels across, as RGBA: one colour, with the
 * glow in the alpha. Pixels outside the horizon are left clear.
 */
export function milkyWayPixels(
  map: SkyMap,
  rotation: Matrix,
  size: number,
  rgb: [number, number, number],
  strength: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(size * size * 4);
  const scale = 2 / size;
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = rotation;
  for (let j = 0; j < size; j++) {
    const cy = (j + 0.5) * scale - 1;
    for (let i = 0; i < size; i++) {
      const cx = (i + 0.5) * scale - 1;
      const r2 = cx * cx + cy * cy;
      if (r2 > 1) continue;
      // unproject() and unrotate(), written out: this runs for every pixel
      const k = 2 / (1 + r2);
      const n = -cy * k;
      const w = cx * k;
      const u = (1 - r2) / (1 + r2);
      const b = brightness(
        map,
        m0 * n + m3 * w + m6 * u,
        m1 * n + m4 * w + m7 * u,
        m2 * n + m5 * w + m8 * u,
      );
      if (b <= 0) continue;
      const o = (j * size + i) * 4;
      out[o] = rgb[0];
      out[o + 1] = rgb[1];
      out[o + 2] = rgb[2];
      // a gentle curve: the faint edge stays faint, the bright clouds stand out
      out[o + 3] = 255 * strength * Math.pow(b, 0.85);
    }
  }
  return out;
}

let loading: Promise<SkyMap> | null = null;

/** The sky map, decoded by the browser. Loaded once, the first time a chart needs it. */
export function loadSkyMap(): Promise<SkyMap> {
  loading ??= (async () => {
    const res = await fetch(mapUrl);
    if (!res.ok) throw new Error(`The Milky Way did not load (${res.status})`);
    const bitmap = await createImageBitmap(await res.blob(), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const canvas = makeCanvas(bitmap.width, bitmap.height);
    const ctx = context2d(canvas, { willReadFrequently: true });
    if (!ctx) throw new Error('This browser cannot draw the Milky Way');
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const data = new Uint8Array(bitmap.width * bitmap.height);
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4]!;
    bitmap.close();
    return { width: canvas.width, height: canvas.height, data };
  })();
  loading.catch(() => {
    loading = null; // let a later chart try again
  });
  return loading;
}

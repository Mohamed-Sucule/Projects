/* The map engine: given a poster, fetch the tiles it needs and paint its map layer.
   It runs in a worker when the browser can draw off the main thread, and on the main
   thread otherwise; nothing in here knows which. */

import { layoutPoster, type LayoutId } from '../poster/layout';
import { context2d, paintMap, type MapPaint, type PlacedTile } from './draw';
import { frameFor, tileZoomFor, tilesFor, type View } from './geo';
import { TileSource } from './source';
import { mapSvg } from './svg';
import { THEMES, type ThemeId } from './themes';
import type { Priority } from './protocol';

export interface MapJob {
  view: View;
  width: number;
  height: number;
  layout: LayoutId;
  theme: ThemeId;
  /** thumbnails leave out what they are too small to show */
  lite?: boolean;
}

export { PRIORITY, type Priority } from './protocol';

export type Picture = ImageBitmap | HTMLCanvasElement;

export interface Painted {
  picture: Picture;
  /** tiles that failed to load and are missing from the picture */
  missing: number;
  ms: number;
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;

export function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

/** Painting is synchronous and heavy, so paints take turns, most urgent first. */
class Turns {
  #busy = false;
  #waiting: { priority: number; seq: number; go: () => void }[] = [];
  #seq = 0;

  async take(priority: number): Promise<() => void> {
    if (this.#busy) {
      await new Promise<void>((go) => {
        this.#waiting.push({ priority, seq: this.#seq++, go });
        this.#waiting.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      });
    }
    this.#busy = true;
    return () => {
      this.#busy = false;
      // yield before the next paint so messages (a newer preview) can arrive in between
      setTimeout(() => {
        if (!this.#busy) this.#waiting.shift()?.go();
      }, 0);
    };
  }
}

export class MapEngine {
  #turns = new Turns();

  constructor(private readonly source = new TileSource()) {}

  async #gather(job: MapJob): Promise<{ paint: MapPaint; missing: number }> {
    const layout = layoutPoster(job.width, job.height, job.layout);
    const frame = frameFor(job.view, layout.map);
    const ids = tilesFor(frame, tileZoomFor(frame));
    const results = await Promise.allSettled(ids.map((id) => this.source.get(id)));
    const tiles: PlacedTile[] = [];
    let missing = 0;
    results.forEach((r, i) => {
      if (r.status === 'rejected') missing++;
      else if (r.value) tiles.push({ id: ids[i]!, tile: r.value });
    });
    if (missing > 0 && missing === ids.length) {
      const reason = results.find((r) => r.status === 'rejected');
      throw reason && reason.status === 'rejected'
        ? toError(reason.reason)
        : new Error('The map could not be loaded');
    }
    const paint: MapPaint = {
      frame,
      theme: THEMES[job.theme],
      width: job.width,
      height: job.height,
      fade: layout.fade,
      tiles,
      scratch: makeCanvas,
      lite: job.lite === true,
    };
    return { paint, missing };
  }

  /** Paint a map layer; resolves to null when `stillWanted` says a newer request replaced it. */
  async paint(
    job: MapJob,
    priority: Priority,
    stillWanted: () => boolean,
  ): Promise<Painted | null> {
    const started = performance.now();
    const { paint, missing } = await this.#gather(job);
    if (!stillWanted()) return null;
    const done = await this.#turns.take(priority);
    try {
      if (!stillWanted()) return null;
      const canvas = makeCanvas(job.width, job.height);
      const ctx = context2d(canvas);
      if (!ctx) throw new Error('This browser could not draw the poster');
      paintMap(ctx, paint);
      const picture = 'transferToImageBitmap' in canvas ? canvas.transferToImageBitmap() : canvas;
      return { picture, missing, ms: Math.round(performance.now() - started) };
    } finally {
      done();
    }
  }

  async svg(job: MapJob): Promise<{ defs: string; body: string }> {
    const { paint } = await this.#gather(job);
    return mapSvg(paint);
  }
}

export const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

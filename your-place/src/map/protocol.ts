import type { MapJob } from './engine';

/** Lower runs first: the poster you are looking at beats a download, which beats a swatch. */
export const PRIORITY = { preview: 0, export: 1, swatch: 2 } as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export type WorkerRequest =
  | { type: 'paint'; id: number; channel: string; priority: Priority; job: MapJob }
  | { type: 'svg'; id: number; job: MapJob };

export type WorkerResponse =
  | { type: 'painted'; id: number; picture: ImageBitmap; missing: number; ms: number }
  | { type: 'svg'; id: number; defs: string; body: string }
  | { type: 'skipped'; id: number }
  | { type: 'error'; id: number; message: string };

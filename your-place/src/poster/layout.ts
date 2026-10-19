/* Where everything sits on a poster of a given size. Pure numbers, shared by the preview,
   the download and the SVG, so all three always agree. */

import type { Rect } from '../map/geo';

export const LAYOUT_IDS = ['full', 'framed'] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];
export const isLayoutId = (v: unknown): v is LayoutId =>
  typeof v === 'string' && (LAYOUT_IDS as readonly string[]).includes(v);

export interface TextSlot {
  x: number;
  /** baseline */
  y: number;
  size: number;
  maxWidth: number;
}

export interface PosterLayout {
  width: number;
  height: number;
  map: Rect;
  /** full-bleed posters fade the map into the paper behind the words */
  fade: { from: number; to: number } | null;
  title: TextSlot;
  rule: { x: number; y: number; w: number; weight: number };
  subtitle: TextSlot;
  coords: TextSlot;
  credit: TextSlot;
}

export function layoutPoster(width: number, height: number, layout: LayoutId): PosterLayout {
  const u = Math.min(width, height * 0.8) / 1000;
  const cx = width / 2;
  const maxWidth = width - 160 * u;
  // tall phone screens keep the words clear of the home bar
  const lift = height / width > 1.8 ? height * 0.07 : 0;

  if (layout === 'framed') {
    const m = 64 * u;
    const textBlock = 300 * u;
    const map = { x: m, y: m, w: width - 2 * m, h: height - m - textBlock - lift };
    const base = map.y + map.h;
    return {
      width,
      height,
      map,
      fade: null,
      title: { x: cx, y: base + 128 * u, size: 82 * u, maxWidth },
      rule: { x: cx, y: base + 166 * u, w: 84 * u, weight: 2.2 * u },
      subtitle: { x: cx, y: base + 210 * u, size: 26 * u, maxWidth },
      coords: { x: cx, y: base + 248 * u, size: 17 * u, maxWidth },
      credit: { x: width - m, y: height - 22 * u, size: 10 * u, maxWidth: width / 2 },
    };
  }

  const bottom = height - lift;
  return {
    width,
    height,
    map: { x: 0, y: 0, w: width, h: height },
    fade: { from: bottom - 470 * u, to: bottom - 170 * u },
    title: { x: cx, y: bottom - 200 * u, size: 86 * u, maxWidth },
    rule: { x: cx, y: bottom - 158 * u, w: 84 * u, weight: 2.2 * u },
    subtitle: { x: cx, y: bottom - 112 * u, size: 26 * u, maxWidth },
    coords: { x: cx, y: bottom - 72 * u, size: 17 * u, maxWidth },
    credit: { x: width - 28 * u, y: height - 24 * u, size: 10 * u, maxWidth: width / 2 },
  };
}

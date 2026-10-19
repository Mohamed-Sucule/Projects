/* Where everything sits on a poster of a given size. Pure numbers, shared by the preview,
   the download and the SVG, so all three always agree. */

import { RING } from '../sky/paint';

export const LAYOUT_IDS = ['clean', 'framed'] as const;
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
  /** the centre of the chart and the radius of its horizon */
  chart: { cx: number; cy: number; r: number };
  /** a thin border round the poster */
  frame: { inset: number; weight: number } | null;
  title: TextSlot;
  rule: { x: number; y: number; w: number; weight: number };
  subtitle: TextSlot;
  when: TextSlot;
  coords: TextSlot;
}

export function layoutPoster(width: number, height: number, layout: LayoutId): PosterLayout {
  const u = Math.min(width, height * 0.8) / 1000;
  const frame = layout === 'framed' ? { inset: 38 * u, weight: 2 * u } : null;
  const m = (frame ? 100 : 76) * u;

  // wide posters: the chart on the left, the words beside it
  if (width / height > 1.15) {
    const ring = height / 2 - m;
    const r = ring / RING;
    const cx = m + ring;
    const textX = (cx + ring + width - m * 0.6) / 2;
    const maxWidth = width - m * 0.6 - (cx + ring) - 60 * u;
    const mid = height / 2;
    return {
      width,
      height,
      chart: { cx, cy: mid, r },
      frame,
      ...words(textX, mid - 86 * u, u, maxWidth),
    };
  }

  // tall screens keep the chart below the clock and the words above the home bar
  const tall = height / width > 1.8;
  const lift = tall ? height * 0.07 : 0;
  const top = tall ? height * 0.27 : m;
  const textBlock = 330 * u;
  const bottom = height - textBlock - lift;
  const ring = Math.max(10, Math.min((width - 2 * m) / 2, (bottom - top) / 2));
  return {
    width,
    height,
    chart: { cx: width / 2, cy: (top + bottom) / 2, r: ring / RING },
    frame,
    ...words(width / 2, bottom + 118 * u, u, width - 2 * m),
  };
}

/** The block of words, its title's baseline at y. */
function words(x: number, y: number, u: number, maxWidth: number) {
  return {
    title: { x, y, size: 80 * u, maxWidth },
    rule: { x, y: y + 40 * u, w: 84 * u, weight: 2.2 * u },
    subtitle: { x, y: y + 86 * u, size: 26 * u, maxWidth },
    when: { x, y: y + 128 * u, size: 19 * u, maxWidth },
    coords: { x, y: y + 164 * u, size: 15 * u, maxWidth },
  };
}

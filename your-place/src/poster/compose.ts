/* Putting a poster together on the page: the map picture from the engine, then the fade,
   the grain and the words. While the map is being dragged the last picture is moved and
   scaled to where it belongs until a fresh one arrives, so the map follows the finger and
   the words stay still. */

import { paintFade, paintGrain } from '../map/draw';
import type { MapJob, Picture } from '../map/engine';
import { frameFor, type View } from '../map/geo';
import type { Theme } from '../map/themes';
import type { FontId } from './fonts';
import { layoutPoster, type PosterLayout } from './layout';
import { drawWords, type Words } from './words';

export interface Shown {
  picture: Picture;
  job: MapJob;
}

export interface Composition {
  layout: PosterLayout;
  theme: Theme;
  view: View;
  shown: Shown | null;
  words: Words | null;
  font: FontId;
}

/** Where a picture painted for one view lands when drawn for another. */
export function placement(shown: Shown, view: View, layout: PosterLayout) {
  const before = frameFor(
    shown.job.view,
    layoutPoster(shown.job.width, shown.job.height, shown.job.layout).map,
  );
  const after = frameFor(view, layout.map);
  const k = 2 ** (after.zoom - before.zoom);
  return {
    x: (before.left - before.rect.x) * k + after.rect.x - after.left,
    y: (before.top - before.rect.y) * k + after.rect.y - after.top,
    w: shown.job.width * k,
    h: shown.job.height * k,
  };
}

export function compose(ctx: CanvasRenderingContext2D, c: Composition): void {
  const { layout, theme } = c;
  const { width, height, map } = layout;
  ctx.save();
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  ctx.rect(map.x, map.y, map.w, map.h);
  ctx.clip();
  ctx.fillStyle = theme.landWash ? theme.landWash[1] : theme.land;
  ctx.fillRect(map.x, map.y, map.w, map.h);
  if (c.shown) {
    const at = placement(c.shown, c.view, layout);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c.shown.picture, at.x, at.y, at.w, at.h);
  }
  ctx.restore();
  if (layout.fade) paintFade(ctx, width, height, layout.fade, theme.paper);
  if (theme.grain > 0) paintGrain(ctx, width, height, theme.grain);
  if (c.words) drawWords(ctx, layout, c.words, c.font, theme);
}

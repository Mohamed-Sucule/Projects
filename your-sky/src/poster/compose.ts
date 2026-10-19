/* Putting a poster together: the paper, the chart, and the words. Everything on the
   poster, the preview, the thumbnails, the PNG and the SVG, comes through here. */

import { skyAt, type Matrix, type Sky } from '../sky/astro';
import { context2d, makeCanvas, type AnyCanvas } from '../sky/canvas';
import { milkyWayPixels, type SkyMap } from '../sky/milkyway';
import { paintChart, type Ctx } from '../sky/paint';
import { buildScene, type Measure, type Scene } from '../sky/scene';
import { THEMES, hexRgb, type Theme } from '../sky/themes';
import { toInstant, zoneAt, type LocalTime } from '../sky/time';
import { coordsLine, whenLine, type Poster } from '../state/poster';
import { FONTS } from 'poster-kit/fonts';
import { layoutPoster, type PosterLayout } from './layout';
import { canvasMeasure, drawWords, type Words } from './words';

export const wordsOf = (p: Poster, locale?: string): Words => ({
  title: p.title,
  subtitle: p.subtitle,
  when: whenLine(p, locale),
  coords: coordsLine(p),
});

export interface Moment {
  zone: string;
  at: Date;
  sky: Sky;
}

/** The time zone at a place, the instant its clocks show a time, and the sky then. */
export function momentAt(lat: number, lon: number, when: LocalTime): Moment {
  const zone = zoneAt(lat, lon);
  const at = toInstant(when, zone) ?? new Date(0);
  return { zone, at, sky: skyAt(lat, lon, at) };
}

export const momentOf = (p: Poster) => momentAt(p.place.lat, p.place.lon, p.when);

export function sceneFor(p: Poster, sky: Sky, layout: PosterLayout, measure: Measure): Scene {
  return buildScene(sky, layout.chart.r, p.show, measure, FONTS[p.font].family);
}

/* The Milky Way's glow is the slow part of a chart (every pixel is looked up in the sky
   map), and its colour and shape depend only on the sky and the style. So each is made
   once and kept for as long as nothing changes. */
const glows = new Map<string, AnyCanvas>();

export function milkyWayImage(
  map: SkyMap,
  rotation: Matrix,
  theme: Theme,
  size: number,
): AnyCanvas | null {
  const key = `${rotation.map((v) => v.toFixed(7)).join()}|${theme.milkyWay}|${theme.milkyWayStrength}|${size}`;
  const hit = glows.get(key);
  if (hit) {
    glows.delete(key);
    glows.set(key, hit);
    return hit;
  }
  const canvas = makeCanvas(size, size);
  const ctx = context2d(canvas);
  if (!ctx) return null;
  const pixels = milkyWayPixels(
    map,
    rotation,
    size,
    hexRgb(theme.milkyWay),
    theme.milkyWayStrength,
  );
  ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
  glows.set(key, canvas);
  if (glows.size > 12) glows.delete(glows.keys().next().value!);
  return canvas;
}

export interface Composition {
  poster: Poster;
  layout: PosterLayout;
  sky: Sky;
  /** the sky map for the Milky Way, once it has loaded */
  map: SkyMap | null;
  /** how many pixels across the Milky Way's glow is worked out at */
  glow: number;
  words: Words | null;
}

/** Draws a whole poster. Returns the scene, for anything that wants to know what is shown. */
export function compose(ctx: Ctx, c: Composition): Scene {
  const { layout, poster } = c;
  const theme = THEMES[poster.theme];
  const { width, height } = layout;
  ctx.save();
  if (theme.paperTo) {
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, theme.paper);
    g.addColorStop(1, theme.paperTo);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = theme.paper;
  }
  ctx.fillRect(0, 0, width, height);
  if (layout.frame) {
    const { inset, weight } = layout.frame;
    ctx.strokeStyle = theme.inkSoft;
    ctx.lineWidth = weight;
    ctx.strokeRect(inset, inset, width - 2 * inset, height - 2 * inset);
    ctx.lineWidth = weight / 2;
    const d = weight * 3;
    ctx.strokeRect(inset + d, inset + d, width - 2 * (inset + d), height - 2 * (inset + d));
  }
  const measure = canvasMeasure(ctx as CanvasRenderingContext2D);
  const scene = sceneFor(poster, c.sky, layout, measure);
  const milkyWay =
    poster.show.milkyWay && c.map ? milkyWayImage(c.map, c.sky.rotation, theme, c.glow) : null;
  paintChart(ctx, scene, layout.chart.cx, layout.chart.cy, {
    theme,
    family: FONTS[poster.font].family,
    milkyWay,
  });
  if (c.words) drawWords(ctx as CanvasRenderingContext2D, layout, c.words, poster.font, theme);
  ctx.restore();
  return scene;
}

export const layoutOf = (p: Poster, width: number, height: number) =>
  layoutPoster(width, height, p.layout);

/* Drawing a poster's map from decoded tiles.

   The geometry walk is written once against a three-method "pen", so the same code feeds
   both a canvas Path2D (preview and PNG) and an SVG path string (vector download). */

import type { DecodedTile } from './decode';
import { FILL_KINDS, LINE_KINDS, type Kind, type LineKind } from './kinds';
import { REF_WIDTH, TILE_SIZE, clamp, type Frame, type Rect, type TileId } from './geo';
import type { Theme } from './themes';

export interface PlacedTile {
  id: TileId;
  tile: DecodedTile;
}

export interface Pen {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A 2D context from either kind of canvas (the worker only has OffscreenCanvas). */
export function context2d(canvas: OffscreenCanvas | HTMLCanvasElement): Ctx | null {
  return 'transferToImageBitmap' in canvas ? canvas.getContext('2d') : canvas.getContext('2d');
}

/** Line widths for a map 1000 px wide, before the theme's weight and the zoom's adjustment. */
const WIDTH: Record<LineKind, number> = {
  motorway: 2.7,
  primary: 2.1,
  secondary: 1.65,
  tertiary: 1.3,
  minor: 0.9,
  service: 0.55,
  path: 0.4,
  rail: 0.7,
  river: 2,
  stream: 0.6,
  runway: 4.2,
};

const GLOWING: LineKind[] = ['minor', 'tertiary', 'secondary', 'primary', 'motorway'];
const LITE_SKIPS = new Set<Kind>([
  'building',
  'grass',
  'path',
  'service',
  'minor',
  'stream',
  'rail',
]);

/** Close views draw bolder lines, wide views finer ones, so every poster reads at arm's length. */
export function lineWidth(kind: LineKind, frame: Frame, theme: Theme): number {
  const viewZoom = frame.zoom - Math.log2(frame.rect.w / REF_WIDTH);
  const density = clamp(2 ** ((viewZoom - 13.5) * 0.4), 0.55, 1.8);
  return Math.max(0.5, WIDTH[kind] * theme.weight * density * (frame.rect.w / REF_WIDTH));
}

export function colourOf(kind: Kind, theme: Theme): string | undefined {
  switch (kind) {
    case 'water':
    case 'river':
    case 'stream':
      return theme.water;
    case 'park':
    case 'grass':
    case 'wood':
    case 'sand':
      return theme[kind];
    case 'pier':
      return theme.landWash ? theme.landWash[0] : theme.land;
    case 'building':
      return theme.building;
    case 'rail':
      return theme.rail;
    case 'runway':
      return theme.road.minor;
    default:
      return theme.road[kind];
  }
}

/**
 * Trace every ring or line of one kind, in output pixels. Shapes smaller than `minSize`
 * pixels across (a garden shed on a city-wide poster) are skipped. Returns how many were drawn.
 *
 * `close` ends each ring with closePath. SVG wants that. Canvas does not need it, since a
 * fill closes every ring by itself, and in Chromium each Path2D.closePath() costs time in
 * proportion to the path so far: 90,000 buildings took 85 seconds to trace with it and
 * 77 ms without.
 */
export function trace(
  pen: Pen,
  tiles: readonly PlacedTile[],
  kind: Kind,
  frame: Frame,
  close: boolean,
  minSize = 0,
): number {
  let count = 0;
  for (const { id, tile } of tiles) {
    const shapes = tile.shapes[kind];
    if (!shapes) continue;
    const scale = 2 ** (frame.zoom - id.z);
    const k = (TILE_SIZE / tile.extent) * scale;
    const ox = frame.rect.x + id.x * TILE_SIZE * scale - frame.left;
    const oy = frame.rect.y + id.y * TILE_SIZE * scale - frame.top;
    const { coords, starts } = shapes;
    for (let r = 0; r + 1 < starts.length; r++) {
      const a = starts[r]!;
      const b = starts[r + 1]!;
      if (minSize > 0 && extentOf(coords, a, b) * k < minSize) continue;
      pen.moveTo(ox + coords[a * 2]! * k, oy + coords[a * 2 + 1]! * k);
      for (let i = a + 1; i < b; i++)
        pen.lineTo(ox + coords[i * 2]! * k, oy + coords[i * 2 + 1]! * k);
      if (close) pen.closePath();
      count++;
    }
  }
  return count;
}

function extentOf(coords: Int16Array, a: number, b: number): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = a; i < b; i++) {
    const x = coords[i * 2]!;
    const y = coords[i * 2 + 1]!;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return Math.max(x1 - x0, y1 - y0);
}

export interface MapPaint {
  frame: Frame;
  theme: Theme;
  width: number;
  height: number;
  /** the SVG draws the fade itself; on canvas the page adds it, so it stays put while panning */
  fade: { from: number; to: number } | null;
  tiles: readonly PlacedTile[];
  /** thumbnails skip buildings, paths and streams, which they are too small to show */
  lite?: boolean;
  /** makes scratch canvases for the glow; absent where none can be made */
  scratch?: (w: number, h: number) => OffscreenCanvas | HTMLCanvasElement;
}

/** Paint the map layer of a poster: paper, land, water, green, buildings, streets, light. The
    fade, the grain and the words go on top in the page (see poster/compose.ts). */
export function paintMap(ctx: Ctx, p: MapPaint): void {
  const { frame, theme, width, height, tiles } = p;
  const { rect } = frame;

  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  ctx.fillStyle = theme.landWash ? wash(ctx, rect, theme.landWash) : theme.land;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  for (const kind of FILL_KINDS) {
    const colour = colourOf(kind, theme);
    if (!colour || (p.lite && LITE_SKIPS.has(kind))) continue;
    const path = new Path2D();
    const min = kind === 'building' ? 0.8 : 0.4;
    if (!trace(path, tiles, kind, frame, false, min)) continue;
    ctx.fillStyle = colour;
    ctx.fill(path);
  }

  if (theme.grid) paintGrid(ctx, rect, theme.grid);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const roads = new Map<LineKind, Path2D>();
  for (const kind of LINE_KINDS) {
    if (!colourOf(kind, theme) || (p.lite && LITE_SKIPS.has(kind))) continue;
    const path = new Path2D();
    if (trace(path, tiles, kind, frame, false)) roads.set(kind, path);
  }

  if (theme.glow && p.scratch) paintGlow(ctx, p, roads);

  for (const [kind, path] of roads) {
    ctx.strokeStyle = colourOf(kind, theme)!;
    ctx.lineWidth = lineWidth(kind, frame, theme);
    ctx.stroke(path);
  }

  if (theme.vignette) {
    const g = ctx.createRadialGradient(
      rect.x + rect.w / 2,
      rect.y + rect.h * 0.45,
      Math.min(rect.w, rect.h) * 0.25,
      rect.x + rect.w / 2,
      rect.y + rect.h * 0.45,
      Math.hypot(rect.w, rect.h) * 0.62,
    );
    g.addColorStop(0, transparent(theme.vignette.color));
    g.addColorStop(1, theme.vignette.color);
    ctx.globalAlpha = theme.vignette.alpha;
    ctx.fillStyle = g;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** The paper showing through at the foot of a full-bleed poster, behind its words. One
    gradient runs to the bottom edge: two fills meeting at a row leave a faint line there. */
export function paintFade(
  ctx: Ctx,
  width: number,
  height: number,
  fade: { from: number; to: number },
  paper: string,
) {
  const solid = (fade.to - fade.from) / (height - fade.from);
  const g = ctx.createLinearGradient(0, fade.from, 0, height);
  g.addColorStop(0, transparent(paper));
  g.addColorStop(solid * 0.55, withAlpha(paper, 0.82));
  g.addColorStop(solid, paper);
  g.addColorStop(1, paper);
  ctx.fillStyle = g;
  ctx.fillRect(0, fade.from, width, height - fade.from);
}

function wash(ctx: Ctx, rect: Rect, [inner, outer]: [string, string]): CanvasGradient {
  const g = ctx.createRadialGradient(
    rect.x + rect.w * 0.42,
    rect.y + rect.h * 0.38,
    0,
    rect.x + rect.w * 0.5,
    rect.y + rect.h * 0.5,
    Math.hypot(rect.w, rect.h) * 0.6,
  );
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  return g;
}

/* Light off the streets: the main roads are drawn again, thicker, onto a canvas a fifth of
   the size. Scaling it back up blurs it, which is far cheaper than a real blur and works
   in every browser. */
function paintGlow(ctx: Ctx, p: MapPaint, roads: Map<LineKind, Path2D>) {
  const { frame, theme } = p;
  const glow = theme.glow!;
  const k = 1 / 5;
  const small = p.scratch!(Math.ceil(p.width * k), Math.ceil(p.height * k));
  const sctx = context2d(small);
  if (!sctx) return;
  sctx.scale(k, k);
  sctx.lineCap = 'round';
  sctx.lineJoin = 'round';
  sctx.strokeStyle = glow.color;
  for (const kind of GLOWING) {
    const path = roads.get(kind);
    if (!path) continue;
    sctx.lineWidth = lineWidth(kind, frame, theme) * 3.2 + 2 / k;
    sctx.stroke(path);
  }
  ctx.save();
  ctx.globalAlpha = glow.alpha;
  ctx.globalCompositeOperation = 'screen';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, p.width, p.height);
  ctx.restore();
}

function paintGrid(ctx: Ctx, rect: Rect, grid: { color: string; alpha: number }) {
  const step = rect.w / 12;
  ctx.save();
  ctx.globalAlpha = grid.alpha;
  ctx.strokeStyle = grid.color;
  ctx.lineWidth = Math.max(0.5, rect.w / 1600);
  ctx.beginPath();
  for (let x = rect.x + step; x < rect.x + rect.w; x += step) {
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, rect.y + rect.h);
  }
  for (let y = rect.y + step; y < rect.y + rect.h; y += step) {
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
  }
  ctx.stroke();
  ctx.restore();
}

let grainTile: OffscreenCanvas | HTMLCanvasElement | null = null;

/** Paper grain: a tile of seeded noise, so the same poster always comes out the same. */
export function paintGrain(ctx: Ctx, width: number, height: number, amount: number) {
  if (!grainTile) {
    const size = 160;
    grainTile =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(size, size)
        : Object.assign(document.createElement('canvas'), { width: size, height: size });
    const gctx = context2d(grainTile);
    if (!gctx) return;
    const img = gctx.createImageData(size, size);
    const rand = mulberry32(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.round(rand() * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
  }
  const pattern = ctx.createPattern(grainTile, 'repeat');
  if (!pattern) return;
  const cell = Math.max(1, width / 1500);
  if (cell > 1 && typeof DOMMatrix !== 'undefined')
    pattern.setTransform(new DOMMatrix().scale(cell));
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "#rrggbb" to rgba() with the given alpha */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
const transparent = (hex: string) => withAlpha(hex, 0);

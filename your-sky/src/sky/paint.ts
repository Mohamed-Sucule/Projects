/* Drawing a scene onto a canvas. */

import { starColour, type Theme } from './themes';
import type { Label, MoonMark, Scene } from './scene';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface ChartStyle {
  theme: Theme;
  family: string;
  /** the Milky Way already drawn for this chart, as a square image, or nothing */
  milkyWay: CanvasImageSource | null;
}

/** Room the horizon ring and compass take outside the chart, as a share of its radius. */
export const RING = 1.1;

export function paintChart(ctx: Ctx, scene: Scene, cx: number, cy: number, style: ChartStyle) {
  const R = scene.radius;
  const { theme } = style;
  ctx.save();
  ctx.translate(cx, cy);

  const sky = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  sky.addColorStop(0, theme.sky);
  sky.addColorStop(0.62, theme.sky);
  sky.addColorStop(1, theme.skyEdge);
  ctx.fillStyle = sky;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.clip();
  if (style.milkyWay) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(style.milkyWay, -R, -R, 2 * R, 2 * R);
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (scene.grid.length) {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = R * 0.0013;
    strokeAll(ctx, scene.grid);
    ctx.setLineDash([R * 0.012, R * 0.009]);
    ctx.lineWidth = R * 0.0019;
    strokeAll(ctx, scene.ecliptic);
    ctx.setLineDash([]);
  }
  if (scene.figures.length) {
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = R * 0.0027;
    strokeAll(ctx, scene.figures);
  }

  paintStars(ctx, scene, theme);

  for (const p of scene.planets) {
    ctx.fillStyle = theme.star;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.star;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = R * 0.0016;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + R * 0.0075, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (scene.moon) paintMoon(ctx, scene.moon, theme);
  if (scene.sun) {
    const { x, y, r } = scene.sun;
    ctx.strokeStyle = theme.sun;
    ctx.fillStyle = theme.sun;
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
      ctx.lineTo(x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 1.25);
      ctx.stroke();
    }
  }
  for (const l of scene.labels) paintLabel(ctx, l, style);
  ctx.restore();

  paintRing(ctx, R, style);
  ctx.restore();
}

function strokeAll(ctx: Ctx, lines: Float32Array[]) {
  ctx.beginPath();
  for (const pts of lines) {
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  }
  ctx.stroke();
}

/** Stars smaller than this are drawn at this size, but fainter, so none flicker out. */
const SMALLEST = 0.7;

function paintStars(ctx: Ctx, scene: Scene, theme: Theme) {
  const { stars, starCount } = scene;
  // one path per colour: stars come in a few colours, so a few fills draw them all
  const buckets = new Map<string, { faint: Path2D; full: Path2D }>();
  const bucketOf = (bv: number) => {
    const key = theme.starTint ? starColour(theme, Math.round(bv * 5) / 5) : theme.star;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { faint: new Path2D(), full: new Path2D() }));
    return b;
  };
  let faintAlpha = 0;
  let faintCount = 0;
  for (let i = 0; i < starCount; i++) {
    const x = stars[i * 4]!;
    const y = stars[i * 4 + 1]!;
    const r = stars[i * 4 + 2]!;
    const b = bucketOf(stars[i * 4 + 3]!);
    const path = r < SMALLEST ? b.faint : b.full;
    if (r < SMALLEST) {
      faintAlpha += (r / SMALLEST) ** 2;
      faintCount++;
    }
    const rr = Math.max(r, SMALLEST);
    path.moveTo(x + rr, y);
    path.arc(x, y, rr, 0, Math.PI * 2);
  }
  // the faint ones share one average brightness: close enough at that size, and much faster
  const faint = faintCount ? faintAlpha / faintCount : 1;
  for (const [colour, b] of buckets) {
    ctx.fillStyle = colour;
    ctx.globalAlpha = faint;
    ctx.fill(b.faint);
    ctx.globalAlpha = 1;
    ctx.fill(b.full);
  }
  if (theme.halo > 0) {
    const h = scene.halos;
    for (let i = 0; i < h.length; i += 3) {
      const x = h[i]!;
      const y = h[i + 1]!;
      const r = h[i + 2]!;
      const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 4.2);
      g.addColorStop(0, withAlpha(theme.star, 0.32 * theme.halo));
      g.addColorStop(1, withAlpha(theme.star, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintMoon(ctx: Ctx, moon: MoonMark, theme: Theme) {
  const { x, y, r, toSun, cosPhase } = moon;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(toSun);
  if (theme.halo > 0) {
    const lit = (1 + cosPhase) / 2;
    const g = ctx.createRadialGradient(0, 0, r, 0, 0, r * 3.2);
    g.addColorStop(0, withAlpha(theme.moonLit, 0.22 * theme.halo * lit));
    g.addColorStop(1, withAlpha(theme.moonLit, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = theme.moonDark;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // the lit part, with the Sun to the right: the bright limb, then back along the terminator
  ctx.fillStyle = theme.moonLit;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.ellipse(0, 0, r * Math.abs(cosPhase), r, 0, Math.PI / 2, -Math.PI / 2, cosPhase < 0);
  ctx.fill();
  ctx.restore();
}

/* Labels get a thin halo in the colour of the sky behind them, as on printed maps, so a
   line or a faint star running under a name never makes it harder to read. */
function paintLabel(ctx: Ctx, l: Label, style: ChartStyle) {
  ctx.font = `${l.weight} ${l.size}px ${style.family}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.lineWidth = l.size * 0.28;
  ctx.strokeStyle = style.theme.sky;
  ctx.fillStyle = style.theme.label;
  const letters = l.spacing ? [...l.text] : [l.text];
  for (const pass of ['halo', 'text'] as const) {
    let x = l.x;
    for (const ch of letters) {
      if (pass === 'halo') ctx.strokeText(ch, x, l.y);
      else ctx.fillText(ch, x, l.y);
      x += ctx.measureText(ch).width + l.spacing;
    }
  }
}

export const COMPASS: [string, number][] = [
  ['N', -Math.PI / 2],
  ['W', 0],
  ['S', Math.PI / 2],
  ['E', Math.PI],
];

function paintRing(ctx: Ctx, R: number, style: ChartStyle) {
  const { theme } = style;
  ctx.strokeStyle = theme.ring;
  ctx.fillStyle = theme.ring;
  ctx.lineWidth = R * 0.0042;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = R * 0.0019;
  ctx.beginPath();
  for (let deg = 0; deg < 360; deg += 5) {
    const a = (deg * Math.PI) / 180;
    const len = deg % 45 === 0 ? 0.034 : deg % 15 === 0 ? 0.022 : 0.013;
    ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    ctx.lineTo(Math.cos(a) * R * (1 + len), Math.sin(a) * R * (1 + len));
  }
  ctx.stroke();
  ctx.font = `500 ${R * 0.046}px ${style.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [letter, a] of COMPASS) {
    ctx.fillText(letter, Math.cos(a) * R * 1.075, Math.sin(a) * R * 1.075);
  }
}

/** A colour from a theme (hex or rgb/rgba) with a new alpha. */
export function withAlpha(colour: string, alpha: number): string {
  if (colour.startsWith('#')) {
    const n = Number.parseInt(colour.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = /rgba?\(([^,]+),([^,]+),([^,)]+)/.exec(colour);
  return m ? `rgba(${m[1]},${m[2]},${m[3]}, ${alpha})` : colour;
}

/* The map layer as SVG: the same geometry walk as the canvas, written out as path data.
   Effects SVG has natively (gradients, blur, turbulence for grain) are kept, so the vector
   file looks like the PNG. */

import { FILL_KINDS, LINE_KINDS, type Kind } from './kinds';
import { colourOf, lineWidth, trace, type MapPaint, type Pen } from './draw';
import type { Rect } from './geo';

/** Path data with coordinates rounded to a tenth of a unit and repeated points dropped. */
export class SvgPen implements Pen {
  d = '';
  #lx = NaN;
  #ly = NaN;

  moveTo(x: number, y: number) {
    this.#lx = round(x);
    this.#ly = round(y);
    this.d += `M${this.#lx} ${this.#ly}`;
  }

  lineTo(x: number, y: number) {
    const rx = round(x);
    const ry = round(y);
    if (rx === this.#lx && ry === this.#ly) return;
    this.d += `L${rx} ${ry}`;
    this.#lx = rx;
    this.#ly = ry;
  }

  closePath() {
    this.d += 'Z';
  }
}

export const round = (v: number) => Math.round(v * 10) / 10;

const ENTITIES: Record<string, string> = {
  '<': 'lt',
  '>': 'gt',
  '&': 'amp',
  "'": 'apos',
  '"': 'quot',
};
export const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&${ENTITIES[c]};`);

const GLOWING = new Set<Kind>(['minor', 'tertiary', 'secondary', 'primary', 'motorway']);

const rectAttrs = (r: Rect) =>
  `x="${round(r.x)}" y="${round(r.y)}" width="${round(r.w)}" height="${round(r.h)}"`;

/** Everything below the words, as defs and body markup to place inside an <svg>. */
export function mapSvg(p: MapPaint): { defs: string; body: string } {
  const { frame, theme, width, height, tiles } = p;
  const { rect } = frame;
  const defs = [`<clipPath id="map"><rect ${rectAttrs(rect)}/></clipPath>`];
  const body = [`<rect width="${width}" height="${height}" fill="${theme.paper}"/>`];
  const map: string[] = [];

  if (theme.landWash) {
    const [inner, outer] = theme.landWash;
    defs.push(
      `<radialGradient id="wash" gradientUnits="userSpaceOnUse" cx="${round(rect.x + rect.w * 0.5)}" cy="${round(rect.y + rect.h * 0.5)}" fx="${round(rect.x + rect.w * 0.42)}" fy="${round(rect.y + rect.h * 0.38)}" r="${round(Math.hypot(rect.w, rect.h) * 0.6)}"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient>`,
    );
  }
  map.push(`<rect ${rectAttrs(rect)} fill="${theme.landWash ? 'url(#wash)' : theme.land}"/>`);

  for (const kind of FILL_KINDS) {
    const colour = colourOf(kind, theme);
    if (!colour) continue;
    const pen = new SvgPen();
    if (trace(pen, tiles, kind, frame, true, kind === 'building' ? 0.8 : 0.4)) {
      map.push(`<path fill="${colour}" d="${pen.d}"/>`);
    }
  }

  if (theme.grid) {
    const step = rect.w / 12;
    let d = '';
    for (let x = rect.x + step; x < rect.x + rect.w; x += step)
      d += `M${round(x)} ${round(rect.y)}V${round(rect.y + rect.h)}`;
    for (let y = rect.y + step; y < rect.y + rect.h; y += step)
      d += `M${round(rect.x)} ${round(y)}H${round(rect.x + rect.w)}`;
    map.push(
      `<path d="${d}" fill="none" stroke="${theme.grid.color}" stroke-opacity="${theme.grid.alpha}" stroke-width="${round(Math.max(0.5, rect.w / 1600))}"/>`,
    );
  }

  const roads: string[] = [];
  const glow: string[] = [];
  for (const kind of LINE_KINDS) {
    const colour = colourOf(kind, theme);
    if (!colour) continue;
    const pen = new SvgPen();
    if (!trace(pen, tiles, kind, frame, false)) continue;
    const w = lineWidth(kind, frame, theme);
    roads.push(
      `<path stroke="${colour}" stroke-width="${Math.round(w * 100) / 100}" d="${pen.d}"/>`,
    );
    if (theme.glow && GLOWING.has(kind))
      glow.push(`<path stroke-width="${round(w * 3.2 + 10)}" d="${pen.d}"/>`);
  }
  if (theme.glow && glow.length) {
    defs.push(
      `<filter id="glow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${round(width / 220)}"/></filter>`,
    );
    map.push(
      `<g fill="none" stroke="${theme.glow.color}" stroke-linecap="round" stroke-linejoin="round" opacity="${theme.glow.alpha}" filter="url(#glow)" style="mix-blend-mode:screen">${glow.join('')}</g>`,
    );
  }
  map.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">${roads.join('')}</g>`);

  if (theme.vignette) {
    const { color, alpha } = theme.vignette;
    defs.push(
      `<radialGradient id="vignette" gradientUnits="userSpaceOnUse" cx="${round(rect.x + rect.w / 2)}" cy="${round(rect.y + rect.h * 0.45)}" r="${round(Math.hypot(rect.w, rect.h) * 0.62)}"><stop offset="0.4" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${color}"/></radialGradient>`,
    );
    map.push(`<rect ${rectAttrs(rect)} fill="url(#vignette)" opacity="${alpha}"/>`);
  }
  body.push(`<g clip-path="url(#map)">${map.join('')}</g>`);

  if (p.fade) {
    const { from, to } = p.fade;
    const solid = Math.round(((to - from) / (height - from)) * 1000) / 1000;
    defs.push(
      `<linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="${round(from)}" x2="0" y2="${height}"><stop offset="0" stop-color="${theme.paper}" stop-opacity="0"/><stop offset="${Math.round(solid * 550) / 1000}" stop-color="${theme.paper}" stop-opacity="0.82"/><stop offset="${solid}" stop-color="${theme.paper}"/></linearGradient>`,
    );
    body.push(
      `<rect y="${round(from)}" width="${width}" height="${round(height - from)}" fill="url(#fade)"/>`,
    );
  }

  if (theme.grain > 0) {
    defs.push(
      `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${round((1500 / width) * 9) / 10}" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/></filter>`,
    );
    body.push(
      `<rect width="${width}" height="${height}" filter="url(#grain)" opacity="${theme.grain}" style="mix-blend-mode:overlay"/>`,
    );
  }

  return { defs: defs.join(''), body: body.join('') };
}

/* Drawing a scene as SVG: the same scene the canvas draws, as paths, circles and text. */

import { COMPASS, type ChartStyle } from './paint';
import type { Scene } from './scene';
import { starColour } from './themes';

export const round = (v: number) => Math.round(v * 10) / 10;

const ENTITIES: Record<string, string> = {
  '<': 'lt',
  '>': 'gt',
  '&': 'amp',
  "'": 'apos',
  '"': 'quot',
};
export const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&${ENTITIES[c]};`);

/** A colour attribute, with rgba() split into a colour and an opacity for tools that need it. */
export function colourAttrs(attr: 'fill' | 'stroke', colour: string): string {
  const m = /^rgba\(([^,]+),([^,]+),([^,]+),\s*([\d.]+)\)$/.exec(colour);
  if (!m) return `${attr}="${colour}"`;
  return `${attr}="rgb(${m[1]!.trim()}, ${m[2]!.trim()}, ${m[3]!.trim()})" ${attr}-opacity="${m[4]}"`;
}

const pathOf = (lines: Float32Array[], ox: number, oy: number) =>
  lines
    .map((pts) => {
      let d = `M${round(pts[0]! + ox)} ${round(pts[1]! + oy)}`;
      for (let i = 2; i < pts.length; i += 2)
        d += `L${round(pts[i]! + ox)} ${round(pts[i + 1]! + oy)}`;
      return d;
    })
    .join('');

export interface SvgChart {
  defs: string;
  body: string;
}

/**
 * The chart centred on (cx, cy). `milkyWay` is the glow as a PNG data URL: a glow has no
 * natural vector form, so it travels inside the SVG as a picture, under the vectors.
 */
export function chartSvg(
  scene: Scene,
  cx: number,
  cy: number,
  style: Omit<ChartStyle, 'milkyWay'>,
  milkyWay: string | null,
): SvgChart {
  const R = scene.radius;
  const { theme } = style;
  const defs = `<radialGradient id="sky" cx="${round(cx)}" cy="${round(cy)}" r="${round(R)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${theme.sky}"/><stop offset="0.62" stop-color="${theme.sky}"/><stop offset="1" stop-color="${theme.skyEdge}"/></radialGradient><clipPath id="horizon"><circle cx="${round(cx)}" cy="${round(cy)}" r="${round(R)}"/></clipPath>`;
  const out: string[] = [];
  out.push(`<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(R)}" fill="url(#sky)"/>`);
  out.push('<g clip-path="url(#horizon)">');
  if (milkyWay) {
    out.push(
      `<image href="${milkyWay}" x="${round(cx - R)}" y="${round(cy - R)}" width="${round(2 * R)}" height="${round(2 * R)}" preserveAspectRatio="none"/>`,
    );
  }
  if (scene.grid.length) {
    out.push(
      `<path d="${pathOf(scene.grid, cx, cy)}" fill="none" ${colourAttrs('stroke', theme.grid)} stroke-width="${round(R * 0.0013)}"/>`,
    );
    out.push(
      `<path d="${pathOf(scene.ecliptic, cx, cy)}" fill="none" ${colourAttrs('stroke', theme.grid)} stroke-width="${round(R * 0.0019)}" stroke-dasharray="${round(R * 0.012)} ${round(R * 0.009)}" stroke-linecap="round"/>`,
    );
  }
  if (scene.figures.length) {
    out.push(
      `<path d="${pathOf(scene.figures, cx, cy)}" fill="none" ${colourAttrs('stroke', theme.line)} stroke-width="${round(R * 0.0027)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  // stars, grouped by colour
  const groups = new Map<string, string[]>();
  for (let i = 0; i < scene.starCount; i++) {
    const s = scene.stars;
    const colour = theme.starTint
      ? starColour(theme, Math.round(s[i * 4 + 3]! * 5) / 5)
      : theme.star;
    let g = groups.get(colour);
    if (!g) groups.set(colour, (g = []));
    g.push(
      `<circle cx="${round(s[i * 4]! + cx)}" cy="${round(s[i * 4 + 1]! + cy)}" r="${Math.max(0.3, Math.round(s[i * 4 + 2]! * 100) / 100)}"/>`,
    );
  }
  for (const [colour, circles] of groups) out.push(`<g fill="${colour}">${circles.join('')}</g>`);

  for (const p of scene.planets) {
    out.push(
      `<circle cx="${round(p.x + cx)}" cy="${round(p.y + cy)}" r="${round(p.r)}" fill="${theme.star}"/><circle cx="${round(p.x + cx)}" cy="${round(p.y + cy)}" r="${round(p.r + R * 0.0075)}" fill="none" stroke="${theme.star}" stroke-opacity="0.7" stroke-width="${round(R * 0.0016)}"/>`,
    );
  }
  if (scene.moon) {
    const { x, y, r, toSun, cosPhase } = scene.moon;
    const deg = round((toSun * 180) / Math.PI);
    const rx = round(r * Math.abs(cosPhase));
    // the lit limb from top to bottom on the Sun's side, then the terminator back up
    const lit = `M0 ${round(-r)}A${round(r)} ${round(r)} 0 0 1 0 ${round(r)}A${rx} ${round(r)} 0 0 ${cosPhase < 0 ? 0 : 1} 0 ${round(-r)}Z`;
    out.push(
      `<g transform="translate(${round(x + cx)} ${round(y + cy)}) rotate(${deg})"><circle r="${round(r)}" ${colourAttrs('fill', theme.moonDark)}/><path d="${lit}" ${colourAttrs('fill', theme.moonLit)}/></g>`,
    );
  }
  if (scene.sun) {
    const { x, y, r } = scene.sun;
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return `M${round(x + cx + Math.cos(a) * r * 0.9)} ${round(y + cy + Math.sin(a) * r * 0.9)}L${round(x + cx + Math.cos(a) * r * 1.25)} ${round(y + cy + Math.sin(a) * r * 1.25)}`;
    }).join('');
    out.push(
      `<g stroke="${theme.sun}" stroke-width="${round(r * 0.14)}" fill="none"><circle cx="${round(x + cx)}" cy="${round(y + cy)}" r="${round(r * 0.62)}"/><path d="${rays}"/></g><circle cx="${round(x + cx)}" cy="${round(y + cy)}" r="${round(r * 0.16)}" fill="${theme.sun}"/>`,
    );
  }
  for (const l of scene.labels) {
    const spacing = l.spacing ? ` letter-spacing="${round(l.spacing)}"` : '';
    out.push(
      `<text x="${round(l.x + cx)}" y="${round(l.y + cy)}" font-family="${escapeXml(style.family)}" font-weight="${l.weight}" font-size="${round(l.size)}"${spacing} ${colourAttrs('fill', theme.label)} stroke="${theme.sky}" stroke-width="${round(l.size * 0.28)}" stroke-linejoin="round" paint-order="stroke">${escapeXml(l.text)}</text>`,
    );
  }
  out.push('</g>');

  // the horizon ring, its ticks, and the compass
  let ticks = '';
  for (let deg = 0; deg < 360; deg += 5) {
    const a = (deg * Math.PI) / 180;
    const len = deg % 45 === 0 ? 0.034 : deg % 15 === 0 ? 0.022 : 0.013;
    ticks += `M${round(cx + Math.cos(a) * R)} ${round(cy + Math.sin(a) * R)}L${round(cx + Math.cos(a) * R * (1 + len))} ${round(cy + Math.sin(a) * R * (1 + len))}`;
  }
  out.push(
    `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(R)}" fill="none" ${colourAttrs('stroke', theme.ring)} stroke-width="${round(R * 0.0042)}"/><path d="${ticks}" ${colourAttrs('stroke', theme.ring)} stroke-width="${round(R * 0.0019)}"/>`,
  );
  for (const [letter, a] of COMPASS) {
    out.push(
      `<text x="${round(cx + Math.cos(a) * R * 1.075)}" y="${round(cy + Math.sin(a) * R * 1.075)}" text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(style.family)}" font-weight="500" font-size="${round(R * 0.046)}" ${colourAttrs('fill', theme.ring)}>${letter}</text>`,
    );
  }
  return { defs, body: out.join('') };
}

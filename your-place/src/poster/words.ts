/* The words on a poster: the place's name, a rule, the country, the coordinates, and the
   OpenStreetMap credit the data's licence asks for. Measured once, then drawn either onto a
   canvas or into SVG, so both come out the same. */

import { escapeXml, round } from '../map/svg';
import type { Theme } from '../map/themes';
import { COORDS_FAMILY, FONTS, type FontId } from './fonts';
import type { PosterLayout, TextSlot } from './layout';

export const CREDIT = '© OpenStreetMap contributors';

export interface Words {
  title: string;
  subtitle: string;
  coords: string | null;
}

interface Line {
  text: string;
  font: string;
  family: string;
  weight: number;
  size: number;
  /** extra space between letters, in px */
  spacing: number;
  x: number;
  y: number;
  colour: string;
  align: 'center' | 'right';
}

type Measure = (font: string, text: string) => number;

/** Letters as people see them: "é" or a flag emoji is one, whatever its code points. */
export function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(
      (s) => s.segment,
    );
  }
  return [...text];
}

/* Letter spacing is a habit of Latin, Greek, Cyrillic and East Asian type. Arabic letters
   join up, right-to-left scripts run backwards, and Indic and Thai letters stack their vowel
   signs: drawn one letter at a time, all of them break. So only these scripts are spaced
   out, and everything else is set as one run, which the browser shapes and orders itself. */
const SPACEABLE =
  /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Common}\p{Script=Inherited}]*$/u;

export const canSpace = (text: string) => SPACEABLE.test(text);

const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

/** Width of text set with extra letter spacing (none: the run as the browser shapes it). */
export function spacedWidth(measure: Measure, font: string, text: string, spacing: number): number {
  if (spacing === 0) return measure(font, text);
  const letters = graphemes(text);
  return (
    letters.reduce((w, ch) => w + measure(font, ch), 0) + spacing * Math.max(0, letters.length - 1)
  );
}

/** Shrink a line until it fits its slot; spacing scales with the size. */
function fit(
  measure: Measure,
  slot: TextSlot,
  text: string,
  family: string,
  weight: number,
  spaced: number,
) {
  const tracking = canSpace(text) ? spaced : 0;
  let size = slot.size;
  for (let i = 0; i < 3; i++) {
    const font = `${weight} ${size}px ${family}`;
    const w = spacedWidth(measure, font, text, size * tracking);
    if (w <= slot.maxWidth) break;
    size *= (slot.maxWidth / w) * 0.995;
  }
  return { size, font: `${weight} ${size}px ${family}`, spacing: size * tracking };
}

export function setWords(
  measure: Measure,
  layout: PosterLayout,
  words: Words,
  fontId: FontId,
  theme: Theme,
): { lines: Line[]; rule: PosterLayout['rule'] | null } {
  const f = FONTS[fontId];
  const lines: Line[] = [];
  const add = (
    slot: TextSlot,
    text: string,
    family: string,
    weight: number,
    tracking: number,
    colour: string,
    align: Line['align'] = 'center',
  ) => {
    if (!text.trim()) return;
    const set = fit(measure, slot, text, family, weight, tracking);
    lines.push({ text, family, weight, ...set, x: slot.x, y: slot.y, colour, align });
  };
  const title = words.title.toLocaleUpperCase();
  add(layout.title, title, f.family, f.title, f.tracking, theme.ink);
  add(layout.subtitle, words.subtitle.toLocaleUpperCase(), f.family, f.body, 0.24, theme.inkSoft);
  if (words.coords) add(layout.coords, words.coords, COORDS_FAMILY, 400, 0.08, theme.inkSoft);
  add(layout.credit, CREDIT, COORDS_FAMILY, 400, 0.02, theme.inkSoft, 'right');
  return { lines, rule: title.trim() ? layout.rule : null };
}

export function canvasMeasure(ctx: CanvasRenderingContext2D): Measure {
  const cache = new Map<string, number>();
  return (font, text) => {
    const key = `${font}|${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  };
}

export function drawWords(
  ctx: CanvasRenderingContext2D,
  layout: PosterLayout,
  words: Words,
  fontId: FontId,
  theme: Theme,
) {
  const measure = canvasMeasure(ctx);
  const { lines, rule } = setWords(measure, layout, words, fontId, theme);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const line of lines) {
    ctx.font = line.font;
    ctx.fillStyle = line.colour;
    if (line.spacing === 0) {
      ctx.textAlign = line.align;
      ctx.direction = RTL.test(line.text) ? 'rtl' : 'ltr';
      ctx.fillText(line.text, line.x, line.y);
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      continue;
    }
    const total = spacedWidth(measure, line.font, line.text, line.spacing);
    let x = line.align === 'center' ? line.x - total / 2 : line.x - total;
    for (const ch of graphemes(line.text)) {
      ctx.fillText(ch, x, line.y);
      x += measure(line.font, ch) + line.spacing;
    }
  }
  if (rule) {
    ctx.fillStyle = theme.ink;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(rule.x - rule.w / 2, rule.y - rule.weight / 2, rule.w, rule.weight);
  }
  ctx.restore();
}

export function wordsSvg(
  measure: Measure,
  layout: PosterLayout,
  words: Words,
  fontId: FontId,
  theme: Theme,
): string {
  const { lines, rule } = setWords(measure, layout, words, fontId, theme);
  const out = lines.map((l) => {
    const anchor = l.align === 'center' ? 'middle' : 'end';
    // SVG adds letter spacing after the last letter too; shift by half (or all) of it to match
    const nudge = l.align === 'center' ? l.spacing / 2 : l.spacing;
    const spacing = l.spacing ? ` letter-spacing="${round(l.spacing)}"` : '';
    return `<text x="${round(l.x + nudge)}" y="${round(l.y)}" text-anchor="${anchor}" font-family="${escapeXml(l.family)}" font-weight="${l.weight}" font-size="${round(l.size)}"${spacing} fill="${l.colour}">${escapeXml(l.text)}</text>`;
  });
  if (rule) {
    out.push(
      `<rect x="${round(rule.x - rule.w / 2)}" y="${round(rule.y - rule.weight / 2)}" width="${round(rule.w)}" height="${round(rule.weight)}" fill="${theme.ink}" opacity="0.7"/>`,
    );
  }
  return out.join('');
}

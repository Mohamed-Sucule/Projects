/* The three typefaces a poster can be set in, loaded for the page, waited for before a canvas
   draws with them, and embedded in an SVG so the file looks the same on any machine. */

import '@fontsource-variable/fraunces';
import '@fontsource-variable/outfit';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import outfitUrl from '@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?url';
import frauncesUrl from '@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?url';
import plexUrl from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
import plexMediumUrl from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';
import { blobToDataUrl } from './files';

export const FONT_IDS = ['sans', 'serif', 'mono'] as const;
export type FontId = (typeof FONT_IDS)[number];
export const isFontId = (v: unknown): v is FontId =>
  typeof v === 'string' && (FONT_IDS as readonly string[]).includes(v);

export interface PosterFont {
  label: string;
  family: string;
  title: number;
  body: number;
  /** letter spacing of the title, in ems */
  tracking: number;
}

export const FONTS: Record<FontId, PosterFont> = {
  sans: {
    label: 'Modern',
    family: '"Outfit Variable", system-ui, sans-serif',
    title: 600,
    body: 400,
    tracking: 0.34,
  },
  serif: {
    label: 'Classic',
    family: '"Fraunces Variable", Georgia, serif',
    title: 560,
    body: 400,
    tracking: 0.2,
  },
  mono: {
    label: 'Typewriter',
    family: '"IBM Plex Mono", ui-monospace, monospace',
    title: 500,
    body: 400,
    tracking: 0.22,
  },
};

export const COORDS_FAMILY = '"IBM Plex Mono", ui-monospace, monospace';

/** Canvas text only uses a web font once it has loaded, so wait for the ones a poster needs. */
export async function fontsReady(font: FontId): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const f = FONTS[font];
  await Promise.all([
    document.fonts.load(`${f.title} 64px ${f.family}`),
    document.fonts.load(`${f.body} 32px ${f.family}`),
    document.fonts.load(`400 20px ${COORDS_FAMILY}`),
  ]).catch(() => undefined);
}

/** @font-face rules with the font files inlined, for the faces a poster in `font` uses. */
export async function embeddedFonts(font: FontId): Promise<string> {
  const faces: [string, string, string][] = [['IBM Plex Mono', '400', plexUrl]];
  if (font === 'sans') faces.push(['Outfit Variable', '100 900', outfitUrl]);
  if (font === 'serif') faces.push(['Fraunces Variable', '100 900', frauncesUrl]);
  if (font === 'mono') faces.push(['IBM Plex Mono', '500', plexMediumUrl]);
  const css = await Promise.all(
    faces.map(async ([family, weight, url]) => {
      const res = await fetch(url);
      const data = await blobToDataUrl(await res.blob(), 'font/woff2');
      return `@font-face{font-family:"${family}";font-weight:${weight};src:url(${data}) format("woff2")}`;
    }),
  );
  return css.join('');
}

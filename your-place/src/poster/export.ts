/* Downloads: a print-ready PNG, and an SVG for anyone who wants to take it further. */

import outfitUrl from '@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2?url';
import frauncesUrl from '@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?url';
import plexUrl from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
import plexMediumUrl from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';
import type { MapClient } from '../map/client';
import type { MapJob } from '../map/engine';
import { PRIORITY } from '../map/protocol';
import { THEMES } from '../map/themes';
import { coordsLine, type Poster } from '../state/poster';
import { compose } from './compose';
import { fontsReady, type FontId } from './fonts';
import { layoutPoster } from './layout';
import { SIZES, exportSize, pixelBudget } from './sizes';
import { canvasMeasure, wordsSvg, type Words } from './words';

export const wordsOf = (p: Poster): Words => ({
  title: p.title,
  subtitle: p.subtitle,
  coords: coordsLine(p),
});

export function fileName(p: Poster, ext: 'png' | 'svg'): string {
  const slug =
    p.title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'poster';
  return `${slug}-${p.theme}-${p.size}.${ext}`;
}

export class IncompleteMap extends Error {
  constructor(readonly missing: number) {
    super(
      missing === 1
        ? 'One piece of the map did not load. Please try again.'
        : `${missing} pieces of the map did not load. Please try again.`,
    );
  }
}

export async function renderPng(client: MapClient, poster: Poster): Promise<Blob> {
  const { width, height } = exportSize(poster.size, poster.orientation, pixelBudget());
  const job: MapJob = {
    view: poster.view,
    width,
    height,
    layout: poster.layout,
    theme: poster.theme,
  };
  const [painted] = await Promise.all([
    client.paint('export', job, PRIORITY.export),
    fontsReady(poster.font),
  ]);
  if (!painted) throw new Error('The download was replaced by a newer one');
  if (painted.missing > 0) throw new IncompleteMap(painted.missing);

  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not make the image');
  compose(ctx, {
    layout: layoutPoster(width, height, poster.layout),
    theme: THEMES[poster.theme],
    view: poster.view,
    shown: { picture: painted.picture, job },
    words: wordsOf(poster),
    font: poster.font,
  });
  if ('close' in painted.picture) painted.picture.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('The image could not be saved'))),
      'image/png',
    ),
  );
}

const SVG_WIDTH = 2000;

export async function renderSvg(client: MapClient, poster: Poster): Promise<Blob> {
  const size = SIZES[poster.size];
  const big = exportSize(poster.size, poster.orientation, 4e6);
  const width = SVG_WIDTH;
  const height = Math.round((SVG_WIDTH * big.height) / big.width);
  const job: MapJob = {
    view: poster.view,
    width,
    height,
    layout: poster.layout,
    theme: poster.theme,
  };
  const [map, fonts] = await Promise.all([client.svg(job), embeddedFonts(poster.font)]);

  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) throw new Error('This browser could not set the words');
  await fontsReady(poster.font);
  const layout = layoutPoster(width, height, poster.layout);
  const words = wordsSvg(
    canvasMeasure(measureCtx),
    layout,
    wordsOf(poster),
    poster.font,
    THEMES[poster.theme],
  );

  let physical = '';
  if (size.kind === 'print') {
    const [short, long] = size.mm;
    const [w, h] = poster.orientation === 'portrait' ? [short, long] : [long, short];
    physical = ` width="${w}mm" height="${h}mm"`;
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"${physical}>
<title>${poster.title.replace(/[<>&]/g, '')}</title>
<defs><style>${fonts}</style>${map.defs}</defs>
${map.body}
${words}
</svg>
`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

/** The poster's fonts, inlined, so the SVG looks right on a machine that does not have them. */
async function embeddedFonts(font: FontId): Promise<string> {
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

function blobToDataUrl(blob: Blob, type: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result.replace(/^data:[^;]*;/, `data:${type};`))
        : reject(new Error('Could not read a font'));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read a font'));
    reader.readAsDataURL(blob);
  });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

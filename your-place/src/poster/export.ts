/* Downloads: a print-ready PNG, and an SVG for anyone who wants to take it further. */

import type { MapClient } from '../map/client';
import type { MapJob } from '../map/engine';
import { PRIORITY } from '../map/protocol';
import { THEMES } from '../map/themes';
import { coordsLine, type Poster } from '../state/poster';
import { compose } from './compose';
import { embeddedFonts, fontsReady } from 'poster-kit/fonts';
import { layoutPoster } from './layout';
import { SIZES, exportSize, pixelBudget } from 'poster-kit/sizes';
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

/* Downloads: a print-ready PNG, and an SVG for anyone who wants to take it further. */

import type { AnyCanvas } from '../sky/canvas';
import type { SkyMap } from '../sky/milkyway';
import { chartSvg, colourAttrs, escapeXml } from '../sky/svg';
import { THEMES } from '../sky/themes';
import type { Poster } from '../state/poster';
import { compose, milkyWayImage, momentOf, sceneFor, wordsOf } from './compose';
import { blobToDataUrl } from 'poster-kit/files';
import { FONTS, embeddedFonts, fontsReady } from 'poster-kit/fonts';
import { layoutPoster } from './layout';
import { SIZES, exportSize, pixelBudget } from 'poster-kit/sizes';
import { canvasMeasure, wordsSvg } from './words';

export function fileName(p: Poster, ext: 'png' | 'svg'): string {
  const slug =
    `${p.title || p.place.name} ${p.when.date}`
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sky';
  return `${slug}-${p.theme}.${ext}`;
}

/** The Milky Way is a soft glow, so it is worked out at most this many pixels across. */
const GLOW = 1400;

export async function renderPng(poster: Poster, map: SkyMap | null): Promise<Blob> {
  const { width, height } = exportSize(poster.size, poster.orientation, pixelBudget());
  await fontsReady(poster.font);
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not make the image');
  const layout = layoutPoster(width, height, poster.layout);
  compose(ctx, {
    poster,
    layout,
    sky: momentOf(poster).sky,
    map,
    glow: Math.min(GLOW, Math.round(layout.chart.r * 2)),
    words: wordsOf(poster),
  });
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('The image could not be saved'))),
      'image/png',
    ),
  );
}

const SVG_WIDTH = 2000;

export async function renderSvg(poster: Poster, map: SkyMap | null): Promise<Blob> {
  const size = SIZES[poster.size];
  const big = exportSize(poster.size, poster.orientation, 4e6);
  const width = SVG_WIDTH;
  const height = Math.round((SVG_WIDTH * big.height) / big.width);
  const [fonts] = await Promise.all([embeddedFonts(poster.font), fontsReady(poster.font)]);
  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) throw new Error('This browser could not set the words');
  const measure = canvasMeasure(measureCtx);
  const theme = THEMES[poster.theme];
  const layout = layoutPoster(width, height, poster.layout);
  const { sky } = momentOf(poster);
  const scene = sceneFor(poster, sky, layout, measure);

  let glow: string | null = null;
  if (poster.show.milkyWay && map) {
    const image = milkyWayImage(
      map,
      sky.rotation,
      theme,
      Math.min(1024, Math.round(layout.chart.r * 2)),
    );
    if (image) glow = await canvasToDataUrl(image);
  }
  const chart = chartSvg(
    scene,
    layout.chart.cx,
    layout.chart.cy,
    { theme, family: FONTS[poster.font].family },
    glow,
  );
  const words = wordsSvg(measure, layout, wordsOf(poster), poster.font, theme);

  const paper = theme.paperTo
    ? `<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.paper}"/><stop offset="1" stop-color="${theme.paperTo}"/></linearGradient>`
    : '';
  let frame = '';
  if (layout.frame) {
    const { inset, weight } = layout.frame;
    const d = weight * 3;
    const stroke = colourAttrs('stroke', theme.inkSoft);
    frame = `<rect x="${inset}" y="${inset}" width="${width - 2 * inset}" height="${height - 2 * inset}" fill="none" ${stroke} stroke-width="${weight}"/><rect x="${inset + d}" y="${inset + d}" width="${width - 2 * (inset + d)}" height="${height - 2 * (inset + d)}" fill="none" ${stroke} stroke-width="${weight / 2}"/>`;
  }
  let physical = '';
  if (size.kind === 'print') {
    const [short, long] = size.mm;
    const [w, h] = poster.orientation === 'portrait' ? [short, long] : [long, short];
    physical = ` width="${w}mm" height="${h}mm"`;
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"${physical}>
<title>${escapeXml(poster.title || poster.place.name)}</title>
<defs><style>${fonts}</style>${paper}${chart.defs}</defs>
<rect width="${width}" height="${height}" fill="${theme.paperTo ? 'url(#paper)' : theme.paper}"/>
${frame}
${chart.body}
${words}
</svg>
`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

async function canvasToDataUrl(canvas: AnyCanvas): Promise<string> {
  const blob =
    'convertToBlob' in canvas
      ? await canvas.convertToBlob({ type: 'image/png' })
      : await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'),
        );
  return blobToDataUrl(blob, 'image/png');
}

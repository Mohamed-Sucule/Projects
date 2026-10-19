/* A poster lives in its address, so a link is the whole poster: no account, no server.
   Anything missing or malformed in a link falls back to the default instead of breaking. */

import { isThemeId } from '../map/themes';
import { isFontId } from 'poster-kit/fonts';
import { isLayoutId } from '../poster/layout';
import { isSizeId } from 'poster-kit/sizes';
import { MAX_SUBTITLE, MAX_TITLE, cleanView, type Poster } from './poster';

export function toSearch(p: Poster): string {
  const q = new URLSearchParams();
  q.set('lat', p.view.lat.toFixed(5));
  q.set('lon', p.view.lon.toFixed(5));
  q.set('z', p.view.zoom.toFixed(2));
  q.set('t', p.title);
  q.set('s', p.subtitle);
  if (!p.showCoords) q.set('c', '0');
  q.set('style', p.theme);
  q.set('font', p.font);
  q.set('size', p.size);
  if (p.orientation === 'landscape') q.set('o', 'l');
  if (p.layout !== 'full') q.set('layout', p.layout);
  return `?${q.toString()}`;
}

const num = (v: string | null) => {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The poster a link describes, or null when the link holds no place. */
export function fromSearch(search: string, base: Poster): Poster | null {
  const q = new URLSearchParams(search);
  const lat = num(q.get('lat'));
  const lon = num(q.get('lon'));
  if (lat === null || lon === null) return null;
  const zoom = num(q.get('z')) ?? base.view.zoom;
  const theme = q.get('style');
  const font = q.get('font');
  const size = q.get('size');
  const layout = q.get('layout');
  return {
    view: cleanView({ lat, lon, zoom }),
    title: (q.get('t') ?? '').slice(0, MAX_TITLE),
    subtitle: (q.get('s') ?? '').slice(0, MAX_SUBTITLE),
    showCoords: q.get('c') !== '0',
    theme: isThemeId(theme) ? theme : base.theme,
    font: isFontId(font) ? font : base.font,
    size: isSizeId(size) ? size : base.size,
    orientation: q.get('o') === 'l' ? 'landscape' : 'portrait',
    layout: isLayoutId(layout) ? layout : base.layout,
  };
}

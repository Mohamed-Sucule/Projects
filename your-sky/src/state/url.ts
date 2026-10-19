/* A poster lives in its address, so a link is the whole poster: no account, no server.
   Anything missing or malformed in a link falls back to the default instead of breaking. */

import { isFontId } from 'poster-kit/fonts';
import { isLayoutId } from '../poster/layout';
import { isSizeId } from 'poster-kit/sizes';
import { isThemeId } from '../sky/themes';
import { clampYear, parseLocal } from '../sky/time';
import { MAX_SUBTITLE, MAX_TITLE, cleanSpot, type Poster, type Show } from './poster';

const SHOW_KEYS: [keyof Show, string][] = [
  ['lines', 'l'],
  ['names', 'n'],
  ['grid', 'g'],
  ['milkyWay', 'm'],
];

export function toSearch(p: Poster): string {
  const q = new URLSearchParams();
  q.set('lat', p.place.lat.toFixed(5));
  q.set('lon', p.place.lon.toFixed(5));
  q.set('place', p.place.name);
  if (p.place.context) q.set('in', p.place.context);
  q.set('d', p.when.date);
  q.set('at', p.when.time);
  q.set('t', p.title);
  q.set('s', p.subtitle);
  if (!p.showWhen) q.set('w', '0');
  if (!p.showCoords) q.set('c', '0');
  // what the chart shows, as letters: "lnm" is lines, names and the Milky Way
  q.set(
    'show',
    SHOW_KEYS.filter(([k]) => p.show[k])
      .map(([, c]) => c)
      .join('') || '-',
  );
  q.set('style', p.theme);
  q.set('font', p.font);
  q.set('size', p.size);
  if (p.orientation === 'landscape') q.set('o', 'l');
  if (p.layout !== 'clean') q.set('layout', p.layout);
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
  const when = { date: q.get('d') ?? '', time: q.get('at') ?? '' };
  const show = q.get('show');
  const theme = q.get('style');
  const font = q.get('font');
  const size = q.get('size');
  const layout = q.get('layout');
  const name = q.get('place') ?? '';
  return {
    place: cleanSpot({ name, context: q.get('in') ?? '', lat, lon }),
    when: parseLocal(when) ? clampYear(when) : base.when,
    title: (q.get('t') ?? name).slice(0, MAX_TITLE),
    subtitle: (q.get('s') ?? q.get('in') ?? '').slice(0, MAX_SUBTITLE),
    showWhen: q.get('w') !== '0',
    showCoords: q.get('c') !== '0',
    show: show === null ? base.show : readShow(show),
    theme: isThemeId(theme) ? theme : base.theme,
    font: isFontId(font) ? font : base.font,
    size: isSizeId(size) ? size : base.size,
    orientation: q.get('o') === 'l' ? 'landscape' : 'portrait',
    layout: isLayoutId(layout) ? layout : base.layout,
  };
}

function readShow(letters: string): Show {
  const has = (key: keyof Show) => letters.includes(SHOW_KEYS.find(([k]) => k === key)![1]);
  return { lines: has('lines'), names: has('names'), grid: has('grid'), milkyWay: has('milkyWay') };
}

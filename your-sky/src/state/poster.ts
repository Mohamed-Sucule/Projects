/* Everything that makes one poster, and every way it can change. */

import type { FontId } from '../poster/fonts';
import type { LayoutId } from '../poster/layout';
import { aspectOf, hasOrientation, type Orientation, type SizeId } from '../poster/sizes';
import type { ThemeId } from '../sky/themes';
import { clampYear, formatWhen, parseLocal, type LocalTime } from '../sky/time';

export interface Spot {
  /** "Paris" */
  name: string;
  /** what the poster says below it by default: "France" */
  context: string;
  lat: number;
  lon: number;
}

export interface Show {
  lines: boolean;
  names: boolean;
  grid: boolean;
  milkyWay: boolean;
}

export interface Poster {
  place: Spot;
  /** the date and time on a clock at the place */
  when: LocalTime;
  title: string;
  subtitle: string;
  showWhen: boolean;
  showCoords: boolean;
  show: Show;
  theme: ThemeId;
  font: FontId;
  size: SizeId;
  orientation: Orientation;
  layout: LayoutId;
}

export const MAX_TITLE = 40;
export const MAX_SUBTITLE = 60;

export const DEFAULT_POSTER: Poster = {
  place: { name: 'Paris', context: 'France', lat: 48.8534, lon: 2.3488 },
  when: { date: '2025-02-14', time: '22:00' },
  title: 'Paris',
  subtitle: 'France',
  showWhen: true,
  showCoords: true,
  show: { lines: true, names: true, grid: false, milkyWay: true },
  theme: 'midnight',
  font: 'serif',
  size: 'a3',
  orientation: 'portrait',
  layout: 'clean',
};

export type Action =
  | { type: 'place'; place: Spot }
  /** `settled` is false while the time slider is moving */
  | { type: 'when'; value: LocalTime; settled?: boolean }
  | { type: 'title'; value: string }
  | { type: 'subtitle'; value: string }
  | { type: 'showWhen'; value: boolean }
  | { type: 'coords'; value: boolean }
  | { type: 'show'; key: keyof Show; value: boolean }
  | { type: 'theme'; value: ThemeId }
  | { type: 'font'; value: FontId }
  | { type: 'size'; value: SizeId }
  | { type: 'orientation'; value: Orientation }
  | { type: 'layout'; value: LayoutId };

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function wrapLon(lon: number): number {
  if (lon >= -180 && lon <= 180) return lon;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export const cleanSpot = (s: Spot): Spot => ({
  name: s.name.slice(0, MAX_TITLE),
  context: s.context.slice(0, MAX_SUBTITLE),
  lat: clamp(s.lat, -90, 90),
  lon: wrapLon(s.lon),
});

export function reducePoster(state: Poster, action: Action): Poster {
  switch (action.type) {
    case 'place': {
      const place = cleanSpot(action.place);
      // words still as they came with the old place follow the new one; your own words stay
      const title = state.title === state.place.name ? place.name : state.title;
      const subtitle = state.subtitle === state.place.context ? place.context : state.subtitle;
      return { ...state, place, title, subtitle };
    }
    case 'when': {
      if (!parseLocal(action.value)) return state;
      const when = clampYear(action.value);
      return when.date === state.when.date && when.time === state.when.time
        ? state
        : { ...state, when };
    }
    case 'title':
      return { ...state, title: action.value.slice(0, MAX_TITLE) };
    case 'subtitle':
      return { ...state, subtitle: action.value.slice(0, MAX_SUBTITLE) };
    case 'showWhen':
      return { ...state, showWhen: action.value };
    case 'coords':
      return { ...state, showCoords: action.value };
    case 'show':
      return { ...state, show: { ...state.show, [action.key]: action.value } };
    case 'theme':
      return { ...state, theme: action.value };
    case 'font':
      return { ...state, font: action.value };
    case 'size':
      return { ...state, size: action.value };
    case 'orientation':
      return hasOrientation(state.size) ? { ...state, orientation: action.value } : state;
    case 'layout':
      return { ...state, layout: action.value };
  }
}

/** Typing in a field is one step to undo, not one per letter. */
export function groupKey(action: Action): string | null {
  switch (action.type) {
    case 'title':
    case 'subtitle':
      return action.type;
    case 'when':
      // the date and time fields fire on every change too
      return action.settled === undefined ? 'when' : null;
    default:
      return null;
  }
}

export const posterAspect = (p: Poster) => aspectOf(p.size, p.orientation);

export function formatCoords(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}  ·  ${Math.abs(wrapLon(lon)).toFixed(4)}° ${ew}`;
}

export const coordsLine = (p: Poster) =>
  p.showCoords ? formatCoords(p.place.lat, p.place.lon) : null;

export const whenLine = (p: Poster, locale?: string) =>
  p.showWhen ? formatWhen(p.when, locale) : null;

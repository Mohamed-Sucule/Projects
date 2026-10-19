/* Everything that makes one poster, and every way it can change. */

import { MAX_ZOOM, MIN_ZOOM, clamp, formatCoords, wrapLon, type View } from '../map/geo';
import type { ThemeId } from '../map/themes';
import type { FontId } from '../poster/fonts';
import type { LayoutId } from '../poster/layout';
import { aspectOf, hasOrientation, type Orientation, type SizeId } from '../poster/sizes';

export interface Poster {
  view: View;
  title: string;
  subtitle: string;
  showCoords: boolean;
  theme: ThemeId;
  font: FontId;
  size: SizeId;
  orientation: Orientation;
  layout: LayoutId;
}

export const MAX_TITLE = 40;
export const MAX_SUBTITLE = 60;

export const DEFAULT_POSTER: Poster = {
  view: { lon: 2.3488, lat: 48.8534, zoom: 13.3 },
  title: 'Paris',
  subtitle: 'France',
  showCoords: true,
  theme: 'paper',
  font: 'sans',
  size: 'a3',
  orientation: 'portrait',
  layout: 'full',
};

export type Action =
  | { type: 'place'; view: View; title: string; subtitle: string }
  /** `settled` is false while a drag or a pinch is still going */
  | { type: 'view'; view: View; settled: boolean }
  | { type: 'title'; value: string }
  | { type: 'subtitle'; value: string }
  | { type: 'coords'; value: boolean }
  | { type: 'theme'; value: ThemeId }
  | { type: 'font'; value: FontId }
  | { type: 'size'; value: SizeId }
  | { type: 'orientation'; value: Orientation }
  | { type: 'layout'; value: LayoutId };

export const cleanView = (v: View): View => ({
  lon: wrapLon(v.lon),
  lat: clamp(v.lat, -80, 84),
  zoom: clamp(v.zoom, MIN_ZOOM, MAX_ZOOM),
});

export function reducePoster(state: Poster, action: Action): Poster {
  switch (action.type) {
    case 'place':
      return {
        ...state,
        view: cleanView(action.view),
        title: action.title.slice(0, MAX_TITLE),
        subtitle: action.subtitle.slice(0, MAX_SUBTITLE),
      };
    case 'view':
      return { ...state, view: cleanView(action.view) };
    case 'title':
      return { ...state, title: action.value.slice(0, MAX_TITLE) };
    case 'subtitle':
      return { ...state, subtitle: action.value.slice(0, MAX_SUBTITLE) };
    case 'coords':
      return { ...state, showCoords: action.value };
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
    default:
      return null;
  }
}

export const posterAspect = (p: Poster) => aspectOf(p.size, p.orientation);

export const coordsLine = (p: Poster) =>
  p.showCoords ? formatCoords(p.view.lat, p.view.lon) : null;

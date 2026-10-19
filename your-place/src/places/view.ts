/* Where a map poster of a place starts. */

import type { Place } from 'poster-kit/photon';
import { MAX_ZOOM, clamp, fitZoom, type View } from '../map/geo';

/* A city's own boundary can take in its whole hinterland (Greater London, or Tokyo's islands),
   which makes a poster of fields. So a poster starts at most about 11 km across (at mid
   latitudes), and a single building or address gets its neighbourhood around it. */
const WIDEST = 13.2;
const CLOSEST = 15.2;

export function viewForPlace(place: Place, aspect: number): View {
  const zoom = place.bbox ? fitZoom(place.bbox, aspect) : CLOSEST;
  return { lon: place.lon, lat: place.lat, zoom: clamp(zoom, WIDEST, Math.min(CLOSEST, MAX_ZOOM)) };
}

/** "Where I am" on a map is the street you are standing in, not the middle of the town. */
export const hereOnTheMap = (town: Place, { lon, lat }: { lon: number; lat: number }): Place => ({
  ...town,
  lon,
  lat,
  bbox: null,
  kind: 'house',
});

/* Finding places with Photon, Komoot's open geocoder built on OpenStreetMap. It is made for
   search-as-you-type, which OpenStreetMap's own Nominatim asks people not to use it for. */

export const PHOTON_URL: string =
  (import.meta.env?.VITE_PHOTON as string | undefined) ?? 'https://photon.komoot.io';

export interface Place {
  id: string;
  name: string;
  /** what makes it recognisable in a list: "Zürich, Switzerland" */
  context: string;
  /** what goes on the poster */
  title: string;
  subtitle: string;
  lon: number;
  lat: number;
  /** "city", "street", "house"... */
  kind: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    type?: string;
  };
}

const SETTLEMENTS = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'locality',
  'county',
  'state',
  'country',
]);

export function parsePhoton(json: unknown): Place[] {
  const features = (json as { features?: PhotonFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    const name = p.name ?? (p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : '');
    if (!name) continue;
    const kind = p.type ?? 'place';
    const town = p.city ?? p.county ?? p.state;
    const around = [p.district !== name ? p.district : null, town !== name ? town : null].filter(
      (s): s is string => Boolean(s),
    );
    const context = [...around.slice(-1), p.country].filter(Boolean).join(', ');
    const key = `${name}|${context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      id: `${p.osm_type ?? '?'}${p.osm_id ?? key}`,
      name,
      context,
      title: name,
      subtitle: SETTLEMENTS.has(kind) ? (p.country ?? '') : context,
      lon,
      lat,
      kind,
    });
  }
  return places;
}

/* The public Photon server has names in English, German and French, besides each place's
   own. Asking in one of those gets "Cairo" rather than "القاهرة" for someone who reads
   English; the title stays editable for anyone who wants the local name. */
const LANGUAGES = ['en', 'de', 'fr'];

export function photonLanguage(preferred: readonly string[] = browserLanguages()): string {
  for (const tag of preferred) {
    const lang = tag.toLowerCase().split('-')[0] ?? '';
    if (LANGUAGES.includes(lang)) return lang;
  }
  return 'en';
}

const browserLanguages = () =>
  typeof navigator === 'undefined'
    ? []
    : navigator.languages.length
      ? navigator.languages
      : [navigator.language];

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  near?: { lon: number; lat: number },
): Promise<Place[]> {
  const q = new URLSearchParams({ q: query, limit: '7', lang: photonLanguage() });
  if (near) {
    q.set('lon', near.lon.toFixed(3));
    q.set('lat', near.lat.toFixed(3));
    q.set('location_bias_scale', '0.2');
  }
  return request(`${PHOTON_URL}/api/?${q.toString()}`, signal);
}

export async function placeAt(
  lon: number,
  lat: number,
  signal?: AbortSignal,
): Promise<Place | null> {
  const q = new URLSearchParams({
    lon: String(lon),
    lat: String(lat),
    limit: '1',
    lang: photonLanguage(),
  });
  const [place] = await request(`${PHOTON_URL}/reverse?${q.toString()}`, signal);
  return place ?? null;
}

async function request(url: string, signal?: AbortSignal): Promise<Place[]> {
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`Place search is unavailable right now (${res.status})`);
  return parsePhoton(await res.json());
}

/** A starting place from the time zone, so the first poster is somewhere near home. */
export function cityFromTimeZone(tz: string | undefined): string | null {
  if (!tz || !tz.includes('/') || tz.startsWith('Etc/')) return null;
  const city = tz.split('/').pop()!.replace(/_/g, ' ');
  return /^[A-Za-z .'-]+$/.test(city) ? city : null;
}

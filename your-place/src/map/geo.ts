/* Web Mercator maths: where a place lands on the poster, and which map tiles cover it.

   A view's zoom is defined for a map 1000 px wide. The same view drawn 300 px wide for a
   thumbnail or 7000 px wide for print shows exactly the same streets; only the pixel
   density changes. */

export const TILE_SIZE = 256;
export const REF_WIDTH = 1000;
export const MAX_TILE_ZOOM = 14; // OpenMapTiles carries full detail at z14
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 17;
const MAX_LAT = 85.0511287798;
const EARTH_CIRCUMFERENCE = 40075016.686; // metres at the equator

export interface View {
  lon: number;
  lat: number;
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A view placed on a rectangle of output pixels. */
export interface Frame {
  /** Mercator zoom at which one world pixel is one output pixel */
  zoom: number;
  /** world pixel, at `zoom`, of the map rectangle's top-left corner */
  left: number;
  top: number;
  rect: Rect;
}

export interface TileId {
  z: number;
  /** column as positioned on the poster; may fall outside 0..2^z-1 near the antimeridian */
  x: number;
  y: number;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function lonToX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

export function latToY(lat: number, zoom: number): number {
  const phi = (clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * TILE_SIZE * 2 ** zoom;
}

export function xToLon(x: number, zoom: number): number {
  return (x / (TILE_SIZE * 2 ** zoom)) * 360 - 180;
}

export function yToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (TILE_SIZE * 2 ** zoom);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** Longitude folded back into -180..180 after panning across the antimeridian. */
export function wrapLon(lon: number): number {
  if (lon >= -180 && lon <= 180) return lon; // spare the usual case the floating-point round trip
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function frameFor(view: View, rect: Rect): Frame {
  const zoom = view.zoom + Math.log2(rect.w / REF_WIDTH);
  return {
    zoom,
    left: lonToX(view.lon, zoom) - rect.w / 2,
    top: latToY(view.lat, zoom) - rect.h / 2,
    rect,
  };
}

/* At most five tiles across the map (so at most about 50 for a tall poster). Fewer and a
   city poster loses its side streets; more and a whole region turns into a grey blur of
   lanes, and takes ages to load. OpenMapTiles thins out minor roads at lower zooms, so wide
   views stay legible on their own. The choice depends only on the view, never on the
   output size, so the preview and the print show exactly the same streets. */
const TILES_ACROSS = 5;

export function tileZoomFor(frame: Frame): number {
  const z = Math.floor(frame.zoom + Math.log2((TILES_ACROSS * TILE_SIZE) / frame.rect.w));
  return clamp(z, 0, MAX_TILE_ZOOM);
}

/** Tiles covering the frame, nearest the middle first so the centre of the poster loads first. */
export function tilesFor(frame: Frame, z: number): TileId[] {
  const s = 2 ** (z - frame.zoom);
  const n = 2 ** z;
  const x0 = Math.floor((frame.left * s) / TILE_SIZE);
  const x1 = Math.floor(((frame.left + frame.rect.w) * s) / TILE_SIZE);
  const y0 = clamp(Math.floor((frame.top * s) / TILE_SIZE), 0, n - 1);
  const y1 = clamp(Math.floor(((frame.top + frame.rect.h) * s) / TILE_SIZE), 0, n - 1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const tiles: TileId[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ z, x, y });
  return tiles.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}

/** The tile to fetch for a positioned tile: columns wrap around the world. */
export function wrapTile({ z, x, y }: TileId): TileId {
  const n = 2 ** z;
  return { z, x: ((x % n) + n) % n, y };
}

export function metresPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** zoom);
}

/** Width of the map, in metres, for a view. */
export function spanMetres(view: View): number {
  return metresPerPixel(view.lat, view.zoom) * REF_WIDTH;
}

/** The zoom that fits a bounding box [west, south, east, north] into a map of the given aspect
    (width / height), leaving `padding` of the tighter side spare. */
export function fitZoom(
  [west, south, east, north]: [number, number, number, number],
  aspect: number,
  padding = 0.08,
): number {
  const dx = Math.max(1e-9, lonToX(east, 0) - lonToX(west, 0));
  const dy = Math.max(1e-9, latToY(south, 0) - latToY(north, 0));
  const room = REF_WIDTH * (1 - padding);
  return Math.min(Math.log2(room / dx), Math.log2(room / aspect / dy));
}

/** Move a view by a distance in output pixels of a frame of the given width. */
export function panView(view: View, dx: number, dy: number, width: number): View {
  const zoom = view.zoom + Math.log2(width / REF_WIDTH);
  const x = lonToX(view.lon, zoom) - dx;
  const y = latToY(view.lat, zoom) - dy;
  return { zoom: view.zoom, lon: wrapLon(xToLon(x, zoom)), lat: clamp(yToLat(y, zoom), -80, 84) };
}

/** Zoom a view by `delta` levels while keeping the point under (px, py) in place. */
export function zoomViewAt(view: View, delta: number, px: number, py: number, rect: Rect): View {
  const next = clamp(view.zoom + delta, MIN_ZOOM, MAX_ZOOM);
  const before = frameFor(view, rect);
  const wx = before.left + px;
  const wy = before.top + py;
  const lon = xToLon(wx, before.zoom);
  const lat = yToLat(wy, before.zoom);
  const after = frameFor({ ...view, zoom: next }, rect);
  const ax = lonToX(lon, after.zoom) - px + rect.w / 2;
  const ay = latToY(lat, after.zoom) - py + rect.h / 2;
  return {
    zoom: next,
    lon: wrapLon(xToLon(ax, after.zoom)),
    lat: clamp(yToLat(ay, after.zoom), -80, 84),
  };
}

export function formatCoords(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}  ·  ${Math.abs(wrapLon(lon)).toFixed(4)}° ${ew}`;
}

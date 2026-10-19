import { describe, expect, it } from 'vitest';
import {
  REF_WIDTH,
  fitZoom,
  formatCoords,
  frameFor,
  latToY,
  lonToX,
  panView,
  spanMetres,
  tileZoomFor,
  tilesFor,
  wrapLon,
  wrapTile,
  xToLon,
  yToLat,
  zoomViewAt,
} from '../../src/map/geo';

const zurich = { lon: 8.5417, lat: 47.3769, zoom: 13.2 };
const rect = { x: 0, y: 0, w: 1140, h: 1612 };

describe('Web Mercator', () => {
  it('goes there and back', () => {
    for (const [lon, lat] of [
      [8.5417, 47.3769],
      [-122.4194, 37.7749],
      [151.2093, -33.8688],
      [0, 0],
    ] as const) {
      expect(xToLon(lonToX(lon, 12.3), 12.3)).toBeCloseTo(lon, 9);
      expect(yToLat(latToY(lat, 12.3), 12.3)).toBeCloseTo(lat, 9);
    }
  });

  it('puts the view centre in the middle of the map', () => {
    const f = frameFor(zurich, rect);
    expect(lonToX(zurich.lon, f.zoom) - f.left).toBeCloseTo(rect.w / 2, 6);
    expect(latToY(zurich.lat, f.zoom) - f.top).toBeCloseTo(rect.h / 2, 6);
  });

  it('shows the same area at any output size', () => {
    // 40,075 km × cos 47.38° / 2^13.2 tiles of 256 px, times 1000 px: about 11.3 km
    expect(spanMetres(zurich)).toBeCloseTo(11_266, -1);
    const small = frameFor(zurich, { x: 0, y: 0, w: 300, h: 424 });
    const big = frameFor(zurich, { x: 0, y: 0, w: 6000, h: 8485 });
    const lonSpan = (f: typeof small) => xToLon(f.left + f.rect.w, f.zoom) - xToLon(f.left, f.zoom);
    expect(lonSpan(small)).toBeCloseTo(lonSpan(big), 9);
  });

  it('folds longitudes back into range', () => {
    expect(wrapLon(190)).toBeCloseTo(-170);
    expect(wrapLon(-540)).toBeCloseTo(180 - 360);
    expect(wrapTile({ z: 2, x: -1, y: 1 })).toEqual({ z: 2, x: 3, y: 1 });
    expect(wrapTile({ z: 2, x: 5, y: 1 })).toEqual({ z: 2, x: 1, y: 1 });
  });
});

describe('choosing tiles', () => {
  it('uses the same tile zoom for preview and print', () => {
    const preview = frameFor(zurich, rect);
    const print = frameFor(zurich, { x: 0, y: 0, w: 3356, h: 4746 });
    expect(tileZoomFor(preview)).toBe(tileZoomFor(print));
  });

  it('never needs more than five tiles across', () => {
    for (let zoom = 4; zoom <= 14; zoom += 0.25) {
      const f = frameFor({ ...zurich, zoom }, rect);
      const tiles = tilesFor(f, tileZoomFor(f));
      const columns = new Set(tiles.map((t) => t.x)).size;
      expect(columns).toBeLessThanOrEqual(6); // five, plus one for a map that straddles a tile edge
      expect(tiles.length).toBeLessThanOrEqual(60);
    }
  });

  it('caps detail at zoom 14 and overzooms beyond it', () => {
    const f = frameFor({ ...zurich, zoom: 16.5 }, rect);
    expect(tileZoomFor(f)).toBe(14);
    expect(tilesFor(f, 14).length).toBeGreaterThan(0);
  });

  it('starts with the tiles in the middle', () => {
    const f = frameFor(zurich, rect);
    const tiles = tilesFor(f, tileZoomFor(f));
    const centre = {
      x: lonToX(zurich.lon, tiles[0]!.z) / 256,
      y: latToY(zurich.lat, tiles[0]!.z) / 256,
    };
    const d = (t: { x: number; y: number }) =>
      Math.hypot(t.x + 0.5 - centre.x, t.y + 0.5 - centre.y);
    expect(d(tiles[0]!)).toBeLessThan(d(tiles.at(-1)!));
  });

  it('covers every pixel of the map', () => {
    const f = frameFor(zurich, rect);
    const z = tileZoomFor(f);
    const s = 2 ** (z - f.zoom);
    const have = new Set(tilesFor(f, z).map((t) => `${t.x}/${t.y}`));
    for (const [px, py] of [
      [0, 0],
      [rect.w - 1, 0],
      [0, rect.h - 1],
      [rect.w - 1, rect.h - 1],
    ] as const) {
      const tx = Math.floor(((f.left + px) * s) / 256);
      const ty = Math.floor(((f.top + py) * s) / 256);
      expect(have.has(`${tx}/${ty}`)).toBe(true);
    }
  });
});

describe('moving the view', () => {
  it('pans by exactly the dragged distance', () => {
    const moved = panView(zurich, 100, -50, rect.w);
    const before = frameFor(zurich, rect);
    const after = frameFor(moved, rect);
    expect(before.left - after.left).toBeCloseTo(100, 6);
    expect(before.top - after.top).toBeCloseTo(-50, 6);
  });

  it('zooms around the pointer, keeping the place under it still', () => {
    const at = { x: 200, y: 900 };
    const before = frameFor(zurich, rect);
    const lon = xToLon(before.left + at.x, before.zoom);
    const lat = yToLat(before.top + at.y, before.zoom);
    const after = frameFor(zoomViewAt(zurich, 1.3, at.x, at.y, rect), rect);
    expect(lonToX(lon, after.zoom) - after.left).toBeCloseTo(at.x, 4);
    expect(latToY(lat, after.zoom) - after.top).toBeCloseTo(at.y, 4);
  });

  it('stops zooming at the limits', () => {
    expect(zoomViewAt(zurich, 20, 0, 0, rect).zoom).toBe(17);
    expect(zoomViewAt(zurich, -20, 0, 0, rect).zoom).toBe(3);
  });
});

describe('framing and labels', () => {
  it('fits a bounding box inside the map, whichever side is tighter', () => {
    const bbox: [number, number, number, number] = [8.448, 47.32, 8.625, 47.435];
    const zoom = fitZoom(bbox, 297 / 420);
    const f = frameFor(
      { lon: 8.5365, lat: 47.3775, zoom },
      { x: 0, y: 0, w: REF_WIDTH, h: REF_WIDTH * (420 / 297) },
    );
    const w = lonToX(bbox[2], f.zoom) - lonToX(bbox[0], f.zoom);
    const h = latToY(bbox[1], f.zoom) - latToY(bbox[3], f.zoom);
    expect(w).toBeLessThanOrEqual(f.rect.w);
    expect(h).toBeLessThanOrEqual(f.rect.h);
    expect(Math.max(w / f.rect.w, h / f.rect.h)).toBeCloseTo(0.92, 2);
  });

  it('writes coordinates the way posters do', () => {
    expect(formatCoords(47.37691, 8.54169)).toBe('47.3769° N  ·  8.5417° E');
    expect(formatCoords(-33.8688, -70.6693)).toBe('33.8688° S  ·  70.6693° W');
  });
});

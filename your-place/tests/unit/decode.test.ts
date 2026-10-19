import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { classify, decodeTile } from '../../src/map/decode';

/* A real OpenMapTiles tile: central Zurich, where the lake meets the old town. */
const tile = decodeTile(
  gunzipSync(readFileSync(new URL('../fixtures/zurich-14-8581-5739.pbf.gz', import.meta.url))),
);
const count = (k: keyof typeof tile.shapes) => (tile.shapes[k]?.starts.length ?? 1) - 1;

describe('decoding a real tile', () => {
  it('keeps what a poster draws', () => {
    expect(tile.extent).toBe(4096);
    expect(count('water')).toBeGreaterThan(0);
    expect(count('building')).toBeGreaterThan(500);
    expect(count('primary')).toBeGreaterThan(0);
    expect(count('minor')).toBeGreaterThan(0);
    expect(count('rail')).toBeGreaterThan(0);
    expect(count('park')).toBeGreaterThan(0);
  });

  it('packs every run end to end', () => {
    for (const shapes of Object.values(tile.shapes)) {
      const { coords, starts } = shapes;
      expect(starts[0]).toBe(0);
      expect(starts.at(-1)).toBe(coords.length / 2);
      for (let i = 1; i < starts.length; i++)
        expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(2);
    }
  });

  it('stays inside the tile, give or take its buffer', () => {
    for (const { coords } of Object.values(tile.shapes)) {
      for (const v of coords) {
        expect(v).toBeGreaterThan(-600);
        expect(v).toBeLessThan(4096 + 600);
      }
    }
  });
});

describe('what gets drawn', () => {
  const POLY = 3;
  const LINE = 2;
  it('maps OpenMapTiles classes to poster layers', () => {
    expect(classify('water', POLY, { class: 'lake' })).toBe('water');
    expect(classify('water', POLY, { class: 'swimming_pool' })).toBeNull();
    expect(classify('landcover', POLY, { class: 'grass', subclass: 'park' })).toBe('park');
    expect(classify('landcover', POLY, { class: 'grass', subclass: 'meadow' })).toBe('grass');
    expect(classify('landcover', POLY, { class: 'wood', subclass: 'forest' })).toBe('wood');
    expect(classify('landcover', POLY, { class: 'farmland' })).toBeNull();
    expect(classify('transportation', LINE, { class: 'trunk' })).toBe('motorway');
    expect(classify('transportation', LINE, { class: 'path', subclass: 'footway' })).toBe('path');
    expect(classify('transportation', LINE, { class: 'transit', subclass: 'tram' })).toBe('rail');
    expect(classify('transportation', LINE, { class: 'ferry' })).toBeNull();
    expect(classify('transportation', POLY, { class: 'pier' })).toBe('pier');
    expect(classify('waterway', LINE, { class: 'river' })).toBe('river');
    expect(classify('waterway', LINE, { class: 'ditch' })).toBeNull();
  });

  it('leaves tunnels out', () => {
    expect(classify('transportation', LINE, { class: 'primary', brunnel: 'tunnel' })).toBeNull();
    expect(classify('transportation', LINE, { class: 'primary', brunnel: 'bridge' })).toBe(
      'primary',
    );
  });

  it('ignores layers and geometry it does not draw', () => {
    expect(classify('poi', 1, { class: 'shop' })).toBeNull();
    expect(classify('housenumber', 1, {})).toBeNull();
    expect(classify('water', LINE, { class: 'lake' })).toBeNull();
  });
});

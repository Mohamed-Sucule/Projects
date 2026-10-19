/* Turn one OpenMapTiles vector tile into the handful of things a poster draws.

   A tile carries dozens of layers (shops, bus stops, house numbers, place names). A poster
   only needs water, green space, buildings and the street network, so everything else is
   dropped here, once, and the rest is packed into flat typed arrays that are cheap to keep
   in memory and fast to walk when drawing. */

import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { Kind, LineKind } from './kinds';

export type { FillKind, Kind, LineKind } from './kinds';

/** Rings or lines of one kind: x,y pairs in tile units, and where each run starts. */
export interface Shapes {
  coords: Int16Array;
  /** start of each run, in points; the last entry is the total */
  starts: Uint32Array;
}

export interface DecodedTile {
  extent: number;
  shapes: Partial<Record<Kind, Shapes>>;
}

type Props = VectorTileFeature['properties'];
const POLYGON = 3;
const LINE = 2;

const GREEN_PARK = new Set(['park', 'garden', 'recreation_ground', 'village_green', 'playground']);
const LANDUSE_PARK = new Set(['pitch', 'playground', 'cemetery', 'stadium', 'zoo', 'garden']);
const PATHS = new Set([
  'footway',
  'path',
  'pedestrian',
  'cycleway',
  'steps',
  'bridleway',
  'corridor',
]);
const RAIL = new Set([
  'rail',
  'light_rail',
  'narrow_gauge',
  'subway',
  'tram',
  'monorail',
  'funicular',
]);

/** Which drawn kind a feature belongs to, or null to leave it out. */
export function classify(layer: string, type: number, p: Props): Kind | null {
  const cls = typeof p.class === 'string' ? p.class : '';
  const sub = typeof p.subclass === 'string' ? p.subclass : '';
  if (p.brunnel === 'tunnel') return null;

  if (type === POLYGON) {
    switch (layer) {
      case 'water':
        return cls === 'swimming_pool' ? null : 'water';
      case 'landcover':
        if (cls === 'wood') return 'wood';
        if (cls === 'sand') return 'sand';
        if (cls === 'grass' || cls === 'wetland') return GREEN_PARK.has(sub) ? 'park' : 'grass';
        return null;
      case 'landuse':
        if (LANDUSE_PARK.has(cls)) return 'park';
        return cls === 'grass' ? 'grass' : null;
      case 'building':
        return 'building';
      case 'transportation':
        // piers and bridge decks are land standing over water
        return cls === 'pier' || cls === 'bridge' ? 'pier' : null;
      default:
        return null;
    }
  }

  if (type === LINE) {
    switch (layer) {
      case 'waterway':
        if (cls === 'river' || cls === 'canal') return 'river';
        return cls === 'stream' ? 'stream' : null;
      case 'aeroway':
        return cls === 'runway' ? 'runway' : cls === 'taxiway' ? 'service' : null;
      case 'transportation':
        return roadKind(cls, sub);
      default:
        return null;
    }
  }
  return null;
}

function roadKind(cls: string, sub: string): LineKind | null {
  switch (cls) {
    case 'motorway':
    case 'trunk':
      return 'motorway';
    case 'primary':
    case 'secondary':
    case 'tertiary':
    case 'minor':
    case 'service':
      return cls;
    case 'busway':
    case 'raceway':
      return 'minor';
    case 'track':
      return 'service';
    case 'path':
      return PATHS.has(sub) || sub === '' ? 'path' : null;
    case 'rail':
    case 'transit':
      return RAIL.has(sub) || sub === '' ? 'rail' : null;
    default:
      return null; // ferries, piers drawn as lines, roads under construction
  }
}

const LAYERS = [
  'water',
  'waterway',
  'landcover',
  'landuse',
  'building',
  'transportation',
  'aeroway',
];

export function decodeTile(data: ArrayBuffer | Uint8Array): DecodedTile {
  const tile = new VectorTile(new PbfReader(data));
  const runs = new Map<Kind, { coords: number[]; starts: number[] }>();
  let extent = 4096;

  for (const name of LAYERS) {
    const layer = tile.layers[name];
    if (!layer) continue;
    extent = layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const kind = classify(name, feature.type, feature.properties);
      if (!kind) continue;
      let run = runs.get(kind);
      if (!run) runs.set(kind, (run = { coords: [], starts: [] }));
      for (const ring of feature.loadGeometry()) {
        if (ring.length < 2) continue;
        run.starts.push(run.coords.length / 2);
        for (const pt of ring) run.coords.push(pt.x, pt.y);
      }
    }
  }

  const shapes: DecodedTile['shapes'] = {};
  for (const [kind, run] of runs) {
    if (run.starts.length === 0) continue;
    run.starts.push(run.coords.length / 2);
    shapes[kind] = { coords: Int16Array.from(run.coords), starts: Uint32Array.from(run.starts) };
  }
  return { extent, shapes };
}

/** Rough memory a decoded tile holds on to, for the tile cache's budget. */
export function tileBytes(tile: DecodedTile): number {
  let bytes = 64;
  for (const s of Object.values(tile.shapes)) bytes += s.coords.byteLength + s.starts.byteLength;
  return bytes;
}

/* The fixed sky, read once into the shapes the drawing code wants: every star as a unit
   vector in J2000 equatorial axes, with its brightness and colour, and every constellation
   figure as lines between stars. Made from d3-celestial's data by scripts/data.mjs. */

import constellationsJson from './data/constellations.json';
import linesJson from './data/lines.json';
import starnamesJson from './data/starnames.json';
import starsJson from './data/stars.json';
import { fromRaDec, type Vec3 } from './astro';

export interface Stars {
  count: number;
  /** x, y, z per star */
  dir: Float32Array;
  /** apparent magnitude: smaller is brighter */
  mag: Float32Array;
  /** B−V colour index: below 0 blue-white, above 1 orange */
  bv: Float32Array;
}

export interface Constellation {
  id: string;
  name: string;
  /** where its name is set */
  label: Vec3;
  /** 1 for the famous ones, 3 for the faint ones */
  rank: number;
}

export interface Figure {
  id: string;
  /** each line, as the stars it joins in order */
  lines: Vec3[][];
}

export interface NamedStar {
  name: string;
  dir: Vec3;
  mag: number;
}

function readStars(flat: number[]): Stars {
  const count = flat.length / 4;
  const dir = new Float32Array(count * 3);
  const mag = new Float32Array(count);
  const bv = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = fromRaDec(flat[i * 4]!, flat[i * 4 + 1]!);
    dir[i * 3] = x;
    dir[i * 3 + 1] = y;
    dir[i * 3 + 2] = z;
    mag[i] = flat[i * 4 + 2]!;
    bv[i] = flat[i * 4 + 3]!;
  }
  return { count, dir, mag, bv };
}

let cache: {
  stars: Stars;
  figures: Figure[];
  constellations: Constellation[];
  named: NamedStar[];
} | null = null;

export function catalogue() {
  cache ??= {
    stars: readStars(starsJson),
    figures: (linesJson as [string, [number, number][][]][]).map(([id, lines]) => ({
      id,
      lines: lines.map((line) => line.map(([ra, dec]) => fromRaDec(ra, dec))),
    })),
    constellations: (constellationsJson as [string, string, number, number, number][]).map(
      ([id, name, ra, dec, rank]) => ({ id, name, label: fromRaDec(ra, dec), rank }),
    ),
    named: (starnamesJson as [string, number, number, number][]).map(([name, ra, dec, mag]) => ({
      name,
      dir: fromRaDec(ra, dec),
      mag,
    })),
  };
  return cache;
}

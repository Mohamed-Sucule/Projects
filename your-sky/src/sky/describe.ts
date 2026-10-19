/* The chart in words: what is up, and where. It is the chart's text alternative for screen
   readers, and the short list of sights under the poster. */

import {
  PLANET_NAME,
  altitude,
  azimuth,
  compassPoint,
  phaseName,
  rotate,
  type Sky,
  type Vec3,
} from './astro';
import { catalogue } from './catalogue';

/** "low in the west", "high in the south", "almost overhead". */
export function whereIs(h: Vec3): string {
  const alt = altitude(h);
  if (alt > 80) return 'almost overhead';
  const side = compassPoint(azimuth(h));
  if (alt < 20) return `low in the ${side}`;
  if (alt > 60) return `high in the ${side}`;
  return `in the ${side}`;
}

export interface Sight {
  /** "The Moon", "Jupiter" */
  name: string;
  /** "waxing gibbous, 84% lit, in the south-east" */
  detail: string;
}

export interface Description {
  /** the sights, brightest first */
  sights: Sight[];
  /** a note about daylight or twilight, if it matters */
  light: string | null;
  /** everything, as sentences */
  text: string;
}

export function describeSky(sky: Sky): Description {
  const sights: Sight[] = [];
  const moon = sky.moon;
  const lit = `${Math.round(moon.lit * 100)}% lit`;
  if (moon.dir[2] > 0) {
    sights.push({
      name: 'The Moon',
      detail: `${phaseName(moon.age)}, ${lit}, ${whereIs(moon.dir)}`,
    });
  }
  for (const p of [...sky.planets].sort((a, b) => a.mag - b.mag)) {
    if (p.dir[2] > 0) sights.push({ name: PLANET_NAME[p.id], detail: whereIs(p.dir) });
  }
  // the best-known constellations standing highest
  const high = catalogue()
    .constellations.filter((c) => c.rank === 1)
    .map((c) => ({ c, h: rotate(sky.rotation, c.label) }))
    .filter(({ h }) => altitude(h) > 40)
    .sort((a, b) => b.h[2] - a.h[2])
    .slice(0, 3)
    .map(({ c }) => c.name);

  const sun = altitude(sky.sun);
  const light =
    sun > 0
      ? 'The Sun is up at this time. The stars are all there, just hidden by daylight.'
      : sun > -12
        ? 'Twilight: the sky is still bright, and only the brightest stars show.'
        : null;

  const parts: string[] = [];
  if (sights.length) {
    parts.push(sights.map((s) => `${s.name}: ${s.detail}.`).join(' '));
  }
  if (moon.dir[2] <= 0) parts.push(`The Moon is below the horizon (${phaseName(moon.age)}).`);
  if (high.length) parts.push(`High up: ${list(high)}.`);
  if (light) parts.push(light);
  return { sights, light, text: parts.join(' ') };
}

/** "Orion", "Orion and Taurus", "Orion, Taurus and Gemini". */
export function list(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

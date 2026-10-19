import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePhoton } from 'poster-kit/photon';
import { hereOnTheMap, viewForPlace } from '../../src/places/view';

/* Reading Photon's results is tested in packages/poster-kit; what is left here is how a map
   poster frames the place it is given. */
const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/photon.json', import.meta.url), 'utf8'),
) as unknown;

describe('framing a place', () => {
  const [city, station] = parsePhoton(fixture);

  it('frames a city at about eleven kilometres, however big its boundary', () => {
    const v = viewForPlace(city!, 297 / 420);
    expect(v.zoom).toBeCloseTo(13.2, 5);
    expect(v.lon).toBe(city!.lon);
  });

  it('frames a single address with its neighbourhood', () => {
    expect(viewForPlace(station!, 297 / 420).zoom).toBeCloseTo(15.2, 5);
  });

  it('puts "where I am" on the street, not in the middle of the town', () => {
    const here = hereOnTheMap(city!, { lon: 8.55, lat: 47.37 });
    expect(here).toMatchObject({ name: 'Zürich', lon: 8.55, lat: 47.37, bbox: null });
    expect(viewForPlace(here, 297 / 420).zoom).toBeCloseTo(15.2, 5);
  });
});

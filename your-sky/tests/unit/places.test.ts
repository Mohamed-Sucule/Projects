import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cityFromTimeZone, parsePhoton, photonLanguage } from '../../src/places/photon';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/photon.json', import.meta.url), 'utf8'),
) as unknown;

describe('reading Photon results', () => {
  const places = parsePhoton(fixture);

  it('reads names, context and coordinates', () => {
    expect(places.map((p) => p.name)).toEqual([
      'Zürich',
      'Zürich Hauptbahnhof',
      'Zürichberg',
      'Bellevueplatz',
    ]);
    const [city, station] = places;
    expect(city).toMatchObject({
      title: 'Zürich',
      subtitle: 'Switzerland',
      kind: 'city',
      lon: 8.5410422,
    });
    expect(station).toMatchObject({
      context: 'Zürich, Switzerland',
      subtitle: 'Zürich, Switzerland',
    });
  });

  it('drops duplicates and features it cannot use', () => {
    const doubled = {
      features: [
        ...(fixture as { features: unknown[] }).features,
        (fixture as { features: unknown[] }).features[0],
        { properties: { name: 'Nowhere' } },
        { geometry: { coordinates: [1, 2] }, properties: {} },
      ],
    };
    expect(parsePhoton(doubled)).toHaveLength(4);
    expect(parsePhoton(null)).toEqual([]);
    expect(parsePhoton({ features: 'nope' })).toEqual([]);
  });

  it('names a street address by its street and number', () => {
    const [p] = parsePhoton({
      features: [
        {
          geometry: { coordinates: [8.5, 47.3] },
          properties: {
            street: 'Rämistrasse',
            housenumber: '71',
            city: 'Zürich',
            country: 'Switzerland',
            type: 'house',
          },
        },
      ],
    });
    expect(p?.title).toBe('Rämistrasse 71');
  });
});

describe('a starting place from the time zone', () => {
  it('uses the city in the zone name', () => {
    expect(cityFromTimeZone('Europe/Zurich')).toBe('Zurich');
    expect(cityFromTimeZone('America/New_York')).toBe('New York');
    expect(cityFromTimeZone('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
  });

  it('gives up on zones that are not places', () => {
    expect(cityFromTimeZone('UTC')).toBeNull();
    expect(cityFromTimeZone('Etc/GMT+3')).toBeNull();
    expect(cityFromTimeZone(undefined)).toBeNull();
  });
});

describe('the language of place names', () => {
  it('asks in the first language Photon has', () => {
    expect(photonLanguage(['fr-CA', 'en'])).toBe('fr');
    expect(photonLanguage(['so', 'de-CH'])).toBe('de');
  });

  it('falls back to English', () => {
    expect(photonLanguage(['so', 'ar'])).toBe('en');
    expect(photonLanguage([])).toBe('en');
  });
});

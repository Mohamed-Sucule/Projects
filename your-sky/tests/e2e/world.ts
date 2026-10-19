/* The outside world, for tests: Photon's place search answered locally from photon.json,
   which is shaped like Photon's responses. Nothing else leaves the browser. */

import { expect, test as base, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PHOTON = JSON.parse(
  readFileSync(new URL('../fixtures/photon.json', import.meta.url), 'utf8'),
) as { features: { properties: { name: string } }[] };

/* a few places far from Zurich, in Photon's shape */
const feature = (name: string, country: string, lon: number, lat: number, type = 'city') => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { osm_type: 'R', osm_id: Math.round(lon * 1000 + lat), name, country, type },
});
const ELSEWHERE = [
  feature('Sydney', 'Australia', 151.2093, -33.8688),
  feature('Gaza', 'Palestine', 34.4668, 31.5017),
  feature('Reykjavík', 'Iceland', -21.8174, 64.1265),
];

export interface World {
  searches: string[];
  /** make place search fail, to see how the app copes */
  failSearch(on: boolean): void;
}

export async function connect(page: Page): Promise<World> {
  let failing = false;
  const world: World = {
    searches: [],
    failSearch: (on) => {
      failing = on;
    },
  };
  await page.context().route('https://photon.komoot.io/**', async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    world.searches.push(q);
    if (failing)
      return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' } });
    const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const all = [...PHOTON.features, ...ELSEWHERE];
    const features = url.pathname.startsWith('/reverse')
      ? all.slice(0, 1)
      : all.filter((f) => fold(f.properties.name).startsWith(fold(q).slice(0, 3)));
    await route.fulfill({
      json: { type: 'FeatureCollection', features },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  return world;
}

/** Every test runs against the local world, whether or not it looks at it. */
export const test = base.extend<{ world: World }>({
  world: [
    async ({ page }, use) => {
      await use(await connect(page));
    },
    { auto: true },
  ],
});

export { expect };

/** Wait until the poster has been drawn, Milky Way and all. */
export async function skyReady(page: Page) {
  await page.locator('[data-testid="poster"][data-milky-way="true"]').waitFor({ timeout: 30_000 });
  await expect.poll(() => page.locator('.poster-veil').count()).toBe(0);
}

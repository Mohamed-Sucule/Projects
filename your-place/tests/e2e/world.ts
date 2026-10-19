/* The outside world, for tests: OpenFreeMap and Photon answered locally.

   Map tiles are real: OpenStreetMap data of Zurich in the OpenMapTiles schema, read straight
   from the .mbtiles file `npm run fixtures` downloads. Place search answers come from
   photon.json, which is shaped like Photon's responses. */

import { test as base, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const MBTILES = new URL('../../.cache/zurich.mbtiles', import.meta.url).pathname;
const PHOTON = JSON.parse(
  readFileSync(new URL('../fixtures/photon.json', import.meta.url), 'utf8'),
) as {
  features: { properties: { name: string } }[];
};

let db: DatabaseSync | null = null;
function tile(z: number, x: number, y: number): Buffer | null {
  db ??= new DatabaseSync(MBTILES, { readOnly: true });
  const row = db
    .prepare(
      'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
    )
    .get(z, x, 2 ** z - 1 - y) as { tile_data: Uint8Array } | undefined;
  return row ? gunzipSync(row.tile_data) : null;
}

export interface World {
  /** tile requests seen, as "z/x/y" */
  tiles: string[];
  /** make the next tile requests fail, to see how the app copes */
  failTiles(on: boolean): void;
  searches: string[];
}

export async function connect(page: Page): Promise<World> {
  const world: World = { tiles: [], searches: [], failTiles: () => undefined };
  let failing = false;
  world.failTiles = (on) => {
    failing = on;
  };

  await page.context().route('https://tiles.openfreemap.org/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/planet') {
      await route.fulfill({
        json: {
          tilejson: '3.0.0',
          tiles: ['https://tiles.openfreemap.org/fixture/{z}/{x}/{y}.pbf'],
          maxzoom: 14,
        },
        headers: { 'access-control-allow-origin': '*' },
      });
      return;
    }
    const m = /\/fixture\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(url.pathname);
    if (!m) return route.fulfill({ status: 404 });
    const [z, x, y] = m.slice(1).map(Number) as [number, number, number];
    world.tiles.push(`${z}/${x}/${y}`);
    if (failing)
      return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' } });
    const body = tile(z, x, y);
    await route.fulfill(
      body
        ? {
            body,
            contentType: 'application/x-protobuf',
            headers: { 'access-control-allow-origin': '*' },
          }
        : { status: 204, headers: { 'access-control-allow-origin': '*' } },
    );
  });

  await page.context().route('https://photon.komoot.io/**', async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    world.searches.push(q);
    const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const features = url.pathname.startsWith('/reverse')
      ? PHOTON.features.slice(0, 1)
      : PHOTON.features.filter((f) => fold(f.properties.name).startsWith(fold(q).slice(0, 3)));
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

export { expect } from '@playwright/test';

/** Wait until the poster has been drawn from map data. */
export async function posterReady(page: Page) {
  await page.locator('[data-testid="poster"][data-ready="true"]').waitFor({ timeout: 30_000 });
}

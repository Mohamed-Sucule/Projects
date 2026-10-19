/* Where the map data comes from, and a small cache in front of it.

   Tiles come from OpenFreeMap: free OpenStreetMap vector tiles in the OpenMapTiles schema,
   with no key and no sign-up. Its TileJSON names the current build of the planet, so it is
   read once and every tile URL comes from it. */

import { decodeTile, tileBytes, type DecodedTile } from './decode';
import { wrapTile, type TileId } from './geo';

export const TILEJSON_URL: string =
  (import.meta.env?.VITE_TILEJSON as string | undefined) ?? 'https://tiles.openfreemap.org/planet';

interface TileJson {
  tiles: string[];
  maxzoom?: number;
}

export class TileSource {
  #template: Promise<string> | null = null;
  #cache = new Map<string, Promise<DecodedTile | null>>();
  #sizes = new Map<string, number>();
  #bytes = 0;
  #inFlight = 0;
  #queue: (() => void)[] = [];

  constructor(
    private readonly tilejson = TILEJSON_URL,
    private readonly maxBytes = 160 * 1024 * 1024,
    private readonly maxConcurrent = 8,
  ) {}

  /** A tile, decoded; null when the tile is empty. A tile that fails is fetched again next time. */
  get(id: TileId): Promise<DecodedTile | null> {
    const t = wrapTile(id);
    const key = `${t.z}/${t.x}/${t.y}`;
    const hit = this.#cache.get(key);
    if (hit) {
      // refresh its place in the eviction order
      this.#cache.delete(key);
      this.#cache.set(key, hit);
      return hit;
    }
    const promise = this.#load(t).then(
      (tile) => {
        const size = tile ? tileBytes(tile) : 64;
        this.#sizes.set(key, size);
        this.#bytes += size;
        this.#evict();
        return tile;
      },
      (err: unknown) => {
        this.#cache.delete(key); // let the next render try again
        throw err;
      },
    );
    this.#cache.set(key, promise);
    return promise;
  }

  async #load({ z, x, y }: TileId): Promise<DecodedTile | null> {
    const template = await this.#getTemplate();
    const url = template
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    const res = await this.#throttled(() => fetchWithRetry(url));
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) throw new Error(`Map tile ${z}/${x}/${y} failed (${res.status})`);
    const buf = await res.arrayBuffer();
    return buf.byteLength === 0 ? null : decodeTile(buf);
  }

  #getTemplate(): Promise<string> {
    this.#template ??= fetchWithRetry(this.tilejson)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Map service unavailable (${res.status})`);
        const json = (await res.json()) as TileJson;
        const template = json.tiles?.[0];
        if (!template) throw new Error('Map service sent no tile address');
        return new URL(template, this.tilejson).href.replace(/%7B/g, '{').replace(/%7D/g, '}');
      })
      .catch((err: unknown) => {
        this.#template = null;
        throw err;
      });
    return this.#template;
  }

  async #throttled<T>(task: () => Promise<T>): Promise<T> {
    if (this.#inFlight >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.#queue.push(resolve));
    }
    this.#inFlight++;
    try {
      return await task();
    } finally {
      this.#inFlight--;
      this.#queue.shift()?.();
    }
  }

  #evict() {
    for (const key of this.#cache.keys()) {
      if (this.#bytes <= this.maxBytes) break;
      if (!this.#sizes.has(key)) continue; // still loading
      this.#bytes -= this.#sizes.get(key) ?? 0;
      this.#sizes.delete(key);
      this.#cache.delete(key);
    }
  }
}

async function fetchWithRetry(url: string, tries = 2): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (res.status >= 500 && attempt < tries) throw new Error(String(res.status));
      return res;
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

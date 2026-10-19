/* The page's handle on the map engine. Painting happens in a worker so dragging the map
   and typing stay smooth; browsers that cannot draw in a worker get the same engine on
   the main thread, behind the same promise-based interface. */

import type { MapEngine, MapJob, Painted } from './engine';
import type { Priority, WorkerRequest, WorkerResponse } from './protocol';

export interface MapClient {
  /** Resolves to null when a newer paint on the same channel replaced this one. */
  paint(channel: string, job: MapJob, priority: Priority): Promise<Painted | null>;
  svg(job: MapJob): Promise<{ defs: string; body: string }>;
  readonly mode: 'worker' | 'main-thread';
}

type Pending = { resolve: (v: never) => void; reject: (e: Error) => void };

function canPaintInWorker(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'
  );
}

let shared: MapClient | null = null;

/** The page's one map client (React's development mode mounts components twice). */
export function mapClient(): MapClient {
  return (shared ??= canPaintInWorker() ? workerClient() : mainThreadClient());
}

function workerClient(): MapClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let fallback: MapClient | null = null;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    const resolve = p.resolve as (v: unknown) => void;
    switch (msg.type) {
      case 'painted':
        resolve({ picture: msg.picture, missing: msg.missing, ms: msg.ms } satisfies Painted);
        break;
      case 'svg':
        resolve({ defs: msg.defs, body: msg.body });
        break;
      case 'skipped':
        resolve(null);
        break;
      case 'error':
        p.reject(new Error(msg.message));
    }
  };
  // a worker that cannot start (old browser, blocked module workers) hands over to the main thread
  worker.onerror = (event) => {
    event.preventDefault();
    fallback ??= mainThreadClient();
    for (const p of pending.values()) p.reject(new Error('retry'));
    pending.clear();
  };

  function send<T>(msg: WorkerRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      pending.set(msg.id, { resolve, reject });
      worker.postMessage(msg);
    });
  }

  const retrying = <T>(run: () => Promise<T>, again: () => Promise<T>) =>
    run().catch((err: Error) =>
      err.message === 'retry' && fallback ? again() : Promise.reject(err),
    );

  return {
    get mode() {
      return fallback ? 'main-thread' : 'worker';
    },
    paint(channel, job, priority) {
      if (fallback) return fallback.paint(channel, job, priority);
      return retrying(
        () => send<Painted | null>({ type: 'paint', id: nextId++, channel, priority, job }),
        () => fallback!.paint(channel, job, priority),
      );
    },
    svg(job) {
      if (fallback) return fallback.svg(job);
      return retrying(
        () => send<{ defs: string; body: string }>({ type: 'svg', id: nextId++, job }),
        () => fallback!.svg(job),
      );
    },
  };
}

/* Only browsers without OffscreenCanvas in workers end up here, so the engine (and its tile
   parser) is only downloaded for them. */
function mainThreadClient(): MapClient {
  let engine: Promise<MapEngine> | null = null;
  const load = () => (engine ??= import('./engine').then((m) => new m.MapEngine()));
  const latest = new Map<string, number>();
  let nextId = 1;
  return {
    mode: 'main-thread',
    async paint(channel, job, priority) {
      const id = nextId++;
      latest.set(channel, id);
      return (await load()).paint(job, priority, () => latest.get(channel) === id);
    },
    svg: async (job) => (await load()).svg(job),
  };
}

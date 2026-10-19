/* The map engine behind a message port. Each request names a channel; a newer request on
   the same channel makes older ones pointless, so they are dropped as soon as noticed. */

import { MapEngine, toError } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

/* the DOM typings describe the page, not a worker; this is the part of a worker's scope used here */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer: Transferable[]): void;
};

const engine = new MapEngine();
const latest = new Map<string, number>();

const reply = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  scope.postMessage(msg, transfer);

scope.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'paint') {
    latest.set(msg.channel, msg.id);
    const stillWanted = () => latest.get(msg.channel) === msg.id;
    engine.paint(msg.job, msg.priority, stillWanted).then(
      (painted) => {
        if (!painted || !(painted.picture instanceof ImageBitmap)) {
          reply({ type: 'skipped', id: msg.id });
          return;
        }
        const { picture, missing, ms } = painted;
        reply({ type: 'painted', id: msg.id, picture, missing, ms }, [picture]);
      },
      (err: unknown) => reply({ type: 'error', id: msg.id, message: toError(err).message }),
    );
  } else if (msg.type === 'svg') {
    engine.svg(msg.job).then(
      ({ defs, body }) => reply({ type: 'svg', id: msg.id, defs, body }),
      (err: unknown) => reply({ type: 'error', id: msg.id, message: toError(err).message }),
    );
  }
};

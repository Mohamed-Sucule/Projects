/* Undo and redo around any reducer.

   Two details make it feel right: a drag only becomes a step once it settles (otherwise one
   pan would take a hundred undos), and consecutive edits to the same field merge into one. */

export interface History<S> {
  past: S[];
  present: S;
  future: S[];
  /** the state before the change still in progress (a drag, or typing in one field) */
  pending: { key: string; from: S } | null;
}

export type HistoryAction<A, S = never> =
  | { type: 'do'; action: A; settled?: boolean; group?: string | null }
  | { type: 'undo' }
  | { type: 'redo' }
  /** replace the state with nothing to undo, as when the app first finds where to start */
  | { type: 'reset'; present: S };

const LIMIT = 100;

export function initHistory<S>(present: S): History<S> {
  return { past: [], present, future: [], pending: null };
}

export function withHistory<S, A>(reduce: (s: S, a: A) => S) {
  return (h: History<S>, msg: HistoryAction<A, S>): History<S> => {
    switch (msg.type) {
      case 'reset':
        return initHistory(msg.present);
      case 'undo': {
        const base = h.pending ? h.pending.from : h.past.at(-1);
        if (base === undefined) return h;
        const past = h.pending ? h.past : h.past.slice(0, -1);
        return { past, present: base, future: [h.present, ...h.future], pending: null };
      }
      case 'redo': {
        const [next, ...future] = h.future;
        if (next === undefined) return h;
        return {
          past: [...committed(h), h.present].slice(-LIMIT),
          present: next,
          future,
          pending: null,
        };
      }
      case 'do': {
        const present = reduce(h.present, msg.action);
        if (present === h.present) return h;
        const key = msg.settled === false ? 'gesture' : (msg.group ?? null);
        if (key) {
          // keep extending the change in progress, or close the last one and start another
          const pending = h.pending?.key === key ? h.pending : { key, from: h.present };
          const past = h.pending && h.pending.key !== key ? [...h.past, h.pending.from] : h.past;
          return { past: past.slice(-LIMIT), present, future: [], pending };
        }
        if (msg.settled === true && h.pending?.key === 'gesture') {
          // the drag has ended: the whole of it is one step
          return {
            past: [...h.past, h.pending.from].slice(-LIMIT),
            present,
            future: [],
            pending: null,
          };
        }
        return {
          past: [...committed(h), h.present].slice(-LIMIT),
          present,
          future: [],
          pending: null,
        };
      }
    }
  };
}

/** past, with any change in progress closed off as its own step */
function committed<S>(h: History<S>): S[] {
  return h.pending ? [...h.past, h.pending.from] : h.past;
}

export const canUndo = (h: History<unknown>) => h.past.length > 0 || h.pending !== null;
export const canRedo = (h: History<unknown>) => h.future.length > 0;

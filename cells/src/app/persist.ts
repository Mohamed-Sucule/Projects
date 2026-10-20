/* Saving the workbook in the browser, in IndexedDB (localStorage holds about 5 MB, which a
   sheet of 200,000 formulas would outgrow). Nothing leaves the device. Every failure is
   quiet: in a private window, or with storage turned off, the sheet still works and is
   simply not kept. */

import type { Format } from '../engine/sheet';

export interface Saved {
  v: 1;
  name: string;
  cells: [number, number, string | null, Format | null][];
  widths: [number, number][];
  at: number;
}

const DB = 'cells';
const STORE = 'workbooks';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB would not open'));
  });
}

export async function load(): Promise<Saved | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () =>
        resolve((req.result as Saved | undefined)?.v === 1 ? (req.result as Saved) : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function save(data: Saved): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

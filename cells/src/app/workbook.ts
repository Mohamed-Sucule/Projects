/* The sheet with an undo history, as a store React can subscribe to.

   Every edit goes through here as a list of cell changes, and the sheet hands back the list
   that undoes it, so undo and redo are the same operation pointed in opposite directions.
   Inserting and deleting rows is the one exception, because it moves every cell below: it is
   undone by the opposite operation, and then the cells it destroyed are put back. Each step
   remembers the selection on both sides of it, so undo also takes you back to where the
   change was made. */

import { inverseOf, Sheet, type Change, type Structure } from '../engine/sheet';
import type { Selection } from './selection';

type Step =
  | {
      kind: 'cells';
      label: string;
      undo: Change[];
      redo: Change[];
      before: Selection;
      after: Selection;
    }
  | {
      kind: 'structure';
      label: string;
      op: Structure;
      restore: Change[];
      before: Selection;
      after: Selection;
    };

const LIMIT = 200;

export class Workbook {
  readonly sheet = new Sheet();
  private past: Step[] = [];
  private future: Step[] = [];
  private readonly listeners = new Set<() => void>();
  name = 'Shop sales';
  /** called with every local change, for other tabs and for saving */
  onLocalChange: (changes: Change[] | null) => void = () => {};

  rename(name: string) {
    this.name = name;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.sheet.version;

  notify() {
    for (const fn of this.listeners) fn();
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get undoLabel() {
    return this.past.at(-1)?.label ?? null;
  }
  get redoLabel() {
    return this.future.at(-1)?.label ?? null;
  }

  change(label: string, changes: Change[], before: Selection, after: Selection) {
    if (!changes.length) return;
    const undo = this.sheet.apply(changes);
    this.record({ kind: 'cells', label, undo, redo: changes, before, after });
    this.onLocalChange(changes);
    this.notify();
  }

  /** A change the sheet made itself (a cut and paste), already applied, with its undo. */
  changed(label: string, undo: Change[], redo: Change[], before: Selection, after: Selection) {
    if (!undo.length) return;
    this.record({ kind: 'cells', label, undo, redo, before, after });
    this.onLocalChange(redo);
    this.notify();
  }

  restructure(label: string, op: Structure, before: Selection, after: Selection) {
    const restore = this.sheet.restructure(op);
    this.record({ kind: 'structure', label, op, restore, before, after });
    this.onLocalChange(null);
    this.notify();
  }

  private record(step: Step) {
    this.past.push(step);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }

  /** Undo the last step; returns the selection to go back to. */
  undo(): Selection | null {
    const step = this.past.pop();
    if (!step) return null;
    if (step.kind === 'cells') {
      this.sheet.apply(step.undo);
      this.onLocalChange(step.undo);
    } else {
      this.sheet.restructure(inverseOf(step.op));
      this.sheet.apply(step.restore);
      this.onLocalChange(null);
    }
    this.future.push(step);
    this.notify();
    return step.before;
  }

  redo(): Selection | null {
    const step = this.future.pop();
    if (!step) return null;
    if (step.kind === 'cells') {
      step.undo = this.sheet.apply(step.redo);
      this.onLocalChange(step.redo);
    } else {
      step.restore = this.sheet.restructure(step.op);
      this.onLocalChange(null);
    }
    this.past.push(step);
    this.notify();
    return step.after;
  }

  /** Start again with nothing to undo, as when a file is opened. */
  forget() {
    this.past = [];
    this.future = [];
    this.notify();
  }

  /** Changes from another tab: applied, but not something this tab can undo. */
  remote(changes: Change[]) {
    this.sheet.apply(changes);
    this.notify();
  }
}

import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, initHistory, withHistory, type History } from '../src/history';

/* The smallest reducer there is: a counter. The app-level tests check undo against real
   posters; these check the rules of the history itself. */
const step = withHistory((n: number, by: number) => n + by);
const run = (h: History<number>, ...msgs: Parameters<typeof step>[1][]) => msgs.reduce(step, h);

describe('undo and redo', () => {
  it('undoes and redoes single steps', () => {
    const h = run(initHistory(0), { type: 'do', action: 1 }, { type: 'do', action: 2 });
    expect(h.present).toBe(3);
    const back = run(h, { type: 'undo' });
    expect(back.present).toBe(1);
    expect(canRedo(back)).toBe(true);
    expect(run(back, { type: 'redo' }).present).toBe(3);
  });

  it('makes a whole gesture one step, once it settles', () => {
    const h = run(
      initHistory(0),
      { type: 'do', action: 1, settled: false },
      { type: 'do', action: 1, settled: false },
      { type: 'do', action: 1, settled: true },
    );
    expect(h.present).toBe(3);
    expect(run(h, { type: 'undo' }).present).toBe(0);
  });

  it('merges edits in one group, and not across groups', () => {
    const h = run(
      initHistory(0),
      { type: 'do', action: 1, group: 'title' },
      { type: 'do', action: 1, group: 'title' },
      { type: 'do', action: 10, group: 'subtitle' },
    );
    expect(h.present).toBe(12);
    const once = run(h, { type: 'undo' });
    expect(once.present).toBe(2);
    expect(run(once, { type: 'undo' }).present).toBe(0);
  });

  it('forgets the future after a new edit', () => {
    const h = run(
      initHistory(0),
      { type: 'do', action: 1 },
      { type: 'undo' },
      { type: 'do', action: 5 },
    );
    expect(h.present).toBe(5);
    expect(canRedo(h)).toBe(false);
  });

  it('ignores an edit that changes nothing, so it is not an undo step', () => {
    const h = run(initHistory(0), { type: 'do', action: 1 });
    expect(step(h, { type: 'do', action: 0 })).toBe(h);
  });

  it('starts over with nothing to undo on reset', () => {
    const h = run(initHistory(0), { type: 'do', action: 1 }, { type: 'reset', present: 7 });
    expect(h.present).toBe(7);
    expect(canUndo(h)).toBe(false);
  });
});

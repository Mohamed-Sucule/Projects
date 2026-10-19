import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, initHistory, withHistory } from '../../src/state/history';
import {
  DEFAULT_POSTER,
  groupKey,
  reducePoster,
  type Action,
  type Poster,
} from '../../src/state/poster';
import { fromSearch, toSearch } from '../../src/state/url';

const reduce = withHistory(reducePoster);
const run = (msgs: Parameters<typeof reduce>[1][], start = DEFAULT_POSTER) =>
  msgs.reduce(reduce, initHistory(start));
const act = (action: Action, settled?: boolean) => ({
  type: 'do' as const,
  action,
  group: groupKey(action),
  ...(settled === undefined ? {} : { settled }),
});
const view = (lon: number) => ({ lon, lat: 47, zoom: 13 });

describe('undo and redo', () => {
  it('undoes and redoes ordinary changes one at a time', () => {
    let h = run([act({ type: 'theme', value: 'ink' }), act({ type: 'size', value: 'a4' })]);
    expect(h.present.size).toBe('a4');
    h = reduce(h, { type: 'undo' });
    expect(h.present.size).toBe('a3');
    expect(h.present.theme).toBe('ink');
    h = reduce(h, { type: 'undo' });
    expect(h.present.theme).toBe('paper');
    expect(canUndo(h)).toBe(false);
    h = reduce(reduce(h, { type: 'redo' }), { type: 'redo' });
    expect(h.present.size).toBe('a4');
    expect(canRedo(h)).toBe(false);
  });

  it('makes a whole drag one step', () => {
    let h = run([
      act({ type: 'view', view: view(1), settled: false }, false),
      act({ type: 'view', view: view(2), settled: false }, false),
      act({ type: 'view', view: view(3), settled: false }, false),
      act({ type: 'view', view: view(3.5), settled: true }, true),
    ]);
    expect(h.past).toHaveLength(1);
    h = reduce(h, { type: 'undo' });
    expect(h.present.view).toEqual(DEFAULT_POSTER.view);
  });

  it('merges typing in one field, but not across fields', () => {
    let h = run([
      act({ type: 'title', value: 'Z' }),
      act({ type: 'title', value: 'Zu' }),
      act({ type: 'title', value: 'Zug' }),
      act({ type: 'subtitle', value: 'S' }),
      act({ type: 'subtitle', value: 'Sw' }),
    ]);
    h = reduce(h, { type: 'undo' });
    expect(h.present.title).toBe('Zug');
    expect(h.present.subtitle).toBe(DEFAULT_POSTER.subtitle);
    h = reduce(h, { type: 'undo' });
    expect(h.present.title).toBe(DEFAULT_POSTER.title);
  });

  it('forgets the future after a new change', () => {
    let h = run([
      act({ type: 'theme', value: 'ink' }),
      { type: 'undo' },
      act({ type: 'theme', value: 'noir' }),
    ]);
    expect(canRedo(h)).toBe(false);
    h = reduce(h, { type: 'undo' });
    expect(h.present.theme).toBe('paper');
  });

  it('ignores changes that change nothing', () => {
    const h = run([
      act({ type: 'orientation', value: 'landscape' }),
      act({ type: 'size', value: 'phone' }),
      act({ type: 'orientation', value: 'portrait' }),
    ]);
    expect(h.present.orientation).toBe('landscape'); // a phone screen has no orientation to change
    expect(h.past).toHaveLength(2);
  });

  it('starts afresh on reset', () => {
    const h = run([
      act({ type: 'theme', value: 'ink' }),
      { type: 'reset', present: DEFAULT_POSTER },
    ]);
    expect(canUndo(h)).toBe(false);
  });
});

describe('a poster in a link', () => {
  const poster: Poster = {
    ...DEFAULT_POSTER,
    view: { lon: 8.54104, lat: 47.37445, zoom: 13.2 },
    title: 'Zürich & Co',
    subtitle: 'Where we met · 2019',
    showCoords: false,
    theme: 'golden-hour',
    font: 'serif',
    size: '50x70',
    orientation: 'landscape',
    layout: 'framed',
  };

  it('round-trips', () => {
    expect(fromSearch(toSearch(poster), DEFAULT_POSTER)).toEqual(poster);
  });

  it('needs a place to mean anything', () => {
    expect(fromSearch('', DEFAULT_POSTER)).toBeNull();
    expect(fromSearch('?lat=47', DEFAULT_POSTER)).toBeNull();
    expect(fromSearch('?lat=abc&lon=8', DEFAULT_POSTER)).toBeNull();
  });

  it('falls back to defaults for anything malformed', () => {
    const p = fromSearch(
      '?lat=95&lon=200&z=99&style=neon&size=huge&font=comic&layout=x',
      DEFAULT_POSTER,
    )!;
    expect(p.view.lat).toBe(84);
    expect(p.view.lon).toBeCloseTo(-160);
    expect(p.view.zoom).toBe(17);
    expect(p.theme).toBe(DEFAULT_POSTER.theme);
    expect(p.size).toBe(DEFAULT_POSTER.size);
    expect(p.font).toBe(DEFAULT_POSTER.font);
    expect(p.layout).toBe(DEFAULT_POSTER.layout);
  });

  it('keeps titles to a length a poster can hold', () => {
    const p = fromSearch(`?lat=1&lon=1&t=${'x'.repeat(500)}`, DEFAULT_POSTER)!;
    expect(p.title.length).toBe(40);
  });
});

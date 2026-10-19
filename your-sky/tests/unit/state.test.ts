import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, initHistory, withHistory } from 'poster-kit/history';
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
const at = (time: string, settled?: boolean): Action => ({
  type: 'when',
  value: { date: '2025-02-14', time },
  ...(settled === undefined ? {} : { settled }),
});
const tokyo = { name: 'Tokyo', context: 'Japan', lat: 35.68, lon: 139.69 };

describe('a poster', () => {
  it('moves its words to a new place, unless you have written your own', () => {
    const moved = reducePoster(DEFAULT_POSTER, { type: 'place', place: tokyo });
    expect([moved.title, moved.subtitle]).toEqual(['Tokyo', 'Japan']);

    const ours = reducePoster(
      reducePoster(DEFAULT_POSTER, { type: 'title', value: 'The night we met' }),
      { type: 'place', place: tokyo },
    );
    expect([ours.title, ours.subtitle]).toEqual(['The night we met', 'Japan']);
  });

  it('keeps the date and time when the place changes: it is the same night, somewhere else', () => {
    const moved = reducePoster(DEFAULT_POSTER, { type: 'place', place: tokyo });
    expect(moved.when).toEqual(DEFAULT_POSTER.when);
  });

  it('turns down dates that do not exist, and keeps years within the sky data', () => {
    expect(
      reducePoster(DEFAULT_POSTER, { type: 'when', value: { date: '2025-02-30', time: '22:00' } }),
    ).toBe(DEFAULT_POSTER);
    const old = reducePoster(DEFAULT_POSTER, {
      type: 'when',
      value: { date: '1066-10-14', time: '09:00' },
    });
    expect(old.when.date).toBe('1800-10-14');
  });

  it('switches what the chart shows one thing at a time', () => {
    const p = reducePoster(DEFAULT_POSTER, { type: 'show', key: 'grid', value: true });
    expect(p.show).toEqual({ ...DEFAULT_POSTER.show, grid: true });
  });
});

describe('undo and redo', () => {
  it('undoes and redoes ordinary changes one at a time', () => {
    let h = run([act({ type: 'theme', value: 'ink' }), act({ type: 'size', value: 'a4' })]);
    h = reduce(h, { type: 'undo' });
    expect(h.present.size).toBe('a3');
    expect(h.present.theme).toBe('ink');
    h = reduce(h, { type: 'undo' });
    expect(h.present.theme).toBe('midnight');
    expect(canUndo(h)).toBe(false);
    h = reduce(reduce(h, { type: 'redo' }), { type: 'redo' });
    expect(h.present.size).toBe('a4');
    expect(canRedo(h)).toBe(false);
  });

  it('makes one sweep of the night slider one step', () => {
    let h = run([
      act(at('22:10', false), false),
      act(at('22:40', false), false),
      act(at('23:30', false), false),
      act(at('23:30', true), true),
    ]);
    expect(h.present.when.time).toBe('23:30');
    h = reduce(h, { type: 'undo' });
    expect(h.present.when).toEqual(DEFAULT_POSTER.when);
    expect(canUndo(h)).toBe(false);
  });

  it('merges typing in one field, but not across fields', () => {
    let h = run([
      act({ type: 'title', value: 'O' }),
      act({ type: 'title', value: 'Ou' }),
      act({ type: 'title', value: 'Our' }),
      act(at('21:00')),
      act(at('21:05')),
    ]);
    h = reduce(h, { type: 'undo' });
    expect(h.present.title).toBe('Our');
    expect(h.present.when).toEqual(DEFAULT_POSTER.when);
    h = reduce(h, { type: 'undo' });
    expect(h.present.title).toBe(DEFAULT_POSTER.title);
  });
});

describe('links', () => {
  const custom: Poster = {
    ...DEFAULT_POSTER,
    place: { name: 'Gaza', context: 'Palestine', lat: 31.5017, lon: 34.4668 },
    when: { date: '1999-12-31', time: '23:59' },
    title: 'Ten, nine, eight…',
    subtitle: 'Gaza & home',
    showCoords: false,
    show: { lines: false, names: true, grid: true, milkyWay: false },
    theme: 'dusk',
    font: 'mono',
    size: '18x24',
    orientation: 'landscape',
    layout: 'framed',
  };

  it('holds the whole poster', () => {
    expect(fromSearch(toSearch(custom), DEFAULT_POSTER)).toEqual(custom);
    expect(fromSearch(toSearch(DEFAULT_POSTER), DEFAULT_POSTER)).toEqual(DEFAULT_POSTER);
  });

  it('needs a place, and falls back on anything malformed', () => {
    expect(fromSearch('?style=ink', DEFAULT_POSTER)).toBeNull();
    const p = fromSearch(
      '?lat=95&lon=200&place=X&d=2025-02-30&at=25:00&style=neon&font=comic&size=huge',
      DEFAULT_POSTER,
    )!;
    expect(p.place.lat).toBe(90);
    expect(p.place.lon).toBe(-160);
    expect(p.when).toEqual(DEFAULT_POSTER.when);
    expect([p.theme, p.font, p.size]).toEqual(['midnight', 'serif', 'a3']);
    expect(p.title).toBe('X'); // no words of its own: the place's
    expect(fromSearch('?lat=1&lon=2&place=Gaza&in=Palestine', DEFAULT_POSTER)!.subtitle).toBe(
      'Palestine',
    );
  });
});

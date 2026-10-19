import { describe, expect, it } from 'vitest';
import { RING } from '../../src/sky/paint';
import { layoutPoster } from '../../src/poster/layout';
import { SIZE_IDS, aspectOf } from 'poster-kit/sizes';
import { canSpace, graphemes, setWords, spacedWidth } from '../../src/poster/words';
import { THEMES } from '../../src/sky/themes';
import { fileName } from '../../src/poster/export';
import { DEFAULT_POSTER } from '../../src/state/poster';

/* every letter 0.6 em wide: enough to test fitting without a real font */
const measure = (font: string, text: string) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
  return graphemes(text).length * size * 0.6;
};

describe('layout', () => {
  it('keeps the chart, its compass and the words on the poster, apart', () => {
    for (const layout of ['clean', 'framed'] as const) {
      for (const id of SIZE_IDS) {
        for (const o of ['portrait', 'landscape'] as const) {
          const a = aspectOf(id, o);
          const [w, h] = a < 1 ? [1000, 1000 / a] : [1000 * a, 1000];
          const l = layoutPoster(w, h, layout);
          const { cx, cy, r } = l.chart;
          const ring = r * RING;
          expect(cx - ring).toBeGreaterThan(0);
          expect(cx + ring).toBeLessThan(w);
          expect(cy - ring).toBeGreaterThan(0);
          expect(cy + ring).toBeLessThan(h);
          expect(l.title.y).toBeLessThan(l.subtitle.y);
          expect(l.when.y).toBeLessThan(l.coords.y);
          expect(l.coords.y).toBeLessThan(h);
          if (w < h * 1.15) {
            expect(l.title.y - l.title.size).toBeGreaterThan(cy + ring); // words below
          } else {
            expect(l.title.x - l.title.maxWidth / 2).toBeGreaterThan(cx + ring); // words beside
          }
        }
      }
    }
  });
});

describe('words', () => {
  const layout = layoutPoster(1000, 1414, 'clean');

  it('shrinks a long title to fit', () => {
    const { lines } = setWords(
      measure,
      layout,
      { title: 'The night we first met', subtitle: '', when: null, coords: null },
      'sans',
      THEMES.paper,
    );
    const title = lines[0]!;
    expect(title.size).toBeLessThan(layout.title.size);
    expect(spacedWidth(measure, title.font, title.text, title.spacing)).toBeLessThanOrEqual(
      layout.title.maxWidth + 0.5,
    );
  });

  it('sets only the lines that have something to say', () => {
    const { lines, rule } = setWords(
      measure,
      layout,
      { title: '', subtitle: 'Paris', when: '14 February 2025 · 22:00', coords: null },
      'serif',
      THEMES.ink,
    );
    expect(lines.map((l) => l.text)).toEqual(['PARIS', '14 FEBRUARY 2025 · 22:00']);
    expect(rule).toBeNull();
  });

  it('spaces out only the scripts that are written that way', () => {
    for (const name of ['ZÜRICH', 'MUQDISHO', 'ΑΘΗΝΑ', '東京', '서울'])
      expect(canSpace(name)).toBe(true);
    for (const name of ['القاهرة', 'غزة', 'मुंबई']) expect(canSpace(name)).toBe(false);
  });

  it('names files after the poster', () => {
    expect(fileName({ ...DEFAULT_POSTER, title: 'Zürich, à deux' }, 'png')).toBe(
      'zurich-a-deux-2025-02-14-midnight.png',
    );
    expect(fileName({ ...DEFAULT_POSTER, title: '' }, 'svg')).toBe('paris-2025-02-14-midnight.svg');
  });
});

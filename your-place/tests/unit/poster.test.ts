import { describe, expect, it } from 'vitest';
import { layoutPoster } from '../../src/poster/layout';
import { canSpace, graphemes, setWords, spacedWidth } from '../../src/poster/words';
import { THEMES } from '../../src/map/themes';

/* every letter 0.6 em wide: enough to test fitting without a real font */
const measure = (font: string, text: string) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
  return graphemes(text).length * size * 0.6;
};

describe('layout', () => {
  it('keeps everything on the poster, in order down the page', () => {
    for (const layout of ['full', 'framed'] as const) {
      for (const [w, h] of [
        [1000, 1414],
        [1414, 1000],
        [1320, 2868],
        [600, 600],
      ] as const) {
        const l = layoutPoster(w, h, layout);
        expect(l.map.x).toBeGreaterThanOrEqual(0);
        expect(l.map.y + l.map.h).toBeLessThanOrEqual(h);
        expect(l.title.y).toBeLessThan(l.subtitle.y);
        expect(l.subtitle.y).toBeLessThan(l.coords.y);
        expect(l.coords.y).toBeLessThan(h);
        if (layout === 'framed')
          expect(l.title.y - l.title.size).toBeGreaterThan(l.map.y + l.map.h);
      }
    }
  });
});

describe('words', () => {
  const layout = layoutPoster(1000, 1414, 'full');

  it('shrinks a long name to fit, keeping its letter spacing in proportion', () => {
    const { lines } = setWords(
      measure,
      layout,
      { title: 'Llanfairpwllgwyngyll', subtitle: '', coords: null },
      'sans',
      THEMES.paper,
    );
    const title = lines[0]!;
    expect(title.size).toBeLessThan(layout.title.size);
    expect(spacedWidth(measure, title.font, title.text, title.spacing)).toBeLessThanOrEqual(
      layout.title.maxWidth + 0.5,
    );
    expect(title.spacing / title.size).toBeCloseTo(0.34);
  });

  it('leaves a short name at full size', () => {
    const { lines } = setWords(
      measure,
      layout,
      { title: 'Bath', subtitle: '', coords: null },
      'sans',
      THEMES.paper,
    );
    expect(lines[0]!.size).toBe(layout.title.size);
  });

  it('always credits OpenStreetMap', () => {
    const { lines, rule } = setWords(
      measure,
      layout,
      { title: '', subtitle: '', coords: null },
      'serif',
      THEMES.ink,
    );
    expect(lines.map((l) => l.text)).toEqual(['© OpenStreetMap contributors']);
    expect(rule).toBeNull();
  });

  it('spaces out only the scripts that are written that way', () => {
    for (const name of ['ZÜRICH', 'MUQDISHO', 'MOCKBA', 'ΑΘΗΝΑ', '東京', '서울', 'SÃO PAULO']) {
      expect(canSpace(name), name).toBe(true);
    }
    // joined, right-to-left or stacked scripts break when drawn letter by letter
    for (const name of ['القاهرة', 'غزة', 'मुंबई', 'กรุงเทพมหานคร', 'Gaza غزة']) {
      expect(canSpace(name), name).toBe(false);
    }
  });

  it('sets Arabic as one run that still fits', () => {
    const { lines } = setWords(
      measure,
      layout,
      { title: 'القاهرة الجديدة الكبرى', subtitle: 'مصر', coords: null },
      'sans',
      THEMES.paper,
    );
    const [title, subtitle] = lines;
    expect(title!.spacing).toBe(0);
    expect(subtitle!.spacing).toBe(0);
    expect(spacedWidth(measure, title!.font, title!.text, 0)).toBeLessThanOrEqual(
      layout.title.maxWidth + 0.5,
    );
  });

  it('counts letters as people see them', () => {
    expect(graphemes('Zürich')).toHaveLength(6);
    expect(graphemes('Zürich')).toHaveLength(6); // u + combining diaeresis
    expect(graphemes('🇨🇭')).toHaveLength(1);
  });
});

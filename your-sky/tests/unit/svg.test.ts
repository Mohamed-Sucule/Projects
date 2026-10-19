import { describe, expect, it } from 'vitest';
import { skyAt } from '../../src/sky/astro';
import { buildScene } from '../../src/sky/scene';
import { chartSvg, colourAttrs, escapeXml } from '../../src/sky/svg';
import { THEMES } from '../../src/sky/themes';

const measure = (font: string, text: string) =>
  [...text].length * Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10) * 0.6;

describe('the chart as SVG', () => {
  const sky = skyAt(48.8534, 2.3488, new Date('2025-02-14T21:00:00Z'));
  const scene = buildScene(
    sky,
    600,
    { lines: true, names: true, grid: false },
    measure,
    'Fraunces',
  );
  const { defs, body } = chartSvg(
    scene,
    1000,
    800,
    { theme: THEMES.midnight, family: 'Fraunces' },
    null,
  );

  it('draws every star the canvas does, and every label', () => {
    // stars, plus each planet's dot and ring, plus the Moon's disc
    expect(body.match(/<circle /g)!.length).toBe(scene.starCount + scene.planets.length * 2 + 3);
    expect(body.match(/<text /g)!.length).toBe(scene.labels.length + 4); // and N, E, S, W
    expect(body).toContain('>ORION</text>');
  });

  it('clips the sky to the horizon', () => {
    expect(defs).toContain(
      '<clipPath id="horizon"><circle cx="1000" cy="800" r="600"/></clipPath>',
    );
    expect(body).toContain('clip-path="url(#horizon)"');
  });

  it('writes colours that any SVG tool can read', () => {
    expect(colourAttrs('stroke', 'rgba(214, 176, 106, 0.62)')).toBe(
      'stroke="rgb(214, 176, 106)" stroke-opacity="0.62"',
    );
    expect(colourAttrs('fill', '#0d1628')).toBe('fill="#0d1628"');
    expect(body).not.toContain('rgba(');
    expect(escapeXml(`Tom & Jerry's <3`)).toBe('Tom &amp; Jerry&apos;s &lt;3');
  });

  it('carries the Milky Way as a picture under the vectors', () => {
    const withGlow = chartSvg(
      scene,
      1000,
      800,
      { theme: THEMES.midnight, family: 'F' },
      'data:image/png;base64,AAAA',
    );
    expect(withGlow.body.indexOf('<image')).toBeLessThan(withGlow.body.indexOf('<g fill='));
  });
});

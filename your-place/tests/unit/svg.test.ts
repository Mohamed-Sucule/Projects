import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeTile } from '../../src/map/decode';
import { frameFor } from '../../src/map/geo';
import { SvgPen, escapeXml, mapSvg } from '../../src/map/svg';
import { THEMES } from '../../src/map/themes';
import { layoutPoster } from '../../src/poster/layout';

const tile = decodeTile(
  gunzipSync(readFileSync(new URL('../fixtures/zurich-14-8581-5739.pbf.gz', import.meta.url))),
);

describe('SVG paths', () => {
  it('rounds to a tenth and drops repeated points', () => {
    const pen = new SvgPen();
    pen.moveTo(1.04, 2.06);
    pen.lineTo(1.01, 2.09);
    pen.lineTo(3.456, 4);
    pen.closePath();
    expect(pen.d).toBe('M1 2.1L3.5 4Z');
  });

  it('escapes text', () => {
    expect(escapeXml(`Tom & Jerry's <"place">`)).toBe(
      'Tom &amp; Jerry&apos;s &lt;&quot;place&quot;&gt;',
    );
  });
});

describe('the map as SVG', () => {
  // frame the fixture tile so it fills the poster
  const layout = layoutPoster(1000, 1414, 'full');
  const view = { lon: 8.5583, lat: 47.374, zoom: 13.6 };
  const frame = frameFor(view, layout.map);

  for (const id of ['paper', 'golden-hour', 'blueprint'] as const) {
    it(`draws ${id} with its effects`, () => {
      const theme = THEMES[id];
      const { defs, body } = mapSvg({
        frame,
        theme,
        width: 1000,
        height: 1414,
        fade: layout.fade,
        tiles: [{ id: { z: 14, x: 8581, y: 5739 }, tile }],
      });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`;
      expect(svg).toContain(`fill="${theme.water}"`);
      expect(svg).toContain('stroke-linecap="round"');
      expect(svg).toContain('url(#fade)');
      if (theme.glow) expect(defs).toContain('<filter id="glow"');
      if (theme.grid) expect(body).toContain(`stroke="${theme.grid.color}"`);
      if (theme.landWash) expect(defs).toContain('<radialGradient id="wash"');
      // every opened element is closed
      const opened = (svg.match(/<(?!\/)[a-zA-Z]+[^>]*[^/]>/g) ?? []).length;
      const closed = (svg.match(/<\/[a-zA-Z]+>/g) ?? []).length;
      expect(opened).toBe(closed);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    });
  }
});

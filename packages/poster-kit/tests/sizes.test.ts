import { describe, expect, it } from 'vitest';
import { SIZE_IDS, aspectOf, exportSize } from '../src/sizes';

describe('sizes', () => {
  it('prints at 300 dpi when the budget allows', () => {
    expect(exportSize('a4', 'portrait', 16e6)).toEqual({ width: 2480, height: 3508, dpi: 300 });
  });

  it('lowers the dpi rather than exceed the pixel budget', () => {
    for (const id of SIZE_IDS) {
      for (const o of ['portrait', 'landscape'] as const) {
        const out = exportSize(id, o, 16e6);
        expect(out.width * out.height).toBeLessThanOrEqual(16e6 * 1.001);
      }
    }
    expect(exportSize('50x70', 'portrait', 16e6).dpi).toBeLessThan(300);
  });

  it('turns a print round for landscape, but not a phone screen', () => {
    expect(aspectOf('a3', 'landscape')).toBeCloseTo(1 / aspectOf('a3', 'portrait'));
    expect(aspectOf('phone', 'landscape')).toBe(aspectOf('phone', 'portrait'));
  });
});

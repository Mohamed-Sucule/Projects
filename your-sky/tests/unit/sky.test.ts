import { describe, expect, it } from 'vitest';
import { altitude, fromRaDec, rotate, skyAt } from '../../src/sky/astro';
import { describeSky, list, whereIs } from '../../src/sky/describe';
import { brightness, milkyWayPixels } from '../../src/sky/milkyway';
import { buildScene, starRadius, trim, type ChartOptions } from '../../src/sky/scene';
import { project } from '../../src/sky/project';
import { readSkyMap } from './png';

/* every letter 0.6 em wide: enough to lay out labels without a real font */
const measure = (font: string, text: string) =>
  [...text].length * Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10) * 0.6;
const ALL: ChartOptions = { lines: true, names: true, grid: true };
const R = 500;

// Paris on Valentine's night 2025: Orion in the south-west, Jupiter in Taurus, Mars in Gemini
const paris = skyAt(48.8534, 2.3488, new Date('2025-02-14T21:00:00Z'));

describe('the chart', () => {
  const scene = buildScene(paris, R, ALL, measure, 'serif');

  it('draws only what is above the horizon, inside the circle', () => {
    expect(scene.starCount).toBeGreaterThan(2000); // about half of the 5,044 stars
    expect(scene.starCount).toBeLessThan(3000);
    for (let i = 0; i < scene.starCount; i++) {
      expect(Math.hypot(scene.stars[i * 4]!, scene.stars[i * 4 + 1]!)).toBeLessThanOrEqual(R);
    }
  });

  it('puts the planets where they were', () => {
    expect(scene.planets.map((p) => p.id).sort()).toEqual(['jupiter', 'mars']);
    for (const p of scene.planets) {
      const dir = paris.planets.find((q) => q.id === p.id)!.dir;
      const [x, y] = project(dir);
      expect(p.x).toBeCloseTo(x * R, 6);
      expect(p.y).toBeCloseTo(y * R, 6);
    }
    // Jupiter was in Taurus, by Aldebaran (RA 69°, Dec +16.5°)
    const jupiter = paris.planets.find((p) => p.id === 'jupiter')!.dir;
    const aldebaran = rotate(paris.rotation, fromRaDec(68.98, 16.51));
    const apart = Math.acos(jupiter.reduce((s, v, i) => s + v * aldebaran[i]!, 0));
    expect((apart * 180) / Math.PI).toBeLessThan(10);
  });

  it('makes brighter stars bigger', () => {
    expect(starRadius(-1.46, R)).toBeGreaterThan(starRadius(1, R));
    expect(starRadius(1, R)).toBeGreaterThan(starRadius(6, R));
  });

  it('keeps labels apart, inside the horizon', () => {
    const boxes = scene.labels.map((l) => ({
      x0: l.x,
      x1: l.x + measure(`${l.weight} ${l.size}px serif`, l.text) + l.spacing * (l.text.length - 1),
      y0: l.y - l.size,
      y1: l.y,
    }));
    for (const b of boxes)
      expect(Math.hypot(Math.max(-b.x0, b.x1), Math.max(-b.y0, b.y1))).toBeLessThan(R * 1.42);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 + 2 < b.y1 && b.y0 + 2 < a.y1;
        expect(overlap, `${scene.labels[i]!.text} / ${scene.labels[j]!.text}`).toBe(false);
      }
    }
    const names = scene.labels.map((l) => l.text);
    expect(names).toEqual(expect.arrayContaining(['ORION', 'GEMINI', 'Jupiter', 'Mars', 'Sirius']));
  });

  it('labels the famous constellations before the faint ones', () => {
    const kinds = scene.labels.filter((l) => l.kind === 'constellation').map((l) => l.size);
    expect(kinds[0]).toBeGreaterThanOrEqual(kinds.at(-1)!);
  });

  it('leaves out whatever is switched off', () => {
    const bare = buildScene(
      paris,
      R,
      { lines: false, names: false, grid: false },
      measure,
      'serif',
    );
    expect(bare.figures).toEqual([]);
    expect(bare.labels).toEqual([]);
    expect(bare.grid).toEqual([]);
    expect(bare.ecliptic).toEqual([]);
    expect(bare.starCount).toBe(scene.starCount);
    expect(scene.grid.length).toBeGreaterThan(5);
    expect(scene.ecliptic.length).toBeGreaterThan(0);
  });

  it('turns the Moon’s lit side towards the Sun', () => {
    // a first-quarter Moon in the afternoon: Sun low in the south-west, Moon in the south-east
    const day = skyAt(48.8534, 2.3488, new Date('2025-02-05T14:30:00Z'));
    const { moon, sun } = buildScene(day, R, ALL, measure, 'serif');
    expect(moon && sun).toBeTruthy();
    const towards = Math.atan2(sun!.y - moon!.y, sun!.x - moon!.x);
    const diff = Math.abs(((moon!.toSun - towards + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    expect(diff).toBeLessThan(0.5); // the path to the Sun curves on the chart, but not that much
    expect(Math.abs(moon!.cosPhase)).toBeLessThan(0.15); // half lit
  });

  it('stops constellation lines short of their stars', () => {
    const line = trim(new Float32Array([0, 0, 50, 0, 100, 0]), 10)!;
    expect([...line]).toEqual([10, 0, 50, 0, 90, 0]);
    expect(trim(new Float32Array([0, 0, 20, 0]), 10)).toBeNull();
  });
});

describe('the Milky Way', () => {
  const map = readSkyMap();
  const at = (ra: number, dec: number) => brightness(map, ...fromRaDec(ra, dec));

  it('is brightest towards the centre of the galaxy and absent at its poles', () => {
    expect(at(266.4, -28.9)).toBeGreaterThan(0.4); // Sagittarius A*
    expect(at(192.86, 27.13)).toBe(0); // the north galactic pole
    expect(at(12.86, -27.13)).toBe(0); // the south galactic pole
    expect(at(86.4, 28.9)).toBeGreaterThan(0); // the faint anticentre, in Taurus
    expect(at(86.4, 28.9)).toBeLessThan(at(266.4, -28.9));
  });

  it('wraps round at right ascension 0', () => {
    expect(Math.abs(at(359.9, 60) - at(0.1, 60))).toBeLessThan(0.05);
  });

  it('glows over the chart where it is in the sky', () => {
    // from Chile, with the centre of the galaxy straight overhead
    const sky = skyAt(-29, -70, new Date('2025-07-01T03:00:00Z'));
    const zenith = altitude(rotate(sky.rotation, fromRaDec(266.4, -28.9)));
    expect(zenith).toBeGreaterThan(75);
    const size = 64;
    const px = milkyWayPixels(map, sky.rotation, size, [255, 255, 255], 1);
    const alpha = (x: number, y: number) => px[(y * size + x) * 4 + 3]!;
    expect(alpha(32, 32)).toBeGreaterThan(100);
    expect(alpha(0, 0)).toBe(0); // the corners are outside the horizon
  });
});

describe('the sky in words', () => {
  it('says where things are', () => {
    expect(whereIs([0, 0, 1])).toBe('almost overhead');
    expect(whereIs([-0.95, 0, 0.3])).toBe('low in the south');
    expect(whereIs([0, -0.4, 0.92])).toBe('high in the east');
    expect(list(['Orion'])).toBe('Orion');
    expect(list(['Orion', 'Taurus', 'Gemini'])).toBe('Orion, Taurus and Gemini');
  });

  it('describes Valentine’s night over Paris', () => {
    const d = describeSky(paris);
    expect(d.sights.map((s) => s.name)).toEqual(['The Moon', 'Jupiter', 'Mars']);
    expect(d.sights[0]!.detail).toMatch(/^waning gibbous, 9\d% lit, low in the east$/);
    expect(d.light).toBeNull();
    expect(d.text).toContain('High up:');
  });

  it('says when daylight hides the stars', () => {
    const noon = skyAt(48.8534, 2.3488, new Date('2025-06-21T12:00:00Z'));
    expect(describeSky(noon).light).toMatch(/Sun is up/);
  });
});

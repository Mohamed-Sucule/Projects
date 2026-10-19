import { describe, expect, it } from 'vitest';
import {
  altitude,
  azimuth,
  fromRaDec,
  phaseName,
  rotate,
  skyAt,
  sunAltitudes,
  unrotate,
} from '../../src/sky/astro';
import { project, unproject } from '../../src/sky/project';

const POLARIS = fromRaDec(37.95, 89.264);
const SIRIUS = fromRaDec(101.287, -16.716);

describe('the sky over a place', () => {
  it('puts Polaris as high as the place is far north', () => {
    for (const lat of [10, 30, 51.5, 70]) {
      const sky = skyAt(lat, 0, new Date('2025-02-14T21:30:00Z'));
      // Polaris is three-quarters of a degree from the pole, so it circles that close to it
      expect(Math.abs(altitude(rotate(sky.rotation, POLARIS)) - lat)).toBeLessThan(1);
      expect(Math.abs(((azimuth(rotate(sky.rotation, POLARIS)) + 180) % 360) - 180)).toBeLessThan(
        2,
      );
    }
  });

  it('lifts the noon Sun to 90° − latitude + 23.4° at the June solstice', () => {
    // London, 21 June 2025, at local solar noon (12:00 at 0° longitude, plus the equation of time)
    const sky = skyAt(51.48, 0, new Date('2025-06-21T12:02:00Z'));
    expect(altitude(sky.sun)).toBeCloseTo(90 - 51.48 + 23.44, 0);
    expect(azimuth(sky.sun)).toBeGreaterThan(178);
    expect(azimuth(sky.sun)).toBeLessThan(182);
  });

  it('turns the stars once a sidereal day, not once a day', () => {
    const t = Date.parse('2025-01-01T00:00:00Z');
    const a = rotate(skyAt(48.85, 2.35, new Date(t)).rotation, SIRIUS);
    const sidereal = rotate(skyAt(48.85, 2.35, new Date(t + 86_164_091)).rotation, SIRIUS);
    const solar = rotate(skyAt(48.85, 2.35, new Date(t + 86_400_000)).rotation, SIRIUS);
    const gap = (u: number[], v: number[]) =>
      Math.hypot(u[0]! - v[0]!, u[1]! - v[1]!, u[2]! - v[2]!);
    expect(gap(a, sidereal)).toBeLessThan(1e-4);
    expect(gap(a, solar)).toBeGreaterThan(0.005); // about a degree further round
  });

  it('knows a full moon from a new one', () => {
    const full = skyAt(0, 0, new Date('2024-01-25T17:54:00Z')).moon;
    expect(full.lit).toBeGreaterThan(0.99);
    expect(phaseName(full.age)).toBe('full moon');
    const fresh = skyAt(0, 0, new Date('2024-02-09T22:59:00Z')).moon;
    expect(fresh.lit).toBeLessThan(0.01);
    expect(phaseName(fresh.age)).toBe('new moon');
    expect(phaseName(45)).toBe('waxing crescent');
    expect(phaseName(200)).toBe('waning gibbous');
    expect(phaseName(355)).toBe('new moon');
  });

  it('undoes its own rotation', () => {
    const { rotation } = skyAt(-33.9, 151.2, new Date('2025-08-01T10:00:00Z'));
    const back = unrotate(rotation, rotate(rotation, SIRIUS));
    back.forEach((v, i) => expect(v).toBeCloseTo(SIRIUS[i]!, 12));
  });

  it('gives the Sun a day and a night', () => {
    const alts = sunAltitudes(48.85, 2.35, Date.parse('2025-06-21T00:00:00Z'), 3_600_000, 24);
    expect(Math.max(...alts)).toBeGreaterThan(60);
    expect(Math.min(...alts)).toBeLessThan(-15);
  });
});

describe('the chart', () => {
  it('puts the zenith in the middle, the horizon at the edge, north up and east left', () => {
    expect(project([0, 0, 1])).toEqual([0, -0]);
    const [nx, ny] = project([1, 0, 0]);
    expect([nx, ny]).toEqual([0, -1]);
    const east = project([0, -1, 0]);
    expect(east[0]).toBe(-1);
    for (const h of [
      [0.3, -0.4, Math.sqrt(1 - 0.25)],
      [0.6, 0.6, Math.sqrt(1 - 0.72)],
    ] as [number, number, number][]) {
      const [x, y] = project(h);
      unproject(x, y).forEach((v, i) => expect(v).toBeCloseTo(h[i]!, 12));
    }
  });
});

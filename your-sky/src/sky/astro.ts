/* Where everything in the sky is, for one place and one moment.

   The stars barely move against each other in a lifetime, so they are stored once, as
   directions in the J2000 equatorial frame. What changes is how that frame sits over an
   observer: Astronomy Engine gives one rotation from it to the observer's horizon that
   takes in the Earth's turning, its wobble (precession and nutation) and the place on
   the globe. The Sun, the Moon and the planets do move, so each gets its own position. */

import {
  Body,
  Equator,
  Illumination,
  MakeTime,
  MoonPhase,
  Observer,
  Rotation_EQJ_HOR,
} from 'astronomy-engine';

export type Vec3 = [number, number, number];

/** A rotation, row by row. Here: from J2000 equatorial to the horizon (north, west, up). */
export type Matrix = [number, number, number, number, number, number, number, number, number];

const RAD = Math.PI / 180;

/** A direction from right ascension and declination, in degrees. */
export function fromRaDec(ra: number, dec: number): Vec3 {
  const c = Math.cos(dec * RAD);
  return [c * Math.cos(ra * RAD), c * Math.sin(ra * RAD), Math.sin(dec * RAD)];
}

export function rotate(m: Matrix, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** The rotation back: a rotation's inverse is its transpose. */
export function unrotate(m: Matrix, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Altitude above the horizon, in degrees, of a direction in the horizon frame. */
export const altitude = (h: Vec3) => Math.asin(Math.max(-1, Math.min(1, h[2]))) / RAD;

/** Compass bearing, in degrees east of north, of a direction in the horizon frame. */
export const azimuth = (h: Vec3) => (Math.atan2(-h[1], h[0]) / RAD + 360) % 360;

export const PLANET_IDS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const;
export type PlanetId = (typeof PLANET_IDS)[number];

const PLANET_BODY: Record<PlanetId, Body> = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
};

export const PLANET_NAME: Record<PlanetId, string> = {
  mercury: 'Mercury',
  venus: 'Venus',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
};

export interface Moon {
  /** direction, in the horizon frame */
  dir: Vec3;
  /** how much of the disc is lit, 0 to 1 */
  lit: number;
  /** the angle Sun–Moon–Earth, in degrees: 0 when full, 180 when new */
  phaseAngle: number;
  /** how far round its month the Moon is, in degrees: 0 new, 90 first quarter, 180 full */
  age: number;
}

export interface Sky {
  at: Date;
  lat: number;
  lon: number;
  /** turns a J2000 equatorial direction into one in the horizon frame */
  rotation: Matrix;
  sun: Vec3;
  moon: Moon;
  /** the five planets you can see without a telescope */
  planets: { id: PlanetId; dir: Vec3; mag: number }[];
}

/** The sky over a place at a moment. Directions in the horizon frame: x north, y west, z up. */
export function skyAt(lat: number, lon: number, at: Date): Sky {
  const time = MakeTime(at);
  const observer = new Observer(lat, lon, 0);
  const rot = Rotation_EQJ_HOR(time, observer).rot;
  // Astronomy Engine's matrices are indexed [column][row]
  const rotation: Matrix = [
    rot[0]![0]!,
    rot[1]![0]!,
    rot[2]![0]!,
    rot[0]![1]!,
    rot[1]![1]!,
    rot[2]![1]!,
    rot[0]![2]!,
    rot[1]![2]!,
    rot[2]![2]!,
  ];
  // apparent positions from where the observer stands, in J2000 axes, turned to the horizon
  const toHorizon = (body: Body): Vec3 => {
    const v = Equator(body, time, observer, false, true).vec;
    return normalize(rotate(rotation, [v.x, v.y, v.z]));
  };
  const moonLight = Illumination(Body.Moon, time);
  return {
    at,
    lat,
    lon,
    rotation,
    sun: toHorizon(Body.Sun),
    moon: {
      dir: toHorizon(Body.Moon),
      lit: moonLight.phase_fraction,
      phaseAngle: moonLight.phase_angle,
      age: MoonPhase(time),
    },
    planets: PLANET_IDS.map((id) => ({
      id,
      dir: toHorizon(PLANET_BODY[id]),
      mag: Illumination(PLANET_BODY[id], time).mag,
    })),
  };
}

/** The Sun's altitude in degrees at `n` moments, `stepMs` apart: how dark the night gets. */
export function sunAltitudes(lat: number, lon: number, fromMs: number, stepMs: number, n: number) {
  const observer = new Observer(lat, lon, 0);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const time = MakeTime(new Date(fromMs + i * stepMs));
    const v = Equator(Body.Sun, time, observer, false, true).vec;
    const r = Rotation_EQJ_HOR(time, observer).rot;
    // only the up component is needed: the third row of the rotation
    const up = r[0]![2]! * v.x + r[1]![2]! * v.y + r[2]![2]! * v.z;
    out[i] = altitude([0, 0, up / Math.hypot(v.x, v.y, v.z)]);
  }
  return out;
}

export type PhaseName =
  | 'new moon'
  | 'waxing crescent'
  | 'first quarter'
  | 'waxing gibbous'
  | 'full moon'
  | 'waning gibbous'
  | 'last quarter'
  | 'waning crescent';

/** The Moon's phase by name. "Full" or "quarter" within about half a day of the moment. */
export function phaseName(age: number): PhaseName {
  const a = ((age % 360) + 360) % 360;
  const near = (target: number) => Math.abs(((a - target + 540) % 360) - 180) < 6;
  if (near(0)) return 'new moon';
  if (near(90)) return 'first quarter';
  if (near(180)) return 'full moon';
  if (near(270)) return 'last quarter';
  if (a < 90) return 'waxing crescent';
  if (a < 180) return 'waxing gibbous';
  if (a < 270) return 'waning gibbous';
  return 'waning crescent';
}

/** The eight points of the compass, for saying where something is. */
export function compassPoint(azimuthDeg: number): string {
  const names = [
    'north',
    'north-east',
    'east',
    'south-east',
    'south',
    'south-west',
    'west',
    'north-west',
  ];
  return names[Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8]!;
}

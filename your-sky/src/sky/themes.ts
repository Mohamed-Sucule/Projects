/* The styles. Each is a full set of colours for the poster, the chart and the words. */

export const THEME_IDS = ['midnight', 'ink', 'paper', 'dusk', 'teal'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);

export interface Theme {
  name: string;
  /** behind everything; a second colour makes it a gradient from top to bottom */
  paper: string;
  paperTo?: string;
  /** the disc of the sky, from its middle to its horizon */
  sky: string;
  skyEdge: string;
  star: string;
  /** how much of each star's own colour shows, 0 to 1 */
  starTint: number;
  /** soft halos round the brightest stars */
  halo: number;
  line: string;
  label: string;
  grid: string;
  milkyWay: string;
  /** how strongly the Milky Way shows, 0 to 1 */
  milkyWayStrength: number;
  /** the horizon ring and the compass */
  ring: string;
  moonLit: string;
  moonDark: string;
  sun: string;
  /** the words */
  ink: string;
  inkSoft: string;
  /** the colour this theme is known by, in the style picker */
  swatch: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  midnight: {
    name: 'Midnight',
    paper: '#0d1628',
    sky: '#101c33',
    skyEdge: '#0b1424',
    star: '#fbf3dc',
    starTint: 0.35,
    halo: 0.5,
    line: 'rgba(214, 176, 106, 0.62)',
    label: 'rgba(226, 196, 138, 0.82)',
    grid: 'rgba(170, 186, 220, 0.16)',
    milkyWay: '#9db1dc',
    milkyWayStrength: 0.28,
    ring: '#d6b06a',
    moonLit: '#f7ecd2',
    moonDark: 'rgba(247, 236, 210, 0.1)',
    sun: '#f2c46b',
    ink: '#ecd39b',
    inkSoft: 'rgba(236, 211, 155, 0.72)',
    swatch: '#d6b06a',
  },
  ink: {
    name: 'Ink',
    paper: '#08080a',
    sky: '#0b0b0e',
    skyEdge: '#08080a',
    star: '#ffffff',
    starTint: 0.5,
    halo: 0.45,
    line: 'rgba(255, 255, 255, 0.42)',
    label: 'rgba(255, 255, 255, 0.66)',
    grid: 'rgba(255, 255, 255, 0.12)',
    milkyWay: '#ffffff',
    milkyWayStrength: 0.18,
    ring: 'rgba(255, 255, 255, 0.8)',
    moonLit: '#f4f4f0',
    moonDark: 'rgba(255, 255, 255, 0.08)',
    sun: '#ffffff',
    ink: '#f4f4f0',
    inkSoft: 'rgba(244, 244, 240, 0.66)',
    swatch: '#ffffff',
  },
  paper: {
    name: 'Atlas',
    paper: '#f2ecdf',
    sky: '#f6f1e6',
    skyEdge: '#ece4d3',
    star: '#1b2130',
    starTint: 0,
    halo: 0,
    line: 'rgba(176, 58, 40, 0.78)',
    label: 'rgba(150, 48, 32, 0.9)',
    grid: 'rgba(27, 33, 48, 0.14)',
    milkyWay: '#7d8fae',
    milkyWayStrength: 0.26,
    ring: '#1b2130',
    moonLit: '#f6f1e6',
    moonDark: '#1b2130',
    sun: '#b03a28',
    ink: '#1b2130',
    inkSoft: 'rgba(27, 33, 48, 0.7)',
    swatch: '#b03a28',
  },
  dusk: {
    name: 'Dusk',
    paper: '#1d1638',
    paperTo: '#4b2443',
    sky: '#1b1534',
    skyEdge: '#5b2c4e',
    star: '#fff1ea',
    starTint: 0.3,
    halo: 0.55,
    line: 'rgba(249, 176, 150, 0.6)',
    label: 'rgba(255, 196, 172, 0.84)',
    grid: 'rgba(255, 200, 190, 0.14)',
    milkyWay: '#e9b9d6',
    milkyWayStrength: 0.24,
    ring: '#f7b49a',
    moonLit: '#fff1ea',
    moonDark: 'rgba(255, 241, 234, 0.1)',
    sun: '#ffb27a',
    ink: '#ffd9c7',
    inkSoft: 'rgba(255, 217, 199, 0.74)',
    swatch: '#f7b49a',
  },
  teal: {
    name: 'Deep sea',
    paper: '#0b3438',
    sky: '#0e3d42',
    skyEdge: '#09292d',
    star: '#fdf7e6',
    starTint: 0.25,
    halo: 0.45,
    line: 'rgba(240, 200, 120, 0.6)',
    label: 'rgba(244, 214, 150, 0.84)',
    grid: 'rgba(190, 236, 230, 0.14)',
    milkyWay: '#bfe9e2',
    milkyWayStrength: 0.24,
    ring: '#f0c878',
    moonLit: '#fdf7e6',
    moonDark: 'rgba(253, 247, 230, 0.1)',
    sun: '#f0c878',
    ink: '#f6e2b4',
    inkSoft: 'rgba(246, 226, 180, 0.74)',
    swatch: '#f0c878',
  },
};

/** The colour of a star of a given B−V index, blended into the theme's star colour. */
export function starColour(theme: Theme, bv: number): string {
  if (theme.starTint === 0) return theme.star;
  const [r, g, b] = blackbody(bv);
  const [sr, sg, sb] = hexRgb(theme.star);
  const t = theme.starTint;
  return `rgb(${Math.round(sr + (r - sr) * t)}, ${Math.round(sg + (g - sg) * t)}, ${Math.round(sb + (b - sb) * t)})`;
}

/** Roughly the colour of a star of a given B−V index, from blue-white to orange-red. */
function blackbody(bv: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [-0.4, [155, 178, 255]],
    [0, [202, 216, 255]],
    [0.4, [248, 247, 255]],
    [0.8, [255, 236, 206]],
    [1.2, [255, 210, 161]],
    [2, [255, 170, 110]],
  ];
  const v = Math.max(-0.4, Math.min(2, bv));
  for (let i = 1; i < stops.length; i++) {
    const [b1, c1] = stops[i]!;
    const [b0, c0] = stops[i - 1]!;
    if (v <= b1) {
      const t = (v - b0) / (b1 - b0);
      return [0, 1, 2].map((k) => c0[k]! + (c1[k]! - c0[k]!) * t) as [number, number, number];
    }
  }
  return stops.at(-1)![1];
}

export function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

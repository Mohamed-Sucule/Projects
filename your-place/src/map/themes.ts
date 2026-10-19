/* The poster styles. Each one is just colours and a few effects; the drawing code is shared. */

export const THEME_IDS = [
  'paper',
  'golden-hour',
  'ink',
  'noir',
  'blueprint',
  'terracotta',
  'sea-glass',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface Theme {
  id: ThemeId;
  name: string;
  /** the poster itself: margins, the band behind the words */
  paper: string;
  land: string;
  /** a painted wash across the land, from the centre out */
  landWash?: [inner: string, outer: string];
  water: string;
  park: string;
  grass: string;
  wood: string;
  sand: string;
  /** buildings are left out when undefined */
  building?: string;
  road: {
    motorway: string;
    primary: string;
    secondary: string;
    tertiary: string;
    minor: string;
    service: string;
    path: string;
  };
  rail?: string;
  /** line weight relative to the default */
  weight: number;
  ink: string;
  inkSoft: string;
  /** light thrown off the streets, as if they were lit */
  glow?: { color: string; alpha: number };
  /** paper grain, 0 to 1 */
  grain: number;
  vignette?: { color: string; alpha: number };
  grid?: { color: string; alpha: number };
}

export const THEMES: Record<ThemeId, Theme> = {
  paper: {
    id: 'paper',
    name: 'Paper',
    paper: '#f4efe6',
    land: '#f4efe6',
    water: '#b7ccd6',
    park: '#dbe2c9',
    grass: '#ebeadb',
    wood: '#d3dcc0',
    sand: '#ede3cc',
    building: '#e6dfd2',
    road: {
      motorway: '#24221f',
      primary: '#2b2926',
      secondary: '#34312d',
      tertiary: '#3d3a35',
      minor: '#4d4943',
      service: '#77716a',
      path: '#958e85',
    },
    rail: '#8f887f',
    weight: 1,
    ink: '#22201d',
    inkSoft: '#5a554e',
    grain: 0.05,
  },
  'golden-hour': {
    id: 'golden-hour',
    name: 'Golden hour',
    paper: '#f3e2cc',
    land: '#eab48e',
    landWash: ['#f7d3a6', '#c47a6c'],
    water: '#4b6b8a',
    park: 'rgba(120, 60, 40, 0.10)',
    grass: 'rgba(120, 60, 40, 0.05)',
    wood: 'rgba(110, 50, 45, 0.15)',
    sand: 'rgba(255, 240, 210, 0.25)',
    road: {
      motorway: '#fff7ea',
      primary: '#fff4e2',
      secondary: '#fff0da',
      tertiary: '#feead0',
      minor: '#fbe2c6',
      service: '#f3d2b4',
      path: '#ebc4a5',
    },
    weight: 1.05,
    ink: '#3d2531',
    inkSoft: '#6e4a55',
    glow: { color: '#ffc982', alpha: 0.5 },
    grain: 0.08,
    vignette: { color: '#5b2f4a', alpha: 0.3 },
  },
  ink: {
    id: 'ink',
    name: 'Ink',
    paper: '#0f0f10',
    land: '#0f0f10',
    water: '#1f2a36',
    park: '#161d17',
    grass: '#141914',
    wood: '#141b15',
    sand: '#1b1a16',
    road: {
      motorway: '#f4f1ea',
      primary: '#ece8e0',
      secondary: '#e3ded5',
      tertiary: '#d6d1c7',
      minor: '#bdb8ae',
      service: '#8a867e',
      path: '#6c6962',
    },
    rail: '#6c6962',
    weight: 0.9,
    ink: '#f4f1ea',
    inkSoft: '#a9a49b',
    grain: 0.04,
  },
  noir: {
    id: 'noir',
    name: 'Noir & gold',
    paper: '#0b0c10',
    land: '#0b0c10',
    water: '#0f1923',
    park: '#10140f',
    grass: '#0e120e',
    wood: '#0f130f',
    sand: '#15130e',
    road: {
      motorway: '#f3cf9f',
      primary: '#ecc08c',
      secondary: '#e2b17d',
      tertiary: '#d4a372',
      minor: '#b98d63',
      service: '#8a6a4c',
      path: '#6b543e',
    },
    weight: 0.95,
    ink: '#e7b98a',
    inkSoft: '#a8865f',
    glow: { color: '#e7a25c', alpha: 0.35 },
    grain: 0.05,
    vignette: { color: '#000000', alpha: 0.5 },
  },
  blueprint: {
    id: 'blueprint',
    name: 'Blueprint',
    paper: '#143a68',
    land: '#143a68',
    water: '#0d2b50',
    park: '#174270',
    grass: '#163f6d',
    wood: '#17426f',
    sand: '#1a4373',
    road: {
      motorway: '#f2f7ff',
      primary: '#e6efff',
      secondary: '#d6e4fb',
      tertiary: '#c3d7f5',
      minor: '#a9c3ea',
      service: '#87a8d6',
      path: '#6e93c6',
    },
    rail: '#87a8d6',
    weight: 0.85,
    ink: '#f2f7ff',
    inkSoft: '#a9c3ea',
    grain: 0.035,
    grid: { color: '#cfe0ff', alpha: 0.09 },
  },
  terracotta: {
    id: 'terracotta',
    name: 'Terracotta',
    paper: '#f1e6d6',
    land: '#f1e6d6',
    water: '#a5bdb5',
    park: '#ded8bc',
    grass: '#ebe2cf',
    wood: '#d8d2b2',
    sand: '#efdcbf',
    building: '#eadbc6',
    road: {
      motorway: '#9e3f1d',
      primary: '#a8461f',
      secondary: '#b24f26',
      tertiary: '#bb5c33',
      minor: '#c47450',
      service: '#cf9171',
      path: '#d9a98d',
    },
    rail: '#c99c84',
    weight: 1,
    ink: '#5a2814',
    inkSoft: '#8c5236',
    grain: 0.06,
  },
  'sea-glass': {
    id: 'sea-glass',
    name: 'Sea glass',
    paper: '#e6f0ea',
    land: '#e6f0ea',
    water: '#8fbfbb',
    park: '#d2e4d3',
    grass: '#dfece2',
    wood: '#cadecb',
    sand: '#ece9d6',
    building: '#d9e6de',
    road: {
      motorway: '#21474c',
      primary: '#28535a',
      secondary: '#2f5d63',
      tertiary: '#3a686d',
      minor: '#4f7c80',
      service: '#76999b',
      path: '#93b0b0',
    },
    rail: '#93b0b0',
    weight: 1,
    ink: '#1f4448',
    inkSoft: '#4f7478',
    grain: 0.045,
  },
};

export const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);

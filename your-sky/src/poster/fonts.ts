import '@fontsource-variable/fraunces';
import '@fontsource-variable/outfit';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

export const FONT_IDS = ['sans', 'serif', 'mono'] as const;
export type FontId = (typeof FONT_IDS)[number];
export const isFontId = (v: unknown): v is FontId =>
  typeof v === 'string' && (FONT_IDS as readonly string[]).includes(v);

export interface PosterFont {
  label: string;
  family: string;
  title: number;
  body: number;
  /** letter spacing of the title, in ems */
  tracking: number;
}

export const FONTS: Record<FontId, PosterFont> = {
  sans: {
    label: 'Modern',
    family: '"Outfit Variable", system-ui, sans-serif',
    title: 600,
    body: 400,
    tracking: 0.34,
  },
  serif: {
    label: 'Classic',
    family: '"Fraunces Variable", Georgia, serif',
    title: 560,
    body: 400,
    tracking: 0.2,
  },
  mono: {
    label: 'Typewriter',
    family: '"IBM Plex Mono", ui-monospace, monospace',
    title: 500,
    body: 400,
    tracking: 0.22,
  },
};

export const COORDS_FAMILY = '"IBM Plex Mono", ui-monospace, monospace';

/** Canvas text only uses a web font once it has loaded, so wait for the ones a poster needs. */
export async function fontsReady(font: FontId): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const f = FONTS[font];
  await Promise.all([
    document.fonts.load(`${f.title} 64px ${f.family}`),
    document.fonts.load(`${f.body} 32px ${f.family}`),
    document.fonts.load(`400 20px ${COORDS_FAMILY}`),
  ]).catch(() => undefined);
}

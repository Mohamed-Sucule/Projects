/* What a poster draws, in drawing order. Kept apart from the decoder so the page can share
   these names without loading the tile parser, which only the worker needs. */

export const FILL_KINDS = ['grass', 'wood', 'park', 'sand', 'water', 'pier', 'building'] as const;
export const LINE_KINDS = [
  'stream',
  'river',
  'path',
  'service',
  'rail',
  'minor',
  'tertiary',
  'secondary',
  'primary',
  'motorway',
  'runway',
] as const;

export type FillKind = (typeof FILL_KINDS)[number];
export type LineKind = (typeof LINE_KINDS)[number];
export type Kind = FillKind | LineKind;

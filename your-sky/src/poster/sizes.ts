/* Poster sizes. Print sizes come out at up to 300 dpi; very large prints are capped so the
   canvas stays within what every browser, including iOS Safari, can allocate. */

export const SIZE_IDS = ['a4', 'a3', 'a2', '50x70', '12x16', '18x24', 'square', 'phone'] as const;
export type SizeId = (typeof SIZE_IDS)[number];
export type Orientation = 'portrait' | 'landscape';

interface PrintSize {
  kind: 'print';
  label: string;
  /** short side and long side in millimetres */
  mm: [number, number];
}
interface ScreenSize {
  kind: 'screen';
  label: string;
  /** width and height in pixels; fixed orientation */
  px: [number, number];
}
export type Size = PrintSize | ScreenSize;

export const SIZES: Record<SizeId, Size> = {
  a4: { kind: 'print', label: 'A4', mm: [210, 297] },
  a3: { kind: 'print', label: 'A3', mm: [297, 420] },
  a2: { kind: 'print', label: 'A2', mm: [420, 594] },
  '50x70': { kind: 'print', label: '50 × 70 cm', mm: [500, 700] },
  '12x16': { kind: 'print', label: '12 × 16 in', mm: [304.8, 406.4] },
  '18x24': { kind: 'print', label: '18 × 24 in', mm: [457.2, 609.6] },
  square: { kind: 'screen', label: 'Square', px: [3000, 3000] },
  phone: { kind: 'screen', label: 'Phone wallpaper', px: [1320, 2868] },
};

export const isSizeId = (v: unknown): v is SizeId =>
  typeof v === 'string' && (SIZE_IDS as readonly string[]).includes(v);

const PRINT_DPI = 300;

/** width / height */
export function aspectOf(id: SizeId, orientation: Orientation): number {
  const size = SIZES[id];
  if (size.kind === 'screen') return size.px[0] / size.px[1];
  const [short, long] = size.mm;
  return orientation === 'portrait' ? short / long : long / short;
}

export const hasOrientation = (id: SizeId) => SIZES[id].kind === 'print';

export interface ExportSize {
  width: number;
  height: number;
  /** null for screen sizes */
  dpi: number | null;
}

/** Pixel size of the downloaded image, within a pixel budget. */
export function exportSize(id: SizeId, orientation: Orientation, maxPixels: number): ExportSize {
  const size = SIZES[id];
  if (size.kind === 'screen') {
    const [w, h] = size.px;
    const k = Math.min(1, Math.sqrt(maxPixels / (w * h)));
    return { width: Math.round(w * k), height: Math.round(h * k), dpi: null };
  }
  const [short, long] = size.mm;
  const [wmm, hmm] = orientation === 'portrait' ? [short, long] : [long, short];
  const inches = (wmm / 25.4) * (hmm / 25.4);
  const dpi = Math.min(PRINT_DPI, Math.floor(Math.sqrt(maxPixels / inches)));
  return {
    width: Math.round((wmm / 25.4) * dpi),
    height: Math.round((hmm / 25.4) * dpi),
    dpi,
  };
}

/** 16.7 million pixels is Safari's canvas ceiling; phones get less room to keep memory sane. */
export function pixelBudget(): number {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 12_000_000 : 16_000_000;
}

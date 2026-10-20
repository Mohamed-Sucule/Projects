/* Text widths, for deciding whether a cell's text fits, runs on into the next cell, or (for a
   number) shows as ###. Measured on a canvas in the grid's own font and cached, because the
   same few hundred strings are asked about on every frame of a scroll. */

export const CELL_FONT =
  '13px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

export function textWidth(text: string, bold = false, italic = false): number {
  const key = `${bold ? 'b' : ''}${italic ? 'i' : ''}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  ctx ??=
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  let w: number;
  if (ctx) {
    ctx.font = `${italic ? 'italic ' : ''}${bold ? '600 ' : ''}${CELL_FONT}`;
    w = ctx.measureText(text).width;
  } else w = text.length * 7;
  if (cache.size > 20_000) cache.clear();
  cache.set(key, w);
  return w;
}

export const fits = (text: string, width: number, bold?: boolean, italic?: boolean) =>
  textWidth(text, bold, italic) <= width;

/* Canvases for drawing off screen: a page canvas where there is a page, else an
   OffscreenCanvas. */

import type { Ctx } from './paint';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof document !== 'undefined') {
    return Object.assign(document.createElement('canvas'), { width, height });
  }
  return new OffscreenCanvas(width, height);
}

export function context2d(
  canvas: AnyCanvas,
  settings?: CanvasRenderingContext2DSettings,
): Ctx | null {
  // one call each, so each gets the right overload
  return 'transferToImageBitmap' in canvas
    ? canvas.getContext('2d', settings)
    : canvas.getContext('2d', settings);
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { compose, wordsOf } from '../poster/compose';
import { fontsReady } from 'poster-kit/fonts';
import { layoutPoster } from '../poster/layout';
import type { Sky } from '../sky/astro';
import type { SkyMap } from '../sky/milkyway';
import { posterAspect, type Poster } from '../state/poster';

interface Props {
  poster: Poster;
  sky: Sky;
  /** the Milky Way's sky map, once loaded */
  map: SkyMap | null;
  /** true while the time is moving: the Milky Way is drawn coarser to keep up */
  moving: boolean;
  /** set while the starting place is still being found */
  waiting: boolean;
  /** what the chart shows, in words */
  label: string;
}

export function SkyPreview({ poster, sky, map, moving, waiting, label }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [fontsIn, setFontsIn] = useState(0);

  // the stage's free space decides how big the poster is drawn
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // canvas text only uses a web font once it has loaded: draw again when it has
  useEffect(() => {
    let live = true;
    void fontsReady(poster.font).then(() => live && setFontsIn((n) => n + 1));
    return () => {
      live = false;
    };
  }, [poster.font]);

  const aspect = posterAspect(poster);
  const css = box
    ? box.w / box.h > aspect
      ? { w: Math.floor(box.h * aspect), h: Math.floor(box.h) }
      : { w: Math.floor(box.w), h: Math.floor(box.w / aspect) }
    : null;
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const pxW = css ? Math.max(1, Math.round(css.w * dpr)) : 0;
  const pxH = css ? Math.max(1, Math.round(css.h * dpr)) : 0;

  // at most one drawing a frame, however fast the poster changes
  useEffect(() => {
    if (!pxW) return;
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const layout = layoutPoster(canvas.width, canvas.height, poster.layout);
      const across = Math.round(layout.chart.r * 2);
      compose(ctx, {
        poster,
        layout,
        sky,
        map,
        glow: Math.min(across, moving ? 220 : 520),
        words: wordsOf(poster),
      });
      canvas.dataset.drawn = String(Number(canvas.dataset.drawn ?? 0) + 1);
      if (map) canvas.dataset.milkyWay = 'true';
    });
    return () => cancelAnimationFrame(frame);
  }, [poster, sky, map, moving, pxW, pxH, fontsIn]);

  return (
    <div ref={boxRef} className="preview">
      {css && (
        <div className="poster" style={{ width: css.w, height: css.h }}>
          <canvas
            ref={canvasRef}
            width={pxW}
            height={pxH}
            role="img"
            aria-label={label}
            data-testid="poster"
          />
          {waiting && (
            <div className="poster-veil" aria-hidden="true">
              <span className="spinner" />
              Finding the sky near you…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

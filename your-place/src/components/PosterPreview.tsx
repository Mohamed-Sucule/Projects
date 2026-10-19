import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MapClient } from '../map/client';
import type { MapJob } from '../map/engine';
import { PRIORITY } from '../map/protocol';
import { panView, zoomViewAt, type View } from '../map/geo';
import { THEMES } from '../map/themes';
import { compose, type Shown } from '../poster/compose';
import { wordsOf } from '../poster/export';
import { fontsReady } from 'poster-kit/fonts';
import { layoutPoster } from '../poster/layout';
import { posterAspect, type Poster } from '../state/poster';

interface Props {
  poster: Poster;
  client: MapClient;
  onView: (view: View, settled: boolean) => void;
  /** set while the starting place is still being found */
  waiting?: boolean;
}

const KEY_STEP = 0.08;

export function PosterPreview({ poster, client, onView, waiting = false }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [missing, setMissing] = useState(0);
  const [hasPicture, setHasPicture] = useState(false);
  const [slow, setSlow] = useState(false);

  // the latest poster, for callbacks that outlive a render; updated before any drawing effect runs
  const posterRef = useRef(poster);
  useLayoutEffect(() => {
    posterRef.current = poster;
  });
  const shown = useRef<Shown | null>(null);
  const wanted = useRef<MapJob | null>(null);
  const busy = useRef(false);

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

  const aspect = posterAspect(poster);
  const css = box
    ? box.w / box.h > aspect
      ? { w: Math.floor(box.h * aspect), h: Math.floor(box.h) }
      : { w: Math.floor(box.w), h: Math.floor(box.w / aspect) }
    : null;
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const px = css
    ? { w: Math.max(1, Math.round(css.w * dpr)), h: Math.max(1, Math.round(css.h * dpr)) }
    : null;
  const hasCanvas = px !== null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const p = posterRef.current;
    compose(ctx, {
      layout: layoutPoster(canvas.width, canvas.height, p.layout),
      theme: THEMES[p.theme],
      view: p.view,
      shown: shown.current,
      words: wordsOf(p),
      font: p.font,
    });
  }, []);

  /* One paint in flight at a time, always for the newest poster: during a drag the map
     updates as fast as the engine can draw, and never falls behind. */
  const pump = useCallback(
    function pump() {
      if (busy.current || !wanted.current) return;
      const job = wanted.current;
      wanted.current = null;
      busy.current = true;
      const slowTimer = setTimeout(() => setSlow(true), 450);
      client
        .paint('preview', job, PRIORITY.preview)
        .then(
          (painted) => {
            if (!painted) return;
            const old = shown.current?.picture;
            shown.current = { picture: painted.picture, job };
            if (old && 'close' in old) old.close();
            setMissing(painted.missing);
            if (canvasRef.current) canvasRef.current.dataset.paintMs = String(painted.ms);
            setFailure(null);
            setHasPicture(true);
            draw();
          },
          (err: unknown) => setFailure(err instanceof Error ? err.message : String(err)),
        )
        .finally(() => {
          clearTimeout(slowTimer);
          setSlow(false);
          busy.current = false;
          pump();
        });
    },
    [client, draw],
  );

  const request = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = posterRef.current;
    wanted.current = {
      view: p.view,
      width: canvas.width,
      height: canvas.height,
      layout: p.layout,
      theme: p.theme,
    };
    pump();
  }, [pump]);

  // redraw at once with what we have, then ask for a fresh map
  useLayoutEffect(() => {
    if (!px || waiting) return;
    draw();
    request();
  }, [px?.w, px?.h, poster.view, poster.theme, poster.layout, waiting, draw, request]); // eslint-disable-line react-hooks/exhaustive-deps

  // words change without a new map
  useLayoutEffect(() => {
    draw();
  }, [poster.title, poster.subtitle, poster.showCoords, poster.font, draw]);

  useEffect(() => {
    let live = true;
    void fontsReady(poster.font).then(() => live && draw());
    return () => {
      live = false;
    };
  }, [poster.font, draw]);

  /* ---- moving the map: drag, pinch, wheel, keys ---- */

  const viewRef = useRef(poster.view);
  useEffect(() => {
    viewRef.current = poster.view;
  }, [poster.view]);

  const move = useCallback(
    (view: View, settled: boolean) => {
      viewRef.current = view;
      onView(view, settled);
    },
    [onView],
  );

  /** pointer position in canvas pixels, relative to the map */
  const locate = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    const k = canvas.width / bounds.width;
    const map = layoutPoster(canvas.width, canvas.height, posterRef.current.layout).map;
    return {
      x: (clientX - bounds.left) * k - map.x,
      y: (clientY - bounds.top) * k - map.y,
      k,
      map,
    };
  };

  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    try {
      // keep receiving moves when the finger leaves the poster; a nicety, never a requirement
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const all = pointers.current;
    const prev = all.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (all.size === 1) {
      const { k, map } = locate(next.x, next.y);
      move(panView(viewRef.current, (next.x - prev.x) * k, (next.y - prev.y) * k, map.w), false);
    } else if (all.size === 2) {
      const other = [...all.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (!other) return;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      const mid = locate((next.x + other.x) / 2, (next.y + other.y) / 2);
      const pinched = zoomViewAt(
        viewRef.current,
        Math.log2(after / Math.max(1, before)),
        mid.x,
        mid.y,
        mid.map,
      );
      move(
        panView(
          pinched,
          ((next.x - prev.x) / 2) * mid.k,
          ((next.y - prev.y) / 2) * mid.k,
          mid.map.w,
        ),
        false,
      );
    }
    all.set(e.pointerId, next);
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size === 0) move(viewRef.current, true);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0022;
      const delta = Math.max(-0.6, Math.min(0.6, -e.deltaY * scale * (e.ctrlKey ? 2.5 : 1)));
      const at = locate(e.clientX, e.clientY);
      move(zoomViewAt(viewRef.current, delta, at.x, at.y, at.map), false);
      clearTimeout(timer);
      timer = setTimeout(() => move(viewRef.current, true), 220);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      clearTimeout(timer);
    };
    // the canvas only exists once the stage has been measured
  }, [move, hasCanvas]);

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const at = locate(e.clientX, e.clientY);
    move(zoomViewAt(viewRef.current, e.shiftKey ? -1 : 1, at.x, at.y, at.map), true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const map = layoutPoster(canvas.width, canvas.height, posterRef.current.layout).map;
    const step = (e.shiftKey ? KEY_STEP / 4 : KEY_STEP) * map.w;
    const v = viewRef.current;
    const moves: Record<string, () => View> = {
      ArrowLeft: () => panView(v, step, 0, map.w),
      ArrowRight: () => panView(v, -step, 0, map.w),
      ArrowUp: () => panView(v, 0, step, map.w),
      ArrowDown: () => panView(v, 0, -step, map.w),
      '+': () => zoomViewAt(v, 0.5, map.w / 2, map.h / 2, map),
      '=': () => zoomViewAt(v, 0.5, map.w / 2, map.h / 2, map),
      '-': () => zoomViewAt(v, -0.5, map.w / 2, map.h / 2, map),
      _: () => zoomViewAt(v, -0.5, map.w / 2, map.h / 2, map),
    };
    const next = moves[e.key];
    if (!next || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    move(next(), true);
  };

  const label = [
    `Poster of ${poster.title || 'an untitled place'}`,
    poster.subtitle,
    `${THEMES[poster.theme].name} style`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="preview" ref={boxRef}>
      {css && px && (
        <div className="poster" style={{ width: css.w, height: css.h }}>
          <canvas
            ref={canvasRef}
            width={px.w}
            height={px.h}
            role="img"
            aria-label={label}
            aria-describedby="map-hint"
            tabIndex={0}
            data-testid="poster"
            data-ready={hasPicture && !waiting ? 'true' : 'false'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onDoubleClick={onDoubleClick}
            onKeyDown={onKeyDown}
          />
          {(!hasPicture || waiting) && !failure && (
            <div className="poster-veil" aria-hidden="true">
              <span className="spinner" />
              <span>{waiting ? 'Finding somewhere near you…' : 'Drawing the streets…'}</span>
            </div>
          )}
          {hasPicture && slow && !failure && (
            <div className="poster-chip" role="status">
              <span className="spinner small" /> Drawing…
            </div>
          )}
          {failure && (
            <div className="poster-veil error" role="alert">
              <strong>The map didn’t load.</strong>
              <span>{failure}</span>
              <button type="button" className="button" onClick={request}>
                Try again
              </button>
            </div>
          )}
          {!failure && missing > 0 && (
            <div className="poster-chip warn" role="status">
              Part of the map didn’t load.{' '}
              <button type="button" className="link" onClick={request}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

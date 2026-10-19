import { memo, useEffect, useRef } from 'react';
import { compose } from '../poster/compose';
import { layoutPoster, type LayoutId } from '../poster/layout';
import type { Sky } from '../sky/astro';
import type { SkyMap } from '../sky/milkyway';
import { THEMES, THEME_IDS, type ThemeId } from '../sky/themes';
import { DEFAULT_POSTER, type Poster } from '../state/poster';

interface Props {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
  show: Poster['show'];
  font: Poster['font'];
  sky: Sky;
  map: SkyMap | null;
  layout: LayoutId;
  aspect: number;
  /** false while the time is being scrubbed: the thumbnails catch up when it stops */
  settled: boolean;
}

const THUMB_WIDTH = 72;

/** The styles as a set of radio buttons, each showing your own sky in that style. */
export const StylePicker = memo(function StylePicker({ value, onChange, ...rest }: Props) {
  return (
    <div className="styles" role="radiogroup" aria-label="Style">
      {THEME_IDS.map((id) => (
        <label key={id} className="style" data-active={id === value}>
          <input
            type="radio"
            name="style"
            value={id}
            checked={id === value}
            onChange={() => onChange(id)}
            className="sr-only-input"
          />
          <Thumb id={id} {...rest} />
          <span className="style-name">{THEMES[id].name}</span>
        </label>
      ))}
    </div>
  );
});

function Thumb({
  id,
  show,
  font,
  sky,
  map,
  layout,
  aspect,
  settled,
}: { id: ThemeId } & Omit<Props, 'value' | 'onChange'>) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const width = Math.round(THUMB_WIDTH * dpr);
  const height = Math.round((THUMB_WIDTH / aspect) * dpr);

  useEffect(() => {
    if (!settled) return;
    // let the poster itself go first, then fill in the thumbnails
    const timer = setTimeout(() => {
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const shape = layoutPoster(width, height, layout);
      compose(ctx, {
        // too small for names or a grid to read
        poster: {
          ...DEFAULT_POSTER,
          theme: id,
          font,
          show: { ...show, names: false, grid: false },
        },
        layout: shape,
        sky,
        map,
        glow: Math.round(shape.chart.r * 2),
        words: null,
      });
      canvas.dataset.ready = 'true';
    }, 300);
    return () => clearTimeout(timer);
  }, [id, show, font, sky, map, layout, width, height, settled]);

  return (
    <span className="style-thumb" style={{ background: THEMES[id].paper }}>
      <canvas ref={ref} width={width} height={height} aria-hidden="true" />
    </span>
  );
}

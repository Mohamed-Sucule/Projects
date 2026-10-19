import { memo, useEffect, useRef } from 'react';
import type { MapClient } from '../map/client';
import { PRIORITY } from '../map/protocol';
import type { View } from '../map/geo';
import { THEMES, THEME_IDS, type ThemeId } from '../map/themes';
import { compose } from '../poster/compose';
import { layoutPoster, type LayoutId } from '../poster/layout';

interface Props {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
  client: MapClient;
  view: View;
  layout: LayoutId;
  aspect: number;
  /** false while the map is being dragged: the thumbnails wait until it stops */
  settled: boolean;
}

const THUMB_WIDTH = 84;

/** The styles as a set of radio buttons, each showing your own place in that style. */
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
  client,
  view,
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
    let live = true;
    // let the main poster go first, then fill in the thumbnails
    const timer = setTimeout(() => {
      const job = { view, width, height, layout, theme: id, lite: true };
      client.paint(`swatch:${id}`, job, PRIORITY.swatch).then(
        (painted) => {
          const canvas = ref.current;
          const ctx = canvas?.getContext('2d');
          if (!painted || !live || !canvas || !ctx) return;
          compose(ctx, {
            layout: layoutPoster(width, height, layout),
            theme: THEMES[id],
            view,
            shown: { picture: painted.picture, job },
            words: null,
            font: 'sans',
          });
          if ('close' in painted.picture) painted.picture.close();
          canvas.dataset.ready = 'true';
        },
        () => undefined, // a thumbnail that fails just stays blank; the main poster reports errors
      );
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, id, view, layout, width, height, settled]);

  return (
    <span className="style-thumb" style={{ background: THEMES[id].paper }}>
      <canvas ref={ref} width={width} height={height} aria-hidden="true" />
    </span>
  );
}

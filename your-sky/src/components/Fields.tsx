import { memo, useId } from 'react';
import { FONTS, FONT_IDS, type FontId } from '../poster/fonts';
import { LAYOUT_IDS, type LayoutId } from '../poster/layout';
import {
  SIZES,
  SIZE_IDS,
  exportSize,
  hasOrientation,
  type Orientation,
  type SizeId,
} from '../poster/sizes';
import { MAX_SUBTITLE, MAX_TITLE, type Action, type Poster, type Show } from '../state/poster';

type Dispatch = (action: Action) => void;

export const WordsFields = memo(function WordsFields({
  title,
  subtitle,
  showWhen,
  showCoords,
  font,
  dispatch,
}: Pick<Poster, 'title' | 'subtitle' | 'showWhen' | 'showCoords' | 'font'> & {
  dispatch: Dispatch;
}) {
  const id = useId();
  return (
    <div className="fields">
      <div className="field">
        <label htmlFor={`${id}-title`}>Title</label>
        <input
          id={`${id}-title`}
          type="text"
          value={title}
          maxLength={MAX_TITLE}
          placeholder="A name, a message, a day to remember…"
          onChange={(e) => dispatch({ type: 'title', value: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-subtitle`}>Line below</label>
        <input
          id={`${id}-subtitle`}
          type="text"
          value={subtitle}
          maxLength={MAX_SUBTITLE}
          placeholder="A place, two names…"
          onChange={(e) => dispatch({ type: 'subtitle', value: e.target.value })}
        />
      </div>
      <div className="checks">
        <label className="check">
          <input
            type="checkbox"
            checked={showWhen}
            onChange={(e) => dispatch({ type: 'showWhen', value: e.target.checked })}
          />
          Date and time
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showCoords}
            onChange={(e) => dispatch({ type: 'coords', value: e.target.checked })}
          />
          Coordinates
        </label>
      </div>
      <Choice
        legend="Lettering"
        name="font"
        value={font}
        options={FONT_IDS.map((f) => ({
          value: f,
          label: FONTS[f].label,
          sample: (
            <span style={{ fontFamily: FONTS[f].family, fontWeight: FONTS[f].title }}>Aa</span>
          ),
        }))}
        onChange={(value: FontId) => dispatch({ type: 'font', value })}
      />
    </div>
  );
});

const SHOW_LABEL: Record<keyof Show, string> = {
  lines: 'Constellation lines',
  names: 'Names',
  milkyWay: 'The Milky Way',
  grid: 'Grid and ecliptic',
};

export const ChartFields = memo(function ChartFields({
  show,
  dispatch,
}: {
  show: Show;
  dispatch: Dispatch;
}) {
  return (
    <fieldset className="choice">
      <legend>On the chart</legend>
      <div className="checks">
        {(Object.keys(SHOW_LABEL) as (keyof Show)[]).map((key) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={show[key]}
              onChange={(e) => dispatch({ type: 'show', key, value: e.target.checked })}
            />
            {SHOW_LABEL[key]}
          </label>
        ))}
      </div>
    </fieldset>
  );
});

const LAYOUT_LABEL: Record<LayoutId, string> = { clean: 'Clean', framed: 'With a border' };

export const SizeFields = memo(function SizeFields({
  size,
  orientation,
  layout,
  dispatch,
}: Pick<Poster, 'size' | 'orientation' | 'layout'> & { dispatch: Dispatch }) {
  const id = useId();
  const print = SIZE_IDS.filter((s) => SIZES[s].kind === 'print');
  const screen = SIZE_IDS.filter((s) => SIZES[s].kind === 'screen');
  return (
    <div className="fields">
      <div className="field">
        <label htmlFor={`${id}-size`}>Size</label>
        <select
          id={`${id}-size`}
          value={size}
          onChange={(e) => dispatch({ type: 'size', value: e.target.value as SizeId })}
        >
          <optgroup label="To print">
            {print.map((s) => (
              <option key={s} value={s}>
                {SIZES[s].label}
              </option>
            ))}
          </optgroup>
          <optgroup label="For screens">
            {screen.map((s) => (
              <option key={s} value={s}>
                {SIZES[s].label}
              </option>
            ))}
          </optgroup>
        </select>
        <SizeNote size={size} orientation={orientation} />
      </div>
      {hasOrientation(size) && (
        <Choice
          legend="Orientation"
          name="orientation"
          value={orientation}
          options={[
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' },
          ]}
          onChange={(value: Orientation) => dispatch({ type: 'orientation', value })}
        />
      )}
      <Choice
        legend="Layout"
        name="layout"
        value={layout}
        options={LAYOUT_IDS.map((l) => ({ value: l, label: LAYOUT_LABEL[l] }))}
        onChange={(value: LayoutId) => dispatch({ type: 'layout', value })}
      />
    </div>
  );
});

function SizeNote({ size, orientation }: { size: SizeId; orientation: Orientation }) {
  const out = exportSize(size, orientation, 16_000_000);
  return (
    <p className="field-note">
      {out.width.toLocaleString()} × {out.height.toLocaleString()} px
      {out.dpi ? ` · ${out.dpi} dpi` : ''}
    </p>
  );
}

interface ChoiceProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string; sample?: React.ReactNode }[];
  onChange: (value: T) => void;
}

/** A row of segmented buttons that are, underneath, plain radio inputs. */
function Choice<T extends string>({ legend, name, value, options, onChange }: ChoiceProps<T>) {
  const id = useId();
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      <div className="segments">
        {options.map((o) => (
          <label key={o.value} className="segment" data-active={o.value === value}>
            <input
              className="sr-only-input"
              type="radio"
              name={`${id}-${name}`}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            {o.sample && <span className="segment-sample">{o.sample}</span>}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

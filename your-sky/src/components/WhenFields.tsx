import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { sunAltitudes } from '../sky/astro';
import {
  MAX_YEAR,
  MIN_YEAR,
  NIGHT_MINUTES,
  formatOffset,
  fromNight,
  nightOf,
  toInstant,
  toLocal,
  type LocalTime,
} from '../sky/time';
import type { Action, Spot } from '../state/poster';
import { Icon } from 'poster-kit/Icon';

interface Props {
  when: LocalTime;
  place: Spot;
  zone: string;
  at: Date;
  dispatch: (action: Action) => void;
  /** the slider moving, or the night playing: `settled` once it stops */
  onScrub: (value: LocalTime, settled: boolean) => void;
}

/** How long playing through a whole night takes, in seconds. */
const NIGHT_SECONDS = 18;
const STEP = 10;

export const WhenFields = memo(function WhenFields({
  when,
  place,
  zone,
  at,
  dispatch,
  onScrub,
}: Props) {
  const id = useId();
  const night = nightOf(when) ?? { evening: when.date, minute: 600 };
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const shade = useNightShade(place.lat, place.lon, zone, night.evening);

  // playing: move the clock on every frame, and stop at the end of the night
  const position = useRef(night.minute);
  useEffect(() => {
    if (!dragging && !playing) position.current = night.minute;
  });
  useEffect(() => {
    if (!playing) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const perMs = NIGHT_MINUTES / (NIGHT_SECONDS * 1000);
    let last = performance.now();
    let frame = 0;
    let stepped = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      stepped += dt;
      // with reduced motion, move in quarter hours twice a second instead of gliding
      if (reduced && stepped < 500) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const advance = reduced ? 15 : dt * perMs;
      stepped = 0;
      const next = Math.min(NIGHT_MINUTES - 1, position.current + advance);
      position.current = next;
      const done = next >= NIGHT_MINUTES - 1;
      onScrub(fromNight(night.evening, next), done);
      if (done) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, night.evening, onScrub]);

  const stop = () => {
    setPlaying(false);
    onScrub(fromNight(night.evening, position.current), true);
  };

  const togglePlay = () => {
    if (playing) return stop();
    if (position.current >= NIGHT_MINUTES - STEP) position.current = 0;
    setPlaying(true);
  };

  const valueText = (minute: number) => {
    const t = fromNight(night.evening, minute);
    const day = new Intl.DateTimeFormat(undefined, {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${t.date}T12:00:00Z`));
    return `${t.time}, ${day}`;
  };

  return (
    <div className="fields">
      <div className="when-row">
        <div className="field">
          <label htmlFor={`${id}-date`}>Date</label>
          <input
            id={`${id}-date`}
            type="date"
            min={`${MIN_YEAR}-01-01`}
            max={`${MAX_YEAR}-12-31`}
            value={when.date}
            onChange={(e) => {
              if (e.target.value)
                dispatch({ type: 'when', value: { ...when, date: e.target.value } });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-time`}>Time</label>
          <input
            id={`${id}-time`}
            type="time"
            value={when.time}
            onChange={(e) => {
              if (e.target.value) {
                dispatch({ type: 'when', value: { ...when, time: e.target.value.slice(0, 5) } });
              }
            }}
          />
        </div>
      </div>
      <p className="field-note when-note">
        <span>
          Clock time in {place.name || 'this place'} ({formatOffset(at, zone)})
        </span>
        <button
          type="button"
          className="link"
          onClick={() => {
            setPlaying(false);
            dispatch({ type: 'when', value: toLocal(new Date(), zone), settled: true });
          }}
        >
          Right now
        </button>
      </p>

      <div className="night">
        <div className="night-head">
          <label htmlFor={`${id}-night`}>Through the night</label>
          <button
            type="button"
            className="icon-button play"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play the night'}
            aria-pressed={playing}
            title={playing ? 'Pause' : 'Play the night'}
          >
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
        </div>
        <input
          id={`${id}-night`}
          className="night-range"
          type="range"
          min={0}
          max={NIGHT_MINUTES - 1}
          step={STEP}
          value={Math.round(night.minute)}
          style={{ background: shade }}
          aria-valuetext={valueText(night.minute)}
          onPointerDown={() => {
            setPlaying(false);
            setDragging(true);
          }}
          onChange={(e) => {
            const minute = Number(e.target.value);
            position.current = minute;
            onScrub(fromNight(night.evening, minute), false);
          }}
          // the whole move, by pointer or by keys, is one step to undo
          onPointerUp={() => {
            setDragging(false);
            onScrub(fromNight(night.evening, position.current), true);
          }}
          onKeyUp={() => onScrub(fromNight(night.evening, position.current), true)}
          onBlur={() => onScrub(fromNight(night.evening, position.current), true)}
        />
        <div className="night-scale" aria-hidden="true">
          <span>Noon</span>
          <span>6 pm</span>
          <span>Midnight</span>
          <span>6 am</span>
          <span>Noon</span>
        </div>
      </div>
    </div>
  );
});

/* The slider's track shows the real night at the place: daylight, the three twilights, and
   full dark, from the Sun's height every ten minutes. */
function useNightShade(lat: number, lon: number, zone: string, evening: string): string {
  return useMemo(() => {
    const start = toInstant({ date: evening, time: '12:00' }, zone);
    if (!start) return '';
    const n = 145;
    const alts = sunAltitudes(lat, lon, start.getTime(), 600_000, n);
    const stops: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = alts[i]!;
      const colour =
        a > 0
          ? 'var(--day)'
          : a > -6
            ? 'var(--civil)'
            : a > -12
              ? 'var(--nautical)'
              : a > -18
                ? 'var(--astro)'
                : 'var(--dark)';
      stops.push(`${colour} ${((i / (n - 1)) * 100).toFixed(2)}%`);
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }, [lat, lon, zone, evening]);
}

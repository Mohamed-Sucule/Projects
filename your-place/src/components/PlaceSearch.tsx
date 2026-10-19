import { useEffect, useId, useRef, useState } from 'react';
import { placeAt, searchPlaces, type Place } from '../places/photon';
import { Icon } from './Icon';

interface Props {
  /** the place on the poster, shown in the box until someone types */
  current: string;
  near: { lon: number; lat: number };
  onPick: (place: Place) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string };

/** A combobox in the WAI-ARIA pattern: type, arrow through suggestions, Enter to choose. */
export function PlaceSearch({ current, near, onPick }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [locating, setLocating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nearRef = useRef(near);
  useEffect(() => {
    nearRef.current = near;
  }, [near]);

  const q = query.trim();
  const searchable = editing && q.length >= 2;

  useEffect(() => {
    if (!searchable) return;
    const ctrl = new AbortController();
    // wait for a pause in typing; a newer query cancels the older request outright
    const timer = setTimeout(() => {
      setStatus({ kind: 'searching' });
      searchPlaces(q, ctrl.signal, nearRef.current).then(
        (places) => {
          setResults(places);
          setActive(places.length ? 0 : -1);
          setOpen(true);
          setStatus({ kind: 'done', count: places.length });
        },
        (err: unknown) => {
          if (ctrl.signal.aborted) return;
          setResults([]);
          setStatus({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Search failed',
          });
          setOpen(true);
        },
      );
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, searchable]);

  // what is on screen: nothing to show until there is something to search for
  const shown = searchable ? results : [];
  const shownStatus: Status = searchable || status.kind === 'error' ? status : { kind: 'idle' };

  const choose = (place: Place) => {
    onPick(place);
    setStatus({ kind: 'idle' });
    setEditing(false);
    setQuery('');
    setOpen(false);
    setResults([]);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setOpen(true);
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + dir + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const pick = results[active];
      if (open && pick) {
        e.preventDefault();
        choose(pick);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else {
        setEditing(false);
        setQuery('');
      }
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    setStatus({ kind: 'searching' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        placeAt(coords.longitude, coords.latitude)
          .then((place) => {
            if (!place) throw new Error('Nothing found at your location');
            // centre on where you are, not on the middle of the town you are in
            choose({
              ...place,
              lon: coords.longitude,
              lat: coords.latitude,
              bbox: null,
              kind: 'house',
            });
            setStatus({ kind: 'idle' });
          })
          .catch((err: unknown) =>
            setStatus({
              kind: 'error',
              message: err instanceof Error ? err.message : 'Could not find you',
            }),
          )
          .finally(() => setLocating(false));
      },
      (err) => {
        setLocating(false);
        setStatus({
          kind: 'error',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location is turned off for this site'
              : 'Could not find you',
        });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const expanded =
    open &&
    editing &&
    (shown.length > 0 || shownStatus.kind === 'error' || shownStatus.kind === 'done');
  const announcement =
    shownStatus.kind === 'searching'
      ? 'Searching…'
      : shownStatus.kind === 'done'
        ? shownStatus.count
          ? `${shownStatus.count} place${shownStatus.count === 1 ? '' : 's'} found. Use up and down to choose.`
          : 'No places found'
        : shownStatus.kind === 'error'
          ? shownStatus.message
          : '';

  return (
    <div className="search">
      <div className="search-row">
        <Icon name="search" className="search-icon" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          className="search-input"
          type="text"
          role="combobox"
          aria-label="Search for a place"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="A city, a street, an address…"
          value={editing ? query : current}
          onFocus={(e) => {
            if (!editing) {
              setEditing(true);
              setQuery('');
            }
            e.currentTarget.select();
          }}
          onBlur={() => {
            setOpen(false);
            if (!query.trim()) setEditing(false);
          }}
          onChange={(e) => {
            setEditing(true);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {(shownStatus.kind === 'searching' || locating) && (
          <span className="spinner small" aria-hidden="true" />
        )}
        <button
          type="button"
          className="icon-button"
          onClick={locate}
          disabled={locating}
          title="Use my location"
          aria-label="Use my location"
        >
          <Icon name="locate" />
        </button>
      </div>
      <ul id={listId} role="listbox" className="search-list" hidden={!expanded} aria-label="Places">
        {shown.map((place, i) => (
          <li
            key={place.id}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === active}
            className="search-option"
            // mousedown, not click: the input's blur would close the list first
            onMouseDown={(e) => {
              e.preventDefault();
              choose(place);
            }}
            onMouseEnter={() => setActive(i)}
          >
            <span className="search-name">{place.name}</span>
            {place.context && <span className="search-context">{place.context}</span>}
          </li>
        ))}
        {shownStatus.kind === 'done' && shownStatus.count === 0 && (
          <li className="search-empty" role="presentation">
            Nothing by that name. Try a nearby town, or check the spelling.
          </li>
        )}
        {shownStatus.kind === 'error' && (
          <li className="search-empty error" role="presentation">
            {shownStatus.message}
          </li>
        )}
      </ul>
      {shownStatus.kind === 'error' && !expanded && (
        <p className="field-note error">{shownStatus.message}</p>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

import { useCallback, useEffect, useReducer, useState } from 'react';
import { Downloads } from './components/Downloads';
import { SizeFields, WordsFields } from './components/Fields';
import { Icon } from 'poster-kit/Icon';
import { PlaceSearch } from 'poster-kit/PlaceSearch';
import { PosterPreview } from './components/PosterPreview';
import { StylePicker } from './components/StylePicker';
import { mapClient } from './map/client';
import type { View } from './map/geo';
import type { ThemeId } from './map/themes';
import { cityFromTimeZone, searchPlaces, type Place } from 'poster-kit/photon';
import { hereOnTheMap, viewForPlace } from './places/view';
import { canRedo, canUndo, initHistory, withHistory, type HistoryAction } from 'poster-kit/history';
import {
  DEFAULT_POSTER,
  groupKey,
  posterAspect,
  reducePoster,
  type Action,
  type Poster,
} from './state/poster';
import { fromSearch, toSearch } from './state/url';

const reducer = withHistory(reducePoster);

/** Set when the app is built into the portfolio, so there is a way back to the front page. */
const PORTFOLIO_URL = import.meta.env.VITE_PORTFOLIO_URL as string | undefined;

function initialPoster(): { poster: Poster; fromLink: boolean } {
  const linked = fromSearch(location.search, DEFAULT_POSTER);
  return linked ? { poster: linked, fromLink: true } : { poster: DEFAULT_POSTER, fromLink: false };
}

export function App() {
  const [{ poster: first, fromLink }] = useState(initialPoster);
  const [history, send] = useReducer(reducer, first, initHistory);
  const [waiting, setWaiting] = useState(!fromLink);
  const [settled, setSettled] = useState(true);
  const client = mapClient();
  const poster = history.present;

  const dispatch = useCallback(
    (action: Action) => send({ type: 'do', action, group: groupKey(action) }),
    [],
  );

  const onView = useCallback((view: View, isSettled: boolean) => {
    setSettled(isSettled);
    send({ type: 'do', action: { type: 'view', view, settled: isSettled }, settled: isSettled });
  }, []);

  const pickPlace = useCallback(
    (place: Place, aspect: number) =>
      dispatch({
        type: 'place',
        view: viewForPlace(place, aspect),
        title: place.title,
        subtitle: place.subtitle,
      }),
    [dispatch],
  );

  // with no poster in the link, start somewhere near the visitor, guessed from their time zone
  useEffect(() => {
    if (fromLink) return;
    const ctrl = new AbortController();
    let disposed = false;
    const city = cityFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const giveUp = setTimeout(() => ctrl.abort(), 2500);
    (city ? searchPlaces(city, ctrl.signal) : Promise.resolve([]))
      .then((places) => {
        const place = places.find((p) => ['city', 'town', 'village'].includes(p.kind)) ?? places[0];
        if (place) {
          const start = reducePoster(DEFAULT_POSTER, {
            type: 'place',
            view: viewForPlace(place, posterAspect(DEFAULT_POSTER)),
            title: place.title,
            subtitle: place.subtitle,
          });
          send({ type: 'reset', present: start });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(giveUp);
        if (!disposed) setWaiting(false);
      });
    return () => {
      disposed = true;
      ctrl.abort();
    };
  }, [fromLink]);

  // the address always describes the poster on screen, so it can be shared or bookmarked
  useEffect(() => {
    if (waiting) return;
    const timer = setTimeout(() => window.history.replaceState(null, '', toSearch(poster)), 250);
    return () => clearTimeout(timer);
  }, [poster, waiting]);

  useEffect(() => {
    document.title = poster.title ? `${poster.title} · Your Place` : 'Your Place';
  }, [poster.title]);

  // undo and redo from the keyboard, except inside text fields, which have their own
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      const msg: HistoryAction<Action, Poster> | null =
        key === 'z'
          ? { type: e.shiftKey ? 'redo' : 'undo' }
          : key === 'y'
            ? { type: 'redo' }
            : null;
      if (!msg) return;
      e.preventDefault();
      send(msg);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const aspect = posterAspect(poster);
  const onTheme = useCallback((value: ThemeId) => dispatch({ type: 'theme', value }), [dispatch]);

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="./" aria-label="Your Place, start again">
          <Icon name="pin" />
          <span>Your Place</span>
        </a>
        <p className="tagline">Any place on Earth, as a poster.</p>
        <div className="top-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => send({ type: 'undo' })}
            disabled={!canUndo(history)}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Icon name="undo" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => send({ type: 'redo' })}
            disabled={!canRedo(history)}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Icon name="redo" />
          </button>
          <a
            className="icon-button"
            href="https://github.com/Mohamed-Sucule/Projects/tree/main/your-place"
            aria-label="Source code on GitHub"
          >
            <Icon name="github" />
          </a>
        </div>
      </header>

      <main className="studio">
        <section className="stage" aria-label="Your poster">
          <PosterPreview poster={poster} client={client} onView={onView} waiting={waiting} />
          <p id="map-hint" className="hint">
            <span className="hint-mouse">
              Drag to move the map, scroll to zoom. With the poster selected, the arrow keys and +
              and − work too.
            </span>
            <span className="hint-touch">Drag to move the map, pinch to zoom.</span>
          </p>
        </section>

        <aside className="panel" aria-label="Make it yours">
          <section className="step">
            <h2>
              <span className="step-n">1</span> Where
            </h2>
            <PlaceSearch
              current={poster.title}
              near={poster.view}
              onPick={(p) => pickPlace(p, aspect)}
              placeholder="A city, a street, an address…"
              here={hereOnTheMap}
            />
          </section>
          <section className="step">
            <h2>
              <span className="step-n">2</span> Style
            </h2>
            <StylePicker
              value={poster.theme}
              onChange={onTheme}
              client={client}
              view={poster.view}
              layout={poster.layout}
              aspect={aspect}
              settled={settled && !waiting}
            />
          </section>
          <section className="step">
            <h2>
              <span className="step-n">3</span> Words
            </h2>
            <WordsFields
              title={poster.title}
              subtitle={poster.subtitle}
              showCoords={poster.showCoords}
              font={poster.font}
              dispatch={dispatch}
            />
          </section>
          <section className="step">
            <h2>
              <span className="step-n">4</span> Size
            </h2>
            <SizeFields
              size={poster.size}
              orientation={poster.orientation}
              layout={poster.layout}
              dispatch={dispatch}
            />
          </section>
          <section className="step save">
            <Downloads poster={poster} client={client} />
          </section>
        </aside>
      </main>

      <footer className="foot">
        <p>
          Map data ©{' '}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, tiles by{' '}
          <a href="https://openfreemap.org">OpenFreeMap</a> in the{' '}
          <a href="https://openmaptiles.org">OpenMapTiles</a> schema, place search by{' '}
          <a href="https://photon.komoot.io">Photon</a>. Nothing you make here leaves your browser.
        </p>
        {PORTFOLIO_URL && (
          <p>
            Made by Mohamed Sucule. <a href={PORTFOLIO_URL}>See the rest of my work</a>.
          </p>
        )}
      </footer>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Downloads } from './components/Downloads';
import { ChartFields, SizeFields, WordsFields } from './components/Fields';
import { Icon } from 'poster-kit/Icon';
import { PlaceSearch } from 'poster-kit/PlaceSearch';
import { SkyPreview } from './components/SkyPreview';
import { StylePicker } from './components/StylePicker';
import { WhenFields } from './components/WhenFields';
import { cityFromTimeZone, searchPlaces, type Place } from 'poster-kit/photon';
import { momentAt } from './poster/compose';
import { describeSky } from './sky/describe';
import { loadSkyMap, type SkyMap } from './sky/milkyway';
import type { ThemeId } from './sky/themes';
import { formatWhen, toLocal, zoneAt, type LocalTime } from './sky/time';
import { canRedo, canUndo, initHistory, withHistory, type HistoryAction } from 'poster-kit/history';
import {
  DEFAULT_POSTER,
  groupKey,
  posterAspect,
  reducePoster,
  type Action,
  type Poster,
  type Spot,
} from './state/poster';
import { fromSearch, toSearch } from './state/url';

const reducer = withHistory(reducePoster);

/** Set when the app is built into the portfolio, so there is a way back to the front page. */
const PORTFOLIO_URL = import.meta.env.VITE_PORTFOLIO_URL as string | undefined;

const spotOf = (place: Place): Spot => ({
  name: place.title,
  context: place.subtitle,
  lat: place.lat,
  lon: place.lon,
});

/** Tonight at ten, on the clocks at the place. */
function tonight(lat: number, lon: number): LocalTime {
  return { date: toLocal(new Date(), zoneAt(lat, lon)).date, time: '22:00' };
}

function initialPoster(): { poster: Poster; fromLink: boolean } {
  const linked = fromSearch(location.search, DEFAULT_POSTER);
  if (linked) return { poster: linked, fromLink: true };
  const { lat, lon } = DEFAULT_POSTER.place;
  return { poster: { ...DEFAULT_POSTER, when: tonight(lat, lon) }, fromLink: false };
}

export function App() {
  const [{ poster: first, fromLink }] = useState(initialPoster);
  const [history, send] = useReducer(reducer, first, initHistory);
  const [waiting, setWaiting] = useState(!fromLink);
  const [moving, setMoving] = useState(false);
  const [map, setMap] = useState<SkyMap | null>(null);
  const poster = history.present;

  const dispatch = useCallback(
    (action: Action) => send({ type: 'do', action, group: groupKey(action) }),
    [],
  );

  const onScrub = useCallback((value: LocalTime, settled: boolean) => {
    setMoving(!settled);
    send({ type: 'do', action: { type: 'when', value, settled }, settled });
  }, []);

  const pickPlace = useCallback(
    (place: Place) => dispatch({ type: 'place', place: spotOf(place) }),
    [dispatch],
  );

  // the Milky Way's map of the sky comes in its own file; the chart is drawn without it until then
  useEffect(() => {
    let live = true;
    loadSkyMap().then(
      (m) => live && setMap(m),
      () => undefined, // without it the chart is still right, just without the glow
    );
    return () => {
      live = false;
    };
  }, []);

  // with no sky in the link, start somewhere near the visitor, guessed from their time zone
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
          const start = reducePoster(DEFAULT_POSTER, { type: 'place', place: spotOf(place) });
          send({
            type: 'reset',
            present: { ...start, when: tonight(place.lat, place.lon) },
          });
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
    const name = poster.title || poster.place.name;
    document.title = name ? `${name} · Your Sky` : 'Your Sky';
  }, [poster.title, poster.place.name]);

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

  const { lat, lon } = poster.place;
  const { date, time } = poster.when;
  const moment = useMemo(() => momentAt(lat, lon, { date, time }), [lat, lon, date, time]);
  const description = useMemo(() => describeSky(moment.sky), [moment]);
  const label = `Star chart: the sky over ${poster.place.name || 'this place'} at ${formatWhen(poster.when)}. ${description.text}`;
  const aspect = posterAspect(poster);
  const onTheme = useCallback((value: ThemeId) => dispatch({ type: 'theme', value }), [dispatch]);

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="./" aria-label="Your Sky, start again">
          <Icon name="star" />
          <span>Your Sky</span>
        </a>
        <p className="tagline">The stars over any place, on any night.</p>
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
            href="https://github.com/Mohamed-Sucule/Projects/tree/main/your-sky"
            aria-label="Source code on GitHub"
          >
            <Icon name="github" />
          </a>
        </div>
      </header>

      <main className="studio">
        <section className="stage" aria-label="Your poster">
          <SkyPreview
            poster={poster}
            sky={moment.sky}
            map={map}
            moving={moving}
            waiting={waiting}
            label={label}
          />
          <Sights description={description} />
        </section>

        <aside className="panel" aria-label="Make it yours">
          <section className="step">
            <h2>
              <span className="step-n">1</span> Where
            </h2>
            <PlaceSearch
              current={poster.place.name}
              near={poster.place}
              onPick={pickPlace}
              placeholder="A city, a town, an address…"
            />
          </section>
          <section className="step">
            <h2>
              <span className="step-n">2</span> When
            </h2>
            <WhenFields
              when={poster.when}
              place={poster.place}
              zone={moment.zone}
              at={moment.at}
              dispatch={dispatch}
              onScrub={onScrub}
            />
          </section>
          <section className="step">
            <h2>
              <span className="step-n">3</span> Style
            </h2>
            <StylePicker
              value={poster.theme}
              onChange={onTheme}
              show={poster.show}
              font={poster.font}
              sky={moment.sky}
              map={map}
              layout={poster.layout}
              aspect={aspect}
              settled={!moving && !waiting}
            />
            <ChartFields show={poster.show} dispatch={dispatch} />
          </section>
          <section className="step">
            <h2>
              <span className="step-n">4</span> Words
            </h2>
            <WordsFields
              title={poster.title}
              subtitle={poster.subtitle}
              showWhen={poster.showWhen}
              showCoords={poster.showCoords}
              font={poster.font}
              dispatch={dispatch}
            />
          </section>
          <section className="step">
            <h2>
              <span className="step-n">5</span> Size
            </h2>
            <SizeFields
              size={poster.size}
              orientation={poster.orientation}
              layout={poster.layout}
              dispatch={dispatch}
            />
          </section>
          <section className="step save">
            <Downloads poster={poster} map={map} />
          </section>
        </aside>
      </main>

      <footer className="foot">
        <p>
          Stars from the Hipparcos catalogue (XHIP), constellations from the IAU, the Milky Way
          outline by Jose R. Vieira, all by way of{' '}
          <a href="https://github.com/ofrohn/d3-celestial">d3-celestial</a>. Positions by{' '}
          <a href="https://github.com/cosinekitty/astronomy">Astronomy Engine</a>, place search by{' '}
          <a href="https://photon.komoot.io">Photon</a> from{' '}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>. Nothing you make here
          leaves your browser.
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

/** What is up there, in a line or two under the poster. */
function Sights({ description }: { description: ReturnType<typeof describeSky> }) {
  return (
    <div className="sights" aria-hidden="true">
      {description.sights.length > 0 && (
        <ul>
          {description.sights.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong> {s.detail}
            </li>
          ))}
        </ul>
      )}
      {description.light && <p className="light">{description.light}</p>}
    </div>
  );
}

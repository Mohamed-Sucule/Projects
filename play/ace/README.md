# Ace

Tap to fly a paper plane through a canyon. Don't hit the rocks.

**→ [Play it](https://mohamed-sucule.github.io/Projects/play/ace/)**

That's the whole game. There is no menu, no difficulty select, no settings
panel and no tutorial, because a game that has to be explained has already
failed.

---

## What's underneath

The rules live in `engine.js` and know nothing about canvases, sound, input or
the DOM. It knows there is a plane, that gravity pulls it down, that a tap
pushes it up, and that hitting a rock ends the run. Everything you can see
lives in `index.html`.

That split exists for one reason: **it makes the game testable**. You can play
a whole run from a script and assert on the final score.

### Fixed timestep

The world advances in slices of exactly 1/120th of a second, however long the
browser actually took between frames.

Advancing physics by whatever `dt` happened to arrive makes the game *literally
easier on a fast machine* — a 144Hz monitor integrates gravity in smaller
pieces and the plane falls fractionally less far each frame. It also makes the
whole thing untestable, because the same taps at the same moments produce
different runs.

There's a test that plays an identical scripted run at 30, 60 and 144 frames a
second and asserts the results match to six decimal places.

That test failed twice before it passed, and **both times the test was wrong,
not the engine**. The first version tapped on a schedule that didn't divide
evenly into all three frame rates, so the flap landed a fraction of a frame
apart at each — it was measuring the arithmetic of the test. The second checked
the plane had fallen 0.5s after a flap, when the arc doesn't return to its
launch height until 0.537s.

### Deterministic

Same seed, same taps at the same moments, same result — exactly, every time.
The rock layout comes from a seeded generator rather than `Math.random`.

### A backgrounded tab doesn't kill you

A `dt` of four minutes is discarded rather than simulated. Nobody wants to come
back to a tab and find they died three minutes ago.

## The difficulty curve is tested by playing

A curve is a claim about play, so it gets checked by playing. A crude bot that
aims for the next opening scores **22–25 before dying, at around 27 seconds** —
and it dies right about where the openings stop narrowing, which is exactly
where the ramp was aimed.

The test asserts the median lands between 12 and 120. Below that it's unfair;
above it there's no game.

## Four defects found by looking at it

- **The playfield filled the whole monitor.** Left uncapped it became a wide
  letterbox with acres of empty sky, rocks arriving from a long way off, and a
  game that got easier the bigger your screen was. It's capped and centred now,
  with a frame, so it reads as something built on purpose.
- **The rocks were thin poles** that looked like scenery rather than things
  that would kill you, and they were nearly the same colour as the parallax
  hills behind them. Thicker, darker, with a warm rim on the sunward edge.
- **A grey triangle floated in the middle of the sky** as a tap hint, pointing
  at nothing. It's a ring pulsing out from the plane now — the hint has to be
  attached to the thing the instruction is about.
- **The first tap after a crash restarted the run**, so nobody ever saw the
  crash. There's a 620ms lockout.

## What it does not do

**No leaderboard**, because that needs a server and this has none. Your best
score lives in `localStorage` — and every read of it is wrapped, because
`localStorage` throws outright in a private window with site data blocked, and
an unguarded read would take the whole game down before the first frame in
exchange for remembering a number.

**No sound files.** The four noises — flap, point, star, crash — are
synthesised with oscillators and a noise buffer, so there is nothing to load
and nothing to go missing. Audio starts on your first tap because every browser
refuses to start it before one.

**No sprites, no assets, no libraries.** The plane is two triangles; the canyon
is three sine waves at different scroll rates.

## Tests

`node tests/run.mjs ace` — 27 of them (that filter also picks up `trace`,
which is a different project):

- an identical run at 30, 60 and 144fps produces identical results
- the same seed and taps reproduce a run exactly
- **every opening is reachable** across 60 seeds and 30 seconds each — a gap
  placed half off-screen is an unavoidable death the player can't know wasn't
  their fault
- each rock scores exactly once however long you linger beside it
- rocks are recycled, never accumulated, and come back unscored with their
  spacing intact
- falling has a terminal velocity, or a long drop becomes unrecoverable
- a dead plane ignores taps and settles on the floor
- the bot playability check above

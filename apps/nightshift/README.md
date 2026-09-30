# Nightshift

A coastal watch log from the night of 14 November 1987, transcribed from the
original daybook. It opens with the weather and the shipping.

**→ [Read it](https://mohamed-sucule.github.io/Projects/apps/nightshift/)**
— alone, with sound on, all the way to the end.

---

## What it is

A short horror story that uses the browser as its stage rather than its
delivery van. There is no video, no game, and nothing to play. You scroll, and
the page reads you scrolling.

It takes about five minutes. Everything below spoils it, so read it first.

<br><br><br><br><br><br><br><br><br><br><br><br>

---

## The page is deliberately boring

This is most of the work and it is the part that looks like none.

The first instinct with a horror piece is to announce it: a dark page, a
flickering serif, a heartbeat under the text. That tells the reader what kind
of thing they are looking at in the first half second, and everything after it
is decoration on a premise they have already accepted.

So this is a photocopy of a government document about the weather. Monospace on
a bad grey-cream, a rubber stamp in the corner, a 1px rule, and a transcriber's
note explaining the conventions used for illegible passages. The first eleven
entries are wind speed, visibility and one ship passing on schedule. Six of
them say *Nothing to report.*

There's a test that keeps it that way:

```
✓ the log does not go straight for the throat
```

It finds the first entry that isn't weather and fails if anything before it is
interesting. It's an odd thing to assert in a test file, and it's the assertion
that protects the whole piece — every future edit that makes the opening more
exciting makes the thing worse, and now something says so.

## The haunting is a list

Twelve beats, each a trigger and the name of an effect:

```js
{ id: 'rewrite', at: 0.34, effect: 'rewrite',
  data: { index: 4, text: 'Nothing to report. He is still reading.' } },
{ id: 'breath',  after: 150, effect: 'breath' },
{ id: 'title',   hidden: 1,  effect: 'title', data: 'come back to the log' },
```

`at` is how far down you've read, `after` is seconds on the page, `hidden` is
how many times you've switched tabs and come back. `due()` takes those three
numbers and a set of what's already fired, and returns what's owed. It's pure,
so the order of a haunting is testable: that nothing fires twice, that nothing
fires early, and that somebody who flings the scrollbar to the bottom still
gets the whole sequence rather than landing on an ending with no build behind
it.

The page knows nothing about the story. It holds a map from effect name to a
function that does something to the document, and a test reads the page's
source and fails if any beat names an effect with no handler — otherwise a
typo in one string fires, marks itself done, and does nothing at all, which is
the quietest bug this piece could have.

## What the effects actually do

None of this is a canvas. It's the browser's own furniture, used as furniture:

**The tab title changes, but only while you are not looking.** The beat fires
on `visibilitychange` when `document.hidden` is true, and the title goes back
to normal the instant you return. So you never see it change. You see it out of
the corner of your eye in the tab strip while you're in another window, and by
the time you look properly it says what it always said.

**The favicon becomes an eye.** Drawn into a 32×32 canvas at runtime and set as
a data URL, so it costs nothing and there is no image file in the repo to spoil
by finding.

**An entry you have already read changes behind you.** A third of the way down,
entry 4 — near the top, long out of sight — stops saying *Nothing to report.*
and starts saying *Nothing to report. He is still reading.* Nothing announces
it. Most people never scroll back up. The ones who do are who it's for.

**The scrollbar grows.** Halfway through, an empty element takes on 58vh of
height. The thumb jumps back up: there is more below you than there was a
moment ago, and when you get there it's nothing.

**The page tells you the time.** Not the time in 1987 — the time on the clock
in the room you are in.

**The lights go out over ninety seconds.** A CSS transition slow enough that
nobody catches it happening, fast enough that the closing appendix is read in
the dark.

**Something starts breathing under the sea.** Band-passed noise bursts with a
sine envelope, every four seconds or so, at irregular intervals. It is not the
wind loop, which has been running since you turned the sound on.

## The ending waits for the last word

This one is worth writing down because the first version was broken and the
break was invisible in code review.

The closing address was a beat at `at: 0.995`. The address itself was at
`at: 0.92`. A reader who scrolls patiently gets both in the right order — but
anybody who throws the scrollbar to the bottom lands at 1.0, and both beats
come due in the same call to `due()`. The address begins typing itself out a
character at a time, and 0.8 seconds later the veil drops over the top of it.

The payload of the entire piece got one character onto the screen. Driving it
in a headless browser and printing the text is what caught it:

```
direct     : Y
```

The fix isn't a longer delay, because a delay is a guess about reading speed.
The ending has no trigger at all now — it is marked `manual`, `due()` refuses
to return it under any state, and the address fires it when its last line has
finished being written. The test tries every combination of scroll, time and
tab-switching and fails if the ending is ever reachable:

```
✓ a manual beat cannot be reached by scrolling, waiting, or leaving
```

## Then it puts everything back

The veil fades. The light comes back. The title goes back. The phantom scroll
goes away. You're at the top of an ordinary photocopy of an ordinary document
about the weather, exactly as you found it.

One entry is different.

## It remembers you

The archive's own closing note says *This file has been read 1 time.* On your
second visit it says **2 times. Both by you.** — and there's a new entry at the
top of a 1987 log, dated today, in a different hand.

That's `localStorage`, which is four lines and no server, and which every read
and write wraps in try/catch because touching it in a private window throws
outright rather than returning null. It failing means a first visit forever,
which is the right way for it to fail.

## Sound

Synthesised at runtime — there isn't an audio file in the repo, so there's
nothing that can fail to load and nothing to sit through. The sea is white
noise through a lowpass whose cutoff rides a 0.07 Hz swell; the station's
electrics are a 51 Hz sine; a bell rings somewhere off the water every twenty
seconds or so, never on a beat.

It waits for a click, because browsers refuse to make a sound before one, and
because a page that starts making noise at you has lost its reader before the
first line.

## Accessibility

`prefers-reduced-motion` is honoured everywhere it would matter: the lights go
out in one step instead of ninety seconds, and the closing address arrives as
whole lines rather than typing itself out. It still ends the same way. The log
is real text in the document — selectable, searchable, and readable by a screen
reader from top to bottom.

## Tests

```
node tests/run.mjs nightshift
```

21 of them, over the log, the sequence and the memory. The ones worth reading
are `the log does not go straight for the throat`, `a manual beat cannot be
reached by scrolling, waiting, or leaving`, and `a page shorter than the window
does not deliver the whole story at once` — a zero-length scroll range makes
`scrollTop / range` a `0/0`, every comparison against `NaN` is false, and the
entire story silently never happens for somebody on a tall screen.

## Files

```
story.js     the log, the beats, and the pure functions that time them
index.html   the document, and the map from effect name to what it does
```

Nothing else. No dependencies, no build.

# Tuner — to the cent

**[Open it](index.html)** · Play a note into your microphone and see how sharp or flat it is, to
the cent. Guitar, bass, ukulele, violin, cello, or any note at all; tap a string to hear what it
should sound like; move A4 off 440 if your orchestra does. No microphone? There is a synthesised
string on the page, deliberately out of tune, and a peg to turn.

The sound is analysed and thrown away frame by frame. Nothing is recorded or sent.

## The hard part

A real string is not a sine wave. It rings at its fundamental and at two, three, four times it,
and the fundamental is often the *quietest* — a low E through a phone microphone is mostly its
second and third harmonics. A tuner that picks the loudest frequency calls that note an octave
too high.

So [`pitch.js`](pitch.js) looks for the **period** instead — the smallest shift at which the
waveform lines up with itself — using YIN (de Cheveigné and Kawahara, 2002): a difference
function, normalised by its running mean, the *first* dip under a threshold rather than the
deepest (the deepest is often the octave below), and a parabola through the bottom three points
so the answer is not rounded to a whole sample. A signal with no period — silence, breath, a room —
gets no pitch at all.

## Checked on sounds with known answers

Every test signal is synthesised, so the right answer is exact:

- pure tones from a bass's low E to the top of a violin, each within one cent;
- plucked notes whose harmonics are louder than their fundamental — not an octave out;
- a note with its fundamental **removed altogether**, heard at its true pitch the way the ear
  hears it;
- silence and noise, which get no pitch.

During development a synthesised A string twelve cents flat was fed to the page as a fake
microphone; it read A2, −12 cents, on every frame.

## Small things that matter

- Echo cancelling, noise suppression and automatic gain are switched **off**. They are built for
  voices and treat a sustained tone as noise, so a held note fades out under the needle.
- On an instrument, cents are measured from the nearest *string*, not the nearest note: a guitar
  string tuned down sixty cents is a very flat E, not a slightly sharp D♯.
- The needle is a median of the last few readings on a critically damped spring, so a single wild
  reading does not move it and a real change swings it rather than teleporting it.

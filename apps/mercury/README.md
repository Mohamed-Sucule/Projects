# Mercury

A sheet of liquid metal under a sunset sky. Drag it and it ripples.

**→ [Touch it](https://mohamed-sucule.github.io/Projects/apps/mercury/)**

Drag the metal and you draw waves into it. Drag the sky and you walk around it.
That's the whole interface — which gesture you get depends on what's under your
finger, so nobody has to be told.

---

## There is no 3D model in this page

None. There is no mesh, no vertex data, no texture of anything, no 3D library,
and no asset of any kind. The entire page is one HTML file and two small
programs that run on the graphics card.

- The **floating shape** is four moving spheres blended together by a formula.
- The **metal** is a flat plane whose height comes out of a physics simulation.
- The **sky** is a gradient and a bright dot.

Everything you can see is worked out from those descriptions **per pixel**,
sixty times a second. Two million times a second, a piece of code asks "what
would I see if I looked in exactly this direction", and answers it.

## How the reflections bend

This is the bit worth understanding, because nothing draws it.

**Pass one** is the water, on a 512×512 texture. Every cell looks at its four
neighbours and works out where it should be next — that's the wave equation,
with the calculus replaced by subtraction. Your finger pushes cells down. A wave
is nothing more than that rule applied over and over.

**Pass two** fires a ray from your eye through every pixel and finds what it
hits. When it lands on metal, it works out which way the surface is tilted —
straight out of the heights from pass one — bounces the ray off that tilt, and
goes to see what's in the new direction.

So the ripples move the tilts, the tilts move the bounced rays, and the
reflection bends. **Nothing computes the distortion.** It falls out of following
the light, the same way it does in the real world.

## The constant that isn't arbitrary

The wave speed is 0.42, and that number is load-bearing.

The discrete wave equation is stable only while c² stays under a half. Past it
the simulation feeds itself: the surface doesn't look slightly wrong, it reaches
infinity inside a second and the screen goes white. At 0.42, c² is 0.176 —
comfortably inside, with room for the sum to be a bit sloppy in half-precision
floats on the graphics card.

There's a test that **proves the limit is where I say it is**: it runs the
simulation at 0.69 and asserts it holds together, then at 0.75 and asserts it
comes apart. A test that only checks the working value would pass just as well
if the constant were meaningless.

## Five things that looked wrong, and why

Every one of these was found by rendering it and looking at the picture.

- **It looked like milky plastic.** I'd lit it with a Fresnel reflectance of
  0.04 — which is the number for *water*. Mercury is a metal, and metals reflect
  most of what hits them from every angle, not just at a glancing one. 0.04 →
  0.76 turned it from plastic into a mirror in one line.
- **It was still pale.** A mirror is only dramatic if there's something *dark*
  for the bright parts to sit against, and my sky was bright from top to bottom,
  so the mirror had nothing to do. The sky is mostly deep navy now with one hot
  sun, and the metal went almost black in the foreground.
- **Haze meant to hide the horizon was washing out the foreground.** An
  exponential thick enough to close the far edge was already a third of the way
  in at five units out — pouring pale sky over the dark mirror, which is the
  exact thing the mirror is there for. It's a `smoothstep` that starts at eight
  units now, so the near field is untouched.
- **The horizon shimmered in bands.** Far away, one pixel covers several waves,
  and sampling one point inside it gives you a different wave each frame. The
  fix is the same idea as a mipmap: settle the surface towards flat with
  distance.
- **Then the sun's glitter path collapsed into a razor-thin line**, because I'd
  settled it to *perfectly* flat. Leaving a little roughness out there spreads
  it back into a band, which is what it looks like on real water.

There was also a visible seam right across the picture where the simulated patch
of metal ended and the perfectly flat metal began — not a difference in height,
a difference in *slope*. A wider fade at the boundary and haze starting sooner
hide the join.

## It watches its own frame rate

Every pixel is traced, and traced twice over where there's a reflection, so the
cost is almost exactly the number of pixels. Rather than pick a resolution and
hope, it measures how long frames are taking and asks for more or fewer pixels.
There's an fps counter in the corner so you can watch it do it.

Two things stop it oscillating, and both have tests:

- the frame time is **smoothed**, so one slow frame is not a signal
- it has to **disagree with the current setting for twenty-six frames** before
  it moves

Without those it drops the resolution on a single slow frame, which makes the
next frame fast, which puts it straight back — and the picture visibly breathes
in and out. There's a test that feeds it alternating fast and slow frames and
fails if it settles on more than two different resolutions.

It also starts modest and climbs, rather than starting flat out. A raymarcher
opening at full resolution on a phone stutters for about two seconds, which is
exactly the two seconds somebody spends deciding whether this is any good.

## What I did and didn't measure

The maths — the camera, where your finger landed, the resolution controller, the
wave simulation — is tested properly, 31 tests from a terminal.

The **frame rate I have not measured on real hardware.** The browser I develop
against renders in software at single-digit frames per second, so the number in
the corner here means nothing. That's why the resolution controller exists and
why it's tested: I can't promise you sixty, so I built the thing that goes and
finds it.

## If your browser can't

It needs WebGL 2 and the ability to render to a floating-point texture. Without
either it says so plainly instead of showing a black rectangle, and everything
else on the site works regardless.

Reduced-motion is respected: the automatic ripples stop, and it waits for you.

## Tests

`node tests/run.mjs mercury` — 31 of them:

- the camera can't be tipped over the top or lowered into the surface
- rays come out normalised at every aspect ratio, and the top of the screen is
  higher than the bottom — screens count downwards and cameras count upwards,
  and that flip is the bug everybody writes once
- a ray aimed at the sky returns nothing rather than a negative distance, which
  would put the ripple *behind* the camera
- every touch it accepts lands inside the simulated patch
- the resolution controller: drops under load, recovers fully, respects its
  ceiling, ignores a single slow frame, and doesn't oscillate
- still metal stays still, a drop spreads and dies away, it stays symmetric, the
  edges swallow waves instead of bouncing them back
- and the stability limit above, checked from both sides

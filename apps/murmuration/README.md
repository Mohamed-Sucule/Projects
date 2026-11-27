# Murmuration

Tens of thousands of starlings over a reedbed at sunset. You are the falcon.

**→ [Be the falcon](https://mohamed-sucule.github.io/Projects/apps/murmuration/)**

Point at the sky and the falcon goes there, and the flock folds away from it. Hold the button down and it folds
its wings and dives. On a phone, touch the sky. **Send the falcon** sends it straight through the flock, and if
nobody hunts for a while it comes by on its own. The evening lasts about two and a half minutes: the birds stream in from the
edges, swirl as the sun goes down, and drop into the reeds as the light goes.

---

## Seven neighbours

A murmuration has no leader and no plan. Each starling watches its six or seven nearest neighbours, and does
three things: turns to fly the way they fly, closes on them, and keeps its distance. The researchers who filmed
flocks over Rome in three dimensions found it is a number of neighbours, not every bird within some distance
(Ballerini and others, *PNAS*, 2008). That is why a flock can stretch thin and fold back without coming apart.

Every bird here flies by those rules and two more: stay over the reedbed, and get away from the falcon. Only the
birds nearest the falcon can see it, but their neighbours turn with them, and theirs with them, and the turn
crosses the flock as a wave of dark and light.

## On the graphics card

Each bird is a pixel in two textures, one for where it is and one for where it is going, and every frame three
programs run on the graphics card ([`shaders.js`](shaders.js)):

1. **Count.** Every bird is drawn as a single point into three grids of boxes, 16, 32 and 64 units across.
   Additive blending sums each box: how many birds, which way they are going, and where they are.
2. **Fly.** One pixel per bird. It reads the eight boxes around the bird at each size, weighted by how near
   each box's middle is and not counting itself, and takes the finest size that holds about seven birds.
   That answers "what are my seven nearest neighbours doing" without ever finding them one by one. Then it
   works out the bird's next position and velocity and writes them to the other pair of textures.
3. **Draw.** One small bird shape per bird, four triangles, turned to its heading, with wings that beat.
   The far birds are never drawn smaller than a pixel and a half, or they would flicker out.

It starts at 32,768 birds (12,288 on a phone), then watches its own frame rate: half as many on a machine that
cannot keep up, 49,152 on one with room to spare.

## The same rules, twice

The numbers the birds fly by live in [`field.js`](field.js) and are written into the shaders from there, so the
two cannot drift apart. `field.js` also flies the same flock on the processor, a few thousand birds at most.
That version is what a browser without the graphics features gets, and it is what
[`tests/murmuration.test.mjs`](../../tests/murmuration.test.mjs) checks from a terminal: the flock arrives,
holds together without collapsing, keeps over the reeds, opens around a falcon, and is all down by nightfall.

[`tests/browser/murmuration.mjs`](../../tests/browser/murmuration.mjs) checks the real thing. It runs the page
in Chromium (in CI, on a software graphics card), drives the evening, reads every bird's position back off the
card, and checks the same things of the shader version, along with the fallback and the reduced-motion start.

## Everything else

## The falcon

A peregrine, in the same sky and drawn the same way as the starlings, with jointed wings: it beats them when it
climbs or slows, glides when it has speed, and folds them back to dive. The pointer is not the falcon; it is
where the falcon is going. The falcon gets there faster than any starling, carrying its speed through the turns
and banking into them, so it overshoots and swings round, and once there it circles, as a falcon waits on above
its prey. It flies at about half the flock's distance, so it is big enough to read as a falcon, and the flock
feels it on the same line from the eye at the flock's own distance, so the hole opens right behind it.

## The marsh

[`scenery.js`](scenery.js) draws the rest on ordinary canvases. The sky is repainted a few times a second as the
light goes, with clouds lit from below by the sun while it is up and grey-violet once it has gone, the first
stars, the sun's track on the water, and a fine grain so the long gradients do not band. The reeds are drawn
once for each size of screen, in three depths, each with a warm copy for where the sun is behind them, and laid
over the picture every frame with a lean that comes and goes with the wind. The sound, off until asked for, is
made as it plays: wind over the reeds, the rush of wings, which swells when the falcon is among them, and
chatter that grows as the flock comes down. There is no image and no sound file.

With reduced motion asked for, it opens a minute into the evening, still, until **Play** is pressed.

# Ember

An action game in the dark. Your flame is your life and your light: three acts, three
bosses, nine ash-stones, and one question. Who put out the Beacon?

**→ [Play it](https://mohamedsucule-debug.github.io/Projects/play/ember/)**

| | |
|---|---|
| Move | WASD or arrows · left thumb · left stick |
| Strike | click or J · STRIKE · A (hold to keep swinging) |
| Dash | space, shift or K · DASH · B. Nothing can touch you mid-dash |
| Flare | E, L or right-click · FLARE · X. Costs 15 ember, burns everything near you, relights braziers |
| Pause | esc or P · II · start |

On a phone, and with keys alone, strikes aim themselves at whatever is nearest. *Gentle*
on the title screen halves every blow.

---

## The one rule

**Your ember is your health and your light radius at once.** At 100 you can see across a
room. At 20 you can see your own feet, and the eyes in the dark are all that tell you where
things are. Cinders (dropped by everything you kill) feed it back, and a flare spends it.
That one number turns every fight into a decision about how much light you can afford.

## What's underneath

| File | What it does |
|---|---|
| [`engine.js`](engine.js) | The rules, and nothing else. There is no DOM, no canvas and no sound. It covers the map generator, the fighting, four kinds of enemy, three bosses written as scripts that yield how long to wait, boons, checkpoints, and an autopilot. |
| [`render.js`](render.js) | Draws a game: tiles, pillars, water, fire, monsters and particles. Then the dark, and the lights that push it back. |
| [`audio.js`](audio.js) | The score and every noise, synthesised live. The music changes between exploring, a locked room and each boss, and each boss fight gets louder as it goes on. |
| [`index.html`](index.html) | Input (keyboard, mouse, touch, gamepad), the HUD, and the screens in between. |

**The light** is a visibility polygon. Rays are cast from the flame to every wall corner
within reach, the nearest hit on each is kept, and the resulting shape is punched out of a
darkness layer with a radial gradient. Brazier shadows never move, so they are computed once
and cached. The player's are recomputed every frame.

**The map** grows a tree of rooms across a 5×4 grid, favouring the deepest branch, so each
act is a path with side rooms rather than a hub. The boss goes in the deepest dead end and
the shrine in another. The ash-stones go in the rooms least on the way.

**The bosses** are generator functions. `yield 0.8` means "wait 0.8 seconds". A slam is
five lines: draw the circle, wait, land it, send the shockwave out, recover. Their phases
(the Warden's temper, the Choir grieving as masks fall, the King's eclipse and last light)
are just branches in that script.

## Fair by construction

Every attack in the game is either a hazard drawn on the floor or a shot with a wind-up,
and both carry the moment they were first shown. When something hits you, the game records
how much warning you had. The tests play the whole game on three seeds and assert that
every hit, every attack and every shot was shown at least **0.3 seconds** before it could
land. The tightest in the game is the King's slash straight after his dash, at 0.38s.

## Checked

`tests/ember.test.mjs` checks:

- Every room, brazier and ash-stone of every act is reachable, on 40 seeds. The boss is
  always in the deepest dead end.
- Light stops at walls, and the floor behind a pillar is dark while the floor in front of it
  is lit.
- An autopilot plays from the first room to the ending on every seed tried. Every boss goes
  through every phase in order, and all nine ash-stones can be reached.
- Nothing hurts you without warning (above).
- Nobody, you or an enemy, ever ends up inside a wall.
- The same inputs play out exactly the same way.
- Dashing makes you untouchable, Gentle halves blows, and cinders refill ember but never
  past the brim.
- Dying wakes you at the last lit brazier. Dying to a boss resets the boss.
- The King takes half damage in the dark and full damage in a brazier's light.
- Every boon does exactly what its card says.
- The King's last words agree with the ledger on the ash-stones.

## Found by playing it

- **A mite and the player, pinned forever.** A sweep of 40 seeds found 4 runs that never
  finished. In each, the last enemy in the room and the player were stuck against pillars on
  opposite sides, each walking straight at the other. Enemies now follow a shortest-path map
  of the room whenever something is in the way.
- **Two masks dying in the same breath.** The Choir only noticed deaths between songs, so if
  two masks fell during one attack the fight skipped straight past its last phase. A mask's
  death is now announced the moment it happens.
- **Summoned into a pillar.** The Warden calls mites in around him, and sometimes "around
  him" was inside a column. Everything is now placed on the nearest open floor.

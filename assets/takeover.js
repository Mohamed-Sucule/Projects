/* assets/takeover.js — three moments where a project takes over the night.

   At 18:30 the dark closes in on Ember and the pointer carries the flame, the way
   the game's light is the player's health: you see what your light reaches. At
   19:30 the streets of a city draw themselves across the sky in gold, from the
   middle outwards, the way Your Place draws a poster. At 21:30 a lighthouse beam
   sweeps the sky behind The Lamplighter, once every 11.2 seconds, as the story's
   does.

   All three are decoration: hidden from assistive technology, never in the way
   of a click, and never over the words. The dark sits under each scene's text,
   and the streets and the beam are behind everything. They only run while their
   scene is on screen. With motion off (the button in the top bar, or a system
   asking for less), the flame stops flickering and stops trailing the pointer,
   the streets are simply there, and the beam stands still. Without a pointer the
   flame drifts over the recording instead; with the keyboard it goes to whatever
   has focus. */

/** How much a section is the one being looked at: 1 when centred, 0 off screen. */
export function presence(top, height, viewport) {
  const centre = top + height / 2;
  return Math.max(0, Math.min(1, 1 - Math.abs(centre - viewport / 2) / (viewport * 0.72)));
}

/** How far through a section the reader is: 0 as it comes up, 1 once it is in place. */
export function through(top, height, viewport) {
  return Math.max(0, Math.min(1, (viewport * 0.95 - top) / (Math.min(height, viewport) * 0.95)));
}

/** A flame's breath: a few unrelated waves, so it never visibly repeats. Within ±10%. */
export function flicker(t) {
  return 1 + 0.045 * Math.sin(t * 12.7) + 0.035 * Math.sin(t * 7.1 + 1.3) + 0.02 * Math.sin(t * 23.3);
}

/** How much of a drawing group to show: band b of n starts later than band b - 1. */
export function drawnShare(progress, band, bands) {
  const start = (band / bands) * 0.62;
  return Math.max(0, Math.min(1, (progress - start) / 0.38));
}

/** The beam's angle in radians: one turn every 11.2 seconds, two lamps opposite. */
export const BEAM_PERIOD = 11.2;
export const beamAngle = (t) => ((t / BEAM_PERIOD) * Math.PI * 2) % (Math.PI * 2);

export function startTakeovers({ moving }) {
  const ember = document.getElementById('ember');
  const place = document.getElementById('your-place');
  const lamp = document.getElementById('lamplighter');
  if (!ember || !place || !lamp) return;

  const layer = (tag, cls) => { const el = document.createElement(tag); el.className = cls; el.setAttribute('aria-hidden', 'true'); document.body.append(el); return el; };
  const back = layer('canvas', 'takeover back');    // the beam: behind everything
  const streets = layer('div', 'streets');          // the city: behind everything
  const front = layer('canvas', 'takeover front');  // the dark: over the recording, under the words
  const flame = layer('div', 'flame');
  const bctx = back.getContext('2d'), fctx = front.getContext('2d');
  const touch = matchMedia('(hover: none)');

  let W = 0, H = 0;
  const RES = 0.5; // the dark and the beam are soft, so half the pixels draw them just as well
  const resize = () => {
    W = innerWidth; H = innerHeight;
    for (const c of [back, front]) { c.width = Math.ceil(W * RES); c.height = Math.ceil(H * RES); }
  };
  resize();
  addEventListener('resize', () => { resize(); wake(); });

  /* The city's streets are fetched the first time the evening gets near them. */
  let paths = [];
  const loadStreets = async () => {
    loadStreets.done = true;
    try {
      const svg = await (await fetch(new URL('./streets.svg', import.meta.url))).text();
      streets.innerHTML = svg;
      paths = [...streets.querySelectorAll('path[data-band]')].map((p) => [p, Number(p.dataset.band)]);
      wake();
    } catch { /* no streets tonight; nothing else depends on them */ }
  };
  const bands = 8;

  /* Where the flame is, and where it is going. */
  let px = W * 0.5, py = H * 0.4, tx = px, ty = py, pointed = false;
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { tx = e.clientX; ty = e.clientY; pointed = true; wake(); } }, { passive: true });
  ember.addEventListener('focusin', (e) => {
    const r = e.target.getBoundingClientRect();
    tx = r.left + r.width / 2; ty = r.top + r.height / 2; pointed = true; wake();
  });

  let running = false, frame = 0;
  const t0 = performance.now();
  function wake() { if (!running) { running = true; frame = requestAnimationFrame(draw); } }
  addEventListener('scroll', wake, { passive: true });

  function draw(now) {
    const t = (now - t0) / 1000;
    const on = moving();
    const re = ember.getBoundingClientRect(), rp = place.getBoundingClientRect(), rl = lamp.getBoundingClientRect();
    const pe = presence(re.top, re.height, H), pp = presence(rp.top, rp.height, H), pl = presence(rl.top, rl.height, H);

    /* Ember: the dark, with a hole where the flame is. */
    front.style.opacity = flame.style.opacity = (pe ** 1.4).toFixed(3);
    if (pe > 0) {
      const clip = ember.querySelector('.screen')?.getBoundingClientRect() ?? re;
      if (!pointed || touch.matches) {
        /* No pointer: the flame wanders over the recording, slowly, or rests in its middle. */
        const cx = clip.left + clip.width / 2, cy = clip.top + clip.height / 2;
        tx = cx + (on ? Math.sin(t * 0.37) * clip.width * 0.3 : 0);
        ty = cy + (on ? Math.sin(t * 0.53 + 1) * clip.height * 0.22 : 0);
      }
      const ease = on ? 0.2 : 1;
      px += (tx - px) * ease; py += (ty - py) * ease;
      const f = on ? flicker(t) : 1;
      const r = Math.min(W, H) * 0.3 * f;
      const x = px * RES, y = py * RES, rr = r * RES;
      fctx.clearRect(0, 0, front.width, front.height);
      const g = fctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(255, 176, 92, 0.16)');
      g.addColorStop(0.38, 'rgba(255, 140, 60, 0.05)');
      g.addColorStop(0.72, 'rgba(10, 6, 12, 0.74)');
      g.addColorStop(1, 'rgba(4, 2, 6, 0.96)');
      fctx.fillStyle = g;
      fctx.fillRect(0, 0, front.width, front.height);
      flame.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) scale(${(0.9 + 0.12 * f).toFixed(3)}, ${(0.9 + 0.3 * f).toFixed(3)})`;
    }

    /* Your Place: the streets, drawn band by band as the scene comes up. */
    if (pp > 0 && !loadStreets.done) loadStreets();
    streets.style.opacity = Math.min(1, pp * 1.5).toFixed(3);
    if (paths.length) {
      const progress = on ? through(rp.top, rp.height, H) : 1;
      for (const [p, band] of paths) p.style.strokeDashoffset = (1 - drawnShare(progress, band, bands)).toFixed(4);
    }

    /* The Lamplighter: two beams from a lamp just off the right of the screen. */
    back.style.opacity = (pl ** 1.1).toFixed(3);
    if (pl > 0) {
      bctx.clearRect(0, 0, back.width, back.height);
      const ox = back.width * 0.975, oy = back.height * 0.44, reach = Math.hypot(back.width, back.height);
      const a = on ? beamAngle(t) : Math.PI * 1.08;
      for (const turn of [0, Math.PI]) {
        const angle = a + turn;
        const g = bctx.createRadialGradient(ox, oy, 0, ox, oy, reach);
        g.addColorStop(0, 'rgba(255, 244, 214, 0.62)');
        g.addColorStop(0.35, 'rgba(255, 244, 214, 0.2)');
        g.addColorStop(1, 'rgba(255, 244, 214, 0)');
        bctx.fillStyle = g;
        for (const [spread, alpha] of [[0.12, 0.35], [0.07, 0.55], [0.03, 0.8]]) {
          bctx.globalAlpha = alpha;
          bctx.beginPath(); bctx.moveTo(ox, oy); bctx.arc(ox, oy, reach, angle - spread, angle + spread); bctx.closePath(); bctx.fill();
        }
      }
      bctx.globalAlpha = 1;
      /* The lamp itself, just inside the edge of the screen. */
      const glow = bctx.createRadialGradient(ox, oy, 0, ox, oy, 26);
      glow.addColorStop(0, 'rgba(255, 248, 226, 1)');
      glow.addColorStop(0.25, 'rgba(255, 236, 190, 0.7)');
      glow.addColorStop(1, 'rgba(255, 230, 170, 0)');
      bctx.fillStyle = glow;
      bctx.fillRect(ox - 26, oy - 26, 52, 52);
    }

    /* Keep going while any of the three is on screen and something can still change. */
    const busy = (pe > 0 || pl > 0) && (on || pe > 0) || (pp > 0 && pp < 1);
    if (busy && !document.hidden) frame = requestAnimationFrame(draw); else running = false;
  }
  wake();
  return { wake };
}

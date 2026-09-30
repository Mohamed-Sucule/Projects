/* ───────────────────────────────────────────────────────────────────────────
   morph/engine.js — where things go, and how they get there.

   Two halves, both pure and both testable from a terminal with no browser:

     LAYOUTS  given some items and a box to put them in, work out the
              rectangle each one should occupy. Seven completely different
              answers to the same question.

     SPRINGS  given where a thing is and where it should be, work out where it
              is a sixteenth of a second later.

   The second half is the interesting one, and it is the reason this is not a
   CSS transition.

   A CSS transition is a promise about the future: "get from A to B over 300ms
   on this curve". Interrupt it — change the layout while it is still moving —
   and the browser has to throw away the promise and make a new one from
   wherever the element happens to be, at zero velocity. Things stop dead and
   start again. You can see it, and it is the single most common reason an
   interface feels cheap.

   A spring has no idea where it started or when it is due to arrive. It only
   knows its current position, its current velocity, and where it is being
   pulled. Change the target mid-flight and nothing is discarded: the pull
   changes direction and the existing momentum carries through. Motion stays
   continuous through any number of interruptions, because there was never a
   plan to interrupt.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── springs ─────────────────────────────────────────────────────────────── */

/**
 * Presets, in the units people actually reason about.
 *
 * `stiffness` is how hard it pulls; `damping` is how much the medium resists.
 * The ratio between them decides the character: damping below the critical
 * value 2*sqrt(stiffness*mass) overshoots and wobbles, above it eases in
 * without ever passing the target.
 */
export const SPRINGS = {
  gentle: { stiffness: 120, damping: 20, mass: 1 },
  snappy: { stiffness: 320, damping: 26, mass: 1 },
  stiff: { stiffness: 700, damping: 40, mass: 1 },
  wobbly: { stiffness: 260, damping: 11, mass: 1 },
  molasses: { stiffness: 60, damping: 22, mass: 1 },
};

/** Damping that would just barely avoid overshooting, for a given stiffness. */
export const criticalDamping = ({ stiffness, mass = 1 }) => 2 * Math.sqrt(stiffness * mass);

export const makeSpring = (value = 0) => ({ value, velocity: 0 });

/**
 * Advance a spring by `dt` seconds.
 *
 * Integrated in fixed sub-steps rather than one big one. A spring integrated
 * with semi-implicit Euler is only stable while the step is small relative to
 * its period; a stiff spring plus a dropped frame (a 250ms dt) produces a
 * value in the millions and the element vanishes off-screen. Slicing the
 * elapsed time into ~4ms pieces makes a hitch look like a pause rather than an
 * explosion, and makes the motion identical at 60Hz and 120Hz.
 */
export function stepSpring(s, target, cfg = SPRINGS.snappy, dt = 1 / 60) {
  const { stiffness, damping, mass = 1 } = cfg;
  const MAX = 1 / 240;
  let remaining = Math.min(0.25, Math.max(0, dt));
  while (remaining > 0) {
    const h = Math.min(MAX, remaining);
    remaining -= h;
    const force = -stiffness * (s.value - target) - damping * s.velocity;
    s.velocity += (force / mass) * h;
    s.value += s.velocity * h;
  }
  return s;
}

/** Near enough, and slow enough, to stop animating and snap. */
export function atRest(s, target, epsilon = 0.4) {
  return Math.abs(s.value - target) < epsilon && Math.abs(s.velocity) < epsilon * 6;
}

export function snapSpring(s, target) {
  s.value = target;
  s.velocity = 0;
  return s;
}

/* ── layouts ─────────────────────────────────────────────────────────────── */

/* Every layout takes the same shape of input — a list of items each with an
   aspect ratio, plus the box and a few options — and returns one rectangle per
   item, in the same order. Same signature everywhere means the interface can
   swap between them without knowing anything about any of them, and a new
   layout is one function and one entry in the list below. */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Even columns, every cell the same size. The one everybody starts with. */
export function grid(items, { width, gap = 14, columns = 4, ratio = 1 }) {
  const cols = Math.max(1, Math.round(columns));
  const w = (width - gap * (cols - 1)) / cols;
  const h = w / ratio;
  return items.map((_, i) => ({
    x: (i % cols) * (w + gap),
    y: Math.floor(i / cols) * (h + gap),
    w, h, rot: 0, z: 0, scale: 1,
  }));
}

/**
 * Masonry: fixed column width, natural heights, each item dropped into
 * whichever column is currently shortest.
 *
 * Greedy and not optimal — packing these perfectly is NP-hard — but the greedy
 * answer is within a few pixels and runs in one pass, and nobody has ever
 * looked at a photo wall and wished the columns were 4px more even.
 */
export function masonry(items, { width, gap = 14, columns = 4 }) {
  const cols = Math.max(1, Math.round(columns));
  const w = (width - gap * (cols - 1)) / cols;
  const heights = new Array(cols).fill(0);
  return items.map((item) => {
    let c = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[c] - 0.01) c = i;
    const h = w / item.aspect;
    const rect = { x: c * (w + gap), y: heights[c], w, h, rot: 0, z: 0, scale: 1 };
    heights[c] += h + gap;
    return rect;
  });
}

/**
 * Justified rows — the one every photo site uses and nobody explains.
 *
 * Fill a row with items at some rough target height until it is about wide
 * enough, then solve for the exact height that makes that row fill the
 * container to the pixel:
 *
 *     rowHeight = (width - gap * (n - 1)) / sum(aspect ratios)
 *
 * Because every item in the row gets the same height and keeps its own aspect
 * ratio, the widths come out proportional and the row closes exactly. Nothing
 * is cropped and nothing is stretched — the row height is the free variable.
 *
 * The last row is the awkward one: left alone it fills the width by blowing
 * its handful of items up to enormous heights. It is capped instead, which is
 * what every implementation of this does and none of them mention.
 */
export function justified(items, { width, gap = 14, targetHeight = 180 }) {
  const out = [];
  let row = [], y = 0;

  const flush = (isLast) => {
    if (!row.length) return;
    const totalAspect = row.reduce((s, it) => s + it.item.aspect, 0);
    const available = width - gap * (row.length - 1);
    let h = available / totalAspect;
    if (isLast) h = Math.min(h, targetHeight * 1.35);
    let x = 0;
    for (const { item, index } of row) {
      const w = h * item.aspect;
      out[index] = { x, y, w, h, rot: 0, z: 0, scale: 1 };
      x += w + gap;
    }
    y += h + gap;
    row = [];
  };

  items.forEach((item, index) => {
    row.push({ item, index });
    const totalAspect = row.reduce((s, it) => s + it.item.aspect, 0);
    // would this row already be wide enough at the target height?
    if (totalAspect * targetHeight + gap * (row.length - 1) >= width) flush(false);
  });
  flush(true);
  return out;
}

/** One full-width row each, like a settings screen or an inbox. */
export function list(items, { width, gap = 10, rowHeight = 92 }) {
  return items.map((_, i) => ({
    x: 0, y: i * (rowHeight + gap), w: width, h: rowHeight, rot: 0, z: 0, scale: 1,
  }));
}

/**
 * A spiral, on the golden angle.
 *
 * 137.5 degrees between successive items is the angle a sunflower uses. Being
 * irrational, no two items ever line up into a spoke however many you add, so
 * the spacing stays even all the way out instead of forming the obvious rays
 * that any round-number angle produces.
 */
export function spiral(items, { width, height, size = 96, spread = 1 }) {
  const cx = width / 2, cy = height / 2;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const step = (Math.min(width, height) / 2 - size) / Math.max(1, Math.sqrt(items.length));
  return items.map((_, i) => {
    const angle = i * GOLDEN;
    const r = step * Math.sqrt(i) * spread;
    const s = clamp(1 - i / (items.length * 2.2), 0.42, 1);
    return {
      x: cx + Math.cos(angle) * r - (size * s) / 2,
      y: cy + Math.sin(angle) * r - (size * s) / 2,
      w: size * s, h: size * s,
      rot: (angle * 180) / Math.PI + 90,
      z: items.length - i, scale: 1,
    };
  });
}

/** A deck, fanned out from the middle. The first card is on top. */
export function deck(items, { width, height, size = 260, fan = 5, offset = 16 }) {
  const cx = width / 2, cy = height / 2;
  return items.map((item, i) => {
    const h = size / item.aspect;
    return {
      x: cx - size / 2 + i * offset * 0.42,
      y: cy - h / 2 + i * offset * 0.3,
      w: size, h,
      rot: (i - (items.length - 1) / 2) * fan * 0.4,
      z: items.length - i,
      scale: clamp(1 - i * 0.012, 0.6, 1),
    };
  });
}

/**
 * Coverflow: a row through the middle, the focused item face on and the rest
 * turned away and pushed behind it.
 *
 * The rotation is in the rectangle rather than applied by the interface,
 * because a layout that cannot express "turned 55 degrees" would need the
 * interface to special-case this one — and then adding an eighth layout means
 * editing the interface too.
 */
export function coverflow(items, { width, height, size = 200, focus = 0, gapAngle = 55 }) {
  const cx = width / 2, cy = height / 2;
  return items.map((item, i) => {
    const d = i - focus;
    const h = size / item.aspect;
    const away = Math.abs(d);
    const near = clamp(away, 0, 6);

    /* The offset saturates instead of growing with the index. Spacing the
       turned-away cards evenly reads fine for five of them and sends the
       twentieth a thousand pixels off the side — which then scrolls. Real
       coverflow stacks the distant ones up against the edges, and an
       exponential approach does that while keeping everything inside the box:
       the furthest card can never sit more than ~1.5 widths from the middle. */
    const first = Math.min(away, 1) * 0.56;
    const rest = (1 - Math.exp(-(away - Math.min(away, 1)) * 0.5)) * 0.92;
    const offset = Math.sign(d) * size * (first + rest);

    return {
      x: clamp(cx + offset - size / 2, -size * 0.35, width - size * 0.65),
      y: cy - h / 2,
      w: size, h,
      rot: 0,
      rotY: d === 0 ? 0 : -Math.sign(d) * gapAngle,
      z: 100 - near * 10,
      scale: d === 0 ? 1 : clamp(1 - near * 0.06, 0.6, 1),
    };
  });
}

/** Every layout, in the order they are offered. */
export const LAYOUTS = {
  grid: { fn: grid, label: 'Grid', note: 'even columns' },
  masonry: { fn: masonry, label: 'Masonry', note: 'shortest column wins' },
  justified: { fn: justified, label: 'Justified', note: 'rows that fill exactly' },
  list: { fn: list, label: 'List', note: 'one per row' },
  spiral: { fn: spiral, label: 'Spiral', note: 'the golden angle' },
  deck: { fn: deck, label: 'Deck', note: 'a stack of cards' },
  coverflow: { fn: coverflow, label: 'Coverflow', note: 'turned away' },
};

/** Total height a layout needs, so the scroll container can be sized. */
export function extent(rects) {
  let bottom = 0;
  for (const r of rects) bottom = Math.max(bottom, r.y + r.h);
  return bottom;
}

/* ── reordering ──────────────────────────────────────────────────────────── */

/** Move one item, shuffling everything between it and its destination along. */
export function reorder(arr, from, to) {
  if (from === to || from < 0 || from >= arr.length) return arr.slice();
  const out = arr.slice();
  const [moved] = out.splice(from, 1);
  out.splice(clamp(to, 0, out.length), 0, moved);
  return out;
}

/**
 * Which slot is a dragged item hovering over?
 *
 * Compares against the centre of each laid-out rectangle rather than its
 * edges: with edges, an item dragged over a neighbour smaller than itself can
 * satisfy two slots at once and the list flickers between them.
 */
export function slotAt(rects, x, y, skip = -1) {
  let best = -1, bestD = Infinity;
  rects.forEach((r, i) => {
    if (i === skip) return;
    const dx = x - (r.x + r.w / 2), dy = y - (r.y + r.h / 2);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

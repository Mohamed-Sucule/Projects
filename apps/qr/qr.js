/* ───────────────────────────────────────────────────────────────────────────
   qr/qr.js — a QR code, from the bits up.

   Every QR generator on the web is a thin coat of paint over the same three
   or four libraries. This one is the thing underneath, written out: how the
   text becomes bits, how the bits become bytes, how the bytes grow a tail of
   error correction that lets a phone read the code with a third of it torn
   off, and how all of it is folded into a square without ever landing on the
   parts the phone uses to find the square in the first place.

   THE PIPELINE, in the order it happens:

     1. Pick the smallest mode the text fits: digits pack three to ten bits,
        a restricted uppercase alphabet packs two to eleven, anything else is
        UTF-8 bytes at eight bits each.
     2. Pick the smallest version (size) whose data capacity holds it.
     3. Pad to exactly that capacity with the two filler bytes the standard
        names, 0xEC and 0x11, alternating.
     4. Cut the data into blocks and give every block its own Reed–Solomon
        error-correction bytes — arithmetic in a field of 256 elements where
        addition is XOR and nothing ever overflows.
     5. Interleave the blocks, so a scratch across the code costs every block
        a little rather than one block everything.
     6. Draw the fixed patterns, then snake the bits into what is left.
     7. Try all eight masks and keep the one that looks least like a finder
        pattern, least like a stripe and least like a checkerboard gone wrong.
     8. Write down which level and mask were used, twice, in its own little
        error-corrected code, so the reader knows how to undo step 7.

   No DOM here. Everything returns plain arrays a test can pick apart.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── tables from the standard ────────────────────────────────────────────── */

/* Error-correction bytes per block, and number of blocks, for every version
   (index 1–40) at every level. These two tables are the whole of the
   capacity chart: everything else is worked out from the size of the square. */
const ECC_PER_BLOCK = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const BLOCKS = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

/* How much of the code can be lost and still read. What the levels are
   actually for, in the words a person choosing between them needs. */
export const LEVELS = [
  { id: 'L', survives: 7 },
  { id: 'M', survives: 15 },
  { id: 'Q', survives: 25 },
  { id: 'H', survives: 30 },
];

/* The two bits the format information uses for each level. Not 0–3 in
   order: L is 01, M is 00, Q is 11, H is 10, and getting that wrong makes a
   code every phone rejects while looking perfectly fine. */
const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/* ── modes ───────────────────────────────────────────────────────────────── */

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export const MODES = {
  numeric:      { bits: 0b0001, count: [10, 12, 14], test: (s) => /^[0-9]*$/.test(s) },
  alphanumeric: { bits: 0b0010, count: [9, 11, 13],  test: (s) => [...s].every((c) => ALNUM.includes(c)) },
  byte:         { bits: 0b0100, count: [8, 16, 16],  test: () => true },
};

/** How many bits the character count takes, which grows with the version. */
function countBits(mode, version) {
  const c = MODES[mode].count;
  return version <= 9 ? c[0] : version <= 26 ? c[1] : c[2];
}

const utf8 = new TextEncoder();

/**
 * Text → a segment: its mode, its character count and its payload bits.
 * The narrowest mode the whole text fits in wins. (Mixing modes inside one
 * code can save a few bytes on text like "ORDER 12345678"; it is also where
 * most home-made encoders go wrong, and a link or a Wi-Fi password gains
 * nothing from it.)
 */
export function segment(text) {
  const mode = text.length && MODES.numeric.test(text) ? 'numeric'
    : text.length && MODES.alphanumeric.test(text) ? 'alphanumeric'
    : 'byte';
  const bits = [];
  if (mode === 'numeric') {
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      push(bits, Number(chunk), chunk.length * 3 + 1);          // 3 digits → 10 bits, 2 → 7, 1 → 4
    }
    return { mode, count: text.length, bits };
  }
  if (mode === 'alphanumeric') {
    for (let i = 0; i < text.length; i += 2) {
      if (i + 1 < text.length) push(bits, ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
      else push(bits, ALNUM.indexOf(text[i]), 6);
    }
    return { mode, count: text.length, bits };
  }
  const bytes = utf8.encode(text);
  for (const b of bytes) push(bits, b, 8);
  return { mode, count: bytes.length, bits };
}

function push(bits, value, len) {
  for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

/* ── capacity ────────────────────────────────────────────────────────────── */

/**
 * Modules left for data and error correction once every fixed pattern has
 * taken its share. Worked out rather than tabulated: the square, minus the
 * three finders, the timing lines, the alignment patterns, the format and
 * version information.
 */
export function rawDataModules(version) {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

/** Bytes of actual data a version holds at a level, after error correction. */
export function dataCapacity(version, level) {
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[level][version] * BLOCKS[level][version];
}

/** The largest number of characters of a mode a version holds at a level. */
export function charCapacity(version, level, mode) {
  const bits = dataCapacity(version, level) * 8 - 4 - countBits(mode, version);
  if (mode === 'numeric') {
    const whole = Math.floor(bits / 10) * 3, rest = bits % 10;
    return whole + (rest >= 7 ? 2 : rest >= 4 ? 1 : 0);
  }
  if (mode === 'alphanumeric') return Math.floor(bits / 11) * 2 + (bits % 11 >= 6 ? 1 : 0);
  return Math.floor(bits / 8);
}

/* ── the field ───────────────────────────────────────────────────────────── */

/* GF(256) under the polynomial x⁸ + x⁴ + x³ + x² + 1. Two tables turn
   multiplication into addition of logarithms. */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

export function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** The generator polynomial of a given degree: (x − α⁰)(x − α¹)…(x − αⁿ⁻¹). */
export function generator(degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

/**
 * The error-correction bytes for a block: the remainder when the data,
 * shifted up by the degree, is divided by the generator. Long division,
 * with XOR for subtraction.
 */
export function reedSolomon(data, degree) {
  const g = generator(degree);
  const rem = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift();
    rem.push(0);
    if (factor) for (let j = 0; j < degree; j++) rem[j] ^= gfMul(g[j + 1], factor);
  }
  return rem;
}

/**
 * A received block evaluated at each root of the generator. All zeros means
 * the block is a genuine codeword; anything else means damage. This is how a
 * reader knows something is wrong, and it is how the tests check the encoder
 * without trusting any part of it.
 */
export function syndromes(block, degree) {
  const out = [];
  for (let i = 0; i < degree; i++) {
    let s = 0;
    for (const byte of block) s = gfMul(s, EXP[i]) ^ byte;
    out.push(s);
  }
  return out;
}

/* ── the codewords ───────────────────────────────────────────────────────── */

/**
 * The full byte stream for a segment at a version and level: data padded to
 * capacity, cut into blocks, each block given its error correction, and the
 * lot interleaved. Returns the blocks as well, for the picture of it.
 */
export function codewords(seg, version, level) {
  const capacity = dataCapacity(version, level);
  const bits = [];
  push(bits, MODES[seg.mode].bits, 4);
  push(bits, seg.count, countBits(seg.mode, version));
  bits.push(...seg.bits);
  if (bits.length > capacity * 8) throw new RangeError('does not fit');
  /* Terminator: up to four zeros. Then zeros to the byte. Then the two
     filler bytes, alternating, to the end. */
  for (let i = 0; i < 4 && bits.length < capacity * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

  /* Blocks. When the bytes do not divide evenly the later blocks take one
     extra — "short" blocks first, then "long" ones. */
  const nBlocks = BLOCKS[level][version], eccLen = ECC_PER_BLOCK[level][version];
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortLen = Math.floor(raw / nBlocks);
  const nShort = nBlocks - (raw % nBlocks);
  const blocks = [];
  for (let i = 0, at = 0; i < nBlocks; i++) {
    const len = shortLen - eccLen + (i < nShort ? 0 : 1);
    const d = data.slice(at, at + len);
    at += len;
    blocks.push({ data: d, ecc: reedSolomon(d, eccLen) });
  }

  /* Interleave: the first byte of every block, then the second of every
     block, and so on — data first, then error correction the same way. */
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) out.push(b.ecc[i]);
  return { bytes: out, blocks, dataBytes: data.length, eccLen, usedBits: 4 + countBits(seg.mode, version) + seg.bits.length };
}

/* ── the square ──────────────────────────────────────────────────────────── */

/** Where the alignment patterns go, along each axis, for a version. */
export function alignmentPositions(version) {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

/* What each module is for, so the page can show how the code is built.
   0 is data or error correction; everything else is a fixed pattern. */
export const PART = { data: 0, ecc: 1, finder: 2, timing: 3, alignment: 4, format: 5, version: 6, dark: 7, remainder: 8 };

/** The 15-bit format word: level and mask, with ten bits of BCH protection. */
export function formatBits(level, mask) {
  const data = (FORMAT_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The 18-bit version word, for versions 7 and up: six bits and a Golay code. */
export function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

export const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Square {
  constructor(version) {
    this.version = version;
    this.size = version * 4 + 17;
    const n = this.size * this.size;
    this.dark = new Uint8Array(n);
    this.fixed = new Uint8Array(n);
    this.part = new Uint8Array(n);
  }
  set(x, y, dark, part) {
    const i = y * this.size + x;
    this.dark[i] = dark ? 1 : 0;
    this.fixed[i] = 1;
    this.part[i] = part;
  }
  get(x, y) { return this.dark[y * this.size + x] === 1; }
}

function drawPatterns(sq) {
  const { size } = sq;
  for (let i = 0; i < size; i++) {
    sq.set(6, i, i % 2 === 0, PART.timing);
    sq.set(i, 6, i % 2 === 0, PART.timing);
  }
  /* A finder is a 7×7 bullseye — dark ring, light ring, dark 3×3 — with a
     light separator round it. Drawn by distance from the centre. */
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        sq.set(x, y, d !== 2 && d !== 4, PART.finder);
      }
    }
  }
  const pos = alignmentPositions(sq.version);
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      /* Not where a finder already is. */
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          sq.set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, PART.alignment);
        }
      }
    }
  }
  /* Reserve the format areas now, fill them once the mask is chosen. */
  drawFormat(sq, 'L', 0);
  if (sq.version >= 7) {
    const bits = versionBits(sq.version);
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      sq.set(a, b, on, PART.version);
      sq.set(b, a, on, PART.version);
    }
  }
}

function drawFormat(sq, level, mask) {
  const { size } = sq;
  const bits = formatBits(level, mask);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  /* Two copies: one wrapped round the top-left finder, one split between
     the other two. Either is enough; there are two because a smudge over
     one finder should not make the whole code unreadable. */
  for (let i = 0; i <= 5; i++) sq.set(8, i, bit(i), PART.format);
  sq.set(8, 7, bit(6), PART.format);
  sq.set(8, 8, bit(7), PART.format);
  sq.set(7, 8, bit(8), PART.format);
  for (let i = 9; i < 15; i++) sq.set(14 - i, 8, bit(i), PART.format);
  for (let i = 0; i < 8; i++) sq.set(size - 1 - i, 8, bit(i), PART.format);
  for (let i = 8; i < 15; i++) sq.set(8, size - 15 + i, bit(i), PART.format);
  /* And one module that is always dark, for no reason but the standard. */
  sq.set(8, size - 8, true, PART.dark);
}

/**
 * Snake the bytes into every module no pattern has claimed: two columns at a
 * time, right to left, up then down then up, stepping over the vertical
 * timing line. Most significant bit first.
 */
function drawData(sq, bytes, dataBytes) {
  const { size } = sq;
  let i = 0;
  const total = bytes.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let v = 0; v < size; v++) {
      const y = upward ? size - 1 - v : v;
      for (let j = 0; j < 2; j++) {
        const x = right - j, at = y * size + x;
        if (sq.fixed[at]) continue;
        if (i < total) {
          sq.dark[at] = (bytes[i >>> 3] >>> (7 - (i & 7))) & 1;
          sq.part[at] = (i >>> 3) < dataBytes ? PART.data : PART.ecc;
          i++;
        } else {
          sq.dark[at] = 0;
          sq.part[at] = PART.remainder;
        }
      }
    }
  }
}

function applyMask(sq, mask) {
  const f = MASKS[mask];
  for (let y = 0; y < sq.size; y++) {
    for (let x = 0; x < sq.size; x++) {
      const at = y * sq.size + x;
      if (!sq.fixed[at] && f(x, y)) sq.dark[at] ^= 1;
    }
  }
}

/**
 * How bad a masked square is for a camera, by the standard's four rules:
 * long runs of one colour, 2×2 blocks, anything that looks like a finder
 * pattern where there is none, and a balance of dark and light that is far
 * from half. Lower is better.
 */
export function penalty(dark, size) {
  let score = 0;
  const at = (x, y) => dark[y * size + x];
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b <= size; b++) {
        const same = b < size && (pass ? at(a, b) === at(a, b - 1) : at(b, a) === at(b - 1, a));
        if (same) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      /* 1:1:3:1:1, with four light modules on one side — and the quiet zone
         round the code counts as light, so a lookalike pressed against the
         edge is caught too. That is the case a camera actually trips on. */
      for (let b = -4; b + 7 <= size; b++) {
        const v = (k) => {
          const i = b + k;
          return i < 0 || i >= size ? 0 : (pass ? at(a, i) : at(i, a));
        };
        const core = v(4) && !v(5) && v(6) && v(7) && v(8) && !v(9) && v(10);
        const coreRev = v(0) && !v(1) && v(2) && v(3) && v(4) && !v(5) && v(6);
        if (core && !v(0) && !v(1) && !v(2) && !v(3)) score += 40;
        if (coreRev && !v(7) && !v(8) && !v(9) && !v(10)) score += 40;
      }
    }
  }
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
    }
  }
  let n = 0;
  for (const d of dark) n += d;
  const total = size * size;
  score += (Math.ceil(Math.abs(n * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/* ── the whole thing ─────────────────────────────────────────────────────── */

/**
 * Text in, square out.
 *
 * `level` is the least error correction wanted. When the chosen size has
 * room for more at no cost — the data would fit at a stronger level without
 * growing the code — it is raised, because a code that survives more damage
 * for free is strictly better. `boost: false` turns that off.
 */
export function encode(text, { level = 'M', boost = true, mask = -1, minVersion = 1, maxVersion = 40 } = {}) {
  const seg = segment(text);
  let version = 0;
  for (let v = minVersion; v <= maxVersion; v++) {
    const need = 4 + countBits(seg.mode, v) + seg.bits.length;
    if (seg.count < 2 ** countBits(seg.mode, v) && need <= dataCapacity(v, level) * 8) { version = v; break; }
  }
  if (!version) {
    const max = charCapacity(maxVersion, level, seg.mode);
    throw new RangeError(`too long for a QR code at this level: ${seg.count} ${seg.mode === 'byte' ? 'bytes' : 'characters'}, and the most it holds is ${max}`);
  }
  if (boost) {
    for (const up of ['M', 'Q', 'H']) {
      const order = 'LMQH';
      if (order.indexOf(up) <= order.indexOf(level)) continue;
      if (4 + countBits(seg.mode, version) + seg.bits.length <= dataCapacity(version, up) * 8) level = up;
    }
  }

  const cw = codewords(seg, version, level);
  const sq = new Square(version);
  drawPatterns(sq);
  drawData(sq, cw.bytes, cw.dataBytes);

  let chosen = mask, best = Infinity;
  if (chosen < 0) {
    for (let m = 0; m < 8; m++) {
      applyMask(sq, m);
      drawFormat(sq, level, m);
      const p = penalty(sq.dark, sq.size);
      if (p < best) { best = p; chosen = m; }
      applyMask(sq, m);                       // XOR again undoes it
    }
  }
  applyMask(sq, chosen);
  drawFormat(sq, level, chosen);

  return {
    text, version, level, mask: chosen, mode: seg.mode, size: sq.size,
    modules: sq.dark, parts: sq.part,
    dataBytes: cw.dataBytes, usedBytes: Math.ceil(cw.usedBits / 8), eccLen: cw.eccLen,
    blocks: cw.blocks, bytes: cw.bytes,
    isDark: (x, y) => sq.get(x, y),
  };
}

/* ── things people put in QR codes ───────────────────────────────────────── */

/**
 * A Wi-Fi network, in the format phone cameras recognise. Backslash,
 * semicolon, comma, colon and double quote are escaped — a password with a
 * semicolon in it otherwise ends the field early, and the code scans, and
 * joins nothing.
 */
export function wifi({ ssid, password = '', security = 'WPA', hidden = false }) {
  const esc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');
  const sec = security === 'none' ? 'nopass' : security;
  return `WIFI:T:${sec};S:${esc(ssid)};${sec === 'nopass' ? '' : `P:${esc(password)};`}${hidden ? 'H:true;' : ''};`;
}

/** An email with the subject already filled in. */
export function mailto({ to, subject = '', body = '' }) {
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean);
  return `mailto:${to}${q.length ? `?${q.join('&')}` : ''}`;
}

/** The code as an SVG: one path, so it stays one crisp shape at any size. */
export function toSVG(qr, { margin = 4, dark = '#000', light = '#fff' } = {}) {
  const n = qr.size + margin * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y * qr.size + x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">`
    + `<rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

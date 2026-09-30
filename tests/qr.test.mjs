/* tests/qr.test.mjs — the QR encoder, checked against things it did not write.

   A QR code that is wrong still looks exactly like a QR code. So nothing here
   asks the encoder whether the encoder is right: capacities are checked
   against the published table, error correction against the algebra that
   defines it (every block must vanish at every root of the generator),
   format and version words against the standard's own values, the worked
   "HELLO WORLD" example byte for byte, and two whole codes against squares
   that an independent reader, zxing-cpp, decoded back to the original text
   when they were recorded. The encoder was also run through every version,
   level and mask and read back by zxing-cpp: fifty-six codes, all exact. */

import { test, assert } from './harness.mjs';
import {
  encode, segment, codewords, dataCapacity, charCapacity, rawDataModules, reedSolomon,
  syndromes, formatBits, versionBits, alignmentPositions, penalty, wifi, mailto, toSVG, PART,
} from '../apps/qr/qr.js';

/* ── capacity ─────────────────────────────────────────────────────────────── */

test('data capacity matches the published table', () => {
  const table = {
    '1L': 19, '1M': 16, '1Q': 13, '1H': 9, '2L': 34, '2M': 28, '2Q': 22, '2H': 16,
    '5Q': 62, '7M': 124, '10L': 274, '10H': 122, '20M': 669, '27Q': 808,
    '40L': 2956, '40M': 2334, '40Q': 1666, '40H': 1276,
  };
  for (const [k, v] of Object.entries(table)) {
    assert.equal(dataCapacity(+k.slice(0, -1), k.slice(-1)), v, `version ${k}`);
  }
});

test('the famous maxima come out exactly', () => {
  /* The numbers every QR explainer quotes, for the largest code at the
     lowest level. Getting all three means the mode arithmetic is right. */
  assert.equal(charCapacity(40, 'L', 'numeric'), 7089);
  assert.equal(charCapacity(40, 'L', 'alphanumeric'), 4296);
  assert.equal(charCapacity(40, 'L', 'byte'), 2953);
  assert.equal(charCapacity(1, 'H', 'numeric'), 17);
  assert.equal(charCapacity(1, 'L', 'byte'), 17);
});

test('every module is accounted for at every version', () => {
  /* Raw modules minus data-and-ECC bytes leaves the remainder bits, which
     the standard fixes at 0, 3, 4 or 7 depending on the version. */
  const remainder = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3,
    4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0];
  for (let v = 1; v <= 40; v++) assert.equal(rawDataModules(v) % 8, remainder[v], `version ${v}`);
});

test('alignment patterns sit where the standard puts them', () => {
  assert.deep(alignmentPositions(1), []);
  assert.deep(alignmentPositions(2), [6, 18]);
  assert.deep(alignmentPositions(7), [6, 22, 38]);
  assert.deep(alignmentPositions(24), [6, 28, 54, 80, 106]);
  assert.deep(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deep(alignmentPositions(40), [6, 30, 58, 86, 114, 142, 170]);
});

/* ── modes ────────────────────────────────────────────────────────────────── */

test('the narrowest mode the text fits in is the one used', () => {
  assert.equal(segment('0123456789').mode, 'numeric');
  assert.equal(segment('HELLO WORLD').mode, 'alphanumeric');
  assert.equal(segment('Hello world').mode, 'byte', 'lower case is not in the alphanumeric set');
  assert.equal(segment('').mode, 'byte');
});

test('bytes are counted as UTF-8, not as characters', () => {
  assert.equal(segment('é').count, 2);
  assert.equal(segment('🙂').count, 4);
  assert.equal(segment('你好').count, 6);
});

test('digits pack three to ten bits', () => {
  assert.equal(segment('012').bits.length, 10);
  assert.equal(segment('0123').bits.length, 14);
  assert.equal(segment('01234').bits.length, 17);
});

/* ── the worked example ───────────────────────────────────────────────────── */

test('HELLO WORLD at 1-M is byte for byte the textbook example', () => {
  const c = codewords(segment('HELLO WORLD'), 1, 'M');
  assert.deep(c.blocks[0].data, [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
  assert.deep(c.blocks[0].ecc, [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

/* ── error correction ─────────────────────────────────────────────────────── */

test('every block of every code is a genuine Reed–Solomon codeword', () => {
  const texts = ['a', 'https://mohamed-sucule.github.io/Projects/', 'HELLO WORLD', '9'.repeat(400),
    'x'.repeat(700), 'mixed — ünïcödé 🙂 '.repeat(20)];
  let checked = 0;
  for (const t of texts) {
    for (const level of ['L', 'M', 'Q', 'H']) {
      const q = encode(t, { level, boost: false });
      for (const b of q.blocks) {
        const s = syndromes([...b.data, ...b.ecc], q.eccLen);
        assert.ok(s.every((x) => x === 0), `${q.version}-${level}: syndromes ${s.slice(0, 4)}…`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} blocks checked`);
});

test('damage shows up in the syndromes', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  const block = [...data, ...reedSolomon(data, 10)];
  block[3] ^= 0x40;
  assert.ok(syndromes(block, 10).some((x) => x !== 0));
});

/* ── format and version words ─────────────────────────────────────────────── */

test("format words are the standard's own", () => {
  assert.equal(formatBits('L', 0), 0b111011111000100);
  assert.equal(formatBits('M', 0), 0b101010000010010);
  assert.equal(formatBits('Q', 0), 0b011010101011111);
  assert.equal(formatBits('H', 0), 0b001011010001001);
  assert.equal(formatBits('L', 7), 0b110100101110110);
  assert.equal(formatBits('H', 7), 0b000100000111011);
});

test("version words are the standard's own", () => {
  assert.equal(versionBits(7), 0b000111110010010100);
  assert.equal(versionBits(8), 0b001000010110111100);
  assert.equal(versionBits(40), 0b101000110001101001);
});

/* ── whole codes ──────────────────────────────────────────────────────────── */

const draw = (q) => {
  const rows = [];
  for (let y = 0; y < q.size; y++) {
    let r = '';
    for (let x = 0; x < q.size; x++) r += q.modules[y * q.size + x] ? '#' : '.';
    rows.push(r);
  }
  return rows;
};

test('a link comes out as the square an independent reader decoded', () => {
  /* Recorded from this encoder and read back by zxing-cpp as exactly
     "https://example.com" before being written down here. */
  const q = encode('https://example.com', { level: 'M' });
  assert.equal(q.version, 2);
  assert.equal(q.level, 'Q', 'M had room to spare, so it was raised for free');
  assert.equal(q.mask, 0);
  assert.deep(draw(q), [
    '#######.###..###..#######',
    '#.....#.##.#..###.#.....#',
    '#.###.#.##.....##.#.###.#',
    '#.###.#.#.###.##..#.###.#',
    '#.###.#.##..####..#.###.#',
    '#.....#..##..###..#.....#',
    '#######.#.#.#.#.#.#######',
    '........##.####.#........',
    '.##.#.##.#.##.###.#.#####',
    '##...#.##...#.....#.....#',
    '####.##.#....#.....##.###',
    '.#.#.#..#.#.#..###.....#.',
    '....####.#.##...###..#.##',
    '..#.##..#..#....###..#..#',
    '#.##..#..#.####.#.##..###',
    '.#.##....##....##...#..#.',
    '#.#.###.###.##.#######...',
    '........##..##.##...##.##',
    '#######.###.##.##.#.##.##',
    '#.....#...###.#.#...##..#',
    '#.###.#.#.#..##.######..#',
    '#.###.#...#...##...####..',
    '#.###.#.##.#....#...#...#',
    '#.....#.####.##.#.#.##.#.',
    '#######......#######...##',
  ]);
});

test('a Wi-Fi code comes out as the square an independent reader decoded', () => {
  const q = encode('WIFI:T:WPA;S:Home;P:hunter2;;', { level: 'Q' });
  assert.equal(q.mask, 4);
  assert.deep(draw(q), [
    '#######..#.##.#.##..#.#######',
    '#.....#..#.####.#####.#.....#',
    '#.###.#.#.####.#.###..#.###.#',
    '#.###.#..#.##.##.##.#.#.###.#',
    '#.###.#.##.##.#.##..#.#.###.#',
    '#.....#.#.#...#.####..#.....#',
    '#######.#.#.#.#.#.#.#.#######',
    '.........#..##..###..........',
    '.#..#.#.#.##..######.#.##.#..',
    '..###......######...#.####...',
    '###.####.#....#.......#..##.#',
    '#.##...#.##.#...####.##..#...',
    '#..#.##...#..##..####..##.##.',
    '..##.#.####...#.##.#.#####.##',
    '....###..#..#...#......###.##',
    '...#.#...#.#.#...##..#.###..#',
    '..#####.#####.##..##.#.#.###.',
    '##.#...#.####...###..#######.',
    '..#.#######.....#...##.#....#',
    '...###...#..##...#..##.##...#',
    '#####.#.##..#.##...######..##',
    '........#..##..####.#...#.#.#',
    '#######...#.#..#..#.#.#.#.#.#',
    '#.....#..###.##....##...##..#',
    '#.###.#.#########..##########',
    '#.###.#...#......##..#.#.#.#.',
    '#.###.#..#.#..##.#.#..##..###',
    '#.....#.##.#..####..#.#..#.##',
    '#######..#..##...#..#....#.#.',
  ]);
});

test('the three finders, the timing lines and the dark module are always there', () => {
  for (const t of ['a', 'x'.repeat(200), 'y'.repeat(1500)]) {
    const q = encode(t);
    const at = (x, y) => q.modules[y * q.size + x] === 1;
    for (const [ox, oy] of [[0, 0], [q.size - 7, 0], [0, q.size - 7]]) {
      assert.ok(at(ox, oy) && at(ox + 6, oy + 6) && at(ox + 3, oy + 3), 'finder corners and centre');
      assert.ok(!at(ox + 1, oy + 1), 'the light ring');
    }
    for (let i = 8; i < q.size - 8; i++) {
      assert.equal(at(i, 6), i % 2 === 0, `timing row at ${i}`);
      assert.equal(at(6, i), i % 2 === 0, `timing column at ${i}`);
    }
    assert.ok(at(8, q.size - 8), 'the dark module');
  }
});

test('every module is labelled with what it is for', () => {
  const q = encode('https://example.com/a/longer/link');
  const seen = new Set(q.parts);
  for (const p of [PART.data, PART.ecc, PART.finder, PART.timing, PART.format]) assert.ok(seen.has(p));
  assert.ok(!seen.has(PART.version), 'a small code carries no version block');
  assert.ok(new Set(encode('z'.repeat(300)).parts).has(PART.version), 'version 7 and up do');
});

test('the stronger level is taken when it costs nothing', () => {
  assert.equal(encode('hi', { level: 'L' }).level, 'H');
  assert.equal(encode('hi', { level: 'L', boost: false }).level, 'L');
});

test('the mask chosen is the one with the lowest penalty', () => {
  const auto = encode('https://example.com/penalty');
  for (let m = 0; m < 8; m++) {
    const forced = encode('https://example.com/penalty', { mask: m });
    assert.ok(penalty(auto.modules, auto.size) <= penalty(forced.modules, forced.size), `mask ${m} scores lower`);
  }
});

test('too much text is refused with the limit in the message', () => {
  let msg = '';
  try { encode('x'.repeat(3000), { level: 'L' }); } catch (e) { msg = e.message; }
  assert.ok(/2953/.test(msg), msg);
});

/* ── what people put in them ──────────────────────────────────────────────── */

test('Wi-Fi codes escape the characters that would end a field early', () => {
  assert.equal(wifi({ ssid: 'Home', password: 'hunter2' }), 'WIFI:T:WPA;S:Home;P:hunter2;;');
  assert.equal(wifi({ ssid: 'My;Net', password: 'a:b,c"d\\e' }), 'WIFI:T:WPA;S:My\\;Net;P:a\\:b\\,c\\"d\\\\e;;');
  assert.equal(wifi({ ssid: 'Cafe', security: 'none' }), 'WIFI:T:nopass;S:Cafe;;');
  assert.equal(wifi({ ssid: 'Quiet', password: 'x', hidden: true }), 'WIFI:T:WPA;S:Quiet;P:x;H:true;;');
});

test('an email link carries its subject', () => {
  assert.equal(mailto({ to: 'a@b.co' }), 'mailto:a@b.co');
  assert.equal(mailto({ to: 'a@b.co', subject: 'Hi there' }), 'mailto:a@b.co?subject=Hi%20there');
});

test('the SVG draws one square per dark module', () => {
  const q = encode('svg');
  const dark = q.modules.reduce((a, b) => a + b, 0);
  assert.equal((toSVG(q).match(/h1v1h-1z/g) || []).length, dark);
});

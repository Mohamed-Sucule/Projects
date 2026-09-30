# QR codes — from the bits up

**[Open it](index.html)** · Type a link, some text, a Wi-Fi network or an email address and it
is a QR code before you finish typing. Download it as PNG or SVG, or copy it straight into a
document. Nothing you type leaves the page.

Every QR generator on the web is a coat of paint over the same few libraries. This one is the
thing underneath, written out in [`qr.js`](qr.js):

1. **Mode.** Digits pack three to ten bits; a restricted uppercase alphabet packs two to eleven;
   anything else is UTF-8 at eight bits a byte. The narrowest mode the text fits wins.
2. **Version.** The smallest of the forty sizes whose capacity holds it — worked out from the
   size of the square minus every fixed pattern, not read off a chart.
3. **Error correction.** The data is cut into blocks and each block gets Reed–Solomon bytes:
   polynomial long division in GF(256), where addition is XOR and nothing overflows. Level H
   means the code still reads with about 30% of it gone.
4. **Interleaving,** so a scratch costs every block a little rather than one block everything.
5. **Placement.** Bits snake through the square two columns at a time from the bottom right,
   stepping round the finders, the timing lines and the alignment patterns.
6. **Masking.** All eight masks are tried and scored against the standard's four penalty rules —
   runs, blocks, finder look-alikes, dark/light balance — and the lowest wins.

Tick **Show how it is built** and every module is coloured by what it is for. Most of a QR code
is not your data.

## Checked against things it did not write

A wrong QR code still looks exactly like a QR code, so the tests never ask the encoder whether
the encoder is right:

- capacities against the published table, including the three numbers every explainer quotes
  (7,089 digits, 4,296 alphanumerics, 2,953 bytes at 40-L);
- every error-correction block against the algebra that defines it — a genuine codeword
  evaluates to zero at every root of the generator;
- the format and version words against the standard's own values;
- the textbook "HELLO WORLD" at 1-M, byte for byte;
- two whole codes against squares an independent reader decoded back to the original text.

During development every version, level and mask was also rendered and read back by
[zxing-cpp](https://github.com/zxing-cpp/zxing-cpp): 56 codes, all exact.

## Two small things it does that most generators do not

- **Free robustness.** If the text fits at a stronger error-correction level without making the
  code any bigger, it takes the stronger level and says so.
- **Honest warnings.** Colours the wrong way round, or too close in brightness, get a warning
  before you print a thousand stickers; so does a code dense enough that phone cameras struggle.

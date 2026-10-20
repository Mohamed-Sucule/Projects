/* How long the engine takes over the work a big sheet asks of it, measured in Node.
   Run with `npm run bench`. Each figure is the median of several runs. */

import { EXAMPLES } from '../src/app/examples';
import { Sheet } from '../src/engine/sheet';

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function time(label: string, runs: number, setup: () => () => void) {
  const ms: number[] = [];
  for (let i = 0; i < runs; i++) {
    const run = setup();
    const t0 = performance.now();
    run();
    ms.push(performance.now() - t0);
  }
  console.log(`${label.padEnd(58)} ${median(ms).toFixed(1).padStart(8)} ms`);
}

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!;
const stress = example('stress').cells();
const shop = example('shop').cells();

time('Open the 200,000-formula sheet (parse, link, calculate)', 5, () => {
  const sheet = new Sheet();
  return () => sheet.load(stress);
});

const big = new Sheet();
big.load(stress);
let n = 1;
time('Change A1: recalculate the chain and everything reading it', 7, () => () => {
  big.apply([{ row: 0, col: 0, input: String(++n) }]);
});
time('Change the last link: recalculate only what reads it', 7, () => () => {
  big.apply([{ row: 99_999, col: 0, input: String(++n) }]);
});
time('Insert a row at the top (every reference below moves)', 3, () => {
  const s = new Sheet();
  s.load(stress);
  return () => s.restructure({ kind: 'insertRows', at: 0, count: 1 });
});

time('Open Shop sales (2,000 orders, lookups, SUMIFS)', 7, () => {
  const sheet = new Sheet();
  return () => sheet.load(shop);
});
const store = new Sheet();
store.load(shop);
let p = 4;
time('Change one price in Shop sales', 7, () => () => {
  store.apply([{ row: 3, col: 9, input: String((p += 0.25)) }]);
});

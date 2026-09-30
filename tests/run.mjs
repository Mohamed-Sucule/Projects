#!/usr/bin/env node
/* tests/run.mjs — a test runner in 30 lines, because a repo with no
   dependencies should not grow one just to say "expected true".

   Usage: node tests/run.mjs [name-filter]
*/

import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { tally, test } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2];
const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);

const files = (await readdir(here))
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !filter || f.includes(filter))
  .sort();

if (!files.length) {
  console.log(`no test files matched ${JSON.stringify(filter)}`);
  process.exit(1);
}

for (const f of files) {
  process.stdout.write('\n' + c('1;36', f.replace('.test.mjs', '')) + '\n');
  await import(pathToFileURL(join(here, f)).href);
}

/* The site says how many tests there are — on the front page twice and in
   the README once. Those numbers went stale three times over before this
   check existed, once in the embarrassing direction: five pieces were cut,
   their tests went with them, and the page went on saying "over 800" about a
   suite of 785. So when the whole suite has run, every claimed count is read
   back and checked against the number that actually ran. A filtered run
   (one file) skips it, since it has not run everything. */
if (!filter) {
  const read = (f) => readFileSync(join(here, '..', f), 'utf8');
  const claims = [
    ['the front page specification', read('index.html').match(/Tests, run before publishing<\/dt><dd>([\d,]+)\+<\/dd>/)?.[1]],
    ['the front page colophon', read('index.html').match(/over ([\d,]+) tests, run in CI/)?.[1]],
    ['the README', read('README.md').match(/Over ([\d,]+) tests run in CI/)?.[1]],
  ];
  process.stdout.write('\n' + c('1;36', 'claims') + '\n');
  const ran = tally.passed + tally.failed;
  for (const [where, n] of claims) {
    test(`${where} does not claim more tests than ran`, () => {
      if (!n) throw new Error(`could not find the count in ${where}`);
      const claimed = Number(n.replace(/,/g, ''));
      if (claimed > ran) throw new Error(`${where} says over ${claimed}; ${ran} ran`);
    });
  }
}

const total = tally.passed + tally.failed;
process.stdout.write(
  '\n' + c(tally.failed ? '1;31' : '1;32', `${tally.passed}/${total} passed`) +
  (tally.failed ? c('31', ` (${tally.failed} failed)`) : '') + '\n\n');
process.exit(tally.failed ? 1 : 0);

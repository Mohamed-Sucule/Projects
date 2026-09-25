#!/usr/bin/env node
/* tests/run.mjs — a test runner in 30 lines, because a repo with no
   dependencies should not grow one just to say "expected true".

   Usage: node tests/run.mjs [name-filter]
*/

import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tally } from './harness.mjs';

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

const total = tally.passed + tally.failed;
process.stdout.write(
  '\n' + c(tally.failed ? '1;31' : '1;32', `${tally.passed}/${total} passed`) +
  (tally.failed ? c('31', ` (${tally.failed} failed)`) : '') + '\n\n');
process.exit(tally.failed ? 1 : 0);

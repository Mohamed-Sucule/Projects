/* tests/pages.test.mjs — the things every page on this site owes the reader.

   Thirty-one pages written over months, each one finished and then left alone.
   Nothing checked that they agreed with each other, so they drifted: six had no
   doctype at all and rendered in quirks mode, decoded as windows-1252, with
   every em-dash and box-drawing character in them mangled; those same six had no
   viewport tag, so a phone laid them out at 980px and shrank the result until
   the text was unreadable.

   None of that throws. None of it fails a unit test of the thing the page is
   about. It is exactly the class of rot that only a sweep catches, so this is
   the sweep, and it runs with everything else. */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const pages = ['index.html', 'playground.html', 'cv/index.html', 'atlas/index.html'];
for (const dir of ['apps', 'play', 'projects', 'atlas/projects', 'writing']) {
  for (const name of readdirSync(join(root, dir)).sort()) {
    const href = `${dir}/${name}/index.html`;
    if (existsSync(join(root, href))) pages.push(href);
  }
}

const read = (href) => readFileSync(join(root, href), 'utf8');
const titleOf = (html) => (html.match(/<title>([^<]*)<\/title>/) ?? [, ''])[1];

test('there are pages to check', () => {
  assert.ok(pages.length > 25, `only found ${pages.length} pages`);
});

for (const href of pages) {
  test(`${href} is a well-formed document`, () => {
    const html = read(href);

    /* No doctype means quirks mode, which changes the box model under code
       written for the standard one. Six pages here were in it. */
    assert.ok(/^\s*<!doctype html>/i.test(html), 'no doctype — this page renders in quirks mode');
    assert.ok(/<html[^>]*\slang="/i.test(html), 'no lang on <html>');

    /* Without a charset the browser guesses, and it guessed windows-1252 —
       which turns every em-dash on the page into three wrong characters. */
    assert.ok(/<meta\s+charset="utf-8"/i.test(html), 'no UTF-8 charset declaration');

    /* Without this a phone lays the page out at 980px and shrinks it to fit. */
    assert.ok(/<meta\s+name="viewport"[^>]*width=device-width/i.test(html),
      'no viewport meta — this page is unusable on a phone');

    assert.ok(/<meta\s+name="description"\s+content="[^"]{40,}"/i.test(html),
      'no description, or one too short to be useful');
    assert.ok(/<meta\s+property="og:title"/i.test(html), 'no og:title — shared links show nothing');
    assert.ok(/<meta\s+property="og:description"/i.test(html), 'no og:description');
    assert.ok(/<link\s+rel="icon"/i.test(html), 'no favicon');
    assert.ok(/<meta\s+name="theme-color"/i.test(html), 'no theme-color');
  });
}

test('every title carries a descriptor, not just a name', () => {
  /* A title is the one line a search result and a browser tab show. "Raft Lab"
     tells somebody nothing they did not already know from the link they
     clicked. */
  for (const href of pages) {
    const title = titleOf(read(href));
    assert.ok(title.length > 12, `${href} has the title "${title}"`);
    if (href !== 'index.html') {
      assert.ok(title.includes('—'), `${href} has a bare title: "${title}"`);
    }
  }
});

test('every page carries the navigator', () => {
  /* The whole point of it is that it is everywhere. One page without it is the
     one page somebody gets stuck on. */
  for (const href of pages) {
    assert.ok(read(href).includes('shared/navigator.js'), `${href} has no way out`);
  }
});

test('every page closes its own tags', () => {
  for (const href of pages) {
    const html = read(href);
    assert.ok(/<\/body>\s*<\/html>\s*$/i.test(html.trimEnd() + '\n'),
      `${href} does not end with </body></html>`);
  }
});

test('no page has a stray byte order mark', () => {
  /* Invisible, and it lands before the doctype — which puts the page back into
     quirks mode no matter how correct the doctype is. */
  for (const href of pages) {
    assert.ok(!read(href).startsWith('﻿'), `${href} starts with a BOM`);
  }
});

test('internal links point at files that exist', () => {
  /* Relative href="..." in the markup, resolved against the page's own folder.
     Catches a rename that updated the file and not the link to it. */
  for (const href of pages) {
    const html = read(href);
    const dir = dirname(join(root, href));
    for (const m of html.matchAll(/(?:href|src)="(?!https?:|mailto:|#|data:)([^"?#]+)[^"]*"/g)) {
      const target = join(dir, m[1]);
      assert.ok(existsSync(target), `${href} links to missing ${m[1]}`);
    }
  }
});

test('no page gives the same id to two elements', () => {
  /* The README's list of things caught by looking includes six links set in
     shouty capitals because a heading and a list both claimed one id. The
     front page did it again: the contact sheet and the sign-off were both
     "contact", so "Write to me" jumped to a strip of film. The browser does
     not complain, and getElementById just quietly returns the first one. */
  for (const href of pages) {
    const ids = [...read(href).matchAll(/\sid="([^"$]+)"/g)].map((m) => m[1]);
    const seen = new Set();
    for (const id of ids) {
      assert.ok(!seen.has(id), `${href} uses id="${id}" more than once`);
      seen.add(id);
    }
  }
});

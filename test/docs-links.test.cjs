/**
 * Every relative link and asset reference in the repository's Markdown resolves.
 *
 * Documentation lives in two places now — the root README and `docs/` — so a
 * file that moves changes what a link means without changing the link. That is
 * exactly how a docs move silently produces 404s: nothing fails, the text still
 * reads correctly, and only the reader notices.
 *
 * Covers both Markdown links `[text](target)` and HTML `src`/`href` attributes,
 * because the READMEs use both. Absolute URLs, anchors and root-absolute paths
 * are skipped: they do not depend on where the file sits.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const { dirname, join } = require('node:path');

const ROOT = join(__dirname, '..');

/** Every Markdown file outside node_modules and .git. */
function markdownFiles(dir = ROOT, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) markdownFiles(path, found);
    else if (entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

/** A reference that has to resolve against the file's own directory. */
const isRelative = target => !/^[a-z][a-z0-9+.-]*:/i.test(target)
  && !target.startsWith('#')
  && !target.startsWith('/');

test('every relative Markdown link resolves', () => {
  const files = markdownFiles();
  assert.ok(files.length >= 5, 'expected to find the READMEs and docs');

  const broken = [];
  for (const file of files) {
    const dir = dirname(file);
    for (const match of readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      // A link may carry an #anchor; the file part is what must exist.
      const target = match[1].split('#')[0];
      if (target === '' || !isRelative(target)) continue;
      if (!existsSync(join(dir, target))) broken.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(broken, [], `unresolved links:\n${broken.join('\n')}`);
});

test('every relative HTML src/href resolves', () => {
  const files = markdownFiles();
  const broken = [];
  for (const file of files) {
    const dir = dirname(file);
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:src|href)="([^"]+)"/g)) {
      const target = match[1].split('#')[0];
      if (target === '' || !isRelative(target)) continue;
      if (!existsSync(join(dir, target))) broken.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(broken, [], `unresolved references:\n${broken.join('\n')}`);
});

test('only the primary README sits at the repository root', () => {
  // Documentation belongs in docs/; the root README is the entry point and is
  // the one file GitHub renders on landing. Anything else at the root is drift.
  const stray = readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name);

  assert.deepEqual(stray, ['README.md'],
    'move extra Markdown into docs/ — and fix the links that point at it');
});

test('package.json ships every Markdown file under docs', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  // docs/*.md is a glob, so anything directly under docs/ is covered; a nested
  // directory would not be, and would silently not ship.
  const nested = readdirSync(join(ROOT, 'docs'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'assets');
  assert.deepEqual(nested.map(entry => entry.name), [],
    'a nested docs directory needs its own entry in package.json files');
  assert.ok(pkg.files.includes('docs/*.md'), 'docs must ship');
  assert.ok(pkg.files.includes('README.md'), 'the root README must ship');
});
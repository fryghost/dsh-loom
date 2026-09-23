/**
 * Structural parity check between the Chinese and English READMEs.
 *
 * They are maintained as a pair, and the English one is a faithful rendering
 * rather than an independent document — so a heading, table row, code fence or
 * image that appears in one and not the other is drift, not a translation
 * choice. This is cheap to run and catches the drift that manual editing
 * introduces (editing the Chinese file after the English one was written is
 * exactly how it happens).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const zh = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
const en = readFileSync(join(__dirname, '..', 'README.en.md'), 'utf8');

/** Count non-overlapping matches of a global regexp. */
const count = (text, re) => (text.match(re) ?? []).length;

test('both READMEs have the same number of headings', () => {
  assert.equal(count(en, /^#{1,4} /gm), count(zh, /^#{1,4} /gm),
    'a heading added to one README must be added to the other');
});

test('both READMEs have the same number of table rows', () => {
  assert.equal(count(en, /^\|/gm), count(zh, /^\|/gm),
    'a table row added to one README must be added to the other');
});

test('both READMEs have the same number of code fences', () => {
  const fences = count(en, /^```/gm);
  assert.equal(fences, count(zh, /^```/gm), 'fences must pair up in both files');
  assert.equal(fences % 2, 0, 'every fence must be opened and closed');
});

test('both READMEs reference the same images', () => {
  assert.equal(count(en, /<img /g), count(zh, /<img /g));
});

test('both READMEs link to each other', () => {
  assert.match(zh, /\[English\]\(README\.en\.md\)/, 'the Chinese README must offer English');
  assert.match(en, /\[中文\]\(README\.md\)/, 'the English README must offer Chinese');
});
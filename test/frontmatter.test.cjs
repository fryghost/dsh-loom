const test = require('node:test');
const assert = require('node:assert/strict');

const { parseFlatYaml, parseSkillMetadata, splitFrontmatter, unquote } = require('../src/core/frontmatter.cjs');

test('parses a plain skill file', () => {
  const parsed = parseSkillMetadata([
    '---',
    'name: my-skill',
    'description: does a thing',
    '---',
    'Body text here.',
  ].join('\n'));

  assert.deepEqual(parsed, { name: 'my-skill', description: 'does a thing' });
});

test('parses whenToUse when present', () => {
  const parsed = parseSkillMetadata([
    '---',
    'name: my-skill',
    'description: does a thing',
    'whenToUse: when you need the thing',
    '---',
    'Body.',
  ].join('\n'));
  assert.equal(parsed.whenToUse, 'when you need the thing');
});

test('strips quotes from quoted values', () => {
  const parsed = parseSkillMetadata([
    '---',
    'name: "quoted-skill"',
    "description: 'single quoted'",
    '---',
    'Body.',
  ].join('\n'));
  assert.equal(parsed.name, 'quoted-skill');
  assert.equal(parsed.description, 'single quoted');
});

test('handles block scalar descriptions', () => {
  const parsed = parseSkillMetadata([
    '---',
    'name: block-skill',
    'description: |',
    '  line one',
    '  line two',
    '---',
    'Body.',
  ].join('\n'));
  assert.equal(parsed.description, 'line one\nline two');
});

test('refuses a file with no frontmatter', () => {
  assert.equal(parseSkillMetadata('Just a body, no frontmatter.'), undefined);
});

test('refuses frontmatter missing name or description', () => {
  assert.equal(parseSkillMetadata('---\nname: only-name\n---\nBody.'), undefined);
  assert.equal(parseSkillMetadata('---\ndescription: only desc\n---\nBody.'), undefined);
});

test('refuses an invalid skill name, matching DSH rules', () => {
  assert.equal(parseSkillMetadata('---\nname: Bad Name\ndescription: d\n---\nBody.'), undefined);
  assert.equal(parseSkillMetadata('---\nname: UPPER\ndescription: d\n---\nBody.'), undefined);
});

test('accepts digits and hyphens in skill names', () => {
  const parsed = parseSkillMetadata('---\nname: skill-2-go\ndescription: d\n---\nBody.');
  assert.equal(parsed.name, 'skill-2-go');
});

test('unterminated frontmatter is refused rather than guessed at', () => {
  assert.equal(parseSkillMetadata('---\nname: x\ndescription: y\nBody without closing fence'), undefined);
});

test('tolerates CRLF line endings', () => {
  const parsed = parseSkillMetadata('---\r\nname: crlf-skill\r\ndescription: works\r\n---\r\nBody.\r\n');
  assert.equal(parsed.name, 'crlf-skill');
  assert.equal(parsed.description, 'works');
});

test('splitFrontmatter returns the body untouched', () => {
  const split = splitFrontmatter('---\nname: a\n---\nline1\nline2\n');
  assert.equal(split.body, 'line1\nline2\n');
});

test('splitFrontmatter ignores a leading blank line', () => {
  assert.equal(splitFrontmatter('\n---\nname: a\n---\nBody'), undefined);
});

test('nested maps and lists are ignored, not misinterpreted', () => {
  const data = parseFlatYaml([
    'name: nested-skill',
    'metadata:',
    '  owner: someone',
    'tags:',
    '  - one',
    '  - two',
    'description: still parsed',
  ].join('\n'));

  assert.equal(data.name, 'nested-skill');
  assert.equal(data.description, 'still parsed');
  assert.equal(typeof data.metadata, 'string');
});

test('unquote leaves unquoted values alone', () => {
  assert.equal(unquote('plain'), 'plain');
  assert.equal(unquote('"quoted"'), 'quoted');
  assert.equal(unquote('"mismatched'), '"mismatched');
  assert.equal(unquote(''), '');
});

test('a non-string input is refused', () => {
  assert.equal(parseSkillMetadata(undefined), undefined);
  assert.equal(parseSkillMetadata(42), undefined);
});

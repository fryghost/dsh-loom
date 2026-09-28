/**
 * The design-system contract with the HOST, checked against the host's real
 * export list rather than against a hand-written stub.
 *
 * This is the test that would have caught the bug that made Loom look
 * uninstalled on DSH 0.1.7: `4937343a5e feat(web): unify the client visual
 * language` renamed the icon family from a SIZE suffix to a WEIGHT suffix
 * (`IconPlusOutline16` → `IconPlusOutlineRegular`). Destructuring a name the
 * host does not export yields `undefined` silently, and the first render then
 * calls `React.createElement(undefined)`, which THROWS — the slot renderer
 * abdicates the entry and the shipped browser silently returns. Nothing logged
 * a failure: registration reported `ok: true`, because destructuring is not an
 * error. Only comparing the source against the host's actual exports catches it.
 *
 * The host package is resolved from `DSH_CHECKOUT`, falling back to the
 * development default, and the test SKIPS when it cannot be read — the same
 * convention `dsh-baseline.test.js` uses. Its absence is not a Loom defect.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const CHECKOUT = process.env.DSH_CHECKOUT ?? 'D:/deepseek/deepseek-harness';
const CLIENT = join(__dirname, '..', 'src', 'client.cjs');

/**
 * Locate the built primitives artifact.
 *
 * `.pnpm/node_modules` is the hoisted store the checkout resolves through; the
 * package directory is checked too so a plain `node_modules` layout works.
 */
function primitivesArtifact() {
  const candidates = [
    join(CHECKOUT, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js'),
    join(CHECKOUT, 'packages', 'client', 'ui-primitives', 'lib', 'index.js'),
    join(CHECKOUT, 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js'),
  ];
  return candidates.find(candidate => existsSync(candidate));
}

/** The host's real export names, parsed from its built artifact. */
function hostExports(path) {
  const source = readFileSync(path, 'utf8');
  const declaration = /^export \{([\s\S]*?)\};?\s*$/m.exec(source);
  assert.ok(declaration, `could not parse the export list of ${path}`);
  return new Set(declaration[1]
    .split(',')
    .map(entry => entry.trim().split(/\s+as\s+/).pop().trim())
    .filter(Boolean));
}

/**
 * Every identifier the client destructures from the primitives module.
 *
 * Comments are stripped first: the file explains this very pitfall in prose, and
 * the old size-suffixed names appear there as examples.
 */
function requiredNames(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  const declaration = /const\s*\{([\s\S]*?)\}\s*=\s*require\(\s*'@deepseek-ai\/dsh-client-ui-primitives'\s*\)/.exec(code);
  assert.ok(declaration, 'the client must destructure the primitives module');
  return declaration[1]
    .split(',')
    .map(entry => entry.trim().split(':')[0].trim())
    .filter(name => name.length > 0);
}

const artifact = primitivesArtifact();

test('every primitives name the client destructures is really exported by the host', t => {
  if (artifact === undefined) return t.skip(`DSH checkout not available at ${CHECKOUT}`);
  const exports = hostExports(artifact);
  const wanted = requiredNames(readFileSync(CLIENT, 'utf8'));

  assert.ok(wanted.length >= 10, `expected the full atom + icon set, found ${wanted.length}`);

  // The decisive direction: a name the host lacks becomes `undefined` at
  // runtime and throws on first render, invisibly.
  const missing = wanted.filter(name => !exports.has(name));
  assert.deepEqual(missing, [],
    `the host does not export: ${missing.join(', ')} — destructuring these yields undefined and crashes the first render`);
});

test('the client references no size-suffixed icon name, which no longer exists', t => {
  if (artifact === undefined) return t.skip(`DSH checkout not available at ${CHECKOUT}`);
  const exports = hostExports(artifact);
  const code = readFileSync(CLIENT, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

  // Read the identifiers back out of the code, not out of the import list, so a
  // call site that survived the rename is caught even if the import changed.
  const referenced = new Set();
  for (const match of code.matchAll(/\b(Icon[A-Za-z0-9]*Outline[A-Za-z0-9]*)\b/g)) referenced.add(match[1]);

  const stale = [...referenced].filter(name => !exports.has(name));
  assert.deepEqual(stale, [],
    `these icon names do not exist in the host (renamed by the visual-language commit): ${stale.join(', ')}`);
  assert.ok([...referenced].some(name => name.endsWith('Regular')),
    'the client must reference the host\'s weight-suffixed icon family');
});

test('the client uses the host\'s weight-suffixed icon family', t => {
  if (artifact === undefined) return t.skip(`DSH checkout not available at ${CHECKOUT}`);
  // Separate from the export check above: that one catches a name the host does
  // not have, this one catches the other half — a client that (correctly) stops
  // referencing missing names by simply dropping its icons would pass it.
  const code = readFileSync(CLIENT, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  const referenced = new Set();
  for (const match of code.matchAll(/\b(Icon[A-Za-z0-9]*Outline[A-Za-z0-9]*)\b/g)) referenced.add(match[1]);

  assert.ok(referenced.size >= 8,
    `expected the panel's icon set, found ${referenced.size}: ${[...referenced].join(', ')}`);
  for (const name of referenced) {
    assert.match(name, /Outline(Regular|Medium)$/,
      `${name} is not the host's weight-suffixed family (…OutlineRegular / …OutlineMedium)`);
  }
});

test('the host still exports the atoms the panel builds on', t => {
  if (artifact === undefined) return t.skip(`DSH checkout not available at ${CHECKOUT}`);
  const exports = hostExports(artifact);
  for (const atom of ['Button', 'Tag', 'StateDot', 'Modal', 'Input', 'Menu']) {
    assert.ok(exports.has(atom), `${atom} must come from the shipped design system`);
  }
});

test('the primitives artifact resolves where this test expects it', () => {
  // The point is to keep a SKIP honest. If the checkout is present but the
  // artifact cannot be found, every check above silently skips and the suite
  // reports green while verifying nothing — so that case must fail loudly.
  if (artifact === undefined) {
    assert.ok(!existsSync(CHECKOUT),
      `the checkout exists at ${CHECKOUT} but its primitives artifact was not found; `
      + 'the contract checks above are silently skipping, which hides a real problem');
  } else {
    assert.match(artifact, /dsh-client-ui-primitives[/\\]lib[/\\]index\.js$/,
      'the artifact must be the built primitives entry');
  }
});

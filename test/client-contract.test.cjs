/**
 * Client-half contract checks.
 *
 * These guard two failures that actually shipped:
 *
 *  1. The panel registered and then crashed on its first render, so the slot
 *     machinery ABDICATED the entry and the panel never appeared — with no
 *     visible error. The cause was calling a translate helper as a locale
 *     service method: the locale service has no such method. `t` is
 *     synthesized from the `locale` namespace on the registration and handed
 *     to the component as a PROP.
 *
 *  2. The panel claimed `sidebar.workspaces`, which is `kind: "single"` with
 *     `replaceRisk: "shadows-shipped-ui"`. Claiming it REPLACES the shipped
 *     workspace/session browser, so the user lost their session list. The
 *     additive shape is a `sidebar.panellist` entry whose id addresses a
 *     `main` key.
 *
 * These are source assertions, which is the right shape: both bugs are wrong
 * service/slot surfaces, and neither is visible to a host-side test. Comments
 * are stripped first so prose describing a pitfall is not read as the pitfall.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const CLIENT = join(__dirname, '..', 'src', 'client.cjs');
const BUILD = join(__dirname, '..', 'build.mjs');

/** Remove comments so a mention in prose is not read as a call. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

const source = readFileSync(CLIENT, 'utf8');
const code = stripComments(source);

test('the client half never calls a translate method on the locale service', () => {
  assert.doesNotMatch(
    code,
    /ctx\.locale\.t\s*\(/,
    'the locale service has no translate method; the slot synthesizes t and passes it as a prop',
  );
});

test('every registration that renders translated text names the locale namespace', () => {
  assert.match(code, /ctx\.locale\.register\(\s*NS/, 'the namespace must be registered');
  const named = code.match(/locale:\s*NS/g) ?? [];
  assert.ok(named.length >= 2,
    'both the sidebar entry and the main panel render through t, so both need locale: NS');
});

test('the panel reads its seats from props rather than reaching for services', () => {
  assert.match(code, /useWorkspaces\s*[,}]/, 'the panel must use the seated useWorkspaces prop');
  assert.doesNotMatch(
    code,
    /ctx\.workspaces\.useWorkspaces/,
    'useWorkspaces arrives as a prop; the service path is not the contract',
  );
});

test('a missing seat renders nothing instead of throwing', () => {
  // A render throw abdicates the entry, so this guard is load-bearing.
  assert.match(code, /typeof useWorkspaces !== 'function'/, 'must guard the seat before using it');
});

test('does NOT claim sidebar.workspaces, which would replace the shipped browser', () => {
  assert.doesNotMatch(
    code,
    /name:\s*'sidebar\.workspaces'/,
    'that seat is single + shadows-shipped-ui: claiming it removes the user\'s session list',
  );
});

test('registers a sidebar entry whose id addresses its own main panel', () => {
  const panelId = /name:\s*'sidebar\.panellist'[\s\S]{0,220}?id:\s*'([^']+)'/.exec(code);
  const mainKey = /name:\s*'main'[\s\S]{0,140}?key:\s*'([^']+)'/.exec(code);
  assert.ok(panelId !== null, 'must register an icon in sidebar.panellist');
  assert.ok(mainKey !== null, 'must register a panel in the keyed main slot');
  assert.equal(panelId[1], mainKey[1],
    'the sidebar id addresses the main key: they must match or selecting the entry throws');
  assert.notEqual(panelId[1], 'conversation',
    'the reserved key hosts the Conversation and must not be replaced');
});

test('the sidebar label follows the active locale without re-registering', () => {
  assert.match(code, /label:\s*\(\)\s*=>/, 'a thunk label is re-read per projection');
  assert.match(code, /getLocale\(\)/, 'the label must read the active locale');
});

/*
 * Design-system conformance.
 *
 * The panel first shipped with hand-rolled buttons, badges, and status dots:
 * rectangular 8px-radius controls at 13px text, against a shell whose language
 * is 14px/22px text with capsule r18/h36 buttons and 11px tag capsules. It read
 * as a foreign widget. The fix is to consume the shipped atoms, whose geometry
 * comes from the Figma component and whose styling is token-only — not to
 * approximate them locally.
 */
test('the client builds on the shell design system, not look-alike atoms', () => {
  assert.match(code, /require\(\s*'@deepseek-ai\/dsh-client-ui-primitives'\s*\)/,
    'controls must be the shipped atoms');
  for (const atom of ['Button', 'Tag', 'StateDot', 'Modal', 'Input']) {
    assert.match(code, new RegExp(`\\b${atom}\\b`), `must use the ${atom} atom`);
  }
});

test('the panel does not re-implement control geometry', () => {
  for (const local of ['loom-btn', 'loom-badge', 'loom-dot', 'loom-modal', 'loom-overlay']) {
    assert.doesNotMatch(code, new RegExp(`\\.${local}\\b`),
      `${local} is a hand-rolled control; the design system owns that geometry`);
  }
});

test('the design system stays external so the shell instance is shared', () => {
  const buildScript = stripComments(readFileSync(BUILD, 'utf8'));
  assert.match(buildScript, /@deepseek-ai\/dsh-client-ui-primitives/,
    'build.mjs must keep the platform module external rather than bundling a second copy');
  assert.match(buildScript, /react-dom/, 'react and react-dom are platform modules too');
});
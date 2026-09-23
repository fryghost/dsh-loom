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

test('the client half registers the locale namespace so t is synthesized', () => {
  assert.match(code, /ctx\.locale\.register\(\s*NS/, 'the namespace must be registered');
  assert.match(code, /locale:\s*NS/, 'the sidebar entry renders through a localized label');
});

test('the panel translates from its own dictionaries when no t seat is supplied', () => {
  // The main registration deliberately carries no `locale`, so the panel must
  // be able to label itself without the synthesized seat.
  assert.match(code, /function localTranslate\(/, 'must own a fallback translator');
  assert.match(code, /dictionaries\[active\]/, 'the fallback reads the active locale table');
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

test('opens sessions through the navigation face, not the sessions service', () => {
  // `uiWorkspace.openSession` also calls `layout.selectPanel(null)`, which is
  // what returns the centre column to the Conversation. Calling
  // `ctx.sessions.open` directly sets the current session but leaves the
  // selected panel in place, stranding the user on the Loom panel with no way
  // back — which is exactly how it failed.
  assert.doesNotMatch(code, /ctx\.sessions\?\.open\s*\(/,
    'the sessions service alone does not clear the selected panel');
  assert.match(code, /navigation\.openSession\s*\(/, 'open through the navigation face');
  assert.match(code, /navigation\.startSession\s*\(/, 'and start new chats through it too');
});

test('declares uiWorkspace so navigation cannot silently no-op', () => {
  assert.match(code, /'uiWorkspace'/, 'navigation is essential, so it belongs in inject');
});

test('claims sidebar.workspaces so the three sections include the native grouping', () => {
  // This seat IS the browsing region, and claiming it shadows the shipped
  // browser. That is correct HERE, unlike an earlier attempt that replaced the
  // browser with a projects-only list: 项目 / 工作区 / 聊天 CONTAIN the native
  // workspace grouping, so the user loses nothing.
  assert.match(code, /name:\s*'sidebar\.workspaces'/,
    'the sidebar browser is where the three sections live');
  assert.match(code, /priority:\s*-100/, 'lowest priority renders; this must beat the shipped 0');
  assert.match(code, /LoomSidebarHost/, 'the sections come from the Loom sidebar host');
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
  // A thunk is re-read on every projection; a static string would freeze at
  // registration time and ignore a later locale switch. The thunk may be
  // inline or a named value, so this asserts the semantics, not the syntax.
  assert.match(code, /\blabel\b/, 'the panellist entry must carry a label');
  assert.doesNotMatch(code, /label:\s*['"]/, 'a static string would not follow a locale switch');
  assert.match(code, /getLocale\(\)/, 'the label must read the active locale');
});

/*
 * Stylesheet invariants. Both of these shipped as real bugs — twice each — and
 * neither is visible to any host-side test, so they are asserted here.
 */
test('the injected stylesheet survives its own template literal', () => {
  // The whole CSS block is ONE backtick-delimited template literal, so a stray
  // backtick inside a comment ends it early. The last rule is the sentinel: a
  // truncated capture would stop before reaching it.
  const styles = /const STYLES = `([\s\S]*?)`;/.exec(source);
  assert.ok(styles !== null, 'STYLES must be a backtick-delimited template');
  assert.match(styles[1], /\.loom-warn-note/,
    'the stylesheet must run to its final rule — a stray backtick would cut it short');
});

test('bordered boxes count their border inside their width', () => {
  // width: 100% on a box that has padding and a border, without border-box,
  // overflows its container. The Input atom's wrapper is exactly that box, so
  // this is what made the search field bleed past the sidebar's padding and the
  // project-name field overhang the folder list beneath it.
  const styles = /const STYLES = `([\s\S]*?)`;/.exec(source);
  assert.match(styles[1], /\.loom-input[\s\S]{0,80}box-sizing:\s*border-box/,
    'the full-width input wrapper must use border-box');
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
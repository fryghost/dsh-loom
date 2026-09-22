/**
 * Client-half contract checks.
 *
 * These guard the failure that actually shipped: the panel registered, then
 * crashed on its first render and was ABDICATED by the slot machinery, so the
 * shipped `ui-workspace` browser silently rendered instead and the panel never
 * appeared — with no visible error anywhere.
 *
 * The cause was calling the translate helper as a locale-service method. The
 * locale service exposes `register` / `getLocale` / `setLocale` / `addLanguage`
 * / `subscribe` / `getSnapshot` and has no translate method; the `t` seat is
 * synthesized by the render machinery from the `locale` namespace named on the
 * registration and handed to the component as a PROP.
 *
 * These are source assertions, which is the right shape here: the bug is a
 * wrong service surface and it is invisible to every host-side test. Comments
 * are stripped first so prose describing the pitfall is not mistaken for the
 * pitfall itself.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const CLIENT = join(__dirname, '..', 'src', 'client.cjs');

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
  // `locale: NS` on the registration is what makes the machinery supply `t`.
  assert.match(code, /locale:\s*NS/, 'registration must name the locale namespace');
  assert.match(code, /ctx\.locale\.register\(\s*NS/, 'the namespace must be registered');
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
  // A render throw abdicates the cell to the shipped browser, so this guard is
  // load-bearing, not defensive style.
  assert.match(code, /typeof useWorkspaces !== 'function'/, 'must guard the seat before using it');
});

test('the slot registration targets sidebar.workspaces and outranks the shipped browser', () => {
  assert.match(code, /'sidebar\.workspaces'/, 'the panel lives in the sidebar browsing region');
  assert.match(code, /priority:\s*-100/, 'lowest priority renders; this must beat the shipped 0');
});
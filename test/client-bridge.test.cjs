/**
 * The client half and the host half must agree about the bridge.
 *
 * A disagreement here has no local symptom: the client posts to a route nobody
 * mounted, the carrier answers 404 (or 405 from the static fallback, when the
 * path never mounted at all), and the only visible result is an empty 项目
 * section. That is exactly how the DSH 0.2 transport change presented itself
 * twice, so the two halves now share `src/core/bridge.cjs` AND this file pins
 * that they still use it:
 *
 *   - the names the client calls must be endpoints the host registers;
 *   - the client must not restate a channel of its own (the private
 *     `/dsh-loom` channel cannot be mounted on 0.2 at all);
 *   - the endpoint list must be unique and path-shaped below `/api`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const core = require('../src/core/bridge.cjs');
const { BRIDGE_CHANNEL, BRIDGE_ENDPOINTS, BRIDGE_NAMESPACE, bridgeEndpoint, bridgePath } = core;

const CLIENT = join(__dirname, '..', 'src', 'client.cjs');
const HOST = join(__dirname, '..', 'src', 'index.js');

/** Remove comments so prose describing a pitfall is not read as the pitfall. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

const clientCode = stripComments(readFileSync(CLIENT, 'utf8'));
const hostCode = stripComments(readFileSync(HOST, 'utf8'));

test('the client calls only endpoints the host registers', () => {
  // The client's bridge is a thin wrapper: every endpoint it can reach is a
  // `call('name')` literal. An endpoint added on one side alone is a 404 that
  // looks like an empty list.
  const called = new Set([...clientCode.matchAll(/\bcall\(\s*'([A-Za-z0-9_-]+)'/g)].map(match => match[1]));
  assert.ok(called.size >= 4, `expected the client's four endpoints, found ${[...called].join(', ')}`);
  assert.deepEqual(
    [...called].sort(),
    [...BRIDGE_ENDPOINTS].sort(),
    'the client and the host must serve the same endpoint set (src/core/bridge.cjs is the shared list)',
  );
});

test('the client rides the shared channel through the shared helpers', () => {
  // A client that restates the channel is a client that can drift from the
  // host, which is the whole failure class this file exists for.
  assert.equal(BRIDGE_CHANNEL, '/api', 'Loom rides the carrier channel every Remote call uses');
  assert.match(clientCode, /require\(\s*'\.\/core\/bridge\.cjs'\s*\)/,
    'the client must import the shared route, not restate it');
  assert.match(clientCode, /rpc\.call\(\s*BRIDGE_CHANNEL\s*,\s*bridgeEndpoint\(/,
    'the call must go through the shared channel + endpoint helpers');
  assert.doesNotMatch(clientCode, /['"]\/dsh-loom['"]/,
    'a private channel cannot be mounted from a plugin context on DSH 0.2');
});

test('the host registers exactly the shared endpoint list', () => {
  assert.match(hostCode, /from '\.\/core\/bridge\.cjs'/,
    'the host must import the shared route rather than restate it');
  assert.match(hostCode, /BRIDGE_ENDPOINTS/, 'the host registers one route per shared endpoint');
  assert.match(hostCode, /fetch\.register\(/, 'the route is a Fetch route on the shared channel');
  assert.doesNotMatch(hostCode, /rpc\.handle\(/,
    'a private RPC channel throws `without inject` while a sibling plugin loads on DSH 0.2');
});

test('every endpoint has one absolute path below /api and one endpoint name', () => {
  const paths = BRIDGE_ENDPOINTS.map(bridgePath);
  const names = BRIDGE_ENDPOINTS.map(bridgeEndpoint);
  assert.equal(new Set(paths).size, paths.length, 'two endpoints must not share a route');
  assert.equal(new Set(names).size, names.length, 'two endpoints must not share a name');
  for (const path of paths) {
    assert.equal(path, `/api/${BRIDGE_NAMESPACE}/${path.slice(`/api/${BRIDGE_NAMESPACE}/`.length)}`);
    assert.ok(path.startsWith('/api/'), 'an exact Fetch route is absolute below /api');
    assert.ok(!path.endsWith('/'), 'a trailing slash would not match the pathname the carrier sends');
  }
  for (const name of names) {
    assert.ok(name.startsWith(`${BRIDGE_NAMESPACE}/`));
    assert.ok(!name.startsWith('/'), 'the client passes the ENDPOINT, not the path: the carrier joins them');
  }
  // The carrier joins channel + endpoint into the path the host registers.
  for (let index = 0; index < BRIDGE_ENDPOINTS.length; index += 1) {
    assert.equal(`${BRIDGE_CHANNEL}/${names[index]}`, paths[index]);
  }
});

/**
 * Loom's transport, measured against the REAL DSH 0.2 code.
 *
 * Every other test in this suite runs against a fake, and a fake can only ever
 * confirm the assumptions its author already had. That is exactly how the two
 * shipped transport bugs got through: the fake modelled `rpc.handle`'s
 * SIGNATURE, so it agreed with a call that no profile can mount.
 *
 * This file loads the actual Cordis runtime and the actual
 * `@deepseek-ai/dsh-client-connection` build out of the installed profile, then
 * mounts Loom's real `apply()` beside them in the topology a profile uses —
 * every plugin a SIBLING under one root, which is the part the signature does
 * not tell you:
 *
 *   1. `connection.rpc.handle()` cannot mount a channel from a sibling plugin on
 *      0.2. It reads `owner.webServer` off Connection's own fiber and throws
 *      `cannot get property "webServer" without inject` while the plugin is
 *      still loading — which is the failure the user saw, reproduced here on the
 *      real code. If a future DSH fixes that lookup, this test goes red on
 *      purpose: the workaround in `src/core/bridge.cjs` should be re-read then,
 *      not silently kept.
 *   2. Loom's endpoints answer a real `client-request` envelope with a real
 *      `server-response`, through the real shared Fetch handler — the same
 *      handler the HTTP bridge, the worker host and the desktop lane dispatch
 *      through.
 *
 * Skipped when the profile (or a built checkout) is unavailable: neither is a
 * dependency of this repository.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { apply as loomApply, BRIDGE_ENDPOINTS, bridgePath } from '../src/index.js';

/**
 * Anchors the harness packages resolve from.
 *
 * The installed profile is where DSH actually keeps them; the checkout's own
 * packages resolve only when its workspace links exist, so both are tried and
 * the first one that resolves `connection` wins.
 */
const ANCHORS = [
  process.env.DSH_PROFILE_ANCHOR,
  process.env.DSH_HOME === undefined ? undefined : join(process.env.DSH_HOME, 'profiles', 'web', 'package.json'),
  join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'profiles', 'web', 'package.json'),
  process.env.DSH_CHECKOUT === undefined
    ? 'D:/deepseek/deepseek-harness/package.json'
    : join(process.env.DSH_CHECKOUT, 'package.json'),
].filter(anchor => typeof anchor === 'string' && anchor.length > 0 && existsSync(anchor));

function resolveFromAnchors(name) {
  for (const anchor of ANCHORS) {
    try {
      return createRequire(anchor).resolve(name);
    } catch {
      // Try the next anchor.
    }
  }
  return undefined;
}

const cordisPath = resolveFromAnchors('@deepseek-ai/cordis');
const connectionPath = resolveFromAnchors('@deepseek-ai/dsh-client-connection');
const available = cordisPath !== undefined && connectionPath !== undefined;

/**
 * A credentials provider that persists in memory.
 *
 * Connection loads its browser-session signing secret from the credential
 * store during activation, so a composition without one cannot mount it. Only
 * `modifyRecord` is exercised.
 */
function fakeCredentials() {
  const records = new Map();
  return {
    async modifyRecord(key, update) {
      const next = await update(records.get(key));
      if (next !== undefined) records.set(key, next);
      return records.get(key);
    },
  };
}

/**
 * Mount the real runtime plus the real Connection plugin.
 *
 * `webServer` is provided by a SIBLING plugin, exactly as a profile does it,
 * and the fake records what a plugin registers on it.
 */
async function mountRealConnection() {
  const { Context } = await import(pathToFileURL(cordisPath).href);
  const connection = await import(pathToFileURL(connectionPath).href);

  const root = new Context();
  const webRoutes = [];
  root.provide('credentials', fakeCredentials());

  const webServer = root.plugin({
    name: 'probe-webserver',
    apply(ctx) {
      ctx.provide('webServer', {
        register: route => {
          webRoutes.push(route);
          return () => {
            const at = webRoutes.indexOf(route);
            if (at >= 0) webRoutes.splice(at, 1);
          };
        },
      });
    },
  });
  await webServer.await();

  const connectionPlugin = root.plugin({ inject: connection.inject, apply: connection.apply });
  await connectionPlugin.await();

  return { root, connection, webRoutes };
}

/** Load Loom's real `apply()` as a sibling plugin, the way a profile does. */
async function mountLoom(root, dshHome) {
  const fiber = root.plugin({
    name: 'dsh-loom',
    inject: ['connection'],
    apply: ctx => loomApply(ctx, { dshHome }),
  });
  return fiber;
}

test('a sibling plugin cannot mount a private RPC channel on this DSH build', async t => {
  if (!available) return t.skip('DSH profile / built connection package unavailable');
  const { root } = await mountRealConnection();

  const failures = [];
  const probe = root.plugin({
    name: 'probe-private-channel',
    inject: ['connection'],
    apply(ctx) {
      try {
        ctx.connection.rpc.handle('/probe', async () => ({ ok: true, value: null }));
        failures.push(undefined);
      } catch (error) {
        failures.push(error);
      }
    },
  });
  await probe.await().catch(() => {});

  assert.equal(failures.length, 1, 'the probe must have run');
  assert.ok(failures[0] !== undefined,
    'rpc.handle mounted a private channel here; if DSH fixed this, re-read src/core/bridge.cjs');
  assert.match(String(failures[0]?.message), /without inject/,
    'the documented 0.2 failure is a `without inject` lookup miss, not an HTTP error');
});

test('Loom answers a real client envelope through the real shared Fetch handler', async t => {
  if (!available) return t.skip('DSH profile / built connection package unavailable');
  const { root } = await mountRealConnection();
  const home = mkdtempSync(join(tmpdir(), 'loom-real-'));

  try {
    const loom = await mountLoom(root, home);
    await loom.await();

    // Loom's host half must have mounted on the carrier, not on a private
    // channel of its own.
    const connection = root.get('connection');
    const shared = connection.createSharedFetchHandler('/api');

    // The carrier resolves how to present a body by looking the exact pathname
    // up in the same registry; a path that did not match exactly would never
    // dispatch at all.
    for (const endpoint of BRIDGE_ENDPOINTS) {
      const mode = shared.requestBodyMode({
        method: 'POST',
        url: new URL(`http://127.0.0.1:3080${bridgePath(endpoint)}`),
      });
      assert.equal(mode, 'buffered', `${bridgePath(endpoint)} must be registered as an exact route`);
    }

    // `putManifest` runs before `preflight` because the preflight reads the
    // manifest back from disk; this is the client's own order too.
    const payloads = {
      getManifest: {},
      putManifest: { manifest: { schemaVersion: 2, projects: [{ id: 'p1', title: 'Probe', members: [] }] } },
      preflight: { projectId: 'p1' },
      report: { event: 'probe' },
    };
    for (const endpoint of BRIDGE_ENDPOINTS) {
      const rpcId = `rpc-${endpoint}`;
      const response = await shared.fetch(new Request(`http://127.0.0.1:3080${bridgePath(endpoint)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId,
          method: endpoint,
          payload: payloads[endpoint],
        }),
      }));
      assert.equal(response.status, 200, `${endpoint} must answer on ${bridgePath(endpoint)}`);
      const body = await response.json();
      assert.equal(body.type, 'server-response', `${endpoint} must answer in the carrier's envelope`);
      assert.equal(body.rpcId, rpcId, `${endpoint} must echo the correlation id`);
      assert.equal(body.result.ok, true, `${endpoint} must resolve: ${JSON.stringify(body.result)}`);
    }

    // A path Loom does not own stays the carrier's 404 — exact routes do not
    // hand the shared channel to Loom.
    const stray = await shared.fetch(new Request('http://127.0.0.1:3080/api/dsh-loom/nope', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'x', method: 'nope', payload: {} }),
    }));
    assert.equal(stray.status, 404);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

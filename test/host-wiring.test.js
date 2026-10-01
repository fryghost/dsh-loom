/**
 * Wiring tests: exercise the real `apply()` against a fake Cordis context.
 *
 * These catch the class of bug that unit tests on pure functions cannot —
 * wrong import paths, a provider registered but never disposed, a transport
 * that cannot mount, an endpoint that throws instead of returning a structured
 * error.
 *
 * The fake models the DSH 0.2 Connection contract as it BEHAVES, not as its
 * type signature reads. Two shipped bugs hid behind that difference, and both
 * were invisible to the whole rest of the suite:
 *
 *   - `rpc.handle` took a third `{ authority }` argument, JS dropped it
 *     silently, and every call answered HTTP 405 from the static fallback;
 *   - `rpc.handle` itself cannot mount a private channel from a plugin context
 *     on 0.2 — `register` reads `owner.webServer` off Connection's own fiber and
 *     throws `cannot get property "webServer" without inject` while the plugin
 *     is still loading.
 *
 * So this fake has NO working `rpc.handle`: it counts the calls and throws what
 * the real one throws in a real profile. Loom rides exact Fetch routes on the
 * shared `/api` channel instead, validated here the way `assertFetchRoute`
 * validates them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BRIDGE_ENDPOINTS, apply, bridgeEndpoint, bridgePath, createRpcHandler, isSameOrInside, resolveDshHome, respondToBridge } from '../src/index.js';

/** HTTP methods an exact Fetch route may own (`ConnectionFetchMethod`). */
const FETCH_METHODS = new Set(['GET', 'HEAD', 'POST']);

/**
 * Reject a Fetch route the real carrier would reject.
 *
 * Mirrors `assertFetchRoute` in `rpc-host.ts`: a path below `/api` with valid
 * segments, a non-empty and non-repeating method list, a body mode, and a
 * handler. A fake registry that accepted anything would let a route that
 * cannot mount pass the suite — which is how the previous two bugs shipped.
 */
function assertFetchRoute(route) {
  assert.ok(route !== null && typeof route === 'object', 'a Fetch route must be an object');
  const path = String(route.path);
  const valid = path.startsWith('/api/')
    && path.slice('/api/'.length).split('/').every(segment =>
      segment.length > 0 && segment !== '.' && segment !== '..' && /^[A-Za-z0-9_$.-]+$/.test(segment));
  assert.ok(valid, `an exact Fetch route must live below /api with valid segments; got ${JSON.stringify(path)}`);
  assert.ok(Array.isArray(route.methods) && route.methods.length > 0, 'a route must declare its methods');
  assert.equal(new Set(route.methods).size, route.methods.length, 'a route must not repeat a method');
  for (const method of route.methods) {
    assert.ok(FETCH_METHODS.has(method), `${String(method)} is not a Connection Fetch method`);
  }
  assert.ok(
    route.requestBody === 'buffered' || route.requestBody === 'streaming',
    'requestBody must be "buffered" or "streaming"',
  );
  assert.equal(typeof route.fetch, 'function', 'a route must carry a fetch handler');
}

/** Minimal stand-in for the Cordis context surface Loom touches. */
function fakeContext(options = {}) {
  const disposers = [];
  const registered = [];
  const routes = new Map();
  const calls = { rpcHandle: 0 };
  const services = new Map(Object.entries(options.services ?? {}));

  // `ctx.effect` runs its callback NOW and keeps what the callback returns as
  // the disposer — the real Context's shape, and why a registration made inside
  // one is live before `apply` returns.
  const effect = callback => {
    const dispose = callback();
    if (typeof dispose === 'function') disposers.push(dispose);
  };

  const ctx = {
    get: serviceName => services.get(serviceName),
    inject: (names, callback) => {
      if (names.every(serviceName => services.has(serviceName))) {
        callback(ctx);
      }
    },
    effect,
    connection: {
      rpc: {
        /**
         * Present, and unusable from here — on purpose.
         *
         * `HostConnectionRpc.handle` forwards to `register(owner, …)`, and
         * `owner` is the context that constructed the Connection service, so
         * `register` resolves `webServer` up CONNECTION's fiber chain. A
         * sibling plugin cannot satisfy that lookup; the real call throws
         * exactly this while the plugin loads. A fake that resolved it would
         * approve a private channel no profile can mount, which is the bug
         * this file exists to catch.
         */
        handle: function handle() {
          calls.rpcHandle += 1;
          throw new Error('cannot get property "webServer" without inject');
        },
      },
      fetch: {
        register: function register(route) {
          assertFetchRoute(route);
          if (routes.has(route.path)) {
            throw new Error(`connection: exact Fetch route ${JSON.stringify(route.path)} is already registered`);
          }
          routes.set(route.path, route);
          // The registration is an effect owned by the CALLING context, as in
          // `registerFetchRoute`; the fake keeps that so a test can prove the
          // routes are withdrawn when Loom unloads.
          const dispose = () => { routes.delete(route.path); };
          effect(() => dispose);
          return async () => { dispose(); };
        },
      },
    },
    logger: { warn: () => {}, info: () => {} },
    _calls: calls,
    _disposers: disposers,
    _registered: registered,
    _routes: routes,
    _services: services,
  };

  if (services.has('skills')) {
    services.get('skills').registerProvider = create => {
      registered.push(create);
      return () => { registered.pop(); };
    };
  }

  // Cordis exposes an injected service BOTH via `ctx.get(name)` and as a
  // property (`ctx.skills`) once `ctx.inject` declares it. The fake must model
  // both, or the wiring test would pass against an API shape that cannot exist.
  for (const [serviceName, service] of services) {
    ctx[serviceName] = service;
  }

  return ctx;
}

/**
 * One `client-request` envelope, as the browser caller sends it.
 *
 * `method` is the FULL endpoint name, because that is what the carrier's client
 * puts there: it was handed `dsh-loom/getManifest` and copies it verbatim
 * (`client/rpc.ts`: `method: endpoint`). A helper that wrote the bare name would
 * agree with a server that compared against the bare name — and this pair
 * shipped once and rejected every real call from the running GUI.
 */
function clientRequest(endpoint, payload, rpcId = 'rpc-1') {
  return new Request(`http://127.0.0.1:3080${bridgePath(endpoint)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: bridgeEndpoint(endpoint), payload }),
  });
}

test('apply mounts one exact Fetch route per endpoint on the shared /api channel', () => {
  const ctx = fakeContext({ services: {} });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });

  // Derived from the shared list, NOT restated: a second copy of the endpoint
  // names here would have to be edited in lockstep with `bridge.cjs`, and the
  // failure it would hide is a route the client calls but nobody mounted.
  assert.deepEqual(
    [...ctx._routes.keys()].sort(),
    BRIDGE_ENDPOINTS.map(bridgePath).sort(),
    'every endpoint needs its own exact route: exact paths do not overlap',
  );
  assert.equal(ctx._routes.size, BRIDGE_ENDPOINTS.length, 'one route per shared endpoint');
  for (const [path, route] of ctx._routes) {
    assert.deepEqual(route.methods, ['POST'], `${path} is written by POST only`);
    assert.equal(route.requestBody, 'buffered', `${path} carries a JSON envelope`);
  }
});

test('apply never mounts a private RPC channel', () => {
  // The regression, pinned: `connection.rpc.handle` throws while the plugin
  // loads on 0.2, so calling it makes Loom unloadable and the whole 项目 section
  // empty. The fake counts the call so the failure names the cause instead of
  // surfacing a bare "cannot get property webServer".
  const ctx = fakeContext({ services: {} });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });
  assert.equal(ctx._calls.rpcHandle, 0,
    'a plugin cannot mount a private RPC channel on DSH 0.2: handle() resolves webServer off Connection\'s own fiber');
});

test('apply refuses to load when the Connection Fetch registry is missing', () => {
  // The honest half of "degrade, do not refuse": an absent SKILLS registry
  // degrades, an absent TRANSPORT does not. Both earlier failures of this
  // channel were silent — routes never mounted, every call 404/405 — and the
  // only visible symptom was an empty list.
  const ctx = fakeContext({ services: {} });
  delete ctx.connection.fetch;
  assert.throws(() => apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') }),
    /requires the Connection Fetch registry/);
});

test('a route answers the client-request envelope with a server-response envelope', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-route-'));
  try {
    const ctx = fakeContext({ services: {} });
    apply(ctx, { dshHome: home });

    const response = await ctx._routes.get('/api/dsh-loom/getManifest').fetch(clientRequest('getManifest', {}));
    assert.equal(response.status, 200, 'business failures and successes both travel as HTTP 200');
    const body = await response.json();
    assert.equal(body.type, 'server-response');
    assert.equal(body.rpcId, 'rpc-1', 'the correlation id must come back or the client rejects the response');
    assert.equal(body.result.ok, true);
    assert.deepEqual(body.result.value.manifest.projects, []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('the envelope names the endpoint it addresses, not the bare route', async () => {
  // The exact pair that shipped broken: the client asks for
  // `dsh-loom/getManifest` and copies that string into `method`, while the route
  // owns the bare `getManifest`. Validating against the bare name rejected every
  // well-formed call from the running GUI, with the manifest on disk and three
  // projects waiting to render.
  const ctx = fakeContext({ services: {} });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });
  const route = ctx._routes.get(bridgePath('getManifest'));

  const named = await route.fetch(new Request(`http://127.0.0.1:3080${bridgePath('getManifest')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'r1',
      method: bridgeEndpoint('getManifest'),
      payload: {},
    }),
  }));
  assert.equal((await named.json()).result.ok, true,
    'the full endpoint name is what the carrier\'s client sends and what this route serves');

  const bare = await route.fetch(new Request(`http://127.0.0.1:3080${bridgePath('getManifest')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r2', method: 'getManifest', payload: {} }),
  }));
  const rejected = await bare.json();
  assert.equal(rejected.result.ok, false, 'a bare route name is not an address on the shared channel');
  assert.match(rejected.result.error.message, /does not match endpoint "dsh-loom\/getManifest"/);
});

test('a route rejects a misaddressed envelope without losing the reason', async () => {
  const ctx = fakeContext({ services: {} });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });

  // A POST to getManifest' path that names another method: the carrier answers
  // it as a bad request, not as a 4xx the UI can only report as "HTTP 500".
  const response = await ctx._routes.get('/api/dsh-loom/getManifest').fetch(clientRequest('putManifest', {}));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.ok, false);
  assert.equal(body.result.error.code, 'gateway/bad-request');
  assert.equal(body.rpcId, 'rpc-1');
  assert.match(body.result.error.message, /does not match endpoint/);
});

test('a body that is not JSON is refused before any envelope exists', async () => {
  const ctx = fakeContext({ services: {} });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });

  const response = await ctx._routes.get('/api/dsh-loom/report').fetch(new Request(
    'http://127.0.0.1:3080/api/dsh-loom/report',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' },
  ));
  assert.equal(response.status, 400);
});

test('an unknown endpoint is a missing route, not a call into the handler', () => {
  const ctx = fakeContext({ services: {} });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });
  assert.equal(ctx._routes.has('/api/dsh-loom/deleteEverything'), false,
    'exact routes mean an endpoint Loom does not serve is a carrier 404');
});

test('the client-request envelope is validated the way the carrier validates it', async () => {
  // Every rejection below is a 200 envelope with `ok: false`, because the
  // caller matches on `rpcId` and can read the reason.
  const handler = async () => ({ ok: true, value: null });
  const post = async body => {
    const response = await respondToBridge(new Request('http://127.0.0.1:3080/api/dsh-loom/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }), 'x', handler);
    return { status: response.status, body: await response.json() };
  };

  const cases = [
    { body: [], reason: /not an object/ },
    { body: { type: 'server-response', rpcId: 'r1', method: 'dsh-loom/x', payload: {} }, reason: /client-request/ },
    { body: { type: 'client-request', rpcId: 7, method: 'dsh-loom/x', payload: {} }, reason: /rpcId is not a string/ },
    { body: { type: 'client-request', rpcId: 'r1', method: 'dsh-loom/y', payload: {} }, reason: /does not match endpoint/ },
  ];
  for (const { body, reason } of cases) {
    const result = await post(body);
    assert.equal(result.status, 200, `${JSON.stringify(body)} must answer with an envelope`);
    assert.equal(result.body.result.ok, false);
    assert.match(result.body.result.error.message, reason);
  }

  // The one case with no readable id still answers with the carrier's
  // placeholder, so the client's id check fails on a mismatch rather than on an
  // unparseable body.
  const anonymous = await post('[]');
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.body.rpcId, 'invalid-request');
});

test('unloading Loom withdraws every bridge route', () => {
  const ctx = fakeContext({ services: {} });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });
  assert.equal(ctx._routes.size, BRIDGE_ENDPOINTS.length);
  for (const dispose of ctx._disposers) dispose();
  assert.equal(ctx._routes.size, 0, 'a route that survives unload would collide on the next load');
});

test('the bridge handler accepts the 0.2 four-argument call shape', async () => {
  // DSH 0.2's `ConnectionRpcHandler` is
  //   (endpoint, payload, signal, peer) => Promise<{ ok, value } | { ok, error }>
  // The extra `signal` and `peer` are not used yet, but the call must tolerate
  // them: a handler declared with two parameters is callable with four, and this
  // pins that it stays that way rather than acquiring a positional dependency on
  // an argument the carrier is free to change.
  const ctx = fakeContext({ services: {} });
  const handler = createRpcHandler(ctx, join(tmpdir(), 'loom-fake-home'));

  const result = await handler('getManifest', {}, new AbortController().signal, { id: 'peer' });
  assert.equal(typeof result, 'object');
  assert.equal(result.ok, true, 'a four-argument call must still resolve a result envelope');
  assert.ok(result.value !== undefined, 'and carry the value the endpoint produces');
});

test('the bridge handler returns a failure envelope, not a throw', async () => {
  // The carrier treats a thrown handler as HTTP 500 and loses the reason; every
  // endpoint failure must come back as `{ ok: false, error }`.
  const ctx = fakeContext({ services: {} });
  const handler = createRpcHandler(ctx, join(tmpdir(), 'loom-fake-home'));

  const result = await handler('no-such-endpoint', {}, undefined, undefined);
  assert.equal(result.ok, false);
  assert.equal(typeof result.error.message, 'string');
});

test('apply registers every bridge route and the skill provider', () => {
  const ctx = fakeContext({ services: { skills: {} } });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });

  assert.equal(ctx._routes.size, BRIDGE_ENDPOINTS.length, 'the bridge must be mounted on the shared channel');
  assert.equal(ctx._registered.length, 1, 'the skill provider must be registered exactly once');
  assert.ok(ctx._disposers.length >= 1, 'the provider must have a disposer for unload');
});

test('apply still loads when no skills service exists', () => {
  // A composition without a skills registry must degrade, not refuse to load.
  const ctx = fakeContext({ services: {} });
  assert.doesNotThrow(() => apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') }));
  assert.equal(ctx._routes.size, BRIDGE_ENDPOINTS.length);
  assert.equal(ctx._registered.length, 0);
});

test('the registered provider reports the Loom provider name', () => {
  const ctx = fakeContext({ services: { skills: {} } });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });
  const provider = ctx._registered[0]({ signal: new AbortController().signal, invalidate: () => {} });
  assert.equal(provider.name, 'loom-project');
  assert.equal(typeof provider.list, 'function');
  assert.equal(typeof provider.get, 'function');
});

test('resolveDshHome prefers explicit config, then env, then ~/.dsh', () => {
  assert.equal(resolveDshHome('C:/explicit'), 'C:/explicit');
  const previous = process.env.DSH_HOME;
  try {
    process.env.DSH_HOME = 'C:/from-env';
    assert.equal(resolveDshHome(undefined), 'C:/from-env');
    assert.equal(resolveDshHome(''), 'C:/from-env');
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
  }
});

test('isSameOrInside matches a folder and its descendants, case-insensitively on Windows paths', () => {
  assert.equal(isSameOrInside('C:\\work\\alpha', 'C:/work/alpha'), true);
  assert.equal(isSameOrInside('C:/work/alpha/sub', 'C:/work/alpha'), true);
  assert.equal(isSameOrInside('C:/work/alphabet', 'C:/work/alpha'), false, 'a name prefix is not containment');
  assert.equal(isSameOrInside('C:/work/beta', 'C:/work/alpha'), false);
});

test('an unknown endpoint returns a structured error rather than throwing', async () => {
  const ctx = fakeContext({ services: {} });
  const handler = createRpcHandler(ctx, join(tmpdir(), 'loom-fake-home'));
  const result = await handler('nope', {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'unknown-endpoint');
});

test('getManifest returns an empty manifest for a fresh home', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const ctx = fakeContext({ services: {} });
    const handler = createRpcHandler(ctx, home);
    const result = await handler('getManifest', {});
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.manifest.projects, []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('putManifest then getManifest round-trips through the RPC surface', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const ctx = fakeContext({ services: {} });
    const handler = createRpcHandler(ctx, home);

    const written = await handler('putManifest', {
      manifest: { schemaVersion: 2, projects: [{ id: 'p1', title: 'Weave', members: ['ws-a', 'ws-b'] }] },
    });
    assert.equal(written.ok, true);

    const read = await handler('getManifest', {});
    assert.equal(read.value.manifest.projects[0].title, 'Weave');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('preflight reports an unknown project as a structured error', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const ctx = fakeContext({ services: {} });
    const handler = createRpcHandler(ctx, home);
    const result = await handler('preflight', { projectId: 'missing' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'unknown-project');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('preflight produces a plan from real files on disk', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'loom-proj-'));
  try {
    const alpha = join(projectRoot, 'alpha');
    const beta = join(projectRoot, 'beta');
    await mkdir(join(alpha, '.dsh', 'skills', 'alpha-skill'), { recursive: true });
    await mkdir(join(beta, '.dsh', 'skills', 'beta-skill'), { recursive: true });
    await writeFile(
      join(alpha, '.dsh', 'skills', 'alpha-skill', 'SKILL.md'),
      '---\nname: alpha-skill\ndescription: in alpha\n---\nBody.\n',
      { encoding: 'utf8' },
    );
    await writeFile(
      join(beta, '.dsh', 'skills', 'beta-skill', 'SKILL.md'),
      '---\nname: beta-skill\ndescription: in beta\n---\nBody.\n',
      { encoding: 'utf8' },
    );
    await writeFile(join(alpha, 'AGENTS.md'), '# Alpha rules\n', { encoding: 'utf8' });

    const workspaces = new Map([
      ['ws-a', { id: 'ws-a', path: alpha, title: 'Alpha' }],
      ['ws-b', { id: 'ws-b', path: beta, title: 'Beta' }],
    ]);
    const ctx = fakeContext({
      services: {
        workspaceRegistry: { get: id => workspaces.get(id) },
        sandboxPolicy: { defaultMode: 'workspace-write' },
      },
    });
    const handler = createRpcHandler(ctx, home);

    await handler('putManifest', {
      manifest: { schemaVersion: 2, projects: [{ id: 'p1', title: 'Weave', members: ['ws-a', 'ws-b'] }] },
    });

    const result = await handler('preflight', { projectId: 'p1' });
    assert.equal(result.ok, true);

    const plan = result.value.plan;
    const names = plan.skills.map(skill => skill.name).sort();
    assert.deepEqual(names, ['alpha-skill', 'beta-skill'],
      'the preflight must see skills from BOTH member folders');

    assert.equal(plan.summary.skillCount, 2);
    assert.equal(plan.instructions.length, 1, 'only alpha has an AGENTS.md');
    assert.equal(plan.instructions[0].workspaceId, 'ws-a');
    assert.equal(plan.writeBoundary.writable, 'active-member-only');
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('preflight names a folder whose workspace cannot be resolved', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const ctx = fakeContext({
      services: { workspaceRegistry: { get: () => undefined } },
    });
    const handler = createRpcHandler(ctx, home);

    await handler('putManifest', {
      manifest: { schemaVersion: 2, projects: [{ id: 'p1', title: 'P', members: ['ws-gone'] }] },
    });

    const result = await handler('preflight', { projectId: 'p1' });
    assert.equal(result.ok, true);
    const silent = result.value.plan.silent.find(entry => entry.workspaceId === 'ws-gone');
    assert.equal(silent.reason, 'workspace-unresolved');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * Migration over the bridge
 * ------------------------------------------------------------------ */

/**
 * A stored log shaped the way `sessionQuery.readSession` returns one.
 *
 * The default log ENDS MID-TURN on purpose, so the completed prefix and the
 * whole log are different lengths. A fixture whose log was exactly its own
 * prefix could not tell "seed the completed history" from "seed everything" —
 * the two would produce identical bytes and the mutation would go unnoticed.
 */
function storedSession({ cwd = '/repos/alpha', events } = {}) {
  return {
    session: { version: 4, id: 'session-src', createdAt: 1, isSeeded: false, cwd },
    inheritedEventCount: 0,
    events: events ?? [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
      // An interrupted second turn, still open: durable, but NOT part of the
      // completed prefix a migration copies.
      { type: 'turn/start', seq: 2, time: 3, data: { turn: 2 } },
      { type: 'assistant/message', seq: 3, time: 4, data: { turn: 2, step: 1, message: { content: [] } } },
    ],
  };
}

/**
 * The services a migration needs, faked the way the real ones behave.
 *
 * `target.attachSession` really validates in DSH (it compares the session's
 * canonical cwd to the workspace path), so the fake records what it was asked
 * to attach rather than approving anything.
 */
function migrationServices(overrides = {}) {
  const created = [];
  const attached = [];
  const reads = [];
  const target = {
    id: 'ws-beta',
    path: '/repos/beta',
    title: 'beta',
    status: async () => 'ok',
    attachSession: async id => { attached.push(id); },
    ...overrides.target,
  };
  return {
    created,
    attached,
    reads,
    sessions: {
      sessionQuery: {
        readSession: async id => {
          reads.push(id);
          return overrides.stored ?? storedSession();
        },
      },
      workspaceRegistry: {
        get: id => (id === 'ws-beta' ? target : undefined),
      },
      agents: {
        get: () => undefined,
        create: async options => { created.push(options); return { agent: { id: options.sessionId } }; },
      },
    },
  };
}

test('planMigration reports what a move would copy', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices();
    const ctx = fakeContext({ services: fake.sessions });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('planMigration', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });

    assert.equal(result.ok, true);
    assert.equal(result.value.plan.available, true);
    assert.equal(result.value.plan.copiedEvents, 2);
    assert.equal(result.value.plan.title, 'beta');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('planMigration refuses a bad request instead of guessing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const ctx = fakeContext({ services: migrationServices().sessions });
    const handler = createRpcHandler(ctx, home);

    for (const payload of [{}, { sessionId: 'session-src' }, { targetWorkspaceId: 'ws-beta' }]) {
      const result = await handler('planMigration', payload);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'gateway/bad-request');
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('planMigration names a missing capability rather than loading badly', async () => {
  // The header contract of `src/index.js`: a composition without the migration
  // services must still load, and must answer with WHAT is missing.
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const ctx = fakeContext({ services: {} });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('planMigration', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'migration-unavailable');
    assert.match(result.error.message, /sessionQuery/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('planMigration reports an unknown target workspace', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const ctx = fakeContext({ services: migrationServices().sessions });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('planMigration', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-gone',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'workspace/not-found');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('planMigration refuses a target folder that no longer exists', async () => {
  // The copy's cwd would be a directory that is not there, so the new session
  // would attach to nothing and sit in 聊天 looking like a failed move.
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices({ target: { status: async () => 'missing-dir' } });
    const ctx = fakeContext({ services: fake.sessions });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('planMigration', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'migration-target-missing');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('planMigration refuses to move a conversation into its own folder', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices({
      stored: storedSession({ cwd: '/repos/beta' }),
    });
    const ctx = fakeContext({ services: fake.sessions });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('planMigration', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });
    assert.equal(result.ok, true, 'the plan resolves; it is the PLAN that refuses');
    assert.equal(result.value.plan.available, false);
    assert.equal(result.value.plan.reason, 'same-workspace');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('planMigration refuses a running session rather than truncating it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices();
    const ctx = fakeContext({
      services: {
        ...fake.sessions,
        agents: { get: () => ({ status: 'running' }), create: async () => {} },
      },
    });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('planMigration', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.plan.available, false);
    assert.equal(result.value.plan.reason, 'session-running');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('migrateSession seeds a copy in the target folder and attaches it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices();
    const ctx = fakeContext({ services: fake.sessions });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('migrateSession', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });

    assert.equal(result.ok, true);
    assert.match(result.value.sessionId, /^session-/, 'a NEW session id is minted');
    assert.equal(result.value.copiedEvents, 2);
    assert.equal(result.value.attached, true);
    assert.deepEqual(fake.attached, [result.value.sessionId], 'the copy is attached to the target');

    const created = fake.created[0];
    assert.equal(created.meta.cwd, '/repos/beta', 'the copy lives in the TARGET folder');
    assert.equal(created.meta.isSeeded, true);
    // The COMPLETED prefix, not the whole log: seqs 2 and 3 are an interrupted
    // turn still open, and copying them would hand the new session work it is
    // not running. Asserted by seq as well as length, so a fixture that grew
    // would not silently make this vacuous.
    assert.equal(created.seed.length, 2, 'the seed is the completed prefix');
    assert.deepEqual(created.seed.map(event => event.seq), [0, 1], 'and stops at the turn end');
    assert.equal(created.inheritedEventCount, 2, 'the inherited count matches the seed exactly');
    assert.equal(result.value.droppedEvents, 2, 'the open turn is reported as dropped, not hidden');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('the copy names its source, which DSH requires of a seeded log', async () => {
  // INVERTED, and the inversion is the fix. This test used to assert
  // `meta.parentSession === undefined`, on the reasoning that Loom's section
  // filter hides any session whose parent differs from itself — so lineage would
  // make the copy vanish. The reasoning was self-consistent and the code obeyed
  // it, and the result was a session log DSH refuses to open: a seeded copy
  // carries the source's delivery watermarks verbatim, and with no
  // `parentSession` to explain them DSH reads them as corruption
  // (`current-generation delivery marker names the wrong Session`).
  //
  // A display problem was traded for a data-integrity problem. The filter is
  // what had to change (`src/core/sections.cjs` now keys on `origin`, matching
  // DSH), never the artifact. `test/migration-artifact.test.js` is the test that
  // would have caught it; this one now pins the field that must be present.
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices();
    const ctx = fakeContext({ services: fake.sessions });
    const handler = createRpcHandler(ctx, home);

    await handler('migrateSession', { sessionId: 'session-src', targetWorkspaceId: 'ws-beta' });

    const { meta } = fake.created[0];
    assert.equal(meta.parentSession, 'session-src',
      'a seeded copy MUST name its source, or DSH cannot explain the copied watermarks');
    // `origin` stays unset, and that part of the old reasoning still holds: a
    // copy of a conversation is not a delegate of one, and `origin: 'subagent'`
    // is the ONE signal both DSH and Loom hide rows by.
    assert.equal(meta.origin, undefined, 'a copy is not a subagent');
    assert.equal(meta.cwd, '/repos/beta');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('migrateSession re-plans, so a session that started running is refused', async () => {
  // The dialog planned when it opened; the click can arrive later. A stale plan
  // would copy a prefix the user never agreed to.
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices();
    const ctx = fakeContext({
      services: {
        ...fake.sessions,
        agents: { get: () => ({ status: 'running' }), create: async () => {} },
      },
    });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('migrateSession', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'migration/session-running');
    assert.equal(fake.created.length, 0, 'nothing may be created once the plan refuses');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('migrateSession reads the source itself, not a plan handed to it', async () => {
  // The stronger form of the same rule: the endpoint takes ids, never a plan.
  // It must therefore observe the session at CLICK time and use THAT boundary —
  // a version that trusted a caller-supplied plan could be driven by a dialog
  // left open while the conversation moved on. Counted, because the observable
  // difference between "re-planned" and "reused" is exactly one more read.
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices();
    const ctx = fakeContext({ services: fake.sessions });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('migrateSession', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });

    assert.equal(result.ok, true);
    assert.deepEqual(fake.reads, ['session-src', 'session-src'],
      'the endpoint must observe the source twice: once to plan, once to seed');
    assert.equal(fake.created[0].seed.length, result.value.copiedEvents,
      'and the seed must be the prefix the plan it just computed described');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a failed attach is reported as a partial success, not rolled back', async () => {
  // The copy exists and its cwd already equals the target path, so Loom's own
  // "resident" rule lists it under that workspace anyway. Deleting a session
  // the user can already open would be worse than an account that self-heals.
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices({
      target: { attachSession: async () => { throw new Error('registry is read-only'); } },
    });
    const ctx = fakeContext({ services: fake.sessions });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('migrateSession', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });

    assert.equal(result.ok, true, 'the session WAS created; that fact survives');
    assert.equal(result.value.attached, false);
    assert.match(result.value.attachError, /read-only/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a create failure is reported without minting anything visible', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const fake = migrationServices();
    const ctx = fakeContext({
      services: {
        ...fake.sessions,
        agents: { get: () => undefined, create: async () => { throw new Error('agent registry is full'); } },
      },
    });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('migrateSession', {
      sessionId: 'session-src', targetWorkspaceId: 'ws-beta',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'migration-create-failed');
    assert.match(result.error.message, /registry is full/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('an unreadable source log is reported, not thrown', async () => {
  const home = await mkdtemp(join(tmpdir(), 'loom-rpc-'));
  try {
    const ctx = fakeContext({
      services: {
        sessionQuery: { readSession: async () => { throw new Error('no such session'); } },
        workspaceRegistry: {
          get: () => ({ id: 'ws-beta', path: '/repos/beta', title: 'beta', status: async () => 'ok' }),
        },
      },
    });
    const handler = createRpcHandler(ctx, home);

    const result = await handler('planMigration', {
      sessionId: 'session-missing', targetWorkspaceId: 'ws-beta',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'migration-source-unreadable');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

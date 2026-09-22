/**
 * Wiring tests: exercise the real `apply()` against a fake Cordis context.
 *
 * These catch the class of bug that unit tests on pure functions cannot —
 * wrong import paths, a provider registered but never disposed, an RPC
 * endpoint that throws instead of returning a structured error.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apply, createRpcHandler, isSameOrInside, resolveDshHome } from '../src/index.js';

/** Minimal stand-in for the Cordis context surface Loom touches. */
function fakeContext(options = {}) {
  const disposers = [];
  const registered = [];
  const handlers = new Map();
  const services = new Map(Object.entries(options.services ?? {}));

  const ctx = {
    get: serviceName => services.get(serviceName),
    inject: (names, callback) => {
      if (names.every(serviceName => services.has(serviceName))) {
        callback(ctx);
      }
    },
    effect: disposer => { disposers.push(disposer); },
    connection: {
      rpc: {
        handle: (channel, handler) => { handlers.set(channel, handler); },
      },
    },
    logger: { warn: () => {}, info: () => {} },
    _disposers: disposers,
    _registered: registered,
    _handlers: handlers,
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

test('apply registers the RPC channel and the skill provider', () => {
  const ctx = fakeContext({ services: { skills: {} } });
  apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') });

  assert.ok(ctx._handlers.has('/dsh-loom'), 'the loopback RPC channel must be registered');
  assert.equal(ctx._registered.length, 1, 'the skill provider must be registered exactly once');
  assert.ok(ctx._disposers.length >= 1, 'the provider must have a disposer for unload');
});

test('apply still loads when no skills service exists', () => {
  // A composition without a skills registry must degrade, not refuse to load.
  const ctx = fakeContext({ services: {} });
  assert.doesNotThrow(() => apply(ctx, { dshHome: join(tmpdir(), 'loom-fake-home') }));
  assert.ok(ctx._handlers.has('/dsh-loom'));
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

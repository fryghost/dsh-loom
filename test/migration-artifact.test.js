/**
 * The migrated copy must be an artifact DSH can actually open.
 *
 * WHY THIS FILE EXISTS, and why nothing in the suite before it could see the bug.
 *
 * 0.2.6 shipped a migration that produced unusable session logs. Every one of
 * the 267 tests passed. The reason is not that the tests were shallow — they
 * asserted the produced header field by field — but that they asserted it
 * against a fixture the test itself had written. `host-wiring.test.js` checked
 * `created.meta.cwd`, `created.meta.isSeeded`, and `created.seed.length`; all
 * three were correct. What no test did was hand the result to DSH and ask
 * whether DSH accepted it.
 *
 * The field that was missing only matters to DSH's own relationship validator.
 * A seeded copy carries the source's `delivery-accepted` watermarks verbatim,
 * and each names the SOURCE session. `assertReleasedV4Relationships` admits a
 * foreign-named watermark only while the header explains it —
 * `parentSession !== undefined && seq < inheritedEventCount`
 * (`session-format-v3-to-v4/src/validation.ts:117-121`). Omit the field and 105
 * watermarks read as "this session generated these and they name someone else",
 * so the artifact is rejected as
 * `current-generation delivery marker names the wrong Session` and the session
 * cannot be opened at all.
 *
 * So the assertion here is deliberately a DIFFERENT KIND from every other
 * migration test: not "the fields I intended are present", but "the real
 * consumer accepts the artifact". A future field DSH starts requiring fails
 * here, which is the point — this is the only place that can notice.
 *
 * The real validator is imported from the DSH checkout. When it is absent the
 * tests SKIP rather than pass: a green run that never ran the check is exactly
 * the false confidence this file was written to end.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DSH_CHECKOUT = process.env.DSH_CHECKOUT ?? 'D:/deepseek/deepseek-harness';
const VALIDATOR_URL = `file:///${DSH_CHECKOUT.replace(/\\/g, '/').replace(/^\/+/, '')}`
  + '/packages/session/session-format-v3-to-v4/lib/index.js';

const LOOM = new URL('../src/index.js', import.meta.url);
const PLAN = new URL('../src/core/migration-plan.cjs', import.meta.url);
const SECTIONS = new URL('../src/core/sections.cjs', import.meta.url);

/** Load DSH's released-v4 artifact validator, or undefined when unavailable. */
async function loadValidator() {
  try {
    return await import(VALIDATOR_URL);
  } catch {
    return undefined;
  }
}

/**
 * The event vocabulary an installed DSH Session package would report.
 *
 * Taken from the seed itself plus the two types DSH synthesizes, because
 * `restoreReleasedV4Artifact` rejects any unknown NON-ignorable event — a
 * vocabulary invented here would reject the fixture for the wrong reason.
 */
const EXTRA_TYPES = ['session/end-seed', 'turn/start', 'turn/end', 'session/title'];

/**
 * A source conversation with the shape that breaks: a turn that completed, a
 * second turn that did not, and current-generation delivery watermarks naming
 * the session that produced them.
 *
 * `surfaceOp` sits on the EVENT ENVELOPE, not in `data`
 * (`core/session/src/index.ts` spreads it beside `sourceEventSeqs`, and
 * `relationships.ts` `foldSurface` reads `event['surfaceOp']`). Putting it in
 * `data` is rejected as `surfaceOp requires an object` — which is how this
 * fixture was written the first time.
 */
const SOURCE_HEADER = {
  version: 4, id: 'session-source', createdAt: 1, isSeeded: false,
  cwd: '/repos/alpha', delegationDepth: 0, agentPreset: 'standard',
};

const SOURCE_EVENTS = [
  { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
  {
    type: 'user/message',
    seq: 1,
    time: 2,
    surfaceOp: 'append',
    data: { content: [{ type: 'text', text: 'hello' }], source: { kind: 'user', rpcId: 'r1' } },
  },
  { type: 'session/title', seq: 2, time: 3, data: { title: 'a conversation', messageSeqs: [1], source: { kind: 'fallback' } } },
  // The watermark DSH must be able to explain. `throughSeq` must precede its own
  // marker, and the marker names the session that produced it — the whole
  // reason `parentSession` is required on the copy.
  {
    type: 'session-log-deepseek/delivery-accepted',
    seq: 3,
    time: 4,
    data: { sessionFormatVersion: 4, throughSeq: 2, sessionId: 'session-source' },
  },
  { type: 'turn/end', seq: 4, time: 5, data: { turn: 1, reason: { kind: 'completed' } } },
  // Open turn: durable, but not part of the completed prefix.
  { type: 'turn/start', seq: 5, time: 6, data: { turn: 2 } },
];

/** A fresh copy of the source events, so a test cannot mutate another's fixture. */
const sourceEvents = () => SOURCE_EVENTS.map(event => structuredClone(event));

/** A host context whose services answer like the real ones, with no I/O. */
function hostContext(header, events, targetPath) {
  const created = [];
  return {
    created,
    ctx: {
      get(name) {
        if (name === 'sessionQuery') {
          return { readSession: async () => ({ session: header, inheritedEventCount: 0, events }) };
        }
        if (name === 'workspaceRegistry') {
          return {
            get: id => (id === 'ws-beta'
              ? { id, path: targetPath, title: 'beta', status: async () => 'ok', attachSession: async () => {} }
              : undefined),
          };
        }
        if (name === 'agents') {
          return { get: () => undefined, create: async options => { created.push(options); return { agent: { id: options.sessionId } }; } };
        }
        if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
        return undefined;
      },
    },
  };
}

/**
 * Turn what the host passed to `agents.create` into the artifact DSH persists.
 *
 * The persisted header is `meta` plus the identity and generation fields DSH
 * itself owns — which is exactly the mapping `core/session/src/index.ts`
 * performs when it wraps a caller's `meta` into a header.
 *
 * The `session/end-seed {inherited:true}` marker is appended here, NOT by the
 * migration. `SessionStore.prepare` adds it when a seeded header's inherited
 * count is shorter than its log, which is why the host half synthesizes no
 * events — and reproducing that step is what makes this a faithful artifact
 * instead of a fixture that fails for an unrelated reason
 * (`format v4 seeded header disagrees with its last inherited end-seed
 * marker`). Its presence is asserted separately so a DSH change here cannot
 * quietly make these tests vacuous.
 */
function artifactOf(created, id = 'session-copy') {
  const events = [
    ...created.seed,
    ...created.meta.isSeeded === true
      ? [{ type: 'session/end-seed', seq: created.seed.length, time: 9, data: { inherited: true } }]
      : [],
  ];
  return {
    header: { version: 4, id, createdAt: 2, delegationDepth: 0, ...created.meta },
    events,
    inheritedEventCount: created.inheritedEventCount,
  };
}

test('the migrated copy is an artifact DSH accepts', async t => {
  const validator = await loadValidator();
  if (validator === undefined) return t.skip('DSH checkout unavailable');

  const home = await mkdtemp(join(tmpdir(), 'loom-artifact-'));
  try {
    const { migrateSessionWith } = await import(LOOM);
    const host = hostContext(SOURCE_HEADER, sourceEvents(), join(home, 'beta'));

    const result = await migrateSessionWith(host.ctx, 'session-source', 'ws-beta');
    assert.equal(result.ok, true, 'the migration itself must succeed');

    const created = host.created[0];
    // The specific field, asserted where it is set, so a failure names the cause
    // before the validator's message has to be decoded.
    assert.equal(created.meta.parentSession, 'session-source',
      'a seeded copy MUST name its source, or DSH cannot explain the copied watermarks');

    const known = new Set([...created.seed.map(event => event.type), ...EXTRA_TYPES]);
    const artifact = artifactOf(created);
    assert.equal(artifact.events.at(-1).type, 'session/end-seed',
      'the artifact must end at the inherited marker, or this test fails for the wrong reason');
    assert.doesNotThrow(
      () => validator.restoreReleasedV4Artifact(artifact, known),
      'DSH must accept the artifact this migration produces',
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('the watermarks would be rejected without parentSession', async t => {
  const validator = await loadValidator();
  if (validator === undefined) return t.skip('DSH checkout unavailable');
  // The mutation, run through the SAME validator the test above uses. Without
  // this, a future edit that drops the field could be "caught" by a test that
  // passes for an unrelated reason — and, worse, a validator that stopped
  // checking would silently turn the test above into a no-op.
  const { migrateSessionWith } = await import(LOOM);
  const home = await mkdtemp(join(tmpdir(), 'loom-artifact-'));
  try {
    const host = hostContext(SOURCE_HEADER, [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      {
        type: 'session-log-deepseek/delivery-accepted',
        seq: 1,
        time: 2,
        data: { sessionFormatVersion: 4, throughSeq: 0, sessionId: 'session-source' },
      },
      { type: 'turn/end', seq: 2, time: 3, data: { turn: 1, reason: { kind: 'completed' } } },
    ], join(home, 'beta'));

    const result = await migrateSessionWith(host.ctx, 'session-source', 'ws-beta');
    assert.equal(result.ok, true);

    const created = host.created[0];
    const known = new Set([...created.seed.map(event => event.type), ...EXTRA_TYPES]);
    const artifact = artifactOf(created);
    delete artifact.header.parentSession;

    assert.throws(
      () => validator.restoreReleasedV4Artifact(artifact, known),
      /wrong Session/,
      'the validator must reject the copy once its lineage is removed',
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('the copy is visible in Loom, like DSH its own fork is', async t => {
  // The other half of the same defect: with lineage present, Loom used to hide
  // the copy from every section while DSH's own browser listed it. A migrated
  // conversation the user cannot find reads as a failed migration.
  const { deriveSections } = await import(SECTIONS);
  const copy = {
    id: 'session-copy',
    title: 'a conversation',
    displayTitle: 'a conversation',
    cwd: '/repos/beta',
    parentId: 'session-source',
    running: false,
    blank: false,
    updatedAt: 9,
    retainedBy: {},
  };
  const { projectRows, workspaceRows, chatSessions } = deriveSections({
    projects: [],
    snapshot: { items: [{ workspaceId: 'ws-beta', path: '/repos/beta', title: 'beta', sessionIds: [] }], archivedSessionIds: [] },
    sessionState: {
      ids: ['session-copy'],
      byId: { 'session-copy': copy },
      projectionsBySession: { 'session-copy': { state: 'ready' } },
    },
  });

  const listed = [...projectRows, ...workspaceRows].flatMap(row => row.sessions.map(s => s.id)).concat(chatSessions.map(s => s.id));
  assert.ok(listed.includes('session-copy'),
    'a copied conversation carries a parent but is not a delegate, so it must be listed');
});

test('the plan never carries lineage, only the artifact does', async () => {
  // Separates the two layers deliberately. The PLAN is pure data about what
  // would be copied and must not smuggle a session header; the lineage belongs
  // to the creation call. A refactor that moved `parentSession` into the plan
  // would satisfy the validator test above while putting a session identity in
  // a value rendered in the dialog.
  const { buildMigrationPlan } = await import(PLAN);
  const plan = buildMigrationPlan({
    header: SOURCE_HEADER,
    events: [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
    ],
    targetPath: '/repos/beta',
    targetTitle: 'beta',
    running: false,
  });

  assert.equal(plan.available, true);
  assert.equal(plan.parentSession, undefined, 'the plan is not a header');
});

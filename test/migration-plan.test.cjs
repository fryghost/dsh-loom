/**
 * The migration plan decides what a "move to another workspace" would copy.
 *
 * Every refusal is asserted by NAME, because the reason is what the dialog
 * shows instead of a silently disabled button. The boundary rule is asserted
 * against DSH's own default fork cut (`latestCompletedPrefixBoundary` in
 * `api/session-controller/src/commands.ts`), which this module mirrors: if the
 * two ever disagree, "move" and "fork" would cut the same conversation at
 * different places.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const planning = require('../src/core/migration-plan.cjs');
const { MIGRATION_REASONS, buildMigrationPlan, lastCompletedTurnBoundary } = planning;

/** Events with contiguous seqs from 0, the shape a stored log has. */
function log(...types) {
  return types.map((entry, seq) => (
    typeof entry === 'string' ? { type: entry, seq } : { ...entry, seq }
  ));
}

const HEADER = { id: 'session-src', cwd: '/repos/alpha' };
const TARGET = '/repos/beta';

test('the boundary is the end of the last completed turn', () => {
  const events = log(
    'turn/start', 'assistant/message', 'turn/end',
    'turn/start', 'assistant/message', 'turn/end',
  );
  assert.equal(lastCompletedTurnBoundary(events), 5);
});

test('trailing standalone events belong to the completed prefix', () => {
  // `latestCompletedPrefixBoundary` keeps consuming after `turn/end` until the
  // next turn actually begins. Dropping these would lose durable metadata that
  // sits between turns.
  const events = log(
    'turn/start', 'turn/end',
    'session/title', 'model/selection', 'context/summary',
  );
  assert.equal(lastCompletedTurnBoundary(events), 4);
});

test('an appended user message ends the completed prefix', () => {
  // A NEW prompt opens the next turn; anything after it is in flight. The
  // `surfaceOp` is top-level on the event, and only the APPEND form starts a
  // turn — this mirrors DSH's own predicate exactly.
  const events = log(
    'turn/start', 'turn/end',
    { type: 'user/message', surfaceOp: 'append' }, 'turn/start',
  );
  assert.equal(lastCompletedTurnBoundary(events), 1);
});

test('a user message that only replaces surface does not end the prefix', () => {
  // `surfaceOp` is `'append'` or a `{ op: 'replace' }` object; only the
  // replacement form rewrites an existing message and starts no turn.
  const events = log('turn/start', 'turn/end', {
    type: 'user/message', surfaceOp: { op: 'replace', startSeq: 0, endSeq: 0 },
  });
  assert.equal(lastCompletedTurnBoundary(events), 2);
});

test('an inbox splice ends the completed prefix', () => {
  const events = log('turn/start', 'turn/end', 'agent/inbox/spliced');
  assert.equal(lastCompletedTurnBoundary(events), 1);
});

test('a log with no completed turn has no boundary', () => {
  assert.equal(lastCompletedTurnBoundary(log('turn/start', 'assistant/message')), undefined);
  assert.equal(lastCompletedTurnBoundary([]), undefined);
  assert.equal(lastCompletedTurnBoundary(undefined), undefined);
});

test('the boundary is read from seq, not from array position', () => {
  // A loaded page can start at a nonzero seq; returning an index there would
  // slice the wrong prefix.
  const events = [{ type: 'turn/start', seq: 40 }, { type: 'turn/end', seq: 41 }];
  assert.equal(lastCompletedTurnBoundary(events), 41);
});

test('an available plan names what is copied and what is dropped', () => {
  const events = log('turn/start', 'turn/end', 'turn/start', 'assistant/message');
  const plan = buildMigrationPlan({
    header: HEADER, events, targetPath: TARGET, targetTitle: 'beta',
  });

  assert.equal(plan.available, true);
  assert.equal(plan.reason, undefined);
  assert.equal(plan.boundary, 1);
  assert.equal(plan.copiedEvents, 2);
  // The open turn after the cut is countable, and the user is told.
  assert.equal(plan.droppedEvents, 2);
  assert.equal(plan.sameFolder, false);
  assert.equal(plan.title, 'beta');
});

test('every refusal is a named reason from the closed set', () => {
  const cases = [
    ['source-missing', { events: log('turn/end'), targetPath: TARGET }],
    ['no-cwd', { header: { id: 's' }, events: log('turn/end'), targetPath: TARGET }],
    ['no-completed-turn', { header: HEADER, events: log('turn/start'), targetPath: TARGET }],
    ['session-running', { header: HEADER, events: log('turn/end', 'turn/start'), targetPath: TARGET, running: true }],
    ['same-workspace', { header: HEADER, events: log('turn/end'), targetPath: '/repos/alpha' }],
    ['no-target', { header: HEADER, events: log('turn/end'), targetPath: '' }],
  ];

  for (const [expected, input] of cases) {
    const plan = buildMigrationPlan(input);
    assert.equal(plan.available, false, `${expected} must refuse`);
    assert.equal(plan.reason, expected);
    assert.ok(MIGRATION_REASONS.includes(plan.reason), `${expected} must be in the closed set`);
    // `same-workspace` alone reports the counts it WOULD have copied (asserted
    // separately below); every other refusal copies nothing.
    if (expected !== 'same-workspace') {
      assert.equal(plan.copiedEvents, 0, `${expected} must not claim to copy anything`);
    }
  }
});

test('a running session is refused rather than silently truncated', () => {
  // Its open turn sits after the last `turn/end`, so a prefix copy would drop
  // work in flight. "We copied most of it" is not something a user can detect.
  const events = log('turn/start', 'turn/end', 'turn/start', 'assistant/message');
  const plan = buildMigrationPlan({
    header: HEADER, events, targetPath: TARGET, running: true,
  });
  assert.equal(plan.available, false);
  assert.equal(plan.reason, 'session-running');
  assert.equal(plan.copiedEvents, 0);
});

test('the same-folder refusal still reports the history it would have copied', () => {
  // The dialog says "this is the folder it is already in"; showing the counts
  // is honest about what the operation would otherwise have done.
  const plan = buildMigrationPlan({
    header: HEADER,
    events: log('turn/start', 'turn/end', 'turn/start'),
    targetPath: '/repos/alpha/',
    normalizePath: value => value.replace(/\/+$/, ''),
  });
  assert.equal(plan.available, false);
  assert.equal(plan.reason, 'same-workspace');
  assert.equal(plan.sameFolder, true);
  assert.equal(plan.copiedEvents, 2);
  assert.equal(plan.droppedEvents, 1);
});

test('a trailing-separator difference is the same folder only when a normalizer says so', () => {
  const events = log('turn/end');
  // Without a normalizer the comparison is exact, matching DSH's attach rule.
  assert.equal(
    buildMigrationPlan({ header: HEADER, events, targetPath: '/repos/alpha/' }).reason,
    undefined,
  );
  assert.equal(
    buildMigrationPlan({
      header: HEADER, events, targetPath: '/repos/alpha/',
      normalizePath: value => value.replace(/[\\/]+$/, '').toLowerCase(),
    }).reason,
    'same-workspace',
  );
});

test('the plan never proposes a parent, which would hide the copy', () => {
  // `sections.cjs` hides any session whose parent differs from itself, so a
  // copied conversation carrying `parentSession` would vanish from every
  // section and read as a failed move. The plan has no such field by design.
  const plan = buildMigrationPlan({
    header: { ...HEADER, parentSession: undefined },
    events: log('turn/end'),
    targetPath: TARGET,
  });
  assert.equal(plan.available, true);
  assert.ok(!('parentSession' in plan), 'the plan must not carry fork lineage');
  assert.ok(!('origin' in plan), 'and must not be classified as delegated');
});

test('a malformed input refuses instead of throwing', () => {
  for (const input of [undefined, {}, { header: null }, { header: HEADER, events: null }]) {
    const plan = buildMigrationPlan(input ?? {});
    assert.equal(plan.available, false, 'a malformed plan must refuse');
    assert.ok(MIGRATION_REASONS.includes(plan.reason));
  }
});

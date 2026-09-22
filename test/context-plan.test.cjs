const test = require('node:test');
const assert = require('node:assert/strict');

const { buildContextPlan, describeWriteBoundary, formatContextPlan } = require('../src/core/context-plan.cjs');

const project = {
  id: 'p1',
  title: 'Weave',
  members: [
    { workspaceId: 'ws-a', role: 'writable' },
    { workspaceId: 'ws-b', role: 'writable' },
  ],
};

const paths = { 'ws-a': 'C:/work/alpha', 'ws-b': 'C:/work/beta' };

test('the plan lists every skill with the folder providing it', () => {
  const plan = buildContextPlan({
    project,
    pathsByWorkspaceId: paths,
    skillsByRoot: {
      'C:/work/alpha/.dsh/skills': [{ name: 'alpha-build', description: 'build alpha', path: 'C:/work/alpha/.dsh/skills/alpha-build/SKILL.md' }],
      'C:/work/beta/.dsh/skills': [{ name: 'beta-deploy', description: 'deploy beta', path: 'C:/work/beta/.dsh/skills/beta-deploy/SKILL.md' }],
    },
    rootStates: {
      'C:/work/alpha/.dsh/skills': { exists: true },
      'C:/work/beta/.dsh/skills': { exists: true },
    },
    sandboxMode: 'danger-full-access',
  });

  assert.equal(plan.summary.skillCount, 2);
  const byName = Object.fromEntries(plan.skills.map(s => [s.name, s.workspaceId]));
  assert.equal(byName['alpha-build'], 'ws-a');
  assert.equal(byName['beta-deploy'], 'ws-b');
});

test('the plan surfaces a collision with winner and shadowed losers', () => {
  const plan = buildContextPlan({
    project,
    pathsByWorkspaceId: paths,
    skillsByRoot: {
      'C:/work/alpha/.dsh/skills': [{ name: 'shared', description: 'from a', path: 'C:/work/alpha/.dsh/skills/shared/SKILL.md' }],
      'C:/work/beta/.dsh/skills': [{ name: 'shared', description: 'from b', path: 'C:/work/beta/.dsh/skills/shared/SKILL.md' }],
    },
    rootStates: { 'C:/work/alpha/.dsh/skills': { exists: true }, 'C:/work/beta/.dsh/skills': { exists: true } },
    sandboxMode: 'danger-full-access',
  });

  assert.equal(plan.summary.collisionCount, 1);
  assert.equal(plan.collisions[0].name, 'shared');
  assert.equal(plan.collisions[0].winner.workspaceId, 'ws-a');
  assert.equal(plan.collisions[0].shadowed[0].workspaceId, 'ws-b');
});

test('a folder contributing nothing is named, never left silent', () => {
  const plan = buildContextPlan({
    project,
    pathsByWorkspaceId: paths,
    skillsByRoot: {},
    rootStates: {},
    instructions: [],
    sandboxMode: 'danger-full-access',
  });

  const silentIds = plan.silent.map(entry => entry.workspaceId);
  assert.ok(silentIds.includes('ws-a'));
  assert.ok(silentIds.includes('ws-b'));
  assert.equal(plan.summary.hasSilentMembers, true);
  assert.equal(plan.summary.silentMemberCount, 2);
});

test('an unresolvable workspace is reported as a distinct reason', () => {
  const plan = buildContextPlan({
    project,
    pathsByWorkspaceId: { 'ws-a': 'C:/work/alpha' },
    skillsByRoot: {},
    rootStates: {},
    instructions: [],
    sandboxMode: 'danger-full-access',
  });

  const missing = plan.silent.find(entry => entry.workspaceId === 'ws-b');
  assert.equal(missing.reason, 'workspace-unresolved');
  assert.equal(missing.level, 'warn');
});

test('a fully contributing project reports no silent members', () => {
  const plan = buildContextPlan({
    project,
    pathsByWorkspaceId: paths,
    skillsByRoot: {
      'C:/work/alpha/.dsh/skills': [{ name: 'a', description: 'a', path: 'p1' }],
      'C:/work/beta/.dsh/skills': [{ name: 'b', description: 'b', path: 'p2' }],
    },
    rootStates: { 'C:/work/alpha/.dsh/skills': { exists: true }, 'C:/work/beta/.dsh/skills': { exists: true } },
    instructions: [
      { workspaceId: 'ws-a', path: 'C:/work/alpha/AGENTS.md', bytes: 10, exists: true },
      { workspaceId: 'ws-b', path: 'C:/work/beta/AGENTS.md', bytes: 20, exists: true },
    ],
    sandboxMode: 'danger-full-access',
  });

  assert.equal(plan.summary.hasSilentMembers, false);
  assert.equal(plan.summary.silentMemberCount, 0);
  assert.equal(plan.summary.contributingMemberCount, 2);
});

test('instruction files are listed in order with byte totals', () => {
  const plan = buildContextPlan({
    project,
    pathsByWorkspaceId: paths,
    skillsByRoot: {},
    rootStates: {},
    instructions: [
      { workspaceId: 'ws-a', path: 'C:/work/alpha/AGENTS.md', bytes: 100, exists: true },
      { workspaceId: 'ws-b', path: 'C:/work/beta/AGENTS.md', bytes: 250, exists: true },
      { workspaceId: 'ws-b', path: 'C:/work/beta/CLAUDE.md', bytes: 0, exists: false },
    ],
    sandboxMode: 'danger-full-access',
  });

  assert.equal(plan.instructions.length, 2);
  assert.deepEqual(plan.instructions.map(i => i.workspaceId), ['ws-a', 'ws-b']);
  assert.equal(plan.instructionTotalBytes, 350);
});

test('workspace-write states the real single-root write limit', () => {
  const boundary = describeWriteBoundary('workspace-write', 'ws-a');
  assert.equal(boundary.writable, 'active-member-only');
  assert.equal(boundary.level, 'warn');
  assert.match(boundary.summary, /仅活动文件夹可写/);
});

test('danger-full-access reports all members writable', () => {
  const boundary = describeWriteBoundary('danger-full-access', 'ws-a');
  assert.equal(boundary.writable, 'all-members');
  assert.equal(boundary.level, 'info');
});

test('read-only reports no writes without pretending otherwise', () => {
  const boundary = describeWriteBoundary('read-only', 'ws-a');
  assert.equal(boundary.writable, 'none');
  assert.equal(boundary.level, 'warn');
});

test('an unknown sandbox mode is flagged rather than assumed safe', () => {
  const boundary = describeWriteBoundary('mystery-mode', 'ws-a');
  assert.equal(boundary.writable, 'unknown');
  assert.equal(boundary.level, 'warn');
});

test('the plan is JSON-serializable for transport over RPC', () => {
  const plan = buildContextPlan({
    project,
    pathsByWorkspaceId: paths,
    skillsByRoot: { 'C:/work/alpha/.dsh/skills': [{ name: 'a', description: 'a', path: 'p' }] },
    rootStates: { 'C:/work/alpha/.dsh/skills': { exists: true } },
    instructions: [],
    sandboxMode: 'workspace-write',
  });
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(plan)));
});

test('formatContextPlan renders provenance, collisions, and the write boundary', () => {
  const plan = buildContextPlan({
    project,
    pathsByWorkspaceId: paths,
    skillsByRoot: {
      'C:/work/alpha/.dsh/skills': [{ name: 'shared', description: 'a', path: 'a/SKILL.md' }],
      'C:/work/beta/.dsh/skills': [{ name: 'shared', description: 'b', path: 'b/SKILL.md' }],
    },
    rootStates: { 'C:/work/alpha/.dsh/skills': { exists: true }, 'C:/work/beta/.dsh/skills': { exists: true } },
    instructions: [{ workspaceId: 'ws-a', path: 'C:/work/alpha/AGENTS.md', bytes: 12, exists: true }],
    sandboxMode: 'workspace-write',
    activeWorkspaceId: 'ws-a',
  });

  const text = formatContextPlan(plan);
  assert.match(text, /技能（1）/);
  assert.match(text, /shared ← ws-a/);
  assert.match(text, /名称冲突（1）/);
  assert.match(text, /被遮蔽：ws-b/);
  assert.match(text, /仅活动文件夹可写/);
});

test('a member with only instructions is counted as contributing', () => {
  const plan = buildContextPlan({
    project,
    pathsByWorkspaceId: paths,
    skillsByRoot: {},
    rootStates: {},
    instructions: [{ workspaceId: 'ws-a', path: 'C:/work/alpha/AGENTS.md', bytes: 5, exists: true }],
    sandboxMode: 'danger-full-access',
  });

  assert.equal(plan.summary.contributingMemberCount, 1);
  const silentIds = plan.silent.filter(entry => entry.reason === 'workspace-unresolved').map(e => e.workspaceId);
  assert.deepEqual(silentIds, []);
  assert.equal(plan.summary.silentMemberCount, 1);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LOOM_SKILL_RANK,
  instructionCandidatesForProject,
  resolveSkillCollisions,
  skillRootsForProject,
} = require('../src/core/skill-roots.cjs');

const project = {
  id: 'p1',
  title: 'Weave',
  members: [
    { workspaceId: 'ws-a', role: 'writable' },
    { workspaceId: 'ws-b', role: 'readonly' },
  ],
};

test('every member contributes both skill roots, in declared order', () => {
  const { roots, unresolved } = skillRootsForProject(project, {
    'ws-a': 'C:/work/alpha',
    'ws-b': 'C:/work/beta',
  });

  assert.deepEqual(unresolved, []);
  assert.deepEqual(roots.map(root => root.path), [
    'C:/work/alpha/.dsh/skills',
    'C:/work/alpha/.agents/skills',
    'C:/work/beta/.dsh/skills',
    'C:/work/beta/.agents/skills',
  ]);
  assert.deepEqual(roots.map(root => root.workspaceId), ['ws-a', 'ws-a', 'ws-b', 'ws-b']);
});

test('an unresolved member is reported rather than silently skipped', () => {
  const { roots, unresolved } = skillRootsForProject(project, { 'ws-a': 'C:/work/alpha' });
  assert.deepEqual(unresolved, ['ws-b']);
  assert.equal(roots.length, 2, 'the resolvable member still contributes');
});

test('skill roots use forward slashes so they match the provider convention', () => {
  const { roots } = skillRootsForProject({ members: [{ workspaceId: 'ws-a' }] }, { 'ws-a': 'C:\\work\\alpha\\' });
  assert.equal(roots[0].path, 'C:/work/alpha/.dsh/skills');
});

test('instruction candidates cover both AGENTS.md and CLAUDE.md per member', () => {
  const { candidates } = instructionCandidatesForProject(project, {
    'ws-a': 'C:/work/alpha',
    'ws-b': 'C:/work/beta',
  });
  assert.deepEqual(candidates.map(c => c.path), [
    'C:/work/alpha/AGENTS.md',
    'C:/work/alpha/CLAUDE.md',
    'C:/work/beta/AGENTS.md',
    'C:/work/beta/CLAUDE.md',
  ]);
});

test('a writable member wins a collision over a readonly one', () => {
  const { winners, collisions } = resolveSkillCollisions([
    { name: 'deploy', workspaceId: 'ws-b', role: 'readonly', memberIndex: 0, path: 'b/SKILL.md' },
    { name: 'deploy', workspaceId: 'ws-a', role: 'writable', memberIndex: 1, path: 'a/SKILL.md' },
  ]);

  assert.equal(winners.length, 1);
  assert.equal(winners[0].workspaceId, 'ws-a');
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].shadowed[0].workspaceId, 'ws-b');
});

test('among equal roles, declared member order wins', () => {
  const { winners, collisions } = resolveSkillCollisions([
    { name: 'lint', workspaceId: 'ws-b', role: 'writable', memberIndex: 1, path: 'b/SKILL.md' },
    { name: 'lint', workspaceId: 'ws-a', role: 'writable', memberIndex: 0, path: 'a/SKILL.md' },
  ]);
  assert.equal(winners[0].workspaceId, 'ws-a');
  assert.equal(collisions[0].shadowed[0].workspaceId, 'ws-b');
});

test('a collision names every shadowed provider, not just one', () => {
  const { collisions } = resolveSkillCollisions([
    { name: 'same', workspaceId: 'ws-a', role: 'writable', memberIndex: 0, path: 'a/SKILL.md' },
    { name: 'same', workspaceId: 'ws-b', role: 'writable', memberIndex: 1, path: 'b/SKILL.md' },
    { name: 'same', workspaceId: 'ws-c', role: 'writable', memberIndex: 2, path: 'c/SKILL.md' },
  ]);
  assert.equal(collisions.length, 1);
  assert.deepEqual(collisions[0].shadowed.map(s => s.workspaceId), ['ws-b', 'ws-c']);
});

test('distinct skill names produce no collisions', () => {
  const { winners, collisions } = resolveSkillCollisions([
    { name: 'one', workspaceId: 'ws-a', role: 'writable', memberIndex: 0 },
    { name: 'two', workspaceId: 'ws-b', role: 'writable', memberIndex: 1 },
  ]);
  assert.equal(winners.length, 2);
  assert.equal(collisions.length, 0);
});

test('the Loom rank sits between DSH project ranks and user ranks', () => {
  // PROJECT_DSH_RANK 100 < LOOM 150 < PROJECT_AGENTS_RANK 200 < USER_DSH_RANK 400
  assert.ok(LOOM_SKILL_RANK > 100);
  assert.ok(LOOM_SKILL_RANK < 400);
});

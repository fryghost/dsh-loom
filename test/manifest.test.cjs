const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEMA_VERSION,
  createEmptyManifest,
  defaultWorkspaceFor,
  findProject,
  migrateFromV1,
  normalizeManifest,
  projectsContaining,
  readManifest,
  removeProject,
  upsertProject,
} = require('../src/core/manifest.cjs');

test('a folder may belong to several projects at once', () => {
  const manifest = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [
      { id: 'p1', title: 'One', members: ['ws-shared', 'ws-a'] },
      { id: 'p2', title: 'Two', members: ['ws-shared', 'ws-b'] },
    ],
  });

  assert.equal(manifest.projects.length, 2);
  assert.deepEqual(
    projectsContaining(manifest, 'ws-shared').map(project => project.id),
    ['p1', 'p2'],
  );
});

test('a member claimed by an earlier project is never dropped from a later one', () => {
  // This is the exact dsh-projects v1 defect: a global `claimed` set silently
  // removed overlapping members, and `length < 2` then deleted the group.
  const manifest = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [
      { id: 'p1', title: 'One', members: ['ws-a', 'ws-b'] },
      { id: 'p2', title: 'Two', members: ['ws-a', 'ws-b'] },
    ],
  });

  assert.equal(manifest.projects.length, 2);
  assert.deepEqual(manifest.projects[1].members.map(m => m.workspaceId), ['ws-a', 'ws-b']);
});

test('a single-member project is legal', () => {
  const manifest = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p1', title: 'Solo', members: ['ws-only'] }],
  });
  assert.equal(manifest.projects.length, 1);
  assert.equal(manifest.projects[0].members.length, 1);
});

test('a project with zero members survives normalization', () => {
  // Dropping it would repeat the silent-disappearance bug.
  const manifest = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p1', title: 'Empty', members: [] }],
  });
  assert.equal(manifest.projects.length, 1);
  assert.equal(manifest.projects[0].members.length, 0);
});

test('unresolvable members are retained and flagged, not pruned', () => {
  const manifest = normalizeManifest(
    { schemaVersion: SCHEMA_VERSION, projects: [{ id: 'p1', title: 'P', members: ['ws-known', 'ws-gone'] }] },
    { knownWorkspaceIds: ['ws-known'] },
  );
  const members = manifest.projects[0].members;
  assert.equal(members.length, 2, 'the missing member must not be removed');
  assert.equal(members.find(m => m.workspaceId === 'ws-known').missing, undefined);
  assert.equal(members.find(m => m.workspaceId === 'ws-gone').missing, true);
});

test('duplicate member ids collapse within one project', () => {
  const manifest = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p1', title: 'P', members: ['ws-a', 'ws-a', 'ws-b'] }],
  });
  assert.deepEqual(manifest.projects[0].members.map(m => m.workspaceId), ['ws-a', 'ws-b']);
});

test('member roles default to writable and accept readonly', () => {
  const manifest = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p1', title: 'P', members: ['ws-a', { workspaceId: 'ws-b', role: 'readonly' }, { workspaceId: 'ws-c', role: 'bogus' }] }],
  });
  const roles = Object.fromEntries(manifest.projects[0].members.map(m => [m.workspaceId, m.role]));
  assert.equal(roles['ws-a'], 'writable');
  assert.equal(roles['ws-b'], 'readonly');
  assert.equal(roles['ws-c'], 'writable');
});

test('defaultWorkspaceId falls back to the first member and is not a rank', () => {
  const manifest = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p1', title: 'P', members: ['ws-a', 'ws-b'], defaultWorkspaceId: 'ws-b' }],
  });
  assert.equal(defaultWorkspaceFor(manifest, 'p1'), 'ws-b');

  const noDefault = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p2', title: 'P', members: ['ws-x', 'ws-y'] }],
  });
  assert.equal(defaultWorkspaceFor(noDefault, 'p2'), 'ws-x');
});

test('a defaultWorkspaceId naming a non-member is ignored', () => {
  const manifest = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p1', title: 'P', members: ['ws-a'], defaultWorkspaceId: 'ws-elsewhere' }],
  });
  assert.equal(defaultWorkspaceFor(manifest, 'p1'), 'ws-a');
});

test('upserting one project does not disturb another project membership', () => {
  const base = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [
      { id: 'p1', title: 'One', members: ['ws-a', 'ws-b'] },
      { id: 'p2', title: 'Two', members: ['ws-a'] },
    ],
  });
  const after = upsertProject(base, { id: 'p2', title: 'Two renamed', members: ['ws-a', 'ws-c'] });

  const p1 = findProject(after, 'p1');
  assert.deepEqual(p1.members.map(m => m.workspaceId), ['ws-a', 'ws-b']);
  assert.equal(findProject(after, 'p2').title, 'Two renamed');
});

test('removeProject leaves other projects intact', () => {
  const base = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p1', title: 'One', members: ['ws-a'] }, { id: 'p2', title: 'Two', members: ['ws-a'] }],
  });
  const after = removeProject(base, 'p1');
  assert.equal(after.projects.length, 1);
  assert.equal(after.projects[0].id, 'p2');
});

test('a newer schema version is never reinterpreted', () => {
  const result = readManifest({ schemaVersion: 99, projects: [{ id: 'p1', title: 'Future', members: ['ws-a'] }] });
  assert.equal(result.supported, false);
  assert.equal(result.foundVersion, 99);
  assert.equal(result.projects.length, 0);
});

test('unreadable input degrades to an empty manifest', () => {
  for (const value of [undefined, null, 42, 'nope', [], { schemaVersion: 'x' }]) {
    const manifest = readManifest(value);
    assert.equal(manifest.projects.length, 0);
  }
});

test('structurally invalid projects are reported in dropped, not silently ignored', () => {
  const manifest = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [
      { title: 'no id', members: ['ws-a'] },
      { id: 'p1', title: 'ok', members: ['ws-a'] },
      { id: 'p1', title: 'dup id', members: ['ws-b'] },
    ],
  });
  assert.equal(manifest.projects.length, 1);
  assert.ok(manifest.dropped.some(entry => entry.reason === 'missing-id'));
  assert.ok(manifest.dropped.some(entry => entry.reason === 'duplicate-id'));
});

test('migrating v1 keeps retained members and states the lossy part honestly', () => {
  const migrated = migrateFromV1({
    schemaVersion: 1,
    groups: [{ id: 'g1', title: 'Legacy', primaryWorkspaceId: 'ws-b', memberWorkspaceIds: ['ws-a', 'ws-b'] }],
  });

  assert.equal(migrated.migrated, 1);
  assert.equal(migrated.manifest.projects[0].title, 'Legacy');
  assert.deepEqual(migrated.manifest.projects[0].members.map(m => m.workspaceId), ['ws-a', 'ws-b']);
  assert.equal(defaultWorkspaceFor(migrated.manifest, 'g1'), 'ws-b');
  assert.match(migrated.note, /not recoverable/);
});

test('migrating a bare v1 array also works', () => {
  const migrated = migrateFromV1([{ id: 'g1', title: 'Legacy', memberWorkspaceIds: ['ws-a'] }]);
  assert.equal(migrated.migrated, 1);
});

test('createEmptyManifest is empty and versioned', () => {
  const empty = createEmptyManifest();
  assert.equal(empty.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(empty.projects, []);
});

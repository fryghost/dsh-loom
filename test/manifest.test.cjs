const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEMA_VERSION,
  chatsFolderOf,
  createEmptyManifest,
  defaultWorkspaceFor,
  findProject,
  mergeMembers,
  migrateFromV1,
  normalizeComparablePath,
  normalizeManifest,
  projectsContaining,
  readManifest,
  removeProject,
  setChatsFolder,
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

test('the default chat folder round-trips and is optional', () => {
  // An ADDITIVE OPTIONAL key: absent on every manifest written before this
  // existed, and absent must stay absent rather than becoming an empty string
  // that reads as "set to nowhere".
  const bare = normalizeManifest({ schemaVersion: SCHEMA_VERSION, projects: [] });
  assert.equal(chatsFolderOf(bare), undefined);
  assert.ok(!('chatsCwd' in bare), 'an unset preference is omitted, not blank');

  const set = normalizeManifest({
    schemaVersion: SCHEMA_VERSION, projects: [], chatsCwd: '  D:\\work\\chat  ',
  });
  assert.equal(chatsFolderOf(set), 'D:\\work\\chat', 'the stored value is trimmed');

  for (const blank of ['', '   ', 42, null, [], {}]) {
    assert.equal(
      chatsFolderOf(normalizeManifest({ schemaVersion: SCHEMA_VERSION, projects: [], chatsCwd: blank })),
      undefined,
      `a non-path value (${JSON.stringify(blank)}) must read as unset`,
    );
  }
});

test('setting and clearing the chat folder keeps the projects', () => {
  const base = normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p1', title: 'One', members: ['ws-a'] }],
  });

  const withFolder = setChatsFolder(base, '/work/chat');
  assert.equal(chatsFolderOf(withFolder), '/work/chat');
  assert.equal(withFolder.projects.length, 1, 'the preference is beside projects, not instead of them');

  const cleared = setChatsFolder(withFolder, undefined);
  assert.equal(chatsFolderOf(cleared), undefined);
  assert.equal(cleared.projects.length, 1, 'clearing a preference must not touch the projects');
});

test('editing a project does not clear the default chat folder', () => {
  // The whole reason `withChatsCwd` exists: `upsertProject` and `removeProject`
  // rebuild the PROJECT list, and a preference carried only by the caller's
  // object would be dropped by an edit that has nothing to do with it.
  const base = setChatsFolder(normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: [{ id: 'p1', title: 'One', members: ['ws-a'] }],
  }), '/work/chat');

  const renamed = upsertProject(base, { id: 'p1', title: 'Renamed', members: ['ws-a'] });
  assert.equal(chatsFolderOf(renamed), '/work/chat', 'renaming a project keeps the chat folder');

  const removed = removeProject(renamed, 'p1');
  assert.equal(chatsFolderOf(removed), '/work/chat', 'deleting the last project keeps it too');
});

test('the chat folder does not raise the schema version', () => {
  // Raised deliberately NOT. A version bump makes every older Loom treat the
  // whole manifest as unsupported and show no projects at all; dropping one
  // optional preference is recoverable, an empty 项目 section is not.
  assert.equal(SCHEMA_VERSION, 2, 'an additive optional key is not a schema break');
  const older = { schemaVersion: 2, projects: [{ id: 'p1', title: 'One', members: ['ws-a'] }] };
  assert.equal(readManifest(older).supported, undefined, 'a manifest with no chat folder still loads');
  assert.equal(readManifest(older).projects.length, 1);
  // And a manifest written by the NEWER build stays readable by this one.
  const newer = { schemaVersion: 2, projects: [], chatsCwd: '/work/chat' };
  assert.equal(readManifest(newer).projects.length, 0);
  assert.equal(chatsFolderOf(readManifest(newer)), '/work/chat');
});

test('the comparable path folds separators and a trailing slash, and nothing else', () => {
  // Used ONLY for the "this folder is already a workspace" hint. It must not be
  // cleverer than that: attribution stays DSH's exact-equality rule, and a
  // normalizer good enough for a hint is not good enough to group a session.
  const same = [
    'D:\\work\\app',
    'D:/work/app',
    'D:\\work\\app\\',
    '  D:\\work\\app  ',
  ];
  const folded = same.map(normalizeComparablePath);
  assert.equal(new Set(folded).size, 1, 'the same folder spelled four ways folds to one value');

  assert.notEqual(normalizeComparablePath('D:\\work\\app'), normalizeComparablePath('D:\\work\\app2'));
  assert.notEqual(normalizeComparablePath('D:\\work\\app'), normalizeComparablePath('D:\\work\\app\\sub'));
  assert.equal(normalizeComparablePath(undefined), '');
  assert.equal(normalizeComparablePath(null), '');
  assert.equal(normalizeComparablePath(42), '');
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

/*
 * Editing membership must not rewrite anything else.
 *
 * Both properties below were broken by the editor deriving its member list from
 * the live workspace registry and hard-coding `role: 'writable'`: saving a
 * project silently promoted every `readonly` folder and deleted any member whose
 * folder was merely offline — contradicting this module's own promise that
 * unresolvable members are RETAINED and reported as `missing`, never pruned.
 */
test('editing membership keeps each retained member\'s role', () => {
  const previous = [
    { workspaceId: 'ws-a', role: 'readonly' },
    { workspaceId: 'ws-b', role: 'writable' },
  ];

  const members = mergeMembers(previous, ['ws-a', 'ws-b']);

  assert.deepEqual(members, previous, 'the role is the reason the folder was added; an edit must not change it');
});

test('editing membership keeps a member the registry cannot currently resolve', () => {
  // 'ws-gone' is absent from the editor's checkbox list because it cannot be
  // resolved — that must NOT be read as "the user unchecked it".
  const members = mergeMembers(
    [{ workspaceId: 'ws-gone', role: 'readonly' }, { workspaceId: 'ws-live', role: 'writable' }],
    ['ws-gone', 'ws-live'],
  );

  assert.deepEqual(members.map(m => m.workspaceId), ['ws-gone', 'ws-live']);
  assert.equal(members[0].role, 'readonly');
});

test('a member the user actually unchecks is removed', () => {
  const members = mergeMembers(
    [{ workspaceId: 'ws-keep', role: 'writable' }, { workspaceId: 'ws-drop', role: 'writable' }],
    ['ws-keep'],
  );

  assert.deepEqual(members.map(m => m.workspaceId), ['ws-keep'],
    'retention protects unresolvable members, not a deliberate removal');
});

test('editing membership keeps a member\'s note and de-duplicates', () => {
  const members = mergeMembers(
    [{ workspaceId: 'ws-a', role: 'readonly', note: 'schema source' }],
    ['ws-a', 'ws-a', 'ws-new'],
  );

  assert.deepEqual(members, [
    { workspaceId: 'ws-a', role: 'readonly', note: 'schema source' },
    { workspaceId: 'ws-new', role: 'writable' },
  ]);
});

test('a newly added member is writable, and order follows the editor', () => {
  const members = mergeMembers([], ['ws-z', 'ws-a']);

  assert.deepEqual(members, [
    { workspaceId: 'ws-z', role: 'writable' },
    { workspaceId: 'ws-a', role: 'writable' },
  ]);
});

test('editing membership tolerates a missing or malformed previous list', () => {
  assert.deepEqual(mergeMembers(undefined, ['ws-a']), [{ workspaceId: 'ws-a', role: 'writable' }]);
  assert.deepEqual(mergeMembers([null, 'ws-a', { role: 'readonly' }], ['ws-a']),
    [{ workspaceId: 'ws-a', role: 'writable' }],
    'a bare id normalizes to writable and an id-less entry is dropped');
});

test('the edited members survive a round trip through the manifest rules', () => {
  const previous = [
    { workspaceId: 'ws-a', role: 'readonly' },
    { workspaceId: 'ws-gone', role: 'writable' },
  ];
  const members = mergeMembers(previous, ['ws-a', 'ws-gone']);

  // Reading back with only ws-a resolvable must flag ws-gone as missing and
  // still keep it — the property the editor used to violate.
  const manifest = normalizeManifest(
    { schemaVersion: SCHEMA_VERSION, projects: [{ id: 'p1', title: 'P', members }] },
    { knownWorkspaceIds: ['ws-a'] },
  );

  const read = manifest.projects[0].members;
  assert.deepEqual(read.map(m => m.workspaceId), ['ws-a', 'ws-gone']);
  assert.equal(read[0].role, 'readonly');
  assert.equal(read[0].missing, undefined);
  assert.equal(read[1].missing, true, 'the unresolvable member is reported, not dropped');
});


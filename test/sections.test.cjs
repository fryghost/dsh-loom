/**
 * The sidebar's three-section rule.
 *
 * The chosen rule is UNIQUE ATTRIBUTION: a session appears in exactly one of
 * 项目 / 工作区 / 聊天. That is the property worth guarding — a session listed
 * in two sections is confusing, and a session listed in none is invisible.
 *
 * This lives in a pure core module precisely so it can be asserted here without
 * a browser, a slot runtime, or React.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveSections } = require('../src/core/sections.cjs');

const summary = (id, title, updatedAt = 1) => ({ id, displayTitle: title, running: false, updatedAt });
const workspace = (workspaceId, title, sessionIds) => ({
  workspaceId, title, path: `/work/${workspaceId}`, sessionIds, createdAt: '', updatedAt: '',
});

/** Build the two store snapshots from a compact description. */
function stores({ workspaces, sessions, archived = [], ids }) {
  return {
    snapshot: { items: workspaces, archivedSessionIds: archived, state: 'idle', phase: 'ready', error: null },
    sessionState: {
      ids: ids ?? Object.keys(sessions),
      byId: sessions,
      current: undefined,
      phase: 'ready',
    },
  };
}

test('a session in a project member folder lands in 项目, not 工作区', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['s1']), workspace('b', 'Beta', ['s2'])],
    sessions: { s1: summary('s1', 'one'), s2: summary('s2', 'two') },
  });
  const projects = [{ id: 'p', title: 'Proj', members: [{ workspaceId: 'a' }, { workspaceId: 'b' }] }];

  const { projectRows, workspaceRows, chatSessions } = deriveSections({ projects, snapshot, sessionState });

  assert.deepEqual(projectRows[0].sessions.map(s => s.id).sort(), ['s1', 's2']);
  assert.deepEqual(workspaceRows, [], 'a claimed workspace must not also appear under 工作区');
  assert.deepEqual(chatSessions, []);
});

test('an unclaimed workspace keeps its own section', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['s1']), workspace('c', 'Gamma', ['s3'])],
    sessions: { s1: summary('s1', 'one'), s3: summary('s3', 'three') },
  });
  const projects = [{ id: 'p', title: 'Proj', members: [{ workspaceId: 'a' }] }];

  const { projectRows, workspaceRows } = deriveSections({ projects, snapshot, sessionState });

  assert.deepEqual(projectRows[0].sessions.map(s => s.id), ['s1']);
  assert.deepEqual(workspaceRows.map(r => r.key), ['c']);
  assert.deepEqual(workspaceRows[0].sessions.map(s => s.id), ['s3']);
});

test('a session no grouping accounts for lands in 聊天', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['s1'])],
    sessions: { s1: summary('s1', 'one'), sLoose: summary('sLoose', 'loose') },
    ids: ['s1', 'sLoose'],
  });

  const { chatSessions } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(chatSessions.map(s => s.id), ['sLoose']);
});

test('the three sections never overlap and never lose a session', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['s1', 's2']), workspace('c', 'Gamma', ['s3'])],
    sessions: {
      s1: summary('s1', 'one'), s2: summary('s2', 'two'),
      s3: summary('s3', 'three'), s4: summary('s4', 'loose'),
    },
    ids: ['s1', 's2', 's3', 's4'],
  });
  const projects = [{ id: 'p', title: 'Proj', members: [{ workspaceId: 'a' }] }];

  const { projectRows, workspaceRows, chatSessions } = deriveSections({ projects, snapshot, sessionState });
  const all = [
    ...projectRows.flatMap(r => r.sessions.map(s => s.id)),
    ...workspaceRows.flatMap(r => r.sessions.map(s => s.id)),
    ...chatSessions.map(s => s.id),
  ];

  assert.equal(all.length, new Set(all).size, 'a session must not appear in two sections');
  assert.deepEqual([...all].sort(), ['s1', 's2', 's3', 's4'], 'no session may go missing');
});

test('a session shared by two members of one project appears once', () => {
  const { snapshot, sessionState } = stores({
    // Two workspaces listing the same session — legal, and must not duplicate.
    workspaces: [workspace('a', 'Alpha', ['shared']), workspace('b', 'Beta', ['shared'])],
    sessions: { shared: summary('shared', 'shared') },
  });
  const projects = [{ id: 'p', title: 'Proj', members: [{ workspaceId: 'a' }, { workspaceId: 'b' }] }];

  const { projectRows } = deriveSections({ projects, snapshot, sessionState });

  assert.deepEqual(projectRows[0].sessions.map(s => s.id), ['shared']);
});

test('archived sessions are hidden from every section', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['s1', 's2'])],
    sessions: { s1: summary('s1', 'one'), s2: summary('s2', 'two') },
    archived: ['s1'],
  });

  const { projectRows, workspaceRows, chatSessions } = deriveSections({ projects: [], snapshot, sessionState });

  const all = [
    ...projectRows.flatMap(r => r.sessions.map(s => s.id)),
    ...workspaceRows.flatMap(r => r.sessions.map(s => s.id)),
    ...chatSessions.map(s => s.id),
  ];
  assert.deepEqual(all, ['s2']);
});

test('sessions are newest first', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['old', 'new', 'mid'])],
    sessions: {
      old: summary('old', 'old', 100), mid: summary('mid', 'mid', 200), new: summary('new', 'new', 300),
    },
  });

  const { workspaceRows } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(workspaceRows[0].sessions.map(s => s.id), ['new', 'mid', 'old']);
});

test('a project row starts its chats in the declared folder', () => {
  const { snapshot, sessionState } = stores({ workspaces: [], sessions: {} });
  const projects = [{
    id: 'p', title: 'Proj', defaultWorkspaceId: 'b',
    members: [{ workspaceId: 'a' }, { workspaceId: 'b' }],
  }];

  const { projectRows } = deriveSections({ projects, snapshot, sessionState });

  assert.equal(projectRows[0].startWorkspaceId, 'b');
  assert.equal(projectRows[0].folders, 2);
});

test('missing or empty input degrades to empty sections rather than throwing', () => {
  assert.deepEqual(deriveSections(), { projectRows: [], workspaceRows: [], chatSessions: [] });
  assert.deepEqual(deriveSections({ projects: [], snapshot: {}, sessionState: {} }),
    { projectRows: [], workspaceRows: [], chatSessions: [] });
});
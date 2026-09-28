/**
 * The sidebar's three-section rule.
 *
 * The chosen rule is UNIQUE ATTRIBUTION for SESSIONS: a session appears in
 * exactly one of 项目 / 工作区 / 聊天. That is the property worth guarding — a
 * session listed in two sections is confusing, and a session listed in none is
 * invisible. WORKSPACES are different: every registered folder is listed, and a
 * claimed one names WHO claims it instead of disappearing (a folder vanishing
 * the moment it joined a project is what made a folder look unbindable, and the
 * opposite of a many-to-many model).
 *
 * This lives in a pure core module precisely so it can be asserted here without
 * a browser, a slot runtime, or React.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { currentSessionId, deriveSections } = require('../src/core/sections.cjs');

const summary = (id, title, updatedAt = 1) => ({ id, displayTitle: title, running: false, blank: false, updatedAt });
/** A subagent child: `origin: 'subagent'` is what marks it. */
const subagent = (id, title, updatedAt = 1) => ({ ...summary(id, title, updatedAt), origin: 'subagent' });
const blank = (id, updatedAt = 1) => ({ ...summary(id, '', updatedAt), blank: true });
/** The selected Session, as the host marks it: retained by the main view. */
const selected = (id, updatedAt = 1) => ({ ...blank(id, updatedAt), retainedBy: { mainView: 1 } });
const workspace = (workspaceId, title, sessionIds) => ({
  workspaceId, title, path: `/work/${workspaceId}`, sessionIds, createdAt: '', updatedAt: '',
});

/**
 * Build the two store snapshots from a compact description.
 *
 * Deliberately CLOSE TO THE REAL SHAPES. In particular there is no `current`
 * field on the session store, because the real `SessionListState` has none — an
 * earlier version of this helper wrote one anyway, which is how the
 * `sessionState.current` bug stayed green while every blank Session (including
 * the provisional New Session row) was being filtered out in production.
 */
function stores({ workspaces, sessions, archived = [], ids }) {
  return {
    snapshot: { items: workspaces, archivedSessionIds: archived, state: 'idle', phase: 'ready', error: null },
    sessionState: {
      ids: ids ?? Object.keys(sessions),
      byId: sessions,
      phase: 'ready',
    },
  };
}

const idsOf = rows => rows.flatMap(row => row.sessions.map(s => s.id));

test('a session in a project member folder lands in 项目, not 工作区', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['s1']), workspace('b', 'Beta', ['s2'])],
    sessions: { s1: summary('s1', 'one'), s2: summary('s2', 'two') },
  });
  const projects = [{ id: 'p', title: 'Proj', members: [{ workspaceId: 'a' }, { workspaceId: 'b' }] }];

  const { projectRows, workspaceRows, chatSessions } = deriveSections({ projects, snapshot, sessionState });

  assert.deepEqual(projectRows[0].sessions.map(s => s.id).sort(), ['s1', 's2']);
  assert.deepEqual(chatSessions, []);
  // Both folders are CLAIMED, so neither repeats the sessions — but both rows
  // still exist, naming their project. A folder must never vanish from the
  // section that lists folders just because a project adopted it.
  assert.deepEqual(workspaceRows.map(r => r.key), ['a', 'b']);
  assert.deepEqual(workspaceRows.map(r => r.claimedBy), [['Proj'], ['Proj']]);
  assert.deepEqual(idsOf(workspaceRows), [], 'a session is not repeated under its workspace');
});

test('an unclaimed workspace keeps its own section', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['s1']), workspace('c', 'Gamma', ['s3'])],
    sessions: { s1: summary('s1', 'one'), s3: summary('s3', 'three') },
  });
  const projects = [{ id: 'p', title: 'Proj', members: [{ workspaceId: 'a' }] }];

  const { projectRows, workspaceRows } = deriveSections({ projects, snapshot, sessionState });

  assert.deepEqual(projectRows[0].sessions.map(s => s.id), ['s1']);
  assert.deepEqual(workspaceRows.map(r => r.key), ['a', 'c']);
  assert.deepEqual(workspaceRows[0].claimedBy, ['Proj']);
  assert.deepEqual(idsOf([workspaceRows[0]]), [], 'a claimed folder defers its sessions to the project');
  assert.deepEqual(workspaceRows[1].claimedBy, []);
  assert.deepEqual(workspaceRows[1].sessions.map(s => s.id), ['s3']);
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
  const all = [...idsOf(projectRows), ...idsOf(workspaceRows), ...chatSessions.map(s => s.id)];

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

test('subagent children never reach any section', () => {
  // They are reachable through their parent's header catalog. Before this was
  // mirrored from DSH's own `sessionVisible`, subagent sessions had no workspace
  // of their own, so every one of them landed in 聊天 and flooded it.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['parent'])],
    sessions: {
      parent: summary('parent', 'parent'),
      child: subagent('child', 'child'),
      grandchild: subagent('grandchild', 'grandchild'),
    },
    ids: ['parent', 'child', 'grandchild'],
  });

  const { projectRows, workspaceRows, chatSessions } = deriveSections({ projects: [], snapshot, sessionState });
  const all = [...idsOf(projectRows), ...idsOf(workspaceRows), ...chatSessions.map(s => s.id)];

  assert.deepEqual(all, ['parent'], 'only the parent session is a session in this list');
});

test('the blank row of the session the main view retains is visible', () => {
  // The provisional New Session row. It is `blank`, so `sessionVisible` admits it
  // ONLY when it is the current Session — and the current Session comes from
  // `retainedBy.mainView`, the rule the shipped browser reads
  // (`ui-workspace/src/client/tree.ts`, `mainSessionId`). `SessionListState` has
  // no `current` field at all, so a test that sets one is asserting a field
  // production never populates.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['real', 'blankCurrent', 'blankOther'])],
    sessions: {
      real: summary('real', 'real'),
      blankCurrent: selected('blankCurrent'),
      blankOther: blank('blankOther'),
    },
  });

  const { workspaceRows, current } = deriveSections({ projects: [], snapshot, sessionState });

  assert.equal(current, 'blankCurrent', 'main-view retention is the source of truth');
  assert.deepEqual(workspaceRows[0].sessions.map(s => s.id), ['blankCurrent', 'real'],
    'the selected blank row leads, and the unselected placeholder is hidden');
});

test('an invented current field on the session store is ignored', () => {
  // Guard for the masking itself: the fix must not be fakeable by writing the
  // field production never sets.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['real', 'blankA', 'blankB'])],
    sessions: {
      real: summary('real', 'real'),
      blankA: blank('blankA'),
      blankB: blank('blankB'),
    },
  });
  sessionState.current = 'blankA';
  sessionState.byId.blankB.retainedBy = { mainView: 1 };

  const { current, workspaceRows } = deriveSections({ projects: [], snapshot, sessionState });

  assert.equal(current, 'blankB', 'retention wins; a hand-written `current` is not read');
  assert.deepEqual(workspaceRows[0].sessions.map(s => s.id), ['blankB', 'real']);
});

test('a selected main panel suppresses the HIGHLIGHT, not the row', () => {
  // The host separates two questions, and conflating them was a real defect:
  //   visibility — `tree.ts:340` uses the UNGUARDED `mainSessionId`, so the
  //                provisional New Session row STAYS in the tree;
  //   highlight  — `WorkspaceBrowser.tsx:294-296` applies the panel guard, so no
  //                row is drawn as selected while a panel is open.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['real', 'blankCurrent'])],
    sessions: { real: summary('real', 'real'), blankCurrent: selected('blankCurrent') },
  });

  const { current, highlighted, workspaceRows } = deriveSections({
    projects: [], snapshot, sessionState, panelActive: true,
  });

  assert.equal(current, 'blankCurrent', 'the Session is still current: the guard is not about identity');
  assert.equal(highlighted, undefined, 'but nothing is highlighted while a panel is open');
  assert.deepEqual(workspaceRows[0].sessions.map(s => s.id), ['blankCurrent', 'real'],
    'and the New Session row the host keeps must not be deleted by the guard');

  // With no panel open the two agree, so the highlight is not permanently off.
  const closed = deriveSections({ projects: [], snapshot, sessionState, panelActive: false });
  assert.equal(closed.highlighted, 'blankCurrent');
});

test('the current-session rule is a pure function of the session list', () => {
  assert.equal(currentSessionId(undefined), undefined);
  assert.equal(currentSessionId({ byId: {} }), undefined);
  assert.equal(currentSessionId({ byId: { a: summary('a', 'a') } }), undefined);
  assert.equal(currentSessionId({ byId: { a: selected('a') } }), 'a');
  // A retention count of zero is not retention.
  assert.equal(currentSessionId({ byId: { a: { ...summary('a', 'a'), retainedBy: { mainView: 0 } } } }), undefined);
  // The rule takes NO panel argument: the guard belongs to the highlight alone.
  assert.equal(currentSessionId.length, 1, 'a second parameter here would invite the guard back into visibility');
});

test('a folder claimed by two projects names both, in declaration order', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('shared', 'Shared', ['s1'])],
    sessions: { s1: summary('s1', 'one') },
  });
  const projects = [
    { id: 'p2', title: 'Second', members: [{ workspaceId: 'shared' }] },
    { id: 'p1', title: 'First', members: [{ workspaceId: 'shared' }] },
  ];

  const { workspaceRows, projectRows } = deriveSections({ projects, snapshot, sessionState });

  assert.deepEqual(workspaceRows[0].claimedBy, ['Second', 'First']);
  // Many-to-many means the SESSION appears under each claiming project; the
  // "unique" rule is between SECTIONS, not across projects.
  assert.deepEqual(projectRows.map(r => r.sessions.map(s => s.id)), [['s1'], ['s1']]);
});

test('archived sessions are hidden from every section', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['s1', 's2'])],
    sessions: { s1: summary('s1', 'one'), s2: summary('s2', 'two') },
    archived: ['s1'],
  });

  const { projectRows, workspaceRows, chatSessions } = deriveSections({ projects: [], snapshot, sessionState });
  const all = [...idsOf(projectRows), ...idsOf(workspaceRows), ...chatSessions.map(s => s.id)];

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
  const empty = {
    projectRows: [], workspaceRows: [], chatSessions: [], current: undefined, highlighted: undefined,
  };
  assert.deepEqual(deriveSections(), empty);
  assert.deepEqual(deriveSections({ projects: [], snapshot: {}, sessionState: {} }), empty);
});

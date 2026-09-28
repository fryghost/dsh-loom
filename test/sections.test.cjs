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

/**
 * A session row.
 *
 * Carries `title` (the DURABLE title) because production does: the store's
 * `title` is absent until the host projects one, and `sessionVisible` reads it to
 * tell a conversation from a shell. A fixture that set only `displayTitle` would
 * be describing a row production cannot produce — every such row would be a
 * shell and the whole file would assert the wrong thing.
 */
const summary = (id, title, updatedAt = 1) => ({
  id, title, displayTitle: title, running: false, blank: false, updatedAt,
});
/** A subagent child: `origin: 'subagent'` is what marks it. */
const subagent = (id, title, updatedAt = 1) => ({ ...summary(id, title, updatedAt), origin: 'subagent' });
const blank = (id, updatedAt = 1) => ({ ...summary(id, '', updatedAt), blank: true });
/** The selected Session, as the host marks it: retained by the main view. */
const selected = (id, updatedAt = 1) => ({ ...blank(id, updatedAt), retainedBy: { mainView: 1 } });
/** A session that lives at a path, which is what attribution now reads too. */
const at = (id, cwd, title = id, updatedAt = 1) => ({ ...summary(id, title, updatedAt), cwd });
/** A shell: created, never prompted, so the host never projected a title. */
const shell = (id, cwd, updatedAt = 1) => ({
  id, displayTitle: 'placeholder', running: false, blank: false, updatedAt, cwd,
});
const workspace = (workspaceId, title, sessionIds, path) => ({
  workspaceId, title, path: path ?? `/work/${workspaceId}`, sessionIds, createdAt: '', updatedAt: '',
});

/**
 * Build the two store snapshots from a compact description.
 *
 * Deliberately CLOSE TO THE REAL SHAPES. In particular there is no `current`
 * field on the session store, because the real `SessionListState` has none — an
 * earlier version of this helper wrote one anyway, which is how the
 * `sessionState.current` bug stayed green while every blank Session (including
 * the provisional New Session row) was being filtered out in production.
 *
 * `projectionsBySession` defaults to 'ready' for every id, because that is the
 * settled state a browser is in once loaded. A test that cares about the LOADING
 * window passes `projections` explicitly to override one session — the shell rule
 * must not fire while projections are still in flight.
 */
function stores({ workspaces, sessions, archived = [], ids, projections }) {
  const sessionIds = ids ?? Object.keys(sessions);
  return {
    snapshot: { items: workspaces, archivedSessionIds: archived, state: 'idle', phase: 'ready', error: null },
    sessionState: {
      ids: sessionIds,
      byId: sessions,
      phase: 'ready',
      projectionsBySession: projections ?? Object.fromEntries(
        sessionIds.map(id => [id, { values: {}, state: 'ready', error: null }]),
      ),
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

test('a session living in a workspace folder is shown there even if never registered', () => {
  // The bug this pins, measured on real data: `dsh-project` registered 2
  // sessions while 7 sat in its directory. The other 5 have a cwd equal to the
  // workspace path but are absent from `sessionIds`, because DSH's getter
  // returns only sessions that were ATTACHED at some point:
  //
  //   get sessionIds() { return this.record.sessionIds.filter(id => path(id) === this.record.path) }
  //
  // They fell through every grouping into 聊天, where they read as orphans
  // despite plainly living in a workspace folder.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', ['registered'], '/work/w')],
    sessions: {
      registered: at('registered', '/work/w', 'registered'),
      resident: at('resident', '/work/w', 'resident'),
    },
    ids: ['registered', 'resident'],
  });

  const { workspaceRows, chatSessions } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(idsOf(workspaceRows), ['registered', 'resident'],
    'a resident belongs to the folder it lives in');
  assert.deepEqual(chatSessions.map(s => s.id), [],
    'and must not fall through to 聊天');
});

test('a resident is not double-counted when it is also registered', () => {
  // Every id in `sessionIds` already matches by cwd — the getter filters on that
  // equality — so the union adds only the missing ones.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', ['one'], '/work/w')],
    sessions: { one: at('one', '/work/w') },
    ids: ['one'],
  });

  const { workspaceRows } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(idsOf(workspaceRows), ['one'], 'union, not concatenation');
});

test('a session in a SUBdirectory is not guessed into a parent workspace', () => {
  // DSH attaches on EXACT equality (`header.cwd === record.path`). Nested
  // workspaces would make "under" ambiguous, and a wrong attribution is worse
  // than a missing one.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', [], '/work/w')],
    sessions: { nested: at('nested', '/work/w/sub') },
    ids: ['nested'],
  });

  const { workspaceRows, chatSessions } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(idsOf(workspaceRows), [], 'a subdirectory is not the workspace');
  assert.deepEqual(chatSessions.map(s => s.id), ['nested'], 'it stays unattributed');
});

test('a resident also reaches the project that claims its folder', () => {
  // Projects read the same id set, so the fix applies there too.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', [], '/work/w')],
    sessions: { resident: at('resident', '/work/w', 'resident') },
    ids: ['resident'],
  });
  const projects = [{ id: 'p', title: 'Proj', members: [{ workspaceId: 'w' }] }];

  const { projectRows, chatSessions } = deriveSections({ projects, snapshot, sessionState });

  assert.deepEqual(idsOf(projectRows), ['resident'], 'a project shows its folders residents');
  assert.deepEqual(chatSessions.map(s => s.id), []);
});

test('a session with no cwd stays unattributed rather than matching anything', () => {
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', [], '/work/w')],
    sessions: { loose: summary('loose', 'loose') },
    ids: ['loose'],
  });

  const { workspaceRows, chatSessions } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(idsOf(workspaceRows), []);
  assert.deepEqual(chatSessions.map(s => s.id), ['loose']);
});

test('a shell session is not listed anywhere', () => {
  // The bug this pins: a session created in a directory but never prompted has
  // NO durable title, so the host's display-title fallback names the row after
  // the BASENAME OF ITS CWD (`service.ts` displayTitleOf). The list therefore
  // accumulates rows literally called `dsh-project` that look like
  // conversations. Measured across every stored session on this machine:
  //
  //   title event AND user message : 96
  //   title event, no user message :  0
  //   no title event, user message :  0
  //   neither                      : 20
  //
  // Zero exceptions, so `title === undefined` is a reliable stand-in — and it
  // has to be a stand-in, because the client snapshot carries no log.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', [], '/work/w')],
    sessions: { shell: shell('shell', '/work/w'), real: at('real', '/work/w', 'real') },
    ids: ['shell', 'real'],
  });

  const { workspaceRows, chatSessions } = deriveSections({ projects: [], snapshot, sessionState });
  const all = [...idsOf(workspaceRows), ...chatSessions.map(s => s.id)];

  assert.deepEqual(all, ['real'], 'only a session with a conversation is listed');
});

test('an untitled session is NOT hidden while its projections are loading', () => {
  // `title` lives in the projection store and arrives asynchronously, so before
  // it lands EVERY session is untitled. Treating that as a shell would blank the
  // entire sidebar on load — a far worse failure than a shell lingering a moment.
  // Only state 'ready' settles the question; anything else is shown.
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', [], '/work/w')],
    sessions: { pending: shell('pending', '/work/w') },
    ids: ['pending'],
    projections: { pending: { values: {}, state: 'loading', error: null } },
  });

  const { workspaceRows } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(idsOf(workspaceRows), ['pending'],
    'an unresolved projection means UNKNOWN, and unknown is shown');
});

test('an absent projectionsBySession entry also leaves the row visible', () => {
  // A store that has not reported projections at all must not be read as
  // "everything is a shell".
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', [], '/work/w')],
    sessions: { pending: shell('pending', '/work/w') },
    ids: ['pending'],
    projections: {},
  });

  const { workspaceRows } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(idsOf(workspaceRows), ['pending']);
});

test('a RUNNING untitled session stays visible', () => {
  // A conversation that just started has no durable title until its first turn
  // completes. Hiding it would make an active conversation vanish mid-turn.
  const running = { ...shell('busy', '/work/w'), running: true };
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', [], '/work/w')],
    sessions: { busy: running },
    ids: ['busy'],
  });

  const { workspaceRows } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(idsOf(workspaceRows), ['busy'], 'an in-flight conversation is never hidden');
});

test('the CURRENT untitled session stays visible', () => {
  // The provisional New Session row is untitled by definition and the user is
  // looking at it.
  const currentShell = { ...shell('new', '/work/w'), retainedBy: { mainView: 1 } };
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', [], '/work/w')],
    sessions: { new: currentShell },
    ids: ['new'],
  });

  const { workspaceRows } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(idsOf(workspaceRows), ['new'], 'the New Session row is kept');
});

test('an empty-string title is treated as untitled, not as a title', () => {
  const emptyTitle = { ...shell('blank-ish', '/work/w'), title: '' };
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('w', 'Work', [], '/work/w')],
    sessions: { 'blank-ish': emptyTitle },
    ids: ['blank-ish'],
  });

  const { workspaceRows, chatSessions } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual([...idsOf(workspaceRows), ...chatSessions.map(s => s.id)], [],
    'an empty title is not a conversation');
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

test('a delegated session is hidden even when its header has no origin', () => {
  // The bug this pins: `origin` is optional on the wire and is copied straight
  // from the session header, which only carries it when the WRITING build put it
  // there. Scanning this machine's 347 stored sessions found 211 headers with
  // `parentSession` but only 209 with `origin`; the stragglers carry
  // `parentSession`, `delegationDepth` and `isSeeded` instead, because they were
  // delegated by a build that predates the field. Headers are never backfilled,
  // so an `origin`-only rule files those sessions as ordinary chats forever —
  // which is exactly how subagents kept reappearing in 聊天.
  const legacyChild = { ...summary('legacy', 'legacy child'), parentId: 'parent' };
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['parent'])],
    sessions: { parent: summary('parent', 'parent'), legacy: legacyChild },
    ids: ['parent', 'legacy'],
  });

  const { projectRows, workspaceRows, chatSessions } = deriveSections({ projects: [], snapshot, sessionState });
  const all = [...idsOf(projectRows), ...idsOf(workspaceRows), ...chatSessions.map(s => s.id)];

  assert.deepEqual(all, ['parent'],
    'a session with a parent is delegated, whatever its origin field says');
});

test('a self-referencing parent is not treated as delegation', () => {
  // Degenerate but cheap to guard: a row whose parent is itself is a root that
  // happens to carry a stale id, not a child of anything.
  const selfParent = { ...summary('self', 'self'), parentId: 'self' };
  const { snapshot, sessionState } = stores({
    workspaces: [workspace('a', 'Alpha', ['self'])],
    sessions: { self: selfParent },
    ids: ['self'],
  });

  const { workspaceRows } = deriveSections({ projects: [], snapshot, sessionState });

  assert.deepEqual(idsOf(workspaceRows), ['self'], 'a self-parented row is still an ordinary session');
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

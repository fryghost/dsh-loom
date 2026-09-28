/**
 * Group the available sessions into the sidebar's three sections.
 *
 * Pure: no services, no React, no I/O. Both snapshots are plain data, so the
 * sidebar's whole structure is decided here and can be tested directly.
 *
 * Attribution is UNIQUE — a session appears in exactly one section, so nothing
 * is listed twice and no section is a duplicate view of another:
 *
 *   1. `项目`   — sessions in the folders of a project (deduped across members)
 *   2. `工作区` — every registered workspace, INCLUDING ones a project claims
 *   3. `聊天`   — sessions no workspace attributes at all
 *
 * A workspace contributes session IDs only; titles and timestamps live in the
 * session list store, so the two snapshots are joined here rather than either
 * being mutated.
 *
 * Archived sessions are excluded: the archive is the user's explicit "hide this
 * from the grouping surfaces" gesture, and the shell owns restoring them.
 */

/**
 * Whether a session belongs in a browsing list at all.
 *
 * Mirrors DSH's own rule (`ui-workspace/src/client/tree.ts`, `sessionVisible`)
 * rather than inventing one, because a second opinion here would disagree with
 * the shipped browser about what a session list contains:
 *
 *   - **Subagent children are not sessions in this list.** They are reachable
 *     through their parent's header catalog, so listing them beside real chats
 *     both mislabels them and floods the section that catches leftovers.
 *   - Archived sessions are visible nowhere.
 *   - A blank session is the provisional "New Session" row, so only the current
 *     one shows; the rest are placeholders, not history.
 *   - A session with no durable title never had a conversation, so it is not a
 *     conversation to list either.
 *
 * A subagent is detected by EITHER signal, not by `origin` alone.
 *
 * `origin` is optional on the wire and is copied straight from the session
 * header (`api/session-controller/src/list.ts`, `listFields`), which only
 * carries it when the writing build put it there. Scanning this machine's 327
 * stored sessions found 211 headers with `parentSession` but only 209 with
 * `origin` — the stragglers carry `parentSession`, `delegationDepth` and
 * `isSeeded` instead, i.e. they were delegated by a build that predates the
 * `origin` field. Headers are never backfilled, so those sessions stay
 * `origin`-less forever, and a rule keyed on `origin` alone files them as
 * ordinary chats for good. A delegated session always has a parent, so
 * `parentId` is the durable signal and `origin` the fast one.
 *
 * The title test carries a measured justification. `SessionSummary.title` is the
 * DURABLE title, absent until the host projects one, and the host writes it once
 * a conversation starts. Across every stored session on this machine the two
 * signals agree with no exceptions:
 *
 *   title event AND user message : 96
 *   title event, no user message :  0
 *   no title event, user message :  0
 *   neither                      : 20
 *
 * So `title === undefined` is a reliable stand-in for "no conversation ever
 * happened". It has to be a stand-in: the client snapshot carries `title` and
 * `blank` but never the log, so a rule about content can only key on those.
 *
 * Without this, such a session is listed under the BASENAME OF ITS CWD — the
 * display-title fallback (`service.ts` `displayTitleOf`) — so a directory
 * accumulates rows literally named `dsh-project` that look like conversations
 * and are not.
 *
 * `blank` alone is not enough, which is why this exists: these sessions are
 * already `blank: false` in the store. DSH's bit is cleared by running state and
 * host metadata, not only by a prompt, so it does not reliably mean "has
 * history" — and the store's contract says filtering belongs to the consumer
 * (`service.ts`: "Filtering stays with the consumer").
 *
 * A missing title only counts as a shell once its projections have ARRIVED.
 * `title` comes from the per-session projection store, loaded asynchronously
 * (`manager.ts` `refreshProjections`), so before that lands EVERY session is
 * untitled — and treating that as a shell would blank the entire sidebar on
 * load. `projectionsBySession[id].state` distinguishes the two: 'ready' means
 * the absence is real, anything else means unknown, and unknown is shown.
 */
function sessionVisible(summary, current, archived, projectionReady) {
  const delegated = summary.origin === 'subagent'
    || (summary.parentId !== undefined && summary.parentId !== summary.id);
  // Kept even while untitled:
  //   - the CURRENT session, because that row is the provisional New Session and
  //     the user is looking at it;
  //   - a RUNNING one, because a conversation that just started has no durable
  //     title until its first turn completes, and hiding a session mid-turn
  //     would make an active conversation vanish from the list.
  // Only an untitled session that is neither, AND whose projections have loaded,
  // is a shell.
  const shell = projectionReady === true
    && (summary.title === undefined || summary.title === '')
    && summary.id !== current
    && summary.running !== true;
  return !delegated
    && !archived.has(summary.id)
    && !shell
    && (!summary.blank || summary.id === current);
}

/**
 * The selected Session, derived the way the shipped browser derives it.
 *
 * `SessionListState` has no `current` field — not in 0.1.6-alpha.2 and not in
 * 0.1.7-rc.1 — so reading `sessionState.current` silently yielded `undefined`
 * and every blank Session (including the provisional New Session row) was
 * filtered out by {@link sessionVisible}. An earlier version of this function
 * still honoured a caller-supplied `sessionState.current`, which is what let
 * the test for that rule keep passing by writing the very field production
 * never sets; the rule now has a single source, so it cannot be faked into
 * agreement.
 *
 * `retainedBy.mainView` is the rule `ui-workspace/src/client/tree.ts`
 * (`mainSessionId`) actually uses. This is the UNGUARDED value, deliberately:
 * the host feeds it to `sessionVisible` (`tree.ts:340`) and to
 * `pinCurrentBlank` (`WorkspaceBrowser.tsx:911-915`), and neither applies the
 * panel guard. A selected main panel suppresses the HIGHLIGHT only — see
 * {@link deriveSections}, which keeps the two questions apart.
 *
 * @param sessionState - `SessionListState`: `{ ids, byId }`, where each entry is
 *   `{ id, displayTitle, running, blank, origin, updatedAt, retainedBy }`.
 * @returns the current Session id, or `undefined` when none is.
 */
function currentSessionId(sessionState) {
  const byId = (sessionState && sessionState.byId) || {};
  for (const session of Object.values(byId)) {
    if ((((session || {}).retainedBy) || {}).mainView > 0) return session.id;
  }
  return undefined;
}

/**
 * @param input.projects - the Loom manifest's projects.
 * @param input.snapshot - `WorkspaceSnapshot`: `{ items, archivedSessionIds }`,
 *   where each item is `{ workspaceId, path, title, sessionIds }`.
 * @param input.sessionState - `SessionListState`: `{ ids, byId, projectionsBySession }`,
 *   where each `byId` entry is
 *   `{ id, title, displayTitle, cwd, parentId, running, blank, origin, updatedAt, retainedBy }`.
 * @param input.panelActive - whether a main panel is selected. Plain data, so
 *   this module stays host-free.
 * @returns `{ projectRows, workspaceRows, chatSessions, current, highlighted }`.
 *
 * TWO different questions, and conflating them is a real defect:
 *
 *   - `current` — which Session IS the current one. Decides VISIBILITY: only the
 *     current blank Session is the provisional New Session row; the rest are
 *     placeholders (`sessionVisible`). The host never applies the panel guard
 *     here, so neither do we.
 *   - `highlighted` — which row to DRAW AS SELECTED. The host DOES apply the
 *     guard here (`WorkspaceBrowser.tsx:294-296`: `panelActive ? undefined : …`),
 *     because with a panel open the centre column is not a Conversation.
 *
 * Routing the guarded value into visibility — an earlier version of this did —
 * deletes the New Session row the moment a panel opens, and that row is one the
 * host deliberately keeps.
 */
function deriveSections({ projects, snapshot, sessionState, panelActive = false } = {}) {
  const byId = (sessionState && sessionState.byId) || {};
  const archived = new Set((snapshot && snapshot.archivedSessionIds) || []);
  const projections = (sessionState && sessionState.projectionsBySession) || {};
  /**
   * Whether a session's projections have actually ARRIVED.
   *
   * `title` lives in the projection store and is loaded asynchronously, so
   * "no title" means one of two opposite things: a shell, or a session whose
   * projections are still in flight. Only 'ready' settles it. Anything else —
   * including a missing entry — is treated as NOT ready, so the row is shown:
   * a shell that lingers a moment is a far smaller failure than a sidebar that
   * blanks itself while loading.
   */
  const projectionReady = id => (projections[id] || {}).state === 'ready';
  const current = currentSessionId(sessionState);
  const highlighted = panelActive === true ? undefined : current;
  const workspaces = (snapshot && snapshot.items) || [];
  const workspaceById = new Map(workspaces.map(workspace => [workspace.workspaceId, workspace]));

  // Which projects claim each folder, by title. A folder may appear under any
  // number of projects; this is the many-to-many relation the data model
  // supports, read here for display only.
  const claimsByWorkspaceId = new Map();
  for (const project of projects || []) {
    const label = project.title || project.id;
    for (const member of project.members || []) {
      const claims = claimsByWorkspaceId.get(member.workspaceId) || [];
      claims.push(label);
      claimsByWorkspaceId.set(member.workspaceId, claims);
    }
  }

  /**
   * Resolve ids to visible summaries, newest first.
   *
   * Deduped because two members of one project may legitimately list the same
   * session, and a project must show it once.
   */
  const collect = ids => {
    const visible = [...new Set(ids)]
      .map(id => byId[id])
      .filter(summary => summary !== undefined && sessionVisible(summary, current, archived, projectionReady(summary.id)))
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
    // The provisional New Session row sits at the top of its group, mirroring
    // `pinCurrentBlank` in the shipped browser: it is where the next message
    // goes, not where the newest history is.
    const blankAt = visible.findIndex(summary => summary.blank === true);
    if (blankAt > 0) visible.unshift(...visible.splice(blankAt, 1));
    return visible;
  };

  /**
   * Sessions that LIVE in a workspace directory, whether or not it registered them.
   *
   * `WorkspaceView.sessionIds` is not "every session whose cwd is here". DSH
   * filters the stored attach list by a live cwd fact
   * (`workspace/src/entity.ts` `get sessionIds`), so an id appears only if the
   * session was ATTACHED to that workspace at some point. A session created in
   * the directory but never attached is absent from the list and still has a
   * matching cwd.
   *
   * That gap is not hypothetical: on this machine `dsh-project` registered 2
   * sessions while 7 sit in its directory, and the other 5 fell through every
   * grouping into 聊天 — where they looked like orphans despite plainly living
   * in a workspace folder. The shipped browser has the same gap and answers it
   * with an "ungrouped" bucket (`ui-workspace/src/client/tree.ts`,
   * `groupByWorkspace`); showing them under the folder they live in is the more
   * useful reading of the same facts.
   *
   * Because the getter already filters by that same equality, every id in
   * `sessionIds` also matches by cwd — this union adds only the missing ones and
   * cannot double-count.
   *
   * The comparison is EXACT, matching DSH's own attach rule
   * (`header.cwd === this.record.path`). A session in a SUBdirectory therefore
   * stays unattributed rather than being guessed into a parent: nested
   * workspaces would make "under" ambiguous, and a wrong attribution is worse
   * than a missing one.
   */
  const idsByCwd = new Map();
  for (const id of (sessionState && sessionState.ids) || []) {
    const summary = byId[id];
    if (summary === undefined || typeof summary.cwd !== 'string' || summary.cwd === '') continue;
    const list = idsByCwd.get(summary.cwd) || [];
    list.push(id);
    idsByCwd.set(summary.cwd, list);
  }

  /** The full id set of one workspace: its registrations plus its residents. */
  const workspaceSessionIds = workspace => [
    ...(workspace.sessionIds || []),
    ...(idsByCwd.get(workspace.path) || []),
  ];

  const projectRows = (projects || []).map(project => ({
    key: project.id,
    project,
    title: project.title,
    folders: (project.members || []).length,
    // Where the row's New chat starts. A declared starting folder only picks a
    // starting point; membership never privileges one folder during discovery.
    startWorkspaceId: project.defaultWorkspaceId
      || (project.members && project.members[0] && project.members[0].workspaceId),
    sessions: collect((project.members || [])
      .flatMap(member => {
        const workspace = workspaceById.get(member.workspaceId);
        return workspace === undefined ? [] : workspaceSessionIds(workspace);
      })),
  }));

  // EVERY registered workspace is listed. Filtering out the claimed ones made a
  // folder look exclusive to its project — the opposite of this data model —
  // and made a folder appear to vanish the moment it joined one. A claimed
  // folder instead carries the names of the projects claiming it.
  //
  // Its sessions are NOT repeated: they are already listed under each project,
  // and unique attribution is what keeps a session from appearing twice.
  const workspaceRows = workspaces.map(workspace => {
    const claimedBy = claimsByWorkspaceId.get(workspace.workspaceId) || [];
    return {
      key: workspace.workspaceId,
      title: workspace.title || workspace.path,
      startWorkspaceId: workspace.workspaceId,
      claimedBy,
      sessions: claimedBy.length > 0 ? [] : collect(workspaceSessionIds(workspace)),
    };
  });

  // Whatever no grouping claimed. With residents attributed above, this is
  // genuinely unattributable: a session whose cwd matches no registered
  // workspace path — typically because its workspace registration was deleted
  // (DSH's delete removes the registration and keeps the session log).
  const attributed = new Set();
  for (const row of projectRows) for (const summary of row.sessions) attributed.add(summary.id);
  for (const row of workspaceRows) for (const summary of row.sessions) attributed.add(summary.id);

  const chatSessions = collect((sessionState && sessionState.ids) || [])
    .filter(summary => !attributed.has(summary.id));

  return { projectRows, workspaceRows, chatSessions, current, highlighted };
}

module.exports = { currentSessionId, deriveSections, sessionVisible };

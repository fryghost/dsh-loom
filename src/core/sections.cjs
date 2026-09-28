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
 */
function sessionVisible(summary, current, archived) {
  return summary.origin !== 'subagent'
    && !archived.has(summary.id)
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
 * @param input.sessionState - `SessionListState`: `{ ids, byId }`, where each
 *   entry is `{ id, displayTitle, running, blank, origin, updatedAt, retainedBy }`.
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
      .filter(summary => summary !== undefined && sessionVisible(summary, current, archived))
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
    // The provisional New Session row sits at the top of its group, mirroring
    // `pinCurrentBlank` in the shipped browser: it is where the next message
    // goes, not where the newest history is.
    const blankAt = visible.findIndex(summary => summary.blank === true);
    if (blankAt > 0) visible.unshift(...visible.splice(blankAt, 1));
    return visible;
  };

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
        return (workspace && workspace.sessionIds) || [];
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
      sessions: claimedBy.length > 0 ? [] : collect(workspace.sessionIds || []),
    };
  });

  // Whatever no grouping claimed: a session the stores know but no workspace
  // accounts for — fresh, forked, or orphaned.
  const attributed = new Set();
  for (const row of projectRows) for (const summary of row.sessions) attributed.add(summary.id);
  for (const row of workspaceRows) for (const summary of row.sessions) attributed.add(summary.id);

  const chatSessions = collect((sessionState && sessionState.ids) || [])
    .filter(summary => !attributed.has(summary.id));

  return { projectRows, workspaceRows, chatSessions, current, highlighted };
}

module.exports = { currentSessionId, deriveSections, sessionVisible };

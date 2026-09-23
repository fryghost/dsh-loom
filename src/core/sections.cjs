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
 *   2. `工作区` — sessions of workspaces no project claims
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
 * @param input.projects - the Loom manifest's projects.
 * @param input.snapshot - `WorkspaceSnapshot`: `{ items, archivedSessionIds }`,
 *   where each item is `{ workspaceId, path, title, sessionIds }`.
 * @param input.sessionState - `SessionListState`: `{ ids, byId, current }`,
 *   where each entry is `{ id, displayTitle, running, blank, origin, updatedAt }`.
 * @returns `{ projectRows, workspaceRows, chatSessions }`.
 */
function deriveSections({ projects, snapshot, sessionState } = {}) {
  const byId = (sessionState && sessionState.byId) || {};
  const archived = new Set((snapshot && snapshot.archivedSessionIds) || []);
  const current = sessionState && sessionState.current;
  const workspaces = (snapshot && snapshot.items) || [];
  const workspaceById = new Map(workspaces.map(workspace => [workspace.workspaceId, workspace]));

  const claimedWorkspaceIds = new Set();
  for (const project of projects || []) {
    for (const member of project.members || []) claimedWorkspaceIds.add(member.workspaceId);
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

  const workspaceRows = workspaces
    .filter(workspace => !claimedWorkspaceIds.has(workspace.workspaceId))
    .map(workspace => ({
      key: workspace.workspaceId,
      title: workspace.title || workspace.path,
      startWorkspaceId: workspace.workspaceId,
      sessions: collect(workspace.sessionIds || []),
    }));

  // Whatever no grouping claimed: a session the stores know but no workspace
  // accounts for — fresh, forked, or orphaned.
  const attributed = new Set();
  for (const row of projectRows) for (const summary of row.sessions) attributed.add(summary.id);
  for (const row of workspaceRows) for (const summary of row.sessions) attributed.add(summary.id);

  const chatSessions = collect((sessionState && sessionState.ids) || [])
    .filter(summary => !attributed.has(summary.id));

  return { projectRows, workspaceRows, chatSessions };
}

module.exports = { deriveSections, sessionVisible };
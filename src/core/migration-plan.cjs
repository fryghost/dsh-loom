/**
 * What "move this conversation to another workspace" can actually mean.
 *
 * ## Why this is a COPY and not a move
 *
 * DSH has no way to change a session's workspace, and this is a design fact
 * rather than a missing API:
 *
 *   1. `SessionHeader.cwd` is an immutable header field — no setter exists
 *      anywhere in the tree (`relocate` / `moveSession` / `setCwd` do not
 *      exist on any service).
 *   2. The on-disk log directory is DERIVED from it:
 *      `projectDir(root, cwd)` in `session-persistence-jsonl/src/format.ts`,
 *      so a "move" that only rewrote a header would leave the log where it was.
 *   3. `Workspace.attachSession` REFUSES unless
 *      `realpathNormalize(header.cwd) === workspace.path`
 *      (`workspace/src/entity.ts`, the `cwd !== this.record.path` branch).
 *   4. `ApiSessionAgentController.ensureSession` throws `ApiSessionCwdConflict`
 *      on a mismatch (`api/session-controller/src/agent.ts`).
 *   5. `session.fork` COPIES the source cwd verbatim and re-attaches the child
 *      to the SOURCE workspace (`api/session-controller/src/commands.ts`) — so
 *      forking cannot move a conversation either.
 *   6. Loom's own attribution is exact cwd equality (`./sections.cjs`), so
 *      re-registering a workspace moves nothing.
 *
 * So the only honest implementation is: create a NEW session whose cwd is the
 * target folder, seeded from the source's history, and let the caller decide
 * what happens to the original. This module decides WHAT would be copied; the
 * host applies it. It is pure — no services, no I/O — so every refusal below
 * is directly testable.
 *
 * ## Why the source log is seeded directly
 *
 * The seed is the source's prefix up to {@link lastCompletedTurnBoundary}, with
 * `inheritedEventCount` set to the prefix length. DSH completes that into a
 * legal seeded session itself: `SessionStore.prepare` appends the tagged
 * `session/end-seed` marker when a seeded header's inherited count is shorter
 * than its log (`core/session/src/index.ts`). Nothing here needs to construct
 * synthetic events — which matters, because the host half cannot import
 * `@deepseek-ai/dsh-session/fork`: a `link:`-installed plugin resolves no
 * `@deepseek-ai/*` package at all, which is why `../index.js` reaches every
 * capability through `ctx.get(...)`.
 */

/**
 * The inclusive seq of the latest COMPLETED turn's end.
 *
 * Mirrors `latestCompletedPrefixBoundary` in
 * `api/session-controller/src/commands.ts`, which is the default fork cut.
 * Duplicated rather than imported for the module-resolution reason in the file
 * header, so the two definitions must be kept in step: a boundary that differs
 * from DSH's own would make "move" and "fork" disagree about where a turn ends.
 *
 * Trailing standalone events belong to the completed prefix — `turn/end` is
 * followed by everything until the NEXT turn starts, a user message is appended
 * (a `surfaceOp: 'replace'` one is not a new turn), or an inbox splice occurs.
 *
 * @param events - the source log, in seq order.
 * @returns the boundary seq, or undefined when no turn ever completed.
 */
function lastCompletedTurnBoundary(events) {
  if (!Array.isArray(events) || events.length === 0) return undefined;

  /** A log is contiguous from 0, so position and seq agree; read seq when present. */
  const seqOf = (event, index) =>
    typeof event?.seq === 'number' && Number.isSafeInteger(event.seq) ? event.seq : index;

  let cut = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === 'turn/end') {
      cut = index;
      break;
    }
  }
  if (cut === -1) return undefined;

  for (let index = cut + 1; index < events.length; index += 1) {
    const event = events[index];
    const startsNewWork = event?.type === 'turn/start'
      || (event?.type === 'user/message' && event.surfaceOp === 'append')
      || event?.type === 'agent/inbox/spliced';
    if (startsNewWork) break;
    cut = index;
  }
  return seqOf(events[cut], cut);
}

/**
 * A named reason a move is not possible.
 *
 * Named, never a bare `false`: Loom's rule is that every "did not happen" comes
 * with a reason the user can act on (see `./context-plan.cjs`). A disabled
 * button with no explanation is the failure mode this avoids.
 */
const MIGRATION_REASONS = Object.freeze([
  'source-missing',
  'no-cwd',
  'no-completed-turn',
  'session-running',
  'same-workspace',
  'no-target',
]);

/**
 * Decide what a move from one workspace to another would do.
 *
 * @param input.header - the source session header. `cwd` and `id` are read;
 *   `parentSession` is deliberately NOT copied (a copied session carrying a
 *   parent would be classified as delegated and hidden — see below).
 * @param input.events - the source log, in seq order.
 * @param input.targetPath - absolute path of the destination folder.
 * @param input.targetTitle - display name of the destination, for messages.
 * @param input.running - whether the source has a turn in flight.
 * @param input.normalizePath - path-spelling normalizer, injected so this module
 *   stays free of host concerns. Defaults to a no-op comparison.
 * @returns `{ available, reason, boundary, copiedEvents, droppedEvents, sameFolder, title }`.
 *
 * A RUNNING session is refused rather than truncated. Its open turn sits after
 * the last `turn/end`, so copying the completed prefix would silently drop the
 * work in flight — and "we copied most of it" is not something a user can
 * detect afterwards.
 *
 * The copy must NOT set `parentSession`: `./sections.cjs` treats any session
 * whose parent differs from itself as delegated and hides it from every
 * section. A copied conversation that vanished from the sidebar would read as
 * a failed move.
 */
function buildMigrationPlan(input = {}) {
  const { header, events, targetPath, targetTitle, running, normalizePath } = input;
  const sample = value => (typeof value === 'string' ? value : '');
  const same = normalizePath === undefined
    ? (left, right) => sample(left) === sample(right)
    : (left, right) => normalizePath(sample(left)) === normalizePath(sample(right));
  const title = sample(targetTitle) || sample(targetPath);

  const refuse = (reason, extra = {}) => ({
    available: false,
    reason,
    boundary: undefined,
    copiedEvents: 0,
    droppedEvents: 0,
    sameFolder: false,
    title,
    ...extra,
  });

  if (header === undefined || header === null || typeof header.id !== 'string') {
    return refuse('source-missing');
  }
  if (typeof header.cwd !== 'string' || header.cwd.length === 0) {
    // No cwd means no workspace to move FROM, and no way to compare folders.
    return refuse('no-cwd');
  }
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    return refuse('no-target');
  }

  const sameFolder = same(header.cwd, targetPath);
  if (running === true) return refuse('session-running', { sameFolder });

  const list = Array.isArray(events) ? events : [];
  const boundary = lastCompletedTurnBoundary(list);
  if (boundary === undefined) return refuse('no-completed-turn', { sameFolder });

  // Compared AFTER the history is known to exist, so the message names the
  // reason the user would otherwise have to guess between.
  if (sameFolder) {
    return refuse('same-workspace', {
      boundary,
      copiedEvents: boundary + 1,
      droppedEvents: Math.max(0, list.length - (boundary + 1)),
      sameFolder: true,
    });
  }

  return {
    available: true,
    reason: undefined,
    boundary,
    copiedEvents: boundary + 1,
    // Events after the cut belong to the turn still in flight. A session that
    // is not running can still have a trailing partial turn (an interrupted
    // one), and dropping it is a real, countable fact the user is shown.
    droppedEvents: Math.max(0, list.length - (boundary + 1)),
    sameFolder: false,
    title,
  };
}

module.exports = {
  MIGRATION_REASONS,
  buildMigrationPlan,
  lastCompletedTurnBoundary,
};

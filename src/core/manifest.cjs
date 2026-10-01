/**
 * Loom manifest: many-to-many folder ↔ project membership.
 *
 * Design differences from dsh-projects v1, each deliberate:
 *
 * 1. NO exclusivity. A folder may belong to any number of projects. The old
 *    model kept a global `claimed` set and silently dropped any group whose
 *    members were already taken — including, via `length < 2`, groups that
 *    merely lost a member to a deleted workspace. Nothing here discards.
 *
 * 2. NO primary folder. The old `primaryWorkspaceId` ranked members, and new
 *    sessions inherited the rank as their cwd, which is why sibling folders
 *    contributed nothing. `defaultWorkspaceId` here is only a starting point
 *    for a new session and carries no precedence anywhere else.
 *
 * 3. Single-member projects are legal. `length < 2` is gone.
 *
 * 4. Unresolvable members are RETAINED and reported as `missing`, never
 *    pruned. A workspace that is temporarily unavailable must not silently
 *    delete the user's project.
 */

const SCHEMA_VERSION = 2;

/**
 * Where a 聊天 conversation with no folder of its own starts.
 *
 * `chatsCwd` is an ADDITIVE OPTIONAL key, and that is exactly why it does NOT
 * bump {@link SCHEMA_VERSION}. The version gate answers one question — "can this
 * build interpret every field it is about to read?" — and an extra optional key
 * changes no existing field's meaning. Raising it to 3 would make every older
 * Loom render the WHOLE manifest as `supported: false`, i.e. the user would
 * open the sidebar and find no projects at all. The trade is therefore:
 * an older build drops this one preference (and the user re-picks a folder,
 * one click), versus an older build showing an empty 项目 section. The first is
 * recoverable, the second looks like data loss.
 *
 * `normalizeManifest` tolerates the unknown key on read for the same reason it
 * always has: an unrecognized key is dropped, never guessed at.
 */
const CHATS_CWD = 'chatsCwd';

/** Membership roles describe what a folder contributes, not how it ranks. */
const ROLE_WRITABLE = 'writable';
const ROLE_READONLY = 'readonly';

const ROLES = [ROLE_WRITABLE, ROLE_READONLY];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalize the optional default chat folder.
 *
 * Deliberately lenient: any non-blank string is kept. Requiring an absolute
 * path here would mean a relative or otherwise unusual value is silently
 * DROPPED — and a dropped preference is indistinguishable, from the UI, from
 * one the user never set. The host resolves and validates the directory when a
 * conversation is actually created, which is where a bad path is actionable.
 */
function normalizeChatsCwd(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * A path spelling that survives the two ways the same folder is written twice.
 *
 * Used ONLY for the "is this chosen folder already a registered workspace?"
 * hint in the picker — never for attribution. Attribution stays DSH's own exact
 * equality rule (see `./sections.cjs`), because a fuzzy match here would file a
 * conversation under a workspace DSH itself does not consider it to be in.
 *
 * Lowercasing unconditionally follows `isSameOrInside` in `../index.js`, which
 * already makes this trade for skill-root matching; on a case-sensitive
 * filesystem the effect is limited to a possible extra hint, never a wrong
 * grouping, since the hint only chooses which DSH verb is called.
 */
function normalizeComparablePath(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeTitle(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, 80);
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeRole(value) {
  return ROLES.includes(value) ? value : ROLE_WRITABLE;
}

/**
 * Normalize one membership entry.
 *
 * A member is stored as an object rather than a bare id because Loom records
 * *why* a folder is in a project (role, and later an optional note), and a
 * bare id has nowhere to carry that.
 */
function normalizeMember(raw) {
  if (typeof raw === 'string') {
    const workspaceId = raw.trim();
    return workspaceId.length === 0 ? undefined : { workspaceId, role: ROLE_WRITABLE };
  }
  if (!isPlainObject(raw)) return undefined;
  const workspaceId = typeof raw.workspaceId === 'string' ? raw.workspaceId.trim() : '';
  if (workspaceId.length === 0) return undefined;
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 200) : '';
  return {
    workspaceId,
    role: normalizeRole(raw.role),
    ...note.length > 0 ? { note } : {},
  };
}

/**
 * Rebuild one project's member list from the folders an editor has checked.
 *
 * An editor edits MEMBERSHIP and nothing else. Two properties follow, and each
 * one is the difference between an edit and silent data loss:
 *
 *   1. A member that was already present keeps its ROLE (and its note). Writing
 *      `'writable'` unconditionally rewrote every `readonly` member on save, so
 *      the recorded reason a folder was added quietly disappeared.
 *   2. A checked id the registry cannot currently resolve is KEPT. The contract
 *      above is that unresolvable members are retained and reported as
 *      `missing`, never pruned — so a folder that is temporarily unavailable
 *      must not be deleted from the project by an unrelated edit. The `missing`
 *      flag itself is DERIVED at read time ({@link normalizeManifest} with
 *      `knownWorkspaceIds`), never authored here, so it is not carried over.
 *
 * @param previous - the project's current members, if it already exists.
 * @param selectedWorkspaceIds - the ids the editor has checked, in display order.
 * @returns members, in `selectedWorkspaceIds` order.
 */
function mergeMembers(previous, selectedWorkspaceIds) {
  const previousById = new Map();
  for (const member of Array.isArray(previous) ? previous : []) {
    const normalized = normalizeMember(member);
    if (normalized !== undefined && !previousById.has(normalized.workspaceId)) {
      previousById.set(normalized.workspaceId, normalized);
    }
  }

  return uniqueStrings(selectedWorkspaceIds).map(workspaceId => {
    const kept = previousById.get(workspaceId);
    return kept === undefined ? { workspaceId, role: ROLE_WRITABLE } : kept;
  });
}

/**
 * Normalize the full manifest.
 *
 * @param raw - untrusted manifest value (from disk or a client).
 * @param options.knownWorkspaceIds - ids the registry can currently resolve.
 *   Members outside this set are kept and flagged, never dropped.
 * @returns `{ projects, dropped }` — `dropped` names only structurally invalid
 *   entries (no usable id at all), so callers can surface real data loss.
 */
function normalizeManifest(raw, options = {}) {
  const known = options.knownWorkspaceIds === undefined
    ? undefined
    : new Set(knownWorkspaceIdsOf(options.knownWorkspaceIds));

  const projects = [];
  const dropped = [];
  const seenProjectIds = new Set();

  for (const rawProject of (isPlainObject(raw) && Array.isArray(raw.projects) ? raw.projects : [])) {
    if (!isPlainObject(rawProject)) {
      dropped.push({ reason: 'not-an-object' });
      continue;
    }
    const id = typeof rawProject.id === 'string' ? rawProject.id.trim() : '';
    if (id.length === 0 || seenProjectIds.has(id)) {
      dropped.push({ reason: id.length === 0 ? 'missing-id' : 'duplicate-id', id });
      continue;
    }

    // Members are de-duplicated within THIS project only. Across projects they
    // may repeat freely — that is the entire point of many-to-many.
    const members = [];
    const seenMembers = new Set();
    for (const rawMember of (Array.isArray(rawProject.members) ? rawProject.members : [])) {
      const member = normalizeMember(rawMember);
      if (member === undefined) {
        dropped.push({ reason: 'invalid-member', projectId: id });
        continue;
      }
      if (seenMembers.has(member.workspaceId)) continue;
      seenMembers.add(member.workspaceId);
      members.push(member);
    }

    // A project with zero members is still a project: the user may be mid-edit
    // or every folder may be temporarily gone. Dropping it would repeat the
    // silent-disappearance bug this design exists to fix.
    const defaultWorkspaceId = typeof rawProject.defaultWorkspaceId === 'string'
      && seenMembers.has(rawProject.defaultWorkspaceId)
      ? rawProject.defaultWorkspaceId
      : members[0]?.workspaceId;

    seenProjectIds.add(id);
    projects.push({
      id,
      title: normalizeTitle(rawProject.title, id),
      members: members.map(member => (known === undefined || known.has(member.workspaceId)
        ? member
        : { ...member, missing: true })),
      ...defaultWorkspaceId === undefined ? {} : { defaultWorkspaceId },
      createdAt: typeof rawProject.createdAt === 'string' ? rawProject.createdAt : undefined,
      updatedAt: typeof rawProject.updatedAt === 'string' ? rawProject.updatedAt : undefined,
    });
  }

  const chatsCwd = normalizeChatsCwd(isPlainObject(raw) ? raw[CHATS_CWD] : undefined);

  return {
    schemaVersion: SCHEMA_VERSION,
    projects,
    ...chatsCwd === undefined ? {} : { [CHATS_CWD]: chatsCwd },
    dropped,
  };
}

function knownWorkspaceIdsOf(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

/** Read a manifest defensively; an unreadable or future version is inert. */
function readManifest(value, options = {}) {
  if (!isPlainObject(value)) return normalizeManifest(undefined, options);
  if (value.schemaVersion === SCHEMA_VERSION) return normalizeManifest(value, options);
  // A newer schema is never reinterpreted: guessing at future fields is how
  // data gets destroyed on downgrade.
  if (Number.isInteger(value.schemaVersion) && value.schemaVersion > SCHEMA_VERSION) {
    return { ...normalizeManifest(undefined, options), supported: false, foundVersion: value.schemaVersion };
  }
  return normalizeManifest(undefined, options);
}

/**
 * Every project containing `workspaceId`.
 *
 * This is the query the old single-owner model could not express, and it is
 * what lets one folder feed several projects at once.
 */
function projectsContaining(manifest, workspaceId) {
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) return [];
  return (manifest?.projects || []).filter(project =>
    project.members.some(member => member.workspaceId === workspaceId));
}

/** Find the project that owns a project id. */
function findProject(manifest, projectId) {
  return (manifest?.projects || []).find(project => project.id === projectId);
}

/**
 * Resolve the folder a new session should start in.
 *
 * Note this returns a *starting point*, not a rank. Callers must not treat it
 * as privileged for skill or instruction discovery — that is the bug Loom
 * removes.
 */
function defaultWorkspaceFor(manifest, projectId) {
  const project = findProject(manifest, projectId);
  if (project === undefined) return undefined;
  const preferred = project.defaultWorkspaceId;
  const chosen = project.members.find(member => member.workspaceId === preferred) ?? project.members[0];
  return chosen?.workspaceId;
}

/**
 * Merge a project into the manifest without touching unrelated projects.
 *
 * Unlike the old `upsertProjectGroup`, no other project's membership is
 * re-normalized or pruned as a side effect of editing this one.
 */
function upsertProject(manifest, project, options = {}) {
  const incoming = normalizeManifest({ schemaVersion: SCHEMA_VERSION, projects: [project] }, options).projects[0];
  if (incoming === undefined) return normalizeManifest(manifest, options);
  const rest = (manifest?.projects || []).filter(existing => existing.id !== incoming.id);
  return normalizeManifest(
    withChatsCwd(manifest, { schemaVersion: SCHEMA_VERSION, projects: [...rest, incoming] }),
    options,
  );
}

function removeProject(manifest, projectId) {
  return normalizeManifest(withChatsCwd(manifest, {
    schemaVersion: SCHEMA_VERSION,
    projects: (manifest?.projects || []).filter(project => project.id !== projectId),
  }));
}

/**
 * Carry a whole-manifest preference across a rebuild of one part of it.
 *
 * `chatsCwd` belongs to the manifest, not to any project, so an edit that
 * rebuilds the PROJECT list has no opinion about it. Spreading it through is
 * what keeps "rename a project" from also clearing where new chats start —
 * the same class of silent, unrelated loss that `mergeMembers` exists to
 * prevent for a member's role.
 */
function withChatsCwd(previous, next) {
  const chatsCwd = normalizeChatsCwd(previous?.[CHATS_CWD]);
  return chatsCwd === undefined ? next : { ...next, [CHATS_CWD]: chatsCwd };
}

/**
 * Migrate a dsh-projects v1 manifest.
 *
 * v1 encoded membership as `memberWorkspaceIds: string[]` with a
 * `primaryWorkspaceId`. Members that v1's exclusivity filter discarded cannot
 * be recovered from v1 data (it never stored them), so this migration is
 * lossless only for what v1 actually retained; callers should tell the user
 * that previously dropped memberships are not recoverable.
 */
function migrateFromV1(value) {
  const groups = Array.isArray(value) ? value : (isPlainObject(value) ? value.groups : undefined);
  if (!Array.isArray(groups)) return { manifest: normalizeManifest(undefined), migrated: 0, note: 'no-v1-groups' };

  const projects = [];
  for (const group of groups) {
    if (!isPlainObject(group)) continue;
    const id = typeof group.id === 'string' ? group.id.trim() : '';
    if (id.length === 0) continue;
    const memberIds = uniqueStrings(group.memberWorkspaceIds);
    if (memberIds.length === 0) continue;
    projects.push({
      id,
      title: normalizeTitle(group.title, id),
      members: memberIds.map(workspaceId => ({ workspaceId, role: ROLE_WRITABLE })),
      ...typeof group.primaryWorkspaceId === 'string' && memberIds.includes(group.primaryWorkspaceId)
        ? { defaultWorkspaceId: group.primaryWorkspaceId }
        : {},
    });
  }

  return {
    manifest: normalizeManifest({ schemaVersion: SCHEMA_VERSION, projects }),
    migrated: projects.length,
    note: 'v1-membership-was-exclusive; previously dropped memberships are not recoverable',
  };
}

/**
 * The folder a 聊天 conversation with no folder of its own starts in.
 *
 * A *starting point* preference, exactly like `defaultWorkspaceFor`: it decides
 * where a NEW conversation begins and nothing else. It never makes an existing
 * conversation change section — 聊天 stays "no registered workspace accounts
 * for this cwd", which is a live fact about the session, not a per-user setting.
 *
 * @param manifest - a normalized manifest.
 * @returns the configured path, or undefined when the user has not set one.
 */
function chatsFolderOf(manifest) {
  return normalizeChatsCwd(manifest?.[CHATS_CWD]);
}

/** A copy of `manifest` with the default chat folder set, replaced, or cleared. */
function setChatsFolder(manifest, path) {
  const chatsCwd = normalizeChatsCwd(path);
  return normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: manifest?.projects || [],
    ...chatsCwd === undefined ? {} : { [CHATS_CWD]: chatsCwd },
  });
}

function createEmptyManifest() {
  return { schemaVersion: SCHEMA_VERSION, projects: [], dropped: [] };
}

module.exports = {
  CHATS_CWD,
  ROLE_READONLY,
  ROLE_WRITABLE,
  ROLES,
  SCHEMA_VERSION,
  chatsFolderOf,
  createEmptyManifest,
  defaultWorkspaceFor,
  findProject,
  mergeMembers,
  migrateFromV1,
  normalizeChatsCwd,
  normalizeComparablePath,
  normalizeManifest,
  projectsContaining,
  readManifest,
  removeProject,
  setChatsFolder,
  upsertProject,
};

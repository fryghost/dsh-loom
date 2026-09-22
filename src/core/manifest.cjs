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

/** Membership roles describe what a folder contributes, not how it ranks. */
const ROLE_WRITABLE = 'writable';
const ROLE_READONLY = 'readonly';

const ROLES = [ROLE_WRITABLE, ROLE_READONLY];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  return { schemaVersion: SCHEMA_VERSION, projects, dropped };
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
  return normalizeManifest({ schemaVersion: SCHEMA_VERSION, projects: [...rest, incoming] }, options);
}

function removeProject(manifest, projectId) {
  return normalizeManifest({
    schemaVersion: SCHEMA_VERSION,
    projects: (manifest?.projects || []).filter(project => project.id !== projectId),
  });
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

function createEmptyManifest() {
  return { schemaVersion: SCHEMA_VERSION, projects: [], dropped: [] };
}

module.exports = {
  ROLE_READONLY,
  ROLE_WRITABLE,
  ROLES,
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
};

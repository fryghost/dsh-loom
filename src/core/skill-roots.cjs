/**
 * Expand a project into the concrete filesystem roots a session should read.
 *
 * DSH's own filesystem skill provider discovers project skills by walking UP
 * from a single cwd to the first `.git` and reading only that root's
 * `.dsh/skills` and `.agents/skills` (see
 * packages/skill/skill-filesystem/src/index.ts). That is correct for one
 * folder and structurally incapable of spanning several.
 *
 * Loom keeps DSH's per-folder layout exactly — same directory names, same
 * `.git`-bounded notion of a project — but asks every member folder the same
 * question instead of only the one that happens to be the cwd.
 */

const PROJECT_SKILL_DIRS = ['.dsh/skills', '.agents/skills'];
const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'];

/** Rank band for Loom-discovered project skills. */
const LOOM_SKILL_RANK = 150;

/**
 * Join path segments with a single forward slash.
 *
 * Separators are normalized to `/` on every platform. Node's fs accepts `/` on
 * Windows, and a single canonical spelling means a root path compares equal to
 * a member base path regardless of whether it arrived from a Windows realpath
 * (`C:\work\alpha`) or from the registry — the comparison that decides whether
 * a session belongs to a project must not depend on separator style.
 */
function joinPath(...segments) {
  return segments
    .filter(segment => typeof segment === 'string' && segment.length > 0)
    .map(segment => segment.replace(/\\/g, '/'))
    .map((segment, index) => (index === 0
      ? segment.replace(/\/+$/, '')
      : segment.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

/**
 * Build the ordered list of skill roots for one project.
 *
 * @param project - normalized project with `members`.
 * @param pathsByWorkspaceId - map of workspaceId → absolute folder path.
 * @returns roots in a stable order: members in declared order, project dirs
 *   within each. Roots whose folder path is unknown are reported, not skipped
 *   silently, so the preflight can show the gap.
 */
function skillRootsForProject(project, pathsByWorkspaceId = {}) {
  const roots = [];
  const unresolved = [];
  for (const member of project?.members || []) {
    const base = pathsByWorkspaceId[member.workspaceId];
    if (typeof base !== 'string' || base.length === 0) {
      unresolved.push(member.workspaceId);
      continue;
    }
    for (const dir of PROJECT_SKILL_DIRS) {
      roots.push({
        workspaceId: member.workspaceId,
        path: joinPath(base, dir),
        role: member.role,
        kind: dir.startsWith('.dsh') ? 'project-dsh' : 'project-agents',
      });
    }
  }
  return { roots, unresolved };
}

/** Build the ordered list of AGENTS.md-style instruction candidates. */
function instructionCandidatesForProject(project, pathsByWorkspaceId = {}) {
  const candidates = [];
  const unresolved = [];
  for (const member of project?.members || []) {
    const base = pathsByWorkspaceId[member.workspaceId];
    if (typeof base !== 'string' || base.length === 0) {
      unresolved.push(member.workspaceId);
      continue;
    }
    for (const file of INSTRUCTION_FILES) {
      candidates.push({
        workspaceId: member.workspaceId,
        path: joinPath(base, file),
        fileName: file,
        role: member.role,
      });
    }
  }
  return { candidates, unresolved };
}

/**
 * Decide which member owns a skill name when several provide it.
 *
 * Deliberately does NOT silently pick one. Loom's contract is that every
 * collision is reportable; this returns the winner AND the losers so the
 * preflight can show the user what was shadowed.
 *
 * Precedence, in order:
 *   1. writable members before readonly members — you can fix what you own;
 *   2. then declared member order.
 * This is a deterministic tiebreak, not a quality judgement, and it is
 * surfaced rather than hidden.
 */
function resolveSkillCollisions(candidates) {
  const byName = new Map();
  for (const candidate of candidates) {
    const list = byName.get(candidate.name) ?? [];
    list.push(candidate);
    byName.set(candidate.name, list);
  }

  const winners = [];
  const collisions = [];
  for (const [name, list] of byName) {
    const ordered = [...list].sort((a, b) => {
      const roleDelta = (a.role === 'writable' ? 0 : 1) - (b.role === 'writable' ? 0 : 1);
      if (roleDelta !== 0) return roleDelta;
      return (a.memberIndex ?? 0) - (b.memberIndex ?? 0);
    });
    const [winner, ...shadowed] = ordered;
    winners.push(winner);
    if (shadowed.length > 0) {
      collisions.push({ name, winner, shadowed });
    }
  }
  return { winners, collisions };
}

/**
 * Canonicalize a path for comparison: backslashes to forward slashes, no
 * trailing separator. Used wherever a registry-supplied base path is compared
 * against a root path built by {@link joinPath}.
 */
function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
}

module.exports = {
  INSTRUCTION_FILES,
  LOOM_SKILL_RANK,
  PROJECT_SKILL_DIRS,
  instructionCandidatesForProject,
  joinPath,
  normalizePath,
  resolveSkillCollisions,
  skillRootsForProject,
};

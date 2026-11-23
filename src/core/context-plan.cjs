/**
 * Context plan — Loom's headline capability.
 *
 * The problem this solves: when a project spans several folders, the context a
 * new session actually receives is invisible. DSH resolves skills, instruction
 * files, and the sandbox write boundary from a single cwd, so a user cannot
 * tell which folders contributed, which were shadowed, or which are writable
 * until something silently fails to load.
 *
 * A context plan is a pure, deterministic description of that outcome,
 * computed BEFORE a session starts:
 *
 *   - every skill that will be visible, with the folder that provides it;
 *   - every skill name collision, naming the winner and the shadowed losers;
 *   - every AGENTS.md that will load, in order, with byte counts;
 *   - every member folder that will NOT contribute, and why;
 *   - the write boundary, stated honestly per sandbox mode.
 *
 * Everything here is a pure function over already-gathered inputs. Filesystem
 * access happens in the caller, so the planning logic is fully testable
 * without touching a disk.
 */

const { normalizePath, resolveSkillCollisions, skillRootsForProject } = require('./skill-roots.cjs');

/** Severity levels a plan entry can carry. */
const LEVEL_INFO = 'info';
const LEVEL_WARN = 'warn';
const LEVEL_BLOCK = 'block';

/**
 * Reason codes for a member contributing nothing.
 *
 * These are the "silent gap" names. The whole point of the plan is that a
 * folder which contributes nothing must say so out loud, because that is
 * exactly the failure mode that made the old primary/secondary split so hard
 * to debug.
 */
const REASON = {
  MISSING_WORKSPACE: 'workspace-unresolved',
  MISSING_DIRECTORY: 'directory-missing',
  NO_SKILL_DIRS: 'no-skill-directories',
  NO_INSTRUCTIONS: 'no-instruction-files',
  EMPTY_SKILLS: 'skill-directories-empty',
};

function comparablePath(path) {
  const normalized = normalizePath(path);
  return /^(?:[a-z]:|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

/** Reconcile the current project's sources with the registry's winning versions. */
function planSkills(candidates, effectiveSkills) {
  const { winners, collisions } = resolveSkillCollisions(candidates);
  const alternativesByName = new Map(collisions.map(entry => [entry.name, entry.shadowed]));
  const effectiveByName = effectiveSkills === undefined
    ? undefined
    : new Map(effectiveSkills.map(skill => [skill.name, skill]));
  const skills = [];
  const conflicts = [];
  for (const localWinner of winners) {
    const localSources = [localWinner, ...(alternativesByName.get(localWinner.name) ?? [])];
    const effective = effectiveByName?.get(localWinner.name);
    const matchingSource = effective?.path === undefined ? undefined : localSources.find(source =>
      comparablePath(source.path) === comparablePath(effective.path));
    const winner = effectiveByName === undefined ? localWinner
      : effective === undefined ? undefined
        : { ...effective, workspaceId: matchingSource?.workspaceId };
    const shown = winner ?? localWinner;
    skills.push({
      name: shown.name,
      description: shown.description,
      ...shown.whenToUse === undefined ? {} : { whenToUse: shown.whenToUse },
      workspaceId: shown.workspaceId,
      path: shown.path,
      source: shown.source,
      unavailable: winner === undefined,
    });
    const shadowed = localSources.filter(source => shown.path === undefined
      || comparablePath(source.path) !== comparablePath(shown.path));
    if (shadowed.length > 0) {
      conflicts.push({
        name: shown.name,
        winner: { workspaceId: shown.workspaceId, path: shown.path, source: shown.source },
        shadowed: shadowed.map(source => ({ workspaceId: source.workspaceId, path: source.path })),
      });
    }
  }
  return { skills, collisions: conflicts };
}

/**
 * Describe the write boundary for a sandbox mode.
 *
 * This states the real constraint rather than implying parity across modes:
 * DSH's `writableRoots` derives from a SINGLE `workspaceRoot` (the session
 * cwd), so under `workspace-write` a sibling member folder is readable but not
 * writable. Hiding that would trade one silent failure for another.
 */
function describeWriteBoundary(mode, activeWorkspaceId) {
  switch (mode) {
    case 'danger-full-access':
      return {
        mode,
        writable: 'all-members',
        level: LEVEL_INFO,
        summary: '可写入全部成员文件夹。',
      };
    case 'workspace-write':
      return {
        mode,
        writable: 'active-member-only',
        activeWorkspaceId,
        level: LEVEL_WARN,
        summary: '仅活动文件夹可写；其他成员可读，但写入会被沙箱拒绝（DSH 的写入边界由单个 workspaceRoot 推导）。',
      };
    case 'read-only':
      return {
        mode,
        writable: 'none',
        level: LEVEL_WARN,
        summary: '只读模式：全部成员可读，任何写入都被拒绝。',
      };
    default:
      return {
        mode,
        writable: 'unknown',
        level: LEVEL_WARN,
        summary: `未知沙箱模式 "${mode}"；写入范围未确认。`,
      };
  }
}

function folderIsWithin(path, root) {
  const candidate = comparablePath(path);
  const parent = comparablePath(root);
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

/**
 * Build a context plan.
 *
 * @param input.project - normalized project (`{ id, title, members }`).
 * @param input.pathsByWorkspaceId - workspaceId → folder path (absent = unresolved).
 * @param input.skillsByRoot - per-root discovered skills:
 *   `{ [rootPath]: Array<{ name, description, whenToUse?, path }> }`.
 * @param input.rootStates - per-root availability:
 *   `{ [rootPath]: { exists: boolean, readError?: string } }`.
 * @param input.instructions - `Array<{ workspaceId, path, bytes, exists, excerpt? }>`.
 * @param input.sandboxMode - current sandbox mode string.
 * @param input.activeWorkspaceId - the folder a new session would start in.
 * @returns a serializable plan with `skills`, `instructions`, `silent`,
 *   `collisions`, `writeBoundary`, and `summary`.
 */
function buildContextPlan(input = {}) {
  const project = input.project ?? { id: '', title: '', members: [] };
  const paths = input.pathsByWorkspaceId ?? {};
  const names = input.namesByWorkspaceId ?? {};
  const statuses = input.statusesByWorkspaceId ?? {};
  const skillsByRoot = input.skillsByRoot ?? {};
  const rootStates = input.rootStates ?? {};
  const instructions = input.instructions ?? [];
  const members = project.members ?? [];
  const { roots } = skillRootsForProject(project, paths);
  const folders = [];

  const memberIndexById = new Map(members.map((member, index) => [member.workspaceId, index]));
  const roleById = new Map(members.map(member => [member.workspaceId, member.role ?? 'writable']));

  // ---- skills -------------------------------------------------------------
  const skillCandidates = [];
  const silent = [];
  const contributing = new Set();

  for (const member of members) {
    const base = paths[member.workspaceId];
    const folder = {
      workspaceId: member.workspaceId,
      name: typeof names[member.workspaceId] === 'string' && names[member.workspaceId].length > 0
        ? names[member.workspaceId]
        : normalizePath(base).split('/').pop() || base,
      path: base,
      status: statuses[member.workspaceId] ?? (base ? 'ready' : 'unresolved'),
      skillCount: 0,
      instructionCount: 0,
    };
    folders.push(folder);
    if (typeof base !== 'string' || base.length === 0) {
      silent.push({
        workspaceId: member.workspaceId,
        reason: REASON.MISSING_WORKSPACE,
        level: LEVEL_WARN,
        detail: '该文件夹当前无法解析（Workspace 可能已被移除）；项目仍保留此成员。',
      });
      continue;
    }

    const memberRoots = roots.filter(root => root.workspaceId === member.workspaceId).map(root => root.path);
    for (const root of memberRoots) {
      const state = rootStates[root];
      if (state?.readError && folder.status === 'ready') folder.status = 'unreadable';
      if (state !== undefined && state.exists === false) {
        // A skill directory that does not exist is normal, not a defect: most
        // folders have none. Only surface it when the folder was expected to
        // contribute and contributes nothing at all (handled below).
        continue;
      }
      for (const skill of skillsByRoot[root] ?? []) {
        folder.skillCount += 1;
        contributing.add(member.workspaceId);
        skillCandidates.push({
          name: skill.name,
          description: skill.description,
          ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
          path: skill.path,
          root,
          workspaceId: member.workspaceId,
          role: roleById.get(member.workspaceId) ?? 'writable',
          memberIndex: memberIndexById.get(member.workspaceId) ?? 0,
        });
      }
    }

    if (folder.skillCount === 0) {
      silent.push({
        workspaceId: member.workspaceId,
        reason: REASON.NO_SKILL_DIRS,
        level: LEVEL_INFO,
        detail: '该文件夹没有提供任何技能（未找到 .dsh/skills 或 .agents/skills，或目录为空）。',
      });
    }
  }

  const { skills, collisions } = planSkills(skillCandidates, input.effectiveSkills);

  // ---- instructions -------------------------------------------------------
  const loadedInstructions = instructions
    .filter(entry => entry.exists !== false)
    .map(entry => ({
      workspaceId: entry.workspaceId,
      path: entry.path,
      bytes: entry.bytes ?? 0,
      ...entry.excerpt === undefined ? {} : { excerpt: entry.excerpt },
    }));

  const instructionTotalBytes = loadedInstructions.reduce((sum, entry) => sum + entry.bytes, 0);
  const instructionOwners = new Set(loadedInstructions.map(entry => entry.workspaceId));
  for (const folder of folders) {
    folder.instructionCount = loadedInstructions.filter(entry => entry.workspaceId === folder.workspaceId).length;
    if (folder.status === 'ready' && instructions.some(entry => entry.workspaceId === folder.workspaceId && entry.readError)) {
      folder.status = 'unreadable';
    }
    if (folder.path !== undefined && folder.instructionCount === 0) {
      silent.push({
        workspaceId: folder.workspaceId,
        reason: REASON.NO_INSTRUCTIONS,
        level: LEVEL_INFO,
        detail: '该文件夹没有 AGENTS.md / CLAUDE.md，因此不贡献指令。',
      });
    }
  }

  // ---- summary ------------------------------------------------------------
  const contributingMembers = new Set([
    ...contributing,
    ...instructionOwners,
  ]);

  const nonContributing = members.filter(member => !contributingMembers.has(member.workspaceId));
  const writeBoundary = describeWriteBoundary(input.sandboxMode, input.activeWorkspaceId);
  if (writeBoundary.writable === 'active-member-only') {
    const roots = [paths[input.activeWorkspaceId], ...(input.additionalWritableRoots ?? [])]
      .filter(root => typeof root === 'string' && root.length > 0);
    writeBoundary.writableWorkspaceIds = folders
      .filter(folder => typeof folder.path === 'string' && roots.some(root => folderIsWithin(folder.path, root)))
      .map(folder => folder.workspaceId);
    if (writeBoundary.writableWorkspaceIds.some(id => id !== input.activeWorkspaceId)) {
      writeBoundary.writable = 'selected-members';
      writeBoundary.summary = '启动目录及配置的其他可写路径内的文件夹可写。';
    }
  }

  return {
    projectId: project.id,
    projectTitle: project.title,
    activeWorkspaceId: input.activeWorkspaceId,
    memberCount: members.length,
    folders,
    skills,
    skillCatalogConfirmed: input.effectiveSkills !== undefined,
    collisions,
    instructions: loadedInstructions,
    instructionTotalBytes,
    silent,
    writeBoundary,
    summary: {
      skillCount: skills.length,
      collisionCount: collisions.length,
      instructionCount: loadedInstructions.length,
      contributingMemberCount: contributingMembers.size,
      silentMemberCount: nonContributing.length,
      // A project where most folders contribute nothing is the exact symptom
      // of the old primary/secondary bug; surface it as a headline, not a
      // footnote.
      hasSilentMembers: nonContributing.length > 0,
    },
  };
}

/** Render a plan as plain text for logs, CLI output, or a copy button. */
function formatContextPlan(plan) {
  const lines = [];
  lines.push(`项目：${plan.projectTitle}（${plan.memberCount} 个文件夹）`);
  lines.push(`活动文件夹：${plan.activeWorkspaceId ?? '（未设置）'}`);
  lines.push('');

  lines.push(`技能（${plan.skills.length}）`);
  if (plan.skills.length === 0) lines.push('  （无）');
  for (const skill of plan.skills) {
    lines.push(`  · ${skill.name} ← ${skill.workspaceId}`);
  }
  lines.push('');

  if (plan.collisions.length > 0) {
    lines.push(`名称冲突（${plan.collisions.length}）`);
    for (const collision of plan.collisions) {
      lines.push(`  ! ${collision.name}`);
      lines.push(`      生效：${collision.winner.workspaceId ?? collision.winner.source}`);
      for (const shadowed of collision.shadowed) {
        lines.push(`      被遮蔽：${shadowed.workspaceId}`);
      }
    }
    lines.push('');
  }

  lines.push(`指令文件（${plan.instructions.length}，共 ${plan.instructionTotalBytes} 字节）`);
  if (plan.instructions.length === 0) lines.push('  （无）');
  for (const instruction of plan.instructions) {
    lines.push(`  · ${instruction.workspaceId} — ${instruction.path}（${instruction.bytes} 字节）`);
  }
  lines.push('');

  lines.push(`写入范围：${plan.writeBoundary.summary}`);

  if (plan.silent.length > 0) {
    lines.push('');
    lines.push(`未贡献的文件夹（${plan.silent.length}）`);
    for (const entry of plan.silent) {
      lines.push(`  · ${entry.workspaceId}：${entry.detail}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  LEVEL_BLOCK,
  LEVEL_INFO,
  LEVEL_WARN,
  REASON,
  buildContextPlan,
  describeWriteBoundary,
  formatContextPlan,
};

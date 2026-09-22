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

const { normalizePath, resolveSkillCollisions } = require('./skill-roots.cjs');

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
  const skillsByRoot = input.skillsByRoot ?? {};
  const rootStates = input.rootStates ?? {};
  const instructions = input.instructions ?? [];
  const members = project.members ?? [];

  const memberIndexById = new Map(members.map((member, index) => [member.workspaceId, index]));
  const roleById = new Map(members.map(member => [member.workspaceId, member.role ?? 'writable']));

  // ---- skills -------------------------------------------------------------
  const skillCandidates = [];
  const silent = [];
  const contributing = new Set();

  for (const member of members) {
    const base = paths[member.workspaceId];
    if (typeof base !== 'string' || base.length === 0) {
      silent.push({
        workspaceId: member.workspaceId,
        reason: REASON.MISSING_WORKSPACE,
        level: LEVEL_WARN,
        detail: '该文件夹当前无法解析（Workspace 可能已被移除）；项目仍保留此成员。',
      });
      continue;
    }

    // Roots are matched to their owning member by normalized prefix, because
    // a Windows realpath base and a forward-slash root must compare equal.
    const normalizedBase = normalizePath(base);
    const memberRoots = Object.keys(skillsByRoot).filter((root) => {
      const normalizedRoot = normalizePath(root);
      return normalizedRoot === normalizedBase || normalizedRoot.startsWith(`${normalizedBase}/`);
    });

    let memberSkillCount = 0;
    for (const root of memberRoots) {
      const state = rootStates[root];
      if (state !== undefined && state.exists === false) {
        // A skill directory that does not exist is normal, not a defect: most
        // folders have none. Only surface it when the folder was expected to
        // contribute and contributes nothing at all (handled below).
        continue;
      }
      for (const skill of skillsByRoot[root] ?? []) {
        memberSkillCount += 1;
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

    if (memberRoots.length === 0 || memberSkillCount === 0) {
      silent.push({
        workspaceId: member.workspaceId,
        reason: REASON.NO_SKILL_DIRS,
        level: LEVEL_INFO,
        detail: '该文件夹没有提供任何技能（未找到 .dsh/skills 或 .agents/skills，或目录为空）。',
      });
    }
  }

  const { winners, collisions } = resolveSkillCollisions(skillCandidates);

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
  for (const member of members) {
    if (typeof paths[member.workspaceId] !== 'string') continue;
    if (!instructionOwners.has(member.workspaceId)) {
      silent.push({
        workspaceId: member.workspaceId,
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

  return {
    projectId: project.id,
    projectTitle: project.title,
    activeWorkspaceId: input.activeWorkspaceId,
    memberCount: members.length,
    skills: winners.map(skill => ({
      name: skill.name,
      description: skill.description,
      ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
      workspaceId: skill.workspaceId,
      path: skill.path,
    })),
    collisions: collisions.map(collision => ({
      name: collision.name,
      winner: { workspaceId: collision.winner.workspaceId, path: collision.winner.path },
      shadowed: collision.shadowed.map(item => ({ workspaceId: item.workspaceId, path: item.path })),
    })),
    instructions: loadedInstructions,
    instructionTotalBytes,
    silent,
    writeBoundary,
    summary: {
      skillCount: winners.length,
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
      lines.push(`      生效：${collision.winner.workspaceId}`);
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

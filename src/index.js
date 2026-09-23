/**
 * dsh-loom host half.
 *
 * Responsibilities:
 *   1. persist the project manifest under `$DSH_HOME/projects/manifest.json`;
 *   2. expose manifest reads/writes plus a context-plan preflight over the
 *      loopback RPC channel the client already uses;
 *   3. register the skill provider that lets sibling folders contribute.
 *
 * Optional services are read with `ctx.get()` rather than declared in `inject`,
 * because Loom must remain loadable in compositions that lack a workspace
 * registry or a skills registry — degrading to "display only" is acceptable,
 * refusing to load is not.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { appendFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';

import { loadManifest, saveManifest } from './host/manifest-store.js';
import { createSkillProvider } from './host/skill-provider.js';
import skillRootsCore from './core/skill-roots.cjs';
import contextPlanCore from './core/context-plan.cjs';
import frontmatterCore from './core/frontmatter.cjs';

const { skillRootsForProject, instructionCandidatesForProject } = skillRootsCore;
const { buildContextPlan } = contextPlanCore;
const { parseSkillMetadata } = frontmatterCore;

const name = 'dsh-loom';
const inject = ['connection'];

/** Loopback RPC channel; the client's `connection.rpc.call` targets this. */
const BRIDGE_CHANNEL = '/dsh-loom';

function resolveDshHome(explicit) {
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  if (typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.length > 0) return process.env.DSH_HOME;
  return join(homedir(), '.dsh');
}

/**
 * Resolve workspaceId → folder path using the optional workspace registry.
 *
 * Returns only what it can resolve. Unresolved ids are deliberately absent
 * rather than filled with a guess, so the context plan can report them as
 * gaps instead of inventing a path.
 */
async function resolvePaths(ctx, workspaceIds) {
  const registry = ctx.get('workspaceRegistry');
  const paths = {};
  if (registry === undefined) return paths;
  for (const workspaceId of workspaceIds) {
    try {
      const workspace = registry.get(workspaceId);
      if (workspace !== undefined && typeof workspace.path === 'string') {
        paths[workspaceId] = workspace.path;
      }
    } catch {
      // An unresolvable workspace stays absent; the plan reports it.
    }
  }
  return paths;
}

/** Gather on-disk skill inventories for every root of a project. */
async function gatherSkills(roots) {
  const skillsByRoot = {};
  const rootStates = {};
  for (const root of roots) {
    try {
      const info = await stat(root.path);
      if (!info.isDirectory()) {
        rootStates[root.path] = { exists: false };
        continue;
      }
    } catch {
      rootStates[root.path] = { exists: false };
      continue;
    }
    rootStates[root.path] = { exists: true };

    const found = [];
    let entries;
    try {
      entries = await readdir(root.path, { withFileTypes: true });
    } catch (error) {
      rootStates[root.path] = { exists: true, readError: String(error?.message ?? error) };
      skillsByRoot[root.path] = [];
      continue;
    }

    for (const entry of entries) {
      if (entry.name === '.system') continue;
      const candidatePath = entry.isDirectory()
        ? join(root.path, entry.name, 'SKILL.md')
        : entry.isFile() && entry.name.endsWith('.md')
          ? join(root.path, entry.name)
          : undefined;
      if (candidatePath === undefined) continue;
      try {
        const raw = await readFile(candidatePath, { encoding: 'utf8' });
        const parsed = parseSkillMetadata(raw);
        if (parsed !== undefined) found.push({ ...parsed, path: candidatePath });
      } catch {
        // A single unreadable skill file never fails the inventory.
      }
    }
    skillsByRoot[root.path] = found;
  }
  return { skillsByRoot, rootStates };
}

/** Gather instruction-file facts (existence + size + excerpt) for a project. */
async function gatherInstructions(candidates) {
  const instructions = [];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate.path);
      if (!info.isFile()) {
        instructions.push({ ...candidate, exists: false, bytes: 0 });
        continue;
      }
      let excerpt;
      try {
        const raw = await readFile(candidate.path, { encoding: 'utf8' });
        excerpt = raw.slice(0, 400);
      } catch {
        excerpt = undefined;
      }
      instructions.push({
        ...candidate,
        exists: true,
        bytes: info.size,
        ...excerpt === undefined ? {} : { excerpt },
      });
    } catch {
      instructions.push({ ...candidate, exists: false, bytes: 0 });
    }
  }
  return instructions;
}

function createRpcHandler(ctx, dshHome) {
  const readManifestFromDisk = async () => {
    const loaded = await loadManifest(dshHome);
    return loaded;
  };

  return async (endpoint, payload) => {
    try {
      switch (endpoint) {
        case 'getManifest': {
          const loaded = await readManifestFromDisk();
          return {
            ok: true,
            value: {
              manifest: loaded.manifest,
              ok: loaded.ok,
              ...loaded.error === undefined ? {} : { error: loaded.error },
              path: loaded.path,
            },
          };
        }

        case 'putManifest': {
          const saved = await saveManifest(dshHome, payload?.manifest);
          if (!saved.ok) {
            return { ok: false, error: { code: 'write-failed', message: saved.error, details: {} } };
          }
          return { ok: true, value: { manifest: saved.manifest, path: saved.path } };
        }

        case 'report': {
          // Client-side diagnostics land here.
          //
          // The slot renderer retires a registration whose callback throws —
          // `slots.inject` stops its controller and rethrows asynchronously —
          // so the failure never reaches any surface the user or the model can
          // see. The client therefore reports its own registration outcome
          // explicitly, and this endpoint appends it to a log under $DSH_HOME.
          const line = {
            at: new Date().toISOString(),
            ...(payload !== null && typeof payload === 'object' ? payload : { value: payload }),
          };
          const file = join(dshHome, 'loom-client.log');
          await mkdir(dshHome, { recursive: true });
          await appendFile(file, `${JSON.stringify(line)}\n`, 'utf8');
          return { ok: true, value: { path: file } };
        }

        case 'preflight': {
          const loaded = await readManifestFromDisk();
          const projectId = typeof payload?.projectId === 'string' ? payload.projectId : '';
          const project = loaded.manifest.projects.find(item => item.id === projectId);
          if (project === undefined) {
            return {
              ok: false,
              error: { code: 'unknown-project', message: `no project "${projectId}"`, details: {} },
            };
          }

          const pathsByWorkspaceId = await resolvePaths(
            ctx,
            project.members.map(member => member.workspaceId),
          );
          const { roots } = skillRootsForProject(project, pathsByWorkspaceId);
          const { candidates } = instructionCandidatesForProject(project, pathsByWorkspaceId);
          const { skillsByRoot, rootStates } = await gatherSkills(roots);
          const instructions = await gatherInstructions(candidates);

          const sandboxMode = ctx.get('sandboxPolicy')?.defaultMode ?? payload?.sandboxMode ?? 'workspace-write';
          const plan = buildContextPlan({
            project,
            pathsByWorkspaceId,
            skillsByRoot,
            rootStates,
            instructions,
            sandboxMode,
            activeWorkspaceId: payload?.activeWorkspaceId ?? project.defaultWorkspaceId,
          });
          return { ok: true, value: { plan } };
        }

        default:
          return {
            ok: false,
            error: { code: 'unknown-endpoint', message: `dsh-loom: unknown endpoint ${JSON.stringify(endpoint)}`, details: {} },
          };
      }
    } catch (reason) {
      return {
        ok: false,
        error: { code: 'internal', message: reason instanceof Error ? reason.message : String(reason), details: {} },
      };
    }
  };
}

function apply(ctx, config = {}) {
  const dshHome = resolveDshHome(config.dshHome);

  // The client reaches the host over the same loopback RPC seam the client
  // half already injects; only loopback callers may read or write the manifest.
  ctx.connection.rpc.handle(BRIDGE_CHANNEL, createRpcHandler(ctx, dshHome), { authority: 'loopback' });

  // Register the sibling-folder skill provider. `inject` keeps Loom loadable
  // when no skills registry exists in this composition.
  ctx.inject(['skills'], (scope) => {
    const dispose = scope.skills.registerProvider(() => createSkillProvider({
      getProjectsForPath: async (cwd) => {
        const loaded = await loadManifest(dshHome);
        // Match on resolved member paths so a session whose cwd is any member
        // folder (or a subdirectory of one) sees the whole project.
        const registry = ctx.get('workspaceRegistry');
        const matched = [];
        for (const project of loaded.manifest.projects) {
          const pathsByWorkspaceId = await resolvePaths(ctx, project.members.map(member => member.workspaceId));
          const owns = Object.values(pathsByWorkspaceId).some(base =>
            typeof base === 'string' && base.length > 0 && isSameOrInside(cwd, base));
          if (owns) matched.push({ project, pathsByWorkspaceId });
        }
        return { projects: matched };
      },
      readText: async path => await readFile(path, { encoding: 'utf8' }),
    }));
    scope.effect(() => dispose, 'dsh-loom skill provider');
  });
}

/** Whether `child` is `base` itself or nested beneath it. */
function isSameOrInside(child, base) {
  const normalize = value => String(value).replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
  const c = normalize(child);
  const b = normalize(base);
  return c === b || c.startsWith(`${b}/`);
}

export { BRIDGE_CHANNEL, apply, createRpcHandler, gatherInstructions, gatherSkills, inject, isSameOrInside, name, resolveDshHome, resolvePaths };

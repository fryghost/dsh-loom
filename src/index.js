/**
 * dsh-loom host half.
 *
 * Responsibilities:
 *   1. persist the project manifest under `$DSH_HOME/projects/manifest.json`;
 *   2. expose manifest reads/writes plus a context-plan preflight on the
 *      carrier's shared `/api` channel (see `./core/bridge.cjs` for why the
 *      channel is shared rather than private);
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
import bridgeCore from './core/bridge.cjs';

const { skillRootsForProject, instructionCandidatesForProject } = skillRootsCore;
const { buildContextPlan } = contextPlanCore;
const { parseSkillMetadata } = frontmatterCore;
const { BRIDGE_CHANNEL, BRIDGE_ENDPOINTS, bridgePath } = bridgeCore;

const name = 'dsh-loom';
const inject = ['connection'];

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

/**
 * Correlation id used when the carrier cannot read one from the request.
 *
 * Mirrors the carrier's own placeholder (`rpc-host.ts`,
 * `INVALID_REQUEST_RPC_ID`): the client matches the id it sent and fails the
 * call on a mismatch, so a malformed request still has to answer with the
 * response envelope rather than a bare status.
 */
const INVALID_REQUEST_RPC_ID = 'invalid-request';

/** Carrier code for an envelope the endpoint cannot accept. */
const BAD_REQUEST_CODE = 'gateway/bad-request';

/** One `server-response` envelope, in the shape the carrier's client parses. */
function bridgeResponse(rpcId, result) {
  return Response.json({ type: 'server-response', rpcId, result });
}

/**
 * Answer one request on a Loom endpoint.
 *
 * The envelope is Connection's protocol, not Loom's — `client-request` in,
 * `server-response` out, correlation id echoed back. Loom re-implements it
 * (instead of borrowing the carrier's internal framing) because an exact Fetch
 * route hands back a raw `Response`; the rules below are the carrier's own, so
 * a client that works against `/api` works against Loom:
 *
 *   - a body that is not JSON is a 400 and no envelope at all;
 *   - a malformed or misaddressed envelope is a 200 with `ok: false`, NOT an
 *     HTTP error, so the reason survives to the caller instead of collapsing
 *     into a status code the UI cannot explain;
 *   - a thrown handler is caught inside {@link createRpcHandler} and travels the
 *     same way.
 *
 * @param request - request the carrier already fenced and authenticated.
 * @param endpoint - the endpoint this route owns.
 * @param handler - Loom's endpoint handler.
 * @returns the response envelope, or 400 when the body is unreadable.
 */
async function respondToBridge(request, endpoint, handler) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('body is not JSON', { status: 400 });
  }

  const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : INVALID_REQUEST_RPC_ID;
  const rejection = body === null || typeof body !== 'object' || Array.isArray(body)
    ? 'message is not an object'
    : body.type !== 'client-request'
      ? `type is not "client-request"`
      : typeof body.rpcId !== 'string'
        ? 'rpcId is not a string'
        : body.method !== endpoint
          ? `method ${JSON.stringify(body.method)} does not match endpoint ${JSON.stringify(endpoint)}`
          : undefined;
  if (rejection !== undefined) {
    return bridgeResponse(rpcId, {
      ok: false,
      error: { code: BAD_REQUEST_CODE, message: rejection, details: {} },
    });
  }

  return bridgeResponse(rpcId, await handler(endpoint, body.payload, request.signal));
}

function apply(ctx, config = {}) {
  const dshHome = resolveDshHome(config.dshHome);

  /**
   * Mount the client bridge: one exact Fetch route per endpoint, on the shared
   * `/api` channel.
   *
   * This REPLACES `connection.rpc.handle(BRIDGE_CHANNEL, handler)`, which DSH
   * 0.2 cannot honour from a plugin context — `register` reads
   * `owner.webServer` off Context's own fiber and throws
   * `cannot get property "webServer" without inject` while the plugin is still
   * loading. `./core/bridge.cjs` carries the full argument, including why the
   * previous two fixes for this same channel (the dropped `{ authority }`
   * argument, which produced `HTTP 405`) were both about the same mistake:
   * a private channel Loom cannot actually mount.
   *
   * Registration is an effect owned by this plugin's context, so unloading Loom
   * withdraws the routes; the carrier rejects a duplicate path, so a second
   * registration would be a hard error rather than a silent shadow.
   */
  const connection = ctx.connection;
  if (typeof connection?.fetch?.register !== 'function') {
    // Loud on purpose. Both earlier failures of this channel were silent: the
    // routes never mounted, every call answered 404/405, and the only visible
    // symptom was an empty sidebar section. Refusing to load is recoverable and
    // diagnosable; a half-mounted plugin is neither.
    throw new Error(
      'dsh-loom requires the Connection Fetch registry (DSH >= 0.2): '
      + 'ctx.connection.fetch.register is not available in this composition',
    );
  }
  const handler = createRpcHandler(ctx, dshHome);
  for (const endpoint of BRIDGE_ENDPOINTS) {
    connection.fetch.register({
      path: bridgePath(endpoint),
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: request => respondToBridge(request, endpoint, handler),
    });
  }

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

export {
  BRIDGE_CHANNEL,
  BRIDGE_ENDPOINTS,
  apply,
  bridgePath,
  createRpcHandler,
  gatherInstructions,
  gatherSkills,
  inject,
  isSameOrInside,
  name,
  resolveDshHome,
  resolvePaths,
  respondToBridge,
};

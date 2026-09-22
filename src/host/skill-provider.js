/**
 * Host-side skill provider: makes every member folder contribute skills.
 *
 * This is the fix for the core defect. DSH's filesystem provider resolves
 * project skills from a single `options.cwd`; a session whose cwd is one member
 * folder can never see a sibling's `.dsh/skills`. Loom registers an ADDITIONAL
 * provider (DSH's registry supports many) that answers the same question for
 * every member of the project that contains the cwd.
 *
 * Design choices worth stating:
 *
 *  - Loom never replaces or shadows DSH's own provider. For a session whose cwd
 *    is inside the project, DSH still loads the active folder's skills natively;
 *    Loom contributes the *other* members'. Duplicate names are resolved by
 *    rank, and Loom reports the losers through the context plan rather than
 *    hiding them.
 *
 *  - `list()` is cheap and side-effect free. It only reads the manifest and
 *    scans directories. It never mutates project state.
 *
 *  - `get()` reads the body from the real member path recorded in the locator,
 *    so `resourceBase` points at the folder the skill actually lives in and
 *    relative references inside a skill body keep working.
 *
 *  - A failure to read a single skill file degrades that one candidate; it
 *    never fails the whole catalog.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import skillRoots from '../core/skill-roots.cjs';
import frontmatter from '../core/frontmatter.cjs';

const { LOOM_SKILL_RANK } = skillRoots;
const { parseSkillMetadata } = frontmatter;

const PROVIDER_NAME = 'loom-project';

/** Directory entries that identify a project root, matching DSH's default. */
const PROJECT_ROOT_MARKERS = ['.git'];

/**
 * Find the project root containing `cwd`, mirroring DSH's own walk.
 *
 * Kept behaviourally identical to `findProjectRoot` in
 * packages/skill/skill-filesystem/src/index.ts so that Loom and DSH agree about
 * what a folder's project root is.
 */
async function findProjectRoot(cwd, options = {}) {
  const statImpl = options.stat ?? stat;
  let current = cwd;
  for (;;) {
    for (const marker of PROJECT_ROOT_MARKERS) {
      try {
        await statImpl(join(current, marker));
        return current;
      } catch {
        // Marker absent at this level; keep walking up.
      }
    }
    const parent = dirnameOf(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

function dirnameOf(path) {
  const normalized = String(path).replace(/[\\/]+$/, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (index < 0) return normalized;
  if (index === 0) return normalized.slice(0, 1);
  const parent = normalized.slice(0, index);
  // Preserve a Windows drive root such as `C:\`.
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

/**
 * List the skill files directly under one skill root.
 * @returns `Array<{ path, directory }>` for `.md` files and `<dir>/SKILL.md`.
 */
async function listSkillFiles(rootPath, options = {}) {
  const readdirImpl = options.readdir ?? readdir;
  const statImpl = options.stat ?? stat;
  let entries;
  try {
    entries = await readdirImpl(rootPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (entry.name === '.system') continue;
    const entryPath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push({ path: join(entryPath, 'SKILL.md'), directory: entryPath });
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push({ path: entryPath, directory: rootPath });
      continue;
    }
    if (entry.isSymbolicLink()) {
      try {
        const info = await statImpl(entryPath);
        if (info.isDirectory()) files.push({ path: join(entryPath, 'SKILL.md'), directory: entryPath });
        else if (info.isFile() && entry.name.endsWith('.md')) files.push({ path: entryPath, directory: rootPath });
      } catch {
        // A broken symlink is skipped, not fatal.
      }
    }
  }
  return files;
}

/**
 * Create the Loom skill provider.
 *
 * @param deps.getProjectsForPath - async (cwd) => projects whose members
 *   contain that folder. Injected so the provider is testable without a
 *   manifest file or a live workspace registry.
 * @param deps.readText - optional text reader override (tests).
 */
function createSkillProvider(deps) {
  const readText = deps.readText ?? (async path => await readFile(path, { encoding: 'utf8' }));

  return {
    name: PROVIDER_NAME,

    /**
     * Discover skills contributed by the sibling member folders.
     *
     * Returns an empty array when the cwd belongs to no Loom project, which
     * keeps Loom completely inert for ordinary single-folder sessions.
     */
    async list(options = {}) {
      const cwd = options.cwd;
      if (typeof cwd !== 'string' || cwd.length === 0) return [];

      const located = await deps.getProjectsForPath(cwd);
      if (located === undefined || located.projects.length === 0) return [];

      const candidates = [];
      const seenNames = new Map();

      for (const { project, pathsByWorkspaceId } of located.projects) {
        const { roots } = skillRoots.skillRootsForProject(project, pathsByWorkspaceId);
        for (const root of roots) {
          for (const file of await listSkillFiles(root.path, deps)) {
            const raw = await safeRead(readText, file.path);
            if (raw === undefined) continue;
            const parsed = parseSkillMetadata(raw);
            // Unparseable files are skipped here and reported by the context
            // plan; this provider must never advertise a skill DSH would reject.
            if (parsed === undefined) continue;

            // First writer wins within this provider: members are already in
            // declared order, and role precedence is applied by the plan. The
            // registry still ranks Loom below/above other providers by rank.
            if (seenNames.has(parsed.name)) continue;
            seenNames.set(parsed.name, file.path);

            candidates.push({
              name: parsed.name,
              description: parsed.description,
              ...parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse },
              source: 'project-loom',
              provider: PROVIDER_NAME,
              rank: LOOM_SKILL_RANK,
              path: file.path,
              resourceBase: { kind: 'directory', path: file.directory },
              locator: { path: file.path, directory: file.directory },
            });
          }
        }
      }
      return candidates;
    },

    /** Load one skill body from its real member-folder path. */
    async get(candidate) {
      const locator = candidate?.locator;
      if (locator === undefined || typeof locator.path !== 'string') return undefined;
      const raw = await safeRead(readText, locator.path);
      if (raw === undefined) return undefined;
      const parsed = parseSkillMetadata(raw);
      if (parsed === undefined) return undefined;

      const body = extractBody(raw);
      return {
        name: parsed.name,
        description: parsed.description,
        ...parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse },
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'project-loom',
        provider: PROVIDER_NAME,
        resourceBase: { kind: 'directory', path: locator.directory },
        path: locator.path,
        content: body,
      };
    },
  };
}

async function safeRead(readText, path) {
  try {
    return await readText(path);
  } catch {
    return undefined;
  }
}

/** Strip frontmatter, returning the trimmed body DSH would load. */
function extractBody(raw) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
  return (match === null ? raw : raw.slice(match[0].length)).trim();
}

export {
  PROJECT_ROOT_MARKERS,
  PROVIDER_NAME,
  createSkillProvider,
  dirnameOf,
  extractBody,
  findProjectRoot,
  listSkillFiles,
  safeRead,
};

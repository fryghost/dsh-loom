/**
 * Host-side manifest store.
 *
 * dsh-projects kept its grouping in browser localStorage, which has three
 * consequences Loom rejects:
 *   1. Desktop and Web profiles cannot see each other's projects;
 *   2. clearing site data destroys the grouping;
 *   3. a host-side consumer (a skill provider, an instruction aggregator)
 *      cannot read it at all — and without host-side reads, sibling folders
 *      can never contribute to a session.
 *
 * So the manifest lives in `$DSH_HOME/projects/manifest.json` and the client
 * reaches it over the existing loopback RPC channel.
 *
 * Writes are atomic (temp file + rename) because a half-written manifest would
 * silently redefine the user's projects on next start.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import manifest from '../core/manifest.cjs';

const { createEmptyManifest, readManifest, normalizeManifest, SCHEMA_VERSION } = manifest;

const MANIFEST_DIR = 'projects';
const MANIFEST_FILE = 'manifest.json';
const MANIFEST_VERSION = 1;

/**
 * Resolve the manifest path under a DSH home.
 * @param dshHome - absolute `$DSH_HOME`.
 * @returns absolute path to `manifest.json`.
 */
function manifestPath(dshHome) {
  return join(dshHome, MANIFEST_DIR, MANIFEST_FILE);
}

/**
 * Read and normalize the manifest from disk.
 *
 * Every failure mode degrades to an empty manifest rather than throwing: a
 * corrupt or unreadable manifest must not prevent the plugin from loading, and
 * must not cause the on-disk file to be overwritten with an empty one before
 * the user has had a chance to see the problem.
 *
 * @returns `{ manifest, ok, error? }`.
 */
async function loadManifest(dshHome, options = {}) {
  const path = manifestPath(dshHome);
  const readFileImpl = options.readFile ?? readFile;
  let raw;
  try {
    raw = await readFileImpl(path, { encoding: 'utf8' });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { manifest: createEmptyManifest(), ok: true, path };
    }
    return { manifest: createEmptyManifest(), ok: false, path, error: String(error?.message ?? error) };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { manifest: createEmptyManifest(), ok: false, path, error: `invalid JSON: ${String(error?.message ?? error)}` };
  }

  const result = readManifest(parsed, options);
  if (result.supported === false) {
    return {
      manifest: createEmptyManifest(),
      ok: false,
      path,
      error: `manifest schemaVersion ${result.foundVersion} is newer than supported ${SCHEMA_VERSION}; refusing to reinterpret it`,
    };
  }
  return { manifest: result, ok: true, path };
}

/**
 * Persist a manifest atomically.
 *
 * @param dshHome - absolute `$DSH_HOME`.
 * @param value - the manifest to write; re-normalized first so an invalid
 *   client payload cannot reach disk.
 * @returns `{ ok, path, manifest?, error? }`.
 */
async function saveManifest(dshHome, value, options = {}) {
  const path = manifestPath(dshHome);
  const normalized = normalizeManifest(value, options);
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    manifestVersion: MANIFEST_VERSION,
    projects: normalized.projects,
  };
  const mkdirImpl = options.mkdir ?? mkdir;
  const writeFileImpl = options.writeFile ?? writeFile;
  const renameImpl = options.rename ?? rename;

  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await mkdirImpl(dirname(path), { recursive: true });
    await writeFileImpl(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8' });
    await renameImpl(temporary, path);
  } catch (error) {
    return { ok: false, path, error: String(error?.message ?? error) };
  }
  return { ok: true, path, manifest: normalized };
}

export {
  MANIFEST_DIR,
  MANIFEST_FILE,
  MANIFEST_VERSION,
  loadManifest,
  manifestPath,
  saveManifest,
};

/**
 * Persistence tests. The store must never destroy user data on a read failure,
 * and must never leave a half-written manifest on disk.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadManifest, manifestPath, saveManifest } from '../src/host/manifest-store.js';

async function tempHome() {
  return await mkdtemp(join(tmpdir(), 'loom-store-'));
}

test('a missing manifest loads as an empty one, successfully', async () => {
  const home = await tempHome();
  try {
    const loaded = await loadManifest(home);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.manifest.projects, []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a saved manifest round-trips', async () => {
  const home = await tempHome();
  try {
    const saved = await saveManifest(home, {
      schemaVersion: 2,
      projects: [{ id: 'p1', title: 'Weave', members: ['ws-a', 'ws-b'] }],
    });
    assert.equal(saved.ok, true);

    const loaded = await loadManifest(home);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.manifest.projects[0].title, 'Weave');
    assert.deepEqual(loaded.manifest.projects[0].members.map(m => m.workspaceId), ['ws-a', 'ws-b']);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('saving creates the projects directory', async () => {
  const home = await tempHome();
  try {
    await saveManifest(home, { schemaVersion: 2, projects: [{ id: 'p1', title: 'P', members: ['ws-a'] }] });
    const raw = await readFile(manifestPath(home), { encoding: 'utf8' });
    assert.match(raw, /"schemaVersion": 2/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('corrupt JSON is reported and does NOT wipe the file', async () => {
  const home = await tempHome();
  try {
    await mkdir(join(home, 'projects'), { recursive: true });
    await writeFile(manifestPath(home), '{ this is not json', { encoding: 'utf8' });

    const loaded = await loadManifest(home);
    assert.equal(loaded.ok, false);
    assert.match(loaded.error, /invalid JSON/);
    assert.deepEqual(loaded.manifest.projects, []);

    // The damaged file must still be on disk for the user to recover.
    const raw = await readFile(manifestPath(home), { encoding: 'utf8' });
    assert.equal(raw, '{ this is not json');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a newer schema is refused rather than reinterpreted or overwritten', async () => {
  const home = await tempHome();
  try {
    await mkdir(join(home, 'projects'), { recursive: true });
    const future = JSON.stringify({ schemaVersion: 99, projects: [{ id: 'x', title: 'Future', members: ['ws-a'] }] });
    await writeFile(manifestPath(home), future, { encoding: 'utf8' });

    const loaded = await loadManifest(home);
    assert.equal(loaded.ok, false);
    assert.match(loaded.error, /newer than supported/);

    const raw = await readFile(manifestPath(home), { encoding: 'utf8' });
    assert.equal(raw, future, 'a future manifest must be left byte-identical');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('an invalid payload is normalized before it reaches disk', async () => {
  const home = await tempHome();
  try {
    await saveManifest(home, {
      schemaVersion: 2,
      projects: [
        { id: 'p1', title: 'Good', members: ['ws-a'] },
        { title: 'no id', members: ['ws-b'] },
      ],
    });

    const loaded = await loadManifest(home);
    assert.equal(loaded.manifest.projects.length, 1);
    assert.equal(loaded.manifest.projects[0].id, 'p1');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a failed write leaves no partial manifest and reports the error', async () => {
  const home = await tempHome();
  try {
    const result = await saveManifest(home, { schemaVersion: 2, projects: [] }, {
      writeFile: async () => { throw new Error('disk full'); },
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /disk full/);

    // Nothing readable should have been published.
    const loaded = await loadManifest(home);
    assert.equal(loaded.manifest.projects.length, 0);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a member that cannot be resolved is still written to disk', async () => {
  const home = await tempHome();
  try {
    await saveManifest(home, {
      schemaVersion: 2,
      projects: [{ id: 'p1', title: 'P', members: ['ws-known', 'ws-gone'] }],
    }, { knownWorkspaceIds: ['ws-known'] });

    const loaded = await loadManifest(home, { knownWorkspaceIds: ['ws-known'] });
    assert.equal(loaded.manifest.projects[0].members.length, 2);
    assert.equal(loaded.manifest.projects[0].members.find(m => m.workspaceId === 'ws-gone').missing, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

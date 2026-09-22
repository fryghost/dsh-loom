/**
 * End-to-end proof of Loom's core claim: a session whose cwd is ONE member
 * folder can see a skill that lives ONLY in a SIBLING member folder.
 *
 * This is the behaviour dsh-projects could not provide, and it is verified
 * here against real files on disk rather than mocks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { createSkillProvider } = require('../src/host/skill-provider.js');
const { normalizeManifest, projectsContaining } = require('../src/core/manifest.cjs');
const { skillRootsForProject } = require('../src/core/skill-roots.cjs');

async function makeSkill(dir, name, description, body = 'Do the thing.') {
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, 'SKILL.md'),
    ['---', `name: ${name}`, `description: ${description}`, '---', body, ''].join('\n'),
    { encoding: 'utf8' },
  );
}

test('a sibling folder skill is visible to a session rooted in another member', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loom-e2e-'));
  try {
    const alpha = join(root, 'alpha');
    const beta = join(root, 'beta');
    await mkdir(join(alpha, '.dsh', 'skills'), { recursive: true });
    await mkdir(join(beta, '.dsh', 'skills'), { recursive: true });

    await makeSkill(join(alpha, '.dsh', 'skills'), 'alpha-only', 'lives in alpha', 'Alpha body.');
    await makeSkill(join(beta, '.dsh', 'skills'), 'beta-only', 'lives in beta', 'Beta body.');

    const manifest = normalizeManifest({
      schemaVersion: 2,
      projects: [{ id: 'p1', title: 'Weave', members: ['ws-a', 'ws-b'] }],
    });
    const pathsByWorkspaceId = { 'ws-a': alpha, 'ws-b': beta };

    const provider = createSkillProvider({
      getProjectsForPath: async (cwd) => {
        // A session started in alpha must still resolve the whole project.
        const owning = projectsContaining(manifest, 'ws-a');
        return { projects: owning.map(project => ({ project, pathsByWorkspaceId })) };
      },
    });

    const candidates = await provider.list({ cwd: alpha });
    const names = candidates.map(c => c.name).sort();
    assert.deepEqual(names, ['alpha-only', 'beta-only'],
      'the sibling folder beta must contribute to a session rooted in alpha');

    // The beta skill must load its body from the REAL beta path.
    const betaCandidate = candidates.find(c => c.name === 'beta-only');
    const definition = await provider.get(betaCandidate);
    assert.equal(definition.content, 'Beta body.');
    assert.equal(definition.resourceBase.path, join(beta, '.dsh', 'skills', 'beta-only'));
    assert.ok(definition.path.startsWith(beta), 'the loaded path must be inside beta');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a session outside any project gets an empty contribution', async () => {
  const provider = createSkillProvider({
    getProjectsForPath: async () => ({ projects: [] }),
  });
  assert.deepEqual(await provider.list({ cwd: '/somewhere/else' }), []);
});

test('a missing cwd contributes nothing rather than throwing', async () => {
  const provider = createSkillProvider({ getProjectsForPath: async () => ({ projects: [] }) });
  assert.deepEqual(await provider.list({}), []);
  assert.deepEqual(await provider.list({ cwd: '' }), []);
});

test('an unparseable skill file is skipped, not advertised', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loom-e2e-'));
  try {
    const alpha = join(root, 'alpha');
    await mkdir(join(alpha, '.dsh', 'skills', 'broken'), { recursive: true });
    await writeFile(join(alpha, '.dsh', 'skills', 'broken', 'SKILL.md'), 'no frontmatter at all', { encoding: 'utf8' });
    await makeSkill(join(alpha, '.dsh', 'skills'), 'good', 'valid skill');

    const project = { id: 'p1', title: 'P', members: [{ workspaceId: 'ws-a', role: 'writable' }] };
    const provider = createSkillProvider({
      getProjectsForPath: async () => ({ projects: [{ project, pathsByWorkspaceId: { 'ws-a': alpha } }] }),
    });

    const names = (await provider.list({ cwd: alpha })).map(c => c.name);
    assert.deepEqual(names, ['good'], 'DSH would reject the broken file, so Loom must not offer it');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the same skill name across members is offered once by the provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loom-e2e-'));
  try {
    const alpha = join(root, 'alpha');
    const beta = join(root, 'beta');
    await makeSkill(join(alpha, '.dsh', 'skills'), 'shared', 'from alpha', 'Alpha.');
    await makeSkill(join(beta, '.dsh', 'skills'), 'shared', 'from beta', 'Beta.');

    const project = {
      id: 'p1',
      title: 'P',
      members: [{ workspaceId: 'ws-a', role: 'writable' }, { workspaceId: 'ws-b', role: 'writable' }],
    };
    const provider = createSkillProvider({
      getProjectsForPath: async () => ({ projects: [{ project, pathsByWorkspaceId: { 'ws-a': alpha, 'ws-b': beta } }] }),
    });

    const candidates = await provider.list({ cwd: alpha });
    assert.equal(candidates.length, 1, 'the registry must not receive two entries for one name');
    assert.equal(candidates[0].description, 'from alpha', 'declared member order decides the winner');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the provider contributes the Loom rank and a usable locator', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loom-e2e-'));
  try {
    const alpha = join(root, 'alpha');
    await makeSkill(join(alpha, '.dsh', 'skills'), 'ranked', 'desc');
    const project = { id: 'p1', title: 'P', members: [{ workspaceId: 'ws-a', role: 'writable' }] };
    const provider = createSkillProvider({
      getProjectsForPath: async () => ({ projects: [{ project, pathsByWorkspaceId: { 'ws-a': alpha } }] }),
    });

    const [candidate] = await provider.list({ cwd: alpha });
    assert.equal(candidate.rank, 150);
    assert.equal(candidate.provider, 'loom-project');
    assert.equal(candidate.source, 'project-loom');
    assert.ok(candidate.locator.path.endsWith('SKILL.md'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('both .dsh/skills and .agents/skills are scanned per member', async () => {
  const root = await mkdtemp(join(tmpdir(), 'loom-e2e-'));
  try {
    const alpha = join(root, 'alpha');
    await makeSkill(join(alpha, '.dsh', 'skills'), 'from-dsh', 'dsh root');
    await makeSkill(join(alpha, '.agents', 'skills'), 'from-agents', 'agents root');

    const project = { id: 'p1', title: 'P', members: [{ workspaceId: 'ws-a', role: 'writable' }] };
    const { roots } = skillRootsForProject(project, { 'ws-a': alpha });
    assert.equal(roots.length, 2);

    const provider = createSkillProvider({
      getProjectsForPath: async () => ({ projects: [{ project, pathsByWorkspaceId: { 'ws-a': alpha } }] }),
    });
    const names = (await provider.list({ cwd: alpha })).map(c => c.name).sort();
    assert.deepEqual(names, ['from-agents', 'from-dsh']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

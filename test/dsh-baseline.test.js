/**
 * Baseline: what bare DSH does with symlinks, with NO plugin installed.
 *
 * This test exists to pin the premise Loom is built on. If DSH's behaviour ever
 * changes here, Loom's reason for existing changes with it — so the assumption
 * is asserted rather than described in prose.
 *
 * Four findings, all verified against real files and the real provider:
 *
 *  B1. A folder-level symlink (A/b -> B) is INVISIBLE to skill discovery.
 *      DSH looks only at `<projectRoot>/.dsh/skills` and
 *      `<projectRoot>/.agents/skills`; it never descends into arbitrary linked
 *      folders. So `A/b -> B` aggregates nothing.
 *
 *  B2. A symlink placed AT one of those exact paths IS followed — but it
 *      SUBSTITUTES rather than aggregates: the link replaces the folder, so you
 *      get B's skills INSTEAD of A's, never both. A symlink has one target.
 *
 *  B3. Per-skill symlinks inside the skill root DO work (both A's and B's
 *      skills appear). That is the only bare-symlink layout that aggregates —
 *      and it must be maintained by hand, one link per skill.
 *
 *  B4. The skill root is the GIT REPO ROOT, not the cwd. A folder nested inside
 *      a repo cannot contribute its own project skills at all, because discovery
 *      stops at the repo root.
 *
 * Writes through any such link are separately denied under `workspace-write`
 * (see the containment test at the bottom).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync, statSync, readdirSync, lstatSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, sep, resolve, relative } from 'node:path';

/**
 * Resolve DSH's compiled skill provider.
 *
 * The checkout location is machine-specific, so it comes from `DSH_CHECKOUT`
 * and otherwise falls back to the development default. When neither resolves,
 * these tests SKIP: they document DSH's behaviour, and a missing checkout is
 * not a defect in Loom.
 */
const DSH_CHECKOUT = process.env.DSH_CHECKOUT ?? 'D:/deepseek/deepseek-harness';
const PROVIDER_URL = `file:///${DSH_CHECKOUT.replace(/\\/g, '/').replace(/^\/+/, '')}/packages/skill/skill-filesystem/lib/index.js`;

/** Windows denies unprivileged symlinks without Developer Mode. */
function canSymlink(scratch) {
  try {
    const target = join(scratch, '_probe-target');
    mkdirSync(target, { recursive: true });
    symlinkSync(target, join(scratch, '_probe-link'), 'junction');
    rmSync(join(scratch, '_probe-link'), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function makeSkill(dir, name) {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: probe ${name}\n---\nBody.\n`, 'utf8');
}

const fakeCtx = () => ({
  logger: { warn() {}, info() {}, error() {} },
  // get('fs') === undefined forces the provider's Node-fs path, the most
  // permissive case for symlinks.
  get: () => undefined,
  on() {},
  effect() {},
});

async function listSkills(providerClass, cwd, home) {
  const provider = new providerClass(
    fakeCtx(),
    { invalidate() {}, signal: new AbortController().signal },
    {
      providerName: 'baseline',
      includeDefaultRoots: true,
      dshHome: home,
      agentsHome: home,
      customSkillDirs: [],
      watch: false,
      bundledSkillDir: home,
    },
  );
  return (await provider.list({ cwd })).map(skill => skill.name).sort();
}

// DSH containment, reproduced verbatim from fs-sandbox/src/containment.ts.
function isLexicallyUnder(path, root, caseSensitive = process.platform !== 'win32') {
  const comparable = value => (caseSensitive ? value : value.toLowerCase());
  const target = comparable(path);
  const base = comparable(root);
  if (target === base) return true;
  return target.startsWith(base.endsWith(sep) ? base : base + sep);
}
const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino;
function statIfPresent(path) {
  try { return statSync(path, { bigint: true }); } catch { return undefined; }
}
function isPathUnder(path, root) {
  if (isLexicallyUnder(path, root)) return true;
  const rootInfo = statIfPresent(root);
  if (!rootInfo) return false;
  let ancestor = path;
  for (;;) {
    const ancestorInfo = statIfPresent(ancestor);
    if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true;
    const parent = dirname(ancestor);
    if (parent === ancestor) return false;
    ancestor = parent;
  }
}

async function withScratch(run) {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-baseline-'));
  const home = join(scratch, '_home');
  mkdirSync(home, { recursive: true });
  try {
    await run(scratch, home);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

test('B1: a folder-level symlink aggregates nothing for skill discovery', async t => {
  await withScratch(async (scratch, home) => {
    if (!canSymlink(scratch)) return t.skip('symlinks unavailable on this host');

    const providerClass = await loadProvider(t);
    if (providerClass === undefined) return;

    const B = join(scratch, 'B');
    makeSkill(join(B, '.dsh', 'skills'), 'beta-skill');

    const A = join(scratch, 'A');
    mkdirSync(join(A, '.git'), { recursive: true });
    makeSkill(join(A, '.dsh', 'skills'), 'alpha-skill');
    symlinkSync(B, join(A, 'b'), 'junction');

    const found = await listSkills(providerClass, A, home);
    assert.deepEqual(found, ['alpha-skill'],
      'a linked sibling folder must NOT contribute: DSH only reads the two fixed skill paths');
  });
});

test('B2: a symlink at the skill-root path SUBSTITUTES rather than aggregates', async t => {
  await withScratch(async (scratch, home) => {
    if (!canSymlink(scratch)) return t.skip('symlinks unavailable on this host');

    const providerClass = await loadProvider(t);
    if (providerClass === undefined) return;

    const B = join(scratch, 'B');
    makeSkill(join(B, '.dsh', 'skills'), 'beta-skill');

    // Replace A's own skills directory with a link to B's.
    const A = join(scratch, 'A');
    mkdirSync(join(A, '.git'), { recursive: true });
    makeSkill(join(A, '.dsh', 'skills'), 'alpha-skill');
    rmSync(join(A, '.dsh', 'skills'), { recursive: true, force: true });
    symlinkSync(join(B, '.dsh', 'skills'), join(A, '.dsh', 'skills'), 'junction');

    const found = await listSkills(providerClass, A, home);
    assert.deepEqual(found, ['beta-skill'],
      'the link replaces A\'s folder: alpha is LOST, not combined');
    assert.ok(!found.includes('alpha-skill'), 'substitution, not aggregation');
  });
});

test('B3: per-skill symlinks inside the skill root are the only bare-symlink aggregation', async t => {
  await withScratch(async (scratch, home) => {
    if (!canSymlink(scratch)) return t.skip('symlinks unavailable on this host');

    const providerClass = await loadProvider(t);
    if (providerClass === undefined) return;

    const B = join(scratch, 'B');
    makeSkill(join(B, '.dsh', 'skills'), 'beta-skill');

    const A = join(scratch, 'A');
    mkdirSync(join(A, '.git'), { recursive: true });
    makeSkill(join(A, '.dsh', 'skills'), 'alpha-skill');
    // One link per skill, created by hand.
    symlinkSync(join(B, '.dsh', 'skills', 'beta-skill'), join(A, '.dsh', 'skills', 'linked-beta'), 'junction');

    const found = await listSkills(providerClass, A, home);
    assert.deepEqual(found, ['alpha-skill', 'beta-skill'],
      'per-skill links do aggregate — but each one is manual maintenance');
  });
});

test('B3b: a link to a folder OF skills is skipped (provider reads only one level)', async t => {
  await withScratch(async (scratch, home) => {
    if (!canSymlink(scratch)) return t.skip('symlinks unavailable on this host');

    const providerClass = await loadProvider(t);
    if (providerClass === undefined) return;

    const B = join(scratch, 'B');
    makeSkill(join(B, '.dsh', 'skills'), 'beta-skill');

    const A = join(scratch, 'A');
    mkdirSync(join(A, '.git'), { recursive: true });
    makeSkill(join(A, '.dsh', 'skills'), 'alpha-skill');
    // Link to a DIRECTORY OF SKILLS, placed as if it were one skill.
    symlinkSync(join(B, '.dsh', 'skills'), join(A, '.dsh', 'skills', 'b-bundle'), 'junction');

    const found = await listSkills(providerClass, A, home);
    assert.deepEqual(found, ['alpha-skill'],
      'the provider looks for <entry>/SKILL.md and does not descend a second level');
  });
});

test('B4: the skill root is the git repo root, so a nested folder cannot contribute', async t => {
  await withScratch(async (scratch, home) => {
    const providerClass = await loadProvider(t);
    if (providerClass === undefined) return;

    // Repo R with its own .git, and a nested folder A3 holding skills.
    const R = join(scratch, 'R');
    mkdirSync(join(R, '.git'), { recursive: true });
    const A3 = join(R, 'A3');
    makeSkill(join(A3, '.dsh', 'skills'), 'nested-skill');

    const found = await listSkills(providerClass, A3, home);
    assert.deepEqual(found, [],
      'discovery stops at the repo root, so R/.dsh/skills is read and A3/.dsh/skills is never seen');
  });
});

test('B5: writing through a link is denied under workspace-write, though reading works', async t => {
  await withScratch(async (scratch, home) => {
    if (!canSymlink(scratch)) return t.skip('symlinks unavailable on this host');

    const B = join(scratch, 'B');
    makeSkill(join(B, '.dsh', 'skills'), 'beta-skill');

    const A = join(scratch, 'A');
    mkdirSync(join(A, '.git'), { recursive: true });
    mkdirSync(join(A, '.dsh'), { recursive: true });
    symlinkSync(join(B, '.dsh', 'skills'), join(A, '.dsh', 'skills'), 'junction');

    const throughLink = join(A, '.dsh', 'skills', 'beta-skill', 'SKILL.md');
    const targetKey = realpathSync.native(throughLink);

    // Reads pass through untouched in every sandbox mode.
    assert.equal(statSync(throughLink).isFile(), true, 'the read path follows the link');

    // The write fence compares filesystem identity against the workspace root.
    assert.equal(isPathUnder(targetKey, A), false,
      'cwd=A cannot write B through the link: containment sees B\'s inode, not A\'s');
    assert.equal(isPathUnder(targetKey, B), true,
      'the same file IS writable when the workspace root is B itself');
  });
});

test('B6: a folder symlink is invisible to the @-file-reference index', async t => {
  await withScratch(async (scratch, _home) => {
    if (!canSymlink(scratch)) return t.skip('symlinks unavailable on this host');

    const B = join(scratch, 'B');
    mkdirSync(B, { recursive: true });
    writeFileSync(join(B, 'b-file.txt'), 'from B', 'utf8');

    const A = join(scratch, 'A');
    mkdirSync(A, { recursive: true });
    writeFileSync(join(A, 'a-file.txt'), 'from A', 'utf8');
    symlinkSync(B, join(A, 'b-link'), 'junction');

    // On Windows a junction reports isSymbolicLink()=true and
    // isDirectory()=false, so the index's `entry.isDirectory()` branch never
    // fires and the linked tree contributes ZERO entries.
    const entries = readdirSync(A, { withFileTypes: true });
    const link = entries.find(entry => entry.name === 'b-link');
    assert.ok(link !== undefined);
    assert.equal(link.isDirectory(), false, 'a junction is not reported as a directory');
    assert.equal(link.isSymbolicLink(), true);
  });
});

test('B7: resolveDisplayDirectory refuses to descend a symlink', async t => {
  await withScratch(async (scratch, _home) => {
    if (!canSymlink(scratch)) return t.skip('symlinks unavailable on this host');

    const B = join(scratch, 'B');
    mkdirSync(B, { recursive: true });
    const A = join(scratch, 'A');
    mkdirSync(A, { recursive: true });
    symlinkSync(B, join(A, 'b-link'), 'junction');

    // Reproduced verbatim from file-reference-local/src/search.ts:257-282.
    const resolvedRoot = resolve(A);
    const absolute = resolve(resolvedRoot, 'b-link');
    const fromRoot = relative(resolvedRoot, absolute);
    assert.ok(!fromRoot.startsWith(`..${sep}`), 'the link is inside the root');

    let refused = false;
    let current = resolvedRoot;
    for (const segment of fromRoot.split(sep).filter(Boolean)) {
      current = join(current, segment);
      const status = lstatSync(current);
      if (status.isSymbolicLink() || !status.isDirectory()) { refused = true; break; }
    }
    assert.equal(refused, true,
      'the @-reference list refuses the link outright, so it can never be discovered');
  });
});

test('B8: a symlinked AGENTS.md file DOES load (file-level links work)', async t => {
  await withScratch(async (scratch, _home) => {
    if (!canSymlink(scratch)) return t.skip('symlinks unavailable on this host');

    const outside = join(scratch, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'shared.md'), 'shared instruction body', 'utf8');

    const A = join(scratch, 'A');
    mkdirSync(join(A, '.git'), { recursive: true });
    symlinkSync(join(outside, 'shared.md'), join(A, 'AGENTS.md'), 'file');

    // agent-instructions uses stat (not lstat) so a final-component link loads.
    assert.equal(statSync(join(A, 'AGENTS.md')).isFile(), true);
    assert.match(readFileSync(join(A, 'AGENTS.md'), 'utf8'), /shared instruction body/);

    // But it SUBSTITUTES: A has no AGENTS.md of its own any more.
    assert.equal(lstatSync(join(A, 'AGENTS.md')).isSymbolicLink(), true,
      'one link, one target — two folders cannot both contribute an AGENTS.md');
  });
});

/** Load DSH's provider; skip rather than fail if the checkout is unavailable. */
async function loadProvider(t) {
  try {
    const module = await import(PROVIDER_URL);
    const providerClass = module.FileSystemSkillProvider ?? module.default?.FileSystemSkillProvider;
    if (providerClass === undefined) {
      t.skip('FileSystemSkillProvider not found in the DSH checkout');
      return undefined;
    }
    return providerClass;
  } catch {
    t.skip('DSH checkout not available at the expected path');
    return undefined;
  }
}

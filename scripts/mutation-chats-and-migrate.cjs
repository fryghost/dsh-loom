/**
 * MUTATION CHECK for the two behaviours added together in 0.2.6:
 * the 聊天 band's entry point, and the two ends of a workspace migration.
 *
 * A regression test that passes on the BROKEN code is worse than none: it
 * certifies the bug as fixed. This script injects each original defect back,
 * one mutation at a time, and asserts the named suite goes RED — then restores.
 * 0.2.5 shipped a real bug past 204 green tests, so the rule is not optional
 * here (see docs/CONTRIBUTING.md).
 *
 * The mutations are the fixes, reverted piece by piece:
 *
 *   M1  remove the 聊天 band's action      -> the client-render band tests
 *   M2  write the bare manifest payload    -> the client-mount merge tests
 *   M2b collapse the folder verbs          -> the client-mount folder-menu test
 *   M3  attach fork lineage to the copy    -> the host-wiring lineage test
 *   M4  seed the copy from the whole log   -> the host-wiring seed test
 *   M5  skip the re-plan before creating   -> the stale-plan test
 *   M6  ignore a missing service           -> the degradation test
 *
 *   node scripts/mutation-chats-and-migrate.cjs
 *
 * Deliberately NOT under test/: it rewrites src/ and rebuilds dist/ while it
 * runs, and `node --test` executes every file in test/ in PARALLEL. Living
 * there made the 0.2.5 script corrupt its own siblings mid-flight.
 */
const { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const CLIENT = join(ROOT, 'src', 'client.cjs');
const HOST = join(ROOT, 'src', 'index.js');
const BUNDLE = join(ROOT, 'dist', 'client.js');

/** Both files this script may touch, backed up and restored together. */
const FILES = [CLIENT, HOST, BUNDLE];

const MUTATIONS = [
  {
    name: 'M1 remove the 聊天 band action',
    file: CLIENT,
    // The whole fix: the third section head passed no `action`, so the section
    // that lists unattributed conversations had no way to start one.
    apply: text => {
      const start = text.indexOf("    sectionHead('chats', t('sectionChats'), chatSessions.length,");
      const end = text.indexOf('    sectionBody(\'chats\'', start);
      if (start < 0 || end < 0) return text;
      return `${text.slice(0, start)}    sectionHead('chats', t('sectionChats'), chatSessions.length),\n\n${text.slice(end)}`;
    },
    suite: 'test/client-render.test.cjs',
    rebuild: true,
    expectFail: ['the 聊天 band offers a way to start a conversation'],
  },
  {
    name: 'M2 write the bare manifest payload',
    file: CLIENT,
    // The old `put`: `{ schemaVersion, projects }` and nothing else. Correct
    // while projects were the whole manifest, silently destructive once a
    // preference lives beside them.
    apply: text => text.replace(
      `        const value = await bridge.putManifest({
          schemaVersion: 2,
          ...current,
          ...patch,
          projects: patch.projects ?? current.projects ?? [],
        });`,
      `        const value = await bridge.putManifest({
          schemaVersion: 2,
          projects: patch.projects ?? current.projects ?? [],
        });`,
    ),
    suite: 'test/client-mount.test.cjs',
    rebuild: true,
    expectFail: ['a project edit does not drop the default chat folder'],
  },
  {
    name: 'M2b collapse the folder verbs onto one sentinel',
    file: CLIENT,
    // Found by the suite WHILE this check was being written: the band menu
    // passed `undefined` for BOTH "ask the user to pick" and "clear", so
    // "set default folder" silently cleared it instead of opening the picker.
    // An argument whose presence carries the verb is one refactor away from
    // meaning the opposite.
    apply: text => text.replace(
      `            if (id === 'set') onSetChatsCwd('pick');
            if (id === 'clear') onSetChatsCwd('clear');`,
      `            if (id === 'set') onSetChatsCwd();
            if (id === 'clear') onSetChatsCwd(undefined);`,
    ).replace(
      `        onSetChatsCwd: verb => {
          if (verb === 'clear') clearChatsFolder();
          else void setChatsFolder(undefined);
        },`,
      `        onSetChatsCwd: explicit => {
          if (explicit === undefined) clearChatsFolder();
          else void setChatsFolder(explicit);
        },`,
    ),
    suite: 'test/client-mount.test.cjs',
    rebuild: true,
    expectFail: ['choosing a folder that is already a workspace says so'],
  },
  {
    name: 'M3 attach fork lineage to the copy',
    file: HOST,
    // A copied session carrying `parentSession` is classified as delegated by
    // `sections.cjs` and hidden from EVERY section — it would read as a move
    // that produced nothing.
    apply: text => text.replace(
      `      meta: {
        cwd: target.path,
        isSeeded: true,`,
      `      meta: {
        cwd: target.path,
        parentSession: sessionId,
        isSeeded: true,`,
    ),
    suite: 'test/host-wiring.test.js',
    expectFail: ['the copy carries no lineage'],
  },
  {
    name: 'M4 seed the copy from the whole log',
    file: HOST,
    // Seeding past the completed prefix copies an open turn into a session that
    // is not running it: the copy would inherit work the user was never shown.
    apply: text => text.replace(
      'const seed = snapshot.events.slice(0, plan.boundary + 1);',
      'const seed = snapshot.events.slice(0);',
    ),
    suite: 'test/host-wiring.test.js',
    expectFail: ['migrateSession seeds a copy'],
  },
  {
    name: 'M5 skip the re-plan before creating',
    file: HOST,
    // The dialog planned when it opened; the click arrives later. Reusing the
    // FIRST observation instead of taking a fresh one copies a prefix the user
    // was never shown — and is exactly one read cheaper, which is what the test
    // counts.
    apply: text => text.replace(
      `  const planned = await planMigrationWith(ctx, sessionId, targetWorkspaceId);
  if (!planned.ok) return planned;
  const { plan } = planned;
  if (!plan.available) {
    return { ok: false, code: \`migration/\${plan.reason}\`, message: plan.reason, details: { reason: plan.reason } };
  }

  const query = ctx.get('sessionQuery');
  const registry = ctx.get('workspaceRegistry');
  const target = registry.get(targetWorkspaceId);
  const snapshot = await query.readSession(sessionId);
  const seed = snapshot.events.slice(0, plan.boundary + 1);`,
      `  const planned = await planMigrationWith(ctx, sessionId, targetWorkspaceId);
  if (!planned.ok) return planned;
  const { plan } = planned;
  if (!plan.available) {
    return { ok: false, code: \`migration/\${plan.reason}\`, message: plan.reason, details: { reason: plan.reason } };
  }

  const query = ctx.get('sessionQuery');
  const registry = ctx.get('workspaceRegistry');
  const target = registry.get(targetWorkspaceId);
  const snapshot = { session: undefined, events: [] };
  const seed = snapshot.events.slice(0, plan.boundary + 1);`,
    ),
    suite: 'test/host-wiring.test.js',
    expectFail: ['migrateSession reads the source itself'],
  },
  {
    name: 'M6 ignore a missing migration service',
    file: HOST,
    // Loom's host half must DEGRADE in a composition without these services,
    // naming what is absent — not throw, and not answer as though it worked.
    apply: text => text.replace(
      `  if (query === undefined || typeof query.readSession !== 'function') {
    return { ok: false, code: 'migration-unavailable', message: 'the Host mounts no sessionQuery service' };
  }`,
      '',
    ),
    suite: 'test/host-wiring.test.js',
    expectFail: ['planMigration names a missing capability'],
  },
];

function runSuite(suite) {
  try {
    const output = execFileSync(process.execPath, ['--test', join(ROOT, suite)], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, DSH_CHECKOUT: process.env.DSH_CHECKOUT ?? 'D:/deepseek/deepseek-harness' },
    });
    return { failed: false, output };
  } catch (error) {
    return { failed: true, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function build() {
  execFileSync(process.execPath, ['build.mjs'], { cwd: ROOT, encoding: 'utf8' });
}

/**
 * Name of every failing test in a run.
 *
 * NOT the `not ok` prefix alone. That is the TAP reporter's spelling; `node
 * --test` defaults to the SPEC reporter, which marks a failure with `✖` and
 * never prints `not ok` at all. Parsing only `not ok` therefore found no names,
 * read every mutation as uncaught, and reported a suite that WAS failing as
 * "GREEN — THE SUITE MISSED IT". Both spellings are accepted so the check
 * survives a reporter change in either direction.
 */
function failedNames(output) {
  const names = [];
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    const tap = /^not ok \d+ - (.*)$/.exec(line);
    if (tap !== null) {
      names.push(tap[1].trim());
      continue;
    }
    const spec = /^✖ (.*?)(?: \(\d+(?:\.\d+)?ms\))?$/.exec(line);
    if (spec !== null) names.push(spec[1].trim());
  }
  return [...new Set(names)];
}

const originals = new Map();
for (const file of FILES) {
  if (!existsSync(file)) {
    console.error(`missing ${file}; build the bundle before running this check`);
    process.exit(1);
  }
  originals.set(file, readFileSync(file));
  copyFileSync(file, `${file}.mutation-backup`);
}

let failures = 0;
try {
  for (const [index, mutation] of MUTATIONS.entries()) {
    const original = originals.get(mutation.file).toString('utf8');
    const mutated = mutation.apply(original);

    if (mutated === original) {
      console.log(`${mutation.name}: MUTATION DID NOT APPLY — the check would be vacuous`);
      failures += 1;
      continue;
    }

    // One mutation at a time: every file goes back to its original first, so a
    // leftover from the previous mutation cannot make this one look caught.
    for (const [file, bytes] of originals) writeFileSync(file, bytes);
    writeFileSync(mutation.file, mutated, 'utf8');
    if (mutation.rebuild === true) build();

    const result = runSuite(mutation.suite);
    const names = failedNames(result.output);
    const caught = mutation.expectFail.every(name => names.some(line => line.includes(name)));

    console.log(`${index + 1}. ${mutation.name}: ${caught ? 'RED as expected' : 'GREEN — THE SUITE MISSED IT'}`);
    for (const line of names.slice(0, 6)) console.log(`   caught: ${line}`);
    if (!caught) failures += 1;
  }
} finally {
  for (const [file, bytes] of originals) writeFileSync(file, bytes);
  for (const file of FILES) unlinkSync(`${file}.mutation-backup`);
  // The client mutations rebuilt dist/ from MUTATED source; rebuild once more
  // from the restored source so the working tree is byte-identical to before.
  build();
  console.log('');
  console.log('restored src/client.cjs, src/index.js, and dist/client.js');
}

console.log('');
console.log(failures === 0
  ? 'ALL MUTATIONS CAUGHT — the suites fail on the broken code and pass on the fix.'
  : `${failures} CHECK(S) DID NOT BEHAVE — investigate above.`);
process.exitCode = failures === 0 ? 0 : 1;

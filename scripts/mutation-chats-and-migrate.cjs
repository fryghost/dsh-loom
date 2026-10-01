/**
 * MUTATION CHECK for the behaviours added in 0.2.6 and repaired in 0.2.7:
 * the 聊天 band's entry point, both ends of a workspace migration, and the
 * folder picker that has to work whichever capability the composition offers.
 *
 * A regression test that passes on the BROKEN code is worse than none: it
 * certifies the bug as fixed. This script injects each original defect back,
 * one mutation at a time, and asserts the named suite goes RED — then restores.
 * 0.2.5 shipped a real bug past 204 green tests, and 0.2.6 shipped another past
 * 267, so the rule is not optional here (see docs/CONTRIBUTING.md).
 *
 * The mutations are the fixes, reverted piece by piece:
 *
 *   M1   remove the 聊天 band's action     -> the client-render band tests
 *   M2   write the bare manifest payload   -> the client-mount merge tests
 *   M2b  collapse the folder verbs         -> the client-mount folder-menu test
 *   M3   omit the source lineage           -> the REAL-VALIDATOR artifact test
 *   M3b  hide forks by parent again        -> the sections fork test
 *   M3c  never offer the built-in browser  -> the browse-fallback mount test
 *   M4   seed the copy from the whole log  -> the host-wiring seed test
 *   M5   skip the re-plan before creating  -> the stale-plan test
 *   M6   ignore a missing service          -> the degradation test
 *
 * M3 is the one that matters most historically. Its suite is
 * `test/migration-artifact.test.js`, which is the only test in the repository
 * that hands the produced artifact to DSH itself. Every other migration test
 * asserted fields against a fixture it had written, so all of them stayed green
 * while the real logs were unopenable.
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
const SECTIONS = join(ROOT, 'src', 'core', 'sections.cjs');
const BUNDLE = join(ROOT, 'dist', 'client.js');

/** Every file this script may touch, backed up and restored together. */
const FILES = [CLIENT, HOST, SECTIONS, BUNDLE];

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
    name: 'M3 omit the source lineage from the copy',
    file: HOST,
    // THE 0.2.6 DEFECT. A seeded copy carries the source's delivery watermarks
    // verbatim, and DSH admits a foreign-named watermark only while
    // `parentSession` explains it. Omit the field and the log is rejected as
    // `current-generation delivery marker names the wrong Session`, so the
    // session cannot be opened at all. 267 tests passed while this was broken,
    // because every one of them asserted the header against a fixture it had
    // written itself — the check that notices is DSH's own validator, in
    // test/migration-artifact.test.js.
    apply: text => text.replace(
      `        // NOT optional — see this function's header. Without it the copied
        // watermarks name a foreign session with nothing to explain them, and
        // DSH rejects the whole log as corrupt.
        parentSession: snapshot.session.id,
        isSeeded: true,`,
      `        isSeeded: true,`,
    ),
    suite: 'test/migration-artifact.test.js',
    expectFail: ['the migrated copy is an artifact DSH accepts'],
  },
  {
    name: 'M3b hide forks again, by parent instead of origin',
    file: SECTIONS,
    // The old rule. DSH's own fork writes `parentSession` and NOT `origin`, so
    // keying on the parent hides ordinary forks — including every migrated copy
    // and the user's own forked conversations — while DSH's browser goes on
    // showing them. The two sidebars disagreeing about which conversations exist
    // is the defect; the fix is to match the shipped rule.
    apply: text => text.replace(
      "  const delegated = summary.origin === 'subagent';",
      `  const delegated = summary.origin === 'subagent'
    || (summary.parentId !== undefined && summary.parentId !== summary.id);`,
    ),
    suite: 'test/sections.test.cjs',
    expectFail: ['a fork with a parent but no origin is an ordinary session'],
  },
  {
    name: 'M3c the built-in browser is never offered',
    file: CLIENT,
    // Reverting to "always call the native verb" — the state that produced
    // `directoryPicker.pick needs the native capability` on every browse-only
    // composition, surfaced to the user as a save failure.
    apply: text => text.replace(
      "        if (!String(cause?.message ?? cause).includes('native capability')) throw cause;",
      '        throw cause;',
    ),
    suite: 'test/client-mount.test.cjs',
    rebuild: true,
    expectFail: ['a browse-only composition opens the built-in folder browser'],
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
  console.log('restored src/client.cjs, src/index.js, src/core/sections.cjs, and dist/client.js');
}

console.log('');
console.log(failures === 0
  ? 'ALL MUTATIONS CAUGHT — the suites fail on the broken code and pass on the fix.'
  : `${failures} CHECK(S) DID NOT BEHAVE — investigate above.`);
process.exitCode = failures === 0 ? 0 : 1;

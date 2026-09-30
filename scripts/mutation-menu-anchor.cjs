/**
 * MUTATION CHECK for test/menu-anchor.test.cjs.
 *
 * A regression test that passes on the BROKEN code is worse than none: it
 * certifies the bug as fixed. This script injects the original defect back, one
 * mutation at a time, and asserts the suite goes red for each — then restores.
 *
 * The mutations are exactly the fix, reverted piece by piece:
 *   M1  remove the CSS pinning rules        -> the stylesheet tests must fail
 *   M2  drop the class from the group row   -> the wiring tests must fail
 *   M3  drop the class from the session row -> the session wiring test must fail
 *
 *   node scripts/mutation-menu-anchor.cjs
 *
 * Deliberately NOT under test/: it rewrites src/ and rebuilds dist/ while it
 * runs, and `node --test` executes every file in test/ in PARALLEL. Living there
 * made it corrupt its own siblings mid-flight — the suite reported failures in
 * tests it had not touched.
 */
const { readFileSync, writeFileSync, copyFileSync, unlinkSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'src', 'client.cjs');
const BUNDLE = join(ROOT, 'dist', 'client.js');
const SUITE = join(ROOT, 'test', 'menu-anchor.test.cjs');
const SOURCE_BACKUP = `${SOURCE}.mutation-backup`;
const BUNDLE_BACKUP = `${BUNDLE}.mutation-backup`;

const MUTATIONS = [
  {
    name: 'M1 remove the CSS pinning rules',
    apply: text => text.replace(
      /\.loom-row\.loom-menu-open \.loom-actions,[\s\S]*?\.loom-group-head\.loom-menu-open \{ background: var\(--dsw-alias-interactive-bg-hover\); \}/,
      '/* MUTATED: pinning rules removed */',
    ),
    expectFail: ['an open menu can pin the actions'],
  },
  {
    name: 'M2 drop the class from the group row',
    apply: text => text.replace(
      "className: menuOpen ? 'loom-group-head loom-menu-open' : 'loom-group-head',",
      "className: 'loom-group-head',",
    ),
    expectFail: ['the shipped bundle pins the row'],
  },
  {
    name: 'M3 drop the class from the session row',
    apply: text => text.replace(
      "      menuOpen ? 'loom-menu-open' : '',\n",
      '',
    ),
    expectFail: ['a session row pins itself'],
  },
];

function runSuite() {
  try {
    const output = execFileSync(process.execPath, ['--test', SUITE], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, DSH_CHECKOUT: process.env.DSH_CHECKOUT ?? 'D:/DeepSeek/deepseek-harness' },
    });
    return { failed: false, output };
  } catch (error) {
    return { failed: true, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function build() {
  execFileSync(process.execPath, ['build.mjs'], { cwd: ROOT, encoding: 'utf8' });
}

const original = readFileSync(SOURCE, 'utf8');
copyFileSync(SOURCE, SOURCE_BACKUP);
copyFileSync(BUNDLE, BUNDLE_BACKUP);

let failures = 0;
try {
  const baseline = runSuite();
  console.log(`baseline (fixed code): ${baseline.failed ? 'RED — fix is not in place' : 'green'}`);
  if (baseline.failed) {
    failures += 1;
    console.log(baseline.output.split('\n').filter(l => l.startsWith('not ok')).join('\n'));
  }
  console.log('');

  for (const mutation of MUTATIONS) {
    const mutated = mutation.apply(original);
    if (mutated === original) {
      console.log(`${mutation.name}: MUTATION DID NOT APPLY — the check would be vacuous`);
      failures += 1;
      continue;
    }
    writeFileSync(SOURCE, mutated, 'utf8');
    build();
    const result = runSuite();
    const notOk = result.output.split('\n').filter(l => l.startsWith('not ok'));
    const named = mutation.expectFail.every(name => notOk.some(line => line.includes(name)));

    console.log(`${mutation.name}: ${result.failed ? 'RED as expected' : 'GREEN — THE SUITE MISSED IT'}`);
    for (const line of notOk) console.log(`   ${line}`);
    if (!result.failed || !named) failures += 1;
    console.log('');
  }
} finally {
  writeFileSync(SOURCE, original, 'utf8');
  copyFileSync(BUNDLE_BACKUP, BUNDLE);
  unlinkSync(SOURCE_BACKUP);
  unlinkSync(BUNDLE_BACKUP);
  console.log('restored src/client.cjs and dist/client.js');
}

console.log('');
console.log(failures === 0
  ? 'ALL MUTATIONS CAUGHT — the suite fails on the broken code and passes on the fix.'
  : `${failures} CHECK(S) DID NOT BEHAVE — investigate above.`);
process.exitCode = failures === 0 ? 0 : 1;

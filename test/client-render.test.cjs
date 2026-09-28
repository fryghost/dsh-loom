/**
 * Render the SHIPPED bundle and assert what the sidebar actually produces.
 *
 * The pure-core tests cannot see the client's own row handling, and that is
 * exactly where a real regression lived: the section rows were narrowed by
 * "keep me if I have sessions", which deleted every row whose session list was
 * legitimately empty — a folder claimed by a project (its sessions live under
 * the project) and a project with no sessions yet. Both are the disappearance
 * the section rule exists to prevent, and both rendered as an empty section.
 *
 * So this test renders the committed `dist/client.js` through the real
 * module-loader banner against a primitives module that exposes ONLY the names
 * the host really exports, and asserts the resulting markup.
 *
 * It SKIPS rather than fails when React or the DSH checkout cannot be resolved:
 * neither is a Loom dependency, and a bare checkout must still be verifiable.
 * The bundle itself is committed, so nothing has to be built first.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');
const BUNDLE = join(ROOT, 'dist', 'client.js');
const CHECKOUT = process.env.DSH_CHECKOUT ?? 'D:/deepseek/deepseek-harness';

/** Where a real react / react-dom pair may live, most specific first. */
const MODULE_ROOTS = [
  process.env.DSH_HOME === undefined ? undefined : join(process.env.DSH_HOME, 'profiles', 'node_modules'),
  join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'profiles', 'node_modules'),
  join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'profiles', 'web', 'node_modules'),
  join(ROOT, 'node_modules'),
  // The DSH checkout itself: its hoisted pnpm store is where a react/react-dom
  // pair actually lives when no profile has installed one.
  join(CHECKOUT, 'node_modules'),
].filter(root => typeof root === 'string' && root.length > 0);

function findPackage(name) {
  for (const root of MODULE_ROOTS) {
    const direct = join(root, name);
    if (existsSync(join(direct, 'package.json'))) return direct;
  }
  for (const root of MODULE_ROOTS) {
    const store = join(root, '.pnpm');
    if (!existsSync(store)) continue;
    const hit = readdirSync(store).find(entry => entry === name || entry.startsWith(`${name}@`));
    if (hit !== undefined) {
      const candidate = join(store, hit, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return candidate;
    }
  }
  // The hoisted store is a flat directory rather than a set of versioned ones.
  for (const root of MODULE_ROOTS) {
    const hoisted = join(root, '.pnpm', 'node_modules', name);
    if (existsSync(join(hoisted, 'package.json'))) return hoisted;
  }
  return undefined;
}

function primitivesArtifact() {
  return [
    join(CHECKOUT, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js'),
    join(CHECKOUT, 'packages', 'client', 'ui-primitives', 'lib', 'index.js'),
    join(CHECKOUT, 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js'),
  ].find(candidate => existsSync(candidate));
}

const reactDir = findPackage('react');
const reactDomDir = findPackage('react-dom');
const artifact = primitivesArtifact();
const happyDomDir = findPackage('happy-dom');
const ready = reactDir !== undefined && reactDomDir !== undefined && artifact !== undefined;

/**
 * A require rooted at a package that can actually resolve `names`.
 *
 * `findPackage('react')` returns a directory where REACT resolves — it does not
 * promise that react's SIBLINGS do. On this machine it returns a junction into
 * the checkout's nested node_modules, and requiring `happy-dom` from there walks
 * up a tree that has no happy-dom and no .pnpm store, so the interaction tests
 * died with MODULE_NOT_FOUND while happy-dom sat resolvable from the repo root.
 *
 * So each package gets its own root, and only the roots that resolve everything
 * asked of them are eligible.
 */
function requireRootFor(names) {
  const candidates = [];
  for (const name of names) {
    const dir = findPackage(name);
    if (dir !== undefined) candidates.push(createRequire(join(dir, 'package.json')));
  }
  // The repo's own node_modules is the fallback anchor: it resolves whatever the
  // project installed directly, including a devDependency-only DOM library.
  candidates.push(createRequire(join(ROOT, 'package.json')));
  for (const req of candidates) {
    try {
      for (const name of names) req.resolve(name);
      return req;
    } catch {
      // Try the next anchor.
    }
  }
  return undefined;
}

const domReq = requireRootFor(['react', 'react-dom/client', 'happy-dom']);
// Interaction tests need a real DOM; a static render does not.
const domReady = ready && domReq !== undefined;

/** Load the real React pair once, the way a Node consumer would. */
function loadReact() {
  const req = createRequire(join(reactDir, 'index.js'));
  return { React: req('react'), server: req('react-dom/server') };
}

/**
 * A DOM with the real React pair, for tests that must CLICK something.
 *
 * The globals are installed BEFORE `react-dom/client` is required, because
 * React decides `canUseDOM` at require time: with the globals arriving later,
 * every synthetic event is silently dropped and the assertions pass vacuously.
 */
let domGlobalsInstalled = false;
function loadDom() {
  const req = domReq;
  if (!domGlobalsInstalled) {
    const { Window } = req('happy-dom');
    const window = new Window({ url: 'http://localhost/' });
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.navigator = window.navigator;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.Element = window.Element;
    globalThis.Node = window.Node;
    domGlobalsInstalled = true;
  }
  const React = req('react');
  return { React, ReactDOM: req('react-dom/client'), act: React.act };
}

/** The host's real export names, so a missing one stays undefined on purpose. */
function hostExportNames() {
  const declaration = /^export \{([\s\S]*?)\};?\s*$/m.exec(readFileSync(artifact, 'utf8'));
  assert.ok(declaration, 'could not parse the host primitives export list');
  return new Set(declaration[1].split(',').map(entry => entry.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean));
}

/** Load the bundle against a primitives stub holding only the host's real names. */
function loadBundle(React) {
  const names = hostExportNames();
  const source = readFileSync(BUNDLE, 'utf8');
  const stub = {};
  for (const match of source.matchAll(/\b(Icon[A-Za-z0-9]*Outline[A-Za-z0-9]*)\b/g)) {
    stub[match[1]] = props => React.createElement('span', { 'data-atom': match[1] }, props?.children ?? null);
  }
  for (const atom of ['Button', 'Tag', 'StateDot', 'Modal', 'Input', 'Menu']) {
    stub[atom] = atom === 'Menu'
      ? props => React.createElement('span', { 'data-atom': atom }, props?.anchor ?? null, props?.children ?? null)
      // Modal must render its FOOTER (where Save lives) and Button must be a real
      // clickable element: a stub that drops the control under test would make
      // the interaction tests pass vacuously.
      : atom === 'Modal'
        ? props => React.createElement('span', { 'data-atom': atom },
            props?.children ?? null, props?.footer ?? null)
        : atom === 'Button'
          ? props => React.createElement('button', {
              type: 'button', 'data-atom': atom, onClick: props?.onClick,
            }, props?.children ?? null)
          : props => React.createElement('span', { 'data-atom': atom }, props?.children ?? null);
  }
  // Names the host does not export remain absent, which is what makes a stale
  // rename throw here exactly as it does in the browser.
  for (const name of Object.keys(stub)) if (!names.has(name)) delete stub[name];

  const fakeRequire = spec => {
    if (spec === 'react') return React;
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') return stub;
    throw new Error(`unexpected require: ${spec}`);
  };
  let registration;
  const sandbox = {
    window: { __ModuleLoader__: { load: r => { registration = r; } } },
    require: fakeRequire,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'client.js' });
  assert.ok(registration, 'the bundle must register through __ModuleLoader__.load');
  return registration.factory(fakeRequire);
}

/** The host's live shapes, with one folder claimed by one project. */
const SNAPSHOT = {
  items: [{ workspaceId: 'ws-a', path: '/repo/app', title: 'ws-a', sessionIds: ['blank', 'old'] }],
  archivedSessionIds: [],
  phase: 'ready',
  state: 'ready',
};
const SESSIONS = {
  ids: ['blank', 'old'],
  byId: {
    // The provisional New Session row: `blank`, retained by the main view.
    blank: { id: 'blank', displayTitle: '新会话', running: false, blank: true, updatedAt: 300, retainedBy: { mainView: 1 } },
    old: { id: 'old', displayTitle: '重构解析器', running: false, blank: false, updatedAt: 200, retainedBy: {} },
  },
  phase: 'ready',
};

const NOOP = () => {};

/**
 * Compare only the ids.
 *
 * `saved.members` is built inside the `vm` sandbox, so its Array prototype is a
 * different realm's: `assert.deepEqual` reports "same structure but not
 * reference-equal" for identical contents. Copying through JSON puts both sides
 * in this realm and keeps the assertion meaningful.
 */
const memberIds = saved => JSON.parse(JSON.stringify(saved.members.map(m => m.workspaceId)));

/** Render `LoomSidebar` with every prop known, so no effect has to run. */
function renderSidebar({ projects, sessions = SESSIONS, snapshot = SNAPSHOT, panelActive = false }) {
  const { React, server } = loadReact();
  const loom = loadBundle(React);
  const element = React.createElement(loom.LoomSidebar, {
    projects, snapshot, sessionState: sessions, panelActive, t: key => key,
    onOpenSession: NOOP, onStartSession: NOOP, onNewProject: NOOP, onEditProject: NOOP,
    onDeleteProject: NOOP, onPreflightProject: NOOP, onRenameSession: NOOP, onForkSession: NOOP,
    onArchiveSession: NOOP, onNewWorkspace: NOOP, onRenameWorkspace: NOOP, onDeleteWorkspace: NOOP,
  });
  return server.renderToStaticMarkup(element);
}

const CLAIMING_PROJECT = {
  id: 'p1', title: 'example-project', members: [{ workspaceId: 'ws-a', role: 'readonly' }],
};

test('the shipped bundle registers and its sidebar renders', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  const html = renderSidebar({ projects: [] });
  for (const section of ['sectionProjects', 'sectionWorkspaces', 'sectionChats']) {
    assert.ok(html.includes(section), `${section} must render`);
  }
});

test('the provisional New Session row renders for the retained session', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  // Regression: `sessionState.current` never existed, so this row was filtered
  // out of every section while the registration still reported success.
  const html = renderSidebar({ projects: [] });
  assert.ok(html.includes('新会话'), 'the blank session the main view retains must be visible');
});

test('a selected main panel clears the highlight but keeps the row', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  // The host's guard covers the HIGHLIGHT only: `tree.ts:340` feeds visibility
  // from the unguarded `mainSessionId`, so the New Session row survives an open
  // panel. Deleting it was a regression introduced while adding the guard.
  const closed = renderSidebar({ projects: [], panelActive: false });
  const open = renderSidebar({ projects: [], panelActive: true });

  assert.ok(closed.includes('loom-row-current'), 'with no panel the current row is highlighted');
  assert.ok(!open.includes('loom-row-current'), 'with a panel open nothing is highlighted');
  assert.ok(open.includes('新会话'), 'but the provisional New Session row is still listed');
});

test('a folder claimed by a project stays listed and names the project', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  // The user-visible symptom: a folder associated with a project disappeared
  // from 工作区, reading as "it can no longer be bound to anything".
  const html = renderSidebar({ projects: [CLAIMING_PROJECT] });
  assert.ok(html.includes('loom-claimed'), 'the claimed folder must be annotated, not hidden');
  assert.ok(html.includes('example-project'), 'and the annotation must name the claiming project');
});

test('a claimed folder defers its sessions instead of repeating them', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  const html = renderSidebar({ projects: [CLAIMING_PROJECT] });

  // Count ROWS, not occurrences of the string: each row renders the title as a
  // `title` attribute AND as its text node, so a naive substring count reports
  // two for a single row.
  const rows = html.match(/class="loom-row[^"]*"[^>]*title="[^"]*"/g) ?? [];
  const sessionRows = rows.filter(row => row.includes('重构解析器'));
  assert.equal(sessionRows.length, 1,
    'the session must appear as exactly one row, under the claiming project');

  // And that one row must live in 项目, not in 工作区: the workspace row defers
  // to the project rather than listing the session a second time.
  const projectSection = html.indexOf('sectionProjects');
  const workspaceSection = html.indexOf('sectionWorkspaces');
  const at = html.indexOf('重构解析器');
  assert.ok(projectSection < at && at < workspaceSection,
    'the session row must render inside 项目, before the 工作区 section begins');
  assert.ok(html.includes('claimedElsewhere'),
    'the empty state must say the sessions live under the project, not that there are none');
});

test('an unclaimed folder still lists its own sessions', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  const html = renderSidebar({ projects: [] });
  assert.ok(html.includes('重构解析器'), 'nothing claims ws-a, so its session is listed under the folder');
  assert.ok(!html.includes('loom-claimed'), 'and no claim is annotated');
});

test('an empty project still appears in its section', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  // Same row-filtering bug as the claimed folder: a project with no sessions yet
  // is still a project the user made, and must not vanish from 项目.
  const html = renderSidebar({ projects: [{ id: 'empty', title: 'empty-project', members: [] }] });
  assert.ok(html.includes('empty-project'), 'a project with no sessions must still be listed');
});

test('the shipped bundle references no primitives name the host lacks', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  // The icon rename (0.1.7) turned every size-suffixed icon into `undefined`,
  // and `React.createElement(undefined)` throws — which abdicates the slot entry.
  const names = hostExportNames();
  const source = readFileSync(BUNDLE, 'utf8');
  const referenced = new Set();
  for (const match of source.matchAll(/\bIcon[A-Za-z0-9]*Outline[A-Za-z0-9]*\b/g)) referenced.add(match[0]);
  const stale = [...referenced].filter(name => !names.has(name));
  assert.deepEqual(stale, [], `the bundle uses names the host does not export: ${stale.join(', ')}`);
});

/*
 * The project editor. Both properties here were violated on every save, and
 * neither is visible to a host-side or pure-core test — the damage happened in
 * the component's own member list before the core ever saw it.
 */
function renderEditor({ project, workspaces }) {
  const { React, server } = loadReact();
  const loom = loadBundle(React);
  const element = React.createElement(loom.ProjectEditor, {
    project, workspaces, t: key => key,
    onSave: () => {}, onClose: () => {},
  });
  return server.renderToStaticMarkup(element);
}

/**
 * Mount the editor in a DOM and return what Save actually hands to `onSave`.
 *
 * A static render cannot do this: `save()` reads component state and is only
 * reachable through the Save button's click handler. Without this test the R3
 * fix is covered only at the CORE level (`mergeMembers`), so the WIRING — the
 * single line that calls it — could be inverted or replaced with a pruning
 * filter and every test would still pass.
 */
function savedMembers({ project, workspaces, toggles = [] }) {
  const { React, ReactDOM, act } = loadDom();

  const loom = loadBundle(React);
  let saved;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(loom.ProjectEditor, {
      project, workspaces, t: key => key,
      onSave: value => { saved = value; },
      onClose: () => {},
    }));
  });

  // Click the checkbox of each named folder to toggle membership, then Save.
  for (const workspaceId of toggles) {
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
    const labels = [...container.querySelectorAll('label.loom-pick')];
    const index = labels.findIndex(label => label.textContent.includes(workspaceId));
    if (index >= 0) {
      act(() => { boxes[index].click(); });
    }
  }
  const saveButton = [...container.querySelectorAll('button')]
    .find(button => button.textContent === 'save');
  act(() => { saveButton.click(); });

  act(() => { root.unmount(); });
  container.remove();
  return saved;
}

test('saving an edited project keeps every role and every unresolved member', t => {
  if (!domReady) return t.skip('react-dom/client (or a DOM) unavailable');
  // THE end-to-end R3 proof: click Save and inspect the payload. The editor's
  // membership list must come from the manifest rule, not from the live registry
  // — deriving it from the registry promoted every readonly folder and deleted
  // any member the registry could not resolve, both silently.
  const saved = savedMembers({
    project: {
      id: 'p1', title: 'P',
      members: [
        { workspaceId: 'ws-ro', role: 'readonly', note: 'schema source' },
        { workspaceId: 'ws-gone', role: 'readonly' },
      ],
    },
    // 'ws-gone' deliberately absent: the registry cannot resolve it right now.
    workspaces: [{ workspaceId: 'ws-ro', title: 'ws-ro', path: '/repo/ro' }],
  });

  assert.equal(saved.title, 'P');
  assert.deepEqual(memberIds(saved), ['ws-ro', 'ws-gone'],
    'an unresolvable member must survive a save, not be pruned');
  assert.equal(saved.members[0].role, 'readonly', 'and the role the user recorded must not be rewritten');
  assert.equal(saved.members[0].note, 'schema source', 'nor the note');
  assert.equal(saved.members[1].role, 'readonly');
  assert.equal(saved.defaultWorkspaceId, 'ws-ro', 'the starting folder must still be a member');
});

test('unchecking a folder in the editor is what removes it', t => {
  if (!domReady) return t.skip('react-dom/client (or a DOM) unavailable');
  // The other direction, so "keeps everything" cannot pass by ignoring the
  // checkbox: a deliberate uncheck must remove the member.
  const saved = savedMembers({
    project: {
      id: 'p1', title: 'P',
      members: [{ workspaceId: 'ws-keep', role: 'writable' }, { workspaceId: 'ws-drop', role: 'writable' }],
    },
    workspaces: [
      { workspaceId: 'ws-keep', title: 'ws-keep', path: '/repo/keep' },
      { workspaceId: 'ws-drop', title: 'ws-drop', path: '/repo/drop' },
    ],
    toggles: ['ws-drop'],
  });

  assert.deepEqual(memberIds(saved), ['ws-keep']);
});

test('a folder added in the editor joins the project as writable', t => {
  if (!domReady) return t.skip('react-dom/client (or a DOM) unavailable');
  const saved = savedMembers({
    project: { id: 'p1', title: 'P', members: [{ workspaceId: 'ws-a', role: 'readonly' }] },
    workspaces: [
      { workspaceId: 'ws-a', title: 'ws-a', path: '/repo/a' },
      { workspaceId: 'ws-new', title: 'ws-new', path: '/repo/new' },
    ],
    toggles: ['ws-new'],
  });

  const byId = new Map(saved.members.map(m => [m.workspaceId, m.role]));
  assert.equal(byId.get('ws-new'), 'writable', 'a newly added member defaults to writable');
  assert.equal(byId.get('ws-a'), 'readonly', 'and the existing member keeps its role');
});

test('the editor lists a member the registry cannot resolve', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  // Rendering only resolvable workspaces hid these members from the dialog, so
  // the sole way to touch one was to save and silently lose it.
  const html = renderEditor({
    project: { id: 'p1', title: 'P', members: [{ workspaceId: 'ws-gone', role: 'readonly' }] },
    workspaces: [{ workspaceId: 'ws-live', title: 'ws-live', path: '/repo/live' }],
  });

  assert.ok(html.includes('ws-gone'), 'an unresolved member must still be listed');
  assert.match(html, /loom-pick-missing/, 'and marked so the user knows it cannot be reached');
  assert.ok(html.includes('missingHint'), 'with the reason, not just a blank path');
});

test('the editor reports each member role instead of rewriting it', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  // The role is the recorded reason a folder is in the project; writing
  // `'writable'` unconditionally promoted every readonly member on save.
  const html = renderEditor({
    project: {
      id: 'p1', title: 'P',
      members: [{ workspaceId: 'ws-ro', role: 'readonly' }, { workspaceId: 'ws-rw', role: 'writable' }],
    },
    workspaces: [
      { workspaceId: 'ws-ro', title: 'ws-ro', path: '/repo/ro' },
      { workspaceId: 'ws-rw', title: 'ws-rw', path: '/repo/rw' },
    ],
  });

  assert.match(html, /loom-pick-role[^>]*>readonly</, 'a readonly member must be shown as readonly');
  assert.match(html, /loom-pick-role[^>]*>writable</, 'and a writable one as writable');
});

test('the editor still offers folders that are not members yet', t => {
  if (!ready) return t.skip('react / react-dom / DSH checkout unavailable');
  // The members ∪ registry union must not have replaced the registry list: a
  // folder that is not yet a member is how a project GAINS a member.
  const html = renderEditor({
    project: { id: 'p1', title: 'P', members: [{ workspaceId: 'ws-member', role: 'readonly' }] },
    workspaces: [
      { workspaceId: 'ws-member', title: 'ws-member', path: '/repo/member' },
      { workspaceId: 'ws-available', title: 'ws-available', path: '/repo/available' },
    ],
  });

  assert.ok(html.includes('ws-available'), 'a non-member folder must still be selectable');
  assert.ok(html.includes('ws-member'), 'and the existing member stays listed');
  // Exactly one row per folder: the union must not render a member twice.
  assert.equal((html.match(/class="loom-pick[ "]/g) ?? []).length, 2,
    'one row per folder, with no duplicate for a member that is also registered');
});

test('the bundle under test is the one this repository builds', () => {
  // Guards the same invariant the CI `bundle-freshness` job does, locally.
  assert.ok(existsSync(BUNDLE), 'dist/client.js is committed and must exist');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.exports['./client'], './dist/client.js', 'the client export points at this bundle');
  assert.ok(resolve(BUNDLE).startsWith(resolve(ROOT)), 'and it lives in this repository');
});

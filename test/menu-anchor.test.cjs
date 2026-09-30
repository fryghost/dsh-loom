/**
 * The row menu must stay reachable with a REAL pointer.
 *
 * The bug this file guards shipped, and every existing test stayed green:
 *
 *   The ellipsis lives in `.loom-actions`, which is `display: none` unless the
 *   row is hovered. The row Menu is portaled, so the host re-measures its anchor
 *   on every animation frame. The moment a user moves the pointer from the
 *   ellipsis toward the dropdown, `:hover` stops matching, `.loom-actions`
 *   collapses to 0x0, and the host clamps the list to the overlay margin — it
 *   teleports to the viewport's top-left corner and the pointer-leave grace then
 *   closes it. The user sees "clicking 删除 does nothing".
 *
 * Why nothing caught it: a static render never hovers, and DOM tests that click
 * programmatically (`element.click()`, or Playwright's `force: true`) skip the
 * actionability rules entirely — no pointer ever travels, so the collapse never
 * happens. The host's own rows defend against the same thing with a `menuOpen`
 * state class (`Rows.module.css`: `.projectRow.menuOpen .rowActions`).
 *
 * So this file locks both halves of the fix, each of which fails on its own:
 *
 *   1. the STYLESHEET keeps a non-hover way to pin `.loom-actions`, for BOTH
 *      row kinds — a fix applied to only one of them leaves the other broken;
 *   2. the WIRING actually applies that class while the menu is open, and
 *      removes it when the menu closes through ANY path (outside click, Escape,
 *      blur, pointer-leave all arrive as `onClose`).
 *
 * The end-to-end proof — a real pointer travelling on the live page — cannot
 * live here; it is the browser trace in the workspace. These two halves are what
 * a unit test can honestly own.
 *
 * Skipped when React or the DSH checkout is unavailable; neither is a Loom
 * dependency.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');
const BUNDLE = join(ROOT, 'dist', 'client.js');
const SOURCE = join(ROOT, 'src', 'client.cjs');
const CHECKOUT = process.env.DSH_CHECKOUT ?? 'D:/deepseek/deepseek-harness';

const MODULE_ROOTS = [
  process.env.DSH_HOME === undefined ? undefined : join(process.env.DSH_HOME, 'profiles', 'node_modules'),
  join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'profiles', 'node_modules'),
  join(ROOT, 'node_modules'),
  join(CHECKOUT, 'node_modules'),
].filter(root => typeof root === 'string' && root.length > 0);

function findPackage(name) {
  for (const root of MODULE_ROOTS) {
    const direct = join(root, name);
    if (existsSync(join(direct, 'package.json'))) return direct;
    const store = join(root, '.pnpm');
    if (!existsSync(store)) continue;
    const hit = readdirSync(store).find(entry => entry === name || entry.startsWith(`${name}@`));
    if (hit !== undefined) {
      const candidate = join(store, hit, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return candidate;
    }
    const hoisted = join(store, 'node_modules', name);
    if (existsSync(join(hoisted, 'package.json'))) return hoisted;
  }
  return undefined;
}

function requireRootFor(names) {
  const candidates = [];
  for (const name of names) {
    const dir = findPackage(name);
    if (dir !== undefined) candidates.push(createRequire(join(dir, 'package.json')));
  }
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
const ready = domReq !== undefined && findPackage('react') !== undefined && existsSync(BUNDLE);

/* ------------------------------------------------------------------ *
 * 1 + 2. The stylesheet contract (no DOM required)
 * ------------------------------------------------------------------ */

/** The stylesheet as authored, with comments removed so braces in prose cannot confuse a parse. */
function stylesheet() {
  const source = readFileSync(SOURCE, 'utf8');
  const start = source.indexOf('const STYLES = `');
  assert.ok(start >= 0, 'STYLES must be a backtick-delimited template');
  const rest = source.slice(start + 'const STYLES = `'.length);
  const end = rest.indexOf('`');
  assert.equal(rest[end + 1], ';', 'the stylesheet literal must close on the first following backtick');
  return rest.slice(0, end).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every rule whose declarations give `.loom-actions` a non-none display. */
function rulesShowingActions() {
  const css = stylesheet();
  const rules = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, ' ');
    const declarations = match[2];
    if (!selector.includes('.loom-actions')) continue;
    for (const declaration of declarations.split(';')) {
      const [property, value] = declaration.split(':').map(part => (part ?? '').trim());
      if (property === 'display' && value !== 'none' && value.length > 0) {
        rules.push({ selector, value });
      }
    }
  }
  return rules;
}

test('an open menu can pin the actions without relying on :hover', () => {
  // THE regression. Before the fix every rule that showed `.loom-actions` was
  // conditioned on the pointer still being on the row, which is exactly the
  // state a user gives up the instant they reach for the menu.
  const rules = rulesShowingActions();
  assert.ok(rules.length > 0, 'the stylesheet must be able to show .loom-actions at all');

  const pinned = rules.filter(rule => !rule.selector.includes(':hover') && !rule.selector.includes(':focus-within'));
  assert.ok(pinned.length > 0,
    'at least one rule must show .loom-actions WITHOUT :hover/:focus-within, or a portaled menu loses its anchor mid-flight');
  assert.ok(pinned.some(rule => rule.selector.includes('loom-menu-open')),
    'that rule must be driven by the menu-open state class the components set');
});

test('both row kinds can pin their actions, not just the one that was tested', () => {
  // A project row and a session row are different elements with different menu
  // verbs; fixing one leaves the other exactly as broken. The workspace rows use
  // the same element as project rows, so these two selectors cover all three.
  const pinned = rulesShowingActions()
    .filter(rule => !rule.selector.includes(':hover') && !rule.selector.includes(':focus-within'))
    .map(rule => rule.selector)
    .join('\n');
  for (const kind of ['.loom-row.loom-menu-open', '.loom-group-head.loom-menu-open']) {
    assert.ok(pinned.includes(kind),
      `${kind} must pin its actions while its menu is open`);
  }
});

test('pinning the actions also freezes the rest of the row appearance', () => {
  // Pinning the anchor alone is not enough. `.loom-claimed` is hidden on hover;
  // letting it reappear mid-menu changes the row's content width and shifts the
  // anchor sideways, taking the open menu with it, and a returning timestamp
  // would push the actions out from under the pointer. The whole hover
  // appearance therefore has to be held by the same state class.
  const css = stylesheet();
  const pinned = /\.loom-group-head\.loom-menu-open \.loom-claimed[^{]*\{([^}]*)\}/.exec(css);
  assert.ok(pinned, 'a claimed badge must stay hidden while the row menu is open');
  assert.match(pinned[1], /display:\s*none/);

  const times = /\.loom-(?:row|group-head)\.loom-menu-open \.loom-time[^{]*\{([^}]*)\}/.exec(css);
  assert.ok(times, 'a timestamp must stay hidden while the row menu is open (it occupies the actions slot)');
  assert.match(times[1], /display:\s*none/);
});

/* ------------------------------------------------------------------ *
 * 3 + 4. The wiring, across renders, against the shipped bundle
 * ------------------------------------------------------------------ */

const BUNDLE_MARKER = 'loom-menu-open';

/**
 * Load the SHIPPED bundle with a Menu stub that can be driven.
 *
 * The existing stubs render the anchor and drop `open`/`onClose` — which is why
 * they could never see this bug. This one records every Menu render and exposes
 * a way to fire the close the host would fire.
 */
function loadBundle(React) {
  const declaration = /^export \{([\s\S]*?)\};?\s*$/m.exec(readFileSync(artifactFile(), 'utf8'));
  assert.ok(declaration, 'could not parse the host primitives export list');
  const names = new Set(declaration[1].split(',').map(entry => entry.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean));

  const source = readFileSync(BUNDLE, 'utf8');
  const menus = [];
  const stub = {};
  for (const match of source.matchAll(/\b(Icon[A-Za-z0-9]*Outline[A-Za-z0-9]*)\b/g)) {
    stub[match[1]] = props => React.createElement('span', { 'data-atom': match[1] }, props?.children ?? null);
  }
  for (const atom of ['Button', 'Tag', 'StateDot', 'Modal', 'Input']) {
    stub[atom] = props => React.createElement('span', { 'data-atom': atom }, props?.children ?? null);
  }
  // Menu renders the list only while open, and records the props a real click
  // path would call — that is the seam this file needs.
  stub.Menu = props => {
    menus.push(props);
    return React.createElement('span', { 'data-atom': 'Menu' },
      props?.anchor ?? null,
      props?.open === true ? (props?.children ?? null) : null);
  };
  for (const name of Object.keys(stub)) if (!names.has(name)) delete stub[name];

  const fakeRequire = spec => {
    if (spec === 'react') return React;
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') return stub;
    throw new Error(`unexpected require: ${spec}`);
  };
  let registration;
  const sandbox = { window: { __ModuleLoader__: { load: r => { registration = r; } } }, require: fakeRequire, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'client.js' });
  assert.ok(registration, 'the bundle must register through __ModuleLoader__');
  return { loom: registration.factory(fakeRequire), menus };
}

function artifactFile() {
  return [
    join(CHECKOUT, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js'),
    join(CHECKOUT, 'packages', 'client', 'ui-primitives', 'lib', 'index.js'),
  ].find(candidate => existsSync(candidate));
}

let dom;
function loadDom() {
  if (dom !== undefined) return dom;
  const req = domReq;
  const { Window } = req('happy-dom');
  const window = new Window({ url: 'http://localhost/' });
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  const React = req('react');
  dom = { React, ReactDOM: req('react-dom/client'), act: React.act };
  return dom;
}

const SNAPSHOT = {
  items: [{ workspaceId: 'ws-a', path: '/repo/a', title: 'ws-a', sessionIds: ['settled'] }],
  archivedSessionIds: [], phase: 'ready', state: 'ready',
};
const SESSIONS = {
  ids: ['settled'],
  byId: {
    // NOT blank: a provisional row renders no actions at all, so it could never
    // exercise this path. A settled session is the case that matters.
    settled: { id: 'settled', displayTitle: '重构解析器', running: false, blank: false, updatedAt: 200, retainedBy: {} },
  },
  phase: 'ready',
};

const NOOP = () => {};

/** Mount the sidebar and hand back the container plus the recorded Menu renders. */
function mount() {
  const { React, ReactDOM, act } = loadDom();
  const { loom, menus } = loadBundle(React);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(loom.LoomSidebar, {
      projects: [{ id: 'p1', title: 'example-project', members: [{ workspaceId: 'ws-a', role: 'writable' }] }],
      snapshot: SNAPSHOT,
      sessionState: SESSIONS,
      panelActive: false,
      t: key => key,
      onOpenSession: NOOP, onStartSession: NOOP, onNewProject: NOOP, onEditProject: NOOP,
      onDeleteProject: NOOP, onPreflightProject: NOOP, onRenameSession: NOOP, onForkSession: NOOP,
      onArchiveSession: NOOP, onNewWorkspace: NOOP, onRenameWorkspace: NOOP, onDeleteWorkspace: NOOP,
    }));
  });
  return {
    container, act, menus,
    unmount: () => { act(() => { root.unmount(); }); container.remove(); },
  };
}

/** Open the menu of the row whose ellipsis carries `label`, and return that row. */
function openMenu(container, act, label) {
  const button = [...container.querySelectorAll(`button[aria-label="${label}"]`)][0];
  assert.ok(button, `no row renders an ellipsis labelled ${label}`);
  const row = button.closest('.loom-row, .loom-group-head');
  assert.ok(row, 'the ellipsis must live inside a row');
  act(() => { button.click(); });
  return row;
}

/**
 * The props of the menu that is actually OPEN.
 *
 * Not simply the last render: opening one row re-renders its whole group, so
 * every sibling menu renders too and the last entry belongs to whichever one
 * happens to sit lowest in the tree. Closing THAT one is a no-op on an
 * already-closed menu, which would leave the pin asserted against the wrong row.
 */
function openMenuProps(menus) {
  const open = menus.filter(props => props.open === true).at(-1);
  assert.ok(open, 'a menu must be open');
  assert.equal(typeof open.onClose, 'function', 'the open menu must expose an onClose');
  return open;
}

test('the shipped bundle pins the row while its menu is open', t => {
  if (!ready) return t.skip('react / react-dom / happy-dom / DSH checkout unavailable');
  assert.ok(readFileSync(BUNDLE, 'utf8').includes(BUNDLE_MARKER),
    'the committed bundle must carry the pinning class');

  const { container, act, menus, unmount } = mount();
  try {
    const row = openMenu(container, act, 'projectActions');
    assert.ok(row.classList.contains('loom-menu-open'),
      'opening the menu must pin the row, or the anchor collapses as the pointer leaves');
    assert.ok(menus.some(props => props.open === true), 'the menu itself must have opened');
  } finally {
    unmount();
  }
});

test('closing the menu releases the row, whatever closed it', t => {
  if (!ready) return t.skip('react / react-dom / happy-dom / DSH checkout unavailable');
  const { container, act, menus, unmount } = mount();
  try {
    const row = openMenu(container, act, 'projectActions');
    assert.ok(row.classList.contains('loom-menu-open'), 'precondition: the row is pinned while open');

    // The host routes outside-pointer, Escape, blur and the pointer-leave grace
    // through this one callback, so this covers every dismissal path at once.
    const open = openMenuProps(menus);
    act(() => { open.onClose(); });

    assert.ok(!row.classList.contains('loom-menu-open'),
      'a closed menu must release the pin, or the row keeps a hover look it no longer has');
  } finally {
    unmount();
  }
});

test('a session row pins itself the same way, not just a project row', t => {
  if (!ready) return t.skip('react / react-dom / happy-dom / DSH checkout unavailable');
  // Rename / fork / archive live behind the same mechanism, so a fix applied to
  // group rows only would leave every session verb unreachable.
  const { container, act, menus, unmount } = mount();
  try {
    const row = openMenu(container, act, 'sessionActions');
    assert.ok(row.classList.contains('loom-row'), 'the session row is the .loom-row element');
    assert.ok(row.classList.contains('loom-menu-open'), 'a session row must pin itself too');

    const open = openMenuProps(menus);
    act(() => { open.onClose(); });
    assert.ok(!row.classList.contains('loom-menu-open'), 'and release it when the menu closes');
  } finally {
    unmount();
  }
});

test('only the row whose menu is open is pinned', t => {
  if (!ready) return t.skip('react / react-dom / happy-dom / DSH checkout unavailable');
  const { container, act, unmount } = mount();
  try {
    const pinned = () => [...container.querySelectorAll('.loom-menu-open')];
    assert.equal(pinned().length, 0, 'no row is pinned before anything is opened');

    openMenu(container, act, 'projectActions');
    assert.equal(pinned().length, 1, 'exactly one row pins — the one whose menu is open');
  } finally {
    unmount();
  }
});

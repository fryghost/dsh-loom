/**
 * The host-mount contract: what happens across RENDERS, not just on one.
 *
 * The three defects this file guards all shared a shape — they were invisible to
 * a single static render, and two of them to every pure-core test:
 *
 *   1. A seat that appears or disappears changed the host component's HOOK ORDER.
 *      The seat IS a hook, and calling it from the sidebar registered its hooks
 *      against the sidebar; the framework re-renders the whole slot tree whenever
 *      a root source is registered or released (`rebuildRootBinding`), and an HMR
 *      reload of the layout plugin does exactly that. React answers a changed
 *      hook list with a throw, and a render throw ABDICATES the slot entry — the
 *      same silent disappearance as the icon rename.
 *   2. The panel guard was applied to VISIBILITY as well as the highlight, so the
 *      provisional New Session row was deleted whenever a panel opened. The host
 *      keeps that row (`tree.ts:340` uses the unguarded `mainSessionId`).
 *
 * Skipped when React or the DSH checkout is unavailable; neither is a Loom
 * dependency.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync, readdirSync, cpSync, mkdtempSync } = require('node:fs');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');
const BUNDLE = join(ROOT, 'dist', 'client.js');
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

const reactDir = findPackage('react');
const reactDomDir = findPackage('react-dom');
const happyDomDir = findPackage('happy-dom');
const artifact = [
  join(CHECKOUT, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js'),
  join(CHECKOUT, 'packages', 'client', 'ui-primitives', 'lib', 'index.js'),
].find(candidate => existsSync(candidate));

/**
 * A require rooted where react, react-dom AND happy-dom all resolve.
 *
 * A directory where `react` resolves does not promise that react's SIBLINGS do:
 * findPackage can return a junction into the checkout's nested node_modules,
 * from which happy-dom walks up a tree that does not contain it. Each package
 * therefore gets its own root, and the repo's node_modules is the fallback
 * anchor for a devDependency the project installed directly.
 */
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

const ready = reactDir !== undefined && reactDomDir !== undefined
  && domReq !== undefined && artifact !== undefined;

/**
 * A DOM plus the real React pair, for tests that span multiple renders.
 *
 * The globals go in BEFORE `react-dom/client` is required: React decides
 * `canUseDOM` at require time, and with the globals arriving later every update
 * is silently dropped.
 */
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
  dom = {
    window,
    React,
    ReactDOM: req('react-dom/client'),
    act: React.act,
    useSyncExternalStoreWithSelector: req('use-sync-external-store/shim/with-selector').useSyncExternalStoreWithSelector,
  };
  return dom;
}

function loadBundle(React) {
  const names = new Set(/^export \{([\s\S]*?)\};?\s*$/m.exec(readFileSync(artifact, 'utf8'))[1]
    .split(',').map(e => e.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean));
  const source = readFileSync(BUNDLE, 'utf8');
  const stub = {};
  for (const match of source.matchAll(/\b(Icon[A-Za-z0-9]*Outline[A-Za-z0-9]*)\b/g)) {
    stub[match[1]] = props => React.createElement('span', { 'data-atom': match[1] }, props?.children ?? null);
  }
  for (const atom of ['Button', 'Tag', 'StateDot', 'Modal', 'Input', 'Menu']) {
    stub[atom] = props => React.createElement('span', { 'data-atom': atom }, props?.children ?? null);
  }
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
  return registration.factory(fakeRequire);
}

/** The component `apply()` registers into `sidebar.workspaces`. */
function registeredComponent(loom) {
  let captured;
  const ctx = {
    effect: () => () => {},
    locale: { register: () => () => {}, getLocale: () => ({ active: 'zh' }) },
    connection: { rpc: { call: async () => ({ ok: true, value: { manifest: { projects: [] } } }) } },
    get: () => undefined,
    slots: {
      spec: () => ({ kind: 'single', scope: 'root' }),
      declarationEpoch: () => 1,
      inject: (_key, fn) => { fn(); },
      register: (_options, component) => { captured = component; return () => {}; },
    },
  };
  loom.apply(ctx);
  return captured;
}

const SNAPSHOT = {
  items: [{ workspaceId: 'ws-a', path: '/repo/a', title: 'ws-a', sessionIds: ['blank'] }],
  archivedSessionIds: [], phase: 'ready', state: 'ready',
};
const SESSIONS = {
  ids: ['blank'],
  byId: {
    blank: { id: 'blank', displayTitle: '新会话', running: false, blank: true, updatedAt: 300, retainedBy: { mainView: 1 } },
  },
  phase: 'ready',
};

/** A listener-based observable, the shape the host hands to slot components. */
function observable(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    set: next => { value = next; for (const listener of listeners) listener(); },
  };
}

test('the seat appearing or disappearing does not change the host component\'s hook order', t => {
  if (!ready) return t.skip('react / react-dom / happy-dom / DSH checkout unavailable');
  const { React, ReactDOM, act, useSyncExternalStoreWithSelector } = loadDom();
  const loom = loadBundle(React);
  const Component = registeredComponent(loom);

  // The REAL seat shape: the framework binds a selector hook over an observable
  // source, so it is not one hook — it is several.
  const panelSource = observable({ activePanelId: null });
  const usePanelInfo = selector => useSyncExternalStoreWithSelector(
    panelSource.subscribe, panelSource.getSnapshot, panelSource.getSnapshot, selector,
  );

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  const base = {
    useWorkspaces: selector => selector(SNAPSHOT),
    useSessions: selector => selector(SESSIONS),
    t: key => key,
  };

  // 1. Mounted WITHOUT the seat.
  act(() => { root.render(React.createElement(Component, base)); });

  // 2. The seat appears on the SAME instance. Before the fix this threw
  //    "change in the order of Hooks called by LoomSidebarSeated".
  assert.doesNotThrow(() => {
    act(() => { root.render(React.createElement(Component, { ...base, usePanelInfo })); });
  }, 'a seat that appears later must not reshape the caller\'s hook list');

  // 3. And disappears again.
  assert.doesNotThrow(() => {
    act(() => { root.render(React.createElement(Component, base)); });
  }, 'nor must it when the seat goes away');

  act(() => { root.unmount(); });
  container.remove();
});

test('an open main panel clears the highlight without deleting the row', t => {
  if (!ready) return t.skip('react / react-dom / happy-dom / DSH checkout unavailable');
  const { React, ReactDOM, act, useSyncExternalStoreWithSelector } = loadDom();
  const loom = loadBundle(React);
  const Component = registeredComponent(loom);

  const panelSource = observable({ activePanelId: null });
  const usePanelInfo = selector => useSyncExternalStoreWithSelector(
    panelSource.subscribe, panelSource.getSnapshot, panelSource.getSnapshot, selector,
  );

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  act(() => {
    root.render(React.createElement(Component, {
      useWorkspaces: selector => selector(SNAPSHOT),
      useSessions: selector => selector(SESSIONS),
      usePanelInfo,
      t: key => key,
    }));
  });

  const html = () => container.innerHTML;
  assert.ok(html().includes('loom-row-current'), 'with no panel the current row is highlighted');
  assert.ok(html().includes('新会话'), 'and the New Session row is listed');

  // A main panel opens: the highlight goes, the ROW stays.
  act(() => { panelSource.set({ activePanelId: 'loom-preflight' }); });
  assert.ok(!html().includes('loom-row-current'), 'an open panel must clear the highlight');
  assert.ok(html().includes('新会话'),
    'but must NOT delete the provisional New Session row — the host keeps it (tree.ts:340)');

  // Closing it restores the highlight.
  act(() => { panelSource.set({ activePanelId: null }); });
  assert.ok(html().includes('loom-row-current'), 'closing the panel restores the highlight');

  act(() => { root.unmount(); });
  container.remove();
});

test('the bundle under test exists and is the one this repository ships', () => {
  assert.ok(existsSync(BUNDLE), 'dist/client.js is committed');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.exports['./client'], './dist/client.js');
});

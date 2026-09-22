/**
 * dsh-loom client half.
 *
 * Loom's whole point is that the context a project produces is VISIBLE before
 * you start a session. This half renders that:
 *
 *   - a sidebar entry per project, showing how many folders contribute;
 *   - a project editor where a folder may be added to any number of projects;
 *   - a preflight panel listing every skill with its source folder, every
 *     name collision with its shadowed losers, every instruction file, every
 *     folder that contributes nothing, and the real write boundary.
 *
 * The client holds no project data of its own: it reads and writes through the
 * host RPC channel, so Desktop and Web profiles agree.
 */

const React = require('react');
const ReactDOM = require('react-dom');

const h = React.createElement;

const NS = 'dsh-loom';
const CHANNEL = '/dsh-loom';

const dictionaries = {
  zh: {
    projects: '项目',
    newProject: '新建项目',
    projectName: '项目名称',
    folders: '文件夹',
    addFolder: '添加文件夹',
    removeFolder: '移出',
    noProjects: '还没有项目',
    noFolders: '这个项目还没有文件夹',
    save: '保存',
    cancel: '取消',
    edit: '编辑',
    delete: '删除',
    preflight: '上下文预检',
    preflightHint: '在开始会话前，查看这个项目实际会加载什么。',
    running: '正在分析…',
    skills: '技能',
    noSkills: '没有技能',
    collisions: '名称冲突',
    collisionHint: '同名技能只会生效一个；下面是被遮蔽的来源。',
    winner: '生效',
    shadowed: '被遮蔽',
    instructions: '指令文件',
    noInstructions: '没有指令文件',
    writeScope: '写入范围',
    silentFolders: '未贡献的文件夹',
    silentHint: '这些文件夹当前没有向会话提供任何内容。',
    from: '来自',
    role: '角色',
    writable: '可写',
    readonly: '只读',
    missing: '已失联',
    missingHint: '该文件夹当前无法解析；项目仍保留此成员。',
    copyPlan: '复制预检结果',
    copied: '已复制',
    refresh: '重新分析',
    needName: '请输入项目名称。',
    needFolder: '至少选择一个文件夹。',
    loadFailed: '读取项目失败：{message}',
    saveFailed: '保存失败：{message}',
    unsupported: '项目文件由更新版本的插件写入，已停止读取以免覆盖。',
    contributing: '{count} 个文件夹在贡献内容',
    memberCount: '{count} 个文件夹',
  },
  en: {
    projects: 'Projects',
    newProject: 'New project',
    projectName: 'Project name',
    folders: 'Folders',
    addFolder: 'Add folder',
    removeFolder: 'Remove',
    noProjects: 'No projects yet',
    noFolders: 'This project has no folders yet',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    preflight: 'Context preflight',
    preflightHint: 'See exactly what this project will load, before you start a session.',
    running: 'Analyzing…',
    skills: 'Skills',
    noSkills: 'No skills',
    collisions: 'Name collisions',
    collisionHint: 'Only one skill per name takes effect; the shadowed sources are listed below.',
    winner: 'Active',
    shadowed: 'Shadowed',
    instructions: 'Instruction files',
    noInstructions: 'No instruction files',
    writeScope: 'Write scope',
    silentFolders: 'Folders contributing nothing',
    silentHint: 'These folders currently provide nothing to the session.',
    from: 'from',
    role: 'Role',
    writable: 'writable',
    readonly: 'read-only',
    missing: 'unresolved',
    missingHint: 'This folder cannot be resolved right now; the membership is kept.',
    copyPlan: 'Copy preflight',
    copied: 'Copied',
    refresh: 'Re-analyze',
    needName: 'Enter a project name.',
    needFolder: 'Select at least one folder.',
    loadFailed: 'Could not load projects: {message}',
    saveFailed: 'Save failed: {message}',
    unsupported: 'The project file was written by a newer version; reading stopped to avoid overwriting it.',
    contributing: '{count} folders contributing',
    memberCount: '{count} folders',
  },
};

const STYLES = `
.loom-panel { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; font-size: 12px; }
.loom-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.loom-title { font-weight: 600; font-size: 12px; opacity: .85; }
.loom-btn { border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; opacity: .8; }
.loom-btn:hover { opacity: 1; }
.loom-btn:disabled { opacity: .4; cursor: default; }
.loom-row { display: flex; align-items: center; gap: 8px; }
.loom-project { border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.loom-project-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.loom-project-name { font-weight: 600; }
.loom-muted { opacity: .6; }
.loom-badge { font-size: 10px; border-radius: 999px; padding: 1px 6px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); }
.loom-badge-warn { border-color: #d08a2a; color: #d08a2a; }
.loom-member { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.loom-member-path { opacity: .6; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loom-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.loom-modal { background: var(--dsh-bg, #1e1e1e); color: var(--dsh-fg, #e8e8e8); border-radius: 12px; padding: 16px; width: min(680px, 92vw); max-height: 86vh; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.loom-modal-title { font-size: 15px; font-weight: 600; }
.loom-field { display: flex; flex-direction: column; gap: 4px; }
.loom-input { padding: 6px 8px; border-radius: 6px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); background: transparent; color: inherit; font-size: 13px; }
.loom-section { border-top: 1px solid color-mix(in srgb, currentColor 15%, transparent); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.loom-section-title { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.loom-item { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
.loom-item-name { font-weight: 500; }
.loom-src { font-size: 11px; opacity: .6; word-break: break-all; }
.loom-warn-text { color: #d08a2a; }
.loom-pre { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 11px; background: color-mix(in srgb, currentColor 8%, transparent); padding: 8px; border-radius: 6px; max-height: 240px; overflow: auto; }
.loom-actions { display: flex; justify-content: flex-end; gap: 8px; }
.loom-check { display: flex; align-items: center; gap: 6px; }
`;

function installStyles() {
  const id = 'loom-styles';
  if (typeof document === 'undefined') return () => {};
  if (document.getElementById(id) !== null) return () => {};
  const element = document.createElement('style');
  element.id = id;
  element.textContent = STYLES;
  document.head.appendChild(element);
  return () => { element.remove(); };
}

function interpolate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    (values[key] === undefined ? match : String(values[key])));
}

/** Thin wrapper over the loopback RPC channel; every call is host-backed. */
function createBridge(ctx) {
  const call = async (endpoint, payload) => {
    const result = await ctx.connection.rpc.call(CHANNEL, endpoint, payload ?? {});
    if (result === undefined || result === null) {
      throw new Error(`dsh-loom: empty response from ${endpoint}`);
    }
    if (result.ok === false) {
      throw new Error(result.error?.message ?? `dsh-loom: ${endpoint} failed`);
    }
    return result.value;
  };
  return {
    getManifest: () => call('getManifest'),
    putManifest: manifest => call('putManifest', { manifest }),
    preflight: (projectId, activeWorkspaceId) => call('preflight', { projectId, activeWorkspaceId }),
  };
}

function roleLabel(t, role) {
  return role === 'readonly' ? t('readonly') : t('writable');
}

/** The preflight panel: the reason this plugin exists. */
function PreflightPanel({ plan, t, onRefresh, busy }) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async () => {
    const text = renderPlanText(plan, t);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable; the text is already visible on screen.
    }
  }, [plan, t]);

  if (plan === undefined) {
    return h('div', { className: 'loom-section' }, h('div', { className: 'loom-muted' }, t('running')));
  }

  return h('div', { className: 'loom-section' },
    h('div', { className: 'loom-section-title' },
      h('span', null, t('preflight')),
      h('button', { type: 'button', className: 'loom-btn', onClick: onRefresh, disabled: busy }, t('refresh')),
    ),
    h('div', { className: 'loom-muted' }, plan.writeBoundary.summary),

    // Skills, each with the folder that provides it.
    h('div', { className: 'loom-item' },
      h('div', { className: 'loom-item-name' }, `${t('skills')}（${plan.skills.length}）`),
      plan.skills.length === 0
        ? h('div', { className: 'loom-muted' }, t('noSkills'))
        : plan.skills.map(skill => h('div', { key: `${skill.workspaceId}:${skill.name}`, className: 'loom-item' },
            h('div', null, skill.name),
            h('div', { className: 'loom-src' }, `${t('from')} ${skill.workspaceId} — ${skill.path}`),
          )),
    ),

    // Collisions are surfaced, never hidden.
    plan.collisions.length > 0 && h('div', { className: 'loom-item' },
      h('div', { className: 'loom-item-name loom-warn-text' }, `${t('collisions')}（${plan.collisions.length}）`),
      h('div', { className: 'loom-muted' }, t('collisionHint')),
      plan.collisions.map(collision => h('div', { key: collision.name, className: 'loom-item' },
        h('div', null, collision.name),
        h('div', { className: 'loom-src' }, `${t('winner')}：${collision.winner.workspaceId}`),
        collision.shadowed.map(shadowed => h('div', { key: shadowed.workspaceId, className: 'loom-src loom-warn-text' },
          `${t('shadowed')}：${shadowed.workspaceId}`)),
      )),
    ),

    h('div', { className: 'loom-item' },
      h('div', { className: 'loom-item-name' }, `${t('instructions')}（${plan.instructions.length}）`),
      plan.instructions.length === 0
        ? h('div', { className: 'loom-muted' }, t('noInstructions'))
        : plan.instructions.map(instruction => h('div', { key: instruction.path, className: 'loom-src' },
            `${instruction.workspaceId} — ${instruction.path}（${instruction.bytes} B）`)),
    ),

    // The silent folders — the headline diagnostic.
    plan.silent.length > 0 && h('div', { className: 'loom-item' },
      h('div', { className: 'loom-item-name loom-warn-text' }, `${t('silentFolders')}（${plan.silent.length}）`),
      h('div', { className: 'loom-muted' }, t('silentHint')),
      plan.silent.map((entry, index) => h('div', { key: `${entry.workspaceId}-${index}`, className: 'loom-item' },
        h('div', null, entry.workspaceId),
        h('div', { className: 'loom-src' }, entry.detail),
      )),
    ),

    h('div', { className: 'loom-actions' },
      h('button', { type: 'button', className: 'loom-btn', onClick: copy }, copied ? t('copied') : t('copyPlan')),
    ),
  );
}

/** Plain-text rendering shared by the copy button and diagnostics. */
function renderPlanText(plan, t) {
  const lines = [];
  lines.push(`${plan.projectTitle} — ${interpolate(t('memberCount'), { count: plan.memberCount })}`);
  lines.push(`${t('writeScope')}: ${plan.writeBoundary.summary}`);
  lines.push('');
  lines.push(`${t('skills')} (${plan.skills.length})`);
  for (const skill of plan.skills) lines.push(`  · ${skill.name} ← ${skill.workspaceId} (${skill.path})`);
  if (plan.collisions.length > 0) {
    lines.push('');
    lines.push(`${t('collisions')} (${plan.collisions.length})`);
    for (const collision of plan.collisions) {
      lines.push(`  ! ${collision.name}`);
      lines.push(`      ${t('winner')}: ${collision.winner.workspaceId}`);
      for (const shadowed of collision.shadowed) lines.push(`      ${t('shadowed')}: ${shadowed.workspaceId}`);
    }
  }
  lines.push('');
  lines.push(`${t('instructions')} (${plan.instructions.length})`);
  for (const instruction of plan.instructions) lines.push(`  · ${instruction.workspaceId} — ${instruction.path} (${instruction.bytes} B)`);
  if (plan.silent.length > 0) {
    lines.push('');
    lines.push(`${t('silentFolders')} (${plan.silent.length})`);
    for (const entry of plan.silent) lines.push(`  · ${entry.workspaceId}: ${entry.detail}`);
  }
  return lines.join('\n');
}

/**
 * Project editor.
 *
 * A folder may be checked in ANY number of projects: there is no
 * "already claimed by another project" state, and no primary-folder radio,
 * because neither concept survives in the data model.
 */
function ProjectEditor({ project, workspaces, onSave, onClose, t }) {
  const [title, setTitle] = React.useState(project?.title ?? '');
  const [selected, setSelected] = React.useState(() => new Set((project?.members ?? []).map(m => m.workspaceId)));
  const [defaultId, setDefaultId] = React.useState(project?.defaultWorkspaceId ?? '');
  const [error, setError] = React.useState('');

  const toggle = workspaceId => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
    setError('');
  };

  const save = () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return setError(t('needName'));
    if (selected.size === 0) return setError(t('needFolder'));
    const members = workspaces.filter(workspace => selected.has(workspace.workspaceId))
      .map(workspace => ({ workspaceId: workspace.workspaceId, role: 'writable' }));
    onSave({
      id: project?.id ?? `loom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmed,
      members,
      defaultWorkspaceId: selected.has(defaultId) ? defaultId : members[0]?.workspaceId,
    });
    onClose();
  };

  return ReactDOM.createPortal(
    h('div', { className: 'loom-overlay', onMouseDown: event => { if (event.target === event.currentTarget) onClose(); } },
      h('div', { className: 'loom-modal', role: 'dialog', 'aria-modal': true },
        h('div', { className: 'loom-modal-title' }, project ? t('edit') : t('newProject')),

        h('div', { className: 'loom-field' },
          h('label', null, t('projectName')),
          h('input', { className: 'loom-input', value: title, maxLength: 80, onChange: event => { setTitle(event.target.value); setError(''); } }),
        ),

        h('div', { className: 'loom-field' },
          h('label', null, t('folders')),
          h('div', { className: 'loom-muted' }, t('preflightHint')),
          workspaces.map(workspace => h('div', { key: workspace.workspaceId, className: 'loom-member' },
            h('label', { className: 'loom-check' },
              h('input', { type: 'checkbox', checked: selected.has(workspace.workspaceId), onChange: () => toggle(workspace.workspaceId) }),
              h('span', null, workspace.title),
            ),
            h('span', { className: 'loom-member-path', title: workspace.path }, workspace.path),
            // Choosing a starting folder is a per-project preference, not a
            // rank: it never privileges one folder during discovery.
            h('label', { className: 'loom-check' },
              h('input', {
                type: 'radio',
                name: 'loom-default',
                checked: defaultId === workspace.workspaceId,
                disabled: !selected.has(workspace.workspaceId),
                onChange: () => setDefaultId(workspace.workspaceId),
              }),
              h('span', { className: 'loom-muted' }, '默认起点'),
            ),
          )),
        ),

        error.length > 0 && h('div', { className: 'loom-warn-text' }, error),

        h('div', { className: 'loom-actions' },
          h('button', { type: 'button', className: 'loom-btn', onClick: onClose }, t('cancel')),
          h('button', { type: 'button', className: 'loom-btn', onClick: save }, t('save')),
        ),
      ),
    ),
    document.body,
  );
}

/** Sidebar panel: project list plus the preflight for the selected project. */
function LoomPanel({ bridge, workspaces, t }) {
  const [manifest, setManifest] = React.useState(undefined);
  const [loadError, setLoadError] = React.useState('');
  const [unsupported, setUnsupported] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [plan, setPlan] = React.useState(undefined);
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    try {
      const value = await bridge.getManifest();
      setManifest(value.manifest);
      setLoadError(value.ok === false ? String(value.error ?? '') : '');
      setUnsupported(/newer than supported/.test(String(value.error ?? '')));
    } catch (error) {
      setLoadError(error.message);
    }
  }, [bridge]);

  React.useEffect(() => { void reload(); }, [reload]);

  const runPreflight = React.useCallback(async projectId => {
    setBusy(true);
    setPlan(undefined);
    try {
      const value = await bridge.preflight(projectId);
      setPlan(value.plan);
    } catch (error) {
      setLoadError(error.message);
      setPlan(undefined);
    } finally {
      setBusy(false);
    }
  }, [bridge]);

  const saveProject = React.useCallback(async project => {
    if (manifest === undefined) return;
    const projects = [...manifest.projects.filter(item => item.id !== project.id), project];
    try {
      const value = await bridge.putManifest({ schemaVersion: 2, projects });
      setManifest(value.manifest);
    } catch (error) {
      setLoadError(interpolate(t('saveFailed'), { message: error.message }));
    }
  }, [bridge, manifest, t]);

  const deleteProject = React.useCallback(async projectId => {
    if (manifest === undefined) return;
    try {
      const value = await bridge.putManifest({
        schemaVersion: 2,
        projects: manifest.projects.filter(item => item.id !== projectId),
      });
      setManifest(value.manifest);
      setPlan(undefined);
    } catch (error) {
      setLoadError(interpolate(t('saveFailed'), { message: error.message }));
    }
  }, [bridge, manifest, t]);

  const projects = manifest?.projects ?? [];

  return h('div', { className: 'loom-panel' },
    h('div', { className: 'loom-head' },
      h('span', { className: 'loom-title' }, t('projects')),
      h('button', { type: 'button', className: 'loom-btn', onClick: () => setEditing({}) }, t('newProject')),
    ),

    unsupported && h('div', { className: 'loom-warn-text' }, t('unsupported')),
    loadError.length > 0 && h('div', { className: 'loom-warn-text' }, interpolate(t('loadFailed'), { message: loadError })),

    projects.length === 0 && h('div', { className: 'loom-muted' }, t('noProjects')),

    projects.map(project => {
      const resolved = project.members.filter(member => member.missing !== true).length;
      return h('div', { key: project.id, className: 'loom-project' },
        h('div', { className: 'loom-project-head' },
          h('span', { className: 'loom-project-name' }, project.title),
          h('span', { className: 'loom-badge' }, interpolate(t('memberCount'), { count: project.members.length })),
        ),
        project.members.map(member => h('div', { key: member.workspaceId, className: 'loom-member' },
          h('span', null, member.workspaceId),
          h('span', { className: 'loom-badge' }, roleLabel(t, member.role)),
          member.missing === true && h('span', { className: 'loom-badge loom-badge-warn', title: t('missingHint') }, t('missing')),
        )),
        h('div', { className: 'loom-row' },
          h('button', { type: 'button', className: 'loom-btn', onClick: () => runPreflight(project.id), disabled: busy }, t('preflight')),
          h('button', { type: 'button', className: 'loom-btn', onClick: () => setEditing(project) }, t('edit')),
          h('button', { type: 'button', className: 'loom-btn', onClick: () => deleteProject(project.id) }, t('delete')),
        ),
        plan !== undefined && plan.projectId === project.id && h(PreflightPanel, {
          plan, t, busy, onRefresh: () => runPreflight(project.id),
        }),
      );
    }),

    editing !== null && h(ProjectEditor, {
      project: editing.id === undefined ? undefined : editing,
      workspaces,
      onSave: saveProject,
      onClose: () => setEditing(null),
      t,
    }),
  );
}

const name = 'dsh-loom';
const inject = ['slots', 'locale', 'workspaces', 'connection'];

/**
 * Bind the panel to the seats the slot machinery provides.
 *
 * The slot hands a component two standard props: `useWorkspaces` (the client
 * workspace store hook) and `t` (synthesized from the `locale` namespace named
 * on the registration). Reading them from props is required, not stylistic:
 * `ctx.locale` exposes `register`/`getLocale`/`setLocale` and has NO `t`, so
 * reaching for `ctx.locale.t(...)` throws on the first render.
 *
 * That distinction is expensive here. A slot entry that crashes mid-render is
 * ABDICATED — `SlotCore.reportEntryError` retires it from its cell and the
 * shipped `ui-workspace` browser is rendered instead. The panel then simply
 * never appears, with no visible error, which is exactly how this failed once.
 * So the seat check is defensive: a missing seat renders nothing rather than
 * throwing.
 */
function LoomPanelHost({ bridge }) {
  /** Mounted only once the seat is known to exist, so the hook is unconditional here. */
  function LoomPanelSeated({ useWorkspaces, t }) {
    const state = useWorkspaces(snapshot => snapshot);
    return h(LoomPanel, { bridge, workspaces: state?.items ?? [], t });
  }

  return function LoomPanelBound(props) {
    const { useWorkspaces, t } = props ?? {};
    if (typeof useWorkspaces !== 'function') return null;
    return h(LoomPanelSeated, {
      useWorkspaces,
      t: typeof t === 'function' ? t : key => key,
    });
  };
}

function apply(ctx) {
  ctx.effect(installStyles, 'dsh-loom: styles');
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-loom: dictionaries');

  const bridge = createBridge(ctx);
  const Panel = LoomPanelHost({ bridge });

  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
    name: 'sidebar.workspaces',
    priority: -100,
    locale: NS,
  }, Panel));
}

module.exports = { LoomPanel, PreflightPanel, ProjectEditor, apply, createBridge, inject, name, renderPlanText };

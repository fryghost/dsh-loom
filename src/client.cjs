/**
 * dsh-loom client half.
 *
 * Loom's whole point is that the context a project produces is VISIBLE before
 * you start a session. This half renders that:
 *
 *   - a project panel in the main column, reached from a sidebar icon;
 *   - a project editor where a folder may be added to any number of projects;
 *   - a preflight listing every skill with its source folder, every name
 *     collision with its shadowed losers, every instruction file, every folder
 *     that contributes nothing, and the real write boundary.
 *
 * The client holds no project data of its own: it reads and writes through the
 * host RPC channel, so Desktop and Web profiles agree.
 *
 * Styling is built on `@deepseek-ai/dsh-client-ui-primitives`, a platform
 * module the shell already seeds — so buttons, tags, state dots, and the modal
 * are the SAME atoms the shipped UI uses, at the same geometry (capsule r18/h36
 * buttons, 11px tag capsules, r24 dialog) rather than a look-alike. Only the
 * panel's own layout is local, and it too draws on `--dsw-*` tokens so it
 * follows the light/dark theme like a shipped surface.
 */

const React = require('react');
const {
  Button, Tag, StateDot, Modal, Input, IconFolderOpenOutline16,
} = require('@deepseek-ai/dsh-client-ui-primitives');

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
    subtitle: '把多个文件夹织成一个会话上下文。',
    emptyTitle: '还没有项目',
    emptyHint: '新建一个项目，指向两个或更多文件夹。它们的技能、指令与上下文会一起进入同一个会话。',
    memberList: '参与的文件夹',
    defaultStart: '默认起点',
    folderPicker: '勾选参与的文件夹',
    folderPickerHint: '文件夹可以同时属于多个项目。任何一个文件夹都可以作为默认起点，这不影响它能贡献什么。',
    writeBoundaryTitle: '写入范围',
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
    subtitle: 'Weave several folders into one session context.',
    emptyTitle: 'No projects yet',
    emptyHint: 'Create a project and point it at two or more folders. Their skills, instructions, and context enter one session together.',
    memberList: 'Folders',
    defaultStart: 'Starting point',
    folderPicker: 'Select the folders',
    folderPickerHint: 'A folder may belong to any number of projects. Any folder can be the starting point — that never affects what it contributes.',
    writeBoundaryTitle: 'Write scope',
  },
};

/**
 * Panel-local layout only.
 *
 * The atoms (Button, Tag, StateDot, Modal) carry their own styling. What is
 * left here follows the shell's own scale: 14px/22px body text, 16px/24px
 * headings at weight 500, 24px page padding, and 0.5px hairline borders —
 * matching `--dsw-alias-*` tokens rather than fixed colors.
 */
const STYLES = `
.loom-panel {
  height: 100%; overflow-y: auto;
  padding: 24px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px; line-height: 22px;
}
.loom-inner {
  display: flex; flex-direction: column; gap: 20px;
  width: 100%; max-width: 720px; margin: 0 auto;
}

.loom-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.loom-head-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.loom-h1 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.loom-sub { margin: 0; color: var(--dsw-alias-label-secondary); }

.loom-card {
  display: flex; flex-direction: column;
  border: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1);
  border-radius: 16px; overflow: hidden;
}
.loom-card-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 14px 16px;
}
.loom-card-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.loom-name {
  font-size: 15px; line-height: 22px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.loom-card-actions { display: flex; align-items: center; gap: 8px; flex: none; }

.loom-members { display: flex; flex-direction: column; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.loom-member { display: flex; align-items: center; gap: 8px; padding: 10px 16px; }
.loom-member + .loom-member { border-top: 0.5px solid var(--dsw-alias-border-l3); }
.loom-member-name { flex: none; }
.loom-member-path {
  flex: 1; min-width: 0;
  color: var(--dsw-alias-label-secondary); font-size: 13px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  direction: rtl; text-align: left;
}

.loom-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 48px 24px; text-align: center;
  border: 0.5px dashed var(--dsw-alias-border-l3); border-radius: 16px;
}
.loom-empty-title { font-size: 15px; font-weight: 500; }
.loom-empty-hint { color: var(--dsw-alias-label-secondary); max-width: 46ch; }

.loom-preflight {
  display: flex; flex-direction: column; gap: 16px;
  padding: 16px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
}
.loom-preflight-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.loom-boundary { color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }

.loom-section { display: flex; flex-direction: column; gap: 6px; }
.loom-section-title {
  font-size: 13px; line-height: 20px; font-weight: 500;
  display: flex; align-items: center; gap: 6px;
}
.loom-section-title.loom-warn { color: var(--dsw-alias-state-warn-primary); }
.loom-row { display: flex; align-items: baseline; gap: 8px; font-size: 13px; line-height: 20px; }
.loom-row + .loom-row { margin-top: 2px; }
.loom-src {
  color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px;
  word-break: break-all;
}
.loom-muted { color: var(--dsw-alias-label-secondary); font-size: 13px; }
.loom-warn { color: var(--dsw-alias-state-warn-primary); }

.loom-results { display: flex; flex-direction: column; gap: 12px; }
.loom-pre {
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; line-height: 18px;
  background: var(--dsw-alias-bg-base);
  border: 0.5px solid var(--dsw-alias-border-l3);
  padding: 10px 12px; border-radius: 8px;
  max-height: 260px; overflow: auto;
}

.loom-field { display: flex; flex-direction: column; gap: 8px; }
.loom-field-label { font-size: 13px; font-weight: 500; }
/* The Input atom owns its own chrome; only the width is local. */
.loom-input { width: 100%; }
.loom-picker {
  display: flex; flex-direction: column;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 12px; overflow: hidden;
  max-height: 300px; overflow-y: auto;
}
.loom-pick { display: flex; align-items: center; gap: 10px; padding: 10px 12px; font-size: 13px; }
.loom-pick + .loom-pick { border-top: 0.5px solid var(--dsw-alias-border-l3); }
.loom-check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
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
    report: event => call('report', event),
  };
}

/**
 * Report one client-side diagnostic to the host's log.
 *
 * A slot registration whose callback throws is retired SILENTLY: `slots.inject`
 * stops its controller and rethrows asynchronously, so nothing reaches the user
 * or the model. That failure mode is invisible by construction, so the client
 * states what it did and what went wrong. Diagnostics must never affect the
 * panel, so every failure here is swallowed.
 */
function report(bridge, event) {
  try {
    void bridge.report(event).catch(() => {});
  } catch {
    // Best-effort; the panel must not depend on reporting.
  }
}

/** Build the `slots.inject` callback for one contribution, reporting if it throws. */
function contribute(ctx, bridge, slot, options, component) {
  return () => {
    try {
      const dispose = ctx.slots.register(options, component);
      report(bridge, { event: 'register', slot, ok: true });
      return dispose;
    } catch (error) {
      report(bridge, {
        event: 'register',
        slot,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? String(error.stack ?? '').slice(0, 1200) : '',
      });
      throw error;
    }
  };
}

function roleLabel(t, role) {
  return role === 'readonly' ? t('readonly') : t('writable');
}

/**
 * Translate from the panel's own dictionaries against the active locale.
 *
 * Used when the slot supplies no `t` seat. The panel owns these dictionaries
 * anyway, so reading them directly is both exact and one less dependency.
 */
function localTranslate(ctx) {
  return (key, values) => {
    let active = 'en';
    try {
      active = ctx.locale.getLocale().active;
    } catch {
      // An unreadable locale falls back to English rather than blanking text.
    }
    const table = dictionaries[active] ?? dictionaries.en;
    const template = table?.[key] ?? dictionaries.en?.[key] ?? key;
    return values === undefined ? template : interpolate(template, values);
  };
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
    return h('div', { className: 'loom-preflight' },
      h('div', { className: 'loom-muted' }, t('running')));
  }

  return h('div', { className: 'loom-preflight' },
    h('div', { className: 'loom-preflight-head' },
      h('span', { className: 'loom-section-title' }, t('preflight')),
      h(Button, { variant: 'ghost', size: 'sm', onClick: onRefresh, disabled: busy }, t('refresh')),
    ),

    // The write boundary is stated, not implied.
    h('div', { className: 'loom-boundary' }, plan.writeBoundary.summary),

    h('div', { className: 'loom-results' },
      h('div', { className: 'loom-section' },
        h('div', { className: 'loom-section-title' }, `${t('skills')} · ${plan.skills.length}`),
        plan.skills.length === 0
          ? h('div', { className: 'loom-muted' }, t('noSkills'))
          : plan.skills.map(skill => h('div', { key: `${skill.workspaceId}:${skill.name}` },
              h('div', { className: 'loom-row' }, h('span', null, skill.name)),
              h('div', { className: 'loom-src' }, `${t('from')} ${skill.workspaceId} — ${skill.path}`),
            )),
      ),

      // Collisions are surfaced, never hidden.
      plan.collisions.length > 0 && h('div', { className: 'loom-section' },
        h('div', { className: 'loom-section-title loom-warn' }, `${t('collisions')} · ${plan.collisions.length}`),
        h('div', { className: 'loom-muted' }, t('collisionHint')),
        plan.collisions.map(collision => h('div', { key: collision.name },
          h('div', { className: 'loom-row' },
            h('span', null, collision.name),
            h(Tag, { tone: 'success' }, `${t('winner')} ${collision.winner.workspaceId}`),
          ),
          collision.shadowed.map(shadowed => h('div', { key: shadowed.workspaceId, className: 'loom-row' },
            h(Tag, { tone: 'warning' }, `${t('shadowed')} ${shadowed.workspaceId}`),
          )),
        )),
      ),

      h('div', { className: 'loom-section' },
        h('div', { className: 'loom-section-title' }, `${t('instructions')} · ${plan.instructions.length}`),
        plan.instructions.length === 0
          ? h('div', { className: 'loom-muted' }, t('noInstructions'))
          : plan.instructions.map(instruction => h('div', { key: instruction.path, className: 'loom-src' },
              `${instruction.workspaceId} — ${instruction.path} (${instruction.bytes} B)`)),
      ),

      // The silent folders — the headline diagnostic.
      plan.silent.length > 0 && h('div', { className: 'loom-section' },
        h('div', { className: 'loom-section-title loom-warn' }, `${t('silentFolders')} · ${plan.silent.length}`),
        h('div', { className: 'loom-muted' }, t('silentHint')),
        plan.silent.map((entry, index) => h('div', { key: `${entry.workspaceId}-${index}` },
          h('div', { className: 'loom-row' },
            h(StateDot, { state: 'warning' }),
            h('span', null, entry.workspaceId),
          ),
          h('div', { className: 'loom-src' }, entry.detail),
        )),
      ),
    ),

    h(Button, { variant: 'outline', size: 'sm', onClick: copy }, copied ? t('copied') : t('copyPlan')),
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

  return h(Modal, {
    open: true,
    onClose,
    title: project ? t('edit') : t('newProject'),
    closeLabel: t('cancel'),
    footer: h(React.Fragment, null,
      h(Button, { variant: 'outline', onClick: onClose }, t('cancel')),
      h(Button, { variant: 'primary', onClick: save }, t('save')),
    ),
  },
    h('div', { className: 'loom-field' },
      h('label', { className: 'loom-field-label', htmlFor: 'loom-title' }, t('projectName')),
      h(Input, {
        id: 'loom-title',
        className: 'loom-input',
        value: title,
        maxLength: 80,
        onChange: event => { setTitle(event.target.value); setError(''); },
      }),
    ),

    h('div', { className: 'loom-field' },
      h('label', { className: 'loom-field-label' }, t('folderPicker')),
      h('div', { className: 'loom-muted' }, t('folderPickerHint')),
      h('div', { className: 'loom-picker' },
        workspaces.map(workspace => h('div', { key: workspace.workspaceId, className: 'loom-pick' },
          h('label', { className: 'loom-check' },
            h('input', { type: 'checkbox', checked: selected.has(workspace.workspaceId), onChange: () => toggle(workspace.workspaceId) }),
            h('span', { className: 'loom-member-name' }, workspace.title),
          ),
          h('span', { className: 'loom-member-path', title: workspace.path }, workspace.path),
          // Choosing a starting folder is a per-project preference, not a
          // rank: it never privileges one folder during discovery.
          h('label', { className: 'loom-check', title: t('defaultStart') },
            h('input', {
              type: 'radio',
              name: 'loom-default',
              checked: defaultId === workspace.workspaceId,
              disabled: !selected.has(workspace.workspaceId),
              onChange: () => setDefaultId(workspace.workspaceId),
            }),
            h('span', { className: 'loom-muted' }, t('defaultStart')),
          ),
        )),
      ),
    ),

    error.length > 0 && h('div', { className: 'loom-warn' }, error),
  );
}

/** Main panel: project list plus the preflight for the selected project. */
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
    h('div', { className: 'loom-inner' },
      h('div', { className: 'loom-head' },
        h('div', { className: 'loom-head-text' },
          h('h1', { className: 'loom-h1' }, t('projects')),
          h('p', { className: 'loom-sub' }, t('subtitle')),
        ),
        h(Button, { variant: 'primary', onClick: () => setEditing({}) }, t('newProject')),
      ),

      unsupported && h('div', { className: 'loom-warn' }, t('unsupported')),
      loadError.length > 0 && h('div', { className: 'loom-warn' }, interpolate(t('loadFailed'), { message: loadError })),

      projects.length === 0
        ? h('div', { className: 'loom-empty' },
            h('div', { className: 'loom-empty-title' }, t('emptyTitle')),
            h('div', { className: 'loom-empty-hint' }, t('emptyHint')),
            h(Button, { variant: 'outline', onClick: () => setEditing({}) }, t('newProject')),
          )
        : projects.map(project => h('div', { key: project.id, className: 'loom-card' },
            h('div', { className: 'loom-card-head' },
              h('div', { className: 'loom-card-title' },
                h('span', { className: 'loom-name' }, project.title),
                h(Tag, null, interpolate(t('memberCount'), { count: project.members.length })),
              ),
              h('div', { className: 'loom-card-actions' },
                h(Button, { variant: 'outline', size: 'sm', onClick: () => runPreflight(project.id), disabled: busy }, t('preflight')),
                h(Button, { variant: 'ghost', size: 'sm', onClick: () => setEditing(project) }, t('edit')),
                h(Button, { variant: 'ghost', size: 'sm', onClick: () => deleteProject(project.id) }, t('delete')),
              ),
            ),

            // Every member is listed, including the ones that contribute
            // nothing: a member that resolved but added no skill is exactly
            // what the preflight exists to expose.
            h('div', { className: 'loom-members' },
              project.members.map(member => h('div', { key: member.workspaceId, className: 'loom-member' },
                h(StateDot, { state: member.missing === true ? 'warning' : 'done' }),
                h('span', { className: 'loom-member-name' }, member.workspaceId),
                h('span', { className: 'loom-member-path', title: member.path }, member.path ?? ''),
                h(Tag, { tone: member.role === 'readonly' ? 'quiet' : 'neutral' }, roleLabel(t, member.role)),
                member.missing === true && h(Tag, { tone: 'warning' }, t('missing')),
              )),
            ),

            plan !== undefined && plan.projectId === project.id && h(PreflightPanel, {
              plan, t, busy, onRefresh: () => runPreflight(project.id),
            }),
          )),

      editing !== null && h(ProjectEditor, {
        project: editing.id === undefined ? undefined : editing,
        workspaces,
        onSave: saveProject,
        onClose: () => setEditing(null),
        t,
      }),
    ),
  );
}

const name = 'dsh-loom';
const inject = ['slots', 'locale', 'workspaces', 'connection'];

/**
 * Bind the panel to the seats the slot machinery provides.
 *
 * A slot hands its component two standard props: `useWorkspaces` (the client
 * workspace store hook) and `t` (synthesized from the `locale` namespace named
 * on the registration). Reading them from props is required, not stylistic:
 * `ctx.locale` exposes `register`/`getLocale`/`setLocale` and has NO `t`, so
 * reaching for `ctx.locale.t(...)` throws on the first render.
 *
 * That distinction is expensive here. A slot entry that crashes mid-render is
 * ABDICATED — `SlotCore.reportEntryError` retires it from its cell — so the
 * panel would simply never appear, with no visible error. The seat check is
 * therefore defensive: a missing seat renders nothing rather than throwing.
 */
function LoomPanelHost({ bridge, ctx }) {
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
      // The panel owns its dictionaries, so it translates from them directly
      // against the active locale. That keeps the `t` seat optional: the main
      // registration carries no `locale`, because no shipped example passes one
      // to `main` and the panel must not depend on a seat it may not be given.
      t: typeof t === 'function' ? t : localTranslate(ctx),
    });
  };
}

/**
 * The sidebar entry's icon.
 *
 * `sidebar.panellist` supplies `{ size, active }`. A shipped icon is used
 * rather than a hand-drawn one so the glyph matches the family's 16px grid and
 * weight exactly; `currentColor` keeps the shell in charge of color states.
 */
function LoomIcon({ size, active }) {
  const edge = typeof size === 'number' ? size : 16;
  return h('span', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: active === false ? 0.7 : 1,
    },
  }, h(IconFolderOpenOutline16, { size: edge }));
}

/**
 * Loom registers its own MAIN PANEL, addressed by a sidebar entry.
 *
 * It deliberately does NOT register into `sidebar.workspaces`. That seat is
 * `kind: "single"` with `replaceRisk: "shadows-shipped-ui"`, so claiming it
 * REPLACES the shipped workspace/session browser rather than adding to it: the
 * session list vanishes and the user loses their navigation. The additive shape
 * is a `sidebar.panellist` entry whose id addresses a `main` key — which is
 * exactly how the shell pairs an icon with a centre panel.
 *
 * `main` is keyed and only `conversation` is reserved, so `loom` sits beside
 * the Conversation without touching it.
 */
function apply(ctx) {
  ctx.effect(installStyles, 'dsh-loom: styles');
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-loom: dictionaries');

  const bridge = createBridge(ctx);
  const Panel = LoomPanelHost({ bridge, ctx });

  /** Read a slot fact without letting a missing method break the diagnostic. */
  const probe = read => {
    try {
      return read();
    } catch (error) {
      return `error: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  report(bridge, {
    event: 'apply',
    ok: true,
    hasSlots: ctx.slots !== undefined,
    hasInject: typeof ctx.slots?.inject === 'function',
    hasRegister: typeof ctx.slots?.register === 'function',
    // Timing matters: `slots.inject` returns early while a slot is undeclared,
    // so a spec that is missing here means the declaration lands later.
    mainSpec: probe(() => ctx.slots.spec('main') !== undefined),
    mainEpoch: probe(() => ctx.slots.declarationEpoch('main')),
    panellistSpec: probe(() => ctx.slots.spec('sidebar.panellist') !== undefined),
    panellistEpoch: probe(() => ctx.slots.declarationEpoch('sidebar.panellist')),
  });

  // A thunk is re-read on every projection, so the label follows the active
  // locale without re-registering.
  const label = () => {
    try {
      return ctx.locale.getLocale().active === 'zh' ? '项目' : 'Projects';
    } catch {
      return 'Projects';
    }
  };

  // Both registrations are reported. `slots.inject` retires a throwing
  // contribution silently, so an unreported failure looks exactly like "the
  // user never clicked the icon".
  try {
    ctx.slots.inject('main', contribute(ctx, bridge, 'main',
      // No `locale`: the panel translates from its own dictionaries, and no
      // shipped `main` registration passes a namespace to a keyed panel slot.
      { name: 'main', key: 'loom' }, Panel));
    report(bridge, { event: 'inject', slot: 'main', ok: true });
  } catch (error) {
    report(bridge, {
      event: 'inject',
      slot: 'main',
      ok: false,
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? '').slice(0, 1200),
    });
  }

  try {
    ctx.slots.inject('sidebar.panellist', contribute(ctx, bridge, 'sidebar.panellist',
      { name: 'sidebar.panellist', id: 'loom', order: 40, locale: NS, label }, LoomIcon));
    report(bridge, { event: 'inject', slot: 'sidebar.panellist', ok: true });
  } catch (error) {
    report(bridge, {
      event: 'inject',
      slot: 'sidebar.panellist',
      ok: false,
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? '').slice(0, 1200),
    });
  }
}

module.exports = { LoomIcon, LoomPanel, PreflightPanel, ProjectEditor, apply, createBridge, inject, name, renderPlanText };
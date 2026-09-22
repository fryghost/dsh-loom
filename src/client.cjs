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
    subtitle: '把多个文件夹织成一个会话上下文。',
    emptyTitle: '还没有项目',
    emptyHint: '新建一个项目，指向两个或更多文件夹。它们的技能、指令与上下文会一起进入同一个会话。',
    memberList: '参与的文件夹',
    defaultStart: '默认起点',
    folderPicker: '勾选参与的文件夹',
    folderPickerHint: '文件夹可以同时属于多个项目。任何一个文件夹都可以作为默认起点，这不影响它能贡献什么。',
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
  },
};

/**
 * Styling uses the shell's own alias tokens rather than hardcoded colors, so
 * the panel follows the active light/dark theme like a shipped surface. The
 * measured space is a MAIN PANEL, not the sidebar: generous padding, a readable
 * line length, and one card per project.
 */
const STYLES = `
.loom-panel {
  display: flex; flex-direction: column; gap: 20px;
  padding: 24px 28px 32px; height: 100%; overflow-y: auto;
  color: var(--dsw-alias-label-primary);
  font-size: 13px; line-height: 1.6;
}
.loom-inner { display: flex; flex-direction: column; gap: 20px; width: 100%; max-width: 760px; }

.loom-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.loom-head-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.loom-h1 { font-size: 17px; font-weight: 600; letter-spacing: .01em; margin: 0; }
.loom-sub { color: var(--dsw-alias-label-secondary); font-size: 12.5px; }

.loom-btn {
  appearance: none; display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: 8px; padding: 5px 11px;
  font: inherit; font-size: 12.5px; white-space: nowrap; cursor: pointer;
  transition: background .12s ease, border-color .12s ease;
}
.loom-btn:hover { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.loom-btn:disabled { opacity: .45; cursor: default; }
.loom-btn-primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; }
.loom-btn-primary:hover { background: var(--dsw-alias-brand-primary); filter: brightness(1.08); }
.loom-btn-quiet { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); }
.loom-btn-quiet:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

.loom-card {
  display: flex; flex-direction: column; gap: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  border-radius: 12px; overflow: hidden;
}
.loom-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
.loom-card-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.loom-name { font-size: 14px; font-weight: 600; }
.loom-card-actions { display: flex; align-items: center; gap: 8px; flex: none; }

.loom-members { display: flex; flex-direction: column; border-top: 1px solid var(--dsw-alias-border-l1); }
.loom-member {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 16px; font-size: 12.5px;
}
.loom-member + .loom-member { border-top: 1px solid var(--dsw-alias-border-l1); }
.loom-member-name { flex: none; }
.loom-member-path {
  color: var(--dsw-alias-label-secondary); font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1;
}
.loom-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); flex: none; }
.loom-dot-warn { background: var(--dsw-alias-state-warn-primary); }

.loom-badge {
  flex: none; font-size: 11px; line-height: 1.5;
  border-radius: 999px; padding: 1px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.loom-badge-warn { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }

.loom-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 44px 24px; text-align: center;
  border: 1px dashed var(--dsw-alias-border-l1); border-radius: 12px;
}
.loom-empty-title { font-size: 14px; font-weight: 600; }
.loom-empty-hint { color: var(--dsw-alias-label-secondary); font-size: 12.5px; max-width: 42ch; }

.loom-preflight { display: flex; flex-direction: column; gap: 16px; border-top: 1px solid var(--dsw-alias-border-l1); padding: 16px; background: var(--dsw-alias-bg-layer-2); }
.loom-preflight-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.loom-preflight-title { font-size: 13px; font-weight: 600; }
.loom-boundary { display: flex; gap: 8px; align-items: flex-start; color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.loom-section { display: flex; flex-direction: column; gap: 6px; }
.loom-section-title { font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.loom-section-title.loom-warn-text { color: var(--dsw-alias-state-warn-primary); }
.loom-item { display: flex; flex-direction: column; gap: 1px; padding: 5px 0; }
.loom-item + .loom-item { border-top: 1px solid var(--dsw-alias-border-l1); }
.loom-item-name { font-size: 12.5px; font-weight: 600; }
.loom-item-name.loom-warn-text { color: var(--dsw-alias-state-warn-primary); }
.loom-src { color: var(--dsw-alias-label-secondary); font-size: 12px; word-break: break-all; }
.loom-muted { color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.loom-warn-text { color: var(--dsw-alias-state-warn-primary); }
.loom-pre {
  white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; line-height: 1.55;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1);
  padding: 10px 12px; border-radius: 8px; max-height: 260px; overflow: auto;
}

.loom-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: color-mix(in srgb, #000 48%, transparent);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.loom-modal {
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px; padding: 20px;
  width: min(620px, 100%); max-height: 84vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: 16px;
  box-shadow: 0 18px 48px color-mix(in srgb, #000 32%, transparent);
}
.loom-modal-title { font-size: 15px; font-weight: 600; }
.loom-field { display: flex; flex-direction: column; gap: 6px; }
.loom-field > label { font-size: 12.5px; font-weight: 600; }
.loom-input {
  font: inherit; font-size: 13px; padding: 7px 10px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
}
.loom-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.loom-picker {
  display: flex; flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden;
  max-height: 320px; overflow-y: auto;
}
.loom-pick { display: flex; align-items: center; gap: 10px; padding: 9px 12px; font-size: 12.5px; }
.loom-pick + .loom-pick { border-top: 1px solid var(--dsw-alias-border-l1); }
.loom-check { display: flex; align-items: center; gap: 7px; cursor: pointer; }
.loom-actions { display: flex; justify-content: flex-end; gap: 8px; }
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
    return h('div', { className: 'loom-preflight' }, h('div', { className: 'loom-muted' }, t('running')));
  }

  return h('div', { className: 'loom-preflight' },
    h('div', { className: 'loom-preflight-head' },
      h('span', { className: 'loom-preflight-title' }, t('preflight')),
      h('button', { type: 'button', className: 'loom-btn loom-btn-quiet', onClick: onRefresh, disabled: busy }, t('refresh')),
    ),
    h('div', { className: 'loom-boundary' }, plan.writeBoundary.summary),

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
          h('label', null, t('folderPicker')),
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
    h('div', { className: 'loom-inner' },
      h('div', { className: 'loom-head' },
        h('div', { className: 'loom-head-text' },
          h('h1', { className: 'loom-h1' }, t('projects')),
          h('div', { className: 'loom-sub' }, t('subtitle')),
        ),
        h('button', { type: 'button', className: 'loom-btn loom-btn-primary', onClick: () => setEditing({}) }, t('newProject')),
      ),

      unsupported && h('div', { className: 'loom-warn-text' }, t('unsupported')),
      loadError.length > 0 && h('div', { className: 'loom-warn-text' }, interpolate(t('loadFailed'), { message: loadError })),

      projects.length === 0
        ? h('div', { className: 'loom-empty' },
            h('div', { className: 'loom-empty-title' }, t('emptyTitle')),
            h('div', { className: 'loom-empty-hint' }, t('emptyHint')),
            h('button', { type: 'button', className: 'loom-btn loom-btn-primary', onClick: () => setEditing({}) }, t('newProject')),
          )
        : projects.map(project => h('div', { key: project.id, className: 'loom-card' },
            h('div', { className: 'loom-card-head' },
              h('div', { className: 'loom-card-title' },
                h('span', { className: 'loom-name' }, project.title),
                h('span', { className: 'loom-badge' }, interpolate(t('memberCount'), { count: project.members.length })),
              ),
              h('div', { className: 'loom-card-actions' },
                h('button', { type: 'button', className: 'loom-btn', onClick: () => runPreflight(project.id), disabled: busy }, t('preflight')),
                h('button', { type: 'button', className: 'loom-btn loom-btn-quiet', onClick: () => setEditing(project) }, t('edit')),
                h('button', { type: 'button', className: 'loom-btn loom-btn-quiet', onClick: () => deleteProject(project.id) }, t('delete')),
              ),
            ),

            // Every member is listed, including the ones that contribute
            // nothing: a member that resolved but added no skill is exactly
            // what the preflight exists to expose.
            h('div', { className: 'loom-members' },
              project.members.map(member => h('div', { key: member.workspaceId, className: 'loom-member' },
                h('span', {
                  className: member.missing === true ? 'loom-dot loom-dot-warn' : 'loom-dot',
                  title: member.missing === true ? t('missingHint') : undefined,
                }),
                h('span', { className: 'loom-member-name' }, member.workspaceId),
                h('span', { className: 'loom-member-path', title: member.path }, member.path ?? ''),
                h('span', { className: 'loom-badge' }, roleLabel(t, member.role)),
                member.missing === true && h('span', { className: 'loom-badge loom-badge-warn' }, t('missing')),
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

/**
 * The sidebar entry's icon.
 *
 * `sidebar.panellist` supplies `{ size, active }`. Interlaced threads — the
 * loom the panel is named for — drawn with `currentColor` so the shell keeps
 * ownership of the color and the selected/unselected states.
 */
function LoomIcon({ size, active }) {
  const edge = typeof size === 'number' ? size : 16;
  return h('svg', {
    width: edge, height: edge, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': 'true', focusable: 'false',
    style: { opacity: active === false ? 0.7 : 1 },
  },
    h('path', { d: 'M4 8.5h16' }),
    h('path', { d: 'M4 15.5h16' }),
    h('path', { d: 'M8.5 4v16' }),
    h('path', { d: 'M15.5 4v16' }),
  );
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
  const Panel = LoomPanelHost({ bridge });

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: 'loom',
    locale: NS,
  }, Panel));

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: 'loom',
    order: 40,
    locale: NS,
    // A thunk is re-read on every projection, so the label follows the active
    // locale without re-registering.
    label: () => {
      try {
        return ctx.locale.getLocale().active === 'zh' ? '项目' : 'Projects';
      } catch {
        return 'Projects';
      }
    },
  }, LoomIcon));
}

module.exports = { LoomIcon, LoomPanel, PreflightPanel, ProjectEditor, apply, createBridge, inject, name, renderPlanText };

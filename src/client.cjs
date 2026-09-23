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
  Button, Tag, StateDot, Modal, Input, Menu,
  IconFolderOpenOutline16, IconPlusOutline16, IconChevronDownOutline14,
  IconEllipsisOutline16, IconEditOutline16, IconTrashOutline16,
  IconBranchOutline16, IconArchiveOutline20,
} = require('@deepseek-ai/dsh-client-ui-primitives');

const h = React.createElement;

const NS = 'dsh-loom';
const CHANNEL = '/dsh-loom';
const { deriveSections } = require('./core/sections.cjs');

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
    sectionProjects: '项目',
    sectionWorkspaces: '工作区',
    sectionChats: '聊天',
    newChat: '新对话',
    searchPlaceholder: '搜索会话',
    showMore: '展开其余 {count} 个会话',
    showLess: '收起',
    untitled: '未命名会话',
    noSessions: '还没有会话',
    noWorkspaces: '没有未归入项目的工作区',
    noChats: '没有未归属的会话',
    noMatches: '没有匹配的会话',
    justNow: '刚刚',
    minutesAgo: '{count} 分钟',
    hoursAgo: '{count} 小时',
    daysAgo: '{count} 天',
    folderCount: '{count} 个文件夹',
    rename: '重命名',
    fork: '创建分支',
    archive: '归档',
    sessionActions: '会话操作',
    renameSession: '重命名会话',
    archiveHint: '归档只是把它从这些列表里收起来，会话记录不会删除。',
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
    sectionProjects: 'Projects',
    sectionWorkspaces: 'Workspaces',
    sectionChats: 'Chats',
    newChat: 'New chat',
    searchPlaceholder: 'Search sessions',
    showMore: 'Show {count} more',
    showLess: 'Show less',
    untitled: 'Untitled session',
    noSessions: 'No sessions yet',
    noWorkspaces: 'No workspaces outside a project',
    noChats: 'No unattributed sessions',
    noMatches: 'No matching sessions',
    justNow: 'just now',
    minutesAgo: '{count}m',
    hoursAgo: '{count}h',
    daysAgo: '{count}d',
    folderCount: '{count} folders',
    rename: 'Rename',
    fork: 'Fork',
    archive: 'Archive',
    sessionActions: 'Session actions',
    renameSession: 'Rename session',
    archiveHint: 'Archiving only hides it from these lists; the session log is kept.',
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
  font-size: 14px; line-height: 20px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.loom-card-actions { display: flex; align-items: center; gap: 8px; flex: none; }

.loom-members { display: flex; flex-direction: column; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.loom-member { display: flex; align-items: center; gap: 8px; padding: 10px 16px; }
.loom-member + .loom-member { border-top: 0.5px solid var(--dsw-alias-border-l3); }
.loom-member-name { flex: none; }
/* Normal left-to-right truncation. A reversed direction showed the tail of a
   long path but rendered as a torn fragment ("…seek\\dsh-project"), which read
   as breakage rather than as an ellipsis. */
.loom-member-path {
  flex: 1; min-width: 0;
  color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 20px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.loom-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 48px 24px; text-align: center;
  border: 0.5px dashed var(--dsw-alias-border-l3); border-radius: 16px;
}
.loom-empty-title { font-size: 14px; line-height: 20px; font-weight: 500; }
.loom-empty-hint { color: var(--dsw-alias-label-secondary); max-width: 46ch; }

.loom-preflight {
  display: flex; flex-direction: column; gap: 16px;
  padding: 16px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-2);
}
.loom-preflight-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.loom-boundary { color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }

.loom-section { display: flex; flex-direction: column; gap: 6px; }
.loom-section-title {
  font-size: 12px; line-height: 20px; font-weight: 500;
  display: flex; align-items: center; gap: 6px;
}
.loom-section-title.loom-warn { color: var(--dsw-alias-state-warn-primary); }
.loom-row { display: flex; align-items: baseline; gap: 8px; font-size: 14px; line-height: 20px; }
.loom-row + .loom-row { margin-top: 2px; }
.loom-src {
  color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px;
  word-break: break-all;
}
.loom-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 20px; }
.loom-warn { color: var(--dsw-alias-state-warn-primary); font-size: 12px; line-height: 20px; }

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

/* ── project editor ──────────────────────────────────────────────────
   A Modal card is 380px wide, which is sized for a short form. A folder picker
   needs a name AND a path per row, so this one is wider; doubling the class
   raises specificity above the atom's own .dialog rule whatever the order the
   two stylesheets load in. */
.loom-editor.loom-editor { width: min(560px, 100%); }

.loom-field { display: flex; flex-direction: column; gap: 6px; }
.loom-field + .loom-field { margin-top: 20px; }
.loom-field-label { font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
/* The Input atom owns the field's chrome — including the inline-flex wrapper
   whose inner field fills it via flex: 1. Setting display: block here broke
   that flex context, so the field stayed at its intrinsic width. Only the OUTER
   dimension belongs to us. (No backticks in this comment: the whole block is
   itself a template literal, and one would end it early.) */
.loom-input { width: 100%; }

/* Anything we give a width OR a border to must count that padding and border
   INSIDE the width. The Input atom's wrapper carries 8px of side padding and a
   hairline border but sets no box-sizing, so width: 100% made it 17px wider
   than its container. That single omission is why the search field bled past
   the sidebar's padding AND why the project-name field overhung the folder
   list beneath it — one cause, two symptoms.
   (No backticks anywhere in this block: it is itself a template literal.) */
.loom-input,
.loom-picker { box-sizing: border-box; }

/* Two lines per row: the name, then the path beneath it in tertiary.
   Fitting checkbox + name + path + a radio onto ONE line is what made this
   cramped, and it forced the path into a reversed-direction truncation that
   rendered as a torn-off fragment like "…seek\\dsh-project". */
.loom-picker {
  display: flex; flex-direction: column;
  max-height: 320px; overflow-y: auto;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 12px;
}
.loom-pick {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; cursor: pointer;
}
.loom-pick + .loom-pick { border-top: 0.5px solid var(--dsw-alias-border-l3); }
.loom-pick:hover { background: var(--dsw-alias-interactive-bg-hover); }
.loom-pick-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.loom-pick-name {
  font-size: 14px; line-height: 20px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.loom-pick-path {
  font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.loom-pick-default {
  flex: none; display: flex; align-items: center; gap: 6px;
  font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary);
}
.loom-check { display: flex; align-items: center; gap: 6px; cursor: pointer; }

/* ── sidebar browser: 项目 / 工作区 / 聊天 ─────────────────────────
   TWO rules govern this block. Both come from the shipped surfaces rather than
   from taste, because inventing either is what made it read as arbitrary.

   1. TYPE SCALE — exactly three sizes, one job each:
        12px/20px   section labels, counts, timestamps, "show more" (secondary)
        14px/20px   every row title — group and session alike      (primary)
        16px/24px   the main panel's heading
      The previous mix (11/12/12.5/13/14/15/16/17) had no relationship between
      size and role; that is precisely what "字号不一致，没有逻辑" described.

   2. TREE — parent/child is DRAWN, not implied:
        · a 34px group row whose leading 16px slot carries the twisty;
        · the session list indented to the twisty's CENTRE and joined to it by a
          hairline guide, so sessions visibly hang off their group;
        · every step is 8px (8 → 16 → 24), so depth needs no guesswork.
      A flat list distinguished only by a larger left padding — what this
      replaced — showed no structure at all. */
.loom-sidebar {
  display: flex; flex-direction: column;
  height: 100%; overflow-y: auto;
  padding: 8px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px; line-height: 20px;
}
.loom-search { padding: 0 0 8px; }

.loom-section-head { display: flex; align-items: center; gap: 2px; margin-top: 12px; padding: 0 4px; }
.loom-section-head:first-of-type { margin-top: 4px; }
.loom-section-title {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 4px;
  height: 28px; padding: 0 4px;
  border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; text-align: left;
  font-size: 12px; line-height: 20px; font-weight: 500;
}
.loom-section-title:hover { color: var(--dsw-alias-label-primary); }
.loom-section-count { font-weight: 400; color: var(--dsw-alias-label-tertiary); }

.loom-group { display: flex; flex-direction: column; }
.loom-group-head {
  display: flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 8px;
  border-radius: 8px; cursor: pointer; user-select: none;
}
.loom-group-head:hover { background: var(--dsw-alias-interactive-bg-hover); }
.loom-group-name {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 14px; line-height: 20px;
}

/* The 16px leading slot every row in the shipped browser has. It is what the
   twisty, the status dot, and the indent all align to. */
.loom-slot {
  flex: none; width: 16px; height: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-tertiary);
}
.loom-twisty { flex: none; display: inline-flex; transition: transform 150ms var(--ds-ease-in-out); }
.loom-twisty-collapsed { transform: rotate(-90deg); }

/* Sessions hang off their group: indented to the twisty's centre (16px) and
   joined to it by a hairline, so membership is visible rather than implied. */
.loom-children {
  display: flex; flex-direction: column;
  margin-left: 15px; padding-left: 7px;
  border-left: 1px solid var(--dsw-alias-border-l2);
}

.loom-row {
  display: flex; align-items: center; gap: 0;
  width: 100%; height: 32px; padding: 0 8px;
  border: none; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-primary);
  cursor: pointer; text-align: left; user-select: none;
  font-size: 14px; line-height: 20px;
}
.loom-row:hover,
.loom-row-current { background: var(--dsw-alias-interactive-bg-hover); }
.loom-title {
  flex: 1; min-width: 0; margin: 0 6px 0 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.loom-time { flex: none; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }

/* Actions are bare 16px glyphs at gap 12, and they TAKE THE TIMESTAMP'S PLACE
   so a row never reflows as the pointer crosses it. */
.loom-actions { display: none; align-items: center; gap: 12px; flex: none; }
.loom-row:hover .loom-actions,
.loom-row:focus-within .loom-actions,
.loom-group-head:hover .loom-actions,
.loom-group-head:focus-within .loom-actions { display: inline-flex; }
.loom-row:hover .loom-time,
.loom-group-head:hover .loom-time { display: none; }
.loom-icon-btn {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; padding: 0; border: none; border-radius: 4px;
  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;
}
.loom-icon-btn:hover { color: var(--dsw-alias-label-primary); }

.loom-more {
  height: 28px; padding: 0 8px;
  border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer; text-align: left;
  font-size: 12px; line-height: 20px;
}
.loom-more:hover { color: var(--dsw-alias-label-primary); }
.loom-empty-section { padding: 2px 8px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 20px; }
.loom-warn-note { padding: 2px 8px; color: var(--dsw-alias-state-warn-primary); font-size: 12px; line-height: 20px; }
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
    // A wider card than the atom's 380px default: each row carries a name and a
    // path, which is a two-column problem the default width cannot hold.
    className: 'loom-editor',
    description: t('folderPickerHint'),
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
        'aria-label': t('projectName'),
        onChange: event => { setTitle(event.target.value); setError(''); },
      }),
    ),

    h('div', { className: 'loom-field' },
      h('div', { className: 'loom-field-label' }, t('folderPicker')),
      h('div', { className: 'loom-picker' },
        // The whole row is a label, so clicking anywhere toggles membership —
        // only the radio is a separate target.
        workspaces.map(workspace => h('label', {
          key: workspace.workspaceId,
          className: 'loom-pick',
        },
          h('input', {
            type: 'checkbox',
            checked: selected.has(workspace.workspaceId),
            onChange: () => toggle(workspace.workspaceId),
          }),
          h('span', { className: 'loom-pick-text' },
            h('span', { className: 'loom-pick-name' }, workspace.title),
            h('span', { className: 'loom-pick-path', title: workspace.path }, workspace.path),
          ),
          // The starting folder is a per-project preference, not a rank: it
          // never privileges one folder during discovery. It only appears for a
          // member, because a folder that is not in the project cannot be its
          // starting point — a disabled radio on every row was pure noise.
          selected.has(workspace.workspaceId) && h('span', {
            className: 'loom-pick-default',
            title: t('defaultStart'),
          },
            h('input', {
              type: 'radio',
              name: 'loom-default',
              checked: defaultId === workspace.workspaceId,
              onChange: () => setDefaultId(workspace.workspaceId),
            }),
            t('defaultStart'),
          ),
        )),
      ),
    ),

    error.length > 0 && h('div', { className: 'loom-warn-note' }, error),
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
// `sessions` and `uiWorkspace` are hard dependencies: the browser's whole point
// is navigating to a session, and the navigation face is what clears the panel.
const inject = ['slots', 'locale', 'workspaces', 'sessions', 'uiWorkspace', 'connection'];

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

/** Compact age for a session row, in the panel's own copy. */
function sessionTime(summary, t) {
  const at = summary?.updatedAt;
  if (typeof at !== 'number') return '';
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return t('justNow');
  if (minutes < 60) return interpolate(t('minutesAgo'), { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return interpolate(t('hoursAgo'), { count: hours });
  return interpolate(t('daysAgo'), { count: Math.round(hours / 24) });
}

/**
 * One session row — the selectable conversation inside a section.
 *
 * A `div` with `role="treeitem"`, not a `button`: the row contains its own
 * ellipsis button, and a button inside a button is invalid.
 *
 * The menu is the shipped shape — ONE ellipsis opening rename / fork / archive.
 * Two inline glyphs (what this had) is neither the shipped affordance nor
 * enough room for the third verb.
 */
function SessionRow({ summary, current, onClick, onRename, onFork, onArchive, t }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const title = summary.displayTitle || t('untitled');
  // A blank row is provisional: nothing has happened in it, so a timestamp and
  // the row verbs would all act on content that does not exist yet.
  const settled = summary.blank !== true;

  const items = [
    { id: 'rename', label: t('rename'), icon: h(IconEditOutline16, null) },
    { id: 'fork', label: t('fork'), icon: h(IconBranchOutline16, null) },
    { id: 'archive', label: t('archive'), icon: h(IconArchiveOutline20, { size: 16 }) },
  ];

  return h('div', {
    role: 'treeitem',
    tabIndex: 0,
    'aria-selected': current === true,
    className: current === true ? 'loom-row loom-row-current' : 'loom-row',
    title,
    onClick,
    onKeyDown: event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    },
  },
    h('span', { className: 'loom-slot' },
      summary.running === true ? h(StateDot, { state: 'ongoing', size: 10 }) : null),
    h('span', { className: 'loom-title' }, title),

    settled && h('span', { className: 'loom-time' }, sessionTime(summary, t)),
    // Actions take the timestamp's place, so the row does not reflow on hover.
    settled && h('span', { className: 'loom-actions' },
      h(Menu, {
        open: menuOpen,
        onClose: () => setMenuOpen(false),
        items,
        onSelect: id => {
          setMenuOpen(false);
          if (id === 'rename') onRename(summary.id, title);
          if (id === 'fork') onFork(summary.id);
          if (id === 'archive') onArchive(summary.id);
        },
        portal: true,
        closeOnPointerLeave: true,
        anchor: h('button', {
          type: 'button',
          className: 'loom-icon-btn',
          'aria-label': t('sessionActions'),
          onClick: event => { event.stopPropagation(); setMenuOpen(value => !value); },
        }, h(IconEllipsisOutline16, { size: 16 })),
      })),
  );
}

/** A collapsible group row: its own twisty, name, actions, and session list. */
function LoomGroup({ row, actions, isCollapsed, isExpanded, onToggleCollapse, onToggleExpand, onOpen, onNew, onRename, onFork, onArchive, currentId, t }) {
  const open = !isCollapsed;
  const showAll = isExpanded;
  const PREVIEW = 4;
  const shown = showAll ? row.sessions : row.sessions.slice(0, PREVIEW);
  const hidden = row.sessions.length - PREVIEW;

  return h('div', { className: 'loom-group' },
    h('div', {
      className: 'loom-group-head',
      role: 'treeitem',
      'aria-expanded': open,
      onClick: () => onToggleCollapse(row.key),
    },
      // The twisty lives in the same 16px slot every row uses, which is what
      // the session list indents to and the guide line aligns under.
      h('span', { className: 'loom-slot' },
        h('span', {
          className: open ? 'loom-twisty' : 'loom-twisty loom-twisty-collapsed',
        }, h(IconChevronDownOutline14, { size: 14 }))),
      h('span', { className: 'loom-group-name' }, row.title),
      h('span', { className: 'loom-actions' },
        ...(actions ?? []),
        h('button', {
          type: 'button',
          className: 'loom-icon-btn',
          title: t('newChat'),
          'aria-label': `${t('newChat')} — ${row.title}`,
          onClick: event => { event.stopPropagation(); onNew(row); },
        }, h(IconPlusOutline16, { size: 16 })),
      ),
    ),

    open && h('div', { className: 'loom-children' },
      row.sessions.length === 0
        ? h('div', { className: 'loom-empty-section' }, t('noSessions'))
        : shown.map(summary => h(SessionRow, {
            key: summary.id,
            summary,
            current: summary.id === currentId,
            onClick: () => onOpen(summary.id),
            onRename,
            onFork,
            onArchive,
            t,
          })),
      hidden > 0 && h('button', {
        type: 'button',
        className: 'loom-more',
        onClick: () => onToggleExpand(row.key),
      }, showAll ? t('showLess') : interpolate(t('showMore'), { count: hidden })),
    ),
  );
}

/**
 * The sidebar browser: 项目 / 工作区 / 聊天.
 *
 * Each section lists its own conversations. Selecting one opens it; each group
 * row starts a new conversation in its declared starting folder.
 */
function LoomSidebar({
  projects, snapshot, sessionState, t,
  onOpenSession, onStartSession, onNewProject, onEditProject, onDeleteProject,
  onRenameSession, onForkSession, onArchiveSession,
}) {
  const [query, setQuery] = React.useState('');
  const [collapsed, setCollapsed] = React.useState(() => new Set());
  const [expanded, setExpanded] = React.useState(() => new Set());

  const derived = React.useMemo(
    () => deriveSections({ projects, snapshot, sessionState }),
    [projects, snapshot, sessionState],
  );

  const needle = query.trim().toLowerCase();
  const keep = summary => needle === '' || String(summary.displayTitle ?? '').toLowerCase().includes(needle);
  // A query keeps a group when the group itself matches, or when any of its
  // sessions does — so searching a project name still shows its sessions.
  const narrow = rows => rows
    .map(row => ({ ...row, sessions: row.sessions.filter(keep) }))
    .filter(row => row.sessions.length > 0
      || (needle !== '' && String(row.title ?? '').toLowerCase().includes(needle)));

  const projectRows = narrow(derived.projectRows);
  const workspaceRows = narrow(derived.workspaceRows);
  const chatSessions = derived.chatSessions.filter(keep);
  const searched = needle !== '';
  const nothing = searched && projectRows.length === 0 && workspaceRows.length === 0 && chatSessions.length === 0;

  const toggle = setter => key => setter(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const toggleCollapse = toggle(setCollapsed);
  const toggleExpand = toggle(setExpanded);

  const group = row => h(LoomGroup, {
    key: row.key,
    row,
    isCollapsed: collapsed.has(row.key),
    isExpanded: expanded.has(row.key),
    onToggleCollapse: toggleCollapse,
    onToggleExpand: toggleExpand,
    onOpen: onOpenSession,
    onNew: target => onStartSession(target.startWorkspaceId),
    onRename: onRenameSession,
    onFork: onForkSession,
    onArchive: onArchiveSession,
    currentId: sessionState?.current,
    t,
  });

  // A section is collapsible in its own right, so a user who only wants the
  // workspace list can put the other two away.
  const [hiddenSections, setHiddenSections] = React.useState(() => new Set());
  const toggleSection = toggle(setHiddenSections);

  const sectionHead = (id, label, count, action) => {
    const open = !hiddenSections.has(id);
    return h('div', { className: 'loom-section-head' },
      h('button', {
        type: 'button',
        className: 'loom-section-title',
        'aria-expanded': open,
        title: label,
        onClick: () => toggleSection(id),
      },
        h('span', {
          className: open ? 'loom-twisty' : 'loom-twisty loom-twisty-collapsed',
          style: { width: 16, height: 16 },
        }, h(IconChevronDownOutline14, { size: 12 })),
        h('span', null, label),
        count > 0 && h('span', { className: 'loom-section-count' }, String(count)),
      ),
      action ?? null,
    );
  };

  /** A section's body, or nothing when the section is collapsed. */
  const sectionBody = (id, render) => (hiddenSections.has(id) ? null : render());

  return h('div', { className: 'loom-sidebar' },
    h('div', { className: 'loom-search' },
      h(Input, {
        className: 'loom-input',
        value: query,
        placeholder: t('searchPlaceholder'),
        'aria-label': t('searchPlaceholder'),
        onChange: event => setQuery(event.target.value),
      }),
    ),

    nothing && h('div', { className: 'loom-empty-section' }, t('noMatches')),

    sectionHead('projects', t('sectionProjects'), projectRows.length,
      h('button', {
        type: 'button', className: 'loom-icon-btn',
        title: t('newProject'), 'aria-label': t('newProject'), onClick: onNewProject,
      }, h(IconPlusOutline16, { size: 16 }))),

    sectionBody('projects', () => (projectRows.length === 0
      ? h('div', { className: 'loom-empty-section' }, t('noProjects'))
      : projectRows.map(row => h(LoomGroup, {
          key: row.key,
          row,
          isCollapsed: collapsed.has(row.key),
          isExpanded: expanded.has(row.key),
          onToggleCollapse: toggleCollapse,
          onToggleExpand: toggleExpand,
          onOpen: onOpenSession,
          onNew: target => onStartSession(target.startWorkspaceId),
          onRename: onRenameSession,
          onFork: onForkSession,
          onArchive: onArchiveSession,
          currentId: sessionState?.current,
          t,
          actions: [
            h('button', {
              key: 'folders', type: 'button', className: 'loom-icon-btn',
              title: interpolate(t('folderCount'), { count: row.folders }),
              'aria-label': interpolate(t('folderCount'), { count: row.folders }),
              onClick: event => { event.stopPropagation(); onEditProject(row.project); },
            }, h(IconEditOutline16, { size: 16 })),
            h('button', {
              key: 'remove', type: 'button', className: 'loom-icon-btn',
              title: t('delete'), 'aria-label': t('delete'),
              onClick: event => { event.stopPropagation(); onDeleteProject(row.project); },
            }, h(IconTrashOutline16, { size: 16 })),
          ],
        })))),

    sectionHead('workspaces', t('sectionWorkspaces'), workspaceRows.length),
    sectionBody('workspaces', () => (workspaceRows.length === 0
      ? h('div', { className: 'loom-empty-section' }, t('noWorkspaces'))
      : workspaceRows.map(group))),

    sectionHead('chats', t('sectionChats'), chatSessions.length),
    sectionBody('chats', () => (chatSessions.length === 0
      ? h('div', { className: 'loom-empty-section' }, t('noChats'))
      : chatSessions.map(summary => h(SessionRow, {
          key: summary.id,
          summary,
          current: summary.id === sessionState?.current,
          onClick: () => onOpenSession(summary.id),
          onRename: onRenameSession,
          onFork: onForkSession,
          onArchive: onArchiveSession,
          t,
        })))),
  );
}

/**
 * Host the sidebar: own the manifest, the busy state, and the project editor.
 *
 * The manifest is read over the same loopback channel as the panel, so the two
 * surfaces can never disagree about which projects exist.
 */
function LoomSidebarHost({ bridge, ctx }) {
  return function LoomSidebarBound(props) {
    const { useWorkspaces, useSessions, t: seatT } = props ?? {};
    const t = typeof seatT === 'function' ? seatT : localTranslate(ctx);
    const [manifest, setManifest] = React.useState(undefined);
    const [error, setError] = React.useState('');
    const [editing, setEditing] = React.useState(null);
    const [renaming, setRenaming] = React.useState(null);

    const reload = React.useCallback(async () => {
      try {
        const value = await bridge.getManifest();
        setManifest(value.manifest);
        setError(value.ok === false ? String(value.error ?? '') : '');
      } catch (cause) {
        setError(cause.message);
      }
    }, [bridge]);

    React.useEffect(() => { void reload(); }, [reload]);

    const put = React.useCallback(async projects => {
      try {
        const value = await bridge.putManifest({ schemaVersion: 2, projects });
        setManifest(value.manifest);
      } catch (cause) {
        setError(interpolate(t('saveFailed'), { message: cause.message }));
      }
    }, [bridge, t]);

    const snapshot = typeof useWorkspaces === 'function' ? useWorkspaces(state => state) : undefined;
    const sessionState = typeof useSessions === 'function' ? useSessions(state => state) : undefined;

    const projects = manifest?.projects ?? [];

    return h(React.Fragment, null,
      error.length > 0 && h('div', { className: 'loom-sidebar-empty loom-warn' }, error),
      h(LoomSidebar, {
        projects,
        snapshot,
        sessionState,
        t,
        // Open through the navigation face, NOT `ctx.sessions.open` directly.
        //
        // `uiWorkspace.openSession` is what also clears the selected main panel
        // (`layout.selectPanel(null)`), so choosing a session brings the centre
        // column back to the Conversation. Calling the sessions service alone
        // sets the current session but leaves whatever panel was selected in
        // place — which strands the user on the Loom panel with no way back.
        onOpenSession: sessionId => {
          const navigation = ctx.get('uiWorkspace');
          if (navigation !== undefined) navigation.openSession(sessionId);
        },
        // `startSession` additionally inherits the current session's workspace
        // before the recent-workspace fallback, so it is the right verb here too.
        onStartSession: workspaceId => {
          const navigation = ctx.get('uiWorkspace');
          if (navigation !== undefined && workspaceId !== undefined) navigation.startSession(workspaceId);
        },
        onNewProject: () => setEditing({}),
        onEditProject: project => setEditing(project),
        onDeleteProject: project => { void put(projects.filter(item => item.id !== project.id)); },

        // Session verbs. `rename` is a per-session property, not a list verb, so
        // it resolves the session binding first — the list store has no rename.
        onRenameSession: (sessionId, currentTitle) => setRenaming({ sessionId, title: currentTitle }),
        onForkSession: sessionId => {
          const navigation = ctx.get('uiWorkspace');
          // Fork opens the child, and a failure keeps the current selection.
          if (navigation !== undefined) navigation.forkSession(sessionId).catch(() => {});
        },
        onArchiveSession: sessionId => {
          const navigation = ctx.get('uiWorkspace');
          // Archive hides the row through the archive set and never touches the
          // session log, so it is not destructive and needs no confirmation.
          if (navigation !== undefined) void navigation.archiveSession(sessionId);
        },
      }),

      renaming !== null && h(Modal, {
        open: true,
        onClose: () => setRenaming(null),
        title: t('renameSession'),
        closeLabel: t('cancel'),
        footer: h(React.Fragment, null,
          h(Button, { variant: 'outline', onClick: () => setRenaming(null) }, t('cancel')),
          h(Button, {
            variant: 'primary',
            onClick: () => {
              const target = renaming.sessionId;
              const next = renaming.title.trim();
              setRenaming(null);
              if (next.length === 0) return;
              const session = ctx.sessions?.binding(target)?.session;
              if (session !== undefined) void session.rename(next);
            },
          }, t('save')),
        ),
      },
        h(Input, {
          className: 'loom-input',
          value: renaming.title,
          maxLength: 120,
          'aria-label': t('renameSession'),
          onChange: event => setRenaming(current => ({ ...current, title: event.target.value })),
        }),
      ),

      editing !== null && h(ProjectEditor, {
        project: editing.id === undefined ? undefined : editing,
        workspaces: snapshot?.items ?? [],
        onSave: project => { void put([...projects.filter(item => item.id !== project.id), project]); },
        onClose: () => setEditing(null),
        t,
      }),
    );
  };
}

/**
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

  // The sidebar browser: 项目 / 工作区 / 聊天, each with its own conversations.
  //
  // This seat IS the browsing region, and priority -100 shadows the shipped
  // browser. That is intended here, unlike the earlier attempt: the three
  // sections CONTAIN the native workspace grouping, so nothing is taken away.
  try {
    ctx.slots.inject('sidebar.workspaces', contribute(ctx, bridge, 'sidebar.workspaces',
      { name: 'sidebar.workspaces', priority: -100, locale: NS },
      LoomSidebarHost({ bridge, ctx })));
    report(bridge, { event: 'inject', slot: 'sidebar.workspaces', ok: true });
  } catch (error) {
    report(bridge, {
      event: 'inject',
      slot: 'sidebar.workspaces',
      ok: false,
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? '').slice(0, 1200),
    });
  }
}

module.exports = {
  LoomIcon, LoomPanel, LoomSidebar, LoomSidebarHost, PreflightPanel, ProjectEditor,
  apply, createBridge, deriveSections, inject, name, renderPlanText,
};

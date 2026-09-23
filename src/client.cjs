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
  IconBranchOutline16, IconArchiveOutline20, IconListPenOutline16,
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
    newWorkspace: '新建工作区',
    renameWorkspace: '重命名工作区',
    deleteWorkspace: '删除工作区',
    workspaceActions: '工作区操作',
    projectActions: '项目操作',
    close: '关闭',
    deleteProjectHint: '只移除这个项目分组，不会删除文件夹或会话记录。',
    deleteWorkspaceHint: '只移除这个工作区登记，不会删除文件夹或会话记录。',
    pickFolderFailed: '没有选择文件夹。',
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
    newWorkspace: 'New workspace',
    renameWorkspace: 'Rename workspace',
    deleteWorkspace: 'Delete workspace',
    workspaceActions: 'Workspace actions',
    projectActions: 'Project actions',
    close: 'Close',
    deleteProjectHint: 'Removes this grouping only; folders and session logs are kept.',
    deleteWorkspaceHint: 'Removes the registration only; folders and session logs are kept.',
    pickFolderFailed: 'No folder was selected.',
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

/* No card chrome of its own any more: the preflight is a dialog now, and the
   Modal atom already supplies the surface and the padding. */
/* Scoped reset: every box this panel lays out counts its own padding and
   border inside its width.
   Without it, width: 100% resolves against the CONTENT box, so any element that
   also has padding comes out wider than its container. That one omission
   produced three separate visible bugs, all reported before it was found:
     - the search field bled past the sidebar's padding;
     - the project-name field overhung the folder list beneath it;
     - every session row was 12px too wide, pushing the timestamps off the
       right edge and giving the whole column a horizontal scrollbar.
   Fixing it per-element is what let it come back each time.
   (Never write a backtick in this block — it is itself a template literal.) */
.loom-sidebar,
.loom-sidebar * { box-sizing: border-box; }

.loom-preflight { display: flex; flex-direction: column; gap: 16px; }
.loom-preflight-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.loom-boundary { color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }

.loom-section { display: flex; flex-direction: column; gap: 6px; }
.loom-section-title {
  font-size: 12px; line-height: 20px; font-weight: 500;
  display: flex; align-items: center; gap: 6px;
}
.loom-section-title.loom-warn { color: var(--dsw-alias-state-warn-primary); }
/* Preflight rows. Named distinctly because plain loom-row is ALSO the
   sidebar's session row, and two rules sharing one name meant the later block
   silently restyled the preflight into 32px session geometry. */
.loom-preflight-row { display: flex; align-items: baseline; gap: 8px; font-size: 14px; line-height: 20px; }
.loom-preflight-row + .loom-preflight-row { margin-top: 2px; }
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
  padding: 6px 4px 16px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px; line-height: 20px;
}
.loom-search { padding: 0 0 8px; }

/* The three rulers of this tree, all measured from the sidebar's own edge:
     the section twisty   sits at 4 + 2             =  6px
     the group slot       starts at 4 + 6           = 10px, centred on 18px
     the children's guide is placed AT that centre  = 18px
   Every extra padding between those points was dead space on the left, which
   is what made the collapsed tree look indented for no reason. */
.loom-section-head { display: flex; align-items: center; gap: 2px; margin-top: 12px; padding: 0; }
.loom-section-head:first-of-type { margin-top: 4px; }
.loom-section-title {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 4px;
  height: 28px; padding: 0 2px;
  border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; text-align: left;
  font-size: 12px; line-height: 20px; font-weight: 500;
}
.loom-section-title:hover { color: var(--dsw-alias-label-primary); }
.loom-section-count { font-weight: 400; color: var(--dsw-alias-label-tertiary); }

/* The tree's ROOT must not be its smallest text.
   A section label was 12px, which put it below the 14px group and session rows
   nested under it — the hierarchy signal read backwards, and on the collapsed
   tree those three rows are the only thing on screen. Structure is 14px at
   every level; weight, not size, carries the depth:
     section 600  -  group 500  -  session 400. */
.loom-sidebar .loom-section-title { font-size: 14px; font-weight: 600; }
.loom-sidebar .loom-section-count { font-weight: 400; }

.loom-group { display: flex; flex-direction: column; }
.loom-group-head {
  display: flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 6px;
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
  margin-left: 14px; padding-left: 7px;
  border-left: 1px solid var(--dsw-alias-border-l2);
}

/* The 聊天 section has no group level, so its sessions hang directly off the
   SECTION and indent to that section's twisty centre (14px) rather than a
   group's (18px).
   Without this they rendered at the section's own level, the same depth as a
   group header — reading as siblings of 聊天 rather than as its contents, and
   making this the one place in the panel where a session sat at depth 0. */
.loom-children-section { margin-left: 10px; }

.loom-row {
  display: flex; align-items: center; gap: 0;
  width: 100%; height: 32px; padding: 0 6px;
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
.loom-warn-note { padding: 2px 8px; color: var(--dsw-alias-state-warn-primary); font-size: 12px; line-height: 20px; }`;

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
              h('div', { className: 'loom-preflight-row' }, h('span', null, skill.name)),
              h('div', { className: 'loom-src' }, `${t('from')} ${skill.workspaceId} — ${skill.path}`),
            )),
      ),

      // Collisions are surfaced, never hidden.
      plan.collisions.length > 0 && h('div', { className: 'loom-section' },
        h('div', { className: 'loom-section-title loom-warn' }, `${t('collisions')} · ${plan.collisions.length}`),
        h('div', { className: 'loom-muted' }, t('collisionHint')),
        plan.collisions.map(collision => h('div', { key: collision.name },
          h('div', { className: 'loom-preflight-row' },
            h('span', null, collision.name),
            h(Tag, { tone: 'success' }, `${t('winner')} ${collision.winner.workspaceId}`),
          ),
          collision.shadowed.map(shadowed => h('div', { key: shadowed.workspaceId, className: 'loom-preflight-row' },
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
          h('div', { className: 'loom-preflight-row' },
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

const name = 'dsh-loom';
// `sessions` and `uiWorkspace` are hard dependencies: the browser's whole point
// is navigating to a session, and the navigation face is what clears the panel.
const inject = ['slots', 'locale', 'workspaces', 'sessions', 'uiWorkspace', 'connection'];

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
 * The shipped row affordance: ONE ellipsis that opens a menu.
 *
 * Extracted because session rows and workspace rows both need it, and because
 * it owns the open state — a menu re-created each render loses its anchor.
 */
function RowMenu({ items, onSelect, label }) {
  const [open, setOpen] = React.useState(false);
  return h(Menu, {
    open,
    onClose: () => setOpen(false),
    items,
    onSelect: id => { setOpen(false); onSelect(id); },
    portal: true,
    closeOnPointerLeave: true,
    anchor: h('button', {
      type: 'button',
      className: 'loom-icon-btn',
      'aria-label': label,
      onClick: event => { event.stopPropagation(); setOpen(value => !value); },
    }, h(IconEllipsisOutline16, { size: 16 })),
  });
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
      h(RowMenu, {
        label: t('sessionActions'),
        items,
        onSelect: id => {
          if (id === 'rename') onRename(summary.id, title);
          if (id === 'fork') onFork(summary.id);
          if (id === 'archive') onArchive(summary.id);
        },
      })),
  );
}

/** A collapsible group row: its own twisty, name, actions, and session list. */
function LoomGroup({ row, actions, menu, isCollapsed, isExpanded, onToggleCollapse, onToggleExpand, onOpen, onNew, onRename, onFork, onArchive, currentId, t }) {
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
        // A workspace row manages itself through this menu. A project row's
        // verbs arrive as `actions` instead, because they belong to the Loom
        // manifest rather than to DSH.
        menu !== undefined && h(RowMenu, {
          label: menu.label,
          items: menu.items,
          onSelect: menu.onSelect,
        }),
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
/**
 * The context preflight, as a dialog opened from one project's row menu.
 *
 * It used to live in a `main` panel that also listed projects, which cost a
 * permanent entry in the shell's global navigation for something that answers
 * one question about one project. A dialog is the right shape: it reports, then
 * closes, and leaves the browsing column to browsing.
 */
function PreflightModal({ project, bridge, t, onClose }) {
  const [plan, setPlan] = React.useState(undefined);
  const [busy, setBusy] = React.useState(true);

  const run = React.useCallback(async () => {
    setBusy(true);
    try {
      const value = await bridge.preflight(project.id);
      setPlan(value.plan);
    } catch {
      // A failed preflight leaves the running state; the dialog stays open so
      // the reason is not lost behind a closed window.
      setPlan(undefined);
    } finally {
      setBusy(false);
    }
  }, [bridge, project.id]);

  React.useEffect(() => { void run(); }, [run]);

  return h(Modal, {
    open: true,
    onClose,
    title: t('preflight'),
    description: project.title,
    closeLabel: t('close'),
    // The wide card: a preflight lists skill paths and collision sources.
    className: 'loom-editor',
  }, h(PreflightPanel, { plan, t, busy, onRefresh: run }));
}

function LoomSidebar({
  projects, snapshot, sessionState, t,
  onOpenSession, onStartSession, onNewProject, onEditProject, onDeleteProject,
  onPreflightProject,
  onRenameSession, onForkSession, onArchiveSession,
  onNewWorkspace, onRenameWorkspace, onDeleteWorkspace,
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
    // A workspace is the shell's own object, so its verbs are the shell's:
    // rename and delete. Delete unregisters the Workspace without touching
    // Sessions or files, so it is not styled as destructive data loss — but it
    // does remove the entry, so the menu marks it danger.
    menu: {
      label: t('workspaceActions'),
      items: [
        { id: 'rename', label: t('renameWorkspace'), icon: h(IconEditOutline16, null) },
        { id: 'delete', label: t('deleteWorkspace'), icon: h(IconTrashOutline16, null), danger: true },
      ],
      onSelect: id => {
        if (id === 'rename') onRenameWorkspace(row.key, row.title);
        if (id === 'delete') onDeleteWorkspace(row.key);
      },
    },
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
          // One ellipsis, matching the shipped row affordance. The preflight lives
          // here because it is a verb on a project, not a place to navigate to.
          menu: {
            label: t('projectActions'),
            items: [
              { id: 'preflight', label: t('preflight'), icon: h(IconListPenOutline16, null) },
              { id: 'edit', label: t('edit'), icon: h(IconEditOutline16, null) },
              { id: 'delete', label: t('delete'), icon: h(IconTrashOutline16, null), danger: true },
            ],
            onSelect: id => {
              if (id === 'preflight') onPreflightProject(row.project);
              if (id === 'edit') onEditProject(row.project);
              if (id === 'delete') onDeleteProject(row.project);
            },
          },
        })))),

    sectionHead('workspaces', t('sectionWorkspaces'), workspaceRows.length,
      h('button', {
        type: 'button', className: 'loom-icon-btn',
        title: t('newWorkspace'), 'aria-label': t('newWorkspace'), onClick: onNewWorkspace,
      }, h(IconPlusOutline16, { size: 16 }))),
    sectionBody('workspaces', () => (workspaceRows.length === 0
      ? h('div', { className: 'loom-empty-section' }, t('noWorkspaces'))
      : workspaceRows.map(group))),

    sectionHead('chats', t('sectionChats'), chatSessions.length),
    sectionBody('chats', () => (chatSessions.length === 0
      ? h('div', { className: 'loom-empty-section' }, t('noChats'))
      // Same container a group uses for its sessions, so a chat is drawn as a
      // CHILD of its section rather than as a sibling of the section header.
      : h('div', { className: 'loom-children loom-children-section' },
          chatSessions.map(summary => h(SessionRow, {
            key: summary.id,
            summary,
            current: summary.id === sessionState?.current,
            onClick: () => onOpenSession(summary.id),
            onRename: onRenameSession,
            onFork: onForkSession,
            onArchive: onArchiveSession,
            t,
          }))))),
  );
}

/**
 * Host the sidebar: own the manifest, the busy state, and the project editor.
 *
 * The manifest is read over the same loopback channel as the panel, so the two
 * surfaces can never disagree about which projects exist.
 */
function LoomSidebarHost({ bridge, ctx }) {
  /** Mounted only once both seats are known to exist, so its hooks are unconditional. */
  function LoomSidebarSeated({ useWorkspaces, useSessions, bridge, ctx, t }) {
    const snapshot = useWorkspaces(state => state);
    const sessionState = useSessions(state => state);
    const [manifest, setManifest] = React.useState(undefined);
    const [error, setError] = React.useState('');
    const [editing, setEditing] = React.useState(null);
    const [renaming, setRenaming] = React.useState(null);
    const [preflighting, setPreflighting] = React.useState(null);

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

    const projects = manifest?.projects ?? [];

    return h(React.Fragment, null,
      error.length > 0 && h('div', { className: 'loom-empty-section loom-warn' }, error),
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
        onPreflightProject: project => setPreflighting(project),

        // Session verbs. `rename` is a per-session property, not a list verb, so
        // it resolves the session binding first — the list store has no rename.
        onRenameSession: (sessionId, currentTitle) => setRenaming({ kind: 'session', id: sessionId, title: currentTitle }),
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

        // Workspace verbs. A Workspace is the shell's own object, so these go
        // through DSH's services rather than through Loom's manifest: Loom
        // groups existing Workspaces and never mutates them.
        onNewWorkspace: async () => {
          const navigation = ctx.get('uiWorkspace');
          if (navigation === undefined) return;
          try {
            // The shell's own picker, so the chosen folder lands in the same
            // registry the native browser reads.
            const picked = await navigation.pickDirectory();
            if (typeof picked !== 'string' || picked.length === 0) return;
            await ctx.workspaces.create({ path: picked });
          } catch (cause) {
            setError(interpolate(t('saveFailed'), { message: cause.message }));
          }
        },
        onRenameWorkspace: (workspaceId, currentTitle) =>
          setRenaming({ kind: 'workspace', id: workspaceId, title: currentTitle }),
        onDeleteWorkspace: workspaceId => {
          // Removes the registration only: DSH's delete keeps folders and
          // session logs, so this needs no confirmation dialog.
          void ctx.workspaces.delete(workspaceId).catch(() => {});
        },
      }),

      preflighting !== null && h(PreflightModal, {
        project: preflighting,
        bridge,
        t,
        onClose: () => setPreflighting(null),
      }),

      renaming !== null && h(Modal, {
        open: true,
        onClose: () => setRenaming(null),
        // One dialog serves both verbs: a session rename and a workspace rename
        // ask for exactly the same thing — a new name.
        title: t(renaming.kind === 'session' ? 'renameSession' : 'renameWorkspace'),
        closeLabel: t('cancel'),
        footer: h(React.Fragment, null,
          h(Button, { variant: 'outline', onClick: () => setRenaming(null) }, t('cancel')),
          h(Button, {
            variant: 'primary',
            onClick: () => {
              const target = renaming;
              const next = target.title.trim();
              setRenaming(null);
              if (next.length === 0) return;
              if (target.kind === 'session') {
                // Rename is a per-session verb, not a list verb: the binding
                // resolves the session the list store only knows by id.
                const session = ctx.sessions?.binding(target.id)?.session;
                if (session !== undefined) void session.rename(next);
              } else {
                void ctx.workspaces.rename(target.id, next).catch(() => {});
              }
            },
          }, t('save')),
        ),
      },
        h(Input, {
          className: 'loom-input',
          value: renaming.title,
          maxLength: 120,
          'aria-label': t(renaming.kind === 'session' ? 'renameSession' : 'renameWorkspace'),
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
  }

  /**
   * The seat check.
   *
   * It must happen BEFORE the seated component mounts, not inside it: a hook
   * called conditionally changes the hook order between renders, which React
   * treats as a crash. Checking here and mounting Seated only on success is what
   * keeps every hook in that component unconditional.
   */
  return function LoomSidebarBound(props) {
    const { useWorkspaces, useSessions, t: seatT } = props ?? {};
    if (typeof useWorkspaces !== 'function' || typeof useSessions !== 'function') return null;
    return h(LoomSidebarSeated, {
      useWorkspaces,
      useSessions,
      bridge,
      ctx,
      // The panel owns its dictionaries, so a missing seat still translates.
      t: typeof seatT === 'function' ? seatT : localTranslate(ctx),
    });
  };
}

/**
 * Loom contributes exactly ONE surface: the sidebar browser.
 *
 * It claims `sidebar.workspaces` at priority -100, which shadows the shipped
 * browser. That is intended — 项目 / 工作区 / 聊天 CONTAIN the native workspace
 * grouping, so nothing is taken away, unlike an earlier attempt that replaced
 * the browser with a projects-only list.
 *
 * It registers NOTHING in `main` or `sidebar.panellist`: the project list is
 * already covered by the sidebar's 项目 section, so a panel would duplicate it
 * while costing a permanent row in the shell's global navigation. The preflight
 * is a per-project dialog opened from that project's row menu.
 */
function apply(ctx) {
  ctx.effect(installStyles, 'dsh-loom: styles');
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-loom: dictionaries');

  const bridge = createBridge(ctx);

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

  // Nothing is registered in `main` or `sidebar.panellist`, deliberately.
  //
  // Both were removed together with the panel they served. The project list was
  // already covered by the sidebar's 项目 section, so the panel only duplicated
  // it — and the panellist entry cost a permanent row in the shell's GLOBAL
  // navigation, pushing the session browser down for every session, including
  // the ones that have nothing to do with a project.
  //
  // The one thing that panel could do and the sidebar cannot is the context
  // preflight, and that is a per-project action rather than a destination. It
  // now opens from the project row's own menu, beside its other verbs.

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
  LoomSidebar, LoomSidebarHost, PreflightModal, PreflightPanel, ProjectEditor,
  apply, createBridge, deriveSections, inject, name, renderPlanText,
};

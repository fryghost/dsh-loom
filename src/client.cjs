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
// Icon names carry the WEIGHT, not a pixel size. DSH 0.1.6 named these by
// size (`IconPlusOutlineRegular`); `4937343a5e feat(web): unify the client visual
// language` renamed the family to `...Regular` / `...Medium` before 0.1.7.
// Destructuring a name that no longer exists yields `undefined` silently, and
// `React.createElement(undefined)` throws on first render — which makes the
// slot renderer ABDICATE this entry, so the shipped browser silently returns
// and the plugin looks uninstalled. Size still reaches the artwork through the
// `size` prop, so passing 14/16/20 keeps the intended geometry.
const {
  Button, Tag, StateDot, Modal, Input, Menu,
  IconPlusOutlineRegular, IconChevronDownOutlineRegular,
  IconSearchOutlineRegular, IconCloseOutlineRegular,
  IconEllipsisOutlineRegular, IconEditOutlineRegular, IconTrashOutlineRegular,
  IconBranchOutlineRegular, IconArchiveOutlineRegular, IconListPenOutlineRegular,
  IconShareOutlineRegular,
} = require('@deepseek-ai/dsh-client-ui-primitives');

const h = React.createElement;

const NS = 'dsh-loom';
// The carrier route both halves share. NOT a private channel: on DSH 0.2 a
// plugin cannot mount one (`connection.rpc.handle` resolves `webServer` off
// Connection's own fiber and throws while loading), so Loom rides the shared
// `/api` channel on exact per-endpoint routes the host registers. See
// `./core/bridge.cjs` — imported rather than restated, because a client and a
// host that disagree about the route is a 404 on every call and an empty 项目
// section, which is precisely how the 0.2 change presented itself.
const { BRIDGE_CHANNEL, bridgeEndpoint } = require('./core/bridge.cjs');
const { deriveSections } = require('./core/sections.cjs');
// The editor rebuilds a member list through the SAME core rule the host uses to
// read it back, so "editing membership" cannot quietly rewrite roles or prune a
// folder the registry cannot currently resolve. Duplicating that logic here is
// what let the two halves disagree.
const { mergeMembers, normalizeComparablePath: comparablePath } = require('./core/manifest.cjs');

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
    clearSearch: '清除搜索',
    showMore: '展开其余 {count} 个会话',
    showLess: '收起',
    untitled: '未命名会话',
    noSessions: '还没有会话',
    claimedBy: '已被项目认领',
    claimedElsewhere: '会话列在认领它的项目下，此处不重复',
    noWorkspaces: '没有工作区',
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
    pickFolderTitle: '选择文件夹',
    pickFolderSelect: '选择这个文件夹',
    pickFolderEmpty: '这个文件夹里没有子文件夹',
    pickFolderLoading: '加载中…',
    pickFolderFailedLoad: '读取文件夹失败：{message}',
    pickFolderCrumbs: '位置',
    pickFolderTruncated: '子文件夹过多，只显示开头部分。',
    pickFolderUnavailable: '这个界面没有可用的文件夹选择器，请改用直接填写路径。',
    pickFolderManual: '手动填写路径',
    pickFolderManualApply: '使用这个路径',
    chatsFolder: '默认文件夹',
    setChatsFolder: '设置默认文件夹',
    clearChatsFolder: '清除默认文件夹',
    chatsFolderHint: '新对话从这里开始。没有默认文件夹时，点 + 会先让你选一个。',
    chatsFolderIsWorkspace: '这个文件夹已经是工作区，新会话会归到该工作区下，不会出现在「聊天」段。',
    migrate: '迁移到其他工作区',
    migrateTitle: '迁移对话',
    migrateTarget: '目标工作区',
    migrateNoTarget: '没有其他可迁移的工作区',
    migratePlan: '迁移方案',
    migrateWillCopy: '会复制 {count} 条历史事件到新会话',
    migrateWillDrop: '（另有 {count} 条本轮事件不会复制）',
    migrateKeepsSource: '原会话不会被删除，只会归档——归档只是从这些列表里收起来。',
    migrateNotBranch: '新会话是独立的会话，与原会话没有分支关联。',
    migrateContextFollows: '技能、指令文件与写入边界都会跟随新文件夹；界面文案随之改变。',
    migrateSameTitle: '新会话沿用原会话的标题，可以在行菜单里重命名。',
    migrateRunning: '会话正在运行，先停止再迁移，否则末尾的事件会丢失。',
    migrateSame: '目标文件夹与原文件相同，迁移不会产生新内容。',
    migrateNoTurn: '这条会话还没有已完成的回合，没有可复制的历史。',
    migrateNoCwd: '这条会话没有记录工作目录，无法判断迁移目标。',
    migrateSourceMissing: '原会话的日志读不到了，无法复制。',
    migrateWorkspaceMissing: '目标工作区的文件夹当前不存在。',
    migrateUnavailable: '当前环境缺少迁移所需的组件：{message}',
    migrateFailed: '迁移失败：{message}',
    migratePartialArchive: '新会话已创建，但原会话归档失败：{message}。两条会话都还在。',
    migrateAttachFailed: '新会话已创建，但没能登记进目标工作区。它仍会显示在那里（会话记录在目标文件夹下），重启后会一并归位。',
    migrateDone: '已迁移到 {title}。',
    migrateOpen: '打开新会话',
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
    clearSearch: 'Clear search',
    showMore: 'Show {count} more',
    showLess: 'Show less',
    untitled: 'Untitled session',
    noSessions: 'No sessions yet',
    claimedBy: 'Claimed by',
    claimedElsewhere: 'Sessions are listed under the claiming project; not repeated here',
    noWorkspaces: 'No workspaces',
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
    pickFolderTitle: 'Choose a folder',
    pickFolderSelect: 'Use this folder',
    pickFolderEmpty: 'No subfolders here',
    pickFolderLoading: 'Loading…',
    pickFolderFailedLoad: 'Could not read that folder: {message}',
    pickFolderCrumbs: 'Location',
    pickFolderTruncated: 'Too many subfolders; only the beginning is shown.',
    pickFolderUnavailable: 'This interface has no folder chooser available — type the path instead.',
    pickFolderManual: 'Type a path',
    pickFolderManualApply: 'Use this path',
    chatsFolder: 'Default folder',
    setChatsFolder: 'Set default folder',
    clearChatsFolder: 'Clear default folder',
    chatsFolderHint: 'New chats start here. With no default folder, + asks you to pick one first.',
    chatsFolderIsWorkspace: 'This folder is already a workspace, so new chats join that workspace and will not appear under Chats.',
    migrate: 'Move to another workspace',
    migrateTitle: 'Move conversation',
    migrateTarget: 'Target workspace',
    migrateNoTarget: 'No other workspace to move to',
    migratePlan: 'What will happen',
    migrateWillCopy: 'Copies {count} history events into a new session',
    migrateWillDrop: ' ({count} events from the current turn are not copied)',
    migrateKeepsSource: 'The original is not deleted — it is archived, which only hides it from these lists.',
    migrateNotBranch: 'The new session is independent; it is not a branch of the original.',
    migrateContextFollows: 'Skills, instruction files, and the write boundary all follow the new folder.',
    migrateSameTitle: 'The new session reuses the original title; rename it from its row menu.',
    migrateRunning: 'The session is running. Stop it first, or the tail of the turn would be lost.',
    migrateSame: 'The target folder is the original one, so a move would change nothing.',
    migrateNoTurn: 'This session has no completed turn, so there is no history to copy.',
    migrateNoCwd: 'This session records no working directory, so there is no move to make.',
    migrateSourceMissing: 'The original session log cannot be read, so nothing can be copied.',
    migrateWorkspaceMissing: 'The target workspace folder does not exist right now.',
    migrateUnavailable: 'This deployment is missing what a move needs: {message}',
    migrateFailed: 'Move failed: {message}',
    migratePartialArchive: 'The new session was created, but archiving the original failed: {message}. Both sessions remain.',
    migrateAttachFailed: 'The new session was created but could not be recorded in the target workspace. It still appears there (its log lives in that folder) and will be accounted for on the next start.',
    migrateDone: 'Moved to {title}.',
    migrateOpen: 'Open the new session',
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
/* The name and its role share one line. The NAME owns the truncation and the
   role never yields: putting the ellipsis on the flex container instead leaves
   the anonymous text box untruncated, so a long folder name simply overflows. */
.loom-pick-name {
  display: flex; align-items: baseline; gap: 6px;
  font-size: 14px; line-height: 20px;
}
.loom-pick-title {
  min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* The member's role, at the caption step. It is REPORTED, not edited: this
   dialog edits membership, and a role rewritten on save is how every readonly
   member was silently promoted. */
.loom-pick-role {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px; line-height: 20px;
}
.loom-pick-path {
  font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* An unresolvable member is still listed and still removable — it must be
   visible to be managed at all. Muted, not disabled: unchecking it is a
   deliberate removal, not an error to prevent. These follow the base rules
   above so the intent does not depend on specificity to win. */
.loom-pick-missing .loom-pick-name { color: var(--dsw-alias-label-secondary); }
.loom-pick-missing .loom-pick-path { color: var(--dsw-alias-state-warn-primary); }
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
/* The sidebar's search field.
   (No backticks anywhere in this block: it is itself a template literal, and
   one would end it early — which has now happened five times.)

   The metrics come from the shipped browser's own search (ui-workspace's
   WorkspaceBrowser.module.css) and NOT from the Input atom. That atom is built
   for dialog forms — 32px tall, a filled bg-layer-1 surface, a 12px radius,
   14px text — so in the sidebar it was the only opaque box in a column whose
   whole language is "transparent at rest, filled on hover", and it read as a
   heavier foreign object than the tree it filters.

   What is deliberately NOT copied is that control's two-state geometry: there a
   28px icon-only button expands into a 30px bordered field with a negative
   inline margin. Loom's search is always open, so only the resting metrics
   apply and nothing may move on hover.

   ALIGNMENT — everything is measured from the sidebar's own 4px padding, so
   this control sits on the same axes as the tree beneath it:

     group / session leading slot   4 + 6       = 10px
     search icon slot               4 + 6       = 10px   <- same axis
     group name text                10 + 16 + 6 = 32px
     search text                    10 + 16 + 6 = 32px   <- same axis

   The previous version measured 4.5 / 11.5 / 32.5 instead. Two causes, both
   worth keeping in mind because neither is visible in a screenshot of the
   control alone:

     - a transparent hairline BORDER keeps layout stable across hover but still
       offsets everything INSIDE it by half a pixel. An outline with a negative
       offset draws the same hairline without entering the layout.
     - the 28px icon box was copied from the shipped ICON-ONLY BUTTON, where it
       is correct. In an always-open field it overran the 27px content box and
       pushed the text off the tree's text axis. */
.loom-search {
  flex: none;
  display: flex; align-items: center; gap: 6px;
  box-sizing: border-box;
  width: 100%; height: 28px;
  margin: 0 0 8px; padding: 0 4px 0 6px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  /* Drawn inside the box and OUT of the layout flow. A transparent border keeps
     layout stable too, but still offsets everything inside it by half a pixel —
     which is what put this control on a different axis from the tree. */
  outline: 0.5px solid transparent;
  outline-offset: -0.5px;
  transition: outline-color 150ms var(--ds-ease-in-out);
}
/* The hairline appears only on approach, so the resting state stays flat. */
.loom-search:hover,
.loom-search:focus-within { outline-color: var(--dsw-alias-border-l4); }
/* The same 16px leading slot the tree rows use, so this glyph centres on the
   same axis as every chevron below it. The shipped control's 28px icon box
   belongs to its icon-only BUTTON, and copying it here overran the 27px content
   box while pushing the text off the tree's text axis. */
.loom-search-icon {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.loom-search-input {
  flex: 1; width: 0; min-width: 0;
  border: none; outline: none; background: transparent;
  font-size: 13px; line-height: 18px;
  color: var(--dsw-alias-label-primary);
}
.loom-search-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.loom-search-clear {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0;
  border: none; border-radius: var(--dsw-radius-sm);
  background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary);
}
.loom-search-clear:hover { background: var(--dsw-alias-interactive-bg-hover); }

/* The three rulers of this tree, all measured from the sidebar's own edge:
     the section twisty   sits at 4 + 2             =  6px
     the group slot       starts at 4 + 6           = 10px, centred on 18px
     the children's guide is placed AT that centre  = 18px
   Every extra padding between those points was dead space on the left, which
   is what made the collapsed tree look indented for no reason. */
/* ── the section band ────────────────────────────────────────────────
   A section header is a BAND, not a row. Three things separate it from the
   list beneath it — a hairline above, the space that rule buys, and the
   letter-spacing that makes the label read as a caption.
   It deliberately does NOT compete on size with its contents. The earlier
   version put the root of the tree at the same 14px as its leaves and tried
   to separate them by weight alone, which at CJK stroke density is close to
   invisible; 12px is the caption size, and 14px every row below it. */
.loom-section-head {
  display: flex; align-items: center; gap: 2px;
  margin-top: 16px; padding: 6px 0 2px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}
/* A band is a HEADING, so its space belongs below the rule, not above it. The
   old split was 22px above (16 margin + 6 padding) and 0px below, which made
   every band read as a footer of the group above it instead of the heading of
   the group beneath — the clearest spacing fault in this panel.

   The first band opens the panel directly under the search field, so it takes
   neither the rule nor the full gap. Selected by an explicit class rather than
   :first-of-type, which NEVER MATCHED: the search field is also a div, so the
   first .loom-section-head is not the first div of its type, and the rule that
   was supposed to suppress this one band's rule fired on all three. */
.loom-section-head-first { margin-top: 2px; padding-top: 0; border-top: none; }
.loom-section-title {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 6px;
  height: 24px; padding: 0 2px;
  border: none; border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer; text-align: left;
  font-size: 12px; line-height: 20px; font-weight: 600;
  letter-spacing: .04em;
}
.loom-section-title:hover { color: var(--dsw-alias-label-primary); }
.loom-section-count { font-weight: 500; letter-spacing: 0; }
/* A band's own actions. NOT the loom-actions class: that one is hidden until
   its ROW is hovered, which is right for a row whose timestamp it replaces and
   wrong for a section heading — the one control that starts a conversation
   would be invisible at rest. The 项目 and 工作区 bands have always shown their
   plus, so this only makes the third band match them.
   (Never write a backtick in this block — see the note at the top.) */
.loom-section-actions { flex: none; display: inline-flex; align-items: center; gap: 12px; }

/* ONE twisty, always visible.
   An earlier version swapped a type icon for the twisty on hover. That read as
   flicker: the glyph changed under the pointer, so the row's identity and its
   collapsed state were BOTH unclear at the moment you were aiming at it. It
   also needed an icon per level, and the ones that exist are ambiguous — a
   folder with a plus for "projects" reads as "add", and a folder for both
   项目 and 工作区 separates nothing.
   A glyph that holds still is worth more than one that says two things. */
.loom-twisty {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px;
  transition: transform 150ms var(--ds-ease-in-out);
}
.loom-twisty-collapsed { transform: rotate(-90deg); }

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
/* The projects claiming this folder, at the caption step (12px) so it reads as
   an annotation on the row rather than a second name competing with it. It
   shrinks before the name does — the name identifies the row, this only
   qualifies it — and disappears when there is no room at all. */
.loom-claimed {
  flex: 0 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px; line-height: 20px;
}
.loom-group-head:hover .loom-claimed { display: none; }

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
/* The session step is the QUIET one. A group name and a session title were the
   same colour, leaving weight alone to separate them - the weakest cue in the
   whole panel, and at 14px CJK weight barely reads. */
.loom-sidebar .loom-row { color: var(--dsw-alias-label-secondary); }
.loom-sidebar .loom-row-current,
.loom-sidebar .loom-row:hover { color: var(--dsw-alias-label-primary); }
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

/* AN OPEN MENU PINS ITS OWN ANCHOR. Without this the row menu is unreachable
   with a real pointer, and the failure looks like "delete does nothing".
   The row Menu is portaled, so the host re-measures the anchor every
   animation frame and positions the list from that rect. The ellipsis lives in
   .loom-actions, which is display: none unless the row is hovered — so the
   moment the pointer travels from the ellipsis down to the dropdown, the state
   is lost, the anchor collapses to 0x0, and the list is clamped to the overlay
   margin: it teleports to the viewport's top-left corner and the
   close-on-pointer-leave grace then closes it. The pointer can never catch it.
   The host's own rows solve exactly this the same way — a state class that keeps
   the actions laid out while the menu is open (Rows.module.css:
   .projectRow.menuOpen .rowActions { display: inline-flex }, fed by the
   menuOpen state in Rows.tsx). Loom had no such class.
   NO BACKTICKS IN THIS COMMENT: the whole stylesheet is one template literal,
   and a stray one ends it early — a mistake this file has made before. */
.loom-row.loom-menu-open .loom-actions,
.loom-group-head.loom-menu-open .loom-actions { display: inline-flex; }
/* Pinning the anchor is not enough on its own: the row must keep the WHOLE
   hover appearance it had when the menu opened. A returned claim badge would
   change the row's content width and shift the anchor sideways — menu and all —
   and a returned timestamp would push the actions out from under the pointer.
   No backticks here either, for the reason stated above. */
.loom-group-head.loom-menu-open .loom-claimed,
.loom-row.loom-menu-open .loom-time,
.loom-group-head.loom-menu-open .loom-time { display: none; }
.loom-row.loom-menu-open,
.loom-group-head.loom-menu-open { background: var(--dsw-alias-interactive-bg-hover); }
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

/* The migration dialog: a target picker plus the plan it will execute. The plan
   is a LIST because each line is a separate promise about what will and will
   not happen — collapsing them into one paragraph is how a user ends up
   surprised that "move" actually copied and archived. */
.loom-migrate { display: flex; flex-direction: column; gap: 16px; }
.loom-migrate .loom-input { width: 100%; }
.loom-plan { display: flex; flex-direction: column; gap: 6px; }
.loom-plan-list {
  margin: 0; padding-left: 18px;
  display: flex; flex-direction: column; gap: 4px;
  color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px;
}
/* The folder browser's rows. Reset of the host Button look, because these are
   list items that happen to be buttons, not actions. */
.loom-crumb, .loom-folder-row {
  display: block; width: 100%; text-align: left;
  padding: 4px 6px; border: 0; border-radius: 4px;
  background: transparent; color: inherit;
  font: inherit; cursor: pointer;
}
.loom-crumb { display: inline-block; width: auto; padding: 2px 4px; }
.loom-crumb + .loom-crumb::before { content: '›'; margin-right: 4px; opacity: 0.6; }
.loom-crumb:hover, .loom-folder-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* Long paths must not widen the dialog past the viewport. */
.loom-plan-list .loom-folder-row, .loom-crumb { overflow-wrap: anywhere; }`;

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

/** Thin wrapper over the host bridge; every call is host-backed. */
function createBridge(ctx) {
  const call = async (endpoint, payload) => {
    const result = await ctx.connection.rpc.call(BRIDGE_CHANNEL, bridgeEndpoint(endpoint), payload ?? {});
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
    planMigration: (sessionId, targetWorkspaceId) => call('planMigration', { sessionId, targetWorkspaceId }),
    migrateSession: (sessionId, targetWorkspaceId) => call('migrateSession', { sessionId, targetWorkspaceId }),
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

  /**
   * The rows to offer, from BOTH sources.
   *
   * A member the registry cannot resolve right now still gets a row: it is
   * checked, it says why it cannot be reached, and unchecking it is a deliberate
   * removal. Rendering only the resolvable workspaces hid those members from the
   * dialog entirely, so the only way the user could interact with one was to
   * save and silently lose it.
   */
  const rows = React.useMemo(() => {
    const byId = new Map();
    for (const member of project?.members ?? []) {
      if (typeof member?.workspaceId !== 'string' || member.workspaceId.length === 0) continue;
      byId.set(member.workspaceId, {
        workspaceId: member.workspaceId,
        title: member.workspaceId,
        path: '',
        role: member.role ?? 'writable',
        missing: true,
      });
    }
    for (const workspace of workspaces ?? []) {
      const previous = byId.get(workspace.workspaceId);
      byId.set(workspace.workspaceId, {
        workspaceId: workspace.workspaceId,
        title: workspace.title,
        path: workspace.path,
        role: previous?.role ?? 'writable',
        missing: false,
      });
    }
    return [...byId.values()];
  }, [project, workspaces]);

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
    // Membership only. `mergeMembers` keeps each retained member's ROLE and note
    // and keeps a checked id the registry cannot resolve, because the manifest
    // contract is that unresolved members are retained and reported as
    // `missing`. Deriving the list from `workspaces` instead did both wrong at
    // once: every `readonly` member was silently rewritten to `writable`, and a
    // folder that was merely offline was deleted from the project on save.
    const members = mergeMembers(project?.members, [...selected]);
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
        rows.map(row => h('label', {
          key: row.workspaceId,
          className: row.missing ? 'loom-pick loom-pick-missing' : 'loom-pick',
        },
          h('input', {
            type: 'checkbox',
            checked: selected.has(row.workspaceId),
            onChange: () => toggle(row.workspaceId),
          }),
          h('span', { className: 'loom-pick-text' },
            h('span', { className: 'loom-pick-name' },
              h('span', { className: 'loom-pick-title', title: row.title }, row.title),
              // The role is shown, never edited: this dialog edits membership,
              // and a role rewritten here is how `readonly` members were lost.
              h('span', { className: 'loom-pick-role' }, roleLabel(t, row.role)),
            ),
            h('span', {
              className: 'loom-pick-path',
              title: row.missing ? t('missingHint') : row.path,
            }, row.missing ? t('missingHint') : row.path),
          ),
          // The starting folder is a per-project preference, not a rank: it
          // never privileges one folder during discovery. It only appears for a
          // member, because a folder that is not in the project cannot be its
          // starting point — a disabled radio on every row was pure noise.
          selected.has(row.workspaceId) && h('span', {
            className: 'loom-pick-default',
            title: t('defaultStart'),
          },
            h('input', {
              type: 'radio',
              name: 'loom-default',
              checked: defaultId === row.workspaceId,
              onChange: () => setDefaultId(row.workspaceId),
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
 *
 * `onOpenChange` reports that state to the OWNING ROW, which pins itself with
 * `loom-menu-open` while it is true. The row has to do the pinning because the
 * anchor's container is the row's own `.loom-actions`, and a portaled `Menu`
 * re-measures that anchor every frame (see the stylesheet note).
 *
 * Reported through an effect rather than from `onClose` alone: `open` also goes
 * false on an outside pointerdown, Escape, a window blur, and the pointer-leave
 * grace, and the effect covers every one of those without enumerating them.
 */
function RowMenu({ items, onSelect, label, onOpenChange }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (onOpenChange !== undefined) onOpenChange(open);
  }, [open, onOpenChange]);
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
    }, h(IconEllipsisOutlineRegular, { size: 16 })),
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
function SessionRow({ summary, current, onClick, onRename, onFork, onArchive, onMigrate, t }) {
  const title = summary.displayTitle || t('untitled');
  // A blank row is provisional: nothing has happened in it, so a timestamp and
  // the row verbs would all act on content that does not exist yet.
  const settled = summary.blank !== true;
  // While the row menu is open the row pins its own actions, otherwise the
  // anchor collapses the moment the pointer leaves for the dropdown.
  const [menuOpen, setMenuOpen] = React.useState(false);

  const items = [
    { id: 'rename', label: t('rename'), icon: h(IconEditOutlineRegular, null) },
    { id: 'fork', label: t('fork'), icon: h(IconBranchOutlineRegular, null) },
    // "Move to another workspace" is a COPY plus an archive, never a rewrite:
    // DSH stores a session's directory in an immutable header. The dialog
    // states that before anything happens — see `MigrateModal`.
    { id: 'migrate', label: t('migrate'), icon: h(IconShareOutlineRegular, { size: 16 }) },
    { id: 'archive', label: t('archive'), icon: h(IconArchiveOutlineRegular, { size: 16 }) },
  ];

  return h('div', {
    role: 'treeitem',
    tabIndex: 0,
    'aria-selected': current === true,
    className: [
      'loom-row',
      current === true ? 'loom-row-current' : '',
      menuOpen ? 'loom-menu-open' : '',
    ].filter(part => part.length > 0).join(' '),
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
        onOpenChange: setMenuOpen,
        onSelect: id => {
          if (id === 'rename') onRename(summary.id, title);
          if (id === 'fork') onFork(summary.id);
          if (id === 'migrate') onMigrate(summary.id, title);
          if (id === 'archive') onArchive(summary.id);
        },
      })),
  );
}

/** A collapsible group row: its own twisty, name, actions, and session list. */
function LoomGroup({ row, actions, menu, isCollapsed, isExpanded, onToggleCollapse, onToggleExpand, onOpen, onNew, onRename, onFork, onArchive, onMigrate, currentId, claimedBy, t }) {
  const open = !isCollapsed;
  const showAll = isExpanded;
  const PREVIEW = 4;
  const shown = showAll ? row.sessions : row.sessions.slice(0, PREVIEW);
  const hidden = row.sessions.length - PREVIEW;
  const claimed = Array.isArray(claimedBy) && claimedBy.length > 0;
  // See the stylesheet note on `.loom-menu-open`: an open menu must pin the
  // actions it is anchored to, or the anchor collapses as the pointer leaves.
  const [menuOpen, setMenuOpen] = React.useState(false);

  return h('div', { className: 'loom-group' },
    h('div', {
      className: menuOpen ? 'loom-group-head loom-menu-open' : 'loom-group-head',
      role: 'treeitem',
      'aria-expanded': open,
      onClick: () => onToggleCollapse(row.key),
    },
      // The twisty lives in the same 16px slot every row uses, which is what
      // the session list indents to and the guide line aligns under. It stays
      // put: see the note above on why the hover swap was removed.
      h('span', { className: 'loom-slot' },
        h('span', { className: open ? 'loom-twisty' : 'loom-twisty loom-twisty-collapsed' },
          h(IconChevronDownOutlineRegular, { size: 14 }))),
      h('span', { className: 'loom-group-name' }, row.title),
      // A folder a project claims STAYS in this section — a folder is never
      // exclusive to a project — so the row says where else it appears instead
      // of vanishing, which is what made a claimed folder look unbindable.
      claimed && h('span', {
        className: 'loom-claimed',
        title: `${t('claimedBy')}: ${claimedBy.join(', ')}`,
      }, claimedBy.join(' · ')),
      h('span', { className: 'loom-actions' },
        ...(actions ?? []),
        // A workspace row manages itself through this menu. A project row's
        // verbs arrive as `actions` instead, because they belong to the Loom
        // manifest rather than to DSH.
        menu !== undefined && h(RowMenu, {
          label: menu.label,
          items: menu.items,
          onOpenChange: setMenuOpen,
          onSelect: menu.onSelect,
        }),
        h('button', {
          type: 'button',
          className: 'loom-icon-btn',
          title: t('newChat'),
          'aria-label': `${t('newChat')} — ${row.title}`,
          onClick: event => { event.stopPropagation(); onNew(row); },
        }, h(IconPlusOutlineRegular, { size: 16 })),
      ),
    ),

    open && h('div', { className: 'loom-children' },
      row.sessions.length === 0
        // A claimed folder lists NO sessions here because they are already under
        // the claiming project — not because it has none. Saying "no sessions
        // yet" there would be a plain falsehood about the user's data.
        ? h('div', { className: 'loom-empty-section' }, claimed ? t('claimedElsewhere') : t('noSessions'))
        : shown.map(summary => h(SessionRow, {
            key: summary.id,
            summary,
            current: summary.id === currentId,
            onClick: () => onOpen(summary.id),
            onRename,
            onFork,
            onArchive,
            onMigrate,
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

/**
 * Reports whether a main panel is selected, by CALLING the seat.
 *
 * Deliberately its own component. The seat IS a hook, so calling it registers
 * its hooks against whichever component calls it. Doing that from the sidebar
 * itself means the sidebar's hook list grows and shrinks as the seat comes and
 * goes — which happens whenever a `provideRoot()` source is registered or
 * released (the framework's `rebuildRootBinding` re-renders the whole slot tree
 * on any such change, and an HMR reload of the layout plugin does exactly that).
 * React answers a changed hook order with a throw, and a render throw ABDICATES
 * the slot entry — the same silent failure as the icon rename.
 *
 * Because the seat's hooks belong to THIS component, the seat appearing or
 * disappearing now mounts or unmounts this component instead of re-shaping its
 * parent. A missing seat simply renders nothing, and the fallback below stands.
 */
function PanelSeatProbe({ usePanelInfo, onChange }) {
  const active = usePanelInfo(info => (info?.activePanelId ?? null) !== null) === true;
  React.useEffect(() => { onChange(active); }, [active, onChange]);
  return null;
}

function LoomSidebar({
  projects, snapshot, sessionState, panelActive, t,
  onOpenSession, onStartSession, onNewProject, onEditProject, onDeleteProject,
  onPreflightProject,
  onRenameSession, onForkSession, onArchiveSession, onMigrateSession,
  onNewWorkspace, onRenameWorkspace, onDeleteWorkspace,
  chatsCwd, onNewChat, onSetChatsCwd,
}) {
  const [query, setQuery] = React.useState('');
  const [collapsed, setCollapsed] = React.useState(() => new Set());
  const [expanded, setExpanded] = React.useState(() => new Set());

  // The current Session is DERIVED, never read off the store: `SessionListState`
  // has no `current` field, so `sessionState.current` was always `undefined` and
  // every blank Session — including the provisional New Session row — was
  // filtered out. `panelActive` only affects which row is drawn as SELECTED,
  // matching the shipped browser (`deriveSections` keeps the two apart).
  const derived = React.useMemo(
    () => deriveSections({ projects, snapshot, sessionState, panelActive }),
    [projects, snapshot, sessionState, panelActive],
  );

  const needle = query.trim().toLowerCase();
  const keep = summary => needle === '' || String(summary.displayTitle ?? '').toLowerCase().includes(needle);
  // A query keeps a group when the group itself matches, or when any of its
  // sessions does — so searching a project name still shows its sessions.
  //
  // With NO query the list is returned COMPLETE. An earlier version filtered out
  // every row whose session list was empty, which is wrong in two ways once a
  // claimed folder is in play: a claimed folder legitimately lists no sessions
  // (they live under the project), and an empty project is still a project the
  // user made. Both vanished from the section that exists to list them — the
  // exact disappearance this section's rule was changed to prevent.
  const narrow = rows => (needle === ''
    ? rows
    : rows
      .map(row => ({ ...row, sessions: row.sessions.filter(keep) }))
      .filter(row => row.sessions.length > 0
        || String(row.title ?? '').toLowerCase().includes(needle)));

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
    onMigrate: onMigrateSession,
    // A workspace is the shell's own object, so its verbs are the shell's:
    // rename and delete. Delete unregisters the Workspace without touching
    // Sessions or files, so it is not styled as destructive data loss — but it
    // does remove the entry, so the menu marks it danger.
    menu: {
      label: t('workspaceActions'),
      items: [
        { id: 'rename', label: t('renameWorkspace'), icon: h(IconEditOutlineRegular, null) },
        { id: 'delete', label: t('deleteWorkspace'), icon: h(IconTrashOutlineRegular, null), danger: true },
      ],
      onSelect: id => {
        if (id === 'rename') onRenameWorkspace(row.key, row.title);
        if (id === 'delete') onDeleteWorkspace(row.key);
      },
    },
    currentId: derived.highlighted,
    claimedBy: row.claimedBy,
    t,
  });

  // A section is collapsible in its own right, so a user who only wants the
  // workspace list can put the other two away.
  const [hiddenSections, setHiddenSections] = React.useState(() => new Set());
  const toggleSection = toggle(setHiddenSections);

  const sectionHead = (id, label, count, action, first = false) => {
    const open = !hiddenSections.has(id);
    return h('div', {
      className: first ? 'loom-section-head loom-section-head-first' : 'loom-section-head',
    },
      h('button', {
        type: 'button',
        className: 'loom-section-title',
        'aria-expanded': open,
        title: label,
        onClick: () => toggleSection(id),
      },
        h('span', { className: open ? 'loom-twisty' : 'loom-twisty loom-twisty-collapsed' },
          h(IconChevronDownOutlineRegular, { size: 14 })),
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
      h('span', { className: 'loom-search-icon' }, h(IconSearchOutlineRegular, { size: 14 })),
      h('input', {
        type: 'search',
        className: 'loom-search-input',
        value: query,
        placeholder: t('searchPlaceholder'),
        'aria-label': t('searchPlaceholder'),
        onChange: event => setQuery(event.target.value),
        // Escape clears rather than leaving the field with stale text, matching
        // how the shipped search behaves.
        onKeyDown: event => { if (event.key === 'Escape') setQuery(''); },
      }),
      // The clear affordance only exists once there is something to clear, so
      // the resting field stays as quiet as a plain label.
      query.length > 0 && h('button', {
        type: 'button',
        className: 'loom-search-clear',
        'aria-label': t('clearSearch'),
        onClick: () => setQuery(''),
      }, h(IconCloseOutlineRegular, { size: 12 })),
    ),

    nothing && h('div', { className: 'loom-empty-section' }, t('noMatches')),

    sectionHead('projects', t('sectionProjects'), projectRows.length,
      h('button', {
        type: 'button', className: 'loom-icon-btn',
        title: t('newProject'), 'aria-label': t('newProject'), onClick: onNewProject,
      }, h(IconPlusOutlineRegular, { size: 16 })), true),

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
          onMigrate: onMigrateSession,
          currentId: derived.highlighted,
          t,
          // One ellipsis, matching the shipped row affordance. The preflight lives
          // here because it is a verb on a project, not a place to navigate to.
          menu: {
            label: t('projectActions'),
            items: [
              { id: 'preflight', label: t('preflight'), icon: h(IconListPenOutlineRegular, null) },
              { id: 'edit', label: t('edit'), icon: h(IconEditOutlineRegular, null) },
              { id: 'delete', label: t('delete'), icon: h(IconTrashOutlineRegular, null), danger: true },
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
      }, h(IconPlusOutlineRegular, { size: 16 }))),
    sectionBody('workspaces', () => (workspaceRows.length === 0
      ? h('div', { className: 'loom-empty-section' }, t('noWorkspaces'))
      : workspaceRows.map(group))),

    sectionHead('chats', t('sectionChats'), chatSessions.length,
      // A section that lists conversations must be able to start one. This is
      // the ONE section whose sessions have no group row above them (they hang
      // directly off the band), so the group renderer's own `+` never reaches
      // them — 项目 and 工作区 each had an entry point and 聊天 had none at all.
      // The shipped browser has the same gap in its Ungrouped bucket, which
      // makes "there is nowhere to click" look intended rather than missing.
      h('span', { className: 'loom-section-actions' },
        h('button', {
          type: 'button',
          className: 'loom-icon-btn',
          title: chatsCwd === undefined ? t('newChat') : `${t('newChat')} — ${chatsCwd}`,
          'aria-label': t('newChat'),
          onClick: () => onNewChat(),
        }, h(IconPlusOutlineRegular, { size: 16 })),
        // The default folder is a property of this section, so it is edited
        // from the section rather than from a settings surface elsewhere.
        h(RowMenu, {
          label: t('chatsFolder'),
          items: [
            { id: 'set', label: t('setChatsFolder'), icon: h(IconEditOutlineRegular, null) },
            ...chatsCwd === undefined
              ? []
              : [{ id: 'clear', label: t('clearChatsFolder'), icon: h(IconTrashOutlineRegular, null), danger: true }],
          ],
          onSelect: id => {
            // Two DISTINCT verbs, named rather than signalled by an argument's
            // presence: an `undefined` argument would mean both "ask the user
            // to pick" and "clear it", and the two would be one refactor apart
            // from swapping places.
            if (id === 'set') onSetChatsCwd('pick');
            if (id === 'clear') onSetChatsCwd('clear');
          },
        }))),
    sectionBody('chats', () => (chatSessions.length === 0
      // The empty state names where a new chat will actually go, so the `+`
      // above it is not the only clue about what it does.
      ? h('div', { className: 'loom-empty-section' },
          chatsCwd === undefined
            ? `${t('noChats')} · ${t('chatsFolderHint')}`
            : `${t('noChats')} · ${t('chatsFolder')}：${chatsCwd}`)
      // Same container a group uses for its sessions, so a chat is drawn as a
      // CHILD of its section rather than as a sibling of the section header.
      : h('div', { className: 'loom-children loom-children-section' },
          chatSessions.map(summary => h(SessionRow, {
            key: summary.id,
            summary,
            current: summary.id === derived.highlighted,
            onClick: () => onOpenSession(summary.id),
            onRename: onRenameSession,
            onFork: onForkSession,
            onArchive: onArchiveSession,
            onMigrate: onMigrateSession,
            t,
          }))))),
  );
}

/**
 * An in-app folder browser built from the BROWSE primitives.
 *
 * Why this exists at all. The directory-picking seam has two interchangeable
 * backends, and they expose different verbs
 * (`host/directory-picker/src/index.ts`): a `native` backend offers
 * `pick()` — one OS chooser — while a `browse` backend offers only
 * `list()`/`createDirectory()`. `uiWorkspace.pickDirectory()` calls `pick()`
 * unconditionally, so on a `browse` composition it rejects with
 * `directoryPicker.pick needs the native capability; the composed picker serves
 * "browse"` (raised by `DirectoryPickerController.requireCapability`). Which
 * backend a machine gets is decided at boot by `directory-picker-auto`: a
 * loopback-bound, non-SSH Windows/macOS host gets `native`, everything else —
 * notably any remote browser — gets `browse`.
 *
 * So the correct consumer does what the seam's own documentation says and
 * switches on `capability().kind`, except that the capability is not visible
 * from the client: the wire exposes the verbs, not the kind. The verbs are
 * observable instead — `pick` failing with that specific refusal IS the
 * capability test. This dialog is the answer for the browse case, and the
 * caller tries `pick()` first so the common local case still gets the real OS
 * chooser rather than a worse reimplementation of it.
 *
 * Deliberately a folder BROWSER and not a path text box: it is the same
 * interaction DSH's own `ui-directory-picker-browse` package shows in the
 * shipped New-Workspace flow, so the two entry points behave alike.
 */
function FolderPickerModal({ initialPath, browse, t, onClose, onPicked }) {
  const [listing, setListing] = React.useState(undefined);
  const [failure, setFailure] = React.useState('');
  const [manual, setManual] = React.useState('');
  const [showManual, setShowManual] = React.useState(false);

  const open = React.useCallback(async path => {
    setFailure('');
    try {
      const value = await browse.list(path);
      setListing(value);
    } catch (cause) {
      setFailure(interpolate(t('pickFolderFailedLoad'), { message: String(cause.message ?? cause) }));
    }
  }, [browse, t]);

  // Opens at the caller's hint (the currently configured folder, when there is
  // one) so "change my default folder" lands where the user already is.
  React.useEffect(() => { void open(initialPath); }, [open, initialPath]);

  const entries = listing?.entries ?? [];

  return h(Modal, {
    open: true,
    onClose,
    title: t('pickFolderTitle'),
    description: listing === undefined ? undefined : listing.path,
    closeLabel: t('close'),
    footer: h(React.Fragment, null,
      h(Button, { variant: 'ghost', onClick: () => setShowManual(value => !value) }, t('pickFolderManual')),
      h(Button, { variant: 'outline', onClick: onClose }, t('cancel')),
      // Committing takes the folder being VIEWED, which is what a browser-shaped
      // dialog implies — the alternative (select-then-confirm) needs a selection
      // state that adds nothing to choosing a single directory.
      h(Button, {
        variant: 'primary',
        disabled: listing === undefined,
        onClick: () => onPicked(listing.path),
      }, t('pickFolderSelect'))),
  },
    failure.length > 0 && h('div', { className: 'loom-warn' }, failure),

    showManual && h('div', { className: 'loom-plan' },
      h(Input, {
        value: manual,
        placeholder: 'C:\\path\\to\\folder',
        'aria-label': t('pickFolderManual'),
        onChange: event => setManual(event.target.value),
      }),
      h(Button, {
        variant: 'primary',
        disabled: manual.trim().length === 0,
        onClick: () => onPicked(manual.trim()),
      }, t('pickFolderManualApply'))),

    listing === undefined
      ? h('div', { className: 'loom-empty-section' }, t('pickFolderLoading'))
      : h(React.Fragment, null,
          // Every ancestor is a jump target, so the user can walk up without a
          // dedicated ".." row. The list comes from the host, which is the only
          // side that knows how to spell a path on this platform.
          h('div', { className: 'loom-plan-list' },
            ...(listing.crumbs ?? []).map(crumb => h('button', {
              key: crumb.path,
              type: 'button',
              className: 'loom-crumb',
              onClick: () => { void open(crumb.path); },
            }, crumb.name))),
          entries.length === 0
            ? h('div', { className: 'loom-empty-section' }, t('pickFolderEmpty'))
            : h('div', { className: 'loom-plan-list' },
                ...entries.map(entry => h('button', {
                  key: entry.path,
                  type: 'button',
                  className: 'loom-folder-row',
                  onClick: () => { void open(entry.path); },
                }, entry.name))),
          listing.truncated === true
            && h('div', { className: 'loom-empty-section' }, t('pickFolderTruncated'))));
}

/**
 * "Move this conversation to another workspace", as a dialog that explains
 * itself BEFORE anything happens.
 *
 * The dialog exists because the operation cannot do what its name suggests. DSH
 * keeps a session's directory in an immutable header, so there is no move: the
 * host copies the completed history into a NEW session whose cwd is the target
 * folder, and the caller archives the original. Each of those facts is a
 * sentence here rather than a surprise afterwards:
 *
 *   - the copy is a separate session, not a branch (so it is not in the
 *     original's fork lineage, and edits do not flow between them);
 *   - the original is ARCHIVED, not deleted (archiving only hides it);
 *   - skills, instruction files, and the write boundary all follow the NEW
 *     folder — which is the entire point of moving;
 *   - a refusal is shown as its named reason, never as a dead button.
 */
function MigrateModal({ sessionId, sessionTitle, snapshot, bridge, t, onClose, onDone, onArchive }) {
  const workspaces = (snapshot?.items ?? []).filter(item => item.path !== undefined);
  const source = (snapshot?.items ?? []).find(item =>
    Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId));
  const candidates = workspaces.filter(item => item.workspaceId !== source?.workspaceId);

  const [targetId, setTargetId] = React.useState(candidates[0]?.workspaceId);
  const [plan, setPlan] = React.useState(undefined);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState('');

  // Re-planned whenever the target changes: the copy count and the refusal
  // reason are properties of the PAIR, not of the session alone.
  React.useEffect(() => {
    let live = true;
    if (targetId === undefined) {
      setPlan(undefined);
      return () => { live = false; };
    }
    setBusy(true);
    setFailure('');
    bridge.planMigration(sessionId, targetId)
      .then(value => { if (live) setPlan(value.plan); })
      .catch(cause => { if (live) setFailure(String(cause.message ?? cause)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [bridge, sessionId, targetId]);

  // An explicit map, not a name transformation: a computed key would silently
  // render the raw reason string the moment a reason is renamed, and the user
  // would see `no-completed-turn` instead of a sentence.
  const reasonText = (reason, message) => {
    const known = {
      'source-missing': t('migrateSourceMissing'),
      'no-cwd': t('migrateNoCwd'),
      'no-completed-turn': t('migrateNoTurn'),
      'session-running': t('migrateRunning'),
      'same-workspace': t('migrateSame'),
      'no-target': t('migrateNoTarget'),
      'migration-unavailable': interpolate(t('migrateUnavailable'), { message: message ?? '' }),
      'migration-target-missing': t('migrateWorkspaceMissing'),
      'migration-source-unreadable': t('migrateSourceMissing'),
    }[reason];
    // An unrecognized reason still says something true rather than nothing.
    return known ?? interpolate(t('migrateFailed'), { message: reason ?? '' });
  };

  const confirm = async () => {
    if (plan?.available !== true || targetId === undefined) return;
    setBusy(true);
    setFailure('');
    try {
      const value = await bridge.migrateSession(sessionId, targetId);
      // Archived AFTER the copy exists, so a failure here leaves the user with
      // a working new session rather than nothing.
      let archiveError;
      try {
        await onArchive(sessionId);
      } catch (cause) {
        archiveError = String(cause?.message ?? cause);
      }
      onDone({
        sessionId: value.sessionId,
        targetTitle: plan.title,
        copiedEvents: value.copiedEvents,
        droppedEvents: value.droppedEvents,
        archiveError,
        attached: value.attached,
      });
    } catch (cause) {
      setFailure(String(cause.message ?? cause));
    } finally {
      setBusy(false);
    }
  };

  return h(Modal, {
    open: true,
    onClose,
    title: t('migrateTitle'),
    description: sessionTitle,
    closeLabel: t('cancel'),
    className: 'loom-editor',
    // The Modal atom owns the footer's layout, so the actions are passed as its
    // `footer` prop rather than wrapped in a container of our own — the same
    // shape every other dialog here uses. The confirm button is DISABLED while
    // the plan refuses, and the refusal is stated in the body above it, so a
    // greyed-out button never has to explain itself.
    footer: h(React.Fragment, null,
      h(Button, { variant: 'outline', onClick: onClose }, t('cancel')),
      h(Button, {
        variant: 'primary',
        disabled: plan?.available !== true || busy,
        onClick: () => { void confirm(); },
      }, t('migrate'))),
  },
    candidates.length === 0
      ? h('div', { className: 'loom-muted' }, t('migrateNoTarget'))
      : h('div', { className: 'loom-migrate' },
          h('div', { className: 'loom-field' },
            h('span', { className: 'loom-field-label' }, t('migrateTarget')),
            h('select', {
              className: 'loom-input',
              value: targetId ?? '',
              'aria-label': t('migrateTarget'),
              onChange: event => setTargetId(event.target.value),
            }, candidates.map(item => h('option', {
              key: item.workspaceId,
              value: item.workspaceId,
            }, `${item.title || item.path} — ${item.path}`)))),

          busy && plan === undefined && h('div', { className: 'loom-muted' }, t('running')),

          plan !== undefined && h('div', { className: 'loom-plan' },
            h('div', { className: 'loom-field-label' }, t('migratePlan')),
            plan.available === true
              ? h('ul', { className: 'loom-plan-list' },
                  h('li', null, interpolate(t('migrateWillCopy'), { count: plan.copiedEvents })
                    + (plan.droppedEvents > 0
                      ? interpolate(t('migrateWillDrop'), { count: plan.droppedEvents })
                      : '')),
                  h('li', null, t('migrateKeepsSource')),
                  h('li', null, t('migrateNotBranch')),
                  h('li', null, t('migrateContextFollows')),
                  h('li', null, t('migrateSameTitle')))
              : h('div', { className: 'loom-warn' }, reasonText(plan.reason, plan.message))),

          failure.length > 0 && h('div', { className: 'loom-warn' }, failure)),
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
  function LoomSidebarSeated({ useWorkspaces, useSessions, usePanelInfo, bridge, ctx, t }) {
    const snapshot = useWorkspaces(state => state);
    const sessionState = useSessions(state => state);
    // Whether a main panel is selected — read through a CHILD component, so the
    // seat's own hooks belong to that child rather than to this one. See
    // `PanelSeatProbe`: calling the seat here would change THIS component's hook
    // order whenever the seat came or went, and React answers that with a throw.
    const [panelActive, setPanelActive] = React.useState(false);
    const [manifest, setManifest] = React.useState(undefined);
    /**
     * The same manifest, always current.
     *
     * `put` is a `useCallback` that must not depend on the manifest value — a
     * dependency there would rebuild the callback on every save and re-render
     * every consumer of it. Reading through a ref keeps the write path's
     * closure old but its DATA fresh, which is exactly what "do not drop the
     * keys I am not editing" needs.
     */
    const manifestRef = React.useRef(undefined);
    const [error, setError] = React.useState('');
    /**
     * A transient, non-error note.
     *
     * Separate from `error` on purpose: this one reports a SUCCESSFUL action
     * whose consequence needs saying (the chosen chat folder is also a
     * workspace). Routing it through `error` would style a correct outcome as
     * a failure and leave it in the same slot the user reads as "something
     * broke".
     */
    const [notice, setNotice] = React.useState('');
    const [editing, setEditing] = React.useState(null);
    const [renaming, setRenaming] = React.useState(null);
    const [preflighting, setPreflighting] = React.useState(null);
    const [migrating, setMigrating] = React.useState(null);
    const [migrated, setMigrated] = React.useState(null);
    /**
     * The folder browser, when the native chooser is unavailable.
     *
     * `folderResolve` carries the pending `pickFolder` promise across the dialog
     * rather than stashing it in state: state updates are asynchronous and a
     * ref keeps the settle path synchronous with the click that caused it.
     */
    const [picking, setPicking] = React.useState(null);
    const folderResolve = React.useRef(undefined);

    const reload = React.useCallback(async () => {
      try {
        const value = await bridge.getManifest();
        manifestRef.current = value.manifest;
        setManifest(value.manifest);
        setError(value.ok === false ? String(value.error ?? '') : '');
      } catch (cause) {
        setError(cause.message);
      }
    }, [bridge]);

    React.useEffect(() => { void reload(); }, [reload]);

    /**
     * Write the manifest back, carrying every key this dialog does not own.
     *
     * The previous version sent `{ schemaVersion, projects }` and nothing else,
     * which was correct while projects were the whole manifest. It is not any
     * more: a whole-manifest preference placed beside `projects` (the default
     * chat folder) would be dropped by ANY project edit — silently, because the
     * host re-normalizes what it is handed and answers with a manifest that
     * simply lacks the key. Merging is what keeps "rename a project" from also
     * resetting where new chats start.
     */
    const put = React.useCallback(async patch => {
      try {
        const current = manifestRef.current ?? {};
        const value = await bridge.putManifest({
          schemaVersion: 2,
          ...current,
          ...patch,
          projects: patch.projects ?? current.projects ?? [],
        });
        manifestRef.current = value.manifest;
        setManifest(value.manifest);
      } catch (cause) {
        setError(interpolate(t('saveFailed'), { message: cause.message }));
      }
    }, [bridge, t]);

    const projects = manifest?.projects ?? [];
    const chatsCwd = typeof manifest?.chatsCwd === 'string' ? manifest.chatsCwd : undefined;

    /**
     * The registered workspace whose folder is `path`, if any.
     *
     * Spelling-tolerant for the same reason the hint is: a path the user typed
     * (or that came back from the native picker with a different separator or
     * trailing slash) must still resolve to the workspace it names. It only
     * decides which DSH verb runs, so a miss costs a differently-grouped new
     * session, never a wrong grouping of an existing one.
     */
    const workspaceForPath = path => (snapshot?.items ?? [])
      .find(item => comparablePath(item.path) === comparablePath(path));

    /**
     * Ask for a folder, using whichever picking capability this composition has.
     *
     * `uiWorkspace.pickDirectory()` is the native verb and ONLY the native verb:
     * on a `browse` composition it rejects with `directoryPicker.pick needs the
     * native capability` (`DirectoryPickerController.requireCapability`), which
     * is a refusal to serve, not a failure to try. The client cannot read the
     * capability kind — the wire exposes verbs, not kinds — so the refusal
     * itself is the signal. An earlier version let that error reach the user as
     * "保存失败", which is both alarming and wrong: nothing failed to save, and
     * the folder chooser simply was not there.
     *
     * Resolves `{ path }` when a folder was chosen, `{ cancelled: true }` when
     * the user dismissed a chooser (a decision, not an error), and
     * `{ unavailable: true }` when neither capability exists — the caller then
     * hides the affordance rather than leaving a control that can only fail,
     * which is the seam's own documented rule for an unknown kind.
     *
     * Declared BEFORE its callers on purpose: these are `const` bindings, so a
     * later declaration is a temporal-dead-zone ReferenceError at first render,
     * not a hoisted function.
     */
    const pickFolder = React.useCallback(async initialPath => {
      const navigation = ctx.get('uiWorkspace');
      if (navigation === undefined) return { unavailable: true };
      try {
        const picked = await navigation.pickDirectory();
        // A null result is a dismissal; only a THROW means the verb is absent.
        return typeof picked === 'string' && picked.length > 0 ? { path: picked } : { cancelled: true };
      } catch (cause) {
        if (!String(cause?.message ?? cause).includes('native capability')) throw cause;
      }
      // Browse-only composition: Loom's own browser, driven by the two browse
      // verbs the wire does expose. The promise settles when the dialog does,
      // so callers read one shape whichever capability served them.
      return await new Promise(resolve => {
        folderResolve.current = resolve;
        setPicking({ initialPath });
      });
    }, [ctx]);

    /** Close the folder browser, settling whatever was waiting on it. */
    const settlePicking = React.useCallback(outcome => {
      folderResolve.current?.(outcome);
      folderResolve.current = undefined;
      setPicking(null);
    }, []);

    /**
     * Start a conversation with no folder of its own.
     *
     * With no default folder the picker runs FIRST and the choice is remembered,
     * so the second click needs no dialog. That ordering matters: a `+` that
     * silently created yet another session in whatever folder DSH last used is
     * exactly the behaviour the 聊天 section had — none at all.
     */
    const startChat = React.useCallback(async () => {
      const navigation = ctx.get('uiWorkspace');
      if (navigation === undefined) return;
      try {
        let target = chatsCwd;
        if (target === undefined) {
          const picked = await pickFolder(undefined);
          // A dismissal is a decision; an unavailable chooser is reported once,
          // in the folder menu, where the user can act on it — not on every `+`.
          if (picked.path === undefined) return;
          target = picked.path;
          await put({ chatsCwd: picked.path });
        }
        // An already-registered folder goes through DSH's own New Session flow,
        // which reuses a blank session instead of piling up duplicates.
        const workspace = workspaceForPath(target);
        if (workspace !== undefined) {
          navigation.startSession(workspace.workspaceId);
          return;
        }
        const sessionId = await ctx.sessions.create({ cwd: target });
        // Through the navigation face, NOT `ctx.sessions.open`: the latter
        // leaves a selected main panel in place and strands the user on it.
        navigation.openSession(sessionId);
      } catch (cause) {
        setError(interpolate(t('saveFailed'), { message: cause.message }));
      }
    }, [ctx, chatsCwd, pickFolder, put, t]);

    const setChatsFolder = React.useCallback(async explicit => {
      try {
        const picked = explicit ?? (await pickFolder(chatsCwd)).path;
        if (typeof picked !== 'string' || picked.length === 0) return;
        await put({ chatsCwd: picked });
        // The folder is stored either way — it is a valid choice. But when it
        // is ALSO a registered workspace, a new chat will join that workspace
        // rather than appear under 聊天, and the user is told now rather than
        // left to conclude the setting did nothing.
        setNotice(workspaceForPath(picked) === undefined ? '' : t('chatsFolderIsWorkspace'));
      } catch (cause) {
        setError(interpolate(t('saveFailed'), { message: cause.message }));
      }
    }, [pickFolder, chatsCwd, put, t]);

    const clearChatsFolder = React.useCallback(() => {
      // `undefined` is normalized away by the host, so this removes the key
      // rather than storing a blank one.
      setNotice('');
      void put({ chatsCwd: undefined });
    }, [put]);

    return h(React.Fragment, null,
      usePanelInfo !== undefined
        && h(PanelSeatProbe, { usePanelInfo, onChange: setPanelActive }),
      error.length > 0 && h('div', { className: 'loom-empty-section loom-warn' }, error),
      notice.length > 0 && h('div', { className: 'loom-empty-section loom-muted' }, notice),
      h(LoomSidebar, {
        projects,
        snapshot,
        sessionState,
        panelActive,
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
        onDeleteProject: project => {
          void put({ projects: projects.filter(item => item.id !== project.id) });
        },
        onPreflightProject: project => setPreflighting(project),

        // The 聊天 section's own entry point and its default folder.
        chatsCwd,
        onNewChat: () => { void startChat(); },
        onSetChatsCwd: verb => {
          if (verb === 'clear') clearChatsFolder();
          else void setChatsFolder(undefined);
        },
        onMigrateSession: (id, title) => setMigrating({ id, title }),

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
          try {
            // The same chooser the 聊天 band uses, so a browse-only composition
            // can register a workspace at all. This call site predates that work
            // and had the identical defect: it reached for the native verb
            // directly, so "new workspace" could only ever fail on a remote
            // browser — it just had nothing to contrast with, which is why it
            // went unnoticed.
            const picked = await pickFolder(undefined);
            if (picked.path === undefined) return;
            await ctx.workspaces.create({ path: picked.path });
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

      picking !== null && h(FolderPickerModal, {
        initialPath: picking.initialPath,
        // The two BROWSE verbs. Bound to `ctx` rather than to the roomier
        // `listDirectory`/`createDirectory` on the navigation face for the same
        // reason: they are the primitive pair the wire actually exposes.
        browse: {
          list: path => {
            const navigation = ctx.get('uiWorkspace');
            if (navigation === undefined || typeof navigation.listDirectory !== 'function') {
              return Promise.reject(new Error('no directory browser'));
            }
            // An absent path means "the home directory" to the host, which is
            // the right first level when there is nothing configured yet.
            return navigation.listDirectory(path);
          },
        },
        t,
        onClose: () => settlePicking({ cancelled: true }),
        onPicked: path => settlePicking({ path }),
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
        onSave: project => {
          void put({ projects: [...projects.filter(item => item.id !== project.id), project] });
        },
        onClose: () => setEditing(null),
        t,
      }),

      migrating !== null && h(MigrateModal, {
        sessionId: migrating.id,
        sessionTitle: migrating.title,
        snapshot,
        bridge,
        t,
        onClose: () => setMigrating(null),
        // Archiving is attempted by the dialog so a failure is reported beside
        // the copy that DID succeed, rather than discarding that fact.
        onArchive: sessionId => {
          const navigation = ctx.get('uiWorkspace');
          if (navigation === undefined) throw new Error('uiWorkspace is unavailable');
          return navigation.archiveSession(sessionId);
        },
        onDone: result => {
          setMigrating(null);
          setMigrated(result);
        },
      }),

      // The result is a dialog of its own, because the two things it must
      // report — "the new session exists" and "the original may still be
      // listed" — are true together and need more than a toast's worth of room.
      migrated !== null && h(Modal, {
        open: true,
        onClose: () => setMigrated(null),
        title: t('migrateTitle'),
        description: interpolate(t('migrateDone'), { title: migrated.targetTitle }),
        closeLabel: t('close'),
        footer: h(React.Fragment, null,
          h(Button, { variant: 'outline', onClick: () => setMigrated(null) }, t('close')),
          h(Button, {
            variant: 'primary',
            onClick: () => {
              const navigation = ctx.get('uiWorkspace');
              const target = migrated.sessionId;
              setMigrated(null);
              if (navigation !== undefined) navigation.openSession(target);
            },
          }, t('migrateOpen'))),
      },
        h('div', { className: 'loom-plan' },
          h('div', null, interpolate(t('migrateWillCopy'), { count: migrated.copiedEvents })
            + (migrated.droppedEvents > 0
              ? interpolate(t('migrateWillDrop'), { count: migrated.droppedEvents })
              : '')),
          h('div', null, t('migrateSameTitle')),
          h('div', null, t('migrateContextFollows')),
          // Partial successes are stated, never swallowed: both sessions exist.
          migrated.archiveError !== undefined
            && h('div', { className: 'loom-warn' },
                interpolate(t('migratePartialArchive'), { message: migrated.archiveError })),
          // Attaching failed, but the copy exists AND its cwd already equals
          // the target path — so Loom's own "resident" rule still lists it
          // under that workspace. Saying what is true beats either silence or
          // the plan's generic sentence, which was here before and described
          // the wrong thing entirely.
          migrated.attached === false
            && h('div', { className: 'loom-warn-note' }, t('migrateAttachFailed')))),
    );
  }

  /**
   * The seat check.
   *
   * The two REQUIRED seats are checked here, before the seated component mounts,
   * because a hook called conditionally changes the hook order between renders —
   * which React treats as a crash. `usePanelInfo` is passed through only when it
   * is a function: it is OPTIONAL, and when it is absent nothing calls it (the
   * probe is not mounted), so no hook order depends on it.
   */
  return function LoomSidebarBound(props) {
    const { useWorkspaces, useSessions, usePanelInfo, t: seatT } = props ?? {};
    if (typeof useWorkspaces !== 'function' || typeof useSessions !== 'function') return null;
    return h(LoomSidebarSeated, {
      useWorkspaces,
      useSessions,
      // Undefined when absent, never a substitute hook: the substitute used to
      // live here and its hook count differed from the real seat's, so a seat
      // that appeared later reshaped the caller's hook list and crashed it.
      usePanelInfo: typeof usePanelInfo === 'function' ? usePanelInfo : undefined,
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

  /**
   * One line saying whether the client half can do its job at all.
   *
   * `probe` reads a slot fact without letting a missing method break the
   * diagnostic: the slot service's surface is not a stable contract (0.2 dropped
   * `declarationEpoch` from the exposed object, which turned this report into a
   * wall of "is not a function"), and a diagnostic that throws is worse than no
   * diagnostic. Callers must still be told, so the failure is reported as a
   * value rather than escalated.
   */
  const probe = read => {
    try {
      return read();
    } catch (error) {
      return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  report(bridge, {
    event: 'apply',
    ok: true,
    hasSlots: ctx.slots !== undefined,
    hasInject: typeof ctx.slots?.inject === 'function',
    hasRegister: typeof ctx.slots?.register === 'function',
    // A slot that is not yet DECLARED makes `slots.inject` return early, so this
    // records whether the declaration had already landed when Loom applied.
    sidebarSpec: probe(() => ctx.slots.spec('sidebar') !== undefined),
    workspacesSpec: probe(() => ctx.slots.spec('sidebar.workspaces') !== undefined),
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
  LoomSidebar, LoomSidebarHost, MigrateModal, PreflightModal, PreflightPanel, ProjectEditor,
  apply, createBridge, deriveSections, inject, name, renderPlanText,
};

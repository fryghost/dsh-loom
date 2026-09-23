window.__ModuleLoader__.load({ id: 'dsh-loom', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/core/sections.cjs
var require_sections = __commonJS({
  "src/core/sections.cjs"(exports2, module2) {
    function sessionVisible(summary, current, archived) {
      return summary.origin !== "subagent" && !archived.has(summary.id) && (!summary.blank || summary.id === current);
    }
    function deriveSections2({ projects, snapshot, sessionState } = {}) {
      const byId = sessionState && sessionState.byId || {};
      const archived = new Set(snapshot && snapshot.archivedSessionIds || []);
      const current = sessionState && sessionState.current;
      const workspaces = snapshot && snapshot.items || [];
      const workspaceById = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace]));
      const claimedWorkspaceIds = /* @__PURE__ */ new Set();
      for (const project of projects || []) {
        for (const member of project.members || []) claimedWorkspaceIds.add(member.workspaceId);
      }
      const collect = (ids) => {
        const visible = [...new Set(ids)].map((id) => byId[id]).filter((summary) => summary !== void 0 && sessionVisible(summary, current, archived)).sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
        const blankAt = visible.findIndex((summary) => summary.blank === true);
        if (blankAt > 0) visible.unshift(...visible.splice(blankAt, 1));
        return visible;
      };
      const projectRows = (projects || []).map((project) => ({
        key: project.id,
        project,
        title: project.title,
        folders: (project.members || []).length,
        // Where the row's New chat starts. A declared starting folder only picks a
        // starting point; membership never privileges one folder during discovery.
        startWorkspaceId: project.defaultWorkspaceId || project.members && project.members[0] && project.members[0].workspaceId,
        sessions: collect((project.members || []).flatMap((member) => {
          const workspace = workspaceById.get(member.workspaceId);
          return workspace && workspace.sessionIds || [];
        }))
      }));
      const workspaceRows = workspaces.filter((workspace) => !claimedWorkspaceIds.has(workspace.workspaceId)).map((workspace) => ({
        key: workspace.workspaceId,
        title: workspace.title || workspace.path,
        startWorkspaceId: workspace.workspaceId,
        sessions: collect(workspace.sessionIds || [])
      }));
      const attributed = /* @__PURE__ */ new Set();
      for (const row of projectRows) for (const summary of row.sessions) attributed.add(summary.id);
      for (const row of workspaceRows) for (const summary of row.sessions) attributed.add(summary.id);
      const chatSessions = collect(sessionState && sessionState.ids || []).filter((summary) => !attributed.has(summary.id));
      return { projectRows, workspaceRows, chatSessions };
    }
    module2.exports = { deriveSections: deriveSections2, sessionVisible };
  }
});

// src/client.cjs
var React = require("react");
var {
  Button,
  Tag,
  StateDot,
  Modal,
  Input,
  Menu,
  IconFolderOpenOutline16,
  IconPlusOutline16,
  IconChevronDownOutline14,
  IconEllipsisOutline16,
  IconEditOutline16,
  IconTrashOutline16,
  IconBranchOutline16,
  IconArchiveOutline20,
  IconListPenOutline16
} = require("@deepseek-ai/dsh-client-ui-primitives");
var h = React.createElement;
var NS = "dsh-loom";
var CHANNEL = "/dsh-loom";
var { deriveSections } = require_sections();
var dictionaries = {
  zh: {
    projects: "\u9879\u76EE",
    newProject: "\u65B0\u5EFA\u9879\u76EE",
    projectName: "\u9879\u76EE\u540D\u79F0",
    folders: "\u6587\u4EF6\u5939",
    addFolder: "\u6DFB\u52A0\u6587\u4EF6\u5939",
    removeFolder: "\u79FB\u51FA",
    noProjects: "\u8FD8\u6CA1\u6709\u9879\u76EE",
    noFolders: "\u8FD9\u4E2A\u9879\u76EE\u8FD8\u6CA1\u6709\u6587\u4EF6\u5939",
    save: "\u4FDD\u5B58",
    cancel: "\u53D6\u6D88",
    edit: "\u7F16\u8F91",
    delete: "\u5220\u9664",
    preflight: "\u4E0A\u4E0B\u6587\u9884\u68C0",
    preflightHint: "\u5728\u5F00\u59CB\u4F1A\u8BDD\u524D\uFF0C\u67E5\u770B\u8FD9\u4E2A\u9879\u76EE\u5B9E\u9645\u4F1A\u52A0\u8F7D\u4EC0\u4E48\u3002",
    running: "\u6B63\u5728\u5206\u6790\u2026",
    skills: "\u6280\u80FD",
    noSkills: "\u6CA1\u6709\u6280\u80FD",
    collisions: "\u540D\u79F0\u51B2\u7A81",
    collisionHint: "\u540C\u540D\u6280\u80FD\u53EA\u4F1A\u751F\u6548\u4E00\u4E2A\uFF1B\u4E0B\u9762\u662F\u88AB\u906E\u853D\u7684\u6765\u6E90\u3002",
    winner: "\u751F\u6548",
    shadowed: "\u88AB\u906E\u853D",
    instructions: "\u6307\u4EE4\u6587\u4EF6",
    noInstructions: "\u6CA1\u6709\u6307\u4EE4\u6587\u4EF6",
    writeScope: "\u5199\u5165\u8303\u56F4",
    silentFolders: "\u672A\u8D21\u732E\u7684\u6587\u4EF6\u5939",
    silentHint: "\u8FD9\u4E9B\u6587\u4EF6\u5939\u5F53\u524D\u6CA1\u6709\u5411\u4F1A\u8BDD\u63D0\u4F9B\u4EFB\u4F55\u5185\u5BB9\u3002",
    from: "\u6765\u81EA",
    role: "\u89D2\u8272",
    writable: "\u53EF\u5199",
    readonly: "\u53EA\u8BFB",
    missing: "\u5DF2\u5931\u8054",
    missingHint: "\u8BE5\u6587\u4EF6\u5939\u5F53\u524D\u65E0\u6CD5\u89E3\u6790\uFF1B\u9879\u76EE\u4ECD\u4FDD\u7559\u6B64\u6210\u5458\u3002",
    copyPlan: "\u590D\u5236\u9884\u68C0\u7ED3\u679C",
    copied: "\u5DF2\u590D\u5236",
    refresh: "\u91CD\u65B0\u5206\u6790",
    needName: "\u8BF7\u8F93\u5165\u9879\u76EE\u540D\u79F0\u3002",
    needFolder: "\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u6587\u4EF6\u5939\u3002",
    loadFailed: "\u8BFB\u53D6\u9879\u76EE\u5931\u8D25\uFF1A{message}",
    saveFailed: "\u4FDD\u5B58\u5931\u8D25\uFF1A{message}",
    unsupported: "\u9879\u76EE\u6587\u4EF6\u7531\u66F4\u65B0\u7248\u672C\u7684\u63D2\u4EF6\u5199\u5165\uFF0C\u5DF2\u505C\u6B62\u8BFB\u53D6\u4EE5\u514D\u8986\u76D6\u3002",
    contributing: "{count} \u4E2A\u6587\u4EF6\u5939\u5728\u8D21\u732E\u5185\u5BB9",
    memberCount: "{count} \u4E2A\u6587\u4EF6\u5939",
    subtitle: "\u628A\u591A\u4E2A\u6587\u4EF6\u5939\u7EC7\u6210\u4E00\u4E2A\u4F1A\u8BDD\u4E0A\u4E0B\u6587\u3002",
    emptyTitle: "\u8FD8\u6CA1\u6709\u9879\u76EE",
    emptyHint: "\u65B0\u5EFA\u4E00\u4E2A\u9879\u76EE\uFF0C\u6307\u5411\u4E24\u4E2A\u6216\u66F4\u591A\u6587\u4EF6\u5939\u3002\u5B83\u4EEC\u7684\u6280\u80FD\u3001\u6307\u4EE4\u4E0E\u4E0A\u4E0B\u6587\u4F1A\u4E00\u8D77\u8FDB\u5165\u540C\u4E00\u4E2A\u4F1A\u8BDD\u3002",
    memberList: "\u53C2\u4E0E\u7684\u6587\u4EF6\u5939",
    defaultStart: "\u9ED8\u8BA4\u8D77\u70B9",
    folderPicker: "\u52FE\u9009\u53C2\u4E0E\u7684\u6587\u4EF6\u5939",
    folderPickerHint: "\u6587\u4EF6\u5939\u53EF\u4EE5\u540C\u65F6\u5C5E\u4E8E\u591A\u4E2A\u9879\u76EE\u3002\u4EFB\u4F55\u4E00\u4E2A\u6587\u4EF6\u5939\u90FD\u53EF\u4EE5\u4F5C\u4E3A\u9ED8\u8BA4\u8D77\u70B9\uFF0C\u8FD9\u4E0D\u5F71\u54CD\u5B83\u80FD\u8D21\u732E\u4EC0\u4E48\u3002",
    writeBoundaryTitle: "\u5199\u5165\u8303\u56F4",
    sectionProjects: "\u9879\u76EE",
    sectionWorkspaces: "\u5DE5\u4F5C\u533A",
    sectionChats: "\u804A\u5929",
    newChat: "\u65B0\u5BF9\u8BDD",
    searchPlaceholder: "\u641C\u7D22\u4F1A\u8BDD",
    showMore: "\u5C55\u5F00\u5176\u4F59 {count} \u4E2A\u4F1A\u8BDD",
    showLess: "\u6536\u8D77",
    untitled: "\u672A\u547D\u540D\u4F1A\u8BDD",
    noSessions: "\u8FD8\u6CA1\u6709\u4F1A\u8BDD",
    noWorkspaces: "\u6CA1\u6709\u672A\u5F52\u5165\u9879\u76EE\u7684\u5DE5\u4F5C\u533A",
    noChats: "\u6CA1\u6709\u672A\u5F52\u5C5E\u7684\u4F1A\u8BDD",
    noMatches: "\u6CA1\u6709\u5339\u914D\u7684\u4F1A\u8BDD",
    justNow: "\u521A\u521A",
    minutesAgo: "{count} \u5206\u949F",
    hoursAgo: "{count} \u5C0F\u65F6",
    daysAgo: "{count} \u5929",
    folderCount: "{count} \u4E2A\u6587\u4EF6\u5939",
    rename: "\u91CD\u547D\u540D",
    fork: "\u521B\u5EFA\u5206\u652F",
    archive: "\u5F52\u6863",
    sessionActions: "\u4F1A\u8BDD\u64CD\u4F5C",
    renameSession: "\u91CD\u547D\u540D\u4F1A\u8BDD",
    archiveHint: "\u5F52\u6863\u53EA\u662F\u628A\u5B83\u4ECE\u8FD9\u4E9B\u5217\u8868\u91CC\u6536\u8D77\u6765\uFF0C\u4F1A\u8BDD\u8BB0\u5F55\u4E0D\u4F1A\u5220\u9664\u3002",
    newWorkspace: "\u65B0\u5EFA\u5DE5\u4F5C\u533A",
    renameWorkspace: "\u91CD\u547D\u540D\u5DE5\u4F5C\u533A",
    deleteWorkspace: "\u5220\u9664\u5DE5\u4F5C\u533A",
    workspaceActions: "\u5DE5\u4F5C\u533A\u64CD\u4F5C",
    projectActions: "\u9879\u76EE\u64CD\u4F5C",
    close: "\u5173\u95ED",
    deleteProjectHint: "\u53EA\u79FB\u9664\u8FD9\u4E2A\u9879\u76EE\u5206\u7EC4\uFF0C\u4E0D\u4F1A\u5220\u9664\u6587\u4EF6\u5939\u6216\u4F1A\u8BDD\u8BB0\u5F55\u3002",
    deleteWorkspaceHint: "\u53EA\u79FB\u9664\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u767B\u8BB0\uFF0C\u4E0D\u4F1A\u5220\u9664\u6587\u4EF6\u5939\u6216\u4F1A\u8BDD\u8BB0\u5F55\u3002",
    pickFolderFailed: "\u6CA1\u6709\u9009\u62E9\u6587\u4EF6\u5939\u3002"
  },
  en: {
    projects: "Projects",
    newProject: "New project",
    projectName: "Project name",
    folders: "Folders",
    addFolder: "Add folder",
    removeFolder: "Remove",
    noProjects: "No projects yet",
    noFolders: "This project has no folders yet",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    preflight: "Context preflight",
    preflightHint: "See exactly what this project will load, before you start a session.",
    running: "Analyzing\u2026",
    skills: "Skills",
    noSkills: "No skills",
    collisions: "Name collisions",
    collisionHint: "Only one skill per name takes effect; the shadowed sources are listed below.",
    winner: "Active",
    shadowed: "Shadowed",
    instructions: "Instruction files",
    noInstructions: "No instruction files",
    writeScope: "Write scope",
    silentFolders: "Folders contributing nothing",
    silentHint: "These folders currently provide nothing to the session.",
    from: "from",
    role: "Role",
    writable: "writable",
    readonly: "read-only",
    missing: "unresolved",
    missingHint: "This folder cannot be resolved right now; the membership is kept.",
    copyPlan: "Copy preflight",
    copied: "Copied",
    refresh: "Re-analyze",
    needName: "Enter a project name.",
    needFolder: "Select at least one folder.",
    loadFailed: "Could not load projects: {message}",
    saveFailed: "Save failed: {message}",
    unsupported: "The project file was written by a newer version; reading stopped to avoid overwriting it.",
    contributing: "{count} folders contributing",
    memberCount: "{count} folders",
    subtitle: "Weave several folders into one session context.",
    emptyTitle: "No projects yet",
    emptyHint: "Create a project and point it at two or more folders. Their skills, instructions, and context enter one session together.",
    memberList: "Folders",
    defaultStart: "Starting point",
    folderPicker: "Select the folders",
    folderPickerHint: "A folder may belong to any number of projects. Any folder can be the starting point \u2014 that never affects what it contributes.",
    writeBoundaryTitle: "Write scope",
    sectionProjects: "Projects",
    sectionWorkspaces: "Workspaces",
    sectionChats: "Chats",
    newChat: "New chat",
    searchPlaceholder: "Search sessions",
    showMore: "Show {count} more",
    showLess: "Show less",
    untitled: "Untitled session",
    noSessions: "No sessions yet",
    noWorkspaces: "No workspaces outside a project",
    noChats: "No unattributed sessions",
    noMatches: "No matching sessions",
    justNow: "just now",
    minutesAgo: "{count}m",
    hoursAgo: "{count}h",
    daysAgo: "{count}d",
    folderCount: "{count} folders",
    rename: "Rename",
    fork: "Fork",
    archive: "Archive",
    sessionActions: "Session actions",
    renameSession: "Rename session",
    archiveHint: "Archiving only hides it from these lists; the session log is kept.",
    newWorkspace: "New workspace",
    renameWorkspace: "Rename workspace",
    deleteWorkspace: "Delete workspace",
    workspaceActions: "Workspace actions",
    projectActions: "Project actions",
    close: "Close",
    deleteProjectHint: "Removes this grouping only; folders and session logs are kept.",
    deleteWorkspaceHint: "Removes the registration only; folders and session logs are kept.",
    pickFolderFailed: "No folder was selected."
  }
};
var STYLES = `

/* No card chrome of its own any more: the preflight is a dialog now, and the
   Modal atom already supplies the surface and the padding. */
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

/* \u2500\u2500 project editor \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   A Modal card is 380px wide, which is sized for a short form. A folder picker
   needs a name AND a path per row, so this one is wider; doubling the class
   raises specificity above the atom's own .dialog rule whatever the order the
   two stylesheets load in. */
.loom-editor.loom-editor { width: min(560px, 100%); }

.loom-field { display: flex; flex-direction: column; gap: 6px; }
.loom-field + .loom-field { margin-top: 20px; }
.loom-field-label { font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
/* The Input atom owns the field's chrome \u2014 including the inline-flex wrapper
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
   list beneath it \u2014 one cause, two symptoms.
   (No backticks anywhere in this block: it is itself a template literal.) */
.loom-input,
.loom-picker { box-sizing: border-box; }

/* Two lines per row: the name, then the path beneath it in tertiary.
   Fitting checkbox + name + path + a radio onto ONE line is what made this
   cramped, and it forced the path into a reversed-direction truncation that
   rendered as a torn-off fragment like "\u2026seek\\dsh-project". */
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

/* \u2500\u2500 sidebar browser: \u9879\u76EE / \u5DE5\u4F5C\u533A / \u804A\u5929 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   TWO rules govern this block. Both come from the shipped surfaces rather than
   from taste, because inventing either is what made it read as arbitrary.

   1. TYPE SCALE \u2014 exactly three sizes, one job each:
        12px/20px   section labels, counts, timestamps, "show more" (secondary)
        14px/20px   every row title \u2014 group and session alike      (primary)
        16px/24px   the main panel's heading
      The previous mix (11/12/12.5/13/14/15/16/17) had no relationship between
      size and role; that is precisely what "\u5B57\u53F7\u4E0D\u4E00\u81F4\uFF0C\u6CA1\u6709\u903B\u8F91" described.

   2. TREE \u2014 parent/child is DRAWN, not implied:
        \xB7 a 34px group row whose leading 16px slot carries the twisty;
        \xB7 the session list indented to the twisty's CENTRE and joined to it by a
          hairline guide, so sessions visibly hang off their group;
        \xB7 every step is 8px (8 \u2192 16 \u2192 24), so depth needs no guesswork.
      A flat list distinguished only by a larger left padding \u2014 what this
      replaced \u2014 showed no structure at all. */
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
   nested under it \u2014 the hierarchy signal read backwards, and on the collapsed
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
  const id = "loom-styles";
  if (typeof document === "undefined") return () => {
  };
  if (document.getElementById(id) !== null) return () => {
  };
  const element = document.createElement("style");
  element.id = id;
  element.textContent = STYLES;
  document.head.appendChild(element);
  return () => {
    element.remove();
  };
}
function interpolate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => values[key] === void 0 ? match : String(values[key]));
}
function createBridge(ctx) {
  const call = async (endpoint, payload) => {
    const result = await ctx.connection.rpc.call(CHANNEL, endpoint, payload ?? {});
    if (result === void 0 || result === null) {
      throw new Error(`dsh-loom: empty response from ${endpoint}`);
    }
    if (result.ok === false) {
      throw new Error(result.error?.message ?? `dsh-loom: ${endpoint} failed`);
    }
    return result.value;
  };
  return {
    getManifest: () => call("getManifest"),
    putManifest: (manifest) => call("putManifest", { manifest }),
    preflight: (projectId, activeWorkspaceId) => call("preflight", { projectId, activeWorkspaceId }),
    report: (event) => call("report", event)
  };
}
function report(bridge, event) {
  try {
    void bridge.report(event).catch(() => {
    });
  } catch {
  }
}
function contribute(ctx, bridge, slot, options, component) {
  return () => {
    try {
      const dispose = ctx.slots.register(options, component);
      report(bridge, { event: "register", slot, ok: true });
      return dispose;
    } catch (error) {
      report(bridge, {
        event: "register",
        slot,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? String(error.stack ?? "").slice(0, 1200) : ""
      });
      throw error;
    }
  };
}
function localTranslate(ctx) {
  return (key, values) => {
    let active = "en";
    try {
      active = ctx.locale.getLocale().active;
    } catch {
    }
    const table = dictionaries[active] ?? dictionaries.en;
    const template = table?.[key] ?? dictionaries.en?.[key] ?? key;
    return values === void 0 ? template : interpolate(template, values);
  };
}
function PreflightPanel({ plan, t, onRefresh, busy }) {
  const [copied, setCopied] = React.useState(false);
  const copy = React.useCallback(async () => {
    const text = renderPlanText(plan, t);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  }, [plan, t]);
  if (plan === void 0) {
    return h(
      "div",
      { className: "loom-preflight" },
      h("div", { className: "loom-muted" }, t("running"))
    );
  }
  return h(
    "div",
    { className: "loom-preflight" },
    h(
      "div",
      { className: "loom-preflight-head" },
      h("span", { className: "loom-section-title" }, t("preflight")),
      h(Button, { variant: "ghost", size: "sm", onClick: onRefresh, disabled: busy }, t("refresh"))
    ),
    // The write boundary is stated, not implied.
    h("div", { className: "loom-boundary" }, plan.writeBoundary.summary),
    h(
      "div",
      { className: "loom-results" },
      h(
        "div",
        { className: "loom-section" },
        h("div", { className: "loom-section-title" }, `${t("skills")} \xB7 ${plan.skills.length}`),
        plan.skills.length === 0 ? h("div", { className: "loom-muted" }, t("noSkills")) : plan.skills.map((skill) => h(
          "div",
          { key: `${skill.workspaceId}:${skill.name}` },
          h("div", { className: "loom-preflight-row" }, h("span", null, skill.name)),
          h("div", { className: "loom-src" }, `${t("from")} ${skill.workspaceId} \u2014 ${skill.path}`)
        ))
      ),
      // Collisions are surfaced, never hidden.
      plan.collisions.length > 0 && h(
        "div",
        { className: "loom-section" },
        h("div", { className: "loom-section-title loom-warn" }, `${t("collisions")} \xB7 ${plan.collisions.length}`),
        h("div", { className: "loom-muted" }, t("collisionHint")),
        plan.collisions.map((collision) => h(
          "div",
          { key: collision.name },
          h(
            "div",
            { className: "loom-preflight-row" },
            h("span", null, collision.name),
            h(Tag, { tone: "success" }, `${t("winner")} ${collision.winner.workspaceId}`)
          ),
          collision.shadowed.map((shadowed) => h(
            "div",
            { key: shadowed.workspaceId, className: "loom-preflight-row" },
            h(Tag, { tone: "warning" }, `${t("shadowed")} ${shadowed.workspaceId}`)
          ))
        ))
      ),
      h(
        "div",
        { className: "loom-section" },
        h("div", { className: "loom-section-title" }, `${t("instructions")} \xB7 ${plan.instructions.length}`),
        plan.instructions.length === 0 ? h("div", { className: "loom-muted" }, t("noInstructions")) : plan.instructions.map((instruction) => h(
          "div",
          { key: instruction.path, className: "loom-src" },
          `${instruction.workspaceId} \u2014 ${instruction.path} (${instruction.bytes} B)`
        ))
      ),
      // The silent folders — the headline diagnostic.
      plan.silent.length > 0 && h(
        "div",
        { className: "loom-section" },
        h("div", { className: "loom-section-title loom-warn" }, `${t("silentFolders")} \xB7 ${plan.silent.length}`),
        h("div", { className: "loom-muted" }, t("silentHint")),
        plan.silent.map((entry, index) => h(
          "div",
          { key: `${entry.workspaceId}-${index}` },
          h(
            "div",
            { className: "loom-preflight-row" },
            h(StateDot, { state: "warning" }),
            h("span", null, entry.workspaceId)
          ),
          h("div", { className: "loom-src" }, entry.detail)
        ))
      )
    ),
    h(Button, { variant: "outline", size: "sm", onClick: copy }, copied ? t("copied") : t("copyPlan"))
  );
}
function renderPlanText(plan, t) {
  const lines = [];
  lines.push(`${plan.projectTitle} \u2014 ${interpolate(t("memberCount"), { count: plan.memberCount })}`);
  lines.push(`${t("writeScope")}: ${plan.writeBoundary.summary}`);
  lines.push("");
  lines.push(`${t("skills")} (${plan.skills.length})`);
  for (const skill of plan.skills) lines.push(`  \xB7 ${skill.name} \u2190 ${skill.workspaceId} (${skill.path})`);
  if (plan.collisions.length > 0) {
    lines.push("");
    lines.push(`${t("collisions")} (${plan.collisions.length})`);
    for (const collision of plan.collisions) {
      lines.push(`  ! ${collision.name}`);
      lines.push(`      ${t("winner")}: ${collision.winner.workspaceId}`);
      for (const shadowed of collision.shadowed) lines.push(`      ${t("shadowed")}: ${shadowed.workspaceId}`);
    }
  }
  lines.push("");
  lines.push(`${t("instructions")} (${plan.instructions.length})`);
  for (const instruction of plan.instructions) lines.push(`  \xB7 ${instruction.workspaceId} \u2014 ${instruction.path} (${instruction.bytes} B)`);
  if (plan.silent.length > 0) {
    lines.push("");
    lines.push(`${t("silentFolders")} (${plan.silent.length})`);
    for (const entry of plan.silent) lines.push(`  \xB7 ${entry.workspaceId}: ${entry.detail}`);
  }
  return lines.join("\n");
}
function ProjectEditor({ project, workspaces, onSave, onClose, t }) {
  const [title, setTitle] = React.useState(project?.title ?? "");
  const [selected, setSelected] = React.useState(() => new Set((project?.members ?? []).map((m) => m.workspaceId)));
  const [defaultId, setDefaultId] = React.useState(project?.defaultWorkspaceId ?? "");
  const [error, setError] = React.useState("");
  const toggle = (workspaceId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
    setError("");
  };
  const save = () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return setError(t("needName"));
    if (selected.size === 0) return setError(t("needFolder"));
    const members = workspaces.filter((workspace) => selected.has(workspace.workspaceId)).map((workspace) => ({ workspaceId: workspace.workspaceId, role: "writable" }));
    onSave({
      id: project?.id ?? `loom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmed,
      members,
      defaultWorkspaceId: selected.has(defaultId) ? defaultId : members[0]?.workspaceId
    });
    onClose();
  };
  return h(
    Modal,
    {
      open: true,
      onClose,
      title: project ? t("edit") : t("newProject"),
      closeLabel: t("cancel"),
      // A wider card than the atom's 380px default: each row carries a name and a
      // path, which is a two-column problem the default width cannot hold.
      className: "loom-editor",
      description: t("folderPickerHint"),
      footer: h(
        React.Fragment,
        null,
        h(Button, { variant: "outline", onClick: onClose }, t("cancel")),
        h(Button, { variant: "primary", onClick: save }, t("save"))
      )
    },
    h(
      "div",
      { className: "loom-field" },
      h("label", { className: "loom-field-label", htmlFor: "loom-title" }, t("projectName")),
      h(Input, {
        id: "loom-title",
        className: "loom-input",
        value: title,
        maxLength: 80,
        "aria-label": t("projectName"),
        onChange: (event) => {
          setTitle(event.target.value);
          setError("");
        }
      })
    ),
    h(
      "div",
      { className: "loom-field" },
      h("div", { className: "loom-field-label" }, t("folderPicker")),
      h(
        "div",
        { className: "loom-picker" },
        // The whole row is a label, so clicking anywhere toggles membership —
        // only the radio is a separate target.
        workspaces.map((workspace) => h(
          "label",
          {
            key: workspace.workspaceId,
            className: "loom-pick"
          },
          h("input", {
            type: "checkbox",
            checked: selected.has(workspace.workspaceId),
            onChange: () => toggle(workspace.workspaceId)
          }),
          h(
            "span",
            { className: "loom-pick-text" },
            h("span", { className: "loom-pick-name" }, workspace.title),
            h("span", { className: "loom-pick-path", title: workspace.path }, workspace.path)
          ),
          // The starting folder is a per-project preference, not a rank: it
          // never privileges one folder during discovery. It only appears for a
          // member, because a folder that is not in the project cannot be its
          // starting point — a disabled radio on every row was pure noise.
          selected.has(workspace.workspaceId) && h(
            "span",
            {
              className: "loom-pick-default",
              title: t("defaultStart")
            },
            h("input", {
              type: "radio",
              name: "loom-default",
              checked: defaultId === workspace.workspaceId,
              onChange: () => setDefaultId(workspace.workspaceId)
            }),
            t("defaultStart")
          )
        ))
      )
    ),
    error.length > 0 && h("div", { className: "loom-warn-note" }, error)
  );
}
var name = "dsh-loom";
var inject = ["slots", "locale", "workspaces", "sessions", "uiWorkspace", "connection"];
function sessionTime(summary, t) {
  const at = summary?.updatedAt;
  if (typeof at !== "number") return "";
  const minutes = Math.max(0, Math.round((Date.now() - at) / 6e4));
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return interpolate(t("minutesAgo"), { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return interpolate(t("hoursAgo"), { count: hours });
  return interpolate(t("daysAgo"), { count: Math.round(hours / 24) });
}
function RowMenu({ items, onSelect, label }) {
  const [open, setOpen] = React.useState(false);
  return h(Menu, {
    open,
    onClose: () => setOpen(false),
    items,
    onSelect: (id) => {
      setOpen(false);
      onSelect(id);
    },
    portal: true,
    closeOnPointerLeave: true,
    anchor: h("button", {
      type: "button",
      className: "loom-icon-btn",
      "aria-label": label,
      onClick: (event) => {
        event.stopPropagation();
        setOpen((value) => !value);
      }
    }, h(IconEllipsisOutline16, { size: 16 }))
  });
}
function SessionRow({ summary, current, onClick, onRename, onFork, onArchive, t }) {
  const title = summary.displayTitle || t("untitled");
  const settled = summary.blank !== true;
  const items = [
    { id: "rename", label: t("rename"), icon: h(IconEditOutline16, null) },
    { id: "fork", label: t("fork"), icon: h(IconBranchOutline16, null) },
    { id: "archive", label: t("archive"), icon: h(IconArchiveOutline20, { size: 16 }) }
  ];
  return h(
    "div",
    {
      role: "treeitem",
      tabIndex: 0,
      "aria-selected": current === true,
      className: current === true ? "loom-row loom-row-current" : "loom-row",
      title,
      onClick,
      onKeyDown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }
    },
    h(
      "span",
      { className: "loom-slot" },
      summary.running === true ? h(StateDot, { state: "ongoing", size: 10 }) : null
    ),
    h("span", { className: "loom-title" }, title),
    settled && h("span", { className: "loom-time" }, sessionTime(summary, t)),
    // Actions take the timestamp's place, so the row does not reflow on hover.
    settled && h(
      "span",
      { className: "loom-actions" },
      h(RowMenu, {
        label: t("sessionActions"),
        items,
        onSelect: (id) => {
          if (id === "rename") onRename(summary.id, title);
          if (id === "fork") onFork(summary.id);
          if (id === "archive") onArchive(summary.id);
        }
      })
    )
  );
}
function LoomGroup({ row, actions, menu, isCollapsed, isExpanded, onToggleCollapse, onToggleExpand, onOpen, onNew, onRename, onFork, onArchive, currentId, t }) {
  const open = !isCollapsed;
  const showAll = isExpanded;
  const PREVIEW = 4;
  const shown = showAll ? row.sessions : row.sessions.slice(0, PREVIEW);
  const hidden = row.sessions.length - PREVIEW;
  return h(
    "div",
    { className: "loom-group" },
    h(
      "div",
      {
        className: "loom-group-head",
        role: "treeitem",
        "aria-expanded": open,
        onClick: () => onToggleCollapse(row.key)
      },
      // The twisty lives in the same 16px slot every row uses, which is what
      // the session list indents to and the guide line aligns under.
      h(
        "span",
        { className: "loom-slot" },
        h("span", {
          className: open ? "loom-twisty" : "loom-twisty loom-twisty-collapsed"
        }, h(IconChevronDownOutline14, { size: 14 }))
      ),
      h("span", { className: "loom-group-name" }, row.title),
      h(
        "span",
        { className: "loom-actions" },
        ...actions ?? [],
        // A workspace row manages itself through this menu. A project row's
        // verbs arrive as `actions` instead, because they belong to the Loom
        // manifest rather than to DSH.
        menu !== void 0 && h(RowMenu, {
          label: menu.label,
          items: menu.items,
          onSelect: menu.onSelect
        }),
        h("button", {
          type: "button",
          className: "loom-icon-btn",
          title: t("newChat"),
          "aria-label": `${t("newChat")} \u2014 ${row.title}`,
          onClick: (event) => {
            event.stopPropagation();
            onNew(row);
          }
        }, h(IconPlusOutline16, { size: 16 }))
      )
    ),
    open && h(
      "div",
      { className: "loom-children" },
      row.sessions.length === 0 ? h("div", { className: "loom-empty-section" }, t("noSessions")) : shown.map((summary) => h(SessionRow, {
        key: summary.id,
        summary,
        current: summary.id === currentId,
        onClick: () => onOpen(summary.id),
        onRename,
        onFork,
        onArchive,
        t
      })),
      hidden > 0 && h("button", {
        type: "button",
        className: "loom-more",
        onClick: () => onToggleExpand(row.key)
      }, showAll ? t("showLess") : interpolate(t("showMore"), { count: hidden }))
    )
  );
}
function PreflightModal({ project, bridge, t, onClose }) {
  const [plan, setPlan] = React.useState(void 0);
  const [busy, setBusy] = React.useState(true);
  const run = React.useCallback(async () => {
    setBusy(true);
    try {
      const value = await bridge.preflight(project.id);
      setPlan(value.plan);
    } catch {
      setPlan(void 0);
    } finally {
      setBusy(false);
    }
  }, [bridge, project.id]);
  React.useEffect(() => {
    void run();
  }, [run]);
  return h(Modal, {
    open: true,
    onClose,
    title: t("preflight"),
    description: project.title,
    closeLabel: t("close"),
    // The wide card: a preflight lists skill paths and collision sources.
    className: "loom-editor"
  }, h(PreflightPanel, { plan, t, busy, onRefresh: run }));
}
function LoomSidebar({
  projects,
  snapshot,
  sessionState,
  t,
  onOpenSession,
  onStartSession,
  onNewProject,
  onEditProject,
  onDeleteProject,
  onPreflightProject,
  onRenameSession,
  onForkSession,
  onArchiveSession,
  onNewWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace
}) {
  const [query, setQuery] = React.useState("");
  const [collapsed, setCollapsed] = React.useState(() => /* @__PURE__ */ new Set());
  const [expanded, setExpanded] = React.useState(() => /* @__PURE__ */ new Set());
  const derived = React.useMemo(
    () => deriveSections({ projects, snapshot, sessionState }),
    [projects, snapshot, sessionState]
  );
  const needle = query.trim().toLowerCase();
  const keep = (summary) => needle === "" || String(summary.displayTitle ?? "").toLowerCase().includes(needle);
  const narrow = (rows) => rows.map((row) => ({ ...row, sessions: row.sessions.filter(keep) })).filter((row) => row.sessions.length > 0 || needle !== "" && String(row.title ?? "").toLowerCase().includes(needle));
  const projectRows = narrow(derived.projectRows);
  const workspaceRows = narrow(derived.workspaceRows);
  const chatSessions = derived.chatSessions.filter(keep);
  const searched = needle !== "";
  const nothing = searched && projectRows.length === 0 && workspaceRows.length === 0 && chatSessions.length === 0;
  const toggle = (setter) => (key) => setter((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const toggleCollapse = toggle(setCollapsed);
  const toggleExpand = toggle(setExpanded);
  const group = (row) => h(LoomGroup, {
    key: row.key,
    row,
    isCollapsed: collapsed.has(row.key),
    isExpanded: expanded.has(row.key),
    onToggleCollapse: toggleCollapse,
    onToggleExpand: toggleExpand,
    onOpen: onOpenSession,
    onNew: (target) => onStartSession(target.startWorkspaceId),
    onRename: onRenameSession,
    onFork: onForkSession,
    onArchive: onArchiveSession,
    // A workspace is the shell's own object, so its verbs are the shell's:
    // rename and delete. Delete unregisters the Workspace without touching
    // Sessions or files, so it is not styled as destructive data loss — but it
    // does remove the entry, so the menu marks it danger.
    menu: {
      label: t("workspaceActions"),
      items: [
        { id: "rename", label: t("renameWorkspace"), icon: h(IconEditOutline16, null) },
        { id: "delete", label: t("deleteWorkspace"), icon: h(IconTrashOutline16, null), danger: true }
      ],
      onSelect: (id) => {
        if (id === "rename") onRenameWorkspace(row.key, row.title);
        if (id === "delete") onDeleteWorkspace(row.key);
      }
    },
    currentId: sessionState?.current,
    t
  });
  const [hiddenSections, setHiddenSections] = React.useState(() => /* @__PURE__ */ new Set());
  const toggleSection = toggle(setHiddenSections);
  const sectionHead = (id, label, count, action) => {
    const open = !hiddenSections.has(id);
    return h(
      "div",
      { className: "loom-section-head" },
      h(
        "button",
        {
          type: "button",
          className: "loom-section-title",
          "aria-expanded": open,
          title: label,
          onClick: () => toggleSection(id)
        },
        h("span", {
          className: open ? "loom-twisty" : "loom-twisty loom-twisty-collapsed",
          style: { width: 16, height: 16 }
        }, h(IconChevronDownOutline14, { size: 12 })),
        h("span", null, label),
        count > 0 && h("span", { className: "loom-section-count" }, String(count))
      ),
      action ?? null
    );
  };
  const sectionBody = (id, render) => hiddenSections.has(id) ? null : render();
  return h(
    "div",
    { className: "loom-sidebar" },
    h(
      "div",
      { className: "loom-search" },
      h(Input, {
        className: "loom-input",
        value: query,
        placeholder: t("searchPlaceholder"),
        "aria-label": t("searchPlaceholder"),
        onChange: (event) => setQuery(event.target.value)
      })
    ),
    nothing && h("div", { className: "loom-empty-section" }, t("noMatches")),
    sectionHead(
      "projects",
      t("sectionProjects"),
      projectRows.length,
      h("button", {
        type: "button",
        className: "loom-icon-btn",
        title: t("newProject"),
        "aria-label": t("newProject"),
        onClick: onNewProject
      }, h(IconPlusOutline16, { size: 16 }))
    ),
    sectionBody("projects", () => projectRows.length === 0 ? h("div", { className: "loom-empty-section" }, t("noProjects")) : projectRows.map((row) => h(LoomGroup, {
      key: row.key,
      row,
      isCollapsed: collapsed.has(row.key),
      isExpanded: expanded.has(row.key),
      onToggleCollapse: toggleCollapse,
      onToggleExpand: toggleExpand,
      onOpen: onOpenSession,
      onNew: (target) => onStartSession(target.startWorkspaceId),
      onRename: onRenameSession,
      onFork: onForkSession,
      onArchive: onArchiveSession,
      currentId: sessionState?.current,
      t,
      // One ellipsis, matching the shipped row affordance. The preflight lives
      // here because it is a verb on a project, not a place to navigate to.
      menu: {
        label: t("projectActions"),
        items: [
          { id: "preflight", label: t("preflight"), icon: h(IconListPenOutline16, null) },
          { id: "edit", label: t("edit"), icon: h(IconEditOutline16, null) },
          { id: "delete", label: t("delete"), icon: h(IconTrashOutline16, null), danger: true }
        ],
        onSelect: (id) => {
          if (id === "preflight") onPreflightProject(row.project);
          if (id === "edit") onEditProject(row.project);
          if (id === "delete") onDeleteProject(row.project);
        }
      }
    }))),
    sectionHead(
      "workspaces",
      t("sectionWorkspaces"),
      workspaceRows.length,
      h("button", {
        type: "button",
        className: "loom-icon-btn",
        title: t("newWorkspace"),
        "aria-label": t("newWorkspace"),
        onClick: onNewWorkspace
      }, h(IconPlusOutline16, { size: 16 }))
    ),
    sectionBody("workspaces", () => workspaceRows.length === 0 ? h("div", { className: "loom-empty-section" }, t("noWorkspaces")) : workspaceRows.map(group)),
    sectionHead("chats", t("sectionChats"), chatSessions.length),
    sectionBody("chats", () => chatSessions.length === 0 ? h("div", { className: "loom-empty-section" }, t("noChats")) : chatSessions.map((summary) => h(SessionRow, {
      key: summary.id,
      summary,
      current: summary.id === sessionState?.current,
      onClick: () => onOpenSession(summary.id),
      onRename: onRenameSession,
      onFork: onForkSession,
      onArchive: onArchiveSession,
      t
    })))
  );
}
function LoomSidebarHost({ bridge, ctx }) {
  function LoomSidebarSeated({ useWorkspaces, useSessions, bridge: bridge2, ctx: ctx2, t }) {
    const snapshot = useWorkspaces((state) => state);
    const sessionState = useSessions((state) => state);
    const [manifest, setManifest] = React.useState(void 0);
    const [error, setError] = React.useState("");
    const [editing, setEditing] = React.useState(null);
    const [renaming, setRenaming] = React.useState(null);
    const [preflighting, setPreflighting] = React.useState(null);
    const reload = React.useCallback(async () => {
      try {
        const value = await bridge2.getManifest();
        setManifest(value.manifest);
        setError(value.ok === false ? String(value.error ?? "") : "");
      } catch (cause) {
        setError(cause.message);
      }
    }, [bridge2]);
    React.useEffect(() => {
      void reload();
    }, [reload]);
    const put = React.useCallback(async (projects2) => {
      try {
        const value = await bridge2.putManifest({ schemaVersion: 2, projects: projects2 });
        setManifest(value.manifest);
      } catch (cause) {
        setError(interpolate(t("saveFailed"), { message: cause.message }));
      }
    }, [bridge2, t]);
    const projects = manifest?.projects ?? [];
    return h(
      React.Fragment,
      null,
      error.length > 0 && h("div", { className: "loom-empty-section loom-warn" }, error),
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
        onOpenSession: (sessionId) => {
          const navigation = ctx2.get("uiWorkspace");
          if (navigation !== void 0) navigation.openSession(sessionId);
        },
        // `startSession` additionally inherits the current session's workspace
        // before the recent-workspace fallback, so it is the right verb here too.
        onStartSession: (workspaceId) => {
          const navigation = ctx2.get("uiWorkspace");
          if (navigation !== void 0 && workspaceId !== void 0) navigation.startSession(workspaceId);
        },
        onNewProject: () => setEditing({}),
        onEditProject: (project) => setEditing(project),
        onDeleteProject: (project) => {
          void put(projects.filter((item) => item.id !== project.id));
        },
        onPreflightProject: (project) => setPreflighting(project),
        // Session verbs. `rename` is a per-session property, not a list verb, so
        // it resolves the session binding first — the list store has no rename.
        onRenameSession: (sessionId, currentTitle) => setRenaming({ kind: "session", id: sessionId, title: currentTitle }),
        onForkSession: (sessionId) => {
          const navigation = ctx2.get("uiWorkspace");
          if (navigation !== void 0) navigation.forkSession(sessionId).catch(() => {
          });
        },
        onArchiveSession: (sessionId) => {
          const navigation = ctx2.get("uiWorkspace");
          if (navigation !== void 0) void navigation.archiveSession(sessionId);
        },
        // Workspace verbs. A Workspace is the shell's own object, so these go
        // through DSH's services rather than through Loom's manifest: Loom
        // groups existing Workspaces and never mutates them.
        onNewWorkspace: async () => {
          const navigation = ctx2.get("uiWorkspace");
          if (navigation === void 0) return;
          try {
            const picked = await navigation.pickDirectory();
            if (typeof picked !== "string" || picked.length === 0) return;
            await ctx2.workspaces.create({ path: picked });
          } catch (cause) {
            setError(interpolate(t("saveFailed"), { message: cause.message }));
          }
        },
        onRenameWorkspace: (workspaceId, currentTitle) => setRenaming({ kind: "workspace", id: workspaceId, title: currentTitle }),
        onDeleteWorkspace: (workspaceId) => {
          void ctx2.workspaces.delete(workspaceId).catch(() => {
          });
        }
      }),
      preflighting !== null && h(PreflightModal, {
        project: preflighting,
        bridge: bridge2,
        t,
        onClose: () => setPreflighting(null)
      }),
      renaming !== null && h(
        Modal,
        {
          open: true,
          onClose: () => setRenaming(null),
          // One dialog serves both verbs: a session rename and a workspace rename
          // ask for exactly the same thing — a new name.
          title: t(renaming.kind === "session" ? "renameSession" : "renameWorkspace"),
          closeLabel: t("cancel"),
          footer: h(
            React.Fragment,
            null,
            h(Button, { variant: "outline", onClick: () => setRenaming(null) }, t("cancel")),
            h(Button, {
              variant: "primary",
              onClick: () => {
                const target = renaming;
                const next = target.title.trim();
                setRenaming(null);
                if (next.length === 0) return;
                if (target.kind === "session") {
                  const session = ctx2.sessions?.binding(target.id)?.session;
                  if (session !== void 0) void session.rename(next);
                } else {
                  void ctx2.workspaces.rename(target.id, next).catch(() => {
                  });
                }
              }
            }, t("save"))
          )
        },
        h(Input, {
          className: "loom-input",
          value: renaming.title,
          maxLength: 120,
          "aria-label": t(renaming.kind === "session" ? "renameSession" : "renameWorkspace"),
          onChange: (event) => setRenaming((current) => ({ ...current, title: event.target.value }))
        })
      ),
      editing !== null && h(ProjectEditor, {
        project: editing.id === void 0 ? void 0 : editing,
        workspaces: snapshot?.items ?? [],
        onSave: (project) => {
          void put([...projects.filter((item) => item.id !== project.id), project]);
        },
        onClose: () => setEditing(null),
        t
      })
    );
  }
  return function LoomSidebarBound(props) {
    const { useWorkspaces, useSessions, t: seatT } = props ?? {};
    if (typeof useWorkspaces !== "function" || typeof useSessions !== "function") return null;
    return h(LoomSidebarSeated, {
      useWorkspaces,
      useSessions,
      bridge,
      ctx,
      // The panel owns its dictionaries, so a missing seat still translates.
      t: typeof seatT === "function" ? seatT : localTranslate(ctx)
    });
  };
}
function apply(ctx) {
  ctx.effect(installStyles, "dsh-loom: styles");
  ctx.effect(() => ctx.locale.register(NS, dictionaries), "dsh-loom: dictionaries");
  const bridge = createBridge(ctx);
  const probe = (read) => {
    try {
      return read();
    } catch (error) {
      return `error: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  report(bridge, {
    event: "apply",
    ok: true,
    hasSlots: ctx.slots !== void 0,
    hasInject: typeof ctx.slots?.inject === "function",
    hasRegister: typeof ctx.slots?.register === "function",
    // Timing matters: `slots.inject` returns early while a slot is undeclared,
    // so a spec that is missing here means the declaration lands later.
    mainSpec: probe(() => ctx.slots.spec("main") !== void 0),
    mainEpoch: probe(() => ctx.slots.declarationEpoch("main")),
    panellistSpec: probe(() => ctx.slots.spec("sidebar.panellist") !== void 0),
    panellistEpoch: probe(() => ctx.slots.declarationEpoch("sidebar.panellist"))
  });
  try {
    ctx.slots.inject("sidebar.workspaces", contribute(
      ctx,
      bridge,
      "sidebar.workspaces",
      { name: "sidebar.workspaces", priority: -100, locale: NS },
      LoomSidebarHost({ bridge, ctx })
    ));
    report(bridge, { event: "inject", slot: "sidebar.workspaces", ok: true });
  } catch (error) {
    report(bridge, {
      event: "inject",
      slot: "sidebar.workspaces",
      ok: false,
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? "").slice(0, 1200)
    });
  }
}
module.exports = {
  LoomSidebar,
  LoomSidebarHost,
  PreflightModal,
  PreflightPanel,
  ProjectEditor,
  apply,
  createBridge,
  deriveSections,
  inject,
  name,
  renderPlanText
};
return module.exports; } });

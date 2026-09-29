window.__ModuleLoader__.load({ id: 'dsh-loom', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/core/sections.cjs
var require_sections = __commonJS({
  "src/core/sections.cjs"(exports2, module2) {
    function sessionVisible(summary, current, archived, projectionReady) {
      const delegated = summary.origin === "subagent" || summary.parentId !== void 0 && summary.parentId !== summary.id;
      const shell = projectionReady === true && (summary.title === void 0 || summary.title === "") && summary.id !== current && summary.running !== true;
      return !delegated && !archived.has(summary.id) && !shell && (!summary.blank || summary.id === current);
    }
    function currentSessionId(sessionState) {
      const byId = sessionState && sessionState.byId || {};
      for (const session of Object.values(byId)) {
        if (((session || {}).retainedBy || {}).mainView > 0) return session.id;
      }
      return void 0;
    }
    function deriveSections2({ projects, snapshot, sessionState, panelActive = false } = {}) {
      const byId = sessionState && sessionState.byId || {};
      const archived = new Set(snapshot && snapshot.archivedSessionIds || []);
      const projections = sessionState && sessionState.projectionsBySession || {};
      const projectionReady = (id) => (projections[id] || {}).state === "ready";
      const current = currentSessionId(sessionState);
      const highlighted = panelActive === true ? void 0 : current;
      const workspaces = snapshot && snapshot.items || [];
      const workspaceById = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace]));
      const claimsByWorkspaceId = /* @__PURE__ */ new Map();
      for (const project of projects || []) {
        const label = project.title || project.id;
        for (const member of project.members || []) {
          const claims = claimsByWorkspaceId.get(member.workspaceId) || [];
          claims.push(label);
          claimsByWorkspaceId.set(member.workspaceId, claims);
        }
      }
      const collect = (ids) => {
        const visible = [...new Set(ids)].map((id) => byId[id]).filter((summary) => summary !== void 0 && sessionVisible(summary, current, archived, projectionReady(summary.id))).sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
        const blankAt = visible.findIndex((summary) => summary.blank === true);
        if (blankAt > 0) visible.unshift(...visible.splice(blankAt, 1));
        return visible;
      };
      const idsByCwd = /* @__PURE__ */ new Map();
      for (const id of sessionState && sessionState.ids || []) {
        const summary = byId[id];
        if (summary === void 0 || typeof summary.cwd !== "string" || summary.cwd === "") continue;
        const list = idsByCwd.get(summary.cwd) || [];
        list.push(id);
        idsByCwd.set(summary.cwd, list);
      }
      const workspaceSessionIds = (workspace) => [
        ...workspace.sessionIds || [],
        ...idsByCwd.get(workspace.path) || []
      ];
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
          return workspace === void 0 ? [] : workspaceSessionIds(workspace);
        }))
      }));
      const workspaceRows = workspaces.map((workspace) => {
        const claimedBy = claimsByWorkspaceId.get(workspace.workspaceId) || [];
        return {
          key: workspace.workspaceId,
          title: workspace.title || workspace.path,
          startWorkspaceId: workspace.workspaceId,
          claimedBy,
          sessions: claimedBy.length > 0 ? [] : collect(workspaceSessionIds(workspace))
        };
      });
      const attributed = /* @__PURE__ */ new Set();
      for (const row of projectRows) for (const summary of row.sessions) attributed.add(summary.id);
      for (const row of workspaceRows) for (const summary of row.sessions) attributed.add(summary.id);
      const chatSessions = collect(sessionState && sessionState.ids || []).filter((summary) => !attributed.has(summary.id));
      return { projectRows, workspaceRows, chatSessions, current, highlighted };
    }
    module2.exports = { currentSessionId, deriveSections: deriveSections2, sessionVisible };
  }
});

// src/core/manifest.cjs
var require_manifest = __commonJS({
  "src/core/manifest.cjs"(exports2, module2) {
    var SCHEMA_VERSION = 2;
    var ROLE_WRITABLE = "writable";
    var ROLE_READONLY = "readonly";
    var ROLES = [ROLE_WRITABLE, ROLE_READONLY];
    function isPlainObject(value) {
      return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    function uniqueStrings(values) {
      const seen = /* @__PURE__ */ new Set();
      const result = [];
      for (const value of values || []) {
        if (typeof value !== "string" || value.length === 0 || seen.has(value)) continue;
        seen.add(value);
        result.push(value);
      }
      return result;
    }
    function normalizeTitle(value, fallback) {
      if (typeof value !== "string") return fallback;
      const trimmed = value.trim().slice(0, 80);
      return trimmed.length > 0 ? trimmed : fallback;
    }
    function normalizeRole(value) {
      return ROLES.includes(value) ? value : ROLE_WRITABLE;
    }
    function normalizeMember(raw) {
      if (typeof raw === "string") {
        const workspaceId2 = raw.trim();
        return workspaceId2.length === 0 ? void 0 : { workspaceId: workspaceId2, role: ROLE_WRITABLE };
      }
      if (!isPlainObject(raw)) return void 0;
      const workspaceId = typeof raw.workspaceId === "string" ? raw.workspaceId.trim() : "";
      if (workspaceId.length === 0) return void 0;
      const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 200) : "";
      return {
        workspaceId,
        role: normalizeRole(raw.role),
        ...note.length > 0 ? { note } : {}
      };
    }
    function mergeMembers2(previous, selectedWorkspaceIds) {
      const previousById = /* @__PURE__ */ new Map();
      for (const member of Array.isArray(previous) ? previous : []) {
        const normalized = normalizeMember(member);
        if (normalized !== void 0 && !previousById.has(normalized.workspaceId)) {
          previousById.set(normalized.workspaceId, normalized);
        }
      }
      return uniqueStrings(selectedWorkspaceIds).map((workspaceId) => {
        const kept = previousById.get(workspaceId);
        return kept === void 0 ? { workspaceId, role: ROLE_WRITABLE } : kept;
      });
    }
    function normalizeManifest(raw, options = {}) {
      const known = options.knownWorkspaceIds === void 0 ? void 0 : new Set(knownWorkspaceIdsOf(options.knownWorkspaceIds));
      const projects = [];
      const dropped = [];
      const seenProjectIds = /* @__PURE__ */ new Set();
      for (const rawProject of isPlainObject(raw) && Array.isArray(raw.projects) ? raw.projects : []) {
        if (!isPlainObject(rawProject)) {
          dropped.push({ reason: "not-an-object" });
          continue;
        }
        const id = typeof rawProject.id === "string" ? rawProject.id.trim() : "";
        if (id.length === 0 || seenProjectIds.has(id)) {
          dropped.push({ reason: id.length === 0 ? "missing-id" : "duplicate-id", id });
          continue;
        }
        const members = [];
        const seenMembers = /* @__PURE__ */ new Set();
        for (const rawMember of Array.isArray(rawProject.members) ? rawProject.members : []) {
          const member = normalizeMember(rawMember);
          if (member === void 0) {
            dropped.push({ reason: "invalid-member", projectId: id });
            continue;
          }
          if (seenMembers.has(member.workspaceId)) continue;
          seenMembers.add(member.workspaceId);
          members.push(member);
        }
        const defaultWorkspaceId = typeof rawProject.defaultWorkspaceId === "string" && seenMembers.has(rawProject.defaultWorkspaceId) ? rawProject.defaultWorkspaceId : members[0]?.workspaceId;
        seenProjectIds.add(id);
        projects.push({
          id,
          title: normalizeTitle(rawProject.title, id),
          members: members.map((member) => known === void 0 || known.has(member.workspaceId) ? member : { ...member, missing: true }),
          ...defaultWorkspaceId === void 0 ? {} : { defaultWorkspaceId },
          createdAt: typeof rawProject.createdAt === "string" ? rawProject.createdAt : void 0,
          updatedAt: typeof rawProject.updatedAt === "string" ? rawProject.updatedAt : void 0
        });
      }
      return { schemaVersion: SCHEMA_VERSION, projects, dropped };
    }
    function knownWorkspaceIdsOf(value) {
      return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    }
    function readManifest(value, options = {}) {
      if (!isPlainObject(value)) return normalizeManifest(void 0, options);
      if (value.schemaVersion === SCHEMA_VERSION) return normalizeManifest(value, options);
      if (Number.isInteger(value.schemaVersion) && value.schemaVersion > SCHEMA_VERSION) {
        return { ...normalizeManifest(void 0, options), supported: false, foundVersion: value.schemaVersion };
      }
      return normalizeManifest(void 0, options);
    }
    function projectsContaining(manifest, workspaceId) {
      if (typeof workspaceId !== "string" || workspaceId.length === 0) return [];
      return (manifest?.projects || []).filter((project) => project.members.some((member) => member.workspaceId === workspaceId));
    }
    function findProject(manifest, projectId) {
      return (manifest?.projects || []).find((project) => project.id === projectId);
    }
    function defaultWorkspaceFor(manifest, projectId) {
      const project = findProject(manifest, projectId);
      if (project === void 0) return void 0;
      const preferred = project.defaultWorkspaceId;
      const chosen = project.members.find((member) => member.workspaceId === preferred) ?? project.members[0];
      return chosen?.workspaceId;
    }
    function upsertProject(manifest, project, options = {}) {
      const incoming = normalizeManifest({ schemaVersion: SCHEMA_VERSION, projects: [project] }, options).projects[0];
      if (incoming === void 0) return normalizeManifest(manifest, options);
      const rest = (manifest?.projects || []).filter((existing) => existing.id !== incoming.id);
      return normalizeManifest({ schemaVersion: SCHEMA_VERSION, projects: [...rest, incoming] }, options);
    }
    function removeProject(manifest, projectId) {
      return normalizeManifest({
        schemaVersion: SCHEMA_VERSION,
        projects: (manifest?.projects || []).filter((project) => project.id !== projectId)
      });
    }
    function migrateFromV1(value) {
      const groups = Array.isArray(value) ? value : isPlainObject(value) ? value.groups : void 0;
      if (!Array.isArray(groups)) return { manifest: normalizeManifest(void 0), migrated: 0, note: "no-v1-groups" };
      const projects = [];
      for (const group of groups) {
        if (!isPlainObject(group)) continue;
        const id = typeof group.id === "string" ? group.id.trim() : "";
        if (id.length === 0) continue;
        const memberIds = uniqueStrings(group.memberWorkspaceIds);
        if (memberIds.length === 0) continue;
        projects.push({
          id,
          title: normalizeTitle(group.title, id),
          members: memberIds.map((workspaceId) => ({ workspaceId, role: ROLE_WRITABLE })),
          ...typeof group.primaryWorkspaceId === "string" && memberIds.includes(group.primaryWorkspaceId) ? { defaultWorkspaceId: group.primaryWorkspaceId } : {}
        });
      }
      return {
        manifest: normalizeManifest({ schemaVersion: SCHEMA_VERSION, projects }),
        migrated: projects.length,
        note: "v1-membership-was-exclusive; previously dropped memberships are not recoverable"
      };
    }
    function createEmptyManifest() {
      return { schemaVersion: SCHEMA_VERSION, projects: [], dropped: [] };
    }
    module2.exports = {
      ROLE_READONLY,
      ROLE_WRITABLE,
      ROLES,
      SCHEMA_VERSION,
      createEmptyManifest,
      defaultWorkspaceFor,
      findProject,
      mergeMembers: mergeMembers2,
      migrateFromV1,
      normalizeManifest,
      projectsContaining,
      readManifest,
      removeProject,
      upsertProject
    };
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
  IconPlusOutlineRegular,
  IconChevronDownOutlineRegular,
  IconSearchOutlineRegular,
  IconCloseOutlineRegular,
  IconEllipsisOutlineRegular,
  IconEditOutlineRegular,
  IconTrashOutlineRegular,
  IconBranchOutlineRegular,
  IconArchiveOutlineRegular,
  IconListPenOutlineRegular
} = require("@deepseek-ai/dsh-client-ui-primitives");
var h = React.createElement;
var NS = "dsh-loom";
var CHANNEL = "/dsh-loom";
var { deriveSections } = require_sections();
var { mergeMembers } = require_manifest();
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
    clearSearch: "\u6E05\u9664\u641C\u7D22",
    showMore: "\u5C55\u5F00\u5176\u4F59 {count} \u4E2A\u4F1A\u8BDD",
    showLess: "\u6536\u8D77",
    untitled: "\u672A\u547D\u540D\u4F1A\u8BDD",
    noSessions: "\u8FD8\u6CA1\u6709\u4F1A\u8BDD",
    claimedBy: "\u5DF2\u88AB\u9879\u76EE\u8BA4\u9886",
    claimedElsewhere: "\u4F1A\u8BDD\u5217\u5728\u8BA4\u9886\u5B83\u7684\u9879\u76EE\u4E0B\uFF0C\u6B64\u5904\u4E0D\u91CD\u590D",
    noWorkspaces: "\u6CA1\u6709\u5DE5\u4F5C\u533A",
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
    clearSearch: "Clear search",
    showMore: "Show {count} more",
    showLess: "Show less",
    untitled: "Untitled session",
    noSessions: "No sessions yet",
    claimedBy: "Claimed by",
    claimedElsewhere: "Sessions are listed under the claiming project; not repeated here",
    noWorkspaces: "No workspaces",
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
   (Never write a backtick in this block \u2014 it is itself a template literal.) */
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
/* An unresolvable member is still listed and still removable \u2014 it must be
   visible to be managed at all. Muted, not disabled: unchecking it is a
   deliberate removal, not an error to prevent. These follow the base rules
   above so the intent does not depend on specificity to win. */
.loom-pick-missing .loom-pick-name { color: var(--dsw-alias-label-secondary); }
.loom-pick-missing .loom-pick-path { color: var(--dsw-alias-state-warn-primary); }
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
/* The sidebar's search field.
   (No backticks anywhere in this block: it is itself a template literal, and
   one would end it early \u2014 which has now happened five times.)

   The metrics come from the shipped browser's own search (ui-workspace's
   WorkspaceBrowser.module.css) and NOT from the Input atom. That atom is built
   for dialog forms \u2014 32px tall, a filled bg-layer-1 surface, a 12px radius,
   14px text \u2014 so in the sidebar it was the only opaque box in a column whose
   whole language is "transparent at rest, filled on hover", and it read as a
   heavier foreign object than the tree it filters.

   What is deliberately NOT copied is that control's two-state geometry: there a
   28px icon-only button expands into a 30px bordered field with a negative
   inline margin. Loom's search is always open, so only the resting metrics
   apply and nothing may move on hover.

   ALIGNMENT \u2014 everything is measured from the sidebar's own 4px padding, so
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
     layout stable too, but still offsets everything inside it by half a pixel \u2014
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
/* \u2500\u2500 the section band \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   A section header is a BAND, not a row. Three things separate it from the
   list beneath it \u2014 a hairline above, the space that rule buys, and the
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
   the group beneath \u2014 the clearest spacing fault in this panel.

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

/* ONE twisty, always visible.
   An earlier version swapped a type icon for the twisty on hover. That read as
   flicker: the glyph changed under the pointer, so the row's identity and its
   collapsed state were BOTH unclear at the moment you were aiming at it. It
   also needed an icon per level, and the ones that exist are ambiguous \u2014 a
   folder with a plus for "projects" reads as "add", and a folder for both
   \u9879\u76EE and \u5DE5\u4F5C\u533A separates nothing.
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
   shrinks before the name does \u2014 the name identifies the row, this only
   qualifies it \u2014 and disappears when there is no room at all. */
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

/* The \u804A\u5929 section has no group level, so its sessions hang directly off the
   SECTION and indent to that section's twisty centre (14px) rather than a
   group's (18px).
   Without this they rendered at the section's own level, the same depth as a
   group header \u2014 reading as siblings of \u804A\u5929 rather than as its contents, and
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
function roleLabel(t, role) {
  return role === "readonly" ? t("readonly") : t("writable");
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
  const rows = React.useMemo(() => {
    const byId = /* @__PURE__ */ new Map();
    for (const member of project?.members ?? []) {
      if (typeof member?.workspaceId !== "string" || member.workspaceId.length === 0) continue;
      byId.set(member.workspaceId, {
        workspaceId: member.workspaceId,
        title: member.workspaceId,
        path: "",
        role: member.role ?? "writable",
        missing: true
      });
    }
    for (const workspace of workspaces ?? []) {
      const previous = byId.get(workspace.workspaceId);
      byId.set(workspace.workspaceId, {
        workspaceId: workspace.workspaceId,
        title: workspace.title,
        path: workspace.path,
        role: previous?.role ?? "writable",
        missing: false
      });
    }
    return [...byId.values()];
  }, [project, workspaces]);
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
    const members = mergeMembers(project?.members, [...selected]);
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
        rows.map((row) => h(
          "label",
          {
            key: row.workspaceId,
            className: row.missing ? "loom-pick loom-pick-missing" : "loom-pick"
          },
          h("input", {
            type: "checkbox",
            checked: selected.has(row.workspaceId),
            onChange: () => toggle(row.workspaceId)
          }),
          h(
            "span",
            { className: "loom-pick-text" },
            h(
              "span",
              { className: "loom-pick-name" },
              h("span", { className: "loom-pick-title", title: row.title }, row.title),
              // The role is shown, never edited: this dialog edits membership,
              // and a role rewritten here is how `readonly` members were lost.
              h("span", { className: "loom-pick-role" }, roleLabel(t, row.role))
            ),
            h("span", {
              className: "loom-pick-path",
              title: row.missing ? t("missingHint") : row.path
            }, row.missing ? t("missingHint") : row.path)
          ),
          // The starting folder is a per-project preference, not a rank: it
          // never privileges one folder during discovery. It only appears for a
          // member, because a folder that is not in the project cannot be its
          // starting point — a disabled radio on every row was pure noise.
          selected.has(row.workspaceId) && h(
            "span",
            {
              className: "loom-pick-default",
              title: t("defaultStart")
            },
            h("input", {
              type: "radio",
              name: "loom-default",
              checked: defaultId === row.workspaceId,
              onChange: () => setDefaultId(row.workspaceId)
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
    }, h(IconEllipsisOutlineRegular, { size: 16 }))
  });
}
function SessionRow({ summary, current, onClick, onRename, onFork, onArchive, t }) {
  const title = summary.displayTitle || t("untitled");
  const settled = summary.blank !== true;
  const items = [
    { id: "rename", label: t("rename"), icon: h(IconEditOutlineRegular, null) },
    { id: "fork", label: t("fork"), icon: h(IconBranchOutlineRegular, null) },
    { id: "archive", label: t("archive"), icon: h(IconArchiveOutlineRegular, { size: 16 }) }
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
function LoomGroup({ row, actions, menu, isCollapsed, isExpanded, onToggleCollapse, onToggleExpand, onOpen, onNew, onRename, onFork, onArchive, currentId, claimedBy, t }) {
  const open = !isCollapsed;
  const showAll = isExpanded;
  const PREVIEW = 4;
  const shown = showAll ? row.sessions : row.sessions.slice(0, PREVIEW);
  const hidden = row.sessions.length - PREVIEW;
  const claimed = Array.isArray(claimedBy) && claimedBy.length > 0;
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
      // the session list indents to and the guide line aligns under. It stays
      // put: see the note above on why the hover swap was removed.
      h(
        "span",
        { className: "loom-slot" },
        h(
          "span",
          { className: open ? "loom-twisty" : "loom-twisty loom-twisty-collapsed" },
          h(IconChevronDownOutlineRegular, { size: 14 })
        )
      ),
      h("span", { className: "loom-group-name" }, row.title),
      // A folder a project claims STAYS in this section — a folder is never
      // exclusive to a project — so the row says where else it appears instead
      // of vanishing, which is what made a claimed folder look unbindable.
      claimed && h("span", {
        className: "loom-claimed",
        title: `${t("claimedBy")}: ${claimedBy.join(", ")}`
      }, claimedBy.join(" \xB7 ")),
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
        }, h(IconPlusOutlineRegular, { size: 16 }))
      )
    ),
    open && h(
      "div",
      { className: "loom-children" },
      row.sessions.length === 0 ? h("div", { className: "loom-empty-section" }, claimed ? t("claimedElsewhere") : t("noSessions")) : shown.map((summary) => h(SessionRow, {
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
function PanelSeatProbe({ usePanelInfo, onChange }) {
  const active = usePanelInfo((info) => (info?.activePanelId ?? null) !== null) === true;
  React.useEffect(() => {
    onChange(active);
  }, [active, onChange]);
  return null;
}
function LoomSidebar({
  projects,
  snapshot,
  sessionState,
  panelActive,
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
    () => deriveSections({ projects, snapshot, sessionState, panelActive }),
    [projects, snapshot, sessionState, panelActive]
  );
  const needle = query.trim().toLowerCase();
  const keep = (summary) => needle === "" || String(summary.displayTitle ?? "").toLowerCase().includes(needle);
  const narrow = (rows) => needle === "" ? rows : rows.map((row) => ({ ...row, sessions: row.sessions.filter(keep) })).filter((row) => row.sessions.length > 0 || String(row.title ?? "").toLowerCase().includes(needle));
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
        { id: "rename", label: t("renameWorkspace"), icon: h(IconEditOutlineRegular, null) },
        { id: "delete", label: t("deleteWorkspace"), icon: h(IconTrashOutlineRegular, null), danger: true }
      ],
      onSelect: (id) => {
        if (id === "rename") onRenameWorkspace(row.key, row.title);
        if (id === "delete") onDeleteWorkspace(row.key);
      }
    },
    currentId: derived.highlighted,
    claimedBy: row.claimedBy,
    t
  });
  const [hiddenSections, setHiddenSections] = React.useState(() => /* @__PURE__ */ new Set());
  const toggleSection = toggle(setHiddenSections);
  const sectionHead = (id, label, count, action, first = false) => {
    const open = !hiddenSections.has(id);
    return h(
      "div",
      {
        className: first ? "loom-section-head loom-section-head-first" : "loom-section-head"
      },
      h(
        "button",
        {
          type: "button",
          className: "loom-section-title",
          "aria-expanded": open,
          title: label,
          onClick: () => toggleSection(id)
        },
        h(
          "span",
          { className: open ? "loom-twisty" : "loom-twisty loom-twisty-collapsed" },
          h(IconChevronDownOutlineRegular, { size: 14 })
        ),
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
      h("span", { className: "loom-search-icon" }, h(IconSearchOutlineRegular, { size: 14 })),
      h("input", {
        type: "search",
        className: "loom-search-input",
        value: query,
        placeholder: t("searchPlaceholder"),
        "aria-label": t("searchPlaceholder"),
        onChange: (event) => setQuery(event.target.value),
        // Escape clears rather than leaving the field with stale text, matching
        // how the shipped search behaves.
        onKeyDown: (event) => {
          if (event.key === "Escape") setQuery("");
        }
      }),
      // The clear affordance only exists once there is something to clear, so
      // the resting field stays as quiet as a plain label.
      query.length > 0 && h("button", {
        type: "button",
        className: "loom-search-clear",
        "aria-label": t("clearSearch"),
        onClick: () => setQuery("")
      }, h(IconCloseOutlineRegular, { size: 12 }))
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
      }, h(IconPlusOutlineRegular, { size: 16 })),
      true
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
      currentId: derived.highlighted,
      t,
      // One ellipsis, matching the shipped row affordance. The preflight lives
      // here because it is a verb on a project, not a place to navigate to.
      menu: {
        label: t("projectActions"),
        items: [
          { id: "preflight", label: t("preflight"), icon: h(IconListPenOutlineRegular, null) },
          { id: "edit", label: t("edit"), icon: h(IconEditOutlineRegular, null) },
          { id: "delete", label: t("delete"), icon: h(IconTrashOutlineRegular, null), danger: true }
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
      }, h(IconPlusOutlineRegular, { size: 16 }))
    ),
    sectionBody("workspaces", () => workspaceRows.length === 0 ? h("div", { className: "loom-empty-section" }, t("noWorkspaces")) : workspaceRows.map(group)),
    sectionHead("chats", t("sectionChats"), chatSessions.length),
    sectionBody("chats", () => chatSessions.length === 0 ? h("div", { className: "loom-empty-section" }, t("noChats")) : h(
      "div",
      { className: "loom-children loom-children-section" },
      chatSessions.map((summary) => h(SessionRow, {
        key: summary.id,
        summary,
        current: summary.id === derived.highlighted,
        onClick: () => onOpenSession(summary.id),
        onRename: onRenameSession,
        onFork: onForkSession,
        onArchive: onArchiveSession,
        t
      }))
    ))
  );
}
function LoomSidebarHost({ bridge, ctx }) {
  function LoomSidebarSeated({ useWorkspaces, useSessions, usePanelInfo, bridge: bridge2, ctx: ctx2, t }) {
    const snapshot = useWorkspaces((state) => state);
    const sessionState = useSessions((state) => state);
    const [panelActive, setPanelActive] = React.useState(false);
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
      usePanelInfo !== void 0 && h(PanelSeatProbe, { usePanelInfo, onChange: setPanelActive }),
      error.length > 0 && h("div", { className: "loom-empty-section loom-warn" }, error),
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
    const { useWorkspaces, useSessions, usePanelInfo, t: seatT } = props ?? {};
    if (typeof useWorkspaces !== "function" || typeof useSessions !== "function") return null;
    return h(LoomSidebarSeated, {
      useWorkspaces,
      useSessions,
      // Undefined when absent, never a substitute hook: the substitute used to
      // live here and its hook count differed from the real seat's, so a seat
      // that appeared later reshaped the caller's hook list and crashed it.
      usePanelInfo: typeof usePanelInfo === "function" ? usePanelInfo : void 0,
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
      return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  report(bridge, {
    event: "apply",
    ok: true,
    hasSlots: ctx.slots !== void 0,
    hasInject: typeof ctx.slots?.inject === "function",
    hasRegister: typeof ctx.slots?.register === "function",
    // A slot that is not yet DECLARED makes `slots.inject` return early, so this
    // records whether the declaration had already landed when Loom applied.
    sidebarSpec: probe(() => ctx.slots.spec("sidebar") !== void 0),
    workspacesSpec: probe(() => ctx.slots.spec("sidebar.workspaces") !== void 0)
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

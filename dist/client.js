window.__ModuleLoader__.load({ id: 'dsh-loom', factory: (require) => { var module = { exports: {} }; var exports = module.exports;

// src/client.cjs
var React = require("react");
var {
  Button,
  Tag,
  StateDot,
  Modal,
  Input,
  IconFolderOpenOutline16
} = require("@deepseek-ai/dsh-client-ui-primitives");
var h = React.createElement;
var NS = "dsh-loom";
var CHANNEL = "/dsh-loom";
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
    writeBoundaryTitle: "\u5199\u5165\u8303\u56F4"
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
    writeBoundaryTitle: "Write scope"
  }
};
var STYLES = `
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
          h("div", { className: "loom-row" }, h("span", null, skill.name)),
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
            { className: "loom-row" },
            h("span", null, collision.name),
            h(Tag, { tone: "success" }, `${t("winner")} ${collision.winner.workspaceId}`)
          ),
          collision.shadowed.map((shadowed) => h(
            "div",
            { key: shadowed.workspaceId, className: "loom-row" },
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
            { className: "loom-row" },
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
        onChange: (event) => {
          setTitle(event.target.value);
          setError("");
        }
      })
    ),
    h(
      "div",
      { className: "loom-field" },
      h("label", { className: "loom-field-label" }, t("folderPicker")),
      h("div", { className: "loom-muted" }, t("folderPickerHint")),
      h(
        "div",
        { className: "loom-picker" },
        workspaces.map((workspace) => h(
          "div",
          { key: workspace.workspaceId, className: "loom-pick" },
          h(
            "label",
            { className: "loom-check" },
            h("input", { type: "checkbox", checked: selected.has(workspace.workspaceId), onChange: () => toggle(workspace.workspaceId) }),
            h("span", { className: "loom-member-name" }, workspace.title)
          ),
          h("span", { className: "loom-member-path", title: workspace.path }, workspace.path),
          // Choosing a starting folder is a per-project preference, not a
          // rank: it never privileges one folder during discovery.
          h(
            "label",
            { className: "loom-check", title: t("defaultStart") },
            h("input", {
              type: "radio",
              name: "loom-default",
              checked: defaultId === workspace.workspaceId,
              disabled: !selected.has(workspace.workspaceId),
              onChange: () => setDefaultId(workspace.workspaceId)
            }),
            h("span", { className: "loom-muted" }, t("defaultStart"))
          )
        ))
      )
    ),
    error.length > 0 && h("div", { className: "loom-warn" }, error)
  );
}
function LoomPanel({ bridge, workspaces, t }) {
  const [manifest, setManifest] = React.useState(void 0);
  const [loadError, setLoadError] = React.useState("");
  const [unsupported, setUnsupported] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [plan, setPlan] = React.useState(void 0);
  const [busy, setBusy] = React.useState(false);
  const reload = React.useCallback(async () => {
    try {
      const value = await bridge.getManifest();
      setManifest(value.manifest);
      setLoadError(value.ok === false ? String(value.error ?? "") : "");
      setUnsupported(/newer than supported/.test(String(value.error ?? "")));
    } catch (error) {
      setLoadError(error.message);
    }
  }, [bridge]);
  React.useEffect(() => {
    void reload();
  }, [reload]);
  const runPreflight = React.useCallback(async (projectId) => {
    setBusy(true);
    setPlan(void 0);
    try {
      const value = await bridge.preflight(projectId);
      setPlan(value.plan);
    } catch (error) {
      setLoadError(error.message);
      setPlan(void 0);
    } finally {
      setBusy(false);
    }
  }, [bridge]);
  const saveProject = React.useCallback(async (project) => {
    if (manifest === void 0) return;
    const projects2 = [...manifest.projects.filter((item) => item.id !== project.id), project];
    try {
      const value = await bridge.putManifest({ schemaVersion: 2, projects: projects2 });
      setManifest(value.manifest);
    } catch (error) {
      setLoadError(interpolate(t("saveFailed"), { message: error.message }));
    }
  }, [bridge, manifest, t]);
  const deleteProject = React.useCallback(async (projectId) => {
    if (manifest === void 0) return;
    try {
      const value = await bridge.putManifest({
        schemaVersion: 2,
        projects: manifest.projects.filter((item) => item.id !== projectId)
      });
      setManifest(value.manifest);
      setPlan(void 0);
    } catch (error) {
      setLoadError(interpolate(t("saveFailed"), { message: error.message }));
    }
  }, [bridge, manifest, t]);
  const projects = manifest?.projects ?? [];
  return h(
    "div",
    { className: "loom-panel" },
    h(
      "div",
      { className: "loom-inner" },
      h(
        "div",
        { className: "loom-head" },
        h(
          "div",
          { className: "loom-head-text" },
          h("h1", { className: "loom-h1" }, t("projects")),
          h("p", { className: "loom-sub" }, t("subtitle"))
        ),
        h(Button, { variant: "primary", onClick: () => setEditing({}) }, t("newProject"))
      ),
      unsupported && h("div", { className: "loom-warn" }, t("unsupported")),
      loadError.length > 0 && h("div", { className: "loom-warn" }, interpolate(t("loadFailed"), { message: loadError })),
      projects.length === 0 ? h(
        "div",
        { className: "loom-empty" },
        h("div", { className: "loom-empty-title" }, t("emptyTitle")),
        h("div", { className: "loom-empty-hint" }, t("emptyHint")),
        h(Button, { variant: "outline", onClick: () => setEditing({}) }, t("newProject"))
      ) : projects.map((project) => h(
        "div",
        { key: project.id, className: "loom-card" },
        h(
          "div",
          { className: "loom-card-head" },
          h(
            "div",
            { className: "loom-card-title" },
            h("span", { className: "loom-name" }, project.title),
            h(Tag, null, interpolate(t("memberCount"), { count: project.members.length }))
          ),
          h(
            "div",
            { className: "loom-card-actions" },
            h(Button, { variant: "outline", size: "sm", onClick: () => runPreflight(project.id), disabled: busy }, t("preflight")),
            h(Button, { variant: "ghost", size: "sm", onClick: () => setEditing(project) }, t("edit")),
            h(Button, { variant: "ghost", size: "sm", onClick: () => deleteProject(project.id) }, t("delete"))
          )
        ),
        // Every member is listed, including the ones that contribute
        // nothing: a member that resolved but added no skill is exactly
        // what the preflight exists to expose.
        h(
          "div",
          { className: "loom-members" },
          project.members.map((member) => h(
            "div",
            { key: member.workspaceId, className: "loom-member" },
            h(StateDot, { state: member.missing === true ? "warning" : "done" }),
            h("span", { className: "loom-member-name" }, member.workspaceId),
            h("span", { className: "loom-member-path", title: member.path }, member.path ?? ""),
            h(Tag, { tone: member.role === "readonly" ? "quiet" : "neutral" }, roleLabel(t, member.role)),
            member.missing === true && h(Tag, { tone: "warning" }, t("missing"))
          ))
        ),
        plan !== void 0 && plan.projectId === project.id && h(PreflightPanel, {
          plan,
          t,
          busy,
          onRefresh: () => runPreflight(project.id)
        })
      )),
      editing !== null && h(ProjectEditor, {
        project: editing.id === void 0 ? void 0 : editing,
        workspaces,
        onSave: saveProject,
        onClose: () => setEditing(null),
        t
      })
    )
  );
}
var name = "dsh-loom";
var inject = ["slots", "locale", "workspaces", "connection"];
function LoomPanelHost({ bridge }) {
  function LoomPanelSeated({ useWorkspaces, t }) {
    const state = useWorkspaces((snapshot) => snapshot);
    return h(LoomPanel, { bridge, workspaces: state?.items ?? [], t });
  }
  return function LoomPanelBound(props) {
    const { useWorkspaces, t } = props ?? {};
    if (typeof useWorkspaces !== "function") return null;
    return h(LoomPanelSeated, {
      useWorkspaces,
      t: typeof t === "function" ? t : (key) => key
    });
  };
}
function LoomIcon({ size, active }) {
  const edge = typeof size === "number" ? size : 16;
  return h("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: active === false ? 0.7 : 1
    }
  }, h(IconFolderOpenOutline16, { size: edge }));
}
function apply(ctx) {
  ctx.effect(installStyles, "dsh-loom: styles");
  ctx.effect(() => ctx.locale.register(NS, dictionaries), "dsh-loom: dictionaries");
  const bridge = createBridge(ctx);
  const Panel = LoomPanelHost({ bridge });
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
  const label = () => {
    try {
      return ctx.locale.getLocale().active === "zh" ? "\u9879\u76EE" : "Projects";
    } catch {
      return "Projects";
    }
  };
  try {
    ctx.slots.inject("main", contribute(
      ctx,
      bridge,
      "main",
      { name: "main", key: "loom", locale: NS },
      Panel
    ));
    report(bridge, { event: "inject", slot: "main", ok: true });
  } catch (error) {
    report(bridge, {
      event: "inject",
      slot: "main",
      ok: false,
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? "").slice(0, 1200)
    });
  }
  try {
    ctx.slots.inject("sidebar.panellist", contribute(
      ctx,
      bridge,
      "sidebar.panellist",
      { name: "sidebar.panellist", id: "loom", order: 40, locale: NS, label },
      LoomIcon
    ));
    report(bridge, { event: "inject", slot: "sidebar.panellist", ok: true });
  } catch (error) {
    report(bridge, {
      event: "inject",
      slot: "sidebar.panellist",
      ok: false,
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? "").slice(0, 1200)
    });
  }
}
module.exports = { LoomIcon, LoomPanel, PreflightPanel, ProjectEditor, apply, createBridge, inject, name, renderPlanText };
return module.exports; } });

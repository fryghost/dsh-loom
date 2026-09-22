# 从 dsh-projects 迁移

## 会不会自动迁移？

**不会自动执行。** Loom 提供了 `migrateFromV1()`，但需要显式调用。理由：迁移是单向且有损的（见下），不应在插件加载时悄悄发生。

## v1 → v2 的映射

| v1 | v2 |
|---|---|
| `groups[].id` | `projects[].id` |
| `groups[].title` | `projects[].title` |
| `groups[].memberWorkspaceIds: string[]` | `projects[].members: Array<{ workspaceId, role }>` |
| `groups[].primaryWorkspaceId` | `projects[].defaultWorkspaceId`（语义降级，见下） |
| `claimed` 独占集合 | **删除** |

## 有损的部分（必须知道）

### 1. 被 v1 丢弃的成员关系无法恢复

v1 的 `normalizeProjectGroups` 会静默丢弃：

```js
.filter((workspaceId) => available.has(workspaceId) && !claimed.has(workspaceId));
if (memberWorkspaceIds.length < 2) continue;   // 整个组合消失
```

**这些被丢弃的关系 v1 从未存储过**，因此无从恢复。迁移只能保住 v1 实际保留下来的一切。`migrateFromV1()` 的返回值里带 `note` 字段说明这一点，调用方应当把它展示给用户。

### 2. `primaryWorkspaceId` 的语义降级

v1 中"主文件夹"决定了新会话的 cwd，因而间接决定了哪些技能与指令可见。v2 中 `defaultWorkspaceId` **只是一个默认起点**：

- 不再影响技能发现（所有成员平等参与）；
- 不再影响指令发现；
- 用户可在项目编辑器中随时改。

如果你依赖"主文件夹决定上下文"这个旧行为，迁移后行为会**变宽**（更多文件夹参与），这通常是期望的结果，但值得知道。

## 迁移步骤

1. **备份**：复制 `%APPDATA%`/浏览器 profile 中 `dsh-projects` 相关的 localStorage 键（导出为 JSON 即可）。
2. **转换**：把 v1 数据传给 `migrateFromV1()`，得到 v2 manifest。
3. **写入**：通过 Loom 的 `putManifest` RPC 端点，或直接写 `$DSH_HOME/projects/manifest.json`。
4. **校验**：打开预检面板，确认每个项目的成员数量与预期一致。
5. **保留**：不要删除 v1 的 localStorage 键，降级时仍可回退。

## 并存

Loom 与 dsh-projects 使用不同的 RPC 通道（`/dsh-loom` vs `/dsh-projects`）与不同的存储位置，**不会互相覆盖**。但两者都会向 `sidebar.workspaces` 槽注册，同时启用会出现两组面板。

建议：迁移完成后禁用 dsh-projects。

## 卸载

删除 Loom 后：

- `$DSH_HOME/projects/manifest.json` **保留**（属于用户数据）；
- DSH Workspace、会话、文件不受影响；
- 需要显式删除清单文件才会彻底清除。

这与 dsh-projects 的行为一致（都不删用户数据），区别只在于 Loom 的清单不在浏览器里，因此清站点数据不会影响它。

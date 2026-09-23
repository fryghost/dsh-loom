# 设计说明

本文记录 Loom 的设计决策、源码依据，以及**被否决的方案**——后者往往比结论更有价值。

## 1. 根因：`SessionHeader.cwd` 是唯一锚点

DSH 的会话模型把 `SessionHeader.cwd` 当作唯一工作目录锚点，四个下游全部挂在它上面：

| 下游 | 挂载方式 | 能否跨文件夹 |
|---|---|---|
| 技能发现 | `options.cwd` → `findProjectRoot` → 单根 | ✅ 可经 `registerProvider` 扩展 |
| `AGENTS.md` | `findProjectRoot(cwd)` → `ancestorChain` | ✅ 可经 `systemPrompt.context` 扩展 |
| 文件**读** | 不经沙箱 | ✅ 天然可用 |
| 文件**写** | `writableRoots(policy)` = 单根 + temp | ❌ 需改核心 |

因此"多文件夹项目"必须重新定义会话的上下文来源，而不是只给会话贴一个项目标签。

### 关键源码依据

**技能是单根的。** `packages/skill/skill/src/index.ts:102-108`：

```ts
export interface SkillLookupOptions {
  readonly cwd?: string | undefined   // 单数
  readonly signal?: AbortSignal | undefined
}
```

缓存键同样是单 `cwd`（同文件 `643-645`）。而发现逻辑（`packages/skill/skill-filesystem/src/index.ts:945-955`）是**向上**找 `.git`，只读该根下固定的 `.dsh/skills` 与 `.agents/skills`——**不向下递归**。

**读操作不受沙箱约束。** `packages/fs/fs-sandbox/src/index.ts:6-8` 原文：

> this package adds only the per-call POLICY fence on **the two mutations**. **Reads pass through untouched: every mode permits reading.**

只有 `writeText` 与 `editText` 经过 `checkedTarget`。这是本设计最重要的杠杆：跨文件夹**读取**在任何模式下都成立，所以技能与指令聚合不需要触碰沙箱。

**写入边界是单根。** `packages/sandbox/sandbox/src/roots.ts:52-55`：

```ts
export function writableRoots(policy: SandboxExecutionPolicy): string[] {
  if (policy.mode !== 'workspace-write') return []
  return [...new Set([policy.workspaceRoot, '/tmp', tmpdir()].map(canonicalPath))]
}
```

## 2. 被否决的方案

### 2.1 否决：物化聚合根（junction / 软链接）

**想法**：在 `$DSH_HOME/projects/<id>/` 下建软链接指向各成员，把会话 cwd 指向聚合根，让 DSH 原生发现逻辑自动覆盖全部成员。

**否决理由**：这不是"软链接恰好不work"，而是 **DSH 明确设计了针对软链接的身份收敛与逃逸防御**，方向与聚合根所需的完全相反。

**证据一：软链接在 DSH 中使身份"收敛"，而非"扩张"。**

`packages/workspace/workspace/src/paths.ts:39-52` 原文：

> uniqueness is string equality of canonicalized paths (**a symlink to an existing workspace's directory collides**)

`workspace.spec.ts:382` 把这个意图钉成了测试：

```ts
const alias = join(base, 'first-link')
await symlink(firstDir, alias)
const reused = await registry.create(alias, 'Ignored')
expect(reused).toBe(first)          // 同一个 workspace，不是新建一个
```

若 DSH 想让软链接**扩张**出一个 workspace 的多个文件夹，别名应当铸造**新的** workspace。它刻意返回同一个——这是身份**收敛**。

**证据二：软链接逃逸是被主动拒绝的，且比前缀匹配更强。**

`fs-sandbox/src/containment.ts:58-75` 的 `isPathUnder` 并非只做字典序前缀比较：

```ts
export async function isPathUnder(path: string, root: string, ...): Promise<boolean> {
  if (isLexicallyUnder(path, root, caseSensitive)) return true
  const rootInfo = await statIfPresent(root)
  let ancestor = path
  while (true) {
    const ancestorInfo = await statIfPresent(ancestor)
    if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true   // dev + ino
    const parent = dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}
```

它沿祖先链比较 **device + inode**。于是 cwd = 聚合根、内含指向成员 A 的 junction 时：

- `targetKey` = realpath = **成员 A 的真实路径**；
- `isPathUnder(memberA/file.txt, aggregateRoot)` → 字典序失败；dev/ino 上溯从成员 A 一路到文件系统根，**永远不会**遇到聚合根的 inode → `false` → `FS_SANDBOX_DENIED`。

`fs-sandbox.spec.ts:124,132` 把这两条路径都写成了测试（指向工作区**外**的软链接被拒、软链接目录下新建文件被拒）；`api/workspace-files/tests/read.spec.ts:161` 更严格——**即使软链接指回工作区内部也拒绝**。

`docs/subsystems/filesystem.md:74` 说明了 `lstat` 的存在目的：让 *"consumers with trust-boundary rules can reject repository-owned links before resolving a target."*

**结论**：DSH 对软链接的防御，恰恰是使"软链接式多根"不可能的原因。这不是疏漏，而是设计意图。方向与直觉相反：不是"DSH 考虑了软链接所以支持多根"，而是"**DSH 考虑了软链接，所以明确不支持用软链接做多根**"。

**教训**：看起来"更原生"的方案，如果绕不过真实的约束，就只是把失败推迟到更难排查的地方。

### 2.2 暂不做，但比原先估计的小得多：扩展沙箱为多根

**重要修正**：本方案最初被判断为"影响面很大"，实际核查后发现**执行层几乎已经就绪**，真正的阻力集中在 Windows。

**已就绪的部分**——`writableRoots()` **本来就返回数组**，只是长度恒为 3（`workspaceRoot` + `/tmp` + `tmpdir()`）：

```ts
// packages/sandbox/sandbox/src/roots.ts:52-55
export function writableRoots(policy: SandboxExecutionPolicy): string[] {
  if (policy.mode !== 'workspace-write') return []
  return [...new Set([policy.workspaceRoot, '/tmp', tmpdir()].map(canonicalPath))]
}
```

消费方**已经是多根循环**，无需改动：

```ts
// packages/fs/fs-sandbox/src/index.ts:134
for (const root of writableRoots(policy)) {
  if (await isPathUnder(fresh.targetKey, root)) { contained = true; break }
}
```

```ts
// packages/sandbox/sandbox-local/src/profiles.ts:53-56
const roots = writableRoots(policy)
if (roots.length > 0) {
  forms.push(`(allow file-write* ${roots.map(root => `(subpath ${sbplString(root)})`).join(' ')}`)
}
```

因此 **POSIX 侧（Seatbelt）与进程内 fs 围栏只需给 policy 加一个 `additionalRoots?: readonly string[]` 并让 `writableRoots` 合并即可**，改动量很小。

**真正的阻力是 Windows ACL**。`packages/sandbox/sandbox-windows-acl/src/workspace-sid.ts:1-25` 的设计前提就是**单一根**：

> Every confined execution of the same workspace — across sessions, server restarts, and calls — carries the SAME write SID, so the workspace-root ACE materializes once per workspace per machine ... Renaming the workspace directory derives a new SID — the old standing ACEs are inert residue, and the next session re-propagates once.

多根意味着 N 个 SID、N 份 ACE 传播、N 条清理路径，以及"成员被移出项目后残留 ACE 如何回收"的新问题。**bwrap / Landlock 也各自维护 grant 拼写**（见 `roots.ts:9-11` 注释），需要逐个方言对齐。

**结论**：这仍是一个独立的上游提案（Loom 不应擅自绕过安全边界），但它的**收益/成本比明显好于最初判断**——POSIX 平台接近"加一个字段"，成本主要在 Windows ACL 与跨方言一致性验证。值得单独提 RFC，而不是长期接受限制。

### 2.3 否决：把 `AGENTS.md` 逐级覆盖语义跨文件夹复现

DSH 用 `ancestorChain(root, cwd)` 实现"从项目根到 cwd 逐级叠加"，语义是**子目录覆盖父目录**。多个平行成员之间不存在祖先关系，这个语义**无法复现**。

因此 Loom 的指令聚合是**并列拼接 + 来源标注**，不是继承链。UI 必须说明这一点，否则用户会误以为成员 B 能覆盖成员 A。

## 3. 核心设计决策

### 3.0 前置事实：不装插件时，软链接能聚合到哪一步

这是"要不要写 Loom"的判据，因此固化成了测试（`test/dsh-baseline.test.js`），而不是散文描述。

**但技能只是一个子系统。** 完整审计后，`SessionHeader.cwd` 这一个锚点挂着 **7 个子系统**，它们对软链接的反应**各不相同**：

| # | 子系统 | 锚点来源 | 软链接能否聚合 | 依据 |
|---|---|---|---|---|
| 1 | **技能发现** | `options.cwd` → `findProjectRoot` | ⚠️ 仅"逐技能链接"可行 | `skill-filesystem/src/index.ts:945-955` |
| 2 | **`AGENTS.md`** | `header.cwd` → `ancestorChain` | ⚠️ **文件级**链接可行（每目录 1–2 条） | `agent-instructions/src/index.ts:127`、`files.ts:105-107` |
| 3 | **`@` 文件引用索引** | `agent.session.header.cwd` | ❌ **显式拒绝软链接** | `file-reference-local/src/index.ts:122` + `search.ts:275` |
| 4 | **`grep` / `glob` 工具** | `exec.agent.session.header.cwd` | ❌ ripgrep 默认不跟随 | `tool-fs-search/src/search-core.ts:234`，argv 无 `--follow` |
| 5 | **沙箱写入边界** | `header.cwd` → `resolveWorkspaceRoot` | ❌ dev+ino 判定失败 | `sandbox-policy/src/index.ts:168` |
| 6 | **bash / pwsh workdir** | `exec.agent?.session.header.cwd` | ❌ 继承单 cwd | `tool-bash/src/index.ts:143-150` |
| 7 | **LSP workspaceRoot** | `sessionCwd(exec)` | ❌ 单根 | `tool-lsp/src/index.ts:185` |

#### 实测结果

**技能（子系统 1）**：

| 布局 | 结果 |
|---|---|
| `A/b` → 链接到文件夹 `B` | ❌ **完全不聚合**（只读到 A 自己的技能） |
| `A/.dsh/skills` 本身是指向 `B/.dsh/skills` 的链接 | ❌ **替换而非聚合**（只读到 B 的，A 的丢失） |
| 在 `A/.dsh/skills/` 内为**每个技能**建链接 | ✅ **能聚合** |
| 在 `A/.dsh/skills/` 内链接"一整个技能目录" | ❌ 被跳过（只读一层） |
| 技能放在 git 仓库内的**子目录** | ❌ 完全读不到（发现停在仓库根） |

**`@` 文件引用（子系统 3）—— 比技能更严**：

`file-reference-local/src/search.ts:275` **主动拒绝**软链接：

```ts
const status = await lstat(current)
if (status.isSymbolicLink() || !status.isDirectory()) return undefined
```

实测（Windows junction）：

```
readdir(A) → b-link: isDirectory=false, isSymbolicLink=true
   → scanWorkspace 只在 isDirectory() 为真时入索引 ⇒ junction 贡献 0 条索引
resolveDisplayDirectory(A, "b-link") = undefined
   → @ 引用列表直接拒绝该 junction
```

即使把路径写成绝对形式 `@A/b-link/b-file.txt`，**读取能成功，但索引永远不列出它**——用户无法通过 `@` 补全发现它。

**`grep` / `glob`（子系统 4）**：

DSH 构造的 argv **不含 `--follow`**（`glob.ts:89-107`、`grep.ts:111-116`）。用真实 ripgrep 15.2.0 实测：

```
--files --no-ignore --hidden              → 只有 A/a-file.txt
--files --no-ignore --hidden --follow     → A/a-file.txt + A/b-link/b-file.txt

--regexp=from                             → 只匹配 A
--regexp=from --follow                    → 同时匹配 A 与 B
```

**结论**：软链接在**读取单个已知路径**时可用（内核会跟随），但在**发现/索引/搜索**层面几乎全部失效——因为那些子系统要么主动拒绝软链接（子系统 3），要么默认不跟随（子系统 4），要么只认固定路径（子系统 1、2）。

这解释了一个常见困惑："我明明能 `cat` 那个文件，为什么 DSH 搜不到？"——因为**能打开 ≠ 能被发现**。

#### 唯一可行的免插件方案及其代价

可行的是**子系统 1 的"逐技能链接"**与**子系统 2 的"逐目录 AGENTS.md 链接"**：

`agent-instructions/src/files.ts:105-107` 用 `stat`（非 `lstat`）判定，并有专门测试（`agent-instructions.spec.ts:492`）：

> `stat` (not `lstat`) follows a final-component symlink so a link to a regular file loads

所以 `A/AGENTS.md → B/AGENTS.md` 确实能加载。但代价是：

- **每个技能一条链接**，B 里新增技能不会自动出现；
- **`AGENTS.md` 只能整个替换**——无法"合并"两个文件夹的指令，只能让 A 的 `AGENTS.md` 指向 B 的那一份，A 自己的内容丢失；
- B 中技能/文件改名或删除后留下**悬空链接**；
- 对 `@` 引用、`grep`、`glob` **完全无效**（子系统 3、4）；
- 仍然 `workspace-write` 下不可写（子系统 5）；
- **无法回答"哪些生效、哪些冲突"**——这正是 Loom 预检要解决的问题。

**这正是 Loom 存在的理由**——不是"软链接不行"，而是"**软链接只能覆盖 7 个子系统里的一部分，且都是最难维护的部分**"。

### 3.1 为什么用"注册技能提供者"而不是改 cwd

`ctx.skills.registerProvider()` 是公开 API，注册表支持多个提供者共存（`packages/skill/skill/src/index.ts:390`）。Loom 作为**追加**提供者存在：

- cwd 仍是真实成员文件夹 → 不触碰沙箱边界；
- DSH 原生逻辑照常加载活动文件夹的技能 → Loom 只补充**其他成员**的；
- 同名冲突由 `rank` 与注册顺序决定，且 Loom 把落败者报告出来。

`rank` 取 `150`：高于 `PROJECT_DSH_RANK`(100)，低于 `PROJECT_AGENTS_RANK`(200)、`USER_DSH_RANK`(400)、`BUNDLED_SKILL_RANK`(600)。即"项目内技能压过用户级"，符合直觉。

### 3.2 为什么清单必须在 Host 侧

原实现把组合存在浏览器 localStorage。这有三个后果，每一个都致命：

1. Desktop 与 Web profile 不同步；
2. 清除站点数据即丢失；
3. **Host 侧消费者读不到**——而技能提供者必须运行在 Host 侧。

第 3 条是决定性的：只要清单在 localStorage，跨文件夹技能聚合就**在架构上不可能实现**。所以迁到 `$DSH_HOME/projects/manifest.json` 是前置条件，不是优化。

### 3.3 为什么预检是纯函数

`buildContextPlan()` 接收已经采集好的数据（各根的技能清单、文件状态、指令大小），不自己做 IO。好处：

- 可完整单元测试，不需要真实文件系统；
- 结果可 JSON 序列化，直接经 RPC 传给 UI；
- 可被 CLI、日志、其他插件复用。

IO 由 Host 侧的 `gatherSkills` / `gatherInstructions` 负责。

### 3.4 为什么"失联成员"要保留

原实现的 `if (memberWorkspaceIds.length < 2) continue;` 会在成员被删除时**静默丢弃整个组合**。用户看到的是项目栏少了一项，无从知道数据还在。

Loom 的规则：**结构性问题报告到 `dropped`，运行时可解析性问题标记 `missing` 但保留**。区分标准是"用户的数据是否还在"——成员失联时数据还在，就不该删。

### 3.5 为什么冲突要暴露而不是静默取胜

同名技能必然只有一个生效。原设计没有这个概念，因为跨文件夹根本不可见。一旦跨文件夹可见，冲突就成了常态。

静默取胜的代价是：用户改了 B 文件夹的技能却不生效，而系统一声不吭。Loom 的契约是**每次冲突都报告生效者与全部被遮蔽者**，在上下文预检中作为常规内容呈现。

## 4. 数据模型

见 `src/core/manifest.cjs` 顶部注释。要点：

- `members: Array<{ workspaceId, role, note? }>` —— 对象而非裸 id，因为要记录**为什么**这个文件夹在项目里；
- `role: 'writable' | 'readonly'` —— 描述贡献性质，不是排名；
- `defaultWorkspaceId` —— 仅是新会话的默认起点，在发现逻辑中**没有任何特权**；
- 零成员项目合法；单成员项目合法；跨项目重复成员合法。

## 5. 测试策略

| 层 | 覆盖 |
|---|---|
| 单元 | 多归属、单成员、零成员、失联保留、v1 迁移、版本守卫 |
| 单元 | 技能根展开、冲突裁决（角色优先 → 声明顺序） |
| 单元 | 预检：来源、冲突、静默文件夹、写入边界、可序列化 |
| 单元 | frontmatter：CRLF、引号、块标量、拒绝条件与 DSH 一致 |
| 单元 | 持久化：原子写、损坏不覆盖、未来版本不解释 |
| **e2e** | **真实文件系统上验证：cwd 在 A，B 的技能可见且正文可读** |

最后一项是核心能力的证明，也是 Loom 与"仅 UI 分组"的分界线。

## 6. 未决问题

1. `rank = 150` 是否需要与 DSH 维护者确认为约定值。
2. 指令聚合（`systemPrompt.context`）尚未实现——`CONTEXT_ORDERS` 只预留了 `SANDBOX_POLICY`/`APPROVAL_POLICY`/`SUBAGENT_DELEGATION` 三个具名位置，项目指令需要裸数值或上游新增具名位。当前 Loom 只做**预检展示**，不注入 prompt。
3. 是否需要 per-project 独立清单文件以利于版本控制。
4. 跨文件夹写入是否值得提上游 RFC。

## 7. 源码核查位置

下表所有行号来自 DSH 检出 **`0a15e36e7f`**（`release-dsh-0.1.6-alpha.1`，2026-09-15），并已在该版本上逐条复核。

**上游一旦改动，行号就会漂移**——引用时请**按符号名搜索**，不要按行号定位。这些结论本身依据的是契约而非行号：例如"技能根 = 向上找 `.git`"依据的是 `skill-filesystem` 的行为，而不是它位于第 945 行。

| 结论 | 位置 |
|---|---|
| 技能根 = 向上找 `.git` | `packages/skill/skill-filesystem/src/index.ts:945-955` |
| 技能根两级 + rank | 同上 `36-40, 245-265` |
| `SkillLookupOptions.cwd` 单值 | `packages/skill/skill/src/index.ts:102-108` |
| 缓存键含 cwd | 同上 `643-645` |
| `registerProvider` | 同上 `390` |
| `SkillCandidate` 契约 | 同上 `77-84` |
| 沙箱策略单根 | `packages/sandbox/sandbox/src/index.ts:39-52` |
| `writableRoots` **本就返回数组** | `packages/sandbox/sandbox/src/roots.ts:52-55` |
| `canonicalPath` 用 realpath | 同上 `30-41` |
| 围栏已是多根循环 | `packages/fs/fs-sandbox/src/index.ts:134` |
| Seatbelt profile 已多根 | `packages/sandbox/sandbox-local/src/profiles.ts:53-56` |
| **dev+ino 祖先链包含判定** | `packages/fs/fs-sandbox/src/containment.ts:58-75` |
| 软链接逃逸被拒（两条测试） | `packages/fs/fs-sandbox/tests/fs-sandbox.spec.ts:124,132` |
| 软链接指回内部也拒绝 | `packages/api/workspace-files/tests/read.spec.ts:161` |
| `lstat` 的信任边界用途 | `docs/subsystems/filesystem.md:74` |
| **软链接 workspace 身份收敛** | `packages/workspace/workspace/src/paths.ts:39-52` |
| 收敛意图的测试 | `packages/workspace/workspace/tests/workspace.spec.ts:382` |
| Windows 单根 SID 设计前提 | `packages/sandbox/sandbox-windows-acl/src/workspace-sid.ts:1-25` |
| 单 cwd 的设计记录 | `.agents/notes/archived/architecture/2026-07-02-fs-per-session-cwd.md` |
| **读不经沙箱** | `packages/fs/fs-sandbox/src/index.ts:6-8` |
| 写检查 | 同上 `122-144` |
| `AGENTS.md` 逐级链 | `packages/context/agent-instructions/src/files.ts:181-217` |
| `CONTEXT_ORDERS` 仅三个具名位 | `packages/core/system-prompt/src/index.ts:165-172` |
| 槽注册签名 | `packages/client/ui-slots/src/index.ts:826` |

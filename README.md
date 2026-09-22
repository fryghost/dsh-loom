# dsh-loom

<p>
  <a href="https://github.com/fryghost/dsh-loom/actions/workflows/ci.yml"><img src="https://github.com/fryghost/dsh-loom/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

**把多个文件夹织成一个 DSH 项目上下文——并且在开始会话前，让你看清它到底会加载什么。**

DSH 是一个 *harness*（缰绳/机架），而织机的 harness 正是控制经线的那部分。Loom 做的事就是织：把多个文件夹的经线织进同一个会话上下文。

---

## 它解决什么

DSH 原生一个会话只认一个工作目录（`SessionHeader.cwd`），技能发现、`AGENTS.md`、沙箱写入边界全部挂在它上面。于是"一个项目横跨多个文件夹"这件事，靠 UI 分组是做不出来的。

已有的 `dsh-projects` 尝试过，但有三处结构性问题：

1. **技能只从单个项目根发现** —— 副文件夹的技能永远进不来；
2. **一个文件夹不能属于多个项目**，而且冲突时会**静默丢弃整个组合**；
3. **主/副文件夹之分**把新会话的 cwd 钉死在主文件夹上。

Loom 不是它的复刻，而是换了一条实现路线：**不去改 cwd，而是增加一个技能提供者 + 一份可预览的上下文预检。**

## 三个亮点

### 亮点一：上下文预检（Context Preflight）

这是 Loom 存在的理由。多文件夹项目最难的不是"合并"，而是**你看不见合并的结果**。所以 Loom 在会话开始前就把答案摆出来：

```
项目：厦门TOD璞瑞装修（3 个文件夹）
活动文件夹：ws-a

技能（4）
  · tod-dimension-chain ← ws-a
  · tod-read-image      ← ws-a
  · pdf-xref-recover    ← ws-b

名称冲突（1）
  ! render-plan
      生效：ws-a
      被遮蔽：ws-b

指令文件（2，共 8421 字节）
  · ws-a — D:/project/装修/AGENTS.md（6100 字节）
  · ws-b — D:/project/资料/AGENTS.md（2321 字节）

写入范围：仅活动文件夹可写；其他成员可读，但写入会被沙箱拒绝（DSH 的写入边界由单个 workspaceRoot 推导）。

未贡献的文件夹（1）
  · ws-c：该文件夹没有提供任何技能（未找到 .dsh/skills 或 .agents/skills，或目录为空）。
```

关键在于**每个"没生效"都有一条命名的理由**。上面那个 `ws-c` 如果什么都不说，用户只会觉得"我的技能怎么没加载"——这正是主/副文件夹设计最难排查的地方。

### 亮点二：一个文件夹可以同时属于多个项目

数据模型是真正的多对多，没有任何 `claimed` 独占集合：

```jsonc
{
  "schemaVersion": 2,
  "projects": [
    { "id": "p1", "title": "装修",   "members": [{ "workspaceId": "ws-shared", "role": "writable" }] },
    { "id": "p2", "title": "资料库", "members": [{ "workspaceId": "ws-shared", "role": "readonly" }] }
  ]
}
```

同一个文件夹既是「装修」的可写成员，又是「资料库」的只读成员。`role` 描述的是**它贡献什么**，而不是它排第几。

### 亮点三：冲突可见，而不是静默取胜

同名技能在多个文件夹出现时，Loom **一定会报告**：谁是生效的、谁被遮蔽了。这不是日志，是 UI 上的常规内容。

## 与 dsh-projects 的关键差异

| | dsh-projects v0.3 | dsh-loom |
|---|---|---|
| 文件夹归属 | 独占，冲突时静默丢弃整组 | 多对多，永不丢弃 |
| 单成员项目 | 非法（`length < 2` 被丢弃） | 合法 |
| 成员失联 | 静默消失 | 保留并标记 `unresolved` |
| 主/副之分 | 有，且决定 cwd | 无；只有"默认起点"偏好 |
| 副文件夹技能 | 不可见 | **可见**（注册技能提供者） |
| 组合存储 | 浏览器 localStorage | `$DSH_HOME/projects/manifest.json` |
| Desktop/Web | 不同步 | 共享同一份 |
| 会话前可见性 | 无 | **上下文预检** |
| 写入边界 | 未说明 | 显式声明 |

## 安装

DSH 的插件按 **profile** 安装。Desktop 和 Web 是两个独立 profile，需要分别安装：

| 你在用 | `--profile` |
|---|---|
| 浏览器里的 DSH Web UI | `web` |
| DSH Desktop 应用 | `desktop` |

### 从 GitHub 安装（推荐）

```bash
dsh plugin --profile web add github:fryghost/dsh-loom
```

不需要先克隆，也不需要构建：客户端半边 `dist/client.js` 已随仓库提交。

### 从本地检出安装（开发用）

先克隆，再用**绝对路径**：

```bash
git clone https://github.com/fryghost/dsh-loom.git
cd dsh-loom
dsh plugin --profile web add link:/absolute/path/to/dsh-loom
```

Windows 上绝对路径要写成 Windows 形式（正斜杠或双反斜杠）：

```powershell
dsh plugin --profile web add link:C:/path/to/dsh-loom
```

### 重启

安装后**完整退出并重启**对应 profile，新插件才会挂载。

### 怎么确认装上了

`dsh plugin` 会把插件写进 profile 的 `package.json` 两处：`dependencies` 里出现依赖，同时因为 Loom 声明了 `dsh.bundle.patch`，它会自动加入 `dsh.profile.bundles` 成为一层。

```bash
# Windows
notepad %USERPROFILE%\.dsh\profiles\web\package.json
# macOS / Linux
cat ~/.dsh/profiles/web/package.json
```

`dsh.profile.bundles` 里应出现 `"dsh-loom"`。如果只出现在 `dependencies` 而没进 `bundles`，说明包的 `dsh.bundle` 没被识别——插件不会挂载。

### 卸载

```bash
dsh plugin --profile web remove dsh-loom
```

会同时从 `dependencies` 和 `dsh.profile.bundles` 移除。项目清单 `$DSH_HOME/projects/manifest.json` **不会被删除**（它属于你的数据）。

## 数据与安全

- 项目清单：`$DSH_HOME/projects/manifest.json`，**原子写**（临时文件 + rename）。
- 损坏的清单**不会被覆盖**：读取失败时保留原文件并报告，等用户处理。
- 更新版本的清单**拒绝解释**，保证降级安全。
- 卸载不删除任何文件夹、会话或清单文件。
- RPC 通道仅接受 loopback 调用者。

## 已知边界：跨文件夹写入

DSH 的 `SandboxExecutionPolicy.workspaceRoot` 是**单个字符串**，`writableRoots()` 只产出 `[workspaceRoot, /tmp, tmpdir()]`。因此：

| 沙箱模式 | 读取 | 写入 |
|---|---|---|
| `danger-full-access` | 全部成员 | 全部成员 |
| `workspace-write` | 全部成员 | **仅活动文件夹** |
| `read-only` | 全部成员 | 无 |

**读操作不受沙箱限制**（`fs-sandbox` 只为 `writeText`/`editText` 设围栏），所以技能与指令的跨文件夹聚合在任何模式下都成立；只有写入受限。

### 为什么不用软链接/junction 绕过

一个自然的想法是：建一个聚合目录，用软链接指向各成员。**实测结论：软链接只能覆盖一部分，而且是最难维护的那部分。**

DSH 里挂在 `cwd` 上的不是一个子系统，而是**七个**，它们对软链接的反应各不相同：

| 子系统 | 软链接能否聚合 |
|---|---|
| 技能发现 | ⚠️ 仅"逐技能链接"可行 |
| `AGENTS.md` | ⚠️ 仅"整文件链接"可行（会**替换**，不能合并） |
| `@` 文件引用索引 | ❌ **显式拒绝软链接** |
| `grep` / `glob` | ❌ ripgrep 默认不跟随（argv 无 `--follow`） |
| 沙箱写入边界 | ❌ dev+ino 判定失败 |
| bash / pwsh workdir | ❌ 继承单 cwd |
| LSP workspaceRoot | ❌ 单根 |

关键实测（`test/dsh-baseline.test.js` 固化为 9 条测试）：

| 布局 | 结果 |
|---|---|
| `A/b` → 链接到文件夹 `B` | ❌ **完全不聚合**——只读 `.dsh/skills`、`.agents/skills` 两个固定路径 |
| `A/.dsh/skills` 本身链接到 `B/.dsh/skills` | ❌ **替换而非聚合**——软链接只有一个目标，A 的技能消失 |
| 在 `A/.dsh/skills/` 内**逐个技能**建链接 | ✅ 能聚合，但每条都要手工维护 |
| `A/AGENTS.md` → 链接到 `B/AGENTS.md` | ⚠️ 能加载，但**只能替换**，无法合并两份指令 |
| 通过链接**写入** | ❌ `workspace-write` 下被拒（读可以） |

**最容易踩的坑**：能 `cat` 一个文件 ≠ DSH 能搜到它。`@` 引用索引和 `grep`/`glob` 都不会跟随软链接——前者在 `search.ts:275` 用 `lstat` **主动拒绝**，后者的 ripgrep argv 里没有 `--follow`。实测用真实 ripgrep 15.2.0 确认：加 `--follow` 前后，匹配数从 1 变成 2。

**更深一层**：DSH 不是忽略了软链接，而是**有意让软链接收敛身份、阻止逃逸**——`containment.ts:58-75` 沿祖先链比较 **device + inode**，cwd 为聚合根时成员的 realpath 上溯永远遇不到聚合根的 inode，写入必然被拒。即"**DSH 考虑了软链接，所以明确不支持用软链接做多根**"。详见 [设计说明](docs/design.md#30-前置事实不装插件时软链接能聚合到哪一步)。

### 上游修正的话，代价比想象中小

`writableRoots()` **本来就返回数组**，消费方（fs 围栏、Seatbelt profile）**已经是多根循环**。所以 POSIX 侧只需给 policy 加一个 `additionalRoots` 并合并即可。

真正的阻力集中在 **Windows ACL**：`workspace-sid.ts` 的设计前提就是"每个 workspace 一个写 SID、一次 ACE 传播"。多根意味着 N 个 SID、N 份传播与回收。bwrap / Landlock 也各有 grant 拼写需对齐。

Loom 不擅自绕过安全边界，但这条上游路径的收益/成本比明显好于初判，值得单独提 RFC。详见 [设计说明](docs/design.md#22-暂不做但比原先估计的小得多扩展沙箱为多根)。

## 架构

```
Host (src/index.js)
├── manifest-store.js    $DSH_HOME 原子读写 + schema 版本守卫
├── skill-provider.js    ctx.skills.registerProvider —— 让兄弟文件夹贡献技能
└── RPC /dsh-loom        getManifest / putManifest / preflight（loopback）

Client (src/client.cjs)
├── LoomPanel            项目列表
├── ProjectEditor        文件夹多归属编辑（无独占、无主副）
└── PreflightPanel       上下文预检（技能来源 / 冲突 / 指令 / 写入边界）
```

核心逻辑全部是纯函数，放在 `src/core/`，可脱离 DSH 独立测试。

## 开发

```bash
npm install
npm run verify   # check + build + test
```

### 改了 `src/client.cjs` 要记得重建

`dist/client.js` 是**随仓库提交**的构建产物（这样 `dsh plugin add` 免构建即可用）。改了 `src/client.cjs` 之后必须重新构建并一起提交：

```bash
npm run build
git add dist/client.js
```

有 CI 任务专门守这条线（`bundle-freshness`）：它重新构建后比对 `git diff --exit-code dist/client.js`，产物过期会直接失败。

## 测试

```bash
npm test
```

其中 `test/dsh-baseline.test.js` 固化的是 **DSH 自身**的行为（软链接能不能聚合、`@` 引用是否拒绝软链接等），不是 Loom 的行为。它需要一份 DSH 源码检出，通过 `DSH_CHECKOUT` 环境变量指定；找不到时这些用例**跳过而非失败**：

```bash
DSH_CHECKOUT=/path/to/deepseek-harness npm test
```

## 文档

- [设计说明](docs/design.md) —— 为什么这样设计、源码依据、被否决的方案
- [迁移指南](docs/migration.md) —— 从 dsh-projects 迁移

## 许可证

MIT

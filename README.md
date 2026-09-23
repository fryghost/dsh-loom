# dsh-loom

[English](docs/README.en.md) | 中文

<p>
  <a href="https://github.com/fryghost/dsh-loom/actions/workflows/ci.yml"><img src="https://github.com/fryghost/dsh-loom/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

**把多个文件夹织成一个 DSH 项目上下文——并且在开始会话前，让你看清它到底会加载什么。**

<img src="docs/assets/sidebar.png" alt="Loom 侧边栏：项目 / 工作区 / 聊天 三段，每段各自列出会话" width="300">

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
项目：example-project（3 个文件夹）
活动文件夹：ws-a

技能（3）
  · alpha-skill  ← ws-a
  · beta-skill   ← ws-a
  · gamma-skill  ← ws-b

名称冲突（1）
  ! shared-skill
      生效：ws-a
      被遮蔽：ws-b

指令文件（2，共 8421 字节）
  · ws-a — /repo/app/AGENTS.md（6100 字节）
  · ws-b — /repo/docs/AGENTS.md（2321 字节）

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
    { "id": "p1", "title": "app",  "members": [{ "workspaceId": "ws-shared", "role": "writable" }] },
    { "id": "p2", "title": "docs", "members": [{ "workspaceId": "ws-shared", "role": "readonly" }] }
  ]
}
```

同一个文件夹既是「app」的可写成员，又是「docs」的只读成员。`role` 描述的是**它贡献什么**，而不是它排第几。

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

## 怎么用

侧边栏的浏览区被 Loom 接管，分成三段。**一个会话只出现在一段里**，不重复、不漏：

```
▾ 项目  2                                  +
  ▾ example-project                ⋯
        重构解析器                12 小时
  ▾ other-project
        补充缓存层                11 分钟
▾ 工作区  3                                +
  ▾ ws-a                           ⋯
        调整构建脚本              2 小时
▾ 聊天  1
      [来自其他工具的会话…          15 天
```

> 上面这段是**结构示意**，用的都是占位名。真实观感看截图——**截图里的项目名、工作区名和会话标题是作者自己的数据**，本文其余部分一律用 `ws-a` / `example-project` 这类占位符。

| 段 | 收哪些会话 |
|---|---|
| **项目** | 项目成员文件夹下的会话（多成员命中同一会话时去重） |
| **工作区** | 没有被任何项目认领的工作区的会话 |
| **聊天** | cwd 匹配不到任何**已登记**工作区的会话 |

### 为什么「聊天」不是空段

一个会话总有 cwd，但**"属于某个工作区"是实时事实，不是存储保证**。DSH 里成员资格的定义是：

> 记录的 `sessionIds` 顺序是所有权真源；`sessionIds` 在**读取时过滤** —— `sessionIds.filter(id => sessionPath(id) === record.path)`

（`packages/workspace/workspace/src/entity.ts:101-102`，该包 README 称其为"成员资格是所有权加实时 cwd 事实"。）

所以归属成立的前提是**存在一个已登记工作区，其 path 恰好等于该会话的 cwd**。一旦这个前提不成立，会话就没有任何工作区认领它：

- **工作区被删了登记**——DSH 的 `delete` 明确只移除登记，**不删会话记录**，这些会话就此无所归属；
- **cwd 不再匹配任何已登记路径**——例如文件夹被移动或改名。

这两种会话既进不了「项目」（项目成员都是工作区），也进不了「工作区」，于是落在「聊天」。**它是"没有归属"的落点，不是"临时会话"的落点。**

归档的会话在三段里都不出现；**子代理会话不是这里的会话**——它们挂在父会话的 header 目录下，不属于这个列表。

**同一个会话可能在多个项目下各出现一次，这是有意的。** 如果一个文件夹同时属于两个项目，它的会话在两个项目下都会列出——因为那个文件夹确实同时属于两边。去重只发生在**同一个项目内的多个成员之间**（两个成员命中同一会话时只列一次）。

举例：会话 `重构解析器` 的工作区如果同时是 `example-project` 和 `other-project` 的成员，它在两个项目下都会出现。所谓"归属唯一"指的是**三段之间不重复**，不是"每个会话全局只出现一次"——后者在这个数据模型里做不到，也不该做。

### 常用动作

| 想做什么 | 怎么做 |
|---|---|
| 新建项目 | 「项目」段右侧的 `+` |
| 改项目成员 / 起始文件夹 | 项目行的 `⋯` → 编辑。**一个文件夹可以同时属于多个项目** |
| 展开某个项目的全部会话 | 点组名，或「展开其余 N 个会话」（默认显示 4 条） |
| 在某个文件夹里开新对话 | 组行的 `+` |
| **看这个项目到底会加载什么** | 项目行的 `⋯` → **上下文预检** |
| 重命名 / 分支 / 归档会话 | 会话行的 `⋯` |
| 新建 / 重命名 / 删除工作区 | 「工作区」段右侧的 `+`；工作区行的 `⋯` |
| 收起整段 | 点段标题 |
| 搜索 | 顶部搜索框，同时匹配会话标题和组名 |

删除工作区**只移除登记**，不删文件夹、不删会话记录。删除项目只移除分组，同理。

### 起始文件夹是什么

项目可以指定一个「默认起点」——新对话会话从这里开始。它是**偏好，不是等级**：它不会让那个文件夹在技能发现时获得优先权。多文件夹的聚合对每个成员一视同仁，冲突由角色和声明顺序决定（见[设计说明](docs/design.md)）。

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

### 已知缺陷：预检文字只有中文

客户端的界面文案是双语的（`src/client.cjs` 里的 `dictionaries` 有 `zh`/`en` 两套）。**但上下文预检里的文字是硬编码中文**，英文界面下会看到中文句子被英文标签包着。

来源在宿主侧：`src/core/context-plan.cjs` 直接产出了**成品句子**而不是结构化数据——写入边界说明（`describeWriteBoundary`，第 62/70/77/84 行）、静默成员的理由（第 127/170/196 行），以及整份文本报告（`formatContextPlan`）。

这是设计问题而不是漏翻：**一个纯函数不该产出某一语言的散文。** 正确的修法是让它返回描述符（模式、可写成员、理由键），由客户端用自己的字典渲染。目前**未修**——它需要同时改动核心逻辑、客户端渲染与相应测试，不做未经验证的半成品。

## 架构

```
Host (src/index.js)                     纯 Node，不依赖浏览器
├── host/manifest-store.js   $DSH_HOME 原子读写 + schema 版本守卫
├── host/skill-provider.js   ctx.skills.registerProvider —— 让兄弟文件夹贡献技能
└── RPC /dsh-loom            getManifest / putManifest / preflight / report（loopback）

Client (src/client.cjs)                 只贡献一个槽位
├── LoomSidebarHost          侧边栏浏览器：项目 / 工作区 / 聊天
├── LoomSidebar              三段树 + 搜索
├── SessionRow / LoomGroup   会话行（重命名/分支/归档）与组行
├── ProjectEditor            文件夹多归属编辑（无独占、无主副）
├── PreflightModal           上下文预检
└── RowMenu                  统一的行内省略号菜单

src/core/*.cjs                          纯函数，脱离 DSH 与浏览器即可测试
├── manifest.cjs             schema 校验与迁移
├── skill-roots.cjs          成员 → 技能根 / 指令候选
├── frontmatter.cjs          SKILL.md 元信息解析（含 CRLF）
├── context-plan.cjs         预检计划：来源、冲突、静默文件夹、写入边界
└── sections.cjs             三段归属（唯一归属）与可见性规则
```

## 界面接入方式

Loom **只注册一个槽位**：`sidebar.workspaces`，`priority: -100`。这个座位就是侧边栏的浏览区，抢它等于替换系统自带的工作区浏览器——**这次是应该的**，因为三段里**包含了**原生工作区分组。

它**不注册** `sidebar.panellist`，也**不注册** `main`：

- 项目列表已被侧边栏的「项目」段完全覆盖，单独开面板只是重复；
- 而 `sidebar.panellist` 的代价是**在全局导航里永久占一行**——对所有会话生效，包括跟项目毫无关系的那些。

唯一"面板能做而侧边栏不能做"的是上下文预检，而那是**针对某个项目的一个动作**，所以它从该项目自己的行菜单打开。

这两条都有测试固化（`test/client-contract.test.cjs`）：一旦有人再加回 `sidebar.panellist`／`main`，或把三段改成不包含原生分组，测试会失败。

### 三段树的设计

层级靠**静态信号**区分，不靠悬停变化：

| 层级 | 字号 | 颜色 | 前导字形 |
|---|---|---|---|
| 区标题（带分割线） | 12px / 600 + 字距 | `label-tertiary` | 三角 |
| 组行 | 14px / 500 | `label-primary` | 三角（16px 槽） |
| 会话行 | 14px / 400 | `label-secondary` | 运行状态点 |

**只有三档字号：12 / 14 / 16**（16 由 `Modal` 原子自带），取自 DSH 原生侧边栏的刻度。

**故意不做悬停字形互换**（图标 ↔ 三角）：指针一进一出字形就在跳，恰好在你要瞄准它的时候，"这是什么"和"收没收起"同时变得不确定。**静止的字形比一个能表达两件事的字形更有价值。** 这一条也写进了 `test/client-contract.test.cjs`。

### 界面直接建在 DSH 的设计系统上

客户端不自己写按钮、标签、状态点、弹窗，而是 require 平台模块 `@deepseek-ai/dsh-client-ui-primitives`——**和系统自带 UI 用的是同一批原子组件**：

| 用途 | 原子 |
|---|---|
| 所有按钮 | `Button`（胶囊 r18，h36／紧凑 h28） |
| 计数／角色／失联标记 | `Tag`（11px 只读胶囊，按语义取 tone） |
| 成员状态 | `StateDot`（done／warning／ongoing／error／idle） |
| 弹窗（编辑／预检／重命名） | `Modal`（r24 + 遮罩模糊，自带 Esc 关闭） |
| 文本输入 | `Input` |
| 行内菜单 | `Menu`（锚定 + 传送门） |

这一条是有代价换来的：最初手写了矩形 8px 圆角、13px 字的按钮和徽章，而 DSH 的语言是 **14px/22px 正文 + 胶囊按钮 r18/h36 + 0.5px 发丝边框 + r24 弹窗**，所以那版看起来像个外来控件。

因为它在 `PLATFORM_MODULES` 里，构建时保持 external 即可共享宿主的同一实例与已加载样式，不会打进第二份。`test/client-contract.test.cjs` 同时锁住这一点：**一旦有人退回手写控件，测试会失败**。

### 一个作用域内的 `box-sizing` reset

`.loom-sidebar` 及其所有后代强制 `box-sizing: border-box`。

这不是洁癖：`width: 100%` 在 `content-box` 下算的是内容盒，任何同时有内边距的元素都会**宽出容器**。这个疏漏先后造成了三处可见故障——搜索框溢出、项目名输入框压住下方列表、每个会话行宽 12px 把时间戳推出右边缘并让整列出现横向滚动条。**逐元素打补丁是它反复回来的原因**，所以改成作用域内一次 reset。

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

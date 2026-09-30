# 变更记录

本项目的版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
清单格式（`$DSH_HOME/projects/manifest.json` 的 `schemaVersion`）与包版本号是**两条独立的轴**：后者可以升，前者只在清单结构真的变化时才升。

## [0.2.5] - 2026-09-30

修掉一个**只有真实鼠标才会遇到**的缺陷：行菜单会从指针下逃走，于是「删除」「删除工作区」以及会话的改名／分叉／归档全都点不到。用户看到的现象是「删除没反应」。

### 修复

- **行菜单打开后锚点会塌陷，菜单瞬移到视口左上角并随即关闭。** 省略号住在 `.loom-actions` 里，而它平时是 `display: none`，只在行被悬停时才显示；行菜单是 portal 的，宿主 `Menu` **每动画帧重测锚点**并按该矩形定位。于是指针一旦从省略号移向下方菜单，`:hover` 就不再匹配、`.loom-actions` 塌成 `0×0`，`Menu` 把列表夹到视口边距——菜单跳到左上角 `(12,12)`，指针离开的 200ms 宽限期再把它关掉。**指针永远追不上它。**
- **修法与宿主自己的行一致**：菜单打开期间给行挂 `loom-menu-open`，用状态类把 `.loom-actions` 钉住（宿主是 `Rows.module.css` 的 `.projectRow.menuOpen .rowActions`，由 `Rows.tsx` 的 `menuOpen` state 喂）。同时钉住整行的悬停外观——被认领徽标一旦重新出现会改变行宽、把锚点连同菜单一起挤偏，时间戳也会把按钮从指针下推开。
- **一次修好三种行**：项目行、工作区行、会话行共用同一个 `RowMenu`，所以改名／分叉／归档也一并恢复可达。
- 开合状态经 `effect` 上报给行，而不是只挂在 `onClose` 上：`open` 变 false 的路径有外部按下、Esc、窗口失焦、指针离开宽限期四条，effect 一次覆盖全部，将来加第五条也不会漏。

### 测试

- **这个 bug 是测试方法论自己放过去的，原因必须记下来**：静态渲染从不悬停；而程序化点击（`element.click()`，或 Playwright 的 `force: true`）**跳过可点击性检查**——没有指针真的移动过，塌陷就永远不发生。修复前 204 项测试对此**全绿**，包括端到端点击删除成功的那几条。真实鼠标轨迹才是唯一能看见它的回环，这次也是先有轨迹（菜单位置从 `[226,343]` 跳到 `[12,12]`、锚点 `[0,0,0,0]`）才定位到根因。
- 新增 `test/menu-anchor.test.cjs`（7 条），锁住修复的两半，各自单独都能失败：①样式表必须存在**不依赖 `:hover`/`:focus-within`** 的钉住规则，且**两种行都覆盖**；②接线必须在菜单打开时真的挂上类、并在关闭时摘掉（含会话行、含「只有打开的那一行被钉住」）。
- 新增 `scripts/mutation-menu-anchor.cjs`：把修复逐块撤回（删规则／拆项目行接线／拆会话行接线），确认三处变异**全部让套件变红**——避免写出「在坏代码上也通过」的回归测试。
- 它刻意**不放在 `test/` 下**：它会在运行期间改写 `src/` 并重建 `dist/`，而 `node --test` 并行执行 `test/` 里的每个文件，放在那儿会污染同批测试（首轮确实报了 3 条与它无关的失败）。

## [0.2.4] - 2026-09-30

修掉 0.2.3 自己带进来的回归：路由挂上了，但每一次调用都被自己的校验拒掉。

### 修复

- **`method "dsh-loom/getManifest" does not match endpoint "getManifest"`**：信封里的 `method` 是**完整端点名**，不是路由自己拥有的那个裸名。这是 carrier 自己的规则——它的客户端把拿到的那串原样写进 `method`（`packages/client/connection/src/client/rpc.ts`：`method: endpoint`），它的服务端拿 `endpointFromPath(channel, pathname)` 比对，而路径是 `/api/dsh-loom/getManifest`，所以那个值是带命名空间的。0.2.3 用裸名比对，于是每一次合法调用都被判成 `gateway/bad-request`。

  现场症状看着像"数据没读到"而不像"调用被拒"：三段侧边栏都在，`include:loom` 已经是 `active`，「项目」段却显示**还没有项目**——而磁盘上 `$DSH_HOME/projects/manifest.json` 里明明有三个项目。原因文本会显示在段上方。

### 测试

- **这个 bug 是测试自己放过去的，原因必须记下来**：回归测试**手写信封**，而手写时写的正是裸名——它与错误的服务端实现互相印证。测试和实现共享同一个错误假设时，两边都绿，只有真实 GUI 是红的。

  现在 `test/dsh-02-transport.test.js` 不再手写信封，而是驱动 **carrier 自己的浏览器传输**：加载真实的 `lib/client.js`（它是 `__ModuleLoader__` 注册形式、没有 ESM 导出，因此用桩 loader 接住注册再直接调用其工厂），用它的 `installConnection` 装出页面上的 `ctx.connection.rpc`，再由它构造信封、解析响应。手写假设能藏身的位置没有了。

- `test/host-wiring.test.js` 新增一条反向用例：信封里写**裸名**必须被拒、写完整端点名必须成功——两个方向都钉住。把 0.2.3 的比对方式放回去，3 条用例变红（含上面那条真实传输的端到端用例）。

## [0.2.3] - 2026-09-30

修掉 0.2.2 留下的**半个修复**：通道仍然是私有通道，而 DSH 0.2 里插件根本挂不上私有通道。0.2.2 去掉第三个实参只是把失败从「静默不挂载」推进到「加载时抛错」。

### 修复

- **`cannot get property "webServer" without inject`（插件加载即失败）**：0.2 的 `HostConnectionRpc.handle` 转给 `register(owner, …)`，而 `owner` 是**构造 Connection 服务的那个 context**——也就是 Connection 插件自己的 fiber，对 Loom 来说是兄弟节点。`register` 随后的第一步就是 `owner.webServer.register(route)`（`packages/client/connection/src/rpc-host.ts:191-192`），Cordis 沿**那条** fiber 向上解析属性，因此永远到不了提供 `webServer` 的那个插件，查找落空并抛出该错误——发生在**加载阶段**，一个请求都还没服务。这不是插件侧能绕开的查找作用域问题（`inject: ['webServer']` 也没用：解析起点是 Connection 的 fiber，不是调用方的）。

- **改为在 carrier 的共享 `/api` 通道上注册精确 Fetch 路由**（每个端点一条）：

  ```
  POST /api/dsh-loom/getManifest
  POST /api/dsh-loom/putManifest
  POST /api/dsh-loom/preflight
  POST /api/dsh-loom/report
  ```

  三个理由，按重要性排序：① `/api` 由 carrier 统一做 Host/Origin 围栏 + 浏览器会话鉴权，且**在派发之前**完成，Loom 因此继承与其余 `/api` 端点相同的接纳，而不必自己声明 authority；② 路由是 carrier 中立的——HTTP bridge、worker host 与 desktop 直连通道都经 `createSharedFetchHandler` 派发；③ 不需要 `webServer` 注入，宿主半边在根本没有 HTTP 服务的组合里也照样加载。客户端相应改为 `connection.rpc.call('/api', 'dsh-loom/<endpoint>', …)`。

- **两半共用一个路由来源**：新增 `src/core/bridge.cjs`（通道 `/api`、命名空间 `dsh-loom`、端点表、`bridgePath` / `bridgeEndpoint`），宿主与客户端都从它导入。两边对路由的理解一旦分叉，就是每次调用 404 + 项目段空白——这正是本次故障的表现形式。

- **缺 transport 时响亮失败**：若组合里没有 Connection 的 Fetch 注册表，`apply()` 抛出带明确原因的异常，而不是留一个半挂载的插件。缺 `skills` / `workspaceRegistry` 仍然降级——那是可选能力，transport 不是。

### 测试

- **接线 fake 再一次放过了 bug，原因和上次同型**：它把 `rpc.handle` 建模成「能用」，于是它同意的调用恰恰是真实 profile 挂不上的那个。现在这个 fake **没有可用的 `rpc.handle`**：调用会被计数，并抛出真实实现抛出的那个错误；`fetch.register` 则按 `assertFetchRoute` 的规则校验路径、方法与 body 模式。把旧写法放回去，24 条用例里有 12 条变红。

- **`test/dsh-02-transport.test.js`（新增）**：不再只用 fake。它加载**真实的 Cordis 与真实的 `@deepseek-ai/dsh-client-connection` 构建产物**（从已安装 profile 解析，取不到则 skip），按 profile 的拓扑把插件都挂成**兄弟节点**，然后：

  1. 用一个探针插件实测 `rpc.handle`——**在真实 0.2 代码上复现了 `without inject`**（这条同时是绊线：上游若修好该查找，它会变红，提醒重新评估这个绕法）；
  2. 挂上 Loom 真实的 `apply()`，用真实的 `createSharedFetchHandler('/api')` 发真实的 `client-request` 信封，四个端点都回真实的 `server-response`，未注册路径仍是 carrier 的 404。

- **`test/client-bridge.test.cjs`（新增）**：跨两半的契约——客户端调用的端点集合必须等于宿主注册的端点集合；客户端必须经共享 helper 走共享通道，且源码里不得再出现 `/dsh-loom` 字面量；宿主不得再出现 `rpc.handle(`。实测：把客户端改回私有通道，其中一条变红。

### 变更

- **要求 DSH ≥ 0.2**：0.1 的私有通道写法已彻底移除，装 0.1 的 profile 不能再用这个版本（README 两处与 `docs/SECURITY.md` 已同步）。
- 安全说明改写：不再声称「仅接受 loopback 调用者」，改为写清**谁在做鉴权**（carrier 的 `/api` 准入）、它挡住什么、以及为什么私有通道在 0.2 不可用。

## [0.2.2] - 2026-09-30

适配 DSH 0.2 的一处破坏性 API 变更。与 0.2.1 那次相同，**症状和根因隔了两层**：报错是 HTTP 405，真正的原因是 RPC 通道没挂上。

### 修复

- **`HTTP 405` + 项目段空白**：DSH 0.2 的 `refactor(connection): admit every request as the single operator Peer` 删除了 `HostConnectionRpc.handle` 的第三个参数（连同 `ConnectionRpcAuthority`，含 `'loopback'`），改为由 carrier 层统一按 operator 接纳请求。现在签名是：

  ```ts
  handle(channel: string, handler: ConnectionRpcHandler): () => Promise<void>
  ```

  而 `apply()` 仍在传 `{ authority: 'loopback' }`。**JS 会忽略多余实参，所以不抛错**——通道静默没挂上，`POST /dsh-loom/getManifest` 于是落到静态文件路由，其兜底对非 GET/HEAD 一律回 405（`host/frontend-static`：*Non-GET/HEAD without a matching named route is 405*）。访问控制现在由 carrier 负责，不再由这次调用声明。

  **"项目没了"是同一个原因，不是第二个 bug**：客户端的槽位注册**是成功的**（客户端日志里 `{"event":"register","slot":"sidebar.workspaces","ok":true}`），但列表数据要经桥接读取，通道没挂就只剩空段。

- **诊断报告本身失效**：apply 时的诊断读了 `ctx.slots.declarationEpoch`，而 0.2 不再在该对象上暴露它，导致每条日志都变成 `is not a function` 而不是一个事实。现只探 `spec()`，并把不可用的探测**作为值报告**而不是升级为异常。

### 测试

- **宿主接线的 fake 无法抓到本 bug**，这正是它漏出去的原因：它声明 `handle: (channel, handler) => …`，**和真实实现一样忽略第三个实参**。现在它会**点数实参并在多传时抛错**，旧写法会让三个测试变红。

### 核查

逐一比对了插件用到的其余服务接口（对照 0.2 运行时契约，而非假定升级是齐平的），**均未变**：`locale.getLocale/register`、`workspaces.create/rename/delete/archiveSession`、`sessions.binding(...)?.session.rename(...)`，以及 `uiWorkspace.openSession`——后者形参拓宽为 `SessionTarget = SessionId | SubagentAddress`，本插件传的 id 仍然合法。

## [0.2.1] - 2026-09-28

适配 DSH 0.1.7 的破坏性漂移。三个缺陷有一个共同特征：**都不报错**——注册日志显示 `ok: true`，测试全绿，但功能静默失效。因此本版同时补上了能真实失败的回归测试。

### 修复

- **图标族改名导致侧边栏整块被顶回原生**：DSH 的 `4937343a5e feat(web): unify the client visual language` 把图标族从「尺寸后缀」改成「字重后缀」（`IconPlusOutline16` → `IconPlusOutlineRegular`）。解构一个已不存在的导出**不会报错**，只得到 `undefined`，于是首次渲染调用 `React.createElement(undefined)` 抛错 → 槽位条目被 abdicate → 系统自带的工作区浏览器顶回来，看起来像插件没装。现已改用字重后缀名，并新增 `test/icon-contract.test.cjs`：**把源码里的每个名字与宿主真实导出表逐一比对**，而不是对着手写 stub。
- **当前会话永远解析不到，空会话（含"新建会话"占位行）被整批过滤**：`SessionListState` **从来没有** `current` 字段，`sessionState.current` 恒为 `undefined`。现按 DSH 自身规则推导——`retainedBy.mainView > 0`（`ui-workspace/src/client/tree.ts` 的 `mainSessionId`）。取值经 `usePanelInfo` 接入，但**面板守卫只作用于"高亮"，不作用于"可见性"**：宿主在 `tree.ts:340` 用**未加守卫**的 `mainSessionId` 决定 blank 行是否进树，只在 `WorkspaceBrowser.tsx:294-296` 的 `currentId` 上加守卫。因此 `deriveSections` 分别返回 `current`（决定可见性）与 `highlighted`（决定高亮）——把二者合并会在主面板打开时删掉"新建会话"行，而那一行宿主是保留的。
- **编辑项目会破坏清单语义**：`ProjectEditor.save()` 一边把 `role` 硬编码成 `'writable'`（每次编辑把 `readonly` 成员静默改成可写），一边用宿主注册表过滤成员（解析不到的成员**一保存就被剪掉**），直接违背 `src/core/manifest.cjs` 头部承诺的"无法解析的成员一律保留并标记 `missing`，永不剪除"。现改为走核心的 `mergeMembers()`：保留既有成员的 `role` 与 `note`，保留解析不到的成员，只移除用户显式取消勾选的。编辑器成员列表也改为 `project.members ∪ 注册表` 的并集，失联成员因此**可见、可取消**，角色则只读展示。
- **可选 seat 的出现/消失会让宿主组件崩渲染**：`usePanelInfo` 是**可选**座位，而座位本身是一个 hook。若在侧边栏里直接调用它、缺失时换用一个 hook 数量不同的替代品，则座位一旦出现或消失，React 会因 hook 顺序变化而抛错（实测：`useState` → `useRef`，`React has detected a change in the order of Hooks called by LoomSidebarSeated`）。触发路径真实存在——框架的 `rebuildRootBinding()` 在任何 `provideRoot()` 注册或释放时重渲染整棵 slot 树，layout 插件的 HMR 重载正是如此。渲染抛错会 **abdicate 整个槽位条目**，与图标改名是同一失效模式。现把座位放进独立的子组件 `PanelSeatProbe`，座位的 hook 归该子组件所有：座位出现/消失变成该子组件的挂载/卸载，宿主组件的 hook 列表恒定。

### 变更

- **「工作区」段改为列出全部已登记工作区**。此前只列"未被任何项目认领的"工作区，于是文件夹一旦被项目关联就从该段消失——看起来像"不能再绑到其他项目"，而这个数据模型恰恰是多对多的。现在被认领的行**留在原地并标出认领它的项目名**（`已被项目认领 · <项目>`），其会话仍只在项目下出现、此处不重复。
- 「工作区」段为空时的文案据此改为「没有工作区」（原为「没有未归入项目的工作区」）；被认领工作区展开时若无可列会话，提示为「会话列在认领它的项目下，此处不重复」，而不是"还没有会话"——后者对用户的数据是**假话**。

### 测试

- `test/sections.test.cjs`：去掉原先靠手工写 `sessionState.current` 掩盖缺陷的写法（新增用例专门断言**这个字段会被忽略**），并新增可见性/高亮分离、跨段不重复、多项目认领等用例。
- `test/manifest.test.cjs`：新增 `mergeMembers` 的 7 个用例（保留 role / 保留未解析成员 / 显式取消仍生效 / 保留 note / 去重 / 顺序 / 读回后标 `missing`）。
- `test/icon-contract.test.cjs`（新增）：把源码里出现的每个 primitives 名字与**宿主真实导出表**逐一比对；取不到检出则 skip，但"检出在、产物找不到"会显式失败，避免整套检查静默跳过。
- `test/client-render.test.cjs`（新增）：渲染**已提交的 dist**。其中三条用真实 DOM + 点击**实际调用 `ProjectEditor.save()`** 并断言 `onSave` 收到的 `members`——这是 R3 唯一的端到端证明（只测核心 `mergeMembers` 无法发现调用点被改坏）。
- `test/client-mount.test.cjs`（新增）：用真实 React 跨多次渲染驱动**宿主组件**，断言座位出现/消失不改变 hook 顺序、且面板打开只清高亮不删行。这两条都无法用单次静态渲染发现。
- 上述新用例均按"**改回旧代码就会失败**"实测：对修复前的源码运行共失败 35 条；并用变异测试逐条确认关键断言会因对应回归而失败（参数颠倒 / 剪除缺陷回归 / role 硬编码 / 守卫越界 / 替代 hook 改回）。

## [0.2.0] - 2026-09-23

### 新增

- **侧边栏三段式浏览**：`项目 / 工作区 / 聊天`，每段各自列出会话。归属唯一——一个会话只出现在一段里，不重复也不遗漏。归档会话三段都不出现，子代理会话不属于这个列表（它们挂在父会话的 header 目录下）。
- **工作区管理**：段标题的 `+` 走 DSH 自带的目录选择器新建工作区；工作区行支持重命名与删除。删除只移除登记，不动文件夹与会话记录。
- **会话动作**：每行一个省略号菜单，含重命名 / 分支 / 归档。空会话（还没发过消息的）不显示时间与动作——那些动词都会作用于还不存在的内容。
- **搜索**：同时匹配会话标题与组名。
- **段落级折叠**：三段可以各自收起。
- **客户端诊断**：客户端把自身的槽位注册结果写入 `$DSH_HOME/loom-client.log`。

### 变更

- **界面改为直接复用 DSH 的设计系统**（`@deepseek-ai/dsh-client-ui-primitives`）：`Button` / `Tag` / `StateDot` / `Modal` / `Input` / `Menu`，与系统自带 UI 是同一批原子组件。
- **上下文预检从面板改为弹窗**，从项目行的 `⋯` → 「上下文预检」打开。
- **移除了 `sidebar.panellist` 与 `main` 两个槽位注册**：项目列表已被侧边栏覆盖，而全局导航里的一行代价过高。
- 登记字号收敛为**三档：12 / 14 / 16**（16 由 `Modal` 原子自带），取自 DSH 原生侧边栏的刻度。
- 层级区分改为**静态信号**（字号 / 颜色 / 分割带），不再使用悬停字形互换——那会让字形在指针下跳动。

### 修复

- **打开会话不回到会话视图**：`uiWorkspace.openSession` 除了切换会话还会清空主面板选中项；直接调 `ctx.sessions.open` 会把人留在面板上。
- **子代理会话涌入「聊天」段**：可见性规则只处理了归档情况。现已对齐 DSH 自身的判定（`origin !== 'subagent'`、非归档、空会话仅当前那个可见）。
- **`width: 100%` 溢出容器**：`content-box` 下宽度不含内边距。这一处疏漏造成了三处可见故障（搜索框溢出、项目名输入框压住下方列表、会话行把时间戳推出右边缘并产生横向滚动条）。已改为作用域内 `box-sizing: border-box` reset。
- **「聊天」段的会话与会话标题同级**：该段没有"组"这一层，会话被直接铺在区下面；现改用与组相同的子级容器缩进。
- **设计师策略导致的排版失控**：字号曾达八档且无刻度、按钮是自创的矩形 8px 圆角、路径用 `direction: rtl` 截断而渲染成断裂片段。均已按 DSH 实际刻度重做。
- **安装说明**：补上克隆步骤、Windows 绝对路径写法、profile 对照表、验证与卸载方法。

### 已知边界

- **跨文件夹写入受限**：DSH 的 `SandboxExecutionPolicy.workspaceRoot` 是单个字符串，所以 `workspace-write` 模式下只有活动文件夹可写；读取不受限制，因此跨文件夹的技能与指令聚合在任何模式下都成立。详见 [设计说明](design.md)。
- **与 `dsh-projects` 不能同时启用**：两者都注册 `sidebar.workspaces` 且都用 `priority: -100`，DSH 会在相同优先级的第二个注册上直接抛错。详见 [迁移说明](migration.md)。
- **区标题下方的分割线依赖 `--dsw-alias-border-l3`**：该 token 由宿主主题提供，Loom 不自带主题。

## [0.1.0]

首个可用版本。

- 宿主半边：`$DSH_HOME/projects/manifest.json` 的原子读写与 schema 版本守卫；通过 `ctx.skills.registerProvider` 让兄弟文件夹贡献技能；loopback RPC 通道。
- 客户端半边：项目列表、文件夹多归属编辑、上下文预检。
- `src/core/` 下的纯函数逻辑，可脱离 DSH 与浏览器独立测试。
- CI 覆盖 ubuntu / windows / macos × Node 20 / 22 / 24，并校验 `dist/client.js` 是否为最新构建产物。
# 变更记录

本项目的版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
清单格式（`$DSH_HOME/projects/manifest.json` 的 `schemaVersion`）与包版本号是**两条独立的轴**：后者可以升，前者只在清单结构真的变化时才升。

每个已发布的版本都对应一个 git tag（`v0.2.0` … `v0.2.7`）。`0.1.0` 未打 tag——它是最初的提交，早于本文件开始记录。发版步骤见 [CONTRIBUTING.md](CONTRIBUTING.md#发版流程)。

## [0.2.7] - 2026-10-02

修 0.2.6 带进来的两个缺陷，外加一个它暴露出来的老问题。**0.2.6 的迁移功能会在磁盘上生成 DSH 拒绝打开的会话日志**，这是本次最严重的一条。

### 修复

- **迁移出来的会话打不开：「current-generation delivery marker names the wrong Session」。** 迁移会把源会话已完成的回合**逐字复制**（含 105 条 `delivery-accepted` 投递水位，每条都署名**源会话**），但我当初**故意没写 `parentSession`**——理由是"带上血缘会被判为委派、从侧边栏消失"。

  而 DSH 判定一份 seeded 日志是否合法，唯一的凭据就是这个字段（`session-format-v3-to-v4/src/validation.ts:117-121`）：

  ```ts
  deliveryId !== artifact.header.id
    && !(artifact.header.parentSession !== undefined && event.seq < artifact.inheritedEventCount)
  ```

  没有它，105 条署名对不上的水位只能被读成"这条会话自己产生的水位，却签着别人的名字"→ **整份日志判为损坏**。DSH 自己的 fork 永远会写它（`session-controller/src/commands.ts:276`），所以全库 6 个 seeded 会话里只有我造的那一份缺。

  **我拿一个"显示问题"换了一个"数据完整性问题"，方向完全错了。** 正确做法是照 DSH 的规矩把字段写全，然后改掉 Loom 那条过度的过滤规则——见下一条。

- **Loom 会隐藏 DSH 自己的 fork，比 DSH 严。** Loom 原来把"有 parent、且 parent 不是自己"一律当委派隐藏（`src/core/sections.cjs`）。但 `child-agent.ts` **永远**写 `origin: 'subagent'`，而 DSH 的 `session.fork` 写 `parentSession` 却**故意不写** `origin`——所以"有父、无 origin"描述的正是 **fork**，是用户自己分叉出来的、当然要看到的会话。DSH 自己的浏览器只隐藏 `origin === 'subagent'`（`ui-workspace/src/client/tree.ts:244`），`parentId` 在那里只是把分叉排在父会话旁边。

  这条规则现改为**只认 `origin`**，与 DSH 对齐。实测这台机器 271 份会话档案，被误伤的正是**用户自己的一个 fork**（`厦门TOD璞瑞`，2900 条事件）＋**所有迁移出来的副本**——DSH 一直显示着它们，Loom 却藏着，两个侧边栏对"存在哪些会话"的说法不一致。

  旧规则当初是为"211 个有 parent、209 个有 origin"的落伍 subagent 加的；在 v4 里那类样本**一个都不剩**（`origin` 缺失且 `delegationDepth>0`：0 个），所以它已经没有真阳性，只剩下代价。

- **「聊天」段的新建会话在远程/浏览式组合下直接报错：「保存失败：directory picker failed: directoryPicker.pick needs the native capability; the composed picker serves "browse"」。** 目录选择这一层有**两个互斥后端**：`native` 提供 `pick()`（一个系统对话框），`browse` 只提供 `list()`/`createDirectory()`。`uiWorkspace.pickDirectory()` 调的是 `pick()`，所以在 browse 组合上它**不是失败，是拒绝服务**——`directory-picker-auto` 在启动时按绑定地址判定，回环以外的、SSH 的、以及远程浏览器一律得到 browse。

  原来的代码把这个拒绝原样抛给用户，还包成了"保存失败"（其实什么都没保存失败）。现在按该 seam 自己的规矩处理：**先试 `pick()`，拿到那句特定的拒绝就改用 Loom 自带的文件夹浏览器**（用 `list`/`createDirectory` 两个 browse 动词驱动），本机与远程都可用；两者都没有时按 DSH 的文档规则**隐藏入口**，而不是留一个点了必然报错的控件。

  顺带修好了**「新建工作区」的 `+`**：它从 0.2.6 之前就是同一个写法，也就是说这个按钮在远程环境下**从来没能用过**，只是旁边没有对照物，所以一直没被发现。

### 测试

- **新增 `test/migration-artifact.test.js`（4 条），它问的问题和仓库里其他所有测试都不一样**：不是"我想写的字段在不在"，而是**"DSH 本尊收不收这份产物"**——直接 `import` DSH 真检出里的 `restoreReleasedV4Artifact`，把迁移的产物喂进去。

  这才是 0.2.6 漏掉它的原因，必须记下来：**那 267 项测试里，每一条迁移断言都是拿测试自己写的 fixture 去对的**（`created.meta.cwd`、`isSeeded`、`seed.length` 三项全对）。没有一个测试把结果交给真正的消费者。fixture 和实现共享同一个错误假设时，两边都绿——这是本仓库第三次栽在同一件事上（0.2.4 手写信封、0.2.5 不悬停、0.2.6 自造 header）。

  文件里还有一条**反向**用例：把 `parentSession` 删掉后同一位校验器必须报 `wrong Session`。否则将来 DSH 改了行为、或者这段校验被绕过，正例会悄悄退化成永远通过。

- `test/client-mount.test.cjs` 增 5 条：browse 组合下弹出自带浏览器、取消不写任何东西、列目录失败单独报告（不是"保存失败"）；以及把 `uiWorkspace` 桩改成**会像生产一样拒绝**（旧桩是 `async () => options.pickDirectory ?? null`，**永远成功**——这正是 267 项测试对一个坏按钮无感的原因）。`Modal` 桩现在也渲染 `title`/`description`/`footer`：不渲染时，一个"提交键在 footer 里"的对话框看起来就是没有任何确认方式，关于它的测试根本写不出来。
- `test/sections.test.cjs`：把"有父无 origin 也算委派"改成**断言反面**（fork 必须可见），并补一条真 subagent 仍被隐藏，免得规则被"删掉测试"式地满足。
- `test/host-wiring.test.js`：原「the copy carries no lineage」**整条反转**为「the copy names its source」——它当初钉住的正是致病的那条信念。
- `scripts/mutation-chats-and-migrate.cjs` 扩到 **9 处变异**，新增 M3（去掉 lineage，判据是**真校验器**用例）、M3b（恢复按 parent 隐藏）、M3c（退回"只调原生动词"）。

## [0.2.6] - 2026-10-01

两件事：「聊天」段终于能新建会话了，以及会话可以迁移到别的工作区。

### 新增

- **会话迁移到其他工作区**（会话行 `⋯` →「迁移到其他工作区」）。打开即显示**方案**，确认后才执行：复制多少条历史、有多少条本轮事件不复制、原会话只归档不删除、新会话不是分支、技能与写入边界跟随新文件夹。执行后新会话落在目标文件夹下并自动打开。
- **「聊天」段的默认文件夹**。段标题的 `⋯` 可以设置／清除；未设置时点 `+` 先弹目录选择器，选完记住。已登记为工作区的文件夹会走 DSH 自带的「新会话」流程，界面明说新会话会归到那个工作区而不是留在「聊天」段。
- 清单新增可选顶层字段 `chatsCwd`。

### 修复

- **「聊天」段无法新建会话。** `项目` 与 `工作区` 两个段标题都传了 `+` 按钮作为 action，**只有「聊天」段没传**；而「聊天」的会话直接挂在段下面、没有组行，所以组渲染器里那个 `+` 也够不着它们。整段因此**没有任何入口**。这不是 Loom 独有——DSH 原生浏览器的 Ungrouped 桶同样如此（`WorkspaceBrowser.tsx` 里 `workspaceId === undefined` 时 `onCreate` 直接不做事），正因如此它看起来像是设计如此而不是缺失。
- **项目编辑会静默清掉清单里它不认识的键。** 客户端回写清单时只发 `{ schemaVersion, projects }`——在清单就等于项目列表时这是对的，但一旦有别的东西住在 `projects` 旁边（本次就是 `chatsCwd`），**任何一次改名／增删项目都会把它抹掉**，而且没有任何提示：宿主会重新规范化收到的载荷，回一个"就是少了那个键"的清单。现在改为合并式写入。
- **「设置默认文件夹」会把它清掉。** 段菜单用「有没有参数」来区分两个动词——`onSetChatsCwd()` 表示"让用户去选"，`onSetChatsCwd(undefined)` 表示"清除"——而两条路径的实参都是 `undefined`，于是点「设置」执行的是清除。两个动词现在有名有姓（`'pick'` / `'clear'`）。**这条是写变异脚本时被新加的挂载测试抓出来的**，它也进了那个脚本（M2b）。
- **上游带进来的一处乱码。** `origin/main` 的 `package.json` 里，`description` 的破折号 U+2014 被写成了 GBK 乱码（`U+9225` + `?`）。这是发布元数据，已修回 U+2014。

### 设计说明：为什么「迁移」是复制而不是搬移

DSH 里**没有**把会话搬到另一个工作区的办法，这是设计事实而不是缺 API：`SessionHeader.cwd` 是不可变的头字段（全仓没有 setter）；日志目录由它派生（`projectDir(root, cwd)`）；`attachSession` 在 `realpathNormalize(header.cwd) !== workspace.path` 时**拒绝**；`ensureSession` 在不一致时抛 `ApiSessionCwdConflict`；而 `session.fork` **原样复制源 cwd** 并把子会话挂回**源**工作区——分叉也搬不了家。Loom 自己的归属判定同样是 cwd 精确相等，所以改登记也搬不动。

于是唯一的诚实做法是：**建一个 cwd 指向目标文件夹的新会话，历史取自源的已完成前缀，原会话交给调用方决定去留**（本版本归档）。截断点镜像 DSH 自己的「最后一个已完成回合」口径，纯函数实现在 `src/core/migration-plan.cjs`，每个拒绝理由都是具名的。

~~复制体**刻意不带 `parentSession`、不带 `origin`**：Loom 的可见性规则把「有 parent 且 parent 不等于自己」一律判为委派并隐藏，带上血缘会让复制出来的会话从所有段里消失——看起来就像迁移失败。~~

> **这一条是错的，0.2.7 已改。** 不带 `parentSession` 会让 DSH 把复制体判为**损坏日志**，不是"从侧边栏消失"而是**根本打不开**。血缘必须写；该改的是 Loom 那条过宽的可见性规则。原文保留在此，因为下面「测试」一节正好解释了它为什么没被测试发现。

### 测试

- 新增 `test/migration-plan.test.cjs`（14 条）：截断点语义（含 `surfaceOp` 为 append 的用户消息、`agent/inbox/spliced` 断点、`seq` 与下标不一致的页）、计数、六个具名拒绝理由、以及「计划里不得出现血缘字段」。
- `test/host-wiring.test.js` 增 13 条：两个新端点在真实 `apply()` 下的注册与行为；缺服务时**具名降级**而不是加载失败；未知工作区／目标目录消失／同目录／运行中会话各自的拒绝；`agents.create` 收到的 `seed` 与 `inheritedEventCount` **逐事件按 seq** 断言（fixture 的日志刻意停在一个未闭合的回合上——否则"已完成前缀"和"整份日志"长度相同，变异测试抓不到）；复制体不带血缘；`attachSession` 失败按**部分成功**返回而不是回滚。
- `test/client-render.test.cjs` 增 7 条：三段各自的入口；「聊天」段的 `+` 与文案；默认文件夹菜单的「设置恒有、清除按需」；迁移弹窗的五条承诺、三种具名拒绝、拒绝时不显示复制计数。渲染桩现在会**保留 `Menu` 的 items 与 `Button` 的 `disabled`**——旧桩把两者都丢了，于是"菜单少了一行"和"确认键该灰却没灰"都测不出来。
- `test/client-mount.test.cjs` 增 6 条：在**真实挂载**的宿主组件上做一次项目编辑，断言回写载荷仍带着 `chatsCwd`，以及**任何它没动过的键都不丢**；「聊天」段 `+` 的三条路径（取消选择是干净的 no-op、已登记文件夹走 `startSession`、未登记文件夹走 create + 导航打开）；设置与清除两个动词各自的效果。
- 新增 `scripts/mutation-chats-and-migrate.cjs`：七处变异（拆掉「聊天」段入口／回写退回裸载荷／把两个文件夹动词并成一个哨兵／给复制体加血缘／用整份日志当 seed／跳过执行前的重新规划／忽略缺失的服务），逐个确认套件变红。写这个脚本时自己踩了一次：**只按 `not ok` 解析失败行是错的**——那是 TAP reporter 的写法，`node --test` 默认用 SPEC reporter，失败标记是 `✖`，所以第一版把六处全报成了"套件没抓到"。两种写法现在都认。

> 这一节的变异里有一条（「给复制体加血缘」）**把缺陷当成了修复**：它断言的是"带上血缘会让套件变红"，而真相是**不带**才是缺陷。变异数量和绿红结果都没错，错的是它保护的结论。0.2.7 已把该变异反转，并新增一个用 DSH 真校验器断言的用例。
- `test/dsh-02-transport.test.js` 与 `test/host-wiring.test.js` 里写死的端点个数改为**从 `BRIDGE_ENDPOINTS` 派生**：端点数再变时，这两处不该各改一遍，而它们藏得住的失败恰恰是"客户端调的路由没人挂"。

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
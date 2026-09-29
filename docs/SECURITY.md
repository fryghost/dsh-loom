# 安全说明

本文说明这个插件的实际攻击面、怎么报告漏洞，以及哪些问题**不**在这里的范围内。它不声称 Loom 比实际更安全。

## 它碰什么

### Host 半边（`src/index.js`、`src/host/*.js`，运行在 DSH 的 Node 进程里）

**读** —— 只读用户在 `$DSH_HOME/projects/manifest.json` 里配置进项目的文件夹：

- 每个成员文件夹下的 `.dsh/skills`、`.agents/skills`：读其中的 `SKILL.md`（以及技能根下一层的 `*.md`），解析的是 frontmatter 元数据；
- 每个成员文件夹根部的 `AGENTS.md` / `CLAUDE.md`：`stat` 取大小，并读前 400 字节作为预检里的摘录；
- 别的什么都不读。`stat` 一个不存在的路径得到"没有这个文件"，是预检里的一条正常结论。

读到的内容只作为文本处理：技能正文被交给 DSH 的技能注册表，指令摘录被放进预检结果发给 UI。**Loom 不执行、不 `eval`、不解析成代码**，也不对文件夹内容做任何写入。

**写** —— 只写 `$DSH_HOME` 下两个文件：

| 文件 | 写法 |
|---|---|
| `$DSH_HOME/projects/manifest.json` | 原子写（临时文件 + rename）；损坏的文件不被覆盖；更高的 `schemaVersion` 拒绝解释 |
| `$DSH_HOME/loom-client.log` | 追加写，每条上报一行 JSON |

配置过的文件夹本身**永远不被写入**，卸载也不删除清单、文件夹或会话。

### 桥接端点

客户端经 carrier 的 **`/api` 通道**调用 Host 的四个端点：`getManifest`、`putManifest`、`preflight`、`report`。每个端点一条**精确 Fetch 路由**：

```
POST /api/dsh-loom/getManifest
POST /api/dsh-loom/putManifest
POST /api/dsh-loom/preflight
POST /api/dsh-loom/report
```

**鉴权由 DSH 的 `connection` 服务在派发之前完成**：`/api` 的统一 Host/Origin 围栏 + 浏览器会话签名 cookie。Loom 自己不叠加任何鉴权，也不声明任何 authority——请求能到达端点，说明它已经通过了这两道判定。这里要说清边界：这挡住的是**没有该浏览器会话的调用者**（含其他机器上的、以及本机上没拿到 cookie 的），不等于"同机隔离"，也不等于"只有 DSH 页面能调"——同一用户下已经持有该 cookie 的进程照样能调。

每条路由是**精确路径**：Loom 不接管 `/api` 的任何通配区间，未注册的路径仍是 carrier 自己的 404。

> **为什么不是私有通道。** Loom 0.2.2 及更早版本注册私有通道 `/dsh-loom`（`ctx.connection.rpc.handle(channel, handler)`）。**这在 DSH 0.2 上挂不上**：`handle` 转给 `register(owner, …)`，而 `owner` 是构造 Connection 服务的那个 context（Connection 插件自己的 fiber，对我们的插件来说是**兄弟节点**），`register` 随后读 `owner.webServer` 并在 Cordis 里沿**那条** fiber 向上查找——永远查不到提供 `webServer` 的插件，于是在插件加载阶段抛出 `cannot get property "webServer" without inject`。这是 DSH 一侧的查找作用域问题，插件侧无法绕过；改用共享通道上的自有端点后，既不依赖 `webServer` 注入，也顺带把鉴权交给了本就在做这件事的那一层。

`report` 把客户端上报的对象序列化成一行 JSON 追加进日志。`JSON.stringify` 会转义换行，所以一条上报伪造不出额外的日志行；但日志内容本身不校验、不清理，也不会自动轮转或截断——它随时间增长。这是诊断优先的有意取舍，不是漏洞，但你该知道它在那里。

### Client 半边（`src/client.cjs`，打包进 `dist/client.js`，在页面里运行）

在 DSH 的槽位里渲染 React 界面，经上面那四个端点读写清单。客户端**不自己发请求**：所有调用都经 `connection.rpc` 交给 carrier，代码里没有直接的 `fetch` / `XMLHttpRequest` / `WebSocket`，也不加载远程资源。打包时 `react`、`react-dom` 与 `@deepseek-ai/dsh-client-ui-primitives` 保持 external，用的是宿主页面已经加载的同一份实例，而不是打进第二份。

## 不在这个范围内的

- **被配置进项目的文件夹里的内容是否可信。** 一个成员文件夹里的 `SKILL.md` 会进入会话上下文，那是 DSH 技能系统的行为，不是 Loom 引入的，Loom 也不去判断内容是否恶意。装技能和加文件夹一样，是信任决定。
- **跨文件夹写入。** 沙箱的写入边界由 DSH 单个 `workspaceRoot` 推导，`workspace-write` 下只有活动文件夹可写。Loom 不绕过它，也不去软化它（详见 README 的"已知边界"）。
- **DSH 本身的问题。** 那属于上游仓库，不在这里处理。
- **依赖项的漏洞** —— `esbuild` 只用于构建，`react` / `react-dom` 由宿主提供。这类问题报给对应上游。

## 支持范围

修的是 `package.json` 里 `version` 指向的当前版本。更早的版本会建议先升级再复现。

## 报告漏洞

用 GitHub 的**私有安全公告**：仓库的 Security 标签页 → "Report a vulnerability"。**不要开公开 issue**——公开 issue 在修复发布前就把细节摆出来了。

报告里请写：

- 受影响的版本（`package.json` 的 `version`）与 DSH 版本、`--profile`；
- 复现步骤，尽量给最小路径；
- 你判断的影响，以及它落在上面哪一块（Host 读写路径 / 桥接端点边界 / 清单持久化 / 页面渲染）。

这是个人维护的仓库，没有承诺的响应时限；确认之后会在对应的 advisory 里说明影响与修复版本。
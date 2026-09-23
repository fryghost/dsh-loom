# 参与开发

本文说明改动应该落在哪一半、怎么验证，以及哪些约束不能碰。

## 仓库结构

| 路径 | 在哪里运行 | 模块形式 |
|---|---|---|
| `src/index.js`、`src/host/*.js` | Host —— DSH 的 Node 进程 | ESM |
| `src/client.cjs` | Client —— 浏览器页面 | CommonJS，由 esbuild 打包 |
| `src/core/*.cjs` | 两边都不是：纯逻辑 | CommonJS |
| `dist/client.js` | Client | **提交进仓库的构建产物** |
| `test/*.test.js`、`test/*.test.cjs` | `node:test` | 与各自被测的源文件一致 |

### 一个改动该放哪一半

- 碰 `node:fs`、`node:path`、`$DSH_HOME`，或 DSH 服务（`ctx.skills`、`ctx.workspaceRegistry`、`ctx.connection`）→ **Host**。
- 碰 React、槽位（`ctx.slots`）、页面状态 → **Client**。
- 是"给定已经采集好的数据，算出结论"（清单归一化、技能根展开、冲突裁决、frontmatter 解析、预检计划）→ **`src/core`**。

第三条是有原因的。`buildContextPlan()` 不自己做 IO：它接收各根的技能清单、文件状态、指令大小，只负责裁决。这样它可以完整单测——不需要真实文件系统，也不需要浏览器——结果可 JSON 序列化后直接经 RPC 交给 UI，也能被 CLI 或其他插件复用。IO 归 Host 半边的 `gatherSkills` / `gatherInstructions`。

判断标准很简单：**一个函数如果必须要有真实文件系统或页面才能确定结果，它就不属于 `src/core`。**

## `dist/client.js` 是提交进仓库的构建产物

`dsh plugin add github:fryghost/dsh-loom` 和 `add link:<路径>` 都不应该要求用户先构建，所以客户端产物随仓库提交（`.gitignore` 里有一段注释专门说明这一点）。

改了 `src/client.cjs` 之后：

```bash
npm run build
git add dist/client.js
```

CI 有一条 `bundle-freshness` 任务守这条线：它重新构建，然后 `git diff --exit-code -- dist/client.js`。产物与源码对不上，任务直接失败。

不要直接编辑 `dist/client.js`——它是生成物，下一次构建会覆盖掉手写的内容。

## 新增源文件要登记

`npm run check` 对每个源文件跑 `node --check`（只做语法检查，不执行）。它是逐文件列出的，所以新增一个 `src/core/*.cjs` 或 `src/host/*.js` 之后，要把文件加进 `package.json` 的 `scripts.check`，否则它不会进入检查。

新文件如果要在安装后可用，还得落在 `package.json` 的 `files` 里（现在列的是 `dist/client.js`、`src/index.js`、`src/host/*.js`、`src/core/*.cjs`、`cordis.patch.yml`、`README.md`、`LICENSE`、`docs/*.md`、`docs/assets/*.png`）。CI 会跑 `npm pack --dry-run`，但它只清单、不报错——漏掉的运行时文件不会让 CI 变红，只会在用户装完之后表现为缺文件。

## 测试

```bash
npm test        # node --test
npm run verify  # check + build + test
```

Node >= 20，测试用内置的 `node:test`，没有测试框架依赖。核心逻辑的用例写成 `.test.cjs`（与被测的 CommonJS 对上），Host 半边写成 `.test.js`。

`test/dsh-baseline.test.js` 固化的是 **DSH 自身**的行为（软链接能不能聚合、`@` 引用是否拒绝软链接），不是 Loom 的行为。它需要一份 DSH 源码检出，用 `DSH_CHECKOUT` 指定；找不到时这些用例**跳过而不是失败**——这是有意的，在没有检出的机器上它不该变红。

```bash
DSH_CHECKOUT=/path/to/deepseek-harness npm test
```

`test/skill-provider.e2e.test.cjs` 在真实文件系统上验证核心能力：cwd 在 A，B 的技能可见且正文可读。它是 Loom 与"仅 UI 分组"的分界线，改动技能发现路径时先看它。

## 测试断言行为与不变量，不断言实现细节

`test/manifest-store.test.js` 断的是"损坏的 JSON 被报告、且文件没被清掉"，不是"`loadManifest` 调了一次 `readFile`"。前者重构之后仍然成立，后者一重构就假红。

两条硬要求：

1. **一个测试必须能为它命名的那种失败而失败。** `test/client-contract.test.cjs` 里有一条样式表用例，早期版本去找"反引号后面跟着分号"，于是漏掉了每一个真正多余的反引号——它无法为自己要防的那个 bug 失败。写完之后问一句：把这个 bug 放回去，这条会红吗？
2. **回归修复带上一个在修复前会失败的测试。** 先在坏掉的代码上跑一遍确认它红，再改代码。这不是流程洁癖：仓库里多处注释记录了同一个 bug 反复出现（`src/client.cjs` 里那个模板字符串的反引号出过四次，`box-sizing` 缺失出过三次），测试是唯一挡住它们的东西。

测试文件头部的注释写"这个 bug 为什么会出现"，与仓库现有用例保持一致。那不是装饰，它解释了断言为什么长成这样。

## 不能破坏的约束

这几条是设计结论，不是偏好。改动如果碰到其中任何一条，先在 issue 里说清楚。

1. **Loom 只分组已有的 DSH Workspace，永不修改它们。** 文件夹不被任何项目"拥有"，一个文件夹可以同时属于任意多个项目，项目之间没有主副之分，清单里没有 `claimed` 之类的独占集合。
2. **冲突必须报告，不得静默取胜。** 同名技能在多个文件夹出现时，生效者与被遮蔽者都要出现在预检里。
3. **失联成员保留。** 成员文件夹暂时解析不到时标记 `missing` 并保留；只有结构性问题才进 `dropped`。判据是用户的数据还在不在。
4. **损坏的清单不被覆盖，更高 `schemaVersion` 的清单拒绝解释。** 读取失败时保留原文件并报告，等用户处理。
5. **不绕过沙箱写入边界。** 跨文件夹只能读；`workspace-write` 下只有活动文件夹可写。这是 DSH 单根 `workspaceRoot` 的结果，Loom 不去软化它，也不去猜第二个根。

## 在本地装一份检出用于测试

先构建，再安装——`link:` 装的是 `dist/client.js`：

```bash
npm install
npm run build
dsh plugin --profile web add link:/absolute/path/to/dsh-loom
```

Windows 上的绝对路径写成 Windows 形式：

```powershell
dsh plugin --profile web add link:C:/path/to/dsh-loom
```

装完**完整退出并重启**对应 profile，插件才会挂载。确认方式是看 `$DSH_HOME/profiles/web/package.json`：`dsh.profile.bundles` 里应出现 `"dsh-loom"`。如果只进了 `dependencies` 而没进 `bundles`，说明 `dsh.bundle.patch` 没被识别，插件不会挂载。

改动生效的代价不一样，别混：Host 半边（`src/index.js`、`src/host/*`、`src/core/*`）在进程重启后加载；Client 半边要 `npm run build` 重新打包，再重启 profile 或刷新页面。改了 `src/client.cjs` 却只刷新页面，看到的仍是旧产物。

卸载：

```bash
dsh plugin --profile web remove dsh-loom
```

卸载不删除项目清单、任何文件夹或会话。

## 报告问题

用仓库的 issue 表单（`.github/ISSUE_TEMPLATE`）。表单里问的每一项都有用途，尤其是这一项：

**`$DSH_HOME/loom-client.log` 里有没有内容。**

原因是一个具体的失败模式：客户端注册槽位时回调抛错，`slots.inject` 会**静默退役**这条注册——停掉它的 controller，异步重抛，用户和模型都看不到任何东西。于是"面板没出现、控制台也没报错"本身不留任何记录。客户端因此主动把注册结果（成功、失败、消息与截断的 stack）上报给 Host，Host 追加写进这个日志。**面板没出现而日志为空，说明问题出在更早的地方**（插件没挂载、profile 没重启、`dsh.profile.bundles` 里没有它），这是排查的第一个分叉。

报告时至少给出：DSH 版本、插件版本（见 `package.json` 的 `version`）、装的是哪个 profile、操作系统、日志文件的内容（文件不存在或为空就写"无"）。

安全问题不要开公开 issue，走 [SECURITY.md](SECURITY.md) 里的私有渠道。

## 提交前

```bash
npm run verify
```

CI 在 Ubuntu / Windows / macOS 上各跑 Node 20、22、24，另有 `bundle-freshness` 一条。三个平台都跑是有原因的：路径与文件系统的差异（大小写、分隔符、软链接行为）正是这类插件最容易在别人机器上翻车的地方。

`docs/design.md` 记录的不只是结论，还有被否决的方案——比起结论，"想过但不行"通常更有用。改动如果推翻了其中某个决策，把理由一并写进那里或对应的 issue。
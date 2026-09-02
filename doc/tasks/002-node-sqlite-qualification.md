# 002 Electron 内嵌 `node:sqlite` 资格验证

> 状态：COMPLETED / QUALIFIED / INDEPENDENT REVIEW PASS（限定范围不变）
> 2026-09-03 注：F1 候选已在同一 Electron `44.1.1`／内嵌 Node `24.19.0`／SQLite `3.53.3` 主进程边界上实现并通过独立两 PID 生命周期 harness。该产品验证不修改、重跑或扩大本任务的历史资格结论。

## F1 使用边界

- 当前 F1 使用 `node:sqlite` 完成助手 schema、事务 rollback、版本/trigger guard 和关闭重启恢复；这些证据归 F1 candidate，不回写为本任务 002 的新资格范围。
- `PACKAGED`、安装器、自定义安装目录、升级/卸载、迁移、多实例、崩溃恢复和更大负载继续为 **NOT RUN**。
- 本任务原始失败、repair、ACL 和独立 Reviewer 证据全部保留；没有重跑 Toolhelp32 `-003` 辅助审计，也没有创建 `-004`。

## 历史资格记录（原文保留）

> 状态：COMPLETED / QUALIFIED / INDEPENDENT REVIEW PASS  
> 任务性质：隔离预验证；不是产品开发或工程初始化。

## 2026-09-02 本轮执行冻结

### 授权与范围

- 用户已接受 F1“本地助手身份与持久化生命周期”作为后续初始化目标，但只授权本任务 002 的隔离资格验证；F1 实施、正式项目初始化、001、003、Git 写入和外部服务仍未授权。
- 本轮不建立 React、renderer、preload、产品 Schema、ORM、通用存储层、正式 Mashiro 数据目录或安装更新系统。只建立可复核的最小 Electron main 探针和满足既有 `BUILT_PREVIEW` 验收所需的最小 main-only electron-vite 构建。
- `better-sqlite3`仍只作备选；`node:sqlite`失败时停止并报告，不切换驱动。
- 隔离根使用`%TEMP%\mashiro-002-node-sqlite-qualification-20260902-001`。允许内容仅为实验 manifest/lockfile、依赖与 Electron 运行文件、探针、合成数据库、必要构建/测试产物、隔离缓存和无私人内容的证据；该目录开始前确认不存在。

### 精确候选与来源

- Electron：`44.1.1`。Electron 官方 release dashboard 于 2026-09-02 显示该版本为 2026-09-01 发布的稳定版，内嵌 Node `24.19.0`；官方 npm registry 对该精确版本的 metadata 查询成功。选择依据是当前受支持稳定主线的精确补丁、Node 24 与 F1 开发主版本方向一致，且不是 prerelease、nightly 或未记录的 tag。
- electron-vite：`5.0.0`。沿用 ENG-003 已确认的 v5 系列；官方指南当前标识 v5.0.0，并要求 Node `20.19+`或`22.12+`及 Vite `5+`。
- Vite：`7.3.6`。来自官方 npm registry 的精确 metadata，满足 electron-vite `^5 || ^6 || ^7` peer 范围与当前 Node 要求。它只服务本任务的最小构建预览，不在本轮冻结 F1 的全部正式依赖。
- 只把以上三项写为直接开发依赖；传递依赖由真实 lockfile 固定。安装先以`--ignore-scripts`生成/恢复依赖并检查 lockfile 的 engine、peer 与 install-script 标记，再仅执行 Electron 二进制和 esbuild 平台二进制所需脚本。若实际脚本集合或冲突超出该说明，停止复核。

### 下载、代理与缓存边界

- npm 包 metadata/tarball 仅访问`https://registry.npmjs.org/`，保持`strict-ssl=true`，使用隔离 npm cache；不使用 npm 镜像。当前官方 registry metadata 在无 npm proxy 的子进程范围读取成功。
- Electron 安装脚本预计访问`https://github.com/electron/electron/releases/download/v44.1.1/electron-v44.1.1-win32-x64.zip`，并可能跟随 GitHub 到`release-assets.githubusercontent.com`的官方重定向。只为该安装子进程设置`ELECTRON_GET_USE_PROXY=1`与`HTTP_PROXY`/`HTTPS_PROXY=http://127.0.0.1:7890`，不修改全局配置；不设置 mirror，不关闭 TLS 或 checksum。
- npm cache、`electron_config_cache`、Electron 下载临时目录、应用`userData`/session/cache/crash/log/temp和测试数据均定向到本任务隔离根。Electron/Windows 在进程启动前使用的 OS 级机制若无法重定向，作为必要例外记录；不得写入 Mashiro 未来正式数据目录。
- npm 请求固定为最多 1 次重试、1～5 秒重试退避、单请求 30 秒超时；下载失败只允许在同一官方目标和同一代理方案下做一次有界重试，不换镜像或网络方案。

### 测试范围、必过项与阈值

- `DEV_RUNTIME`和`BUILT_PREVIEW`均须由 Electron `44.1.1`的 browser/main 进程执行；断言`process.type === 'browser'`、`process.versions.electron === '44.1.1'`，并记录实际 Electron、Node、Chrome、V8、SQLite、架构、可执行文件名和入口类别。普通 Node 只可编排子进程和汇总证据，不构成运行时通过。
- 两个证据层级各自使用独立合成数据根，依次运行 seed Electron 进程和新的 verify Electron 进程。verify 必须证明已提交数据跨独立 Electron 进程存在、回滚数据不存在；同进程关闭连接再开只作补充，不替代该门禁。
- 必过行为：数据库创建、参数化写入/读取、显式事务提交/回滚、连接关闭与句柄释放、中文和空格路径、唯一约束错误后连接仍可用、路径不可写时得到可分类失败且没有静默回退文件。
- 权限场景只对本任务新建的隔离子目录临时设置普通用户只读/执行 ACL；执行前记录当前进程非提升状态，执行后恢复继承并核对。不得修改系统目录、其他项目、既有用户目录 ACL，也不以只读属性或管理员安装结果代替。
- 有界负载为 10,000 行、每行 256 个中文字符、100 行一批并在批间让出事件循环。必过阈值：总耗时不超过 10,000 ms、任何单批不超过 100 ms、10 ms heartbeat 的最大观测间隔不超过 250 ms；同时记录数据库大小和各项实测值。阈值失败不得事后放宽，可据证据提出 worker 后续门禁。
- 每个 Electron 子进程硬超时 60 秒；任何超时、崩溃、断言失败、数据位置越界或重启证据缺失均按失败处理，不用 mock 或跳过替代真实 I/O。

### 预先冻结的结论规则

- `QUALIFIED`：两个证据层级全部必过项通过，版本/依赖/路径/证据可复核，且没有停止条件触发。
- `NOT QUALIFIED`：真实 Electron 中模块、事务、重启持久化、路径/权限失败、错误恢复或响应性任一必过项失败。
- `INCONCLUSIVE`：官方下载、受控代理、普通用户权限夹具或运行环境等外部必要条件阻塞，且不能在既定边界内建立真实证据。
- `PACKAGED`、实际安装包、自定义安装目录、升级、卸载和正式数据迁移固定为`NOT RUN`；开发/构建预览通过不得扩大到这些层级，也不证明 Markdown 跨层原子性、完整恢复、工具幂等或完整记忆系统。

## TASK

- 唯一任务：验证最终候选 Electron 运行时中的 `node:sqlite`是否满足 Mashiro 近期事务存储基线，并生成可复核证据。

## BASELINE

- SQLite方向已确认；`node:sqlite`已在本文件限定的 Electron `44.1.1`、Windows x64、`DEV_RUNTIME`与 main-only `BUILT_PREVIEW`范围内通过资格验证，尚未成为正式项目依赖。
- `better-sqlite3`仅是明确受阻后的备选，不并行实现，不自动切换。
- 本轮已获准精确 Electron 与最小构建依赖、独占临时实验目录、合成数据库和必要构建/测试产物；正式项目依赖与产物仍未授权。
- 本机Node能力不能代替Electron内嵌Node验证。

## GOAL

- 在用户批准的隔离位置、使用合成数据和精确候选版本，确认模块可用性、SQLite版本、事务、重开、路径、权限失败、错误恢复和必要响应性。
- 明确区分开发运行、构建产物预览和真正打包后启动的证据等级。
- 得出“通过并可进入初始化冻结”或“失败并回到驱动选型”的客观结论。

## NON-GOALS

- 不建立产品数据库Schema、ORM、迁移框架或双驱动抽象。
- 不写入`D:\Mashiro`产品源码或真实数据；除非后续授权明确把实验位置设为项目内特定路径。
- 不安装系统级编译工具、不修改全局Node/npm、代理、环境变量或Git配置。
- 不制作完整安装器、更新器或卸载器。
- 不因开发预览通过就宣称打包验证通过。

## AUTHORITATIVE SOURCES

- 架构与存储边界：[../high-level-design.md](../high-level-design.md)
- 详细数据、线程和恢复约束：[../detailed-design.md](../detailed-design.md)
- 产品阶段范围：[../proposal.md](../proposal.md)
- 最终候选Electron和Node官方文档、release notes及实际运行时输出；执行时重新核验。
- 用户对实验位置、网络、预算和清理范围的单独授权。

## CURRENT VERIFIED STATE

- 2026-09-02 实际解析的开发 Node 为`24.18.0`、npm为`11.16.0`；隔离 lockfile v3 与`npm ls --depth=0`确认直接依赖为 Electron `44.1.1`、electron-vite `5.0.0`、Vite `7.3.6`，无 engine/peer 强制绕过。
- 最终候选证据`repair-002`由四个不同 PID 的 Electron browser/main 进程生成，实际内嵌 Node `24.19.0`、SQLite `3.53.3`、Chrome `152.0.7977.65`、V8 `15.2.124.18-electron.0`、Windows x64。
- 模块加载、文件数据库创建、实际读写、显式事务提交/回滚、连接关闭、同进程重开、独立 Electron 进程重启、中文/空格路径、普通用户权限失败、错误后恢复、有界负载：**PASS**。
- `DEV_RUNTIME`：**PASS**；main-only `BUILT_PREVIEW`：**PASS**；`PACKAGED`、安装器、自定义安装目录、升级、卸载和正式迁移：**NOT RUN（不在授权范围）**。

## FIXED DECISIONS / INVARIANTS

- 只使用合成数据和明确的隔离位置。
- renderer不获得SQL、数据库路径或直接连接；探针在Electron可信侧运行。
- 不使用管理员权限成功掩盖普通用户路径失败。
- 不把SQLite事务保证扩大到Markdown或外部服务。
- 不通过强制依赖、忽略engine/peer冲突或静默换驱动制造通过。
- 失败报告具体阶段、版本、错误类别和可复现条件。

## REQUIRED AUTHORIZATION（本轮已满足）

执行前必须由用户明确批准：

1. 精确实验目录及允许创建/清理的文件；
2. 允许安装的精确依赖类别和npm网络目标；
3. 候选Electron、electron-vite及相关版本策略；
4. 是否允许构建预览；真正打包验证因打包器未定默认不在本任务；
5. 实验时间/资源边界以及是否允许使用worker；
6. 失败后是否只报告，或另开任务评估`better-sqlite3`。

2026-09-02 用户已逐项授权本轮独占系统临时目录、精确 Electron 候选、最小必要依赖与官方 npm/Electron 下载、main-only 构建预览、上述有界资源默认值、合成数据、文档证据和实验产物保留；失败后只报告，不切换`better-sqlite3`。该授权不包含产品开发、真实个人数据、Git写入或发布。

## EXPECTED SCOPE

- 一个用户批准的临时实验目录；
- 最小Electron main/可选worker探针；
- 合成SQLite数据库和自动化验证；
- 结构化结果及环境/版本证据；
- 只清理本任务明确创建且路径已核对的临时内容。

## IMPLEMENTATION PLAN

1. 执行前重新核验候选Electron的内嵌Node、`node:sqlite`文档和依赖兼容性。
2. 在批准的空临时目录建立最小探针，不复用真实Mashiro数据目录。
3. 从Electron main加载模块，记录`process.versions`与SQLite版本。
4. 运行数据库创建、读写、事务提交/回滚、关闭重开。
5. 在中文和空格路径运行；对明确不可写位置验证清晰失败且无回退文件。
6. 用受控合成负载记录main执行和可选worker执行的响应性，不预先编造阈值结论。
7. 运行开发模式与构建产物预览；若未授权打包，明确标记NOT RUN。
8. 汇总证据，判断通过、失败或需进一步信息；不自动替换驱动。

## TEST PLAN

### 甄别 oracle

- 实际Electron进程成功导入`node:sqlite`并创建文件数据库。
- 提交事务的数据重开后存在；回滚事务的数据重开后不存在。
- 中文/空格路径创建、读写、关闭、重开均使用同一明确路径。
- 不可写路径返回可分类失败；未在默认目录或其他位置出现新数据库。
- 关闭后句柄释放，失败不会把半完成状态报告为成功。
- 若同步负载导致不可接受阻塞，证据能区分main与worker方案，而非凭主观判断。

### 证据层级

- `DEV_RUNTIME`：Electron开发运行；
- `BUILT_PREVIEW`：electron-vite构建产物预览；
- `PACKAGED`：真正打包后启动，默认NOT RUN直到打包器和权限明确。

## ACCEPTANCE

- 精确记录开发Node/npm、Electron版本、Electron内嵌Node、SQLite版本和依赖树来源。
- 所有必需oracle在`DEV_RUNTIME`和`BUILT_PREVIEW`通过。
- 路径失败无静默回退，事务与重开证据可复核。
- 响应性结果足以决定近期执行位置或明确列为后续门禁。
- 未执行的`PACKAGED`验证明确保留，不能写成通过。
- 结论为以下之一：`QUALIFIED`、`NOT QUALIFIED`、`INCONCLUSIVE`。

## STOP CONDITIONS

- 实验目录非空或出现未知用户文件；
- 需要写入项目、个人数据目录或参考工程但未获授权；
- 需要管理员权限、全局工具安装或修改系统配置；
- 依赖engine/peer冲突只能通过强制忽略；
- 目标路径无法精确核对，或临时清理可能越界；
- 结果要求静默切换到`better-sqlite3`或扩大为产品实现。

## FINAL EVIDENCE

### 隔离位置与依赖

- 保留根：`%TEMP%\mashiro-002-node-sqlite-qualification-20260902-001`；开始前不存在，清理范围可精确限定为该目录整体，本轮为复核保留且未清理。
- 直接依赖：Electron `44.1.1`、electron-vite `5.0.0`、Vite `7.3.6`；实际传递项包括`@electron/get 5.1.0`、esbuild `0.25.12`与`0.28.2`。SQLite来自 Electron 内嵌 Node，不是 npm 驱动包；未安装`better-sqlite3`。
- lockfile共147个包条目，当前平台实际恢复71个包；所有`resolved`来源均为`registry.npmjs.org`。`npm ls --all --json`与`npm ls --depth=0`均退出`0`。
- Electron官方二进制请求为`https://github.com/electron/electron/releases/download/v44.1.1/electron-v44.1.1-win32-x64.zip`，仅下载子进程使用`HTTP_PROXY`/`HTTPS_PROXY=http://127.0.0.1:7890`及`ELECTRON_GET_USE_PROXY=1`；npm registry无npm代理。未设置mirror，TLS与内置checksum保持启用。zip实际SHA-256为`c574a22981889b74212c90a9391adcca116cd9d74e32b660ab21d0130ab50cc2`，与包内记录一致；下载器未单独暴露重定向后的最终host。

### 安装、构建与执行命令

下列命令均在隔离根运行，路径以`%ISOLATION_ROOT%`表示；参数中保持官方 registry、隔离 cache、最多1次重试和30秒请求超时。

| 类别 | 命令/步骤 | 退出码 | 结果 |
| --- | --- | ---: | --- |
| lockfile | `npm install --package-lock-only --ignore-scripts ...` | 0 | 生成真实`package-lock.json` |
| 恢复依赖 | `npm ci --ignore-scripts ...` | 0 | 恢复71个当前平台包，不执行未知脚本 |
| 必要脚本 | 两份精确 esbuild 的`node install.js` | 0 / 0 | 平台二进制可执行 |
| Electron下载 | `node node_modules/electron/install.js` | 0 | 官方zip经代理下载、checksum通过、解压到隔离目录 |
| 构建尝试1 | `npm run build`（受限沙箱） | 1 | 环境失败：沙箱拒绝esbuild枚举系统临时目录父级；未运行产品/探针断言 |
| 构建尝试2 | 同命令、同隔离目录、无网络、非沙箱 | 0 | 初始main-only构建通过；warning仅说明有意缺少renderer/preload |
| Reviewer修复构建 | 同命令、无网络 | 0 | 最终`out/main/index.js` 12.27 kB，SHA-256 `92ff6565d33a369e585213874a8d414db8edb1533068a002ce9c6ec0c2eb0f7e` |
| 权限修复尝试 | `node run-qualification.mjs`（`repair-001`） | 1 | 四个Electron行为通过，但非owner夹具ACL reset退出5；如实保留为FAIL并由原owner立即恢复 |
| 最终资格执行 | `node run-qualification.mjs`（`repair-002`） | 0 | ACL夹具、四个Electron进程和全部断言通过 |
| 最终只读复核 | JSON/路径/ACL/hash/`npm ls`一致性检查 | 0 | 4份PASS、4个不同PID、ACL恢复、数据库未越界 |

最终四个运行命令及结果见`%ISOLATION_ROOT%\evidence\repair-002\command-results.json`：

| 层级/阶段 | 实际入口 | 退出码 | PID关系与结果 |
| --- | --- | ---: | --- |
| DEV seed | Electron exe＋`src/main/index.cjs` | 0 | PID `438132`；创建/写读/事务/负载/权限通过 |
| DEV verify | 同上，新进程 | 0 | PID `434248`；提交值存在、回滚值不存在、10,000行存在 |
| BUILT seed | Electron exe＋应用根，加载`out/main/index.js` | 0 | PID `315564`；同组必过项通过 |
| BUILT verify | 同上，新进程 | 0 | PID `126860`；跨进程持久化通过 |

### 关键行为结果

- 四份最终运行证据均断言`process.type === 'browser'`、Electron `44.1.1`，且子进程环境没有`ELECTRON_RUN_AS_NODE`；普通 Node `24.18.0`只负责编排，不构成资格证据。
- 两层级都在`中文 路径\合成 资料.sqlite`执行真实 I/O。提交行重启后存在，回滚行计数为0；关闭后文件可重命名并恢复，说明句柄释放；同进程只读重开也通过。
- 重复唯一键返回`ERR_SQLITE_ERROR`、SQLite errcode `2067`，之后连接继续可读，未把部分失败报告为成功。
- `repair-002`由实际桌面普通用户创建并拥有权限夹具；编排令牌`adminRoleEnabled=false`。ACL before为继承，during仅当前SID的`(OI)(CI)(RX)`，Electron打开真实存在且可读取目录下的目标文件返回`ERR_SQLITE_ERROR`/errcode `14`，未创建数据库或回退文件；reset退出0，after恢复继承且目录为空。
- DEV负载：10,000行×256中文字符、100行/批，总`311.9337 ms`、最大批`3.6567 ms`、最大heartbeat间隔`18.2886 ms`。BUILT分别为`323.6616 ms`、`9.1945 ms`、`24.0562 ms`；均低于冻结的`10,000 / 100 / 250 ms`阈值。本结果支持近期按小批次让出事件循环；它不是任意负载或UI全链路性能保证。

### 证据、残留与审核

- 关键证据：`%ISOLATION_ROOT%\evidence\build-attempts.json`、`repair-001\permission-fixture.json`、`repair-002\permission-fixture.json`、`repair-002\command-results.json`及四份`repair-002\<LEVEL>-<phase>.json`。
- 最终候选hash：`src/main/index.cjs`=`db8f22282e31f085eb6d3e41f2735d7d228ce79e41a8ccec256121f1424b0881`；`run-qualification.mjs`=`99f81772c6300bbd1d59c8ce179b27285c9b61b0c910802939f92b5e5f98a5c2`；构建输出hash见上。
- 保留约774,424,492字节：npm/Electron cache、`node_modules`、三轮合成数据库（含保留的初始/repair证据）、最小源码/构建、隔离runtime数据与18个证据文件。没有复制到正式项目；权限夹具当前均为空且继承已恢复。
- 独立Reviewer先给`REPAIR`指出ACL证据缺口，修复后对上述hash和`repair-002`给出`PASS`。首次构建失败与`repair-001`失败均保留，未覆盖成成功。

### 资格结论

**QUALIFIED**：`node:sqlite`具备进入F1初始化冻结清单的资格，但结论严格限定于本机Windows x64、Electron `44.1.1`、内嵌Node `24.19.0`/SQLite `3.53.3`、本轮API与负载、`DEV_RUNTIME`和main-only `BUILT_PREVIEW`。若 Electron/内嵌Node、架构、关键存储调用或执行位置改变，应重新资格验证。

`PACKAGED`、安装器、自定义安装目录、升级、卸载、正式数据位置、迁移、多实例/并发、崩溃恢复和更大负载仍为**NOT RUN**。SQLite事务通过只证明单一数据库事务，不证明Markdown跨层原子性、完整恢复系统、工具幂等、F1业务Schema或记忆系统已经实现。ENG-004可从“待验证候选”更新为“上述限定范围内已资格通过”，无需打开`better-sqlite3`实施。

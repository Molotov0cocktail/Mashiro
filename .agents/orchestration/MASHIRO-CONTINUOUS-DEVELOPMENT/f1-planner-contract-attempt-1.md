# MASHIRO-CONTINUOUS-DEVELOPMENT — F1 Planner Report and Execution Contract

## PLANNER RESULT

- STATUS: CONTRACT_READY
- PROGRAM_ID: MASHIRO-CONTINUOUS-DEVELOPMENT
- MODE: Plan / Design → Execute Feature
- TASK: 正式工程初始化 + F1 本地助手身份与持久化生命周期
- ROUTE_ID: foundation-f1-electron-sqlite-v1
- ATTEMPT: 1
- RISK: HIGH（持久化、安全/IPC、真实 Electron 生命周期、首次 Git 基线）
- REVIEW: mandatory-fresh；Executor 不得自判 PASS
- PROJECT_ROOT: D:\Mashiro
- USER_GATE: NONE
- EXPLORER: NOT REQUIRED
- 本 Planner 只做只读核验、官方包 metadata 查询和本报告写入；没有实现、安装依赖、初始化 Git、commit、push、Provider 调用、个人数据访问或参考项目访问。

本合同把“正式工程初始化”和“一个真实 F1 垂直闭环”合并为一个连贯候选。它不创建 Provider、记忆、事项、提醒、installer、通用 operation 或未来模块空框架。

## TASK

由一个 Executor 作为产品文件单写者，在精确 hash-guard baseline 上：

1. 建立可恢复的 Git main 初始基线与两个精确 remote；
2. 使用 Electron 44.1.1、TypeScript、React、electron-vite、npm 和真实 package-lock.json 建立最小正式工程；
3. 通过 renderer → preload → main → node:sqlite 完成助手创建、切换、重命名、设为主助手、归档、稳定 ID、唯一有效主助手、可信侧校验和重启恢复；
4. 建立红→绿 oracle、风险相称的完整验证和真实 Electron 关闭/重启证据；
5. 形成候选 commit，交由全新高推理 Reviewer 独立复核；只有被复核的最终 HEAD 可由 Closer 推送。

## ROUTE / ATTEMPT LEDGER START

| 字段 | 值 |
| --- | --- |
| ROUTE_ID | foundation-f1-electron-sqlite-v1 |
| ATTEMPT | 1 |
| HYPOTHESIS | Electron 44.1.1 的可信 main 侧使用内嵌 Node 24.19.0 node:sqlite，配合严格 typed IPC，可在不扩大产品范围的前提下交付 F1 |
| CHANGE FROM PREVIOUS ATTEMPT | 首次正式候选；历史任务 002 是隔离资格验证，不是本路线的产品实现 attempt |
| FIRST BAD STATE | NONE；由 Executor 在第一次失败时记录最早可复现错误边界 |
| EVIDENCE DELTA | 本合同冻结正式依赖、文件、Schema、IPC、测试、Git 与审查闭环 |
| EXTERNAL CALLS / COST | Planner 仅只读查询官方 npm registry；无付费调用 |
| RESULT | CONTRACT_READY |

记账规则：

- 每次实现、Repair 或路线失败都追加 route、attempt、假设变化、first bad state、证据增量、命令/退出码和外部动作。
- 同一路线相同 first bad state 出现两次，立即进入全新 Route Assessment。
- 同一路线累计三次失败的实现/Repair 循环，也必须 Route Assessment。
- 相同命令只有存在瞬时故障证据时可原条件重试一次。
- 不设任务级总时限；仅设置命令与子进程技术超时。

## BASELINE AND HASH GUARD

### 精确现场

核验时间：2026-09-02，Asia/Shanghai。

~~~text
BASELINE_ID = mashiro-non-git-snapshot-2026-09-02-f1-planner-attempt-1
PROJECT_ROOT = D:\Mashiro
ROOT_ENTRIES = [.agents, doc]
GIT = absent
BRANCH = N/A
HEAD = N/A
REMOTES = N/A
WORKTREE = N/A
AGENTS.md = absent
package.json = absent
package-lock.json = absent
formal source/tests/dependencies = absent
~~~

本机只读观测：

- Windows build 26200，x64；PowerShell 7.6.4 x64。
- Git 2.51.2.windows.1；系统 init.defaultBranch=master，因此必须显式 git init -b main，不修改全局设置。
- Node v24.18.0；npm 11.16.0。
- npm registry 为 https://registry.npmjs.org/，strict-ssl=true；未发现项目/用户/全局 .npmrc。
- ELECTRON_RUN_AS_NODE、ELECTRON_MIRROR、ELECTRON_GET_USE_PROXY、NODE_OPTIONS、NODE_TLS_REJECT_UNAUTHORIZED 未设置。

### 权威输入 hash

| 输入 | SHA-256 |
| --- | --- |
| orchestrate-engineering-task-v3/SKILL.md | 004c8aa1e65eda1a835efd6123dad8398b3737de1cfc6de7696aa5df034a884b |
| references/modes.md | 98ef8f8e69ce1ac1698f1bc7ac59f9974a45a42c79b10cd236157ea4742b8a3d |
| references/role-contracts.md | 245016d1f7a9a9ac1d274653d45095f4ce3b3f9e9936d5e155dd77c4d9d98ab7 |
| references/prompter-mode.md | 6fdcd0f1b21463f58ad476f0641a3c762406dea38ba2a05c6714f21b4a39168f |
| initialize-engineering-project/SKILL.md | 6da98ffd6a8b53b35b0adcea5a4b69621b88b874c1243c5b327190b53f7eaa9e |
| foundation-contract.md | 7c217aa3912b4c01081cfd9b61c88e6a0c95cc961cc2499c638c5687cc57d8ce |
| stack-and-verification.md | 1b7b1b9388f1cc4b1548e30dbf5f956870a73517ea627969246ada351d90c407 |
| file-templates.md | a69e5ddaba445930363569804d34f33e23ef836ba59f885bb77d31556fc824b4 |
| 用户持续授权 pasted-text.txt | ed7a11299820ff4f2c928ce54e1466075cbeaf6f0fc510675fd3eb01c09d5b85 |
| state-reconciliation-2026-09-02.md | df5c965645cc175a29efb88878402ee6a30a716509df8787cee5ad382fb6e9d2 |

状态调和报告的实际 hash 已再次等于要求值 df5c965645cc175a29efb88878402ee6a30a716509df8787cee5ad382fb6e9d2。

### 七份用户文档保护表

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| doc/proposal.md | 11352 | a7ba993580de0b4bb8b655b8402c3684c2bede8b678b59c12c1ec05311b70a15 |
| doc/high-level-design.md | 15732 | 4a945375132abc233bb0c31ee3b3f1f01aae52743454c74df3c6597bd7ac6d69 |
| doc/detailed-design.md | 36688 | b85b63f05bac38ab2317b6c59822d095d8f61738665a6f3210d410682991f766 |
| doc/tasks/001-project-foundation.md | 16607 | a187a2ca25ce7a54dbed343cbd8f0c9897c6a6001c040b79b78678a999958818 |
| doc/tasks/002-node-sqlite-qualification.md | 19189 | 3602f4812d0ffe73f4a45f1c2c3be1a5cec33458afbac5d22e5e0dfbab07f27b |
| doc/tasks/003-provider-live-qualification.md | 7181 | 14001fc72bfaa839f47e57eb8ef787dd1a912399e324f23a2282231644333a4b |
| doc/tasks/progress.md | 6798 | a3d1551fe8ad6c4d10cd41325503edacb34fd34a7e519fdf4fef0fcbc0514fe4 |

Executor 在任何产品写入前必须重新计算以上七个 hash、state report hash、根条目、Git 状态及本合同文件 hash。Prompter 必须把 Planner 最终消息中的本合同 SHA-256 原样传给 Executor。出现任一漂移时：

1. 不写产品、不 init、不 reset、不覆盖；
2. 记录新旧 hash 与新增路径；
3. 返回 STATE_RECONCILIATION，不把未知改动当工程细节吞掉。

允许的新 baseline 差异只有本 Planner 报告已出现在既有 .agents/orchestration 路径；其他新增/删除均须调和。

### 原始资格与历史失败证据

| 证据 | SHA-256 | 解释 |
| --- | --- | --- |
| repair-002/command-results.json | 9cc05a91454817ce0d2d13a2c9b69bb5c21dcced2ee3d81b5dd86e73f00757f1 | 四个不同 Electron browser/main PID 均 exit 0 |
| task 002 src/main/index.cjs | db8f22282e31f085eb6d3e41f2735d7d228ce79e41a8ccec256121f1424b0881 | DEV 探针 |
| task 002 out/main/index.js | 92ff6565d33a369e585213874a8d414db8edb1533068a002ce9c6ec0c2eb0f7e | main-only BUILT 探针 |
| -003 executor-report.txt | 3bf979cf835492f5668bb1ab399438520fbe38ba6af499aa1b1eee276d3461a5 | 失败辅助审计报告 |
| -003 failure-analysis.json | b450eaca5df12be506a08d5df3e67488c3d7b2fdf311b87ee910364a73e0937a | first bad state |
| -003 sentinel-observer-timeline.jsonl | 9cb0c903aed90c4032ad22cc2c5da434bcc3dfe3db08b1e8ce7d1565b7440fe3 | Electron starts=0 |

## GOAL

用户在可读的 React 界面中能够：

- 创建助手；
- 切换当前助手；
- 重命名且稳定 ID 不变；
- 把 active 助手设为唯一主助手；
- 归档非主助手而不删除记录；
- 关闭应用并以新的 Electron 进程重开后恢复相同助手、主助手、当前选择和归档状态。

所有变更必须经过窄 preload API、main 侧严格运行时校验和单个 SQLite 事务；renderer 不接触 SQL、路径、凭据、shell、动态模块或任意网络能力。

## NON-GOALS

- 不实现 Provider、对话、记忆、Markdown 记忆、事项、提案、提醒、托盘、登录启动、凭据、安装器、更新器、卸载器、迁移器或 Release。
- 不创建这些未来模块的空目录、接口、表或占位代码。
- 不实现助手永久删除、恢复归档、自动多助手协商、头像/人设/模型配置。
- 不冻结安装后生产数据位置、自定义 data locator、PACKAGED、升级/卸载、多实例、网络盘、崩溃恢复或跨资源原子性。
- 不修改或集成 D:\AIbrowse、D:\Clender；本轮也不读取它们。
- 不读取或发送真实聊天、记忆、邮箱、日记或其他个人数据。
- 不运行 Toolhelp32 observer，不创建 -004。
- 不调用付费 Provider，不索取凭据，不 Release/deploy。

## AUTHORITATIVE SOURCES

按优先级：

1. 用户持续授权 pasted-text.txt 及本合同；
2. 当前 orchestrate-engineering-task v3 和 initialize-engineering-project 两套 skill；
3. proposal.md 的产品定位、F1 场景与非目标；
4. high-level-design.md 第 1、2、3、8、9、12 节；
5. detailed-design.md 第 2、3、4、5、10、11、12、13.2、13.6 节；
6. tasks/001、002、003 与 progress；旧授权文字仅是待调和历史，不覆盖用户新授权；
7. task 002 原始 repair-002 证据与独立 Reviewer PASS；
8. -003 原始报告只证明一条已关闭辅助路线失败。

依赖与运行时依据：

- 官方 npm registry 精确版本 metadata，2026-09-02 只读查询；
- Electron 44.1.1 与任务 002 的实际 process.versions；
- Electron 官方 security、contextBridge、ipcMain 和 BrowserWindow 文档；
- electron-vite 5.0.0 官方 package metadata；
- Node 24 node:sqlite 官方 API 文档。

若文档与现场冲突：设计说明应有行为；Git/实际文件/机器输出说明当前事实。不得用 progress 或 Agent 自述覆盖现场。

## CURRENT VERIFIED STATE

### 事实

- D:\Mashiro 当前非 Git，仅有 .agents 与 doc。
- 正式 manifest、lockfile、源码、测试、依赖、AGENTS.md、README.md 均不存在。
- F1 已由用户选择并授权。
- task 002 有历史独立 PASS，严格限定 Electron 44.1.1、内嵌 Node 24.19.0、SQLite 3.53.3、Windows x64、DEV_RUNTIME 和 main-only BUILT_PREVIEW。
- repair-002 四个 Electron 进程均 exit 0，独立重启后 committed value 存在、rollback rows=0、load rows=10000；权限失败 errcode=14，唯一约束 errcode=2067。
- -003 在 child PROCESS_OBSERVED 缺失处失败；Electron starts=0，loader、SQLite、四资格进程均 NOT RUN。
- 七份文档 hash 与状态调和报告一致；没有当前无法隔离的用户改动。

### 推断

- 保持 Electron 44.1.1、main/browser、node:sqlite、Windows x64 和小型同步事务，可继承 task 002 的限定资格进入 F1。
- F1 不需要 Provider Key、真实个人数据、Release 或新增产品决策。

### 历史失败的处理

~~~text
review-repair-003-console-user-003 =
HISTORICAL FAILED AUXILIARY AUDIT
DEFERRED / NON-BLOCKING
ROUTE CLOSED
DO NOT CREATE -004
~~~

该失败没有运行 Electron 或 SQLite，不能推翻 task 002，也不能阻塞 F1。

### 未验证

- 正式 npm ci、正式 React/preload/renderer、F1 Schema、项目测试/类型/lint/格式/build；
- 正式 Electron UI 启动和 F1 重启恢复；
- PACKAGED、安装器、迁移、多实例、崩溃恢复；
- push 认证与两个 remote 的当前写权限。

## DECISION OWNERSHIP

工程链自主决定且不得询问用户：

- 下述冻结依赖、目录、具体实现、测试夹具、技术超时、提交拆分；
- 修复、重构、替代内部实现和 Route Assessment；
- 已授权的项目内写入、依赖下载、commit 和 reviewed-head-only push；
- 非 acceptance 辅助审计的延期。

只有以下成为当前完成条件且无替代时才 USER_GATE：

- 会实质改变产品行为/长期数据语义的选择；
- 真实个人数据访问；
- 不可逆删除/迁移、全局系统修改、Release/deploy；
- 缺失且无法替代的凭据/外部权限；
- 无法隔离的未知用户改动。

本合同明确采用“不能归档当前主助手；先将另一个 active 助手设为主助手”的行为，因此助手归档接替不构成 USER_GATE。

## FIXED DECISIONS / INVARIANTS / RED LINES

- Electron + TypeScript + React；npm；精确 direct dependencies；提交真实 package-lock.json。
- Electron 必须为 44.1.1；main 实际 process.type=browser，内嵌 Node=24.19.0。改变 Electron、内嵌 Node、架构、关键 node:sqlite API 或执行位置，先重新资格验证。
- BrowserWindow 使用 contextIsolation=true、sandbox=true、nodeIntegration=false、webSecurity=true。
- preload 只暴露按用例命名的 typed API；禁止通用 execute/send/on、SQL、路径、shell、凭据或网络代理。
- main 对所有输入做 strict runtime validation，并从 DB 重新取得对象状态；renderer 传来的 isPrimary、isArchived、权限或版本结论不可信。
- 所有 SQL 参数化；每个 mutation 在 BEGIN IMMEDIATE / COMMIT 中完成，异常 ROLLBACK。
- ID 由可信 main 用 crypto.randomUUID 生成；显示名不是身份且允许重名。
- 无助手时 primary/current 均为 null；存在 active 助手时恰好一个有效 primary，current 必须指向 active 助手。
- 首个助手自动成为 primary 和 current；后续创建不改变 primary/current。
- set-primary 不隐式切换 current；switch 不改变 primary。
- 归档只允许 active 非 primary；归档 current 非 primary 时，同一事务先把 current 切回 primary 再归档。
- primary 归档返回 PRIMARY_ARCHIVE_FORBIDDEN，无任何持久化变化。
- 归档不删除；F1 不提供 DELETE API。
- rename 保持 ID；每次 mutation 增加行 version 和全局 state revision。
- 开发、测试数据均在仓库外；路径失败不静默回退或创建第二份空 DB。
- 不记录 SQL、路径、stack、正文、Key；UI 只收稳定错误码、短消息与 correlationId。
- 不使用 --force、--legacy-peer-deps、关闭 TLS、未知 registry/mirror、跳过/放宽测试或空脚本造绿。
- 不改变全局 Git/npm/代理/环境；ELECTRON_RUN_AS_NODE 只从测试子进程环境局部清除。

## DEPENDENCY AND TOOLCHAIN FREEZE

package.json 必须 private=true、type=module、main=./out/main/index.js、packageManager=npm@11.16.0；engines.node 为 >=24.15.0 <25，满足本机 Node 24.18.0 与 jsdom 的 Node 24 下限。所有版本写精确值，不使用 caret、tilde 或 latest。

### dependencies

| 包 | 精确版本 | 用途/兼容依据 |
| --- | ---: | --- |
| react | 19.2.8 | renderer UI |
| react-dom | 19.2.8 | peer 要求 react ^19.2.8 |
| zod | 4.5.4 | shared DTO strict runtime validation |

### devDependencies

| 包 | 精确版本 | 用途/兼容依据 |
| --- | ---: | --- |
| electron | 44.1.1 | 继承 task 002 限定资格；package engine Node >=22.12 |
| electron-vite | 5.0.0 | 已确认 v5；peer Vite ^5/^6/^7 |
| vite | 7.3.6 | task 002 已实际安装；满足 electron-vite 5 |
| @vitejs/plugin-react | 5.2.0 | peer 覆盖 Vite 7 |
| typescript | 5.9.3 | 满足 typescript-eslint >=4.8.4 <6.1 |
| @types/node | 24.13.3 | 与 Node 24 开发/内嵌主版本一致 |
| @types/react | 19.2.18 | React 19 types |
| @types/react-dom | 19.2.5 | peer @types/react ^19.2 |
| vitest | 4.1.11 | engine 支持 Node >=24；peer 支持 Vite 7 |
| jsdom | 30.0.1 | Node ^24.15；canvas peer 为 optional |
| @testing-library/dom | 10.4.1 | React/user-event/jest-dom 共同 peer |
| @testing-library/react | 16.3.3 | peer React 18/19、DOM ^10 |
| @testing-library/user-event | 14.6.7 | renderer 用户交互 |
| @testing-library/jest-dom | 7.0.1 | DOM 10、Vitest assertions |
| eslint | 10.9.1 | Node 24 支持 |
| @eslint/js | 10.0.1 | peer ESLint ^10 |
| typescript-eslint | 8.69.0 | peer ESLint 10、TS <6.1 |
| eslint-plugin-react-hooks | 7.1.1 | peer ESLint 10 |
| globals | 17.12.0 | 明确 main/preload/renderer/test globals |
| prettier | 3.9.6 | 格式检查 |

不添加 ORM、SQLite npm addon、electron-builder、Playwright、Provider SDK 或未来框架。若真实 lockfile 出现 engine/peer 冲突、非官方 resolved URL 或超出已解释范围的 install script，停止并 REPLAN；不得强制安装。

安装顺序：

1. 先完成 hash guard、.gitignore、.gitattributes、.editorconfig、.npmrc 和初始 Git baseline；
2. 创建精确 package.json；
3. 使用官方 registry 和项目内 cache 配置运行 package-lock-only + ignore-scripts，检查 lockfile v3、resolved host、engines/peers、hasInstallScript；
4. npm ci --ignore-scripts 后列出实际 install-script 包；仅 Electron/esbuild 等已解释、与依赖树一致的脚本可进入正常 npm ci；
5. npm ls --all 与 npm ls --depth=0 必须 exit 0；不复制 task 002 临时 lockfile。

## EXPECTED FILE SCOPE AND RESPONSIBILITIES

允许创建/修改：

### 工程与规则

- .gitignore：node_modules、out、dist、coverage、日志、env、cache、runtime data、sqlite/db 文件；不得忽略七份文档或 .agents。
- .gitattributes：项目级 LF；仅 Windows cmd/bat 用 CRLF；不改全局 core.autocrlf。
- .editorconfig、.npmrc、.node-version。
- package.json、package-lock.json。
- electron.vite.config.ts、tsconfig.json、tsconfig.node.json、tsconfig.web.json。
- eslint.config.mjs、.prettierrc.json、.prettierignore。
- AGENTS.md、README.md。

### 产品最小路径

- src/shared/assistant-contract.ts：DTO、Zod schemas、Result/error contract、IPC channel 常量。
- src/main/index.ts：app 生命周期、数据根、窗口与组合根。
- src/main/app/create-window.ts：BrowserWindow 安全选项、导航/窗口/权限拒绝。
- src/main/data/data-root.ts：可信 profile 与 dev/test 路径解析。
- src/main/data/schema.ts：v1 DDL、PRAGMA user_version 和 invariant triggers。
- src/main/data/sqlite.ts：DatabaseSync 打开、pragma、事务、关闭。
- src/main/assistant/assistant-repository.ts：参数化 SQL。
- src/main/assistant/assistant-service.ts：F1 用例与 revision/invariant。
- src/main/ipc/register-assistant-ipc.ts：窄 handler、错误映射、correlationId。
- src/main/testing/e2e-controller.ts：仅非 packaged + test env 的真实 Electron harness 控制；无产品 IPC。
- src/preload/index.ts、src/preload/index.d.ts：最小 contextBridge 与 renderer 类型。
- src/renderer/index.html：CSP 与 renderer 入口。
- src/renderer/src/main.tsx、App.tsx。
- src/renderer/src/features/assistants/AssistantPanel.tsx：列表、创建、切换、改名、设主、归档和错误状态。
- src/renderer/src/styles.css：最小可读样式，不建立视觉系统。

### 测试与验证

- tests/setup.ts。
- tests/unit/assistant-contract.test.ts。
- tests/integration/assistant-service.test.ts。
- tests/integration/assistant-ipc.test.ts。
- tests/renderer/AssistantPanel.test.tsx。
- scripts/electron-f1-harness.mjs：两次真实 Electron 进程、唯一 test root、证据汇总和精确 PID 超时回收；禁止 observer。

### 既有文档

- proposal.md、high-level-design.md、detailed-design.md、tasks/001、002、003、progress：只调和授权、冻结版本、当前 candidate/PASS 状态和实际证据；保留 task 002 限定 PASS 与 -003 历史失败。
- 本 Planner 报告只读，不由 Executor 改写。

超出以上范围、增加未来模块或修改技能/历史证据时返回 REPLAN。

## IPC DTO, VALIDATION, AND ERROR CONTRACT

唯一 channels：

~~~text
assistant:list
assistant:create
assistant:switch
assistant:rename
assistant:set-primary
assistant:archive
~~~

preload 只暴露：

~~~text
window.mashiro.assistants.list()
window.mashiro.assistants.create(input)
window.mashiro.assistants.switch(input)
window.mashiro.assistants.rename(input)
window.mashiro.assistants.setPrimary(input)
window.mashiro.assistants.archive(input)
~~~

没有通用 invoke/send/on。

输入全部是 strict object，未知字段拒绝：

- ListInput: protocolVersion=1。
- CreateInput: protocolVersion=1、displayName、expectedStateRevision。
- SwitchInput: protocolVersion=1、assistantId(UUID)、expectedStateRevision。
- RenameInput: protocolVersion=1、assistantId、displayName、expectedAssistantVersion、expectedStateRevision。
- SetPrimaryInput: protocolVersion=1、assistantId、expectedAssistantVersion、expectedStateRevision。
- ArchiveInput: protocolVersion=1、assistantId、expectedAssistantVersion、expectedStateRevision。

displayName 在 main 侧 trim、NFC normalize；1..80 Unicode code points；拒绝 NUL、C0 控制字符和仅空白。版本必须是安全非负/正整数。main 重新查询 assistant 和 state，不相信 renderer 快照。

返回统一 Result：

~~~text
success = { ok: true, data: AssistantSnapshot }
failure = {
  ok: false,
  error: {
    code,
    message,
    correlationId,
    retryable: false
  }
}
~~~

AssistantSnapshot 包含 assistants、currentAssistantId、primaryAssistantId、stateRevision；AssistantDto 包含 id、displayName、isArchived、createdAt、updatedAt、archivedAt、version。错误不得包含 stack、SQL、绝对路径或原始异常。

冻结 error code：

- INVALID_INPUT
- NOT_FOUND
- STALE_WRITE
- ASSISTANT_ARCHIVED
- PRIMARY_ARCHIVE_FORBIDDEN
- STORAGE_UNAVAILABLE
- STORAGE_INCONSISTENT
- INTERNAL_ERROR

## SQLITE SCHEMA, TRANSACTIONS, AND LIFECYCLE

DB 文件名 mashiro.sqlite；只由 main 打开。PRAGMA foreign_keys=ON、busy_timeout=5000；不引入 WAL 作为新资格变量。Schema v1 使用 PRAGMA user_version=1，初始化在事务中完成。

~~~sql
CREATE TABLE assistants (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (length(trim(display_name)) BETWEEN 1 AND 80)
);

CREATE TABLE assistant_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  primary_assistant_id TEXT NULL REFERENCES assistants(id) ON DELETE RESTRICT,
  current_assistant_id TEXT NULL REFERENCES assistants(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

INSERT INTO assistant_state(singleton, primary_assistant_id, current_assistant_id, revision)
VALUES (1, NULL, NULL, 0);
~~~

必须实现并测试等效 triggers/guards：

- primary/current 非 null 时必须引用 active assistant；
- 有 active assistant 时禁止把 primary/current 置 null；
- 首次 active insert 在同一事务设为 primary/current；
- 禁止归档 primary；
- 禁止在 current 未先转移时归档 current；
- 禁止 DELETE assistants。

Repository 每次 mutation：

1. BEGIN IMMEDIATE；
2. 检查 expectedStateRevision、assistant version、active 状态；
3. 执行参数化 mutation；
4. 增加 assistant version（适用时）与 state revision；
5. 重新读取完整 snapshot 并在 commit 前验证 invariant；
6. COMMIT；任一异常 ROLLBACK。

DB schema version 大于 1、DDL/trigger 缺失或 invariant 已损坏时返回 STORAGE_INCONSISTENT，停止写入；不得 reset、删除或另建空 DB。

## DEV / TEST DATA ISOLATION

- renderer 从不提供路径。
- 非 packaged development 使用 appData 下独立 Mashiro Development 根；在 app ready 前设置 userData/sessionData，业务 DB 位于其 data 子目录，不在仓库。
- test harness 创建 OS temp 下 mashiro-f1-e2e-UUID，使用唯一 runId 和可信子进程 env 传给非 packaged Electron。
- main 仅在 test 标记完整、路径为绝对路径、解析后仍是 OS temp 后代、结果文件仍在同一 test root 时接受 test root；否则拒绝启动。
- packaged 数据位置、locator、自定义安装 data 不在本合同验收，不声称已验证。
- 数据根不可写/不可用时明确失败；不回退到 cwd、仓库、默认空数据或第二位置。
- 测试结束只清理本 harness 创建且路径/marker/runId 三重匹配的 test root；保留一份脱敏结构化证据到测试输出目录，业务 DB、日志和 cache 不进入 Git。

## SECURITY AND ADVERSARIAL MATRIX

| 场景 | 必须结果 |
| --- | --- |
| 未知字段、错误协议版本、超长/控制字符名称 | INVALID_INPUT；DB 零变化 |
| forged/不存在 assistantId | NOT_FOUND；不泄露 SQL/路径 |
| stale assistant version 或 state revision | STALE_WRITE；无覆盖 |
| renderer 伪造 primary/archived 字段 | schema 拒绝未知字段 |
| SQL 注入式名称 | 参数化保存为普通文本；表与 invariant 完整 |
| React 名称包含 HTML | 文本转义；禁止 dangerouslySetInnerHTML |
| 连续/并发 set-primary | BEGIN IMMEDIATE 串行；一个最新 revision 成功，陈旧者失败；始终唯一 |
| archive primary | PRIMARY_ARCHIVE_FORBIDDEN；完整回滚 |
| archive current 非 primary | 同事务 current→primary 后归档；无中间破坏状态 |
| mutation 中途 SQLite 错误 | ROLLBACK；重开仍是提交前状态 |
| DB 路径不可写/Schema 损坏 | 明确 STORAGE 错误；不回退、不重置 |
| 任意 ipc channel/SQL/path/shell/network 请求 | preload 无能力；BrowserWindow/CSP/导航/permission 策略拒绝 |
| window.open 或外部导航 | setWindowOpenHandler deny；will-navigate 拒绝非允许 origin |
| 应用关闭后重启 | 新 PID 从同一 test root 恢复稳定 ID、primary/current、rename、archive |
| test root 路径穿越/非 temp | 启动失败；不写目标 |

BrowserWindow 还必须拒绝 permission request，限制 dev origin 为 electron-vite 实际本地 origin，built renderer 只加载本地资源；CSP 至少 default-src self、object-src none、base-uri none、frame-src none，并把 connect-src 限定为实际 dev origin/本地资源。renderer 不含任意 fetch client。

## IMPLEMENTATION PLAN

### Phase A — guard and recoverable initial baseline

1. 复核本合同、七文档、state report hash、根条目和 non-Git 事实。
2. 先创建 .gitignore、.gitattributes、.editorconfig、.npmrc、.node-version；此时仍不安装。
3. 复核换行、忽略规则和秘密扫描。
4. 执行 git init -b main；不改全局 init.defaultBranch。
5. 检查 remote 名；若同名 URL 不一致，停止，不静默 set-url。不存在时精确添加：
   - github = https://github.com/Molotov0cocktail/Mashiro.git
   - gitee = https://gitee.com/Molotov0coaktail/mashiro.git
6. 将既有 .agents、七文档和基础规则纳入首次 commit，保持文档字节/hash 不变；commit 建议为 chore: establish guarded Mashiro baseline。
7. 记录首次 commit SHA 为 RECOVERABLE_BASELINE_HEAD。不得 push。

### Phase B — real dependency baseline

1. 创建精确 package.json、构建/类型/lint/format config。
2. 按冻结安装流程生成真实 package-lock.json；检查 registry、integrity、engine、peer、script。
3. npm ci 恢复后记录 npm/node/electron 实际版本与 npm ls。
4. 任何 force、TLS/mirror 弱化或不明 install script 需求立即 REPLAN。

### Phase C — red oracle first

先写 shared contract、service/storage、IPC 和 renderer 测试，不写实现；运行聚焦命令，记录预期 exit 1 与具体失败断言。有效 RED 必须证明缺少/错误行为，不得只是路径拼错、测试框架未装或夹具崩溃。

至少覆盖：

- rename 后 ID 不变；
- first create 自动 primary/current，set-primary 后仍唯一；
- primary 归档被拒绝；非 primary archive 不删除；
- stale/malformed/forged input 在 main 拒绝且 DB 不变；
- close/reopen 恢复相同状态；
- UI create/switch/rename/set-primary/archive 调用窄 bridge 并显示错误。

### Phase D — minimum green implementation

按 shared contract → data/schema → repository/service → IPC → preload → React UI 顺序实现；每步运行最近聚焦测试。不得创建未来模块。

### Phase E — real Electron lifecycle

1. build 后由 scripts/electron-f1-harness.mjs 启动真实 Electron 44.1.1。
2. phase seed 在真实 renderer context 通过 window.mashiro bridge 创建两个助手、切换、rename、set-primary、archive 非 primary，验证安全选项。
3. Electron 正常 close/exit 0；记录直接 ChildProcess PID、runId、Electron/Node/process.type 和脱敏结果。
4. 用同一 test root 启动第二个新 PID；renderer 经 bridge list，验证 ID、名称、primary/current、archived row。
5. 不使用 Toolhelp32、CIM/WMI observer 或 -004。超时只回收直接记录且 runId 匹配的进程树。

### Phase F — candidate and documentation

1. 更新 AGENTS.md/README 与七文档，把旧“未授权”调和为实际授权和 candidate 事实；task 002 限定与 -003 历史失败不得抹掉。
2. 文档在 Reviewer 前只能写 CANDIDATE / REVIEW PENDING，不自称 PASS。
3. 运行完整验证、diff、安全、残留检查。
4. Executor 可形成一个或少量可回退 commit；最终功能 commit 建议 feat: deliver F1 assistant lifecycle。
5. 记录 CANDIDATE_HEAD；不得 push，不得宣告 PASS。

## TEST PLAN AND COMMAND ORACLES

package scripts 必须实际存在并与文档一致：

~~~text
npm run dev
npm run start
npm run test:focused
npm test
npm run test:electron
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run verify
~~~

最低执行：

1. RED：npm run test:focused，exit 非 0，记录精确断言。
2. GREEN focused：同命令 exit 0。
3. 全量：npm test，exit 0，无 skipped/todo 掩盖 acceptance。
4. 类型：npm run typecheck，exit 0，main/preload/renderer/shared/test 均覆盖。
5. lint：npm run lint，exit 0，max warnings=0。
6. format：npm run format:check，exit 0。
7. build：npm run build，exit 0，main/preload/renderer 均有实际输出。
8. real lifecycle：npm run test:electron，两个不同 Electron PID、两个 exit 0、同一 stable IDs 与 DB state。
9. npm ci clean restore：在可恢复 node_modules 状态下实际执行并重跑 verify；不得用 task 002 node_modules。
10. foundation validator：使用既有 validate_project_foundation.py D:\Mashiro，逐条解释 warning。
11. git diff --check、git status --short --branch、git remote -v、git diff RECOVERABLE_BASELINE_HEAD..CANDIDATE_HEAD --stat/--name-status。
12. 敏感/残留扫描：Key/token/private key、.env、sqlite/db、日志、cache、coverage、out、node_modules 均不进入 tracked files。
13. 真实手动/自动窗口 smoke：窗口加载、基础操作可完成、关闭干净；记录 NOT RUN 的人工项。

建议技术超时：

- registry metadata/单请求 30 秒，最多一次瞬时重试；
- package-lock/npm ci/Electron binary 每命令 10 分钟；
- focused/full/type/lint/format/build 各 5 分钟；
- 每个 Electron phase 45 秒，双 phase harness 总计 120 秒；
- 普通窗口 smoke 60 秒；
- Git remote/push 每个 60 秒，只有瞬时网络证据才重试一次。

超时只使该命令失败并产生 first bad state，不结束整个任务。

## ACCEPTANCE

全部满足才可 PASS：

- 七份原文在首次 baseline commit 前 hash 无漂移；未知文件未被覆盖。
- main 分支、初始可恢复 commit、两个精确 remote 均存在；无静默覆盖。
- package.json direct versions 与本合同完全一致；package-lock 真实生成、npm ci 和 npm ls 成功，无 force/legacy-peer/TLS/mirror 绕过。
- Electron 实际为 44.1.1、browser/main、Node 24.19.0、Windows x64。
- create/switch/rename/set-primary/archive 真实贯通 React/preload/main/SQLite。
- stable ID 在 rename 与独立 Electron 重启后不变。
- active assistants 存在时恰好一个 primary 且 current active；并发/陈旧写不破坏。
- primary archive 被可信侧拒绝；非 primary archive 不删除，重启后仍可列出 archived row。
- malformed、unknown、stale、forged 输入在 main 拒绝，错误合同稳定且不泄密。
- renderer 无 SQL/path/credential/shell/arbitrary IPC/arbitrary network authority。
- dev/test data 隔离在 repo 外；tracked files 无 DB/log/cache/credential。
- focused/full/type/lint/format/build/real Electron restart 全部通过。
- 文档命令、版本、授权、历史失败和现场一致；PACKAGED 等 NOT RUN 保留。
- Executor diff 只在 EXPECTED SCOPE；无 Provider/记忆/事项/提醒/installer 空框架。
- mandatory-fresh Reviewer 对精确 candidate HEAD 给出单一 PASS。
- 最终 push 的 HEAD 必须是最后一次 Reviewer 明确审核的同一 HEAD。

## REVIEWER / CLOSER / COMMIT AND PUSH DIVISION

1. Executor：
   - 创建 RECOVERABLE_BASELINE_HEAD 与 CANDIDATE_HEAD；
   - 运行合同验证并返回完整 evidence；
   - 不 push、不自判 PASS。
2. Candidate Reviewer（全新高推理）：
   - 不采信 Executor 自述；
   - 核对 baseline、完整 diff、代码、Schema、IPC、安全、真实 Electron 两 PID 和命令；
   - verdict 只能 PASS / REPAIR / REPLAN / BLOCKED。
3. Closer 只在 Reviewer PASS 且 HEAD 未变化时：
   - 更新 progress/task 为实际 Reviewer verdict、验证、commit、远程状态；
   - 不修改产品行为、不重写历史；
   - 如产生 docs-only closing commit，暂不 push。
4. Final Reviewer 必须 mandatory-fresh：
   - 若 Closer 产生 closing commit，检查 Candidate PASS HEAD..CLOSE_HEAD 仅是准确文档/状态，复核最终 HEAD 与必要命令，并对 CLOSE_HEAD 单独给 PASS；
   - 若 Closer 无需 commit，则确认 Candidate PASS HEAD 仍未变化。
5. Closer 恢复后仅把最终 Reviewer PASS 的精确 HEAD 推送到 github/main 与 gitee/main；两个 remote 独立记录成功/失败。
6. 不 force push、不重写审核历史、不创建 Release/deploy。某一 remote 失败不撤销另一 remote 成功；先诊断网络、认证、代理和远程分支，缺少不可替代凭据时才按已授权模板请求。

## FAILURE / ROUTE-SWITCH CONDITIONS

立即停止当前写入并 REPLAN/调和：

- baseline/hash、根内容或用户文档漂移；
- 出现已有 Git/remote 且与精确 baseline/URL 冲突；
- Electron、内嵌 Node、Windows 架构、node:sqlite API/执行位置偏离资格范围；
- 依赖必须 force/legacy-peer、关闭 TLS、未知 registry/mirror 或不可解释脚本；
- node:sqlite 在正式项目真实 Electron 中加载/事务/重开失败；
- invariant 只能靠 renderer 自律、弱断言或删除数据通过；
- broad IPC、renderer SQL/path/network/shell 权限成为实现前提；
- DB path 失败只能靠静默回退；
- E2E 只能靠 observer/-004 或静态网页替代真实 Electron；
- 同一 first bad state 第二次出现，或三次失败循环。

Reviewer 分类：

- REPAIR：路线和合同正确，一次有界修复可关闭；相同 finding 最多两轮。
- REPLAN：架构、依赖、Schema、oracle、测试夹具或路线必须变化。
- BLOCKED：仅不可替代的外部凭据、权限、事实或环境。
- 禁止复合 verdict。

-003 observer 失败不得成为本路线 first bad state，也不得触发 -004。

## STOP / USER-GATE CONDITIONS

只有以下情况返回用户：

- 当前 acceptance 必需但本合同未决定的实质产品/长期数据语义；
- 必须访问真实个人数据；
- 不可逆删除/迁移、全局系统修改、Release/deploy；
- 两 remote 推送所需凭据确实缺失且无替代；
- 未知用户改动无法隔离。

工程依赖、测试工具、内部 UX 细节、修复或替代路线不构成 USER_GATE。当前 USER_GATE=NONE。

## FINAL EVIDENCE REQUIRED FROM EXECUTOR

~~~text
ROLE / TASK / ROUTE / ATTEMPT
NON_GIT BASELINE + HASH GUARD RESULTS
RECOVERABLE_BASELINE_HEAD / CANDIDATE_HEAD
CANDIDATE COMMITS
FILES CHANGED + RESPONSIBILITIES
DIRECT DEPENDENCIES / LOCKFILE / INSTALL SCRIPT AUDIT
RED ORACLE: command, exit code, failing assertions
GREEN FOCUSED / FULL / TYPE / LINT / FORMAT / BUILD
REAL ELECTRON: exact commands, two PIDs, versions, exit codes, runId
RESTART SNAPSHOT: IDs, versions, primary/current/archive evidence
SECURITY / ADVERSARIAL / FAILURE-ATOMICITY MATRIX
DATA ROOTS / CLEANUP / RESIDUALS
DIFF / SCOPE / SECRET / GENERATED-FILE CHECK
GIT BRANCH / REMOTES / WORKTREE
EXTERNAL ACTIONS / NETWORK / PAID CALLS
NOT RUN / FAILURES / FIRST BAD STATE / EVIDENCE DELTA
REMAINING RISKS
RECOMMENDED VERDICT INPUT
STOP / REPLAN / USER-GATE
~~~

所有命令给出退出码；所有 NOT RUN 与失败保留。报告是 Reviewer 索引，不是 PASS。

## FINAL EVIDENCE REQUIRED FROM REVIEWER

- 精确 baseline、candidate/final HEAD、route/attempt；
- 完整 diff 与 scope；
- 独立命令和退出码；
- acceptance coverage；
- Schema/transaction/invariant、IPC、安全、数据隔离、真实 Electron/restart 判断；
- task 002 限定 transfer 与 -003 non-blocking 影响；
- secrets、残留、远程、外部动作；
- 单一 verdict 与下一动作。

## CHECKPOINT / CONTINUATION HINT

若最终 mandatory-fresh Reviewer 对最终 HEAD PASS 且 Closer 完成 reviewed-head-only 双 remote push：

1. 由全新高推理 Continuation Planner 读取最终 Git、权威设计、F1 证据和开放风险；
2. 优先选择能形成日常使用价值且不扩大个人数据的下一闭环；通常是 Provider 连接配置 + 合成 Chat Completions 本地协议闭环，再按需要索取真实端点凭据；
3. 不从本合同自动创建 Provider/记忆/事项/提醒代码；
4. 若 push 暂时失败但本地最终 HEAD 已复核，保留精确 continuation package，不重写历史。

Continuation decision：CONTINUE after reviewed F1 checkpoint；本 Planner 当前交接状态为 CONTRACT_READY。

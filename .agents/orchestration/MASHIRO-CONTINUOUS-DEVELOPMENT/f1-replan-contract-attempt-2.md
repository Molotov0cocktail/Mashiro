# MASHIRO-CONTINUOUS-DEVELOPMENT — F1 Replan Execution Contract (Attempt 2)

## REPLAN EXECUTION CONTRACT

```text
STATUS = CONTRACT_READY
PROGRAM_ID = MASHIRO-CONTINUOUS-DEVELOPMENT
PROJECT_ROOT = D:\Mashiro
TASK = 正式工程初始化 + F1 本地助手身份与持久化生命周期（从 attempt-1 现场续接）
PRODUCT_ROUTE_ID = foundation-f1-electron-sqlite-v1
ATTEMPT = 2
GIT_SUBROUTE = git-command-scope-safe-directory-v1
RISK = HIGH
REVIEW = mandatory-fresh
USER_GATE = NONE
```

本合同是只读 Replan Planner 对 attempt-1 合同的内容寻址修订合同。它不实现产品，不重设计 F1，也不删除、替换或弱化 attempt-1 的任何产品 scope、acceptance、测试、安全、授权或 continuation 要求。唯一实质路线变化是：继承现有 unborn `main` 与 `.git`，并把后续每一条直接 Git 调用改成对唯一 canonical path 的命令级 trust override。

## TASK / RISK / REVIEW

- 一个 Executor 作为产品文件单写者，从下述精确 unborn-main baseline 继续原 F1 合同；先建立可恢复 baseline commit，再恢复依赖、红→绿实现、完整验证和候选提交。
- 风险仍为 HIGH：首次 Git 基线、SQLite 持久化、可信 IPC、数据隔离和真实 Electron 关闭/重启均在范围内。
- Executor 不得自判 `PASS`，不得 push。候选必须交给全新、独立、高推理、`mandatory-fresh` Reviewer。
- Reviewer `PASS` 后的文档/状态收尾若形成新 commit，最终 HEAD 必须再由 `mandatory-fresh` Reviewer 明确审核。Closer 只能推送该精确 reviewed HEAD。
- 本合同只改变 Git 执行子路线；Electron、TypeScript、React、SQLite、IPC、UI、测试与产品行为继续执行 attempt-1 原合同。

## BASELINE

### Content-addressed snapshot

本 Planner 于 2026-09-02（Asia/Shanghai）独立核验：

```text
BASELINE_ID = mashiro-unborn-main-2026-09-02-f1-replan-attempt-2
PROJECT_ROOT_RESOLVED = D:\Mashiro
ROOT_ENTRIES = [.agents, .git, doc, .editorconfig, .gitattributes,
                .gitignore, .node-version, .npmrc]
GIT_EXECUTABLE = D:\Git\Git\cmd\git.exe
GIT_VERSION = 2.51.2.windows.1
BRANCH = main (unborn)
HEAD = N/A
INDEX = absent
HEAD_REFS = none
OBJECTS = none
REMOTES = none
TRACKED_FILES = none
EXPECTED_UNTRACKED = .agents, doc, five attempt-1 guard files
FORMAL_MANIFEST / LOCKFILE / SOURCE / TESTS / DEPENDENCIES = absent
AGENTS.md = absent
```

`.git/HEAD` 精确为 `ref: refs/heads/main`；`.git/config` 只有标准 `core` 初始化项。当前 root 与 `.git` owner 不同，但两处 ACL 均继承、非 protected。本合同不记录主体名或 SID，也不授权改变 owner/ACL。

使用精确命令级前缀的独立 Git 读取结果：

- `status --short --branch --untracked-files=all`：exit `0`，首行为 `## No commits yet on main`，只列上述预期内容；
- `symbolic-ref --short HEAD`：exit `0`，`main`；
- `rev-parse --verify HEAD`：exit `128`，`Needed a single revision`，符合 unborn branch；
- `show-ref --heads`：exit `1`、空；
- `remote -v`：exit `0`、空；
- `ls-files --stage`：exit `0`、空；
- system/global/local `safe.directory`：均无值；
- `GIT_CONFIG_COUNT`、`GIT_CONFIG_KEY_0`、`GIT_CONFIG_VALUE_0`、`GIT_CONFIG_GLOBAL`、`GIT_CONFIG_SYSTEM`、`GIT_CONFIG_NOSYSTEM`：均 unset。

### Required input hashes

| 输入 | SHA-256 |
| --- | --- |
| 用户持续授权 `pasted-text.txt` | `ed7a11299820ff4f2c928ce54e1466075cbeaf6f0fc510675fd3eb01c09d5b85` |
| `state-reconciliation-2026-09-02.md` | `df5c965645cc175a29efb88878402ee6a30a716509df8787cee5ad382fb6e9d2` |
| `f1-planner-contract-attempt-1.md` | `09f2aa1dc28bd493ec07c15bc919858f674a581f5292b1e60b106dce91525003` |
| `f1-executor-report-attempt-1.md` | `113264a3e774479e2785893ab5d2872ffd131687b58aa899d8f9223a6d5b4367` |
| `git-dubious-ownership-route-assessment.md` | `f2e0109af0f00695f6c3c46c6b1d94901169d976c47cb60399e1f72c567957fb` |

本合同最终 SHA-256 由 Prompter 在文件落盘后计算并原样传给 Executor；Executor 在任何写入前必须复核该 self-hash。

### Skill and reference hashes

| 输入 | SHA-256 |
| --- | --- |
| `orchestrate-engineering-task-v3/SKILL.md` | `004c8aa1e65eda1a835efd6123dad8398b3737de1cfc6de7696aa5df034a884b` |
| `references/modes.md` | `98ef8f8e69ce1ac1698f1bc7ac59f9974a45a42c79b10cd236157ea4742b8a3d` |
| `references/role-contracts.md` | `245016d1f7a9a9ac1d274653d45095f4ce3b3f9e9936d5e155dd77c4d9d98ab7` |
| `references/prompter-mode.md` | `6fdcd0f1b21463f58ad476f0641a3c762406dea38ba2a05c6714f21b4a39168f` |
| `initialize-engineering-project/SKILL.md` | `6da98ffd6a8b53b35b0adcea5a4b69621b88b874c1243c5b327190b53f7eaa9e` |
| `foundation-contract.md` | `7c217aa3912b4c01081cfd9b61c88e6a0c95cc961cc2499c638c5687cc57d8ce` |
| `stack-and-verification.md` | `1b7b1b9388f1cc4b1548e30dbf5f956870a73517ea627969246ada351d90c407` |
| `file-templates.md` | `a69e5ddaba445930363569804d34f33e23ef836ba59f885bb77d31556fc824b4` |

### Seven-document guard

| 文件 | SHA-256 |
| --- | --- |
| `doc/proposal.md` | `a7ba993580de0b4bb8b655b8402c3684c2bede8b678b59c12c1ec05311b70a15` |
| `doc/high-level-design.md` | `4a945375132abc233bb0c31ee3b3f1f01aae52743454c74df3c6597bd7ac6d69` |
| `doc/detailed-design.md` | `b85b63f05bac38ab2317b6c59822d095d8f61738665a6f3210d410682991f766` |
| `doc/tasks/001-project-foundation.md` | `a187a2ca25ce7a54dbed343cbd8f0c9897c6a6001c040b79b78678a999958818` |
| `doc/tasks/002-node-sqlite-qualification.md` | `3602f4812d0ffe73f4a45f1c2c3be1a5cec33458afbac5d22e5e0dfbab07f27b` |
| `doc/tasks/003-provider-live-qualification.md` | `14001fc72bfaa839f47e57eb8ef787dd1a912399e324f23a2282231644333a4b` |
| `doc/tasks/progress.md` | `a3d1551fe8ad6c4d10cd41325503edacb34fd34a7e519fdf4feff0fcbc0514fe4` |

### Attempt-1 guard and `.git` control hashes

| 文件 | SHA-256 |
| --- | --- |
| `.gitignore` | `84446f22350a9b637dfaec353b3cc21bb6b3e05140f740a72ca0c9d5eae677de` |
| `.gitattributes` | `efe461493a6ef790b2b3487228616d249e1abf09739157788b71537f073a642a` |
| `.editorconfig` | `c4421a779f505ef506cfe8d84f546eec5d66eab093bcb3810d3ff4dd80f16218` |
| `.npmrc` | `3fab341c1e1e231e2fdda511b488ec82cad72fb93251d526ad8163cffa80650a` |
| `.node-version` | `55075b5ec4e8b31936cbbc282b8829116d1fd48f2f2f1856dee592a6650700ce` |
| `.git/HEAD`（preflight） | `28d25bf82af4c0e2b72f50959b2beb859e3e60b9630a5e8c603dad4ddb2b6e80` |
| `.git/config`（pre-remote preflight） | `05becdb83bb897f6103c8d91439e2e9092144edf5b3955a746fce4975c12bfdc` |

除本合同作为 `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-replan-contract-attempt-2.md` 出现外，Executor 开场不得接受其他文件、hash、HEAD/ref/index/object/remote 或状态漂移。发现漂移立即按下述 STOP/REPLAN 处理，不覆盖、不 reset。

## INHERITS

### Normative inheritance

Executor 必须在任何写入、Git 配置或网络动作前完整读取并校验：

1. attempt-1 Planner 合同：`D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\f1-planner-contract-attempt-1.md`，SHA-256 `09f2aa1dc28bd493ec07c15bc919858f674a581f5292b1e60b106dce91525003`；
2. 本 attempt-2 Replan 合同及 Prompter 提供的最终 SHA-256；
3. Route Assessment：`git-dubious-ownership-route-assessment.md`，SHA-256 `f2e0109af0f00695f6c3c46c6b1d94901169d976c47cb60399e1f72c567957fb`；
4. attempt-1 Executor 报告、state report、用户持续授权及两套 skill/references，均按上表 hash；
5. 七份当前项目文档。

内容优先级：用户持续授权与最新用户约束 > 本合同明确的 attempt-2 delta > Route Assessment 的选定 Git 子路线 > attempt-1 Planner 合同的全部未覆盖内容 > 项目设计/任务文档。旧文档中的“未授权”文字仍是待调和历史，不覆盖用户持续授权。

`INHERITS` 是强制的内容寻址引用，不是摘要替代。若 attempt-1 原合同或 Route Assessment hash 不匹配，Executor 不得凭本合同摘要继续。

## ROUTE / ATTEMPT / LEDGER

### Frozen attempt ledger

| 字段 | attempt-1（冻结历史） | attempt-2（当前合同） |
| --- | --- | --- |
| PRODUCT_ROUTE_ID | `foundation-f1-electron-sqlite-v1` | 同左 |
| GIT_SUBROUTE | 普通仓库 Git 命令 | `git-command-scope-safe-directory-v1` |
| HYPOTHESIS | `git init -b main` 后普通 Git 可直接工作 | 对每条直接 Git invocation 显式信任唯一 `D:/Mashiro`，可在不持久改变信任/ACL 的情况下完成同一 F1 合同 |
| CHANGE | 建立五个 guard files 并初始化 `.git` | 继承现有 `.git`/guards；所有直接 Git 改为精确命令级 `-c` |
| FIRST BAD STATE | 普通 Git 在 sandbox 与 desktop/escalated 两个身份均报 `detected dubious ownership`、exit `128` | 精确带 `-c safe.directory=D:/Mashiro` 的同一 Git 操作仍报 ownership/trust，或读出不符合本 baseline 的 repo |
| EVIDENCE DELTA | 两身份重复同一失败；命令级 `-c` 诊断成功 | 待 Executor 验证首个合法 Git 写入、recoverable baseline、候选与后续角色复现 |
| EXTERNAL CALLS / COST | none | route-selection/planning none；F1 不需要 Provider 调用 |
| OUTCOME | 触发 Route Assessment；未形成 commit/candidate | 合同可交给 Executor |

attempt-1 的普通 Git first bad state 已出现两次，永久冻结为历史证据。不得再运行 bare repository Git 来“证明它仍失败”，也不得把遗漏 `-c` 后的预期 fail-closed 当作 attempt-2 路线失败而隐藏。

## PROVEN FACTS

- attempt-1 只创建了五个合同内 guard files 与 `.git`；没有 remote、index、ref、object、commit、manifest、依赖、源码、测试、产品数据或候选。
- 两个执行身份的普通仓库 Git 都在读取产品/remote 前被 ownership trust gate 拒绝，exit `128`。
- 首选 Git `2.51.2.windows.1` 与另一已安装 Git 的普通 status 都失败；两者带同一精确 `-c` 都成功。换 Git executable 不是修复。
- 当前首选 Git 带精确 `-c` 能一致读出 unborn `main`、空 remote、空 index、空 refs/objects。
- 临时进程级 `GIT_CONFIG_COUNT/KEY/VALUE` 探针也成功且已恢复 unset，但其可见性和清理证明弱于直接 `-c`，因此只保留为受控备选。
- system/global/local 均无持久 `safe.directory`；`.git/config`、global/system config、owner 和 ACL 未被 Route Assessment 修改。
- 七份用户文档和五个 guard files 与 attempt-1/Route Assessment hash 完全一致。
- task 002 的限定资格与历史 `-003` 辅助审计处理不变；Git trust 失败没有运行或推翻 Electron、SQLite、IPC 或任何 F1 acceptance。
- 当前没有需要用户决定的产品语义、凭据、个人数据、Release 或不可逆动作。

## OVERRIDES

以下是对 attempt-1 Planner 合同的穷举覆盖；未列内容一律不变：

1. `ATTEMPT` 从 `1` 改为 `2`；增加 `GIT_SUBROUTE=git-command-scope-safe-directory-v1`。
2. `BASELINE` 从 non-Git snapshot 改为本合同的现有 unborn `main` snapshot。原合同的“Git absent”“只允许 Planner report 新增”不再描述当前事实。
3. 原 Phase A 的“创建五 guard files”和 `git init -b main` 已由 attempt-1 完成。attempt-2 必须继承且逐 hash 核验；禁止再次创建/覆盖 guards，禁止再次 `git init`。
4. 继承现有 `.git`。禁止 reset、删除/移动/重建 `.git`、改 HEAD 指向来伪造 baseline，或用新的 clone/worktree 替代当前现场。
5. 原合同中每一条直接 Git 调用，无论只读或写入、无论由 Executor/Reviewer/Closer 执行，都语义替换为本合同 `GIT COMMAND POLICY` 的精确前缀；不能只在 status 上加而在 add/commit/diff/push 上遗漏。
6. recoverable baseline 的创建时点与内容改为本合同 `EXECUTION ORDER` Phase 1；仍必须在 manifest、依赖、red oracle 或产品写入之前完成。
7. 原 baseline/hash guard 增加 attempt-1 Executor、Route Assessment、五 guard files、`.git` 控制事实和本合同 self-hash；允许新增的唯一规划文件是本合同。
8. Git ownership/trust 的 first-bad-state 与 route switch 使用本合同规则；Electron/SQLite/IPC/依赖/测试/产品 route-switch 条件仍完全继承原合同。
9. Executor/Reviewer/Closer 的 FINAL EVIDENCE 增加本合同列出的 Git 路线证据；原证据字段不得删除。
10. 原合同任何看似允许普通 Git、换 Git、重 init 或持久配置来恢复的解释均由本合同显式禁止；这不改变其他工程行为。

## UNCHANGED CONTRACT

以下 attempt-1 合同章节完整、逐项、合取式继承；没有 acceptance 被删除：

- `GOAL`、`NON-GOALS`、`AUTHORITATIVE SOURCES`、`DECISION OWNERSHIP`；
- Electron `44.1.1`、main/browser、内嵌 Node `24.19.0` 与 task 002 限定资格边界；
- Electron + TypeScript + React + npm、全部精确 direct dependency 版本、真实 `package-lock.json`、engine/peer/install-script 审计；
- 完整 `EXPECTED FILE SCOPE AND RESPONSIBILITIES`，且不创建 Provider/记忆/事项/提醒/installer 等未来空框架；
- BrowserWindow `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`、`webSecurity=true`，窄 typed preload API 与无任意 IPC/SQL/path/shell/network authority；
- 六个 assistant channels、strict DTO、protocol/version/stale validation、统一 Result 与冻结 error codes；
- SQLite schema v1、参数化 SQL、`BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`、stable UUID、row version/state revision、唯一 active primary/current invariants；
- 首个助手自动 primary/current；create/switch/rename/set-primary/archive 的原精确语义；primary 不可归档，非 primary 归档不删除；
- 开发/测试数据根在仓库外、路径失败不回退、损坏/新版本 Schema 不 reset；
- 完整 security/adversarial/failure-atomicity matrix 与真实 Electron 两 PID 关闭/重启恢复；
- Phase B–F 的依赖、RED oracle、最小 GREEN 实现、真实 Electron lifecycle、文档与 candidate 形成；
- 所有 package scripts、RED/GREEN focused、full test、typecheck、lint、format、build、Electron restart、clean `npm ci`、foundation validator、diff/secret/residual checks；
- 原 `ACCEPTANCE` 的每一项，包括稳定 ID、唯一 primary、可信侧拒绝、归档不删除、数据隔离、完整验证、scope、mandatory-fresh PASS 与 reviewed-HEAD-only push；
- 原风险相称的技术超时、NOT RUN/失败诚实保留、无弱断言/跳过/force/TLS/镜像绕过；
- 原 `EXTERNAL ACTION POLICY`、Reviewer/Closer/Final Reviewer 分工与 Continuation Planner 要求。

当前外部动作政策继续原样生效：

```text
LOCAL_WRITE = allowed
GIT_COMMIT = allowed
GIT_PUSH = reviewed-head-only
DEPENDENCY_NETWORK = allowed
PAID_PROVIDER_CALLS = synthetic-only allowed; not required for F1
REQUEST_CREDENTIALS = allowed
RELEASE_DEPLOY = denied
PERSONAL_DATA_ACCESS = denied; ask only if genuinely required
SYSTEM_LEVEL_CHANGE = project-local allowed; global/system ask
```

## EXECUTION ORDER

### Phase 0 — mandatory opening verification; no writes

1. 完整读取并 hash 校验 `INHERITS` 的所有输入和本合同 self-hash。
2. `Resolve-Path D:\Mashiro` 必须精确得到 `D:\Mashiro`；不得从仓库、环境或 remote 动态生成 trust path。
3. 核验 root recursive inventory、七文档、五 guard files、`.git/HEAD`、`.git/config`、index/ref/object/remote/tracked 状态与本 baseline 完全一致；本合同是唯一允许新增文件。
4. 核验首选 executable 精确为 `D:\Git\Git\cmd\git.exe`、版本 `2.51.2.windows.1`；不得换另一套 Git 冒充修复。
5. 仅用精确命令级前缀核验 unborn `main`、空 remote/index/refs/objects、预期 untracked 内容；不运行 bare repository Git。
6. 核验 system/global/local `safe.directory` 仍无值，相关 `GIT_CONFIG_*` 常规环境仍 unset；只读核验不得写 optional lock。

任一文件或 Git 事实不符：STOP 写入，保留新旧证据并返回工程链 REPLAN/STATE_RECONCILIATION；不得“修正”现场以迎合合同。

### Phase 1 — create recoverable baseline before product work

1. 用精确 Git 前缀再次确认 `github`、`gitee` 名均不存在；存在任意 remote 或 URL 不同都 STOP/REPLAN，不 `set-url` 覆盖。
2. 用相同前缀精确添加：
   - `github=https://github.com/Molotov0cocktail/Mashiro.git`
   - `gitee=https://gitee.com/Molotov0coaktail/mashiro.git`
3. 分别执行 `remote get-url --all`，要求每个 remote 只有一个且逐字符等于合同 URL；不设置默认 push remote。
4. 在 recursive inventory 未漂移的前提下，只显式 stage 已核验的 `.agents`、`doc`、`.editorconfig`、`.gitattributes`、`.gitignore`、`.node-version`、`.npmrc`。禁止 `git add .`、`git add -A` 或 glob 吞入未知内容。
5. 检查 `ls-files --stage`、`diff --cached --name-status`、`diff --cached --check`、secret/generated/runtime-data 残留；确认文档和 guard hashes 与本合同一致。
6. 创建 `chore: establish guarded Mashiro baseline` commit；立即记录 `RECOVERABLE_BASELINE_HEAD`、branch、tree、status、remotes、system/global/local safe.directory 与常规 Git env 状态。
7. 首个合法写操作若出现 access denied/lock/ACL 错误，按新的 first bad state 处理；不得 `takeown`、`icacls` 或改安全配置。
8. 不 push baseline。

### Phase 2 — resume original Phase B dependency baseline

- 严格按 attempt-1 精确依赖表创建 `package.json` 和构建/类型/lint/format 配置。
- 按原先 package-lock-only/ignore-scripts 审计 → `npm ci --ignore-scripts` → 解释并允许必要脚本 → 正常 `npm ci` 顺序生成真实 lockfile；不得复制 task 002 临时 lockfile/node_modules。
- engine/peer、非官方 resolved host、不可解释 install script、force/legacy-peer、TLS/mirror 弱化仍立即 REPLAN。

### Phase 3 — original RED oracle

- 在实现前建立能区分旧/新行为的 service/storage、IPC、renderer 与重启 oracle。
- 至少证明 stable ID/rename、唯一 primary、archive-not-delete、trusted-side malformed/stale/forged rejection、restart recovery 与窄 UI bridge。
- 有效 RED 必须是预期行为缺失，不能是测试框架、路径或夹具崩溃。

### Phase 4 — original minimum GREEN implementation

- 按 shared contract → data/schema → repository/service → IPC → preload → React UI 顺序完成 attempt-1 的最小 F1 文件范围。
- 每步运行最近聚焦测试；不得创建未来模块、放宽测试或扩大 renderer authority。

### Phase 5 — original real Electron lifecycle

- build 后使用原 `scripts/electron-f1-harness.mjs` 契约启动真实 Electron `44.1.1` 两次。
- seed 与 verify 使用同一唯一 test root、不同 PID；经真实 renderer/preload/main/SQLite 完成并恢复 create/switch/rename/set-primary/archive 状态。
- 不用 Toolhelp32、CIM/WMI observer 或 `-004`；仅回收直接记录且 runId 匹配的进程。

### Phase 6 — full verification, candidate commits, and Executor handoff

1. 完成原合同 focused/full/type/lint/format/build/Electron restart/clean `npm ci`/foundation validator/window smoke/diff/secret/residual 全部验证。
2. 更新 `AGENTS.md`、`README.md` 与七文档为真实 candidate 状态；保留 task 002 限定 PASS、`-003` 历史失败和所有 NOT RUN，不在 Reviewer 前写 PASS。
3. 形成一个或少量可回退 candidate commits，记录 `CANDIDATE_HEAD` 与 `RECOVERABLE_BASELINE_HEAD..CANDIDATE_HEAD` 完整 diff。
4. 所有 Git status/add/diff/commit/log/show/remote 检查继续使用同一精确前缀。
5. Executor 不 push、不宣告 PASS，返回 attempt-1 原 FINAL EVIDENCE 加本合同新增证据。

### Phase 7 — mandatory-fresh review, close, final review, push

1. 全新 mandatory-fresh Candidate Reviewer 使用相同首选 Git 与精确前缀，独立核验 baseline、完整 diff、工作区、代码、Schema/IPC/security、两 PID Electron 与全部 acceptance；Executor 报告只作索引。
2. verdict 仅可 `PASS | REPAIR | REPLAN | BLOCKED`，分类规则完整继承原合同。
3. Candidate Reviewer `PASS` 且 HEAD 未变化后，Closer 可只做准确文档/状态收尾；若形成 closing commit，不得先 push。
4. Closer 形成新 commit 时，新的 mandatory-fresh Final Reviewer 必须审核最终 HEAD；无 closing commit 时也要确认 Candidate PASS HEAD 未变化。
5. Closer 恢复后，用同一精确 Git 前缀把最终 Reviewer 明确审核的同一 HEAD 推送到 `github/main` 与 `gitee/main`；不 force、不重写历史。两 remote 独立记录结果。
6. 任何角色的 Git 命令不得省略前缀。某一 remote 失败不撤销另一 remote 成功；先按原合同诊断网络/认证/代理/分支，只有缺失不可替代凭据时才按已授权模板请求。
7. Release/deploy 仍禁止。最终 PASS/close/push 后必须启动全新高推理 Continuation Planner；F1 PASS 不是持续开发停止点。

## GIT COMMAND POLICY

### Mandatory route A — every direct Git invocation

attempt-2、Reviewer 与 Closer 全链固定：

```powershell
$MashiroGit = 'D:\Git\Git\cmd\git.exe' # process-local convenience only
& $MashiroGit -c 'safe.directory=D:/Mashiro' <subcommand> <args>
```

规范展开形式等价于：

```text
git -c safe.directory=D:/Mashiro ...
```

强制规则：

- `D:/Mashiro` 必须是精确、大小写/字符固定、正斜杠 canonical path；禁止 `*`、通配符、父目录或动态拼接。
- 每条直接 Git 命令都带该 `-c`，包括 `--version`、config/status/branch/rev-parse/show-ref/remote/add/diff/commit/log/show/push。不得依赖上一命令或 shell 状态“继承信任”。
- 报告必须展开实际 executable、完整 `-c` 命令、退出码和关键输出；临时变量/函数不能隐藏真实 invocation。
- 只读检查可使用 `--no-optional-locks`；合法 add/remote/commit/push 是写入，不得伪装为只读。
- 不提交 host-specific wrapper，不添加 package script、Git alias、profile 或 CI trust 设置；不把绝对主机路径写成普通开发者命令。
- 不更换到 Codex bundled Git 或其他 Git 版本来绕过错误；若首选 executable/version 漂移，STOP/REPLAN。
- 禁止 `safe.directory=*`；禁止写入 local/global/system `safe.directory`；禁止持久环境变量；禁止修改 owner/ACL；禁止 `git init`、reset、删除/重建 `.git`。
- 允许的 `.git/config` 变化只包括两个授权 remote 的正常项目配置；commit/index/object/ref 是原合同必要的正常 Git 状态。

### Controlled route B — exceptional bounded child only

只有一个明确命名、合同内必要、内部调用 Git 且完全无法接收 route A 参数的非 Git 工具，才可由 Executor/Reviewer 先停止并论证后，在该单个有界 child process 中临时注入：

```text
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0=safe.directory
GIT_CONFIG_VALUE_0=D:/Mashiro
```

使用条件全部必须满足：

1. 注入前核验所有相关 `GIT_CONFIG_*` 均 unset；若已有值，不覆盖、不重编号；
2. 仅赋给该唯一 child process，不写项目脚本、profile、CI、用户/机器环境或普通测试命令；
3. `finally` 中恢复/清除，并在调用后证明常规环境再次全部 unset；
4. 报告唯一父命令、child scope、内部 Git 结果、前后环境；
5. 后续角色默认立即回到 route A。

若 B 不能限定或不能证明清理，进入 Route Assessment；不能落盘扩大 trust。

## FIRST-BAD / ROUTE SWITCH

### Attempt-2 ownership/trust guard

新的 route-specific first bad state：在 resolved root、executable、version 和参数都精确符合本合同，且同一 Git 操作显式携带 `-c safe.directory=D:/Mashiro` 时，仍返回 `detected dubious ownership`/其他 ownership-trust 拒绝，或无法识别预期 unborn-main/后续合同内 repo。

处理规则：

1. 首次出现立即停止后续 Git 写入；记录完整命令、exe/version、exit/stderr、root 与 `.git` owner 是否仍不同、`GIT_CONFIG_*`、system/global/local `safe.directory` 来源和直接 `.git` 控制事实。
2. 不无证据机械重试。只有瞬时故障或新增观测依据时，才允许同一精确操作做一次受控第二次尝试。
3. 带精确 `-c` 的同一 Git 操作两次仍报 ownership/trust：立即 Route Assessment；不得改成 `*`、持久 safe.directory、换 Git、改 owner/ACL 或重新初始化。
4. 忘记 `-c` 的 bare Git 失败是合同执行错误，不是 route A 失败；如实保留后修正一次。角色反复遗漏时替换 Executor，由新角色按同一合同接管。

### Immediate STOP/REPLAN without normal execution

满足任一项立即 STOP 写入并 REPLAN/STATE_RECONCILIATION：

- 本合同开场发现 HEAD/ref/index/object/remote/tracked/untracked 或任一文件/hash 状态与 BASELINE/report 不符；
- root 不再精确解析为 `D:\Mashiro`，或本合同不再是唯一预期新增文件；
- 首个合法 command-scoped Git 写操作出现 access denied/lock/ACL first bad state，且有界诊断不能说明安全恢复；同一新状态重复两次必须 Route Assessment；
- route A 写入后，后续角色即使使用相同前缀也不能读取/验证先前状态；
- 必需内部工具无法接受 A，且 B 不能限制到一个 child 或不能证明清理；
- 完成工作开始要求 wildcard、local/global/system trust 持久化、owner/ACL 改动、重新 init/reset/重建 `.git`；
- 原合同任一 Electron/Node/node:sqlite/依赖/IPC/Schema/oracle/test/数据隔离 route-switch 条件触发。

如果新证据证明只有 global/system 配置或 owner/ACL 修改才能继续，Executor 不得执行。先由全新 Route Assessment 穷尽替代路线；只有该系统级变化确为 acceptance 必需、无工程替代时，才形成真正的 `SYSTEM_LEVEL_CHANGE` USER_GATE。当前 route A 已有直接证据，因此当前 `USER_GATE=NONE`。

## FINAL EVIDENCE

Executor 必须返回 attempt-1 原 `FINAL EVIDENCE REQUIRED FROM EXECUTOR` 全部字段，并追加：

```text
ATTEMPT-2 CONTRACT PATH + SHA-256
RESOLVED PROJECT ROOT
RESOLVED GIT EXECUTABLE + VERSION
EVERY EXPANDED A-PREFIXED GIT COMMAND + EXIT CODE + KEY OUTPUT
OPENING ROOT / FILE HASH / HEAD / INDEX / REF / OBJECT / REMOTE GUARDS
SEVEN DOC + FIVE GUARD HASH RESULTS
OWNER-EQUALITY / ACL-PROTECTED BOOLEANS (NO ACCOUNT OR SID)
SYSTEM / GLOBAL / LOCAL safe.directory ABSENCE
NORMAL-PROCESS GIT_CONFIG_* UNSET BEFORE / AFTER
REMOTE ADD + EXACT URL VERIFICATION
EXPLICIT STAGING INVENTORY / CACHED DIFF / SECRET CHECK
RECOVERABLE_BASELINE_HEAD + TREE
CANDIDATE_HEAD + COMMITS + FULL DIFF
ANY ROUTE-B CHILD SCOPE + BEFORE/AFTER CLEANUP PROOF
CONFIRMATION: NO git init/reset/.git rebuild, NO owner/ACL change,
              NO persistent safe.directory, NO Git swap, NO push by Executor
```

还必须保留并报告原 F1 的依赖/lockfile/install-script 审计、RED/GREEN、focused/full/type/lint/format/build、真实 Electron 两 PID 与 restart snapshot、security/adversarial/failure-atomicity matrix、data roots/cleanup/residuals、文档/范围/秘密检查、所有失败/NOT RUN、remaining risks 与推荐 verdict input。

Reviewer 必须独立复现相同 Git 路线并核对所有原 acceptance；Reviewer 报告不能只引用 Executor 自述。Closer/Final Reviewer 必须给出 reviewed HEAD 等同性、收尾 commit（若有）、两 remote push 的精确命令/退出码/remote ref 结果，以及常规环境中没有 trust/env 残留。

## USER_GATE

```text
USER_GATE = NONE
```

当前 Git invocation、baseline sequence、依赖、实现、测试、提交拆分与路线切换均由工程链拥有。原合同的真实 USER_GATE 边界继续生效：必要产品/长期数据语义、真实个人数据、不可逆删除/迁移、缺失且不可替代的凭据/权限、无法隔离的未知用户改动、Release/deploy，以及经 Route Assessment 证明无替代而确需的 global/system/owner/ACL 安全修改。

远程认证尚未验证不构成当前门禁；只在 Closer 推送阶段实际缺少不可替代凭据时，按用户已授权的 credential request 模板一次性请求。不得提前把工程路线或系统配置偏好抛给用户。

## NEXT STATE

```text
NEXT STATE = CONTRACT_READY
PROMPTER ACTION = 将 attempt-1 原合同、attempt-1 Executor 报告、Route Assessment、
                  本合同及各自 SHA-256 原样交给新的 Executor attempt-2
EXPLORER = NOT REQUIRED
```

Executor 完成候选后进入 mandatory-fresh Reviewer；只有最终 reviewed HEAD 才由 Closer 推送。F1 关闭后由全新 Continuation Planner 继续 `continuous-until-user-gate`。

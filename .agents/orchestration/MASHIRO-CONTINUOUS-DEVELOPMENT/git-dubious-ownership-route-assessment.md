# Git Dubious Ownership Route Assessment

```text
PROGRAM_ID = MASHIRO-CONTINUOUS-DEVELOPMENT
ROLE = fresh high-reasoning Route Assessment / Diagnostician
PROJECT_ROOT = D:\Mashiro
PRODUCT_ROUTE_ID = foundation-f1-electron-sqlite-v1
FAILED_ATTEMPT = 1
NEXT_ATTEMPT = 2
SELECTED_GIT_SUBROUTE = git-command-scope-safe-directory-v1
VERDICT / NEXT STATE = REPLAN_ROUTE_READY
USER_GATE = NONE
```

本角色只做只读诊断与路线评估。除本报告外没有写产品、文档或 Git 状态；没有修改 `.git/config`、index、HEAD、refs、remote、ACL、owner、全局/系统 Git 配置或环境持久化；没有 commit、push、安装、网络或付费调用；没有访问个人数据、`D:\AIbrowse`、`D:\Clender`，也没有运行 `-004`。

## FAILED ROUTE SUMMARY

### 原始 attempt 账本

| 字段 | attempt-1 |
| --- | --- |
| ROUTE_ID | `foundation-f1-electron-sqlite-v1` |
| ATTEMPT | `1` |
| HYPOTHESIS | 标准 `git init -b main` 后，普通 Git 仓库命令可直接工作 |
| CHANGE | 建立项目级忽略、换行、Node/npm 规则并初始化 `.git` |
| FIRST BAD STATE | `git init -b main` 成功后，普通仓库命令在 sandbox 身份和 desktop/escalated 身份下均以 `detected dubious ownership`、exit `128` 停止 |
| EVIDENCE DELTA | 精确目录的命令级 `git -c safe.directory=D:/Mashiro ...` 只读命令成功；无全局配置修改；unborn `main`、无 commit/remote/index；七份文档 hash 未漂移 |
| EXTERNAL CALLS / COST | `NONE` |
| RESULT | `REPLAN`；同一 first bad state 已出现两次，禁止继续机械重试普通 Git |

### 失败链重建

1. non-Git、hash-guarded baseline 成立。
2. Executor 创建五个合同内 guard 文件并执行 `git init -b main`，exit `0`。
3. `.git` 由 sandbox 身份创建，而工作区根属于 desktop 身份，形成同一工作树内部 owner 不一致。
4. sandbox 身份不信任 desktop-owned worktree；desktop 身份不信任 sandbox-owned `.git`。两边的普通仓库命令均在读取 remote、代码或产品状态前退出 `128`。
5. 精确目录命令级配置绕过这一条 ownership trust gate 后，只读状态、branch、remote 和 index 查询均正常。

分类：这是本机多执行身份与 Git protected-configuration 信任边界的执行路线失败，不是仓库损坏、remote 问题、产品代码问题、task 002 资格失效或用户产品决策。

## PROVEN FACTS / UNKNOWN

### 已核验输入

以下内容已完整读取；指定 hash 在本轮重新计算并匹配：

| 输入 | SHA-256 |
| --- | --- |
| 用户持续授权 `pasted-text.txt` | `ed7a11299820ff4f2c928ce54e1466075cbeaf6f0fc510675fd3eb01c09d5b85` |
| `state-reconciliation-2026-09-02.md` | `df5c965645cc175a29efb88878402ee6a30a716509df8787cee5ad382fb6e9d2` |
| `f1-planner-contract-attempt-1.md` | `09f2aa1dc28bd493ec07c15bc919858f674a581f5292b1e60b106dce91525003` |
| `f1-executor-report-attempt-1.md` | `113264a3e774479e2785893ab5d2872ffd131687b58aa899d8f9223a6d5b4367` |

还完整读取了 `orchestrate-engineering-task` v3 的 `SKILL.md`、`modes.md`、`role-contracts.md`、`prompter-mode.md`，以及 `initialize-engineering-project` 的 `SKILL.md`、`foundation-contract.md`、`stack-and-verification.md`、`file-templates.md`。

### 当前工作区与 `.git` 机器事实

本轮独立只读核验得到：

- 根条目精确为 `.agents/`、`.git/`、`doc/`、`.editorconfig`、`.gitattributes`、`.gitignore`、`.node-version`、`.npmrc`。
- 当前 desktop 执行身份拥有工作区根，但不拥有 `.git`；根与 `.git` owner 不同。两处 ACL 均继承而非 protected ACL。本报告不记录账户名或 SID。
- `.git/HEAD` 精确为 `ref: refs/heads/main`。
- `.git/config` 只有标准 `core` 初始化项；没有 remote、hook 配置或 `safe.directory`。
- `.git/index` 不存在；`.git/refs` 文件数为 `0`；`.git/objects` 文件数为 `0`。
- 因此当前是 unborn `main`，没有 commit、对象、branch ref、staged entry 或 remote；不是待修复的历史仓库。
- system 与 global `safe.directory` 查询均为空、exit `1`；没有预存的信任例外。
- `GIT_CONFIG_COUNT`、`GIT_CONFIG_KEY_0`、`GIT_CONFIG_VALUE_0`、`GIT_CONFIG_GLOBAL`、`GIT_CONFIG_SYSTEM`、`GIT_CONFIG_NOSYSTEM` 在进程级注入实验前均未设置，实验结束恢复后也均未设置。

### Git 路线探针

所有 status 探针都禁用了 optional locks；本角色没有写 index 或仓库。

| 探针 | 结果 |
| --- | --- |
| 首选 Git `2.51.2.windows.1` 普通 `status --short --branch` | exit `128`，`detected dubious ownership` |
| 首选 Git 加 `-c safe.directory=D:/Mashiro` | exit `0`，`## No commits yet on main`，列出预期 untracked 内容 |
| Codex bundled Git `2.53.0.windows.3` 普通 status | exit `128`，相同 first bad state |
| Codex bundled Git 加相同 `-c` | exit `0`，与首选 Git 相同状态 |
| 首选 Git，临时 `GIT_CONFIG_COUNT/KEY_0/VALUE_0` 注入 | exit `0`，与命令级 `-c` 相同状态；随后环境恢复为 unset |
| `symbolic-ref --short HEAD`，带精确 `-c` | exit `0`，`main` |
| `rev-parse --verify HEAD`，带精确 `-c` | exit `128`，`Needed a single revision`；这是 unborn branch 的预期结果 |
| `show-ref --heads`，带精确 `-c` | exit `1`、空；与无 refs 一致 |
| `remote -v`，带精确 `-c` | exit `0`、空 |
| `ls-files --stage`，带精确 `-c` | exit `0`、空 |

这组结果证明：更换已安装 Git 版本不会改变 ownership trust 判定；真正起作用的是 protected command scope 中对唯一、精确目录的显式信任。

### 既有内容完整性

七份用户文档仍与 Planner baseline 完全一致：

| 文件 | SHA-256 |
| --- | --- |
| `doc/proposal.md` | `a7ba993580de0b4bb8b655b8402c3684c2bede8b678b59c12c1ec05311b70a15` |
| `doc/high-level-design.md` | `4a945375132abc233bb0c31ee3b3f1f01aae52743454c74df3c6597bd7ac6d69` |
| `doc/detailed-design.md` | `b85b63f05bac38ab2317b6c59822d095d8f61738665a6f3210d410682991f766` |
| `doc/tasks/001-project-foundation.md` | `a187a2ca25ce7a54dbed343cbd8f0c9897c6a6001c040b79b78678a999958818` |
| `doc/tasks/002-node-sqlite-qualification.md` | `3602f4812d0ffe73f4a45f1c2c3be1a5cec33458afbac5d22e5e0dfbab07f27b` |
| `doc/tasks/003-provider-live-qualification.md` | `14001fc72bfaa839f47e57eb8ef787dd1a912399e324f23a2282231644333a4b` |
| `doc/tasks/progress.md` | `a3d1551fe8ad6c4d10cd41325503edacb34fd34a7e519fdf4fef0fcbc0514fe4` |

五个 attempt-1 guard 文件已逐字只读检查，内容符合 Planner Phase A，hash 如下：

| 文件 | SHA-256 | 判断 |
| --- | --- | --- |
| `.gitignore` | `84446f22350a9b637dfaec353b3cc21bb6b3e05140f740a72ca0c9d5eae677de` | 排除依赖、构建/测试输出、日志、env、SQLite/DB 与 cache；未忽略文档或 `.agents` |
| `.gitattributes` | `efe461493a6ef790b2b3487228616d249e1abf09739157788b71537f073a642a` | LF 默认，`.cmd/.bat` CRLF；项目级，不改 global `core.autocrlf` |
| `.editorconfig` | `c4421a779f505ef506cfe8d84f546eec5d66eab093bcb3810d3ff4dd80f16218` | UTF-8/LF/2 spaces；Markdown 与 Windows script 例外合理 |
| `.npmrc` | `3fab341c1e1e231e2fdda511b488ec82cad72fb93251d526ad8163cffa80650a` | 官方 registry、`strict-ssl=true`、项目 cache；无凭据 |
| `.node-version` | `55075b5ec4e8b31936cbbc282b8829116d1fd48f2f2f1856dee592a6650700ce` | `24.18.0`，与合同机器基线一致 |

结论：这些文件与现有 `.git` 可以安全继承。重新初始化不会修复跨身份 trust 判定，反而会无意义地重写模板元数据；删除、reset、重新 init、takeown 或 ACL 修改均不需要且不允许。

### UNKNOWN / NOT RUN

- 本角色按只读边界没有用路线 A 执行 `remote add`、`add`、`commit` 或 `push`；所以“通过 ownership gate 后，两种身份均有完成所有写操作所需 ACL”仍需由 Executor attempt-2 以第一条合法写命令验证。
- 本轮普通 sandbox 进程启动器在命令启动前报 `helper_unknown_error: setup refresh had errors`，没有进程退出码、没有 Git 产品状态。独立辅助 agent 遇到同一工具层错误。本轮改用获批的只读 desktop PowerShell取得上述独立证据。该工具错误与 Git first bad state 不同，登记为 tooling `NOT RUN / DEFERRED / NON-BLOCKING`，不得触发 USER_GATE 或 `-004`。
- remote 认证、网络与写权限仍未验证；当前连 remote 都尚未配置。这是原合同后续阶段事实，不影响本次路线选择。
- 尚未证明某个未来第三方工具是否会在内部调用 bare `git` 且不能接受 `-c`；当前已知 Executor、Reviewer、Closer 的直接 Git 命令都可显式传参。

## ACCEPTANCE IMPACT

- 该失败直接阻塞“建立可恢复 Git baseline、配置 remote、形成候选 commit”这部分 foundation acceptance，因此不能简单降级为完全无关的附加审计。
- 它发生在依赖安装、red oracle、Electron、SQLite 与产品代码之前，不否定 F1 设计、task 002 的限定资格或任何产品行为 acceptance。
- 当前仓库没有 commit/index/remote，也没有半写入产品实现；安全恢复成本仅是选择一致的 Git invocation strategy，而不是回滚或重建。
- 路线 A 已在两套 Git 上直接证明能越过唯一已知 trust gate，同时保持系统/global policy 不变，足以形成 attempt-2 合同；不需要 Explorer 或用户选择。

## ROUTE OPTIONS

| 路线 | 机制与直接证据 | 安全、可复现与传递性 | 决定 |
| --- | --- | --- | --- |
| A. 每条 Git 命令显式 `-c safe.directory=D:/Mashiro` | 两套 Git 的 status 均 exit `0`；命令参数在日志中可见 | 只在单次 invocation 对唯一绝对路径建立信任；遗漏时 fail closed；Executor/Reviewer/Closer 可逐命令原样复现；不持久化 | **选择** |
| B. 进程级临时 `GIT_CONFIG_COUNT/KEY/VALUE` | 本轮 status exit `0`，结束后环境恢复 unset | 同样不落盘，但对子进程树隐式生效，容易与既有 `GIT_CONFIG_COUNT` 编号冲突，日志可见性和清理证明弱于 A | 不作默认；仅给无法接受 `-c`、且确需内部调用 Git 的单个有界子进程作受控备选 |
| C. 使用另一已安装 Git | Git `2.51.2` 与 `2.53.0` 的普通 status 均 exit `128`，同一错误 | trust 判定未因版本改变；只换 executable 没有证据价值 | 拒绝 |
| D. 修改 global/system `safe.directory` | 精确路径理论上可持久放行；当前两级均没有该配置 | 改变用户或系统长期安全状态；用户政策为 global/system 修改 `ask`；`safe.directory=*` 更是明确禁止；存在 A，无必要形成门禁 | 拒绝，不向用户升级 |
| E. 修改目录/仓库 owner 或 ACL | owner 不一致已证实；ACL 本身不是 Git owner trust 等价物 | 对一方对齐 owner 仍不能同时让另一执行身份成为 owner；`takeown`/`icacls` 是安全/系统级、持久且可能难恢复；也不能假定授权 | 拒绝，不向用户升级 |

补充：把 `safe.directory` 写入 `.git/config` 既不是有效的自举信任方案，也不应让一个尚未受信的仓库自行宣告安全；本路线禁止 local/global/system 持久化该键。

## RECOMMENDED ROUTE

### Route identity and hypothesis

```text
PRODUCT_ROUTE_ID = foundation-f1-electron-sqlite-v1
ATTEMPT = 2
GIT_SUBROUTE = git-command-scope-safe-directory-v1
HYPOTHESIS = 对每个直接 Git invocation 显式信任唯一、已由 hash/ownership/state guard 核验的 D:/Mashiro，可在不修改持久配置或 ACL 的前提下完成 baseline、candidate、review、close 和 push
CHANGE_FROM_ATTEMPT_1 = 不再运行 bare repository Git；所有直接 Git 命令改为 exact command-scope override
EXTERNAL CALLS = NONE at route-selection time
```

### 冻结 invocation convention

attempt-2 全链固定首选 executable：

```powershell
$MashiroGit = 'D:\Git\Git\cmd\git.exe' # 2.51.2.windows.1
& $MashiroGit -c 'safe.directory=D:/Mashiro' <subcommand> <args>
```

规则：

1. `D:/Mashiro` 是合同给定、PowerShell 只读解析后必须精确等于 `D:\Mashiro` 的路径；不得从仓库内容、环境输入或 remote 动态拼接。
2. 禁止 `safe.directory=*`、通配符、父目录信任、global/system/local 写入、Git alias 或持久环境变量。
3. 只读 status/diff/inspection 可再加 `--no-optional-locks`；需要写 index/config/object/ref 的合法 Git 命令不得被伪装成只读。
4. 每个角色报告必须记录 resolved executable、`git --version`、展开后的完整 `-c` 命令、退出码和关键输出；不能只写一个隐藏参数的 wrapper 名。
5. 若某个明确命名的非 Git 工具内部必须调用 Git、且没有参数通道，才可在该单个 bounded child process 中临时设置：
   - `GIT_CONFIG_COUNT=1`
   - `GIT_CONFIG_KEY_0=safe.directory`
   - `GIT_CONFIG_VALUE_0=D:/Mashiro`
   使用前确认这些变量均未设置，结束后在 `finally` 恢复/清除并记录前后状态。不得把它写入 project script、profile、CI、用户/机器环境或普通测试命令。

### 是否持久化 wrapper

不提交 Git wrapper、不添加 package script、不写 Git alias，也不把 host-specific absolute path冒充项目的普通开发命令。

- 直接 Git 操作只由 Executor、Reviewer、Closer 等 agent 在当前主机使用显式 A 前缀。
- agent 可在单次 PowerShell 进程中定义临时变量/函数减少输入，但报告必须展开真实 executable 与 `-c`。
- 路线约定持久化在本 Route Assessment、attempt-2 Contract 与角色证据中，而不是可执行 wrapper 中。
- 普通开发者命令仍是标准 Git；当前混合 owner 工作区内 bare Git 失败属于已知本机限制，不应污染可移植项目接口。

### attempt-1 现场继承

必须继承现有 `.git` 和五个 guard 文件；禁止重新 `git init`、reset、删除 `.git`、改 owner/ACL 或覆盖现有文件。

Executor 写入前重新核对：

1. 本报告、Planner、Executor、state report 的 hash；
2. 七文档和五 guard 文件的上表 hash；
3. 根条目与当前清单一致，无未知新增/删除；
4. `.git/HEAD` 为 `ref: refs/heads/main`；config 无 remote；index 不存在；refs/objects 为空；
5. 使用路线 A 的 status 为 unborn `main` 且只有预期 untracked 内容；route A 的 `remote -v` 与 `ls-files --stage` 为空。

不要为了“证明仍失败”再次运行 bare repository Git。它的预期 exit `128` 已有两次原始证据和本轮两版本复现；继续运行不产生新证据。

### FIRST-BAD-STATE GUARD

attempt-2 的 route-specific first bad state 定义为：

```text
在根路径、executable、version 和命令参数均符合本合同，且显式携带
-c safe.directory=D:/Mashiro 时，第一条只读仓库命令仍返回
detected dubious ownership、无法识别预期 unborn main，或读取出与 guard 不符的 repo。
```

处理：

- 首次出现即停止后续 Git 写入，记录 exact command/exe/version/exit/stderr、当前 `GIT_CONFIG_*` 是否设置、root 与 `.git` owner 是否仍按预期不一致，以及 system/global `safe.directory` 来源；换一个只读观测点，不原条件机械重试。
- 同一 first bad state 在路线 A 下第二次出现，返回新的 Route Assessment；不得转而写 global/system、使用 `*` 或改 ACL。
- 忘记添加 `-c` 导致 bare Git 预期失败，是合同执行错误，不是路线 A 的失败；修正命令并在报告中保留该失败。若角色反复遗漏，停止该 Executor 并由新角色按同一合同接管。
- 若显式 `-c` 已越过 trust gate，但首个合法写操作出现 access denied/lock/ACL 错误，这是一个新的 first bad state。只读诊断权限与 owner 后再决定路线；不得自行 `takeown`/`icacls`。相同新状态重复两次才进入 Route Assessment。

### ROUTE-SWITCH CONDITIONS

满足任一项时停止 attempt-2 的 Git 子路线并重新评估：

- 路线 A 的 exact command 在相同边界两次失败且无证据增量；
- 必需工具无法接受 A，且受控 B 也不能限定到单一 child process 或不能证明清理；
- 继续要求 wildcard、global/system/local 持久配置、owner/ACL 修改或其他安全弱化；
- command-scoped 写入产生后续角色即使带同一 `-c` 也无法读取/验证的混合权限状态；
- baseline hash、根条目、HEAD/index/ref/remote 或未知用户内容漂移；
- 工作区真实路径不再精确为 `D:\Mashiro`。

其他依赖、Electron、SQLite、IPC、测试或产品 first bad state 继续服从原 Planner Contract，不与 Git ownership route 混为一谈。

### 创建 recoverable baseline 的时点

guard 全部通过后，在任何 manifest、依赖、red oracle 或产品写入之前：

1. 用路线 A 再确认 remote 名均不存在。
2. 用路线 A 精确添加：
   - `github=https://github.com/Molotov0cocktail/Mashiro.git`
   - `gitee=https://gitee.com/Molotov0coaktail/mashiro.git`
   不得 set-url 覆盖已有值。
3. 用路线 A 分别 `remote get-url --all`，要求每个只有合同 URL。
4. 只显式 stage 已核验的 `.agents`、`doc`、五个 guard 文件；不要用不经 inventory guard 的宽泛 glob 吞入未知内容。
5. 用路线 A 检查 `ls-files --stage`、`diff --cached --name-status`、`diff --cached --check`，并完成 secret/generated-file scan。
6. 创建原合同建议的 `chore: establish guarded Mashiro baseline` commit，立即记录 `RECOVERABLE_BASELINE_HEAD`、branch、status、remote 与 exact commit tree。
7. baseline commit 前不安装依赖、不写产品；baseline commit 后继续原 Planner Phase B–F。Executor 不 push；Reviewer 未 PASS 前不得声称候选完成。

### Reviewer / Closer 精确复现

- Reviewer 从报告重新解析 `D:\Mashiro`，使用同一 executable 与逐命令 A 前缀独立核对 baseline、HEAD、index、refs、remotes、完整 diff、status 与验证结果；不得采信 Executor wrapper 或隐式环境。
- Reviewer 核对 system/global `safe.directory` 仍为空，仓库/local config 未持久写入该键，且 `GIT_CONFIG_*` 在角色常规环境中未设置。
- Closer 对 commit、status、remote 和最终 push 也使用同一 A 前缀；push 只针对 Reviewer 明确审核的精确 HEAD，不 force、不重写历史。
- 若任何角色使用受控 B，报告必须列出调用它的唯一父命令、child scope、注入前/后 unset 证明和所有内部 Git 结果；下一角色默认回到 A。

## DEFERRED / NON-BLOCKING RISKS

- owner 不一致会继续存在；这正是 fail-closed bare Git 的预期。A 只在每次明确 invocation 中信任唯一项目根，不把其他仓库或全局 policy 变安全。
- 当前工作区外的人工 GUI/IDE Git 集成若不能传 `-c`，可能仍报 dubious ownership。它不属于 F1 acceptance；不得因此提交 wrapper 或改 global/system。需要人工操作时可使用同一显式命令，或在最终已推送后从正常单一 owner 环境重新 clone。
- 首个 command-scoped Git 写操作的 ACL 结果仍待 Executor 验证；这是有界工程未知，不是 USER_GATE。
- remote 认证、网络和双 remote push 仍待原合同的后续阶段验证。
- sandbox process launcher 的 `setup refresh` 错误是当前工具层非产品限制；它没有改变仓库证据。若后续仍存在，Prompter可替换执行 agent或使用平台允许的等价执行上下文，不应重开 dubious-ownership 路线。
- 此 exact-path route 只适用于当前 `D:\Mashiro` checkout；迁移目录、主机或重新 clone 后必须重新观察 ownership，而不是复制 `safe.directory` 假设。

## EXPLORER CONTRACT

```text
NOT REQUIRED
```

理由：A、B、C 已有可区分的直接只读证据；D/E 的代价和授权边界也明确。剩余未知是 attempt-2 第一条合同内 Git 写操作是否拥有 OS ACL，而该动作本来就是 Executor 建立 recoverable baseline 的必要、可恢复步骤。为它另建写入 spike 会复制同一动作且降低单写者清晰度。

## REPLAN EXECUTION CONTRACT INPUT

```text
TASK
Resume formal foundation + F1 from the existing unborn-main attempt-1 state.

PRODUCT ROUTE / ATTEMPT
foundation-f1-electron-sqlite-v1 / attempt-2
GIT_SUBROUTE = git-command-scope-safe-directory-v1

BASELINE
PROJECT_ROOT = D:\Mashiro
ROOT_ENTRIES = [.agents, .git, doc, .editorconfig, .gitattributes,
                .gitignore, .node-version, .npmrc]
BRANCH = main (unborn)
HEAD = N/A
INDEX = absent
REFS = none
OBJECTS = none
REMOTES = none
TRACKED FILES = none
EXPECTED UNTRACKED = .agents, doc, five guard files
FORMAL MANIFEST / SOURCE / TESTS / DEPENDENCIES = absent

AUTHORITATIVE SOURCES
- Current orchestration and initialization skills and required references
- User continuous authorization, SHA-256
  ed7a11299820ff4f2c928ce54e1466075cbeaf6f0fc510675fd3eb01c09d5b85
- State report, SHA-256
  df5c965645cc175a29efb88878402ee6a30a716509df8787cee5ad382fb6e9d2
- Attempt-1 Planner Contract, SHA-256
  09f2aa1dc28bd493ec07c15bc919858f674a581f5292b1e60b106dce91525003
- Attempt-1 Executor report, SHA-256
  113264a3e774479e2785893ab5d2872ffd131687b58aa899d8f9223a6d5b4367
- This Route Assessment and its content hash supplied by Prompter
- Seven document hashes and five guard-file hashes in this report

CURRENT VERIFIED STATE
- Worktree root and .git have different owners in the multi-identity host.
- Bare Git predictably fails ownership trust.
- Both installed Git versions succeed with exact command-level
  -c safe.directory=D:/Mashiro.
- Process-env injection also succeeds but is not the default route.
- No persistent safe.directory exists; global/system/project config and ACL were not changed.
- Existing .git and guard files are safe to inherit; do not reinitialize.

DECISION OWNERSHIP
- Git invocation, baseline sequence and bounded diagnostics are engineering-chain decisions.
- Global/system configuration and owner/ACL changes remain ask/system-level, but are not
  required and must not be proposed while route A is viable.
- USER_GATE = NONE.

FIXED GIT DECISIONS / RED LINES
- Use D:\Git\Git\cmd\git.exe 2.51.2.windows.1 for the whole attempt.
- Every direct repo Git command carries -c safe.directory=D:/Mashiro.
- Never use safe.directory=*, wildcard, global/system/local persistence, alias,
  profile, committed wrapper, owner/ACL mutation, reset, .git deletion or re-init.
- Keep all failures and exit codes; omission of -c fails closed and is not hidden.
- B environment injection is limited to one named child process that cannot accept A,
  with before/after unset proof.

IMPLEMENTATION PLAN DELTA
0. Re-read and hash-guard actual attempt-1 state using only route A for repo Git.
1. Add the two exact remotes without overwrite; explicitly stage known files; inspect staged
   state/secrets/diff; create and record RECOVERABLE_BASELINE_HEAD before any product work.
2. Resume the original Planner Contract at Phase B. Dependency freeze, F1 scope, red oracle,
   SQLite/IPC/security design, Phase C-F, validation and Reviewer/Closer division remain unchanged.
3. All later Executor/Reviewer/Closer Git evidence uses the same expanded A prefix.

FIRST-BAD-STATE GUARD
The first exact A-prefixed read-only command cannot establish the expected unborn-main state,
or still reports dubious ownership. Stop before writes, capture discriminating evidence, and
do not fall through to persistent config/ACL changes.

ROUTE-SWITCH
- Same A-prefixed first bad state twice without evidence delta;
- required internal Git cannot be scoped with A or bounded B;
- continued work would require wildcard/persistent trust or ownership/ACL mutation;
- mixed permissions prevent a later A-prefixed role from verifying prior writes;
- any hash/state/user-content drift.

ACCEPTANCE DELTA
- A recoverable initial commit exists before dependency/product writes.
- Both remote names/URLs are exact and non-overwritten.
- Every Git evidence command is reproducible with the recorded executable and -c prefix.
- No persistent safe.directory or GIT_CONFIG_* residue exists.
- Original F1 acceptance remains fully required; no product test is weakened or skipped.

FINAL EVIDENCE ADDITIONS
- resolved Git path/version;
- every expanded A command + exit code;
- preflight hashes, HEAD/index/ref/object/remote state;
- remote-add and explicit staging evidence;
- RECOVERABLE_BASELINE_HEAD;
- system/global/local safe.directory absence and ordinary process env cleanup;
- any use of B with exact child scope and before/after unset proof;
- statement that .git/config, ACL/owner and global/system config were not altered except the
  authorized project-local remote additions and normal Git repository state required by commits.

EXTERNAL ACTION POLICY
LOCAL_WRITE = allowed
GIT_COMMIT = allowed
GIT_PUSH = reviewed-head-only
DEPENDENCY_NETWORK = allowed
PAID_PROVIDER_CALLS = synthetic-only allowed, not required for F1
REQUEST_CREDENTIALS = allowed
RELEASE_DEPLOY = denied
PERSONAL_DATA_ACCESS = denied; ask only if genuinely required
SYSTEM_LEVEL_CHANGE = project-local allowed; global/system ask
```

## USER GATE

```text
NONE
```

路线 A 已有直接证据并满足当前安全与授权边界。D/E 只有在 A 与受控 B 均被新证据证明不可行、且完成 acceptance 必须进行系统级持久修改时才可能形成未来 USER_GATE；当前不应把该工程路线抛给用户。

```text
VERDICT / NEXT STATE = REPLAN_ROUTE_READY
```

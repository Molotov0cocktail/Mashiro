# MASHIRO-CONTINUOUS-DEVELOPMENT — F1 Replan Execution Contract (Attempt 3)

## STATUS / TASK / RISK / REVIEW

```text
STATUS = CONTRACT_READY
PROGRAM_ID = MASHIRO-CONTINUOUS-DEVELOPMENT
PROJECT_ROOT = D:\Mashiro
TASK = 从 recoverable baseline 与精确 partial state 继续正式工程初始化 + F1
PRODUCT_ROUTE_ID = foundation-f1-electron-sqlite-v1
ATTEMPT = 3
GIT_SUBROUTE = git-command-scope-safe-directory-v1
TOOLING_SUBROUTE = fresh-executor-apply-patch-small-hunks-v1
RISK = HIGH
REVIEW = mandatory-fresh
USER_GATE = NONE
```

本文件是紧凑 delta contract，不重新设计 F1。唯一新增路线变化是替换已达到重复阈值的 Executor/tool context；现有 Git route、recoverable baseline、依赖、RED oracle 与 partial files 全部保留。

## BASELINE

本 Planner 于 2026-09-02 独立只读核验：

```text
BASELINE_ID = mashiro-head-92a6dd9-partial-attempt-2
PROJECT_ROOT_RESOLVED = D:\Mashiro
GIT = D:\Git\Git\cmd\git.exe 2.51.2.windows.1
BRANCH = main
HEAD = 92a6dd9ccd086192f5f1213ab4030bc5b0a2c3a1
TREE = f086cc7da02bcc0d0009982a3b6bdd2201fbb241
INDEX / CACHED DIFF = empty
TRACKED DIFF = empty
CANDIDATE = NONE
PUSH = NONE
github = https://github.com/Molotov0cocktail/Mashiro.git
gitee = https://gitee.com/Molotov0coaktail/mashiro.git
WORKTREE = exact untracked attempt-2 partial state
```

Route-A `status --short --branch --untracked-files=all` exit `0`，只列：新 Route Assessment、attempt-2 Executor report、manifest/lock、九个 config files、shared contract、三个 storage/repository drafts、service/UI RED stubs 与五个 test files。index 和 tracked diff 均为空；system/global/local `safe.directory` 无值；常规 `GIT_CONFIG_*` 全部 unset。

以下内容寻址输入已重新计算并匹配：

| 输入 | SHA-256 |
| --- | --- |
| 用户持续授权 | `ed7a11299820ff4f2c928ce54e1466075cbeaf6f0fc510675fd3eb01c09d5b85` |
| attempt-1 完整 Planner Contract | `09f2aa1dc28bd493ec07c15bc919858f674a581f5292b1e60b106dce91525003` |
| attempt-2 Git delta Contract | `1f529328fa1981acb2ad8b915a933bc506ae709b77a86edeea07b1f80ad56b23` |
| attempt-2 Executor report | `daa3a976897a1721a3f7444836dc149f525c329cc1f61aefdf029531707c32b4` |
| Apply-Patch Route Assessment | `8f2a5b5353d57cbb2221d3df5cc7998fdc5b0f793b02a533aca83e6ee77cca3a` |

Apply-Patch Route Assessment 中 `Current partial state hash guard` 的 21 个文件/hash 是本合同规范性 baseline 表。本 Planner 已逐项重算，全部 `MATCH=True`；关键值：

| 文件 | SHA-256 |
| --- | --- |
| `package.json` | `c6393c239dfa02c2d40881ee9fe932dce8f8ed2fa9b0862ba80ece53822ed2a3` |
| `package-lock.json` | `7d4ac411346a79d1a37e8b56b368fdb6e8c500d3af2fdcbeba9c8d825dbe70a7` |
| `src/shared/assistant-contract.ts` | `c1757d2e765e2188faed0f86c524e6c8e35a999416ae866861841b48d0d8fba3` |
| `src/main/data/schema.ts` | `b601f656f3f2c6f4ff931e1c475b7590fffa1b668f62276ef32d8fa0233dbbd5` |
| `src/main/data/sqlite.ts` | `599aa1fc01b6d45b525351da7d9d80ee0f86894889a779ab26fcfb1b69d2007b` |
| `src/main/assistant/assistant-repository.ts` | `6a0b718a43f5f49313281f27d242d6277ddd24ee81b2dabd824657091f862c31` |
| `src/main/assistant/assistant-service.ts` | `72d7c5bfa75b4735bfeeb89ed266eddb0a422c4acb8fc2bcf31730338ee1a938` |
| `src/renderer/src/features/assistants/AssistantPanel.tsx` | `90d0f90848295058ba7793c3253b83acabef76ba4f780300c93c4c0577153f2d` |

全部 config/test hashes 必须从该 content-addressed assessment 原表逐项核验，不得只核对本节摘录。`node_modules/electron/dist/electron.exe` 当前存在，`dist/version=44.1.1`。本合同是 handoff 时唯一允许新增的 untracked 文件；其最终 SHA-256 由 Prompter 提供给 Executor。

## INHERITS

Executor 在任何产品写入前必须完整读取并校验：

1. attempt-1 Planner Contract（完整 F1 产品、依赖、IPC/SQLite/security/test/acceptance）；
2. attempt-2 Replan Contract（完整 Route-A Git delta）；
3. Git Route Assessment、两份 Executor reports、Apply-Patch Route Assessment；
4. 用户持续授权、当前 skills/references、项目设计/任务文档和全部当前文件。

优先级：用户最新约束 > 本 attempt-3 tooling delta > attempt-2 Git delta > attempt-1 完整 F1 contract。未在 `OVERRIDES` 明列的内容全部原样、合取式继承；摘要不能替代完整读取。

## ATTEMPT LEDGER

| Attempt | Route / hypothesis | First bad state | Evidence / outcome |
| --- | --- | --- | --- |
| 1 | 普通 Git 可直接操作新 repo | 两个身份均 `dubious ownership`, exit `128` | Route-A 命令级 `-c` 成功；普通 Git 路线关闭 |
| 2 | Route-A Git + 原 Executor `apply_patch` 完成 F1 | 同一 context 两次 `helper_unknown_error: setup refresh had errors`，发生在更新既有 `assistant-service.ts` 前 | Git 全部成功；baseline/依赖/RED/partial drafts 保留；STOP/REPLAN |
| 3 | 全新 Executor/tool context 对既有文件做最小 contract-required hunk，成功后以小 hunk续接 | fresh context 首次出现同一 setup-refresh helper error | 一次即 `PLATFORM_CHECKPOINT`；若成功则继续原 F1 |

Attempt-2 的 helper failure 是平台/工具写入路线失败，不是 Git、依赖、SQLite、F1 behavior 或用户决策失败。Attempt-3 不重复 exhausted context。

## OVERRIDES

仅覆盖以下事项：

1. `ATTEMPT=3`，新增 `TOOLING_SUBROUTE=fresh-executor-apply-patch-small-hunks-v1`。
2. 必须创建全新 Executor/工具上下文；原 attempt-2 Executor 保持停止。
3. 从接管至 Executor report 完成，仅该 Executor 拥有 product/config/test 文件写权限；不得并行第二产品 writer。
4. baseline 改为上列 HEAD 与精确 untracked partial state；不从零重建，不 reset、不删除、不移动、不覆盖 whole file、不清空依赖、不重做 Git baseline。
5. 首个产品写入必须是下述冻结的既有文件 `apply_patch` hunk；fresh context 首次同类 helper failure 立即平台检查点。
6. 后续编辑只能继续用 `apply_patch` 小 hunk + pre/post hash guard。禁止 shell/PowerShell/Python/重定向写文件，也禁止 Delete+Add 重建既有文件。
7. 依赖恢复、Electron executable 和 RED oracle 证据保留；当前不得重新 install/download。只有 fresh Executor 只读核验证明 ignored dependency/executable 实际缺失、manifest/lock 仍匹配且原合同明确允许恢复时，才可按冻结 lock/官方来源做一次有证据的恢复；不得升级版本或换源。
8. Final evidence 增加 fresh-context、first patch 与逐 hunk hash 证据。

## PARTIAL STATE OWNERSHIP

- HEAD `92a6dd9...` 是已提交 recoverable baseline，不得改写历史。
- 当前 21 个 partial files 均是 attempt-2 在合同范围内产生的未提交 draft；hash guard 证明内容连续性，不证明正确性或候选状态。
- `assistant-service.ts` 与 `AssistantPanel.tsx` 仍是明确 RED stubs；schema/sqlite/repository 是未集成、未复核 draft。
- 当前 RED：`npm run test:focused` exit `1`；4 files 中 2 pass/2 fail，6 tests 中 2 pass/4 fail；失败命中 `F1_NOT_IMPLEMENTED`，不是缺依赖/夹具崩溃。Attempt-3 必须保留该 oracle，不必为了“再证明红”在首个写入前重跑。
- 未经 hash/status guard 不得编辑；发现漂移时不覆盖、不删除，返回 State Reconciliation。
- 不把 partial draft、现有 node_modules 或历史 RED 宣称为 GREEN、candidate 或 PASS。

## EXECUTION ORDER

### 0. Fresh-context opening guard — read only

1. 记录 fresh Executor/task identity，确认 attempt-2 writer 已停止且自己是唯一 writer。
2. 完整读取/校验 `INHERITS` 与本合同 self-hash。
3. 仅使用 `D:\Git\Git\cmd\git.exe -c safe.directory=D:/Mashiro ...` 复核 root、branch、HEAD/tree、remotes、index、tracked diff 和完整 untracked status。
4. 对 Apply-Patch Route Assessment 原表全部 21 个文件、attempt-2 report、assessment 与本合同逐项 SHA-256 guard；核验 manifest/lock/config/tests/storage/service/UI。
5. 核验依赖树/official Electron executable 的存在性，不 install/download；核验无需运行产品测试。
6. 任一 HEAD/status/path/hash 漂移：零产品写入，返回 State Reconciliation；不得 reset/delete/覆盖 partial state。

### 1. Frozen first product write

首个产品写操作必须是一次 `apply_patch` Update File，目标 preimage：

```text
src/main/assistant/assistant-service.ts
SHA-256 = 72d7c5bfa75b4735bfeeb89ed266eddb0a422c4acb8fc2bcf31730338ee1a938
```

唯一允许的首 hunk：

```diff
+import { randomUUID } from 'node:crypto'
 import type { AssistantResult } from '../../shared/assistant-contract.js'

 ...
-    correlationId: 'red-oracle',
+    correlationId: randomUUID(),
```

两项变化必须位于同一最小上下文 hunk；保持 RED stub 其余行为不变。禁止用空白、注释、临时探针或无意义新文件测试写入。

- 成功：立即只读重算目标 postimage hash、读取内容并确认只有该 hunk；记录 exact tool result，再进入 Phase 2。
- 返回 `helper_unknown_error: setup refresh had errors`：不重试，不进行第二次产品写入；不得改用 Add File、Delete+Add、shell/Python/重定向或重建。立即持久化可用证据并输出 `PLATFORM_CHECKPOINT`。
- 返回不同错误：记录新 first bad state；仅在有可区分证据时做只读、有界诊断，仍不得采用禁止的写入绕过。

### 2. Continue existing implementation with small guarded hunks

1. 每次只修改一个可审语义 hunk；patch 前记录当前 SHA/context，patch 后重读、重算 hash、审阅 diff。
2. 先完成现有 assistant-service 与 repository/schema/sqlite 的合同内集成，再按 attempt-1 scope 补齐 IPC、preload、main/window/data-root、renderer 和 Electron harness。
3. 不创建未来 Provider/记忆/事项/提醒/installer 模块，不通过删除 draft 或放宽测试换绿。
4. 小批实现后运行 focused GREEN；随后完整执行原合同 full/type/lint/format/build/clean restore/security/residual/真实 Electron 两 PID 重启验证。
5. 对 partial draft 正常审查和修复；删除仅在内容本身经证据证明合同要求删除且可精确限定时另行评估，默认零删除、零 reset。
6. 完整 GREEN、scope/diff/secret检查后才形成 candidate commit。所有 Git 命令继续使用 attempt-2 Route-A；Executor 不 push、不宣告 PASS。

### 3. Review / close / push

- 全新 mandatory-fresh Reviewer 独立检查 exact baseline..candidate、全部 uncommitted/staged state、代码、测试、真实 Electron 和原完整 acceptance；Executor report 只作索引。
- verdict 仍只可 `PASS | REPAIR | REPLAN | BLOCKED`。
- Closer 只有在 Reviewer PASS 与 reviewed HEAD 未变化时收尾；若 closing commit 改变 HEAD，必须再由 mandatory-fresh Final Reviewer 审核。
- 仅 Closer 使用 Route-A 推送最终 reviewed HEAD 到两个精确 remotes；不 force、不 Release/deploy。
- F1 关闭后继续启动 Continuation Planner。

## FIRST-BAD / ROUTE SWITCH

```text
ATTEMPT-3 TOOL FIRST BAD STATE = fresh Executor 对 guarded existing assistant-service.ts
首次 frozen apply_patch 即返回 helper_unknown_error: setup refresh had errors
```

- 该状态首次出现即停止，不重试；因为相同状态已在独立 attempt-2 context 重复两次，新的独立 context 一次复现已足以形成跨上下文平台证据。
- 结果是 `PLATFORM_CHECKPOINT`，不是 F1 acceptance failure、不是 `BLOCKED`、不是 `USER_GATE`，也不授权第三种写入机制。
- 报告 Add File/helper 的成功或失败不能替代既有产品文件 Update File 探针；报告持久化失败本身也不等于产品失败。
- HEAD/status/hash 漂移进入 State Reconciliation；原 Git/依赖/Electron/SQLite/IPC/test first-bad 与 route-switch 规则继续由 attempt-1/2 合同控制。
- 禁止 reset、delete/recreate、whole-file overwrite、owner/ACL/global/system/local trust 修改、换 Git 或其他安全弱化。

## UNCHANGED ACCEPTANCE

attempt-1 完整 F1 contract 与 attempt-2 Git delta 的全部 scope、dependency freeze、IPC DTO/error contract、SQLite schema/transaction/invariants、trusted-side validation、data isolation、security/adversarial matrix、RED/GREEN tests、full/type/lint/format/build、真实 Electron restart、candidate/review/close/push、NOT RUN 和 authorization 要求逐项不变；没有任何 acceptance 被删除或降级。

尤其仍必须满足 stable ID、rename/restart 保持身份、唯一 active primary/current、primary archive 拒绝、非 primary archive 不删除、malformed/stale/forged 输入在 main 拒绝、renderer 无 SQL/path/credential/shell/arbitrary IPC/network authority、repo 外数据根、完整验证与 reviewed-head-only push。

## FINAL EVIDENCE ADDITIONS

Executor 在原完整 evidence schema 外追加：

```text
FRESH EXECUTOR / TOOL CONTEXT IDENTITY
OPENING HEAD / TREE / REMOTES / INDEX / TRACKED + UNTRACKED STATUS
ALL 21 PARTIAL PREIMAGE HASHES + CONTRACT/REPORT HASHES
SOLE-WRITER CONFIRMATION
EXACT FIRST apply_patch INPUT / RESULT
assistant-service PREIMAGE / POSTIMAGE HASH + CONTENT/DIFF CHECK
EACH LATER HUNK PRE/POST HASH + DIFF
ALL helper FAILURES RETAINED
NO shell/PowerShell/Python/redirection/Delete+Add/reset/rebuild workaround
DEPENDENCY/ELECTRON REUSE OR, ONLY IF ACTUALLY MISSING, EXACT AUTHORIZED RESTORE EVIDENCE
ORIGINAL COMPLETE F1 EVIDENCE
```

## USER_GATE

```text
USER_GATE = NONE
```

fresh-context 选择、partial draft 接管、hunk 拆分、验证与路线切换均属工程链。没有必要产品语义、真实个人数据、不可逆动作、缺失且不可替代凭据/权限或无法隔离的未知用户改动。

## NEXT STATE

```text
NEXT STATE = CONTRACT_READY
PROMPTER ACTION = 将 attempt-1 full contract、attempt-2 Git delta、两份 Executor reports、
                  两份 Route Assessments、本合同及全部 SHA-256 原样交给全新 Executor Attempt-3
ON FIRST IDENTICAL FRESH-CONTEXT HELPER ERROR = PLATFORM_CHECKPOINT
```

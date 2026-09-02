# Apply-Patch Route Assessment

PROGRAM_ID = MASHIRO-CONTINUOUS-DEVELOPMENT
ROLE = fresh high-reasoning Route Assessment / Tooling Diagnostician
PROJECT_ROOT = D:\Mashiro
PRODUCT_ROUTE_ID = foundation-f1-electron-sqlite-v1
FAILED_ATTEMPT = 2
NEXT_ATTEMPT = 3
SCOPE = read-only diagnosis; this report is the only permitted write
USER_GATE = NONE
VERDICT / NEXT STATE = REPLAN_ROUTE_READY

本 assessment 不重新设计 F1，不修改产品、doc、Git index/HEAD/remotes/config，不 commit、push、安装依赖或访问个人数据。报告通过 apply_patch 的 Add File 路径创建；这只能证明本新上下文的 Add File 调用可用，不能预先证明既有产品文件的 Update File 路径可用。

## FAILED ROUTE SUMMARY

Attempt-1 的普通 Git 路线在 git init 后两次命中 detected dubious ownership，已由内容寻址的 Git Route Assessment 关闭。Attempt-2 采用每条 Git 命令显式 -c safe.directory=D:/Mashiro 后，所有实际 Git 读写成功，建立了 recoverable baseline commit，因此 Git 路线不是当前失败路线。

Attempt-2 当前 first-bad chain：

1. 依赖恢复、official Electron executable 和甄别性 RED oracle 已取得证据。
2. 第一次 apply_patch 修改既有 src/main/assistant/assistant-service.ts 时，文件系统 sandbox helper 在读取/应用 patch 前返回 helper_unknown_error: setup refresh had errors；没有形成部分写入。
3. 随后较小 apply_patch 成功 Add File，新增 schema.ts、sqlite.ts、assistant-repository.ts，证明 patch 内容和整个工作区并非普遍不可写。
4. 下一次 apply_patch 再次修改既有 assistant-service.ts 时出现相同 helper_unknown_error。相同 first bad state 在同一 Executor/tool context 达到两次，Attempt-2 正确 STOP / REPLAN。
5. 本 Route Assessor 与只读子诊断上下文的普通 unified exec 入口也在 CreateProcess 前复现 setup refresh had errors；按约束停止重试，并只用获批的只读外层 PowerShell取得现场证据。该现象提高平台工具风险，但不等于产品失败，也不证明一个新的 Executor 的既有文件 apply_patch 必然失败。

失败分类：平台/工具 setup-refresh 路线失败。不是 F1 产品行为、SQLite 设计、测试 acceptance、Git trust、依赖、凭据或用户决策失败。

## PROVEN FACTS / UNKNOWN

### 内容寻址输入

- 用户持续授权：ed7a11299820ff4f2c928ce54e1466075cbeaf6f0fc510675fd3eb01c09d5b85
- state-reconciliation-2026-09-02.md：df5c965645cc175a29efb88878402ee6a30a716509df8787cee5ad382fb6e9d2
- f1-planner-contract-attempt-1.md：09f2aa1dc28bd493ec07c15bc919858f674a581f5292b1e60b106dce91525003
- f1-executor-report-attempt-1.md：113264a3e774479e2785893ab5d2872ffd131687b58aa899d8f9223a6d5b4367
- git-dubious-ownership-route-assessment.md：f2e0109af0f00695f6c3c46c6b1d94901169d976c47cb60399e1f72c567957fb
- f1-replan-contract-attempt-2.md：1f529328fa1981acb2ad8b915a933bc506ae709b77a86edeea07b1f80ad56b23
- f1-executor-report-attempt-2.md：daa3a976897a1721a3f7444836dc149f525c329cc1f61aefdf029531707c32b4

以上文件以及 orchestrate-engineering-task v3、initialize-engineering-project 两套 skill 和全部 references 已完整读取；指定 hash 均重新计算匹配。

### 当前 Git / worktree

- Git executable/version：D:\Git\Git\cmd\git.exe，2.51.2.windows.1。
- HEAD：92a6dd9ccd086192f5f1213ab4030bc5b0a2c3a1。
- HEAD tree：f086cc7da02bcc0d0009982a3b6bdd2201fbb241。
- Branch：main；该 commit 仅是 chore: establish guarded Mashiro baseline。
- Remotes：
  - github = https://github.com/Molotov0cocktail/Mashiro.git
  - gitee = https://gitee.com/Molotov0coaktail/mashiro.git
- Index/cached diff：空。没有 staged 文件，没有 tracked-file 修改；当前工作全部是预期 untracked partial state。
- Candidate：NONE；未 push。

### 当前 partial state hash guard

| Path | SHA-256 |
| --- | --- |
| f1-executor-report-attempt-2.md | daa3a976897a1721a3f7444836dc149f525c329cc1f61aefdf029531707c32b4 |
| package.json | c6393c239dfa02c2d40881ee9fe932dce8f8ed2fa9b0862ba80ece53822ed2a3 |
| package-lock.json | 7d4ac411346a79d1a37e8b56b368fdb6e8c500d3af2fdcbeba9c8d825dbe70a7 |
| electron.vite.config.ts | 536f209998b44a467ff2aec9d9065376e2ac75a1ea07e6d1ecd58c090ab0be20 |
| eslint.config.mjs | 4aef7fdc47111c1f96a2f9adf9e77473321b48c77e95a28f3c4fcd7d8a2321ad |
| .prettierrc.json | a55df59e012d84d8b0925731f2de55b22147481c9ea88b0d49595f70a53272d7 |
| .prettierignore | b933671c7a3497ab705d32f5f9fd689cb36391809b21c2e6ff6856c3ed81a0b0 |
| tsconfig.json | 7d31dbb684d8fb3e73507969f42c0b8518ec710ffd64c1a43f401fc78ca1b775 |
| tsconfig.node.json | 46fb3968a9b28523fd24b7b6365f9d4938e4051d935253c76eaa66a71d61e620 |
| tsconfig.web.json | 7a7ba9662809f0ed5a27d069996f4085b4e1b9847188690701cee80a4c54ce89 |
| vitest.config.ts | 47afbbe4ee939b461b91c6bba2f3afd5b411a9ab9ac16a09a20bf27281a18e2c |
| src/shared/assistant-contract.ts | c1757d2e765e2188faed0f86c524e6c8e35a999416ae866861841b48d0d8fba3 |
| src/main/data/schema.ts | b601f656f3f2c6f4ff931e1c475b7590fffa1b668f62276ef32d8fa0233dbbd5 |
| src/main/data/sqlite.ts | 599aa1fc01b6d45b525351da7d9d80ee0f86894889a779ab26fcfb1b69d2007b |
| src/main/assistant/assistant-repository.ts | 6a0b718a43f5f49313281f27d242d6277ddd24ee81b2dabd824657091f862c31 |
| src/main/assistant/assistant-service.ts | 72d7c5bfa75b4735bfeeb89ed266eddb0a422c4acb8fc2bcf31730338ee1a938 |
| src/renderer/src/features/assistants/AssistantPanel.tsx | 90d0f90848295058ba7793c3253b83acabef76ba4f780300c93c4c0577153f2d |
| tests/setup.ts | 977afde26bba6a51325908cd7713cbfdc87d18f06b78b237c8f364c44864b7de |
| tests/unit/assistant-contract.test.ts | 763e83391cc07167b723c4d78eb175cce228a9f343180d3ce4867e0788db0379 |
| tests/integration/assistant-service.test.ts | 74fea59d647516e2b19781dd6053fb6de1829e0c026e967772f8b29171e9e3ec |
| tests/integration/assistant-ipc.test.ts | 7a3cff8c25d3550aa1f6fc85c11d21af10ebed611aa5e07eb7b1c1d498fe0607 |
| tests/renderer/AssistantPanel.test.tsx | dda22268ca4ac34366fcb16d2cbcc3a675a97ee3ea6bc45e6588662c63a29e8c |

独立读取证明这些 partial files 全部位于 frozen contract scope。assistant-service.ts 与 AssistantPanel.tsx 仍是明确的 RED stub；schema/sqlite/repository 是未集成、未验收 draft。package.json 的 direct versions 与 frozen contract 一致；lockfile 当前 hash 如上；node_modules 中 official Electron executable 存在且 dist/version 为 44.1.1。

Attempt-2 报告记录的 RED：npm run test:focused exit 1，4 files 中 2 pass / 2 fail，6 tests 中 2 pass / 4 fail；失败命中 F1_NOT_IMPLEMENTED 行为而非缺模块/夹具崩溃。本 assessor 没有重新运行测试，因此当前动态测试结果属于 NOT RUN；不能把历史 RED 或 partial code当成当前 correctness/PASS。

UNKNOWN：

- fresh Executor 的既有文件 apply_patch 是否可用；
- partial storage draft 经 service 集成后是否 typecheck、满足 invariants 并通过测试；
- GREEN/full/type/lint/format/build/真实 Electron 双 PID 重启结果；
- ignored node_modules 的完整当前一致性；应由 Executor 用既有正式命令复核；
- 最终 candidate、Reviewer verdict 与 push 状态。

## ACCEPTANCE IMPACT

- apply_patch helper 失败直接阻塞实现写入，因此必须换执行工具上下文；但它发生在候选形成前，不是 F1 acceptance 的失败结果。
- Git Route A、recoverable baseline、remotes、正式 manifest/lock、official Electron executable 与甄别性 RED 仍是有价值证据，不应重做或删除。
- 所有 F1 acceptance 仍完整开放；不得因工具失败削弱测试、扩大 renderer 权限、绕过 trusted-side validation 或把 partial draft说成候选。
- 报告/辅助 helper 的失败必须登记为平台风险，不能升级成 USER_GATE 或产品 BLOCKED。

## ROUTE OPTIONS

### A. 全新 Executor / 新工具上下文，继承现场，小 hunk apply_patch

这是实质变化：替换达到重复阈值的 Executor/tool context，同时保持 frozen product/Git route。先只读核验，再对既有 assistant-service.ts 应用一个最小、非破坏、contract-required hunk。它直接检验未知边界，成功后可继续交付，失败则产生跨独立上下文的平台证据。选择。

### B. 原 Executor 原工具环境继续重试

同一 first bad state 已两次出现；没有新变量或证据增量。违反重复阈值，拒绝。

### C. shell / PowerShell / Python / 重定向写文件

全局工程规则要求所有本地文件编辑使用 apply_patch；本任务再次明确禁止这些写入方式。即使只读外层 PowerShell可用，也不能把它变成写入绕过。拒绝，且不向用户索取绕过授权。

### D. 删除既有文件后 Add File 重建，或 move/replace

Add File 曾成功不等于 delete/recreate 安全。该路线可能丢失未提交 draft、绕开清晰 preimage、在部分失败时留下删除状态，并与默认禁止 reset/delete 冲突。即使把 Delete+Add 放入单个 apply_patch，也不能假定 helper 原子性；当前有更安全的 A。拒绝作为 attempt-3 路线。只有未来独立平台诊断证明 Update File 特有缺陷，且能以精确 full-file hash、单次原子 patch 和完整 postimage 检查保证不丢数据时，才可重新评估，不能由 Executor自行降级采用。

### E. 新 Executor 按 frozen contract 重建/继续 partial implementation

选择“继续”，不选择从零重建。现有 partial state 有精确 HEAD、空 index、完整 inventory/hash、合同内路径和甄别性 RED，证据足以作为 untrusted draft 继承；不足以作为正确实现或候选。默认不丢弃任何文件、不 reset、不清空依赖、不重建 Git。A + E 组合为推荐路线。

## RECOMMENDED ROUTE

ROUTE_ID = foundation-f1-electron-sqlite-v1
ATTEMPT = 3
GIT_SUBROUTE = git-command-scope-safe-directory-v1
TOOLING_SUBROUTE = fresh-executor-apply-patch-small-hunks-v1
WRITER = 一个全新 Executor；从接管到候选报告完成拥有产品/config/test 文件唯一写权限

### Opening guard

1. 完整读取本 assessment、attempt-1 contract、attempt-2 replan contract、两份 Executor 报告、Git Route Assessment、用户授权和 skill/references；核验上列 hash。
2. 核验 HEAD/tree/remotes/index/status 与本报告一致。允许的新增项只有本 assessment 自身；其 SHA-256 由 Prompter传入。
3. 对上表每个 partial file 重新计算 SHA-256。任一漂移：不写、不覆盖、不删除，返回 STATE_RECONCILIATION。
4. 确认原 Executor 已停止，Attempt-3 Executor 是唯一 writer。不得并行启动第二个产品写者。
5. 所有 Git 调用继续使用 D:\Git\Git\cmd\git.exe -c safe.directory=D:/Mashiro；不改 global/system/local trust、owner/ACL，不 reset/re-init。

### First-bad guard

Attempt-3 的第一次 apply_patch 必须命中既有 src/main/assistant/assistant-service.ts，且 preimage SHA-256 必须为 72d7c5bfa75b4735bfeeb89ed266eddb0a422c4acb8fc2bcf31730338ee1a938。

最小 hunk 冻结为：新增 node:crypto 的 randomUUID import，并把 RED error 中硬编码 correlationId red-oracle 改为 randomUUID()。这是 frozen error contract 所需、保持 RED stub 其余行为不变的非破坏性小步；不得用临时注释、空白或无意义探针。

- 若首次 apply_patch 成功：立即只读重算目标 hash、读取目标内容，确认只有该 hunk；记录工具调用与 postimage hash，然后继续下一批小 hunk。
- 若首次 apply_patch 返回相同 helper_unknown_error: setup refresh had errors：不重试，不改用 Add File/delete-recreate/shell/Python/重定向。因为相同 first bad state 已跨 Attempt-2 与独立 Attempt-3 tool context 重复，立即 STOP，输出 PLATFORM_CHECKPOINT（不是产品 acceptance 失败，不是 USER_GATE）。
- 若返回不同错误：记录 first bad state；只在有可区分新证据时做有界诊断，仍不得采用禁止的写入绕过。

### Continuing discipline after first success

- 每批只做一个小、可审语义 hunk；patch 前记录目标当前 SHA，apply_patch 的上下文本身作为第二 guard，patch 后重读/hash/diff。
- 优先完成现有 assistant-service 集成，再按原合同补齐 IPC/preload/main/window/data-root/renderer/harness；不得创建未来模块。
- 保留全部失败记录和 RED oracle；小批 GREEN 后再运行聚焦检查，最终完整执行原合同的 full/type/lint/format/build/真实 Electron/clean restore/security/residual 验证。
- 不因 partial draft 已存在而跳过代码审阅。发现实现缺陷时用正常小 hunk修正；除非内容本身经证据证明不可保留，否则零删除、零 reset。
- 只有完整 GREEN、scope/diff/secret检查后才形成 candidate commit。Executor不 push、不宣告 PASS；mandatory-fresh Reviewer 和 Closer 分工保持不变。

## DEFERRED / NON-BLOCKING RISKS

- setup-refresh 可能是当前主机的广泛平台状态；本报告 Add File 成功不证明 Update File 成功，因此 first-bad guard 是硬前置。
- partial files 全部未跟踪且尚未独立复核；hash guard只能证明同一内容，不能证明正确性。
- Electron 44.1.1 的 explicit official installer/reproducibility 文档仍需收尾；不得把现有 ignored node_modules 当 lockfile acceptance。
- baseline 的受保护 Markdown/guard whitespace 历史问题、PACKAGED/installer/migration/multi-instance 等仍按原合同为已知或 NOT RUN，不阻塞本工具路线选择。
- 两个 remotes 的认证/push 仍待最终 reviewed-head-only 阶段，不是当前门禁。

## EXPLORER

NOT REQUIRED。一个单独 spike 会复制同一既有文件写入并模糊单写者。Attempt-3 的首个最小 contract-required hunk同时是最小可判定 route probe；成功即继续候选，失败即形成平台 checkpoint。

## REPLAN EXECUTION CONTRACT INPUT

TASK
Resume formal foundation + F1 from recoverable baseline and the exact uncommitted partial state; do not redesign F1 or rerun successful Git baseline work.

ROUTE / ATTEMPT
foundation-f1-electron-sqlite-v1 / attempt-3
GIT_SUBROUTE = git-command-scope-safe-directory-v1
TOOLING_SUBROUTE = fresh-executor-apply-patch-small-hunks-v1

BASELINE
HEAD = 92a6dd9ccd086192f5f1213ab4030bc5b0a2c3a1
TREE = f086cc7da02bcc0d0009982a3b6bdd2201fbb241
BRANCH = main
INDEX = empty
CANDIDATE = NONE
REMOTES = exact github/gitee URLs above
WORKTREE = exact untracked partial inventory/hash table above, plus this assessment with Prompter-supplied hash

INHERITS
Attempt-1 Planner Contract in full, Attempt-2 Replan Contract in full except the new tooling delta here, Git Route Assessment, user authorization, current skills/references, both Executor reports and all current files. No product scope, dependency freeze, IPC/SQLite/security rule, test or acceptance is weakened.

IMPLEMENTATION DELTA
Replace only the exhausted Executor/tool context. Use the frozen first hunk and guard above; on success continue existing draft with apply_patch-only small hunks. Preserve HEAD, partial files, RED evidence and Git Route A.

ROUTE SWITCH
One identical helper error in the fresh context immediately yields PLATFORM_CHECKPOINT. No third write mechanism. Hash/status drift yields STATE_RECONCILIATION. Product/dependency/test failures continue to use the original contract’s first-bad and REPLAN rules.

FINAL EVIDENCE ADDITIONS
Fresh-context identity; opening HEAD/status/hash checks; exact first apply_patch result; each pre/post hash; all failed helper calls retained; statement of sole writer and no shell/Python/redirection/delete-rebuild workaround; original complete F1 evidence schema.

## USER GATE

NONE。工具路线、partial draft接管、hunk拆分和测试策略均由工程链拥有。没有出现必要产品语义、真实个人数据、不可逆动作、缺失且不可替代凭据/权限或无法隔离的未知用户改动。

## NEXT STATE

REPLAN_ROUTE_READY

Prompter next action：把本 assessment 路径/hash与全部内容寻址输入原样交给一个全新 Executor Attempt-3。若其首个既有文件 apply_patch 命中相同 helper 错误，则转 PLATFORM_CHECKPOINT；若成功，严格继续 frozen contract。

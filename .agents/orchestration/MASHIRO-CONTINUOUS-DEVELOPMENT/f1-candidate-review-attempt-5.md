VERDICT = REPAIR

## Review identity

- `PROGRAM_ID`: `MASHIRO-CONTINUOUS-DEVELOPMENT`
- `ROUTE`: mandatory-fresh Candidate Reviewer, Attempt-5
- `RISK`: HIGH
- `BASELINE`: `92a6dd9ccd086192f5f1213ab4030bc5b0a2c3a1`
- `REVIEWED_CANDIDATE_HEAD`: `62bc84a14f901e5b283e73572a04930abd7188df`
- `REVIEWED_TREE`: `c4e56e59e9fcc8cb748e71aad3d2404779fcfcaa`
- Reviewer未参与实现，未编辑、提交、清理、reset或push。

## Git / state reconciliation

独立核验结果：

- branch为`main`。
- HEAD和tree精确匹配上述候选。
- index为空。
- worktree唯一变化是未跟踪的
  `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-executor-report-attempt-5.md`
- 该报告SHA-256为
  `13347161f08c8072b5664a50d122cff5f708242a71028112501eb32162c1412d`
- baseline到HEAD共三个提交：
  - `d72daf9472ce385780eaf319615744ffee547245`
  - `f2ccb32d92ebbec5b2d7f50bef18ae2a7622a056`
  - `62bc84a14f901e5b283e73572a04930abd7188df`
- `git diff --check 92a6dd9..62bc84a`退出0。
- 两个remote均无`main`引用；没有remote-tracking refs，未发现push。
- system/global/local均无持久`safe.directory`。
- 未发现writer临时物、备份或运行时数据库残留。
- baseline..HEAD的73个路径和完整diff均已检查；没有发现依赖范围、Provider、conversation、memory、installer、updater、Release或deployment扩张。

默认sandbox执行仍在进程创建前触发已知`helper_unknown_error`；按授权切换到只读的`require_escalated`执行后完成核验。这不是产品first bad state。

## Independent verification

以下均独立运行成功：

- `npm run test:focused`: 10 files / 16 tests
- `npm test`: 10 files / 16 tests
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm ls --depth=0`
- `npm ls --all`
- `npm run verify`
- foundation validator：`ok=true`, `errors=[]`, `warnings=[]`
- `git diff --check`

两次独立真实Electron生命周期结果：

- run `63051388-495b-4b7f-a3d1-808fc7671831`
  - PID `502764` → `502440`
- run `ce299846-0bf6-404e-9a7b-5ef99aa76462`
  - PID `487080` → `502556`

两次均报告：

- Electron `44.1.1`
- Node `24.19.0`
- SQLite `3.53.3`
- 两个不同PID
- restart后snapshot保持一致
- revision保持`7`

依赖与产物：

- `package.json` SHA-256
  `c6393c...`
- `package-lock.json` SHA-256
  `7d4ac4...`
- preload artifact SHA-256
  `d326a028a3dc4826e2cdd047860ee4685878cb51fce81b7e4bee6dbc797827a9`
- lockfileVersion为3，共334个package records。
- 没有非官方resolved URL。
- preload产物仅有Electron runtime require、六个固定channel及`contextBridge`暴露；没有Zod、SQL、filesystem或宽泛IPC能力。
- tracked generated、PEM/private-key、高置信token、writer residual和仓库内runtime-data扫描均为0。

未再次运行clean `npm ci`。当前候选的clean证据通过精确package/lock哈希、lock provenance/install-script审计、当前`npm ls --depth=0/--all`、Electron executable、产物哈希和完整独立`npm run verify`得到交叉验证；依据本次Reviewer合同，该证据有效。

## Acceptance coverage found sound

- SQLite schema、trigger、事务、rollback、stable UUID、version/revision、stale second connection和restart persistence总体符合合同。
- exactly six narrow assistant IPC channels得到保持。
- 所有六种输入在service入口使用对应strict Zod schema。
- BrowserWindow保持`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- renderer未获得SQL、filesystem path、shell、credential或宽泛IPC权限；React文本渲染未发现HTML注入路径。
- trusted E2E root有marker和canonical path检查。
- repository failure、rollback、corruption、newer schema、missing trigger和parent-unavailable路径已有甄别测试。
- 文档保留task 002 limited qualification、task 003/Toolhelp32 `-003` historical failed/deferred/non-blocking，以及PACKAGED等NOT RUN历史。

## Acceptance-blocking findings

### F1 — Startup failure泄露stack和绝对路径

`src/main/index.ts:30`：

```ts
console.error('Mashiro failed to start', error)
```

直接记录原始Error对象。

我用真实Electron和无效trusted E2E root触发启动失败；子进程退出1，但stderr包含：

- 完整JavaScript stack
- `file:///D:/Mashiro/out/main/index.js`
- `D:\Mashiro\node_modules\...`
- Electron内部路径

这违反Attempt-1固定安全不变量：日志不得记录路径、stack、SQL、正文或Key。现有service/bridge错误脱敏测试没有覆盖main startup catch，因此已有GREEN无法证明这一边界。

`FIRST_BAD_STATE`: main启动失败catch将原始Error传给`console.error`。

### F2 — IPC输出没有runtime Zod验证

当前仅输入被运行时解析：

- `src/shared/assistant-contract.ts`只有输入schemas和TypeScript `AssistantResult`类型，没有结果/snapshot运行时schema。
- `src/main/assistant/assistant-service.ts:126`只对input执行`safeParse`。
- `src/main/ipc/register-assistant-ipc.ts:19`直接返回`handler(input)`。
- `tests/integration/ipc-registration.test.ts:16-21`甚至让mock service返回不完整的`{ ok: true }`，IPC仍原样转发。

因此TypeScript类型以外没有可信边界保证：若service/repository回归产生畸形对象、额外字段或内部错误内容，它可直接跨越IPC到renderer。这不满足本次固定的“strict Zod输入输出/error redaction”验收。

`FIRST_BAD_STATE`: `ipcMain.handle`返回前没有对trusted result执行strict runtime schema validation。

## Bounded Repair Contract

### Repair baseline

必须从精确HEAD：

`62bc84a14f901e5b283e73572a04930abd7188df`

开始。保持现有branch、历史、SQLite schema、依赖和lockfile；不得reset、重建仓库或push。

### Allowed product changes

仅限：

- `src/main/index.ts`
- `src/shared/assistant-contract.ts`
- `src/main/ipc/register-assistant-ipc.ts`
- 必要时对`src/main/assistant/assistant-service.ts`作最小调整
- 针对上述两个finding的测试
- 若事实改变，最小更新候选状态文档

不得改变：

- 六个channel的名称或数量
- SQLite schema/trigger语义
- 依赖版本或lockfile
- preload runtime import限制
- BrowserWindow安全配置
- F1产品范围

### Required repair

1. Startup失败只输出稳定、通用、无敏感内容的错误类别或固定事件名。
   - 不得传递原始Error、message、cause或stack给日志。
   - 保持非零退出。
   - 不得fallback到不可信data root。

2. 为IPC输出定义strict runtime Zod schemas：
   - assistant DTO
   - snapshot
   - success result
   - stable error result
   - UUID/correlation ID、timestamp、version/revision和error-code约束

3. 每个IPC handler返回renderer前必须解析输出。
   - 畸形trusted output不得跨IPC。
   - validation failure转换成稳定、脱敏的`INTERNAL_ERROR`。
   - 使用新的UUID correlation ID。
   - 不得泄露Zod issue、SQL、路径、stack或原始值。
   - fallback自身也必须符合结果schema。

4. preload继续只在runtime导入Electron和Zod-free channel constants；schema只能驻留trusted main边界，preload的contract引用必须保持type-only。

### Required regression evidence

- 真实Electron或等价子进程测试触发startup failure：
  - exit非零
  - stderr不含`D:\`, `file:///`, `node_modules`, stack frame、SQL/SQLite内部内容
- IPC测试让mock service返回畸形success和畸形error：
  - 两者均不能原样跨边界
  - renderer只收到strict、稳定、脱敏的`INTERNAL_ERROR`
- 正常六个operation仍通过。
- preload artifact重新证明无Zod和额外runtime imports。

### Required validation after repair

至少重新运行：

- `npm run test:focused`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test:electron`
- `npm ls --depth=0`
- `npm ls --all`
- `npm run verify`
- foundation validator
- `git diff --check`
- secret/generated/residual scans
- 双PID restart persistence证明

形成新candidate commit后，必须启动另一名mandatory-fresh Candidate Reviewer。不得由Repair Executor自判通过或push。

## Historical / NOT RUN state

仍保持：

- PACKAGED、installer、migration、multi-instance、crash recovery：NOT RUN
- Provider、conversation、memory、item、reminder、真实个人数据：NOT RUN
- Toolhelp32 `-003`：historical failed auxiliary audit、deferred、non-blocking
- 未重跑`-003`，未创建`-004`
- Release和deployment：NOT RUN

## Report persistence and handoff

Reviewer遵守只读角色，本报告未写入仓库。

当前未跟踪的Attempt-5 Executor报告是候选执行证据，不应删除；在修复通过并进入最终closing evidence commit时，应与本Reviewer报告及后续Repair/Reviewer报告一起纳入受审HEAD。

目标路径应为：

`.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-candidate-review-attempt-5.md`

在新的mandatory-fresh Reviewer明确审核修复后的精确HEAD之前，Closer和双远程push均不获授权。

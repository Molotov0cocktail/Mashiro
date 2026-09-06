# Mashiro 近期详细设计草案

> 当前状态：005 持续时间线 FINAL REVIEW PASS，项目总任务 ACTIVE；当前验收以 [005](tasks/005-persistent-timeline.md) 为准。
> 当前更新：2026-09-06。下方旧 F1 与草案状态按历史原文保留。

## 005 当前设计实现

- 每助手唯一逻辑时间线按稳定 assistant ID 存储于 `timeline_messages`。schema v3 在 populated v2 上事务增加消息表与排序索引，升级前验证原 guard、完整性和外键；凭据文件不参与数据库迁移。
- 正常发送先原子写入用户消息和 pending 助手占位；成功后才开始 Provider 请求。回答终结保留 completed/failed/cancelled/interrupted 及实际部分正文，存储失败返回脱敏错误而非成功。
- 每次调用在 trusted 侧重新解析活动助手、启用连接、模型绑定和凭据，并固定本次接收方。连接编辑、禁用、凭据撤销/替换和助手归档及时取消相应在途请求。晚到响应只对应捕获的 assistant/request。
- 正常 context 取当前助手最近最多 16 个 completed 用户/助手对，加当前输入最多 64,000 UTF-16 字符。若某对超出剩余预算，停止向前选择；本地记录不裁剪。读取 UI 返回最近 100 消息与 hasMore。
- 严格临时消息只在内存维护固定 session/message ID，绝不读取正常消息；当前临时会话最多 64 消息，合格上下文与输入上限 120,000 字符。显式保存事务按 assistant/source session/source message 去重，只有提交后标 saved；失败不改内存标志。保存后保持临时，后续消息仍不自动保存，运行中不允许保存。
- 正常关闭同步保存已收 partial 并终结中断；启动把遗留 pending 标 interrupted，不执行自动 Provider 重发。正常终结存储不可用时返回诚实错误；关闭写失败保留应用运行并只发固定脱敏日志事件，避免未处理底层异常。
- 新增两个窄 timeline IPC（read / save-temporary），输入输出 strict Zod，Provider 事件沿用严格 schema；六 assistant 通道不变，preload runtime 只导入 Electron 和无 Zod 通道常量。
- 005 最终独立审核 PASS 对应产品提交 `0aa2d9190b63c7b99d59f52808e16965fa6b417f`（20 files / 88 tests，适用真实双 PID 恢复证据）；报告见当前任务。后续正文保留历史事实，不覆盖当前任务入口。

> 当前授权和后续任务覆盖以 [项目总清单](tasks/program-docs-to-release.md) 为准。2026-09-06 用户已更新开发、依赖、main 双远程推送、隔离安装/更新/卸载、版本/tag 与实际 Release 授权；集中决议中 ENG-006/007/009/010 的早期现场描述不重新形成门禁。AST-006、RET-007、REM-002 的产品待决语义仍保留，不能由工程默认替代。

## 004 历史设计实现

- SQLite schema v2 以事务加法升级保存 Provider 连接元数据和稳定助手绑定；升级前验证 v1 完整性，失败回滚，不改变原有 assistant ID、primary/current 或 revision。
- `CredentialVault` 将临时 Key 只放在主进程内存，将持久 Key 以 Electron `safeStorage` 密文写入仓库外凭据目录。renderer 和 SQLite 只能看到是否存在凭据，不能读取 Key。
- `ProviderService` 在每个请求开始时固定 assistant、connection、model 与 credential；全局 request ID 唯一，取消按固定连接处理，晚到结果只结束自身 entry。每助手上下文最多 64 条且合计不超过 120,000 个 UTF-16 字符，超限须由用户清空，不静默裁剪。
- 原生 fetch transport 只允许受限 HTTPS Base URL，拒绝 userinfo/query/hash/redirect，不自动重试；普通和 SSE 文本上限为 120,000 字符，delta 拆分到 16,384 字符以内。断流保留部分输出并标 interrupted，缺失 usage 为 unknown。
- preload 仅新增按用例命名的 Provider API；运行时仍只导入 Electron 和不含 Zod 的 channel constants。main 对输入、输出和事件执行严格 Schema 校验，远端文本由 React 作为文本显示。
- UI 把“正在编辑”的连接与当前助手“实际接收方”分开显示；助手切换同步绑定、模型、草稿和 transcript，异步结果按 assistant ID/request ID 路由。临时会话支持普通、流式、取消和显式清空。

---
> 当前状态：F1 CANDIDATE REVIEWER PASS / CLOSING DOCS IN PROGRESS / FINAL REVIEW REQUIRED
> 当前更新：2026-09-03。下方设计与集中决议记录完整保留；旧的授权、Git 和“尚未实现”描述仅是 2026-09-02 历史现场。

## 当前实现与验证增量

- 精确直接依赖现为 React `19.2.8`、React DOM `19.2.8`、Zod `4.5.4`；Electron `44.1.1`、electron-vite `5.0.0`、Vite `7.3.6`、TypeScript `5.9.3`、Vitest `4.1.11` 等开发依赖均由 lockfile 精确固定。
- 助手持久字段仅含 F1 所需 ID、名称、创建/更新/归档时间和版本；singleton state 保存 primary/current ID 与 state revision。永久删除未实现，archive 受 trigger 与事务 invariant 保护。
- IPC 只有 `assistant:list/create/switch/rename/set-primary/archive`；preload 不加载 Zod，main 对所有 unknown 输入与 trusted 输出执行 strict runtime schema 验证，畸形输出或 throw 返回新的随机 correlation ID 和脱敏 `INTERNAL_ERROR`，不泄露底层 SQLite/path/stack。启动失败同样只输出固定事件名。
- 10 个测试文件／18 个测试覆盖 strict unknown/protocol/UUID/name、结果 schema、malformed trusted output、SQL 字符串、stale/concurrent、primary/archive、事务 rollback、schema guard、不可用路径、脱敏启动失败、E2E root/marker、CSP/navigation/popup/permission、React 文本转义和真实两 PID restart；本轮 mandatory-fresh Candidate Reviewer 已独立验证并 `PASS`。
- `npm ci` 不会自动安装 Electron 二进制；锁定包提供的 `npm exec install-electron` 是 clean restore 的显式第二步。随后 `npm run verify` 已通过。
- 不改变 task 002 的限定资格；task 003、Provider/记忆/事项/提醒、`PACKAGED`、发布和所有真实个人数据仍未运行。

## 历史详细设计与集中决议（2026-09-02，保留）

> 状态：DRAFT（等待用户评审）  
> 更新日期：2026-09-02  
> 设计深度覆盖近期阶段和初始化候选；远期能力只记录边界与再决策点。  
> 本文件是集中决议记录的唯一维护位置，其他文档只按编号引用。

## 1. 设计范围与状态标记

本文使用以下标记：

- **CONFIRMED**：用户已明确确认，可作为后续冻结输入；
- **OPEN**：需要用户决定，或历史信息不足，不能擅自补齐；
- **DEFERRED**：已明确不阻塞当前初始化，在指定阶段重新决策；
- **推荐／待评审**：实现建议，不等于用户确认；
- **待验证**：必须通过另行授权的实验或真实运行建立证据。

用户已接受F1作为后续初始化目标，并已单独授权且完成任务002隔离资格验证。正式项目初始化与F1实施仍未授权；本文中的文件布局、接口、状态机和产品测试均不是已实现事实。

## 2. 推荐的近期文件布局

推荐／待评审，且只在最终初始化闭环需要时创建：

```text
src/
├── main/
│   ├── app/                 # 生命周期、窗口、托盘和组合根
│   ├── ipc/                 # 受限 IPC handler 与运行时校验
│   ├── data/                # 数据根、事务存储、迁移与恢复
│   ├── assistant/           # 助手与主助手生命周期
│   ├── conversation/        # 时间线、上下文和严格临时模式
│   ├── provider/            # 连接、能力、适配、流式和用量
│   ├── operation/           # 业务执行身份、状态和恢复
│   ├── memory/              # 记忆协调与 Markdown 对应关系
│   ├── item/                # 事项、提案和提醒
│   └── health/              # 运行状态、日志事件与用量
├── preload/
│   └── index.ts             # 最小类型化 bridge
├── renderer/
│   ├── app/                 # React 组合与导航
│   └── features/            # 仅创建当前闭环实际使用的功能
└── shared/
    ├── contract/            # 跨进程 DTO、错误码和 Schema
    └── domain/              # 无 Electron 依赖的稳定类型/规则
tests/                       # 或按工具惯例共址；初始化冻结时决定
```

约束：

- 不一次创建上述全部目录；无当前职责的模块只保留在设计文档中。
- 依赖方向为 renderer → preload contract → main use case → domain/ports → trusted adapters。
- 领域规则不依赖 React、Electron renderer 或具体 Provider SDK。
- 不建立通用 Agent、工作流、ORM、多数据库或多协议插件平台。

## 3. 稳定身份与数据引用

### 3.1 稳定身份

推荐／待评审：以下对象使用不可变本地 ID，显示名称不充当身份：

- assistant、timeline、connection、provider endpoint fingerprint；
- memory item/branch、personal event、item/proposal/reminder；
- operation、model request、protocol segment、background job；
- source reference、permission grant、capability evidence。

助手改名、换头像、换连接或模型不改变 assistant ID。提案保留发起助手 ID，同时按当前昵称展示。Provider 授权绑定实际接收端点指纹和数据范围，不只绑定可编辑名称或 connection ID。

### 3.2 内容性质与状态相互独立

以下维度不能折叠成一个 `status`：

- 内容性质：用户陈述、忠实归纳、新增推断；
- 支持程度：来源数量、独立性、时间范围和最近评估；
- 生效状态：有效、待核验、争议、过期、撤销、删除抑制；
- 保留区域：持久、暂存、垃圾；
- 归属与权限：全局、助手关系、来源范围、外发接收方；
- 检索分值：全文或向量相关性。

向量相似度或模型自评分不能覆盖用户纠正、删除、权限或来源限制。

## 4. IPC 与可信边界契约

### 4.1 IPC 形态

推荐／待评审：preload 只暴露按用例命名的方法，例如：

```text
assistant.create(input)
assistant.rename(input)
assistant.archive(input)
assistant.setPrimary(input)
conversation.send(input)
conversation.cancel(input)
dataLocation.inspect()
dataLocation.select(input)
health.getSnapshot()
```

不暴露：

- `execute(channel, payload)` 一类任意通道；
- 任意路径读写、SQL、shell/PowerShell、动态模块加载；
- 返回完整凭据或直接构造任意 Provider 请求；
- 让 renderer 传入“权限已批准”等可信结论。

每个 handler 必须：运行时校验输入；从可信状态重新取得当前用户对象；执行权限检查；返回最小 DTO 或稳定错误码；在错误文本进入日志/UI前移除秘密和正文。

### 4.2 错误契约

推荐／待评审：跨进程错误以稳定类别返回，而非泄露原始堆栈：

- `INVALID_INPUT`
- `NOT_FOUND`
- `CONFLICT`
- `PERMISSION_DENIED`
- `AUTH_REQUIRED`
- `CAPABILITY_UNAVAILABLE`
- `BUDGET_EXHAUSTED`
- `DATA_LOCATION_UNAVAILABLE`
- `STORAGE_INCONSISTENT`
- `OPERATION_RESULT_UNKNOWN`
- `PROVIDER_TEMPORARY_FAILURE`
- `INTERNAL_ERROR`

开发日志可用关联 ID 连接内部原因，但默认不包含聊天、记忆、请求响应正文、Key 或认证 URL。

## 5. 数据根与启动契约

### 5.1 已确认行为

- 程序目录与数据目录职责独立；默认标准当前用户目录，可分别自定义，并允许安装目录下 `data`。
- 以普通用户实际读写能力检查数据位置；不可用时明确阻止或进入恢复，不静默换目录或创建空数据。
- 开发、测试和正式数据隔离；仓库不存放真实个人数据或运行日志。
- 更新和卸载默认保留用户数据；删除数据需要独立、明确、限范围授权。

### 5.2 locator 建议

推荐／待评审：

1. 在标准用户配置位置保存最小 locator，只包含格式版本、数据根路径和数据集 ID，不包含个人正文或凭据。
2. 数据根保存 manifest，包含同一数据集 ID、格式版本和迁移状态。
3. 启动时先读取 locator，再核对 manifest、权限和必要空间；不匹配时进入可理解的恢复流程。
4. 如果 locator 丢失，可由用户显式选择已有数据根重新绑定；不自动扫描整块磁盘。
5. 任何新数据集创建都要求清晰动作，不把不可访问旧数据解释为空白新用户。

具体 Windows API、文件格式、锁策略和多实例行为在数据位置任务中再决策；首版不承诺网络盘、云同步或并发共享。

## 6. Provider 客户端与协议契约

### 6.1 连接与模型分离

```text
Connection
  ├─ stable id / display name
  ├─ endpoint fingerprint / Base URL
  ├─ credential reference
  ├─ protocol profile / built-in adapter
  └─ capability evidence set

Assistant model selection
  ├─ assistant id
  ├─ connection id
  ├─ model identifier
  └─ mode/capability requirements
```

共享连接发生端点、凭据或适配语义变化时，应用应识别受影响助手和后台功能。助手换模型不改变其他助手，也不静默扩大外发授权。

### 6.2 请求构建

一次请求必须同时满足：当前任务需要、数据读取范围允许、目标接收方允许。允许范围是上限，不表示全部发送。

推荐／待评审的构建顺序：

1. 从本地权威时间线确定执行段和上下文候选；
2. 按来源、助手和功能权限过滤；
3. 按 token/上下文预算裁剪，但不破坏活动工具链或协议必需字段；
4. 由选定 adapter 映射思考参数、工具和厂商扩展；
5. 再检查实际端点指纹和外发类别；
6. 记录目标、模型、数据类别、来源数量和裁剪摘要，不记录完整正文；
7. 应用统一超时、取消、预算和重试政策。

不自动发送所有通用采样参数；已知被忽略或不支持的参数应省略、禁用或明确提示。

### 6.3 流式聚合

推荐／待评审：流式解析先聚合为内部事件，再提交用户可见或执行层：

- 文本和思考增量分别聚合；
- tool call 以调用 ID 和 index 关联，arguments 完整组装并通过 Schema 后才可执行；
- usage 可来自最终片段或独立片段，输入、缓存、推理和输出明细不重复相加；
- 已有正文但 usage 缺失时标记 `UNKNOWN`，不是零；
- 中途断流标记 `INTERRUPTED_WITH_PARTIAL_OUTPUT`，默认不自动完整重发。

### 6.4 受控协议段

推荐／待评审状态：

```text
ACTIVE
  → REBUILD_ELIGIBLE       # 仅当端点规则和测试证明可重建
  → REBUILDING
  → CLOSED

ACTIVE / REBUILDING
  → BLOCKED_BY_PERMISSION
  → ABORTED
```

- 协议段绑定 assistant、timeline、endpoint fingerprint、protocol、model、mode 和 adapter version。
- 活动流程保存完整调用/结果关系和必要推理续接字段；不裁剪半条消息。
- 一轮结束或一次工具完成不自动进入 `REBUILD_ELIGIBLE`。
- 成功建立新段后，旧字段才能进入对应保留/清理规则；仓储员不能独立判定协议兼容边界。
- 严格临时模式只在内存中维护协议段，进程退出后不可恢复正文。

### 6.5 Provider 传输实现

推荐／待评审：近期优先比较两种实现，不同时维护双栈：

1. 原生 `fetch`＋小型、固定版本 SSE parser：扩展字段、重试和超时更透明，但需承担完整流式测试；
2. OpenAI Node SDK：可复用 Chat Completions 基础实现，但须按最终版本核查 `Base URL`、自定义 body/字段保真、默认重试、超时、流式事件和错误类型。

若初始化闭环不包含 Provider，本选择不阻塞初始化；在 Provider 客户端任务前统一评审并冻结。

### 6.6 已知厂商差异约束

以下只作为适配和测试契约输入，状态不高于`DOCUMENTED`；实施时须重新打开完整官方文档，真实端点另按任务003验证。

| 目标 | 公共结构不得破坏的差异 | 当前证据边界 |
| --- | --- | --- |
| DeepSeek | 思考＋tools流程须保留并按要求完整回传`reasoning_content`；strict工具使用独立Beta端点和受限Schema，不能自动切换启用 | 用户核查＋官方页面只读抽查；非`LIVE_VERIFIED` |
| GLM | 按模型/端点区分思考开关、保留式思考、`clear_thinking`、推理续接和`tool_choice` | 用户已核查；本次抓取器未读到页面，实施前复核 |
| Qwen/百炼 | `enable_thinking`等扩展按模型发送；流式与非流式分别判定，并允许表达“仅流式” | 用户核查＋官方页面可访问；非`LIVE_VERIFIED` |
| Kimi | 不同代际的思考参数和保留规则不同；工具循环不能丢失必要助手消息和`reasoning_content` | 用户核查＋官方页面可访问；非`LIVE_VERIFIED` |
| MiniMax | 保留`reasoning_split`、`reasoning_details`和完整工具消息回传的表达能力 | 用户核查＋官方页面可访问；非`LIVE_VERIFIED` |
| Gemini | OpenAI兼容层的专用思考配置与续接签名须作为受控扩展处理 | 用户核查＋官方页面可访问；非`LIVE_VERIFIED` |
| Claude | 兼容层可能忽略参数或限制功能，不报告为完整原生支持；长期完整接入另评估Messages API | 用户核查＋官方页面可访问；非`LIVE_VERIFIED` |

模型能否用于普通助手、思考工具循环、纯总结、仓储员或embedding，应按角色必需能力分别判断。缺少必需能力的角色进入“不可用/等待配置”，不能假装正常运行；固定整理输出不要求模型具备完整通用工具循环。

## 7. 记忆、事件与事项契约

### 7.1 记忆写入

- 用户明确记住/纠正：直接进入符合权限的有效路径并回执；不排队等待仓储员。
- 用户直接陈述与忠实归纳：可低干扰生效，保留来源、性质、时间和适用范围。
- 新增推断：可保存为推测/观察，但不得冒充确认事实；低价值推测可以不保存。
- 助手连续性记忆由本助手维护；全局资料增量进入待整理区，由仓储员统一整理。
- 用户编辑优先于旧作业重试；成功提交前不能报告全局记忆已生效。

### 7.2 删除与防复活

删除命令首先区分意图：

- 回收聊天原文但保留已接受派生信息；
- 删除记忆表示；
- 删除信息/撤回依据并处理相应原文、事件、摘录、历史版本和索引；
- 删除正式事项或外部业务对象（独立权限，不由聊天/记忆清理连带执行）。

删除抑制和用户纠正是事务权威状态。压缩、重建、旧来源扫描、索引恢复和失败作业重试必须先检查当前抑制与版本，不能使旧结论复活。

### 7.3 待确认事项

推荐／待评审状态：

```text
DRAFT_PROPOSAL
  → DISCUSSING → DRAFT_PROPOSAL
  → ACCEPTED → 正式事项生命周期
  → REJECTED
  → DEFERRED
  → STALE
```

- 每次协商更新同一提案版本；确认操作引用用户当前看到的版本。
- 提案未接受前不进入完成率、逾期统计、正式提醒或日历占用。
- 同一旧来源被否决后不得反复生成重复提案；新信息可形成新建议，但不能推导永久拒绝类别。
- 其他助手不自行改写发起助手的提案；跨助手接管后续决定。

## 8. 业务操作状态与恢复

### 8.1 模型请求和业务操作分离

`model_request_id` 与 `operation_id` 不相同。一个模型请求可提出零到多个操作；模型重试不得复用“未核查的业务执行路径”再次产生副作用。

推荐／待评审的模型请求状态：

```text
QUEUED → SENDING → STREAMING → COMPLETED
                      ├─ FAILED
                      ├─ CANCELLED
                      └─ INTERRUPTED_WITH_PARTIAL_OUTPUT
```

推荐／待评审的业务操作状态：

```text
PREPARED
  → DISPATCHING
    → SUCCEEDED
    → CONFIRMED_NOT_APPLIED
    → RESULT_UNKNOWN → VERIFYING → SUCCEEDED / CONFIRMED_NOT_APPLIED / NEEDS_USER
  → CANCELLED_BEFORE_DISPATCH
  → BLOCKED_BY_CURRENT_STATE
```

### 8.2 本地事务操作

- 稳定 operation ID 和当前对象版本先由可信侧确定。
- 对纯本地 SQLite 操作，业务变更和 `SUCCEEDED` 结果优先在同一事务提交。
- 若准备记录单独提交而业务事务未提交，恢复可判定为未发生；不得把 `PREPARED` 当成功。
- 提交时使用当前版本或等效并发检查，避免恢复覆盖用户后续修改。

### 8.3 Markdown 与外部操作

- SQLite 不能为 Markdown 文件或未来外部应用提供跨资源原子保证。
- 写入前记录意图、目标版本和可核查标识；安全替换、版本对应和失败恢复在记忆任务中细化。
- 外部调用若无法通过查询或幂等键核查，崩溃窗口后保持 `RESULT_UNKNOWN` 并提示，不盲目重做。
- “幂等”必须来自程序契约和受控测试；模型判断不构成证明。

### 8.4 取消、撤权与配置变化

- 当前执行段固定端点、协议、模型、模式和 adapter version，但每次新外发和业务提交都重新检查当前授权与连接状态。
- 普通配置变更下段生效；撤权、连接禁用/删除、凭据删除立即阻止后续步骤。
- 取消停止未派发工作并尽力中断在途请求；实际已发生或未知的业务结果如实展示。
- 已完成操作的撤销是独立业务动作，按当前状态和权限处理，不自动执行反向写入。

## 9. 并发、预算与后台边界

- 后台模型工作必须先有功能、Provider、数据范围和预算配置；授权后按规则运行，不逐批弹窗。
- 预算至少可限制调用数、输入/输出或处理量；达到上限后保留待处理状态，不换模型或无限重试。
- 仓储员和各助手压缩都受限；仓储员不能改 Prompt 边界、权限、工具列表、调用上限或接收方。
- 同一业务对象的作业使用版本/租约或等效机制避免并发覆盖；具体实现待任务评审。
- 模型/SQLite 同步工作是否进入 worker 由真实响应性验证决定，不预设“全部主线程”或“全部 worker”。

## 10. 安全、迁移与日志

- 凭据引用和业务数据分离；不把 Key 写入数据库导出、日志、普通配置或版本控制。
- 临时凭据只存在本次应用运行期；关闭窗口但托盘驻留时可继续，明确退出或重启后失效。
- 连接测试使用合成内容，明确是否真实计费；不得自动携带助手历史和个人资料。
- 日志默认本地、不得进入源码版本控制，不记录严格临时正文；详细诊断需另行授权。
- 数据 Schema 迁移必须具备版本、前置检查、失败停止和恢复契约；更新程序不等同于重置数据。
- 普通 Markdown 导出不宣称包含权限、来源、删除抑制、凭据或完整恢复状态。

## 11. 本机环境、Git 与远程约束

本节记录 2026-09-02 有限预检形成的稳定边界；逐项命令、退出码和耗时证据见
[001-project-foundation.md](tasks/001-project-foundation.md#2026-09-02-有限预检证据)。这些事实不构成初始化、Git 写入、依赖下载或发布授权。

### 11.1 当前工具与运行环境

- 当前观测环境为 Windows 25H2、build `26200.9168`、x64；注册表 `ProductName` 仍返回旧式 `Windows 10 Home China` 标签，因此不以该标签单独判定产品版本。
- 当前 shell 是 Codex 随附的 PowerShell Core `7.6.4` x64。实际解析到 `D:\Git\Git\cmd\git.exe`、`D:\nodejs\node.exe` 和 `D:\nodejs\npm.ps1`，版本分别为 Git `2.51.2.windows.1`、Node `24.18.0`、npm `11.16.0`。
- `PATH` 中另有 Codex 随附 Git；npm 同一安装目录还暴露 `npm.cmd` 和无扩展名入口。初始化和验证必须记录实际解析来源，不能只写版本号；本机 Node 仍不能替代 Electron 内嵌 Node 证据。
- `ELECTRON_RUN_AS_NODE` 当前在进程、用户和机器三个范围均未设置；其他已检查的 Electron 启动/下载变量也未设置。AIbrowse 的旧记录只证明该问题曾发生。任务 002 已在测试子进程中局部清除该变量并验证实际 Electron 模式；未来正式工程与打包验证仍应沿用这一做法，不修改用户或系统环境。

### 11.2 Git 本地状态与稳定规则

- `D:\Mashiro` 当前不在任何 Git 工作树、父级仓库、worktree common dir 或 superproject 中；没有本地分支、HEAD、提交、remote 或仓库级配置。未执行 `git init`。
- 当前系统 `init.defaultBranch=master`；本项目推荐／待评审使用 `main`，若获批准应以项目初始化命令显式选择，不修改全局或系统默认值。GitHub 外部元数据中的 `default_branch=main` 只是命名线索，不能证明远程已有提交或本地已初始化。
- 当前提交身份的 name/email 均已配置，但值未读取进文档；未配置 `user.signingKey`、`commit.gpgSign` 或 `tag.gpgSign`。是否创建基线提交仍须单独授权。
- 当前系统 `core.autocrlf=true`，`core.eol`、`core.safecrlf` 和 `core.hooksPath` 未设置；未发现 URL rewrite、活动 include 或 `safe.directory=*`。初始化冻结时应评审项目级换行契约（推荐用受审阅的 `.gitattributes`），初始化后重新检查仓库级/条件配置并执行 `git diff --check`。

### 11.3 精确远程地址与访问边界

未来远程地址按用户给出的大小写和拼写原样保留：

| 拟议名称 | 精确 URL | 当前状态 |
| --- | --- | --- |
| `github` | `https://github.com/Molotov0cocktail/Mashiro.git` | 仅规划；未配置 |
| `gitee` | `https://gitee.com/Molotov0coaktail/mashiro.git` | 仅规划；未配置 |

- `github`/`gitee` 只是拟议 remote 名；未设置默认 fetch/push 目标。配置 remote、验证认证、push、双远程同步和发布是不同授权。
- 按 [Git 官方配置](https://git-scm.com/docs/git-config) 使用的代理键是 `http.proxy`；当前全局仅存在自定义 `https.proxy=http://127.0.0.1:7890`，进程级 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` 均未设置。该自定义键不能作为 Git 已走代理的证据，也不得复制为 Mashiro 规则。
- 当前未发现两个目标 URL 的 `insteadOf`/`pushInsteadOf` 重写、额外 HTTP header 或 TLS 关闭设置；URL 展开结果与精确地址逐字符一致。TLS 验证保持默认开启，当前 Git 使用系统配置的 OpenSSL backend 和 CA 文件；匿名预检显式禁用了 credential helper 与交互提示，未提取凭据。
- 2026-09-02 本机有限预检中，GitHub 使用命令级 `http.proxy=http://127.0.0.1:7890` 读取成功；Gitee 在非沙箱复核中显式直连读取成功。两者的 `git ls-remote --symref ... HEAD refs/heads/*` 均退出 `0` 且无匹配引用。按 [git-ls-remote 官方语义](https://git-scm.com/docs/git-ls-remote)，这只证明当次能够与仓库读取端点通信，不证明 push 权限、未来可达性或已有提交。
- AIbrowse 的代理和 Electron 记录、Clender 的全局代理指令仅作历史线索；两者互有冲突，不能成为 Mashiro 的现行命令。任何未来远程操作前都应重新核对 URL 重写、接收方、代理和权限，不修改全局配置来解决项目问题。

### 11.4 下载链路分离

- npm 当前有效 registry 为 `https://registry.npmjs.org/`、`strict-ssl=true`，npm proxy/https-proxy/cafile/noproxy 均未设置，目标目录、用户和全局 `.npmrc` 均不存在；这只是配置读取，不是包下载成功证据。
- `ELECTRON_MIRROR`、`ELECTRON_GET_USE_PROXY` 和相关自定义下载变量均未设置。Electron 官方说明 npm 包获取之外还会由 `@electron/get` 下载二进制，因此 npm registry、Electron 二进制、GitHub 仓库和 Provider 是不同网络目标。
- 任务002已在`%TEMP%\mashiro-002-node-sqlite-qualification-20260902-001`隔离根执行官方npm registry依赖恢复和Electron `44.1.1`官方GitHub二进制下载：npm无npm代理，Electron下载子进程按已验证约定使用`HTTP_PROXY`/`HTTPS_PROXY=http://127.0.0.1:7890`与`ELECTRON_GET_USE_PROXY=1`；未使用镜像，TLS和checksum保持启用。该结果只证明当次资格实验链路，不证明未来正式项目`npm ci`或其他版本持续可达。
- Provider调用仍未执行。未来正式初始化依赖授权仍须列出npm与Electron下载目标、代理、cache和失败停止条件，不静默换镜像或关闭TLS。

### 11.5 任务002限定资格结果

- 2026-09-02，Electron `44.1.1` browser/main实际报告内嵌Node `24.19.0`、SQLite `3.53.3`；源码`DEV_RUNTIME`与electron-vite main-only `BUILT_PREVIEW`均通过创建/读写、提交/回滚、中文空格路径、句柄释放、错误后恢复和独立Electron进程重启持久化。
- 普通用户、真实存在且可读取的隔离ACL夹具在仅RX时返回SQLite errcode `14`且未创建或回退数据库；测试后ACL reset退出0、继承恢复、目录为空。
- 10,000行×256中文字符、100行/批的最终结果：DEV总`311.9337 ms`/最大批`3.6567 ms`/最大heartbeat间隔`18.2886 ms`；BUILT为`323.6616 ms`/`9.1945 ms`/`24.0562 ms`，均通过任务预先冻结阈值。该结果支持近期小批次让出事件循环，不冻结所有存储工作永久位于main线程。
- 独立Reviewer最终`PASS`。完整命令、失败尝试、hash和边界见[任务002](tasks/002-node-sqlite-qualification.md#final-evidence)。`PACKAGED`、正式安装位置、升级卸载、迁移、多实例/并发和崩溃恢复仍未验证。

## 12. 近期测试 oracle

### 12.1 初始化候选共通

- renderer 无法调用未暴露 IPC，非法输入在可信侧拒绝。
- 真实 Electron 进程可启动，错误可理解，不是静态网页测试代替。
- 持久化候选必须关闭重开后仍得到同一稳定身份和状态。
- 测试、类型、lint、格式、构建、启动结果分别记录，未运行标记 NOT RUN。

### 12.2 执行安全

- 业务已提交但回复中断，不重复创建。
- 结果未知时不盲目重跑。
- 取消或撤权后不派发新操作。
- 改模型不改变助手身份，不混发厂商续接字段。
- 用户修改或删除后，恢复不覆盖新状态。
- 严格临时数据不能在重启后从执行快照恢复。

### 12.3 Provider 资格测试

- 普通、流式、思考、工具、思考＋多轮工具、结构化输出、输出限制和用量分别判定。
- 至少完成：模型提出无副作用工具 → 应用执行 → 回传结果 → 模型继续回答。
- 分段 tool arguments 必须完整组装，缺失 usage 标记未知，不重复累计缓存或推理 token。
- 认证、额度、配置、能力缺失和临时故障分类；一次 400 或超时不永久标记不支持。

## 13. 集中决议记录

### 13.1 编号规则与 D-070 重号处理

早期对话曾使用连续 `D-nnn` 编号，但完整原始表不在当前工作区。当前可确认的历史编号如下：

| 历史编号 | 保留含义 | 状态 | 处理 |
| --- | --- | --- | --- |
| D-023 | 新增推断不得作为用户确认事实正常召回 | CONFIRMED | 原号保留 |
| D-062 | 聊天/记忆清理须区分原文回收与删除信息/撤回依据 | CONFIRMED | 原号保留 |
| D-070 | 生命周期参数：容量、期限、垃圾区自动清空等 | OPEN | 原号保留，不被运行形态覆盖 |
| D-070（后发重号） | Windows 单桌面应用运行形态 | CONFIRMED | 弃用该重号，规范编号改为 ARC-001 |

从本草案起，使用主题前缀规范编号。此前对话中临时使用的 D-071～D-097 只作为别名保留；若用户提供更完整的原始决议表，以显式映射方式合并，不能静默覆盖。

### 13.2 产品与助手

| 规范编号 | 决议 | 状态 | 依据/旧别名 | 再决策点 |
| --- | --- | --- | --- | --- |
| PRD-001 | 私人助理定位，持续日常对话为主入口 | CONFIRMED | 用户确认 | 定位变化时 |
| PRD-002 | 首个日常版本含对话、真实 Provider、初级记忆、事项/承诺和基本提醒 | CONFIRMED | 用户确认 | 里程碑变更时 |
| PRD-003 | 单用户、本机数据权威，无账号/服务器/同步要求 | CONFIRMED | 用户确认 | 同步或多用户任务前 |
| PRD-004 | 本阶段 UI 只要求可读、可操作、状态/错误可理解 | CONFIRMED | 用户确认 | 视觉设计任务前 |
| AST-001 | 基础多助手，稳定身份、唯一时间线、归档与主助手 | CONFIRMED | 用户确认 | 生命周期任务前补归档接替 |
| AST-002 | 名称、基础形象、人设、Provider/模型和数据范围可配置 | CONFIRMED | 用户确认 | 权限细化任务前 |
| AST-003 | 助手读取权与 Provider 外发权分离 | CONFIRMED | 用户确认 | 权限设计变更时 |
| AST-004 | 严格临时模式无正常上下文读取和业务持久化 | CONFIRMED | 用户确认 | 临时模式实现前细化保存流程 |
| AST-005 | 多主助手讨论、并行和复杂调度后置 | DEFERRED | 用户确认 | 实验任务立项时 |
| AST-006 | 助手永久删除语义 | OPEN | 用户明确未选择 | 助手删除实现前 |
| AST-007 | “读取既有上下文但不留档”和“留聊天但不提炼记忆”作为不同临时交流候选 | DEFERRED | 用户确认 | 临时交流扩展任务前 |

### 13.3 记忆、事件与保留

| 规范编号 | 决议 | 状态 | 依据/旧别名 | 再决策点 |
| --- | --- | --- | --- | --- |
| MEM-001 | 用户陈述/忠实归纳可低干扰生效，推断保持推测 | CONFIRMED | 含 D-023 | 语义规则变化时 |
| MEM-002 | 默认收起的来源/变更面板，区分提供与实际使用 | CONFIRMED | 用户确认 | UI任务前 |
| MEM-003 | 纠正/删除后退出召回并防止旧来源复活 | CONFIRMED | 用户确认 | 删除实现前 |
| MEM-004 | 助手管理连续性记忆，仓储员统一整理全局 Markdown 分支 | CONFIRMED | 用户确认 | 记忆任务前细化工具/预算 |
| MEM-005 | Markdown 承担语义正文，事务存储承担身份/权限/版本/状态，索引可重建 | CONFIRMED | 用户确认 | Schema冻结前 |
| MEM-006 | 应用内编辑优先，外部 Markdown 显式重载和验证 | CONFIRMED | 用户确认 | 外部编辑实现前 |
| MEM-007 | 可选独立 embedding，只辅助检索并受权限/预算约束 | DEFERRED | 用户确认方向 | 检索任务前 |
| EVT-001 | 记录可追溯个人事件，区分计划、安排、报告发生、完成和未知 | CONFIRMED | 用户确认 | 事件 Schema 前 |
| EVT-002 | 可从多事件形成客观观察或待核验习惯推测 | CONFIRMED | 用户确认 | 整理算法任务前 |
| RET-001 | 事件/记忆采用持久、暂存、垃圾三区 | CONFIRMED | 用户确认 | 生命周期任务前 |
| RET-002 | 持久区不自动降级；垃圾区退出召回但可恢复 | CONFIRMED | 用户确认 | 配额实现前 |
| RET-003 | 助手可按规则整理聊天并受控回收旧原文 | CONFIRMED | 用户确认 | 原文回收任务前 |
| RET-004 | 回收前先保存接受结果并检查未完成依赖 | CONFIRMED | 用户确认 | 原文回收任务前 |
| RET-005 | 原文回收与信息删除/撤回依据分离 | CONFIRMED | D-062 | 删除任务前 |
| RET-006 | 助手/时间线支持按消息、区段和时间线清理 | CONFIRMED | 用户确认修订 | 删除任务前细化意图 |
| RET-007 | 容量、期限、自动清空和具体清理参数 | OPEN | D-070 | 生命周期任务冻结前 |

### 13.4 事项、提醒与操作

| 规范编号 | 决议 | 状态 | 依据/旧别名 | 再决策点 |
| --- | --- | --- | --- | --- |
| ITEM-001 | 目标、项目、任务、承诺和等待事项使用统一正式系统 | CONFIRMED | 用户确认 | Schema冻结前 |
| ITEM-002 | AI 推测形成待确认提案，不自动成为正式事项 | CONFIRMED | 用户确认 | 提案任务前 |
| ITEM-003 | 明确用户指令按权限低干扰执行；高影响/删除/批量仍确认 | CONFIRMED | 用户确认 | 权限任务前 |
| ITEM-004 | 提案保留发起助手稳定身份，其他助手不自行改写 | CONFIRMED | 用户确认 | 跨助手接管前 |
| REM-001 | 托盘常驻、登录启动可选、休眠/重启受控补发、明确退出无保证 | CONFIRMED | 用户确认 | 提醒实现前 |
| REM-002 | 补发、合并、过期的具体默认值 | DEFERRED | 用户确认 | 提醒任务冻结前 |
| EXEC-001 | 模型工具调用只提出意图，应用统一校验并执行 | CONFIRMED | D-088 | 工具任务前 |
| EXEC-002 | 协议段按需保留，受删除、撤权和临时凭据约束 | CONFIRMED | D-092/D-093 | 状态机评审时 |
| EXEC-003 | 持久化执行状态，结果未知先核查；幂等性由程序证明 | CONFIRMED | D-094 | 状态机评审时 |
| EXEC-004 | 本地事务不扩大为跨 Markdown/外部服务原子性 | CONFIRMED | D-095 | 存储任务前 |
| EXEC-005 | 模型重试与业务恢复分离 | CONFIRMED | D-096 | Provider/操作任务前 |
| EXEC-006 | 执行段固定接收方语义，撤权即时重新检查 | CONFIRMED | D-097 | Provider/权限任务前 |

### 13.5 Provider、权限、日志与用量

| 规范编号 | 决议 | 状态 | 依据/旧别名 | 再决策点 |
| --- | --- | --- | --- | --- |
| PVD-001 | 多个可复用 OpenAI-compatible 连接，连接与助手模型分离 | CONFIRMED | 用户确认 | Provider Schema 前 |
| PVD-002 | Windows 保护持久凭据＋本次运行临时凭据，不明文降级 | CONFIRMED | 用户确认 | 凭据任务前 |
| PVD-003 | 外发为任务需要、读取权、接收权交集；每次调用校验 | CONFIRMED | 用户确认 | 权限实现前 |
| PVD-004 | Chat Completions优先，有限内置适配，不静默切换端点 | CONFIRMED | D-084/D-086 | Provider任务前 |
| PVD-005 | DeepSeek/GLM优先，Qwen/Kimi差异审查，其余后续 | CONFIRMED | D-084 | 适配路线变化时 |
| PVD-006 | 文档/本地测试/真实端点验证分级并绑定实际接收方 | CONFIRMED | D-085 | 能力记录实现前 |
| PVD-007 | 本地时间线和上下文权威，远端会话不作为长期连续性依赖 | CONFIRMED | D-087/D-091 | 原生协议任务前 |
| PVD-008 | 普通/流式/思考/工具/结构化输出/用量分项验证 | CONFIRMED | D-089 | 资格测试任务前 |
| PVD-009 | 流式中断不自动完整重发，SDK与应用重试不得叠加 | CONFIRMED | D-090 | 客户端冻结前 |
| LOG-001 | 用户来源记录、业务记录、运行日志分责；默认无正文和秘密 | CONFIRMED | 用户确认 | 日志任务前 |
| LOG-002 | 运行状况页面区分历史错误与当前故障并合并后台重复错误 | CONFIRMED | 用户确认 | UI任务前 |
| USE-001 | 用量按助手/Provider/模型/功能区分，实际/估算/未知分开 | CONFIRMED | 用户确认 | 计量任务前 |
| USE-002 | 后台调用受显式授权和可执行预算限制，达到上限停止新增调用 | CONFIRMED | 用户确认 | 后台任务前 |

### 13.6 架构、工程与集成

| 规范编号 | 决议 | 状态 | 依据/旧别名 | 再决策点 |
| --- | --- | --- | --- | --- |
| ARC-001 | 单一 Windows Electron 桌面应用，无独立服务 | CONFIRMED | 后发重号 D-070，已更正 | 运行形态变化时 |
| ARC-002 | Electron＋TypeScript＋React；sandbox/context isolation/窄IPC | CONFIRMED | D-071/D-072 | 技术栈变化时 |
| ARC-003 | 程序和数据位置分别可选，支持安装目录下 data | CONFIRMED | D-073 | 安装器任务前 |
| ARC-004 | 数据路径失败不静默回退；更新卸载默认保护数据 | CONFIRMED | D-074～D-076 | 安装器任务前 |
| ENG-001 | npm、精确直接依赖、提交 package-lock、npm ci用于干净恢复 | CONFIRMED | D-077 | 初始化冻结前锁版本 |
| ENG-002 | Node 24开发主版本，和Electron内嵌Node分开记录 | CONFIRMED | D-078 | 初始化验证时 |
| ENG-003 | electron-vite v5系列，精确版本按engines/peer/release/实测锁定 | CONFIRMED | D-079 | 初始化冻结/安装时 |
| ENG-004 | SQLite方向；`node:sqlite`已在Electron `44.1.1`的DEV/main-only BUILT范围通过资格，`better-sqlite3`仍为受阻备选 | QUALIFIED（限定范围） | D-080/D-081；任务002 Reviewer PASS | Electron/内嵌Node、架构、关键API或执行位置改变时重新验证；PACKAGED另设门禁 |
| ENG-005 | 本次初始化最小闭环选择F1“本地助手身份与持久化生命周期” | CONFIRMED | 用户2026-09-02明确接受；实施未授权 | 初始化冻结范围变化时 |
| ENG-006 | Git本地初始化、基线提交、实际配置remote和任何push授权 | OPEN | 尚未授权 | 初始化冻结前 |
| ENG-007 | 依赖安装和网络范围 | OPEN | 尚未授权 | 初始化冻结/实验授权前 |
| ENG-008 | 未来远程地址精确为GitHub `https://github.com/Molotov0cocktail/Mashiro.git` 与Gitee `https://gitee.com/Molotov0coaktail/mashiro.git` | CONFIRMED | 用户明确提供；2026-09-02匿名读取预检 | 实际配置remote前复核 |
| ENG-009 | 本地默认分支采用`main` | OPEN（推荐`main`） | 系统默认为`master`；GitHub外部元数据为`main`但无引用 | 初始化冻结前 |
| ENG-010 | remote名使用`github`/`gitee`，且不设置默认推送目标 | 推荐／待评审 | 用户允许作为拟议名称；当前未配置 | 实际配置remote前 |
| LANG-001 | 中文产品/规划/UI优先；标识符、命令、配置/API字段英文；必要业务注释中文 | CONFIRMED | 用户确认 | 国际化任务前 |
| INT-001 | AIbrowse与Clender保持只读独立，当前不连接/迁移/改造 | CONFIRMED | 用户确认 | 集成任务立项时 |
| INT-002 | 邮箱、日记、阅读、游戏、观影等个人数据源后置且逐源授权 | DEFERRED | 用户确认 | 各数据源任务前 |
| DIST-001 | 安装器、更新器、卸载保护和数据迁移后续独立选择验证 | DEFERRED | 用户确认 | 发布准备阶段 |

## 14. 文档评审后需决定的少量事项

1. F1已被选择，但其具体字段、正式目录/依赖和实施命令仍须在初始化冻结清单中确认。
2. [任务002](tasks/002-node-sqlite-qualification.md)已在限定范围`QUALIFIED`；若冻结候选超出该版本/环境/执行边界则重新验证。
3. 初始化冻结前确认正式依赖下载范围、本地分支`main`建议、本地初始化、基线提交，以及是否实际配置两个remote；任何push仍需独立授权。

助手永久删除、生命周期数值、提醒补发参数、完整 Provider 真实验证及安装更新系统均不应被伪装为当前初始化阻塞项。

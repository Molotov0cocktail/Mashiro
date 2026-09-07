# 013 日常观察 UI 轻量实施计划

日期：2026-09-07  
规划者：`steward_013_ui`，实际 `gpt-5.6-sol/high`  
状态：等待 trusted 冻结 shared DTO 后执行 renderer；本文不修改产品、全局进度或竞争任务系统。

## 用户入口与闭环

App 增加一个清楚的一级入口“日常与运行”，面板内使用六个可键盘操作的子入口。现有“章节后台”“资料整理”“事项”“提醒”继续保持独立入口，不合并语义。

| 子入口 | 用户流程 | 必须看见的真实边界 |
| --- | --- | --- |
| 多事件观察 | 配置负责助手、连接/模型、事件/记忆范围、观察窗口、触发时间、预算和允许保存动作；预览下一次运行；立即运行或等待周期；查看观察；按当前版本接受、纠正或拒绝 | 客观观察与 `inference` 分开；事件状态、已知/未知发生时间、覆盖区间、独立依据根数量、provided/cited 来源；不足两个独立根显示“依据不足”；接受后显示真实 memory ID/version，拒绝后显示稳定抑制回执 |
| 每日简报 | 选择当地日、时间、资料范围和预算；查看重点、正式事项、未完成话题与缺失信息；把建议打开到既有提案页 | 零资料显示无调用完成回执；未接受提案不计入正式事项；不把无记录解释为没有发生 |
| 晚间复盘 | 选择当地日与触发时间；查看已报告发生/完成、正式事项真实变更、未完成内容；确认或纠正待确认解释 | planned/arranged 不冒充完成；事实与解释分栏；解释保持待核验性质；来源失效后正文立即清除 |
| 每周规划 | 显式选择周起始日、IANA 时区、当地时刻、恢复策略、范围和预算；查看有来源的安排建议；打开关联提案处理 | 不声称核实空闲或写入日历；建议只形成 `DRAFT_PROPOSAL`；接受、拒绝、延期、讨论沿用 ItemPanel 当前版本操作 |
| 截止与变更 | 配置前瞻窗口、要跟踪的字段和变更合并策略；查看到期事项及字段前后版本；打开正式事项或建议提案 | 未接受提案不算确定截止；提示不创建 reminder；删除/完成/取消及标题、截止变化显示实际版本和消费范围 |
| 运行中心与分类用量 | 按助手/内部角色、Provider、模型、功能、时间和状态筛选；查看当前待处理/故障、历史、业务回执和用量；打开所属功能执行取消、核查或重试 | 当前状态不被日志等级隐藏；实际 token、估算处理量、未知请求分栏；PARTIAL/REMOTE_UNKNOWN/预算暂停和稳定 attempt/command 身份可查；所有列表完整分页 |

每个功能页采用相同的顺序：配置与缺项 → 下一 occurrence 预览 → 当前 job/立即运行 → 结果列表 → 详情、来源和用户动作。配置不完整或关闭时保持零调用。来源详情默认收起；正文只在用户明确打开详情后读取。

## shared DTO 冻结前必须补齐的接缝

合同已覆盖六类用户结果的语义，但 §8 的建议 API 名单还不能独立完成 UI 闭环。trusted 冻结时需要显式给出以下字段与有限动作；具体 schema 名由 shared 作者决定。

1. **功能与配置**：`feature` 固定为 observation、daily-brief、evening-review、weekly-plan、deadline-change；配置含稳定 ID/version、负责 assistantId、connectionId、recipientFingerprint/授权状态、model、逐类 dataScope、UTC-day calls/inputCharacters、maxOutputTokens、IANA timeZone，以及按 feature 区分的 trigger/recovery 设置。保存输入含 expectedVersion 与 `grantSelectedRecipient`；连接、指纹或模型变化不能沿用旧 grant。
2. **可信时间预览**：配置/预览结果返回 nextRun instant、当地显示值、period/occurrence 稳定键、DST 重叠/空隙状态和需要用户选择的有限选项。renderer 不自行把当地时间换算为权威 instant。
3. **分页查询**：配置只有有限五项；jobs、report summaries、observations/sections、proposal links 和来源分别具备 cursor/nextCursor。若一个 query 返回多个可增长集合，应返回各自 nextCursor 或采用 `view` 判别查询，不能让一个共享 cursor 静默截断其他集合。
4. **job 与控制**：job 含 id/version、feature、authorityAssistantId、配置版本/身份、period/occurrence、状态、原因、attempts、预算状态和稳定 slots。`control` 只接受带 expectedVersion、commandId 的 cancel、inspect、retry、retry-unknown；返回真实 snapshot/receipt，不能用成功提示代替业务回执。
5. **报告摘要与详情**：summary 含 id/version、governanceVersion、feature、period、状态、未读、正文是否可读、生成时间、实际角色和范围/截断说明。`inspect` 必须带 expectedVersion、cursor，返回页级 Markdown/结构化事实、observations、provided/cited sources、proposal links、nextCursor；治理变化统一 `STALE_WRITE`。
6. **观察决定**：需要独立、可信的有限 mutation，而不让 renderer 拼来源 DAG。输入至少含 report/observation 当前版本、commandId、accept/correct/reject 动作及纠正内容；输出含决定的新版本、稳定 suppression 身份或真实 memory receipt。Memory 写入和观察决定按合同共同提交；旧回执不能覆盖用户后续纠正。
7. **未读确认**：阅读详情不应隐式产生难以重试的副作用。提供带 report expectedVersion 与稳定 commandId 的 `mark-read`/ack 回执，或在合同中明确等价的幂等确认方法。
8. **提案接缝**：详情返回真实 proposal id/version/state/originAssistantId/acceptedItemId，不返回可伪造的动态 API 名。UI 只导航到 ItemPanel；提案接受、拒绝、延期、讨论和 revise 继续走 ItemApi。
9. **截止变更消费**：DTO 明确本次扫描的 from/to item versions、选定字段、合并策略、checkpoint/receipt 和空周期 `modelSkippedReason`，避免把“生成报告”“用户已读”和“已消费版本”混为一个布尔值。
10. **operations/usage**：operations query 返回可分页的 current、failure groups、history、business receipts，记录稳定 owner domain/id 供 UI 导航；usage query 返回过滤条件快照、聚合和分页 attempts。attempt 需冻结 actor/assistant、connection/fingerprint、model、feature、chainId、时间、状态、inputCharacters、actual token 可空字段、unknown reason、估算算法版本；没有价格依据不返回伪账单。
11. **changed 与错误**：daily/operations changed 至少含单调 revision 和受影响 domain/feature/id/version，使 renderer 能先失效正文、导出和分页再刷新。稳定错误覆盖 INVALID_INPUT、NOT_FOUND、STALE_WRITE、PERMISSION_DENIED、CONFIGURATION、BUDGET_EXHAUSTED、RESULT_UNKNOWN、STORAGE_UNAVAILABLE。

因此，合同没有缺失新的用户功能类别；需要补的是共享 DTO 对既定闭环的可执行表达，重点是观察决定、已读确认、提案定位、独立分页、时间预览和变更 checkpoint。

## 现有 App 整合方案

- 将 `activeView` 增加 `daily`，一级 tab 显示“日常与运行”。桌面导航从固定七列调整为能容纳八项的可读网格，现有窄屏两列规则可复用。
- 新建单一 `DailyPanel`，内部六 tab；不要创建六个一级页面或六套重复配置组件。五个功能共享配置/job/report 骨架，各自用判别联合呈现专属字段和结果。
- `DailyPanel` 接收 `assistantSnapshot`、冻结后的 `dailyApi`、`operationsApi`、`providerApi`，以及 `onOpenProposal`、`onOpenItem`、`onAttentionChange` 回调。观察决定由 daily trusted API 完成，renderer 不直接制造 Memory 来源或接受回执。
- App 新增通用 item/proposal 外部定位目标。`ItemPanel.openItemTarget` 扩展为 `{ type: 'item' | 'proposal', id, assistantId, nonce }` 或新增等价窄 prop；打开周规划建议时切换到事项页的 proposals 视图并定位真实版本。正式截止行则定位 item。
- `DailyPanel` 即使其 section hidden 也订阅 changed 并报告 unread/current-fault 数量，一级 tab 显示可访问的数量提示，使用户在对话页也能发现新结果。只保留一个 changed 订阅和一个 attention 汇总来源。
- 每个 query/inspect/export 记录 panel generation、feature、对象 version、governanceVersion 和请求 serial；切子入口、切筛选、切助手标签或 changed 时使旧请求失效。正文、来源、分页和导出缓存随治理版本清空；用户已编辑的纠正草稿保留原 CAS 并禁止提交，直到用户明确重载。
- busy 状态按 `domain:id:version:action` 保存，不跨 feature 或 App route 卡住。未知业务动作的 commandId 保留到明确回执；普通刷新不生成新 commandId。
- 运行中心对 daily job 提供有限控制；章节/仓储员/事项/提醒记录只显示“打开对应功能”，由 App 路由到已有面板，不实现任意 domain invoke 或动态 IPC。

## renderer 验证切片

实施时至少覆盖：六 tab 可达与 App 一级入口；配置缺项零调用和连接变更 grant 清空；可信 nextRun/DST 预览；五类真实结果语义；观察接受/纠正/拒绝回执；周规划提案跳转且接受前 formalCount 不变；截止变化前后版本；独立分页；实际/估算/未知用量；PARTIAL/REMOTE_UNKNOWN 控制；未读 badge；A→B→A/feature 切换迟到响应；治理 changed 清正文/导出且旧草稿不能提交。

编码等待 shared DTO 和 preload 类型正式冻结。开始 renderer 时只写 App、DailyPanel、必要样式与 renderer tests；不写 trusted/main/preload、全局文档、E2E 或 Git 提交。

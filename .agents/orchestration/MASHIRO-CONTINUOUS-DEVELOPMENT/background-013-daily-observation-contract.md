# 013 仓储员之后：多事件观察、日常任务与运行用量合同

状态：PLANNED / 待 root 设计复核后实施；PROGRAM ACTIVE。本文件只定义下一增量，不声明已实现或角色资格已通过。规划者为复用的 steward_013_trusted（Astra / medium）；当前没有新建 Agent。仓储员 R3/R4 的 [39 文件冻结候选](steward-013-trusted-manifest-v2.json) 不属于本规划修改范围。

## 1. 来源与范围

正文依据：

- [proposal](../../../doc/proposal.md) §2.1 每日简报、晚间复盘、每周规划、截止与变更提醒；§3.3 来源、性质、用户纠正；§3.4 接受前仅提案；§3.5 托盘/恢复/退出承诺；§4.1–4.3 权限交集与治理；§5 外部个人源、日历集成、人格诊断边界。
- [high-level-design](../../../doc/high-level-design.md) §5.3 助手与仓储员分工、§5.5 确定性提醒、§7 保留和依赖、§9 执行一致性、§10 运行状况/日志/分类用量。
- [detailed-design](../../../doc/detailed-design.md) §3.2 时间/性质/有效性等维度独立、§7.1 推测不作事实、§8.2–8.4 稳定执行身份/事务/实际接收方、§9 先配置再调用和可执行预算、§10 日志与迁移；集中决议 EVT-001/002、MEM-001–006、AST-003/004/006、ITEM-001–004、REM-001/002、EXEC-001–006、LOG-001/002、USE-001/002。
- [总覆盖](../../../doc/tasks/program-docs-to-release.md) D07、F06、G02、G03及“关键待决与范围结算”；[013 正式任务](../../../doc/tasks/013-background-and-steward.md) 验收 5–7。本增量是必需产品闭环，不能把某项功能改写成后置占位。

必须交付六个可观察入口：多事件观察、每日简报、晚间复盘、每周规划、截止与变更提示、运行中心及分类用量。章节/仓储员已有结果作为可授权来源和运行记录接缝，不能充当这些功能的实现证据。

## 2. 用户闭环和模型职责

用户在后台设置为每项功能明确选择负责的现有助手、连接/模型、资料范围、时间策略、预算和允许的输出动作，然后启用。没有完整配置时显示缺项并保持零调用。可立即运行一次；这仍使用同一权限、预算和来源校验。用户可阅读结果、展开来源和时间依据、确认或纠正观察、把规划建议送入既有提案流程、暂停/取消/重试任务。主页/运行中心能找到未读结果，不能只有数据库或调试入口。

| 功能 | 输入与真实结果 | 允许的模型输出 |
| --- | --- | --- |
| 多事件观察 | 选定时段内至少两个独立事件根，展示事件状态、发生时间/未知时间、覆盖区间及独立依据数量 | 客观统计/观察与待核验习惯推测分开；可接受为有来源的记忆，不能自动建立人格判断 |
| 每日简报 | 所选当地日的正式事项截止、待办/等待/承诺、明确安排及未完成话题；区分已知与缺失 | 可阅读简报、重点及可选提案；没有资料应如实给出空结果说明，零资料无需模型调用 |
| 晚间复盘 | 所选当地日已报告发生/完成事件、正式事项实际版本变化、仍未完成内容 | 回顾事实、未完成内容及待确认解释；计划过不等于做过，未记录不等于没做 |
| 每周规划 | 显式选择周起始日与当地时段；正式目标/项目/待办及相关已接受资料 | 有来源、带不确定性的安排建议，先成为 DRAFT_PROPOSAL；不声称核实空闲，不写日历 |
| 截止与变更提示 | 明确前瞻窗口内正式事项的到期，以及自上次已消费版本以来标题/状态/截止等选定字段变化 | 说明具体前后版本及影响；可建议后续提案，不自动修改原事项或生成正式提醒 |

这些任务由“现有助手的后台功能角色”执行，配置可与该助手聊天模型不同，实际接收方必须单独授权。角色维度为 `assistantId + feature + connectionId + fingerprint + model`；不是新增 assistant，也不伪造普通聊天 round。仓储员继续仅承担已配置共享资料整理；不因日常功能开启而获得私有资料或事项写权。

模型只产生严格结构化结果与有限建议，没有通用工具代理、任意脚本、任意 URL 或改设置能力。每种功能有独立 prompt/schema 和实际角色验证；同一个模型名称不能替代逐功能证据。模型输出的标题、正文、性质、引用 handles、建议内容都有长度/数量上限；本地句柄映射为稳定来源，模型不得自造 ID、权限或完成回执。

## 3. 多事件观察的证据与治理

复用 [008 Memory 契约](../../../src/shared/memory-contract.ts) 的七种事件状态：intention、planned、arranged、reported-happened、completed、cancelled、unknown，保留 occurredAt/timeZone。缺失时间保留未知，不把创建时间冒充发生时间；planned/arranged 仅用于未来计划，不能计入已完成次数。

观察区间采用明确的起止 instant 及 timeZone，显示是“所选资料范围”而不是完整生活记录。多个摘要/事件若回溯到同一原始用户轮只计一个独立依据；重复摘要不产生多次支持。多事件需要至少两个独立依据根，不满足时展示“依据不足”，不能把一次情绪或娱乐偏好升格成习惯。客观计数由可信侧根据事件集合计算，模型只引用已计算字段，不能增添日期、次数或状态。跨日事件按实际发生时间归属，时间未知单列。

结果包含 observations 数组，每条持久保存：稳定 ID/version、正文、nature、evidenceHandles、独立根数量、范围、首次/最近生成时间、当前有效性、用户决定及接受记忆回执。客观归纳也先在观察页可查；用户选择保存时走现有 Memory 治理。推测固定 nature=inference，默认 pending-verification，不自动改成 user-statement；用户确认/纠正用当前版本的用户动作，不能由后台自证。

已接受对象复用 Memory Markdown/接受指针/来源 DAG，推测性质和有效性分开保存。待核验、争议、过期、撤回、抑制不压成一个布尔值；本任务至少实现 pending-verification/active/disputed/withdrawn/suppressed，只有用户显式有效期才使用 expired，不能私设 TTL。沿用既有解释性检索，不引入仍 DEFERRED 的 embedding。

任何来源纠正、删除、撤回、回收、权限失效都使在途候选停止提交；已展示结果立即失效或隐藏正文，并保留可理解的无正文原因。用户拒绝一条观察需写稳定抑制身份，重跑相同来源不得复活；新增真正不同来源才可生成新的候选，并仍保留推测性质。不能用“取消作业”代替已接受记忆的撤回，也不能因来源清理自动消除已保留且有合法 retained edge 的派生对象。

## 4. 权限与真实服务接缝

每次请求、每次本地结果/提案提交都重验“本任务需要 ∩ 当前读取权 ∩ 实际接收方授权”。功能 dataScope 至少细分：本助手正常完整轮、章节/未完成话题、本助手私有已接受记忆、全局已接受记忆、事件、正式事项、未接受提案；每类有明确选择。关闭某类时 entry、context、targets、fallback 全部禁止，沿用仓储独立 R1 的反例要求。

只读已接受的 active/staging-or-persistent 合法对象，严格临时、垃圾区、被抑制对象、其他助手私有正文不入队。明确“事项读取”和“生成提案”各自权限；禁用提案不妨碍纯阅读报告。材料截取和页数限制必须显示范围/遗漏并可继续分页，不能截断后声称完整周回顾或完整资料库。单次预算不足时缩小范围须由用户选择或预先显式配置的分片规则决定。

实际接缝：

- [MemoryService](../../../src/main/memory/memory-service.ts) 的 acceptedBackgroundMemory / assertSource、Memory 接受版本及来源；[StewardService](../../../src/main/background/steward-service.ts) 的已冻结 inputs、独立角色预算、稳定 slots 和保守来源/citedSources，作为复用机制而非另起宽权限。
- [ItemService](../../../src/main/item/item-service.ts) 已有 proposeLocal、command 事务及 commitReceipt，现有 ItemExecution/assertAccess 绑定普通助手 endpoint；新后台角色不能不传 execution 以绕过检查，也不能伪造 requestId。实施窄的后台提案执行上下文：可信角色、稳定 job/slot、冻结接收方、当前 read/propose/recipient 检查与同事务回执。普通对话的权限/六 assistant IPC 保持原状。
- 提案使用既有 [ItemProposal/ItemSource](../../../src/shared/item-contract.ts) 及 originAssistantId。报告建议句柄映射为真实上游来源，提案与后台 slot receipt 同事务提交；不得把不存在的 report ID 冒充 memory/round。需要独立报告来源类型时须同时扩展并验证跨域 DAG、删除/保留/导出，不能只让 DTO 接受字符串。
- 用户在既有提案入口 accept/reject/defer/discuss/revise；接受前统计、正式 items、reminders 数量均不增加。报告显示 linked proposal ID 和实际状态，接受后显示正式 item ID；晚到候选、重复请求和重启不能重复建提案。
- [ReminderService](../../../src/main/reminder/reminder-service.ts) 与 [runtime](../../../src/main/reminder/reminder-runtime.ts) 继续从正式 item/reminder 状态确定性运行，不依赖模型、Key 或本任务预算。日常“截止/变更提示”是可阅读报告，不插入 reminder 行；需要正式提醒仍走已有用户创建/确认流程。复用生命周期唤醒信号可行，禁止把日常报告伪装成 DISPATCHING 提醒。

## 5. 时间、调度与稳定状态

设置必须显式给出：feature、enabled、负责助手、模型连接、dataScope、budget、timeZone、触发模式及版本。日任务给当地时刻，周任务给周起始日/星期/当地时刻，观察给窗口与频率，截止提示给前瞻窗口和变更字段集合。时间由可信侧 IANA zone/instant 解析和验证；展示下次运行 instant 与当地时间供用户确认。系统时区变化不默默重写已选区。

恢复策略沿用明确配置路径：UNCONFIGURED 或 EXPLICIT。EXPLICIT 必须填写补跑窗口、积压合并策略、结果过期处理；不从未答 REM-002 推导默认。UNCONFIGURED 遇到睡眠/重启错过的周期停在 RECOVERY_PENDING，显示本次运行/跳过/配置策略。日常功能配置与正式提醒策略分别显示，不能给日常填写策略时暗改已有提醒设置。

夏令时重复或不存在的当地时刻，设置阶段预览并要求显式选择合法 occurrence/跳过策略；用户选定的 instant 进入周期身份。一次 occurrence 只有一个稳定键；时钟回拨不重复，前跳按已配置补跑规则。周起始日必须显式选择，不能隐含周日/周一。明确退出时不承诺执行；托盘、可选开机登录、休眠唤醒后的承诺与 REM-001 一致。

job key = feature/config identity + authorityAssistantId + period/occurrence + input source versions；尝试身份与 job 分开。周期 checkpoint 与成功的结果/消费回执同事务推进。修改配置取消未派发旧任务，在途响应按旧冻结 recipient 结算成本并拒绝过时业务提交；不能换模型后继续旧 job。

公开状态至少含 WAITING_CONFIGURATION、QUEUED、RUNNING、BUDGET_PAUSED、RECOVERY_PENDING、PARTIAL、COMPLETED、CANCELLED、STALE、FAILED、REMOTE_UNKNOWN。每态有中文原因、时间与合法下一动作。结果多 slot 时每项有固定 commandId/argumentsHash、接受/提案回执；中途故障仅恢复未提交项，先查本地回执，不重放成功项。远端未知与本地候选已有区分：未知重试必须是显式操作并保留前次成本；本地候选可零模型恢复。

截止/变更检测先在本地对正式 item 版本做有界扫描，持久保存最后已消费版本。标题/截止改动、完成/取消、删除均按版本反映；未接受提案不能伪装已确定截止。多次变化按用户选择的合并策略保留最终状态及变更范围；没有配置合并不擅自吞掉中间变化。空周期形成可解释的无调用完成回执。

## 6. 预算和分类用量

后台每功能显式 budgets 至少采用现有 UTC-day calls/inputCharacters，并要求输出 maxTokens 上限；预算窗口明确展示 UTC 起止及当地对应时间。预留在 SQL 事务内完成，多个功能/重试不能超出各自限额；若提供共享总预算，实际派发同时满足功能和共享限额。没有显式总预算不可虚构全局费用上限。未知尝试保留预留，不当成零；预算耗尽保留队列，下一窗口或用户改预算才重新检查，不自动换模型。

建立窄的持久 usage attempts 账本，实际 transport 派发前分配稳定 attemptId，派发后记 SENDING/SETTLED/UNKNOWN。分类字段在派发时冻结：真实 assistant/内部 actor、connectionId/指纹、model、feature、chainId、startedAt/finishedAt、状态、输入处理量、actual token 字段或缺失原因。功能至少区分普通对话、工具链、章节压缩、共享发现、仓储整理、事件观察、简报、复盘、周规划、截止变更；连接测试若计入须明确“连接测试”，不能算普通对话。

当前普通对话在 [ProviderService](../../../src/main/provider/provider-service.ts) 的 transport/tool-chain 聚合后返回 usage，章节和仓储已有独立 attempts。实施在共同实际网络边界计每次请求，不能同时累计底层请求和上层总链导致翻倍；现有预算账本仍以原 attempt 身份关联。历史能证明模型/功能的记录可幂等导入并带 origin；缺身份或 usage 的历史标为不可恢复/未知，不能拿当前配置补历史。严格临时会话本轮分类用量只在内存展示，退出丢弃，不持久化其正文、来源链或会话身份。

实际 tokens、估算处理量、未知请求数分别展示。inputCharacters 是字符处理量，不能标签成实际 tokens；若提供估算 tokens 必须标算法/版本且与实际分栏。缓存 token/reasoning token 仅作为包含项展示，不能再次加进 prompt/completion/total；遵守当前实际端点语义。缺任一请求 usage，链总量标未知，同时可显示“已知部分”；列表汇总亦不能把未知当零。没有价格依据不给准确账单。

运行中心可按助手/内部角色、Provider、模型、功能、时间段筛选，用游标完整分页；展示调用数、已知用量、未知数和预算暂停。恢复/幂等重试不会重复记同一 attempt，真正新派发的重试仍计新 attempt。UI展示历史配置名/稳定 ID，连接后来改名不能改写历史归属。

## 7. 运行中心、输出与数据生命周期

运行中心区分“当前待处理/故障”“历史事件”“业务操作结果”“用量”。状态事件只保存标识、状态码、时间、耗时、计量，不复制报告/Memory/模型请求响应或 Key；默认 WARN+ 日志筛选不隐藏 QUEUED/RUNNING 等当前业务状态。重复错误按 feature/actor/安全原因码聚合，保留首次/最近/次数/当前是否恢复；一次成功仅消除对应当前故障，历史仍可查。

报告正文属于业务结果，只在明确的结果详情读取，默认来源折叠。列表含 feature、period、状态、未读、摘要可见性、生成时间、实际角色、来源范围；详情含 Markdown、结构化事实/观察/建议、provided/cited 来源、proposal links、版本和治理令牌。所有列表完整分页；用户纠正/删除/撤权触发 changed，renderer先清除缓存/导出，再接纳同治理版本的后续页，迟到响应不得恢复旧正文。

本地业务结果/提案/Memory写入成功及作业回执在同事务协调；跨 Markdown 文件接受沿用现有 write-temp/接受指针/恢复，不声称文件与 SQL 天然原子。后台任务先检查当前来源和治理摘要，自己的新结果不改变其他未完成 slot 的有效性；用户变动必须阻止旧 slot。

新增来源依赖接入 009/014 数据生命周期：待处理 job、PARTIAL slot、未接受提案是明确依赖；取消或抑制后的必要无正文防复活凭据与可删除业务正文分开。永久删助手按已确认范围处理私有后台产物及未接受提案，全局/正式事项保留合法来源遮蔽。私有 user/event 的 extraAST 未决仍由现有 purge gate 阻止，不扩充默认删除集合；不自动清空垃圾或设期限。014备份/恢复若与本增量并行，必须在整体验收前新增表/文件/版本清单结算。

## 8. 实施顺序和冻结接口

1. 可信执行者先盘点最新 schema（仓储 R4 为 13；root 后续变化必须核对），规划下一加法版本。先完成时间解析/稳定 occurrence、预算预留、usage attempt 边界及来源治理，不改既有提醒执行语义。
2. 共享 DTO 先冻结并通知 UI：`daily.configure/query/inspect/run/control/changed`、`operations.query/usage/changed` 为建议窄域，命名可随现有域协调；strict 输入/输出及 finite actions，preload 仅常量，不增加 assistant 六通道。report/query 都需 cursor、nextCursor、version；inspect分页需要 expectedVersion，治理变更一律 STALE_WRITE。
3. 实现多事件观察完整保存/确认/拒绝闭环，再完成四项日常功能的实际结果及提案接缝；每项都在同一设置/运行状态/来源/预算框架落地，不以通用空白面板当完成。
4. UI 独立写 renderer：配置→下一运行预览→队列/结果→来源/性质→既有提案接受→用量/故障恢复；先用冻结 DTO 合成可观察数据，再用真实 service 联通。全局 docs/E2E 由 root 单写，可信/UI各自返回文件清单/证据。
5. 治理/时间/预算定向反例通过后做端到端、有界合成真实角色验证、独立审查，再与014及安装/更新阶段继续合并结算。不能把设计稿、作者自测或单功能产物当013或PROGRAM完成。

## 9. 验收矩阵

| 领域 | 必须有实际反例与成功路径 |
| --- | --- |
| 自动链 | 合成正常对话→事件接受/正式事项版本→已启用功能自动调度→真实可读结果→建议提案→用户接受后才有正式事项；严格临时零入队 |
| 五种角色功能 | 观察、简报、复盘、周规划、截止变更分别本地 fake preflight 和真实合成模型输出；每项记录实际配置、HTTP/usage、解析、业务结果与零自动正式提醒，不能复用章节资格冒称已测 |
| 观察保真 | planned≠completed；无发生时间不补造；同源多个摘要不增加支持；两独立事件有时间依据；模型虚构次数/心理诊断被拒绝或保持待核验；用户纠正/撤回后不能复活 |
| 时间 | 当地日/周边界、显式周起始、夏令时重叠/空隙、时区选择、回拨/前跳、托盘/睡眠/重启、UNCONFIGURED补跑零派发及EXPLICIT实际补跑/跳过 |
| 提案 | 禁止read/propose/recipient分别拒绝；后台模型接收方不同于聊天也逐次检查；多slot恢复0重复提案；拒绝/延期/接受状态来源可查；正式items/reminders接受前零增量 |
| 治理 | 输入和补充targets关闭范围都0外发；跨助手私有阻止；在途换连接/撤权/删除/纠正/回收拒绝旧结果；已读报告/分页/导出立即失效，迟到响应不复活 |
| 预算与用量 | 并发最后额度只派发一次；耗尽保持队列；未知保留成本；同attempt幂等/新retry新计费；工具链部分缺usage总体未知；缓存/思考不重复累计；不同助手/Provider/模型/feature可实查分类 |
| 恢复和日志 | 提案/文件写入故障、PARTIAL、进程重开、已成功slot不重放、未知先核查；当前故障恢复不删除历史；重复错误合并；所有运行日志/事件/导出无Key及默认正文 |
| 集成 | 012模型不可用仍确定性提醒；009来源依赖和014备份恢复含新对象；积压响应性、SQLite事务、strict IPC、六assistant通道、preload隔离、两PID及原生DOM闭环 |

新增行为必须由未实现者独立审查。若平台不能增Agent，root审查其未参与的可信实现、已有未交叉实现者审查其他域；如实报告角色来源，不能把重命名或作者复跑当独立PASS。真实调用由root使用已授权进程凭据，规划/执行者不得获取或记录Key。

## 10. 未决项处理

本合同不新增必须阻止编码的用户默认问题。REM-002通过UNCONFIGURED/EXPLICIT及明确周期设置推进；RET-007不默认自动永久删除；extraAST沿用已有purge gate。任何新的自动通知/自动清空/默认补跑语义若无法由显式配置表达，实施者只汇总必要冲突交root集中询问，同时继续不依赖它的工作。

AST-005多主角并行调度、AST-007替代临时模式、MEM-007 embedding、外部个人源/Clender集成继续保持原DEFERRED；本合同的有限后台功能和用量账本不重新启用它们。Windows实际安装、更新、卸载、Release资产下载仍属后续整体必需门禁，不因本增量完成而关闭PROGRAM。

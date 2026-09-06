# 013 实际服务执行合同（设计候选）

2026-09-07；background_013_design，实际 Astra / medium。Plan / Design 路线，012 源码冻结期间只读准备；本文件不代表实现、独立审核或任务完成。唯一正式入口仍为 [progress](../../../doc/tasks/progress.md)；完整要求为 [013](../../../doc/tasks/013-background-and-steward.md) 与 [总覆盖](../../../doc/tasks/program-docs-to-release.md)。承接 [root 实际接入方案](background-013-actual-plan.md)。源码观察为 schema 10 的当前工作树，进入实现前由 root 确认 012 提交和最终 baseline。

## 不变量与实际接缝

- 当前助手负责自己的章节、关系/连续性和未完成话题。内置仓储员是独立全局功能角色，不创建第七个助手 IPC 通道，不凭全局角色身份读取其他助手私有时间线。
- 默认缺少功能启用、连接/模型、范围或显式预算任一项，零外发。立即运行与定时运行走相同授权、预算、作业和提交路径。模型不能修改这些配置。
- [ProviderService](../../../src/main/provider/provider-service.ts) 持有同一个 SqliteStore、CredentialVault、transport、MemoryService、ItemService 和 RetentionService。建议由它装配 BackgroundService 并提供窄的受控发送函数；不向 renderer 暴露 store/vault，也不通过 startChat 伪造后台聊天。
- [MemoryService](../../../src/main/memory/memory-service.ts) 已有不可变 Markdown、memory_versions 接受指针、来源 DAG、抑制、预览/显式重载及事务内 commitReceipt。MEM-006 直接复用 previewReload/acceptReload，不另造 watcher 或外部文件自动接受。
- 不能直接把 jobId 传给 toolMutation 的 requestId：现有代码按真实用户轮决定 commandId，并添加 round→memory 来源边。需新增可信后台 origin 与稳定 commandId 接缝；保留现有普通对话路径语义。
- [RetentionDependencies](../../../src/main/retention/retention-service.ts) 是真实 inspectOriginal/inspectAssistant 接口，构造器第五参可注入；confirm 实际查 memory_versions 并读文件核 hash。章节摘要应复用 kind=continuity、scope=assistant 的 MemoryRecord，chapter 元数据只引用真实 memory id/version/hash。独立 JSON 摘要不满足当前回收契约。
- [ItemService.proposeLocal](../../../src/main/item/item-service.ts) 已接受稳定 identity、sources 和 ItemExecution，command 的业务/回执/commitReceipt 同事务。后台规划接入它，不直接写正式事项表。

## 首个连贯增量与完整闭环次序

1. 首增量交付“用户显式配置助手整理 → 已完成正常轮入队 → 预算内真实模型产生章节摘要及未完成话题 → 接受版本/作业回执同事务 → 章节可读、可选上下文、运行状态可查”。包含正常完成漏队扫描、取消/重启/删除屏障及 009 依赖适配，不能只交后台基础表。首增量不宣称 013 完成。
2. 在同一基础接入 global memory_pending 的仓储员：来源保真的待整理入口、去重、Markdown 分支归并、冲突处理及多事件观察；真实模型角色验收。助手摘要可提出共享增量，但共享前仍逐来源授权，不能把私有文本洗成全局资料来外发。
3. 完成每日简报、晚间复盘、每周规划、截止与变更提示：时区/时段/范围/预算设置，保存可读有来源结果，规划进入 010 提案，分类用量与错误恢复中心。012 wakeup/托盘生命周期复用，模型调度不能影响已保存的离线确定性提醒。
4. 独立复核与 009/012/014 跨域结算，合成角色 live 与完整应用入口验收后提交同步；继续整体与真实 Windows 发布下载验证。上述各项均为 013 必做，次序不构成 DEFERRED。

## 共享 DTO 与窄可信边界

建议新增 background-contract.ts 与不含 Zod 的 background-channels.ts。以下为冻结语义，确切字段由可信执行者一次提交后交 UI；所有输入/返回 strict Zod、有限数组/文本、协议版本、UUID 与 expectedVersion，后台域独立有限 IPC，原六助手通道保持。

| DTO/动作 | 必需语义 |
| --- | --- |
| BackgroundConfiguration | id/version、role=assistant 或 steward、ownerAssistantId（助手角色必需）、enabled、connectionId/model、明确授权源范围、features、预算窗口与调用/处理量上限；可支持经过资格的输出上限；调度 timezone/localTime/weekdays |
| setConfiguration | expectedVersion；启用前可信验证配置完整、角色兼容、连接现存、范围合法；权限不由模型或客户端布尔回执代替 |
| queue/runNow | feature、配置 id/version、可信可验证 source refs 或范围；客户端不得提供正文、文件名、endpoint fingerprint、租约、已用预算或结果 |
| listJobs/inspectJob | jobId/version、feature、角色、源引用、状态、已结算用量/未知、businessReceipts、可取消/重试原因；普通列表无来源正文 |
| cancel/retry | jobId/expectedVersion/commandId；retry 复用逻辑 job identity，创建有上限的新 attempt；已完成不可重复提交，远端未知不得自动重发 |
| listChapters/inspectChapter | chapterId/version、assistantId、完整 requestIds 范围、summaryMemoryId/version/hash、未完成话题、可展开来源/变更、可用/过时/抑制状态 |
| select chapter context | startChat 的新可选 chapter refs 或 discriminated context 分支，仅 id/expectedVersion；可信端重新读接受正文及全部来源，拒绝临时模式携带它；结果展示本轮实际使用版本 |
| pending/results/health | 全局增量来源性质、分支、去重关联、冲突与解决回执；简报/复盘/规划可读内容和源引用；权限/配置/预算/网络/协议/本地业务/未知分类及明确下一动作 |

用户选择章节不恢复原始工具协议段；摘要是来源明确的普通上下文。构造章节的输入必须覆盖完整 request/tool-call/result 关系，未决工具或截断关系保留 blocker，不按字符截半协议。复用当前 selectedContext 的归属和输入大小限制，但不能假定它已提供完整工具协议。

## 加法 schema、队列与恢复

以 012 最终 schema 10 为前置，建议下一加法迁移；不在此设计预占实际版本文件。迁移/verify 包含 required tables、唯一约束、前置版本拒绝、失败停止以及旧数据保留验证。

- background_configs：版本化功能角色配置；显式权限/范围与预算可分表。连接变更不重置既有消费，预算周期 id 由可信时钟和已保存规则计算。
- background_jobs：稳定 dedupe key、feature/owner/config version、source digest、generation、state/version、active attempt；后台正常轮来源队列与 memory_pending 桥接。dedupe key 包含功能、原来源 id/version、有意义的周期；不包含易变 attempt id。
- background_attempts/usage_reservations：唯一 request identity、状态、连接/endpoint fingerprint/model/功能分类、reservation/settlement、input/output 已知计量或 unknown，禁止凭据和普通正文日志。
- background_products/chapters/topics：metadata + 真实 memory 接受引用、完整来源列表/哈希、未完成依赖；topic 解决显式版本化，不能以“做过摘要”自动全部关闭。
- background_branches/conflicts：Markdown 分支为受管语义标识与成员引用，不接受模型路径；冲突保存双方版本/来源及性质，解决必须当前版本校验。pending 的旧版完成只能条件更新原 object/version，不能清掉用户新写的待整理。

正常对话完成后的事务内 outbox 最稳妥；也可用受控 catch-up 扫描 readable 完成轮 + 唯一源身份弥补崩溃窗口。严格临时不入库、不入队、不存正文；未完成/失败响应不冒充完整章节。启动扫描先查抑制/tombstone/原文垃圾和当前配置；旧来源不会因重建重新生成。

状态最低区分 queued、running、budget-paused、configuration/permission-blocked、failed-confirmed、remote-unknown、cancelled、stale、completed，UI 可合并呈现但不能丢失真实状态。持久 attempt 在 dispatch 前落盘；启动时 running 先核本地 receipt：存在则恢复完成，不存在且已开始远端请求则 unknown。只有已证实未派发或明确用户重试的 unknown 可再消费预算发新 attempt；不能声称远端不重复请求的绝对 exactly-once。

## 可执行预算与受控 Provider

第一版可明确提供“每周期调用数 + 处理字符/字节量”硬预算，UI 不称其为精确 token 上限。若提供 token/output 上限，必须同时实现和验证 transport 映射；当前普通 transport 无输出限制、tools 固定 2048，绝不能仅改 UI 限额。建议窄 TransportRequest outputLimit 扩展，由 adapter 映射经过资格的参数；返回体字节限制不是计费 token 上限。

构造有界实际载荷（包含系统提示/源数据）后，在单 SQLite 事务内校验配置/周期/并发剩余并持久预留 calls=1、processing=实际计量、output=所需上界，再标记 sending。无 token tokenizer 时不得伪称精确输入 token 预算；调用+处理量依然是真正执行的上限。已预留但证明未派发可归还，远端可能发生的失败/取消/unknown 保留调用和保守预留，不用 usage=null 当零消费。已知 input/output/total 记录实际；cache/reasoning 子项只分解显示，不重复加到总计。

配置更新、跨窗口运行与并发任务不创造预算：reservation 固定原窗口，settlement 唯一 CAS；旧 unknown 仍显示未结算且不能通过取消/重启释放额度。只按已配置窗口开始新的配额，不能把原消费迁移或抹去。无无限重试、静默换模型、端点 fallback。默认配置不设置预算数值或打开任何功能。

ProviderService 提供内部 sendBackground：按保存 connectionId/model 解析当前连接、endpoint fingerprint、凭据和角色能力；不取“当前选中助手绑定”代替角色指定连接。启动、禁用/删凭据/撤权/取消后每次 send 与 commit 均重新校验；在途请求 abort 尽力而为。普通对话也在实际 transport 边界计量，工具链按请求分项；全链缺一 usage 则总数未知，同时可显示已知小计。严格临时只保留不含正文的获准用量元数据，不能保存其业务来源或摘要。

## 权限、generation 与事务提交

有效数据 = 角色配置允许范围 ∩ 当前读取许可 ∩ 当前实际 endpoint 接收许可 ∩ 当前未抑制可用来源。MemoryService.assertSource 已遍历来源/retained_source_edges；后台必须保留其递归规则。仓储员另有明确角色授权，不复用任一助手宽泛所有权；若使用 originAssistantId 调用现有检查，这是额外约束，不是仓储员权限本身。源助手和 endpoint 的 history grants、memory read/receive、item permissions 全部重查。

每个 job 捕获 source id/version/digest、retention_state.generation 与配置/权限版本。generation 变化是重查信号；来源版本/抑制/垃圾/tombstone 和原 owner 是最终 oracle，不能仅 generation 相同就放行（现有 memory 纠正并非均增加 retention generation）。权限更新及助手归档/删除广播停止相关在途；commit 内再次 assertCurrent。

输出严格 schema 只允许本次送入来源的引用、受限结果类型和候选字段；模型指定 owner/权限/文件路径/任意 source 一概不接受。可信端决定完整 sources、性质不得升级、目标 expectedVersion 和 deterministic commandId(job, productSlot)。需要 inference 写权限时未授权就保留“未接受”结果，不自动变成 user-statement。

新增 MemoryService 后台写入口应共用现有 apply 治理，并加入 origin={kind:background,jobId}，避免伪 round 边。复用事务内 commitReceipt 原子更新 product/chapter/topic 接受引用与子操作回执。多结果以稳定 slots 子操作逐个记账：任一失败如实 partial，恢复先查子回执，不虚构跨多个 Markdown 文件整体原子性。若希望整批原子，必须另做 staged-file + 单事务接受指针批量提交，不能简单嵌套现有 transaction。

immutable Markdown 成功落盘且 hash 已验证后，SQL 接受 pointer、来源、结果 metadata 和相应业务 receipt 同事务；作业最终完成只在所有已计划子操作终态后提交。孤儿文件不接受、不被重建扫描提升。用户在等待期间改/删/撤回或取消，使旧候选失效；已提交结果不能被 cancel 描述为未执行。

## 仓储员、观察、日常与回收

去重保留源并关联已有接受对象；若不能证明等价，建立冲突或待核验分支，不能模型一句“重复”就删原来源。归并可生成新的 faithful-summary，但不覆盖已确认内容或后来纠正。仓储员输出不应再次无限生成自己的 pending：用 origin 与按源版本消费的 ledger 终止自循环，同时新用户修改仍入队。

多事件观察要求至少多个可验证事件来源、发生/报告时间及不确定性；客观计数与习惯 inference 分开。意向/计划/取消/unknown 不当作已发生。零散情绪不生成确定人格/心理诊断。任一来源纠正/撤回后，原观察退出正常召回，重试/索引重建同样受限。

日常 schedule occurrence identity 固定配置+本地日期/时间段+时区/offset 规则，恢复先核已发生作业，不重复简报。时钟变化、休眠、手动运行与定时同时触发均纳入 dedupe；错过时段如何补生成可显式配置而不擅定 REM 默认。结果保存为受管有来源 memory/产品引用；周规划经 proposeLocal 的来源稳定 identity 防止同源被否决后重生。接受提案前正式事项/提醒均为零；日常结果不能宣称 Clender 空闲或写入日历。

inspectOriginal 对每个 requestId 检查完整章节覆盖、当前接受 memory_versions/body hash、事件/连续性需要、未完成 topics、未决 tool/business operations。任何缺口 blockers，accepted 去重并稳定排序（当前 confirm 用 JSON 顺序比较）。保存失败或仅临时模型文本时返回 blocker。confirm 前/事务内的治理检查保留；压缩成功绝不自动执行 recycle-original。inspectAssistant 必须覆盖后台在途/持久 owner 依赖，并按已授权 AST 私有章节/关系/连续性删除、全局接受资料保留且私有来源不可展开的语义接入009。额外私有 user/event 与 RET 默认仍待用户决定，不自设。

## 单写范围与甄别验证

可信执行者：src/main/background/**、src/shared/background-*、对应 preload/IPC 注册、Provider/Memory/Retention/Item 窄接缝、schema 与 trusted tests；所有共享文件由一个可信单写者拥有。UI 执行者在 DTO 冻结后拥有 src/renderer 的配置、章节/上下文选择、待整理/结果/运行中心及 renderer tests；App 导航也由该 UI 单写，root 不并行改。独立 reviewer 不参与实现。progress/program/正式任务仅 root 记录。

必须先建立以下区分旧/新行为的反例，再做完整闭环验证：

1. 未配置/未授权/缺凭据/角色不兼容零 transport；选定接收方与助手当前绑定不同仍只按指定接收方交集发送，跨助手私有来源拒绝。
2. 并发多个 job 只有预算允许数目派发；unknown/取消/崩溃重开不释放已可能消费预留，重复结算不双算；配置更新不清空消费。
3. 正常完整轮入队一次、严格临时零队列；工具半链与未决操作阻止章节覆盖和回收；章节实际可读、选入上下文且有接受版本。
4. 文件写后 SQL 前崩溃不接受；SQL 后回执返回前崩溃重开只返回同一业务；多 slot 部分完成恢复不重复已完成项。
5. 在途 user edit/withdraw/trash/purge/cancel/revoke/endpoint change 后旧结果不能写；重建和旧 job retry 不复活；global source 不因仓储员角色扩大授权。
6. pending 旧版本消费不能清新版本；忠实去重保留来源，冲突不覆盖纠正，inference 无权限不生效，仓储自生成不无限入队；事件状态反例可区别计划与实际。
7. inspectOriginal 使用真实 id/version/hash，保存失败/文件损坏/缺完整覆盖/unfinished topic 均不回收；真实接受后009预览确认成功且原文可恢复，摘要可继续授权召回。
8. 日常配置后实际保存可读结果；同周期重启/时钟跳动不重复；规划通过010现有版本接受，同源否决不复生，接受前零正式事项/提醒。012确定性提醒在后台Provider缺失时仍运行。
9. 分类用量已知/估算/未知准确、普通日志无正文/Key；UI切助手、刷新及在途回执有版本屏障。真实合成积压测主线程响应性，按证据决定 worker。

完整验证按当前仓库要求覆盖 focused/full tests、静态/构建、真实两 PID 生命周期、依赖/foundation/secret/generated/residual 检查；合成实际 Provider 至少助手章节或仓储整理及日常角色，各走实际服务并记录次数/已知及未知用量。UI 可用性和独立审核完成后才关闭013。当前设计阶段未调用模型，未修改源码，未开展014私有数据或 Clender 接入。

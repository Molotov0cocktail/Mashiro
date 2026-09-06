# 010 实际源码实施方案

2026-09-07；Plan / Design，高风险业务持久化；角色 plan_010_actual，实际 gpt-6-astra / medium。ROUTE=ITEMS-ACTUAL-010/1，建议 CONTINUE。本报告不是候选实现或审核PASS。

## 现场、授权与范围

只写本报告；不改源码/tests/deps/全局记录、不commit/push、不调用Provider或读取私人数据。实查HEAD为 c000b7d9739589909a80ed8aac1d2b64a569a3bb；008已审产品cc9c729，009工作区含schemaVersion=7候选，UI和最终审核由root协调。本报告未执行009测试，不独立背书其25/184结果。010开工时重新读取009最终HEAD与迁移版本，下一加法迁移不得预占编号或改写已发布迁移。009手动核心完成不等于009所有自动路径完成，更不是PROGRAM_DONE。

依据：根AGENTS、编排SKILL及modes/role-contracts、progress、program总清单、010正式合同、items-next-design；proposal §3.4–3.5，high-level §5.4–5.5/7/9，detailed §7.2–7.3/8及ITEM-001–004、EXEC-001–006、PVD-003/007/009、REM-001/002集中决议。Q8提醒、Q9后台、Q10安装恢复、整体审核与实际发布下载继续；Clender后置。

## 已有代码与需要扩展的真实入口

| 入口 | 已有事实与010动作 |
| --- | --- |
| src/main/provider/provider-service.ts | 持有MemoryService/RetentionService；assertCurrent固定执行端点并重查取消、历史和providedMemory来源，generation阻断治理后迟到答复。新增ItemService、providedItems及提案上下文检查；保持固定接收方，不让模型传授权。 |
| src/main/provider/tool-execution.ts、tool-protocol.ts；src/shared/tool-contract.ts | 工具名、scope和business列表目前显式枚举记忆/清理；新增search_items、apply_item_intent、propose_item、revise_item_proposal与确认预览工具。新增独立items scope组合，避免默认开启事项写权；可用小型固定allowlist代替组合爆炸，但保留旧scope兼容。现有memory回调应窄改成受控domain dispatcher，不建立通用插件执行框架。 |
| src/main/provider/tool-repository.ts | prepare按segment/modelRequest/toolCall去重，只是协议身份；update(record,result,true)可参与既有事务。业务receipt读回和当前权限过滤需加入itemReceipt；不能把新的toolCall ID当新业务授权。 |
| src/main/memory/memory-service.ts | toolMutation按assistantId+原requestId派生业务UUID并核对参数hash；assertSource逐来源检查且withdrawal先于retained例外，addDependencies支持版本边。复用原则和事务回调，不照抄一轮只能一种mutation的限制，不把item冒充memory对象。 |
| src/main/retention/retention-service.ts、retention-schema.ts | RetentionDependencies仅inspectOriginal/inspectAssistant；manifest目前只含memory保留对象，retained_source_edges只供memory祖先路径。010必须扩展真实预览、确认事务与清理清单；仅加一个“检查通过”hook不够。 |
| src/main/data/sqlite.ts | BEGIN IMMEDIATE同步事务，无嵌套事务。事项纯SQLite提交不需要Markdown接受协议；callback参与同一事务且不得await。 |
| src/main/ipc/register-memory-ipc.ts、src/preload/index.ts/.d.ts | 可复用严格输入输出窄API模式；新增item-contract/item-channels/register-item-ipc。preload运行时仍只Electron和无Zod常量，六assistant通道不变。 |

## 中文用户闭环与最小对象

新增“事项”入口，正式事项/待确认两个页签。正式列表按五类型、状态筛选，详情可编辑、关联和查看真实回执、来源可用性。目标/项目：进行中→已达成/已完成或取消；任务：待办→进行中→完成/取消；承诺：待履行→已履行/取消；等待：待回应→已收到/取消。显式重新打开回到对应初态；不自动由子项推导父项完成。关联使用一个可选parentId和可选相关itemId集合即可，校验存在、可读、非自身、父链无环；不暗定父项删除级联。

正式对象最小字段：itemId、version、kind(goal/project/task/commitment/waiting)、title≤160、description≤8000、status、dueAt|null、timeZone|null、parentId|null、originAssistantId、createdAt/updatedAt。期限必须带偏移和有效IANA时区，日期歧义不得替用户选；候选日历时间不等于实际占用。可选的承诺对象/等待对象用短文本，未明确不推断。

提案独立proposalId、version、originAssistantId、candidate(同正式内容)、state(DRAFT_PROPOSAL/DISCUSSING/DEFERRED/ACCEPTED/REJECTED/STALE)、acceptedItemId|null、sources和suggestion identity。不设自动过期时长。卡片明确“建议，尚未成为正式事项”，支持接受/否决/暂缓/继续处理/与发起助手协商。点击协商将同proposalId+expectedVersion交给原助手正常对话；协商不复制卡，成功修订只version+1；另一助手不能改写。接受后显示正式事项链接。改名按稳定ID查当前昵称，归档助手协商先显式恢复使用，不能私下切成另一助手。

统计查询只读items表；提案不能进入完成率、正式承诺、逾期或Q8调度。010可暴露只返回正式itemId的后续调度候选接口，不造实际通知/提醒记录来充数；REM默认留Q8。

## 自然对话的可信明确指令路线

模型explicit=true、声称“用户已确认”、自由文本授权引用一律不能授予直接写权。主进程从已经接收的本轮用户文本和可信选中对象上下文建立UserIntent，不从assistant/tool/history文本建立。新增小型item-intent.ts：针对日常直接句的有限完整语法识别，不要求用户写JSON或UUID，例如“帮我加一个任务：周五交报告”“新建项目：搬家”“把交报告这件事标为完成”“把这个承诺的截止时间改到9月12日下午三点”。动词、五类、字段、日期及目标都必须能由原文确定，名称查找只在当前可读对象中唯一匹配；“这个”仅绑定UI明确选中对象及版本。

对引用/转述、假设、否定、问题、并列未完全解析的句子，不通过简单关键词contains放行。识别器必须消费全部动作句（礼貌词可剥离），否则转成待确认提案/澄清卡。自然语言理解模型可以填候选或给证据偏移，可信侧逐字段对照UserIntent；模型添加未授权期限、完成状态、额外对象即拒绝直接提交。缺少确定解析时不禁止聊天，显示可编辑提案，用户一次接受即可。默认不以另一个模型的“授权判断”为信任根。

UserIntent绑定assistantId、requestId、原始文本hash、动作序号、目标版本、允许字段及规范值、创建时治理generation；模型只引用服务端分配的intentId。明确低影响单项创建/修改的工具可以直接提交，模型不调用也应在本轮可信执行路径提供确定结果，不能让明确指令悄悄仅变文字答复。删除/批量/关联破坏性动作仍创建精确manifest确认；通用自然语言未覆盖的高影响动作同样不给执行权。自然说“接受这个建议”只有可信选中proposal及版本且完整识别才等同UI接受。

多操作不借模型自由生成ordinal：可信解析得到固定slots；批量slots需一次精确确认。单一原轮的推测可以含多个可信来源锚点建议，按下述suggestion identity分槽。任何新modelRequestId/toolCallId不得开出新的业务slot。

## 最小严格DTO、表与事务

新增ItemApi：query、inspect、mutate、proposalAction、operation、preview、confirm、permissions、setPermissions。全部protocolVersion=1、UUID、正version、分页上限100、strictObject/discriminatedUnion；mutate分create/update/transition/link/delete，proposalAction分accept/reject/defer/resume/discuss/revise，禁止任意patch字典。模型工具仅用更窄的wire schema，不接受actor、read/write权限、endpoint、sources、commandId或explicit授权字段。DTO的本地assistantId是上下文，不等于该助手模型权限。

建议SQLite最小表：items；item_proposals；item_sources(node_kind,node_id,node_version,source_type,source_id,source_assistant,source_version)；item_commands(id,assistant_id,intent_hash,state,receipt_json)；item_confirmations(id,command_id,manifest_json,epoch,state)；item_permissions(assistant_id,version,read,write,propose)；item_recipients(assistant_id,endpoint_fingerprint,receive)；proposal_rejections(稳定建议身份、精确证据版本集、proposalId)。保留边用item_retained_source_edges，带node_kind与对象版本，避免同一个裸object_id跨域含混。表名/局部合并可由执行者裁决，不引ORM/工作流平台。

commandId由主进程生成：UI一次动作保留随机UUID直至已核查终态；对话根据assistantId/requestId/可信slot派生UUID。intent_hash绑定目标/版本/规范内容/来源身份；相同ID相同内容返回原回执，不同内容CONFLICT。接收端点不是幂等键组成部分，换端点不能令已成功业务重新发生。确认绑定commandId、目标版本集、内容hash和epoch；过期确认拒绝，重新预览产生新确认，不能换ID绕过未核查操作。

BEGIN IMMEDIATE内重查当前助手、UserIntent/本地确认、权限/来源、版本、拒绝抑制；CAS修改或创建正式item；提案accept还原子写ACCEPTED+acceptedItemId+version；写item_commands成功回执；若源于工具，调用ToolRepository.update(...,true)同事务提交tool_operations/protocol_results。acceptedItemId唯一，items可有UNIQUE(origin_proposal_id)作为第二不变量。两个accept命令竞态至多一项，后来同版本应明确冲突或返回已接受链接，不能覆盖。

COMMIT前失败没有半项；COMMIT后回答失败保留成功。operation查询以item_commands权威核查，不触发Provider。能证明无提交才CONFIRMED_NOT_APPLIED；数据库不可读保持RESULT_UNKNOWN。恢复不重放模型、不自动换commandId。回执只存ID/版本/中性状态，标题正文实时按当前授权读取，避免治理后回执副本泄密。

## 来源、端点权限与009原子联动

助手read、固定实际端点receive与write/propose分离，默认deny，UI本地用户管理不外发。派发工具、读取每个对象/来源、提交、返回结果、下一模型请求都重查；新增端点无receive继承。严格temporary从入口到服务拒绝全部持久事项/提案/确认/业务slot；也不读取既有事项、建立依赖或可重启工具快照，临时UI明确提示切回正常模式。

item/proposal源由可信服务形成：原user-round及模型实际看过的history/memory/item/proposal依赖，保留类型、assistant、稳定ID和确切version；别仅记录当前assistant或把全部来源折成round。当前memorySourceSchema不识别item/proposal，不能强塞；新增有界领域SourceRef并让ItemService解析领域边，叶子委托MemoryService.assertSource，带完整当前路径和访问上限。由事项结果生成的记忆、历史续答也必须传播item/proposal版本依赖；这需要有限扩展memory源验证回调与provider providedItems检查，不是单向记录后忽略。注册item→memory与memory→item路径时同一访问上下文防环，不调用无界互递归。

009具体整合：扩展RetentionDependencies为有界typed域贡献（inspect清单+确认事务应用），manifest列受影响item/proposal版本、切断的精确来源边、依赖阻止与待清理副本ID。原文回收仍组合现有Q9阻止条件，不能用事项接受绕开未完成话题/摘要门禁。给items/proposals/sources/权限/拒绝记录加retention epoch触发器，预览后任何相关变化失效；清理进度表不能造成自我失效。治理confirm同步写事项来源失效标记/保留边/抑制、取消预览和清理计划，再generation++和changed广播；迟到callback不能补回正文。

保留正式items行及其已确认业务内容，不因source被删撤自动删事项。来源卡显示已撤回/原助手已删除、不展开旧私有原文；操作参数、旧提案快照、协议结果、工具摘要及拒绝记录不保留被清理正文。来源withdrawal优先于任何保留例外：正式对象本地可见，但源依赖外发停止，后续由用户明确改写/重新确认脱离已撤回内容后另作当前版本，不能自动洗掉来源。purge-assistant/recycle-original可为已经接受的正式对象保留精确不可用来源边，接收例外只包含删除前已同时获事项和来源权限的assistant+endpoint对，且每次仍检查当前事项权限；不同对象/版本、兄弟来源和新端点绝不能借用。复制保留边到新版本仅限已经接受且未新增敏感依据的已验证边，禁止无条件全量继承。

拒绝去重不保存原文快照，只留ID/版本与规范身份。009治理旧回执/协议的SQL清理须覆盖新增itemReceipt字段、item命令/确认副本和未接受提案旧版本；正式事项正文保留属于独立业务语义，不能用统一文本清空扫掉。

## 否决抑制：可证明身份与诚实边界

不能只hash标题，也不能用“同来源+同类型”封掉全部建议。建议身份采用可信来源锚点与有限结构：source ID/version、原文动作/对象证据区间（主进程验证偏移与字面内容）、规范动作类别、对象/关联稳定ID或规范实体锚点、时间条件锚点。标题/说明的措辞不参与身份；同旧建议重试/改写复用该identity。模型不得随意新建identity；服务端根据固定锚点生成，已拒绝命中即返回SUPPRESSED而非复制卡。来源集合必须含实质证据，不能给旧建议附一个无关新round绕过抑制。

一个来源里“报税”和“预约牙医”分别取不同对象证据锚点，允许两个不同建议；同一目标在新时间条件、真实新来源/版本出现允许新的建议，但展示关联旧否决而不推导永久偏好。模型更换同义动作分类、源区间偏移时：可信规范化优先，候选与同来源既有身份作字段和锚点重叠核对；无法判定是不同建议的同对象候选不自动再出重复卡，进入一次明确差异核验/可编辑已有记录，不能静默永久封掉。同来源确有第二建议可由用户明确“这是另一个建议”分配新身份。该有限域方案不声称解决任意语言语义等价；若日常反例显示大量不同建议进不来或旧建议可轻易换词绕过，则REPLAN规范器，而不是放宽测试或偷偷改成文案hash。Q9必须复用该入口。

## 010冻结前唯一新增产品问题

原文规定原助手协商与稳定身份，不允许其他助手自行改写；AST批准的是正式事项和共享记忆保留，未覆盖未接受提案。推荐询问：永久删除发起助手时，是否保留未接受提案的ID/状态并锁定协商，只保留不含已删除私有来源的可展示内容；用户仍可否决/暂缓，对内容完整且合法可读者可本地接受，否则先自行重写并确认为新版本；不自动转交其他助手、不自动删除提案？

影响：不丢待办决策线索，不保留已批准删除的私有正文，原助手删除后无法再协商；用户可能需重写信息不完整的提案。答复前通过inspectAssistant阻止“有未接受提案的永久删除”分支，展示具体依赖；普通创建、协商、接受及已批准正式事项保留可继续。该推荐尚未获批，执行者不得先落成默认。额外private user/event、RET数值仍待root已有问题，REM默认留Q8。

## 顺序、单写边界与可区分验收

1. root核009最终现场并冻结上述接口/待决；可信执行者先建立事务、权限和自然指令red oracles，再写src/main/item/**、shared/item-*、register-item-ipc及对应trusted tests。同一可信整合者顺序改schema/provider/memory/retention/shared tool+provider/preload/main index与harness；不得与009并写。
2. UI执行者只写features/items/**和其tests，冻结DTO后可并行。App.tsx、styles.css、ProviderPanel/ToolExecutionPanel接线由明确一位整合者在009释放写权后改。全局任务/progress和提交由root/指定记录者单写。
3. 独立Reviewer从三设计反查下列反例，不能只接受实现者绿色结果；静态/full tests/build、依赖/foundation、秘密残留扫描与真实双PID按新差异完整结算。无新依赖必要。

| Oracle | 必须区分的观察 |
| --- | --- |
| 五类UI+对话 | 各类型创建/修改/终态/重新打开/关联/重启；自然句直接执行同一items行，不能只有手动CRUD。 |
| 授权攻击 | 引用“帮我创建”、否定、假设、模型explicit、偷加期限/第二对象、非唯一名称、旧选中对象均不直接写；日常明确语句可低干扰成功。 |
| 提案与协商 | 推测只增proposal；accept前正式计数/逾期/候选调度全零；同ID修订，旧版本accept失败，另一助手revise失败；defer/resume不新增卡。 |
| 原子/身份 | 两并发accept、两个不同toolCall重试、COMMIT各故障点、COMMIT后断网、重启都至多一正式项；不同内容同command冲突；unknown先查，恢复零Provider调用。 |
| 否决甄别 | 同旧来源不同措辞仍抑制；同来源不同对象建议成功；真实新条件可新建议；无关新来源不能绕过；模糊身份可由用户辨明，不能被永久误杀。 |
| 权限/治理 | read/receive/write分别撤销、改URL、取消期间返回、来源撤回、删除助手、保留边兄弟对象/新端点攻击；正式项仍在，旧来源/回执/协议均不泄密。 |
| strict临时 | 恶意调用全部item工具后，items/proposals/commands/confirmations/dependencies表与可重启协议零增量。 |
| 高影响 | delete/批量未确认零写；预览后新关联/目标版本/权限/来源变化拒绝；不级联删除关联项。 |

Live资格使用隔离合成数据与当前已授权端点，经真实ProviderService/工具回执路径：自然中文创建带随机标记任务→可信成功→重开服务、context none搜索返回精确item；推测语句建提案→原助手同ID协商改版本→本地明确接受→恰一正式项→自然中文修改/完成。五类在本地全覆盖，live至少验证实际明确指令角色及提案协商角色，记录每请求usage或未知、请求数、对象数、operation和source证据；自然答案不算业务证据。若模型拒用或误用工具，保留first bad state后诊断wire/提示/权限/可信识别，不能把manual成功冒称live。恢复必须0外发。Clender能力始终未接入，不声称空闲核验或日历已写入。

相同first bad state两次或三轮同根修复无增量转REPLAN；实际产品门禁只冻结相关分支。报告交回后本角色结束，无后台执行；root继续009结算与010实施，PROGRAM保持ACTIVE。

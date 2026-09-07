# 013 仓储员下一增量执行合同

2026-09-07；plan_013_steward，实际 gpt-6-astra / medium；Plan / Design，只读产品源码，仅新建本合同。现场 HEAD 为 `815e778122a682bfc71cac01ffbda0c718a43788`；包含尚在 root 独立审核的 schema 11 章节工作树，执行前重新核对 root 冻结版本。本合同不是实现、审核 PASS 或 013/PROGRAM 完成。唯一续接入口仍为 [progress](../../../doc/tasks/progress.md)。

## 来源与已核对事实

- [高层设计 §5.3](../../../doc/high-level-design.md)：助手“把适合全局资料的增量连同来源和内容性质提交待整理区”；仓储员处理“增量、去重、归并、分支整理和冲突识别”；自动整理不能改变权限、来源归属或把推断升级成事实。
- [详细设计 §7.1–7.2、MEM-001–006](../../../doc/detailed-design.md)：显式记住/纠正不等待仓储员；用户陈述与忠实归纳可低干扰生效，推断保持推测；用户编辑优先于旧作业；删除抑制是事务权威；Markdown 语义正文、事务身份/权限/版本及显式外部重载分工保持。[proposal §2.1](../../../doc/proposal.md)要求可读、可编辑、可迁移的分支化 Markdown。
- [013 正式任务](../../../doc/tasks/013-background-and-steward.md)、[原执行合同](background-013-contract.md)、[章节可信交接](background-013-trusted-stage-v1.md)共同要求真实角色、可见入口、预算、恢复及来源，不允许章节或手动记忆 CRUD 代替仓储闭环。
- [MemoryService](../../../src/main/memory/memory-service.ts)：`apply` 对任何 global 写入都覆盖 `memory_pending(object_id,version,state)`；它仅表示已接受对象等待整理。`backgroundMutation` 当前只允许 remember，复用不可变文件、接受指针及事务 commitReceipt；不应为仓储员直接开放 correct/delete。`assertSource` 递归校验来源版本/抑制/私有归属/原接收授权；`permissionState` 使用 assistantId+scope，实际 fingerprint 可与普通聊天绑定不同。
- [background-schema](../../../src/main/background/background-schema.ts) 的配置以 assistant_id 为主键，jobs/attempts 绑定助手；[DTO](../../../src/shared/background-contract.ts)固定 role=assistant/feature=chapters。它们尚不是独立仓储角色。`roundSource` 只取完整正常轮及工具关系，祖先权限由 DAG 递归核验。

## 此增量的可验闭环

用户分别配置助手的“识别共享增量”和内置仓储员的连接/模型、来源范围、写入/推测范围及预算。正常完成对话由该助手整理角色识别适合长期共享的内容，产生带原轮、源版本与性质的候选；不要求用户先手动写全局记忆。全局待整理页可见候选，仓储员在预算内真实调用模型，对候选和允许读取的已接受分支执行去重、归并或冲突识别，保存真实 Markdown 接受版本或明确待核验结果，并显示来源、分支和处理回执。忠实归纳无额外逐条确认；新增判断始终 inference 且受推测写入许可。显式记住、纠正、删除仍走现有即时路径和其既有确认语义，不等待识别/整理任务。

识别功能与 chapters 分开开关和稳定消费键：可复用章节同一次有界请求输出 `sharedCandidates`，但不得让旧章节已完成记录阻止后来启用的识别。已处理章节可由独立识别 job 补做，仍按该助手配置与预算计费，零候选也记处理回执。严格临时及 source_session_id 非空的显式保存临时 session 保持当前排除规则。模型只能从可信提供的 source handles 选来源，不能给任意 UUID/正文冒充来源。

## 内置 actor 与权限交集

仓储员是可信内部 `actor=steward`，不是新增用户助手、假 assistant row 或第七 assistant IPC。独立 singleton 配置、connection/model/fingerprint、预算与显式允许的贡献助手集合；与各助手聊天 binding 和章节预算分开。预算/租约/限额/输出上限/Provider 窄发送逻辑抽成可复用内部 helper；不要强塞 schema11 assistant FK 或伪造 round。

每个仓储 job 固定一个真实、活动的 `authorityAssistantId`，取待整理候选的贡献助手；它是此次授予记忆读写能力的锚点及新全局记忆现有 owner/provenance，并非执行 actor。因此先按贡献助手分批，仍在同一全局分支索引内去重/归并。这是适配已有 per-assistant grants 的工程选择，不限制仓储员只能读自己生成的对象；全局对象允许跨 owner 读取，只要以下完整交集通过。

root 复核补充：已接受的 global 资料不会因为原 owner 已永久删除而永久失去整理入口。对此类存量对象，可由仓储配置中用户明确选定的活动权限锚点承接，但保留原归属/已删除来源标记，并继续逐源接收及 retained-source 限制；不能因此向新端点授予旧私有原文，也不自动接管未接受的私有候选。没有合格锚点时显示具体授权阻止。新摘要记录执行锚点与原资料来源，不能改写既有对象 owner 来通过校验。

派发前、结果保存前及每个 slot 提交事务内均要求：

1. 仓储配置启用，候选贡献助手在用户选定范围内；锚点助手仍活动；配置版本、连接身份及实际 fingerprint 未变；来源指纹、接受版本和用户治理 epoch 未变。
2. 对每一实际提供的全局候选/目标，锚点 `memory_permissions(global).read` 与该 fingerprint 的 `memory_recipients(global).allowed` 同时为真，并与仓储配置所选范围相交。写新全局版本还需锚点 global.write；nature=inference 还需 global.writeInferences 和仓储 inference 开关。仓储配置不能将 false 改为 true。
3. 对原轮、私有记忆及所有 DAG 祖先，继续 `assertSource(source, authorityAssistantId, fingerprint)`；直接私有输入只允许锚点自己的完整轮/记忆，先做可信 ownership 检查，再逐轮 assertRound。跨助手来源中的历史边仍按源助手 history read/send 和实际 fingerprint 校验；遇到另一助手私有 memory 边即拒绝，不能因为某派生物 global 就删掉这条边或复制正文洗白。已回收原文只沿现有 retained_source_edges 的既有接收者证据，绝不新造保留边扩权。
4. 全局分支候选检索先过滤可读对象，再拼模型输入；对未获授权的对象不提供标题、冲突摘要、正文或数量暗示。模型返回未提供 target/source handle 直接拒绝。范围/接收改变使本地候选失效，不仅重新检查有无 Key。

配置 UI 可提供明确的一次“授权所选仓储接收方读取这些已选来源”的动作，按既有规则分别写锚点 global 接收与选定原来源 history/private 接收 grants；不静默打开 read/write/inference，不批量授所有助手，不要求用户逐 SDK/API 批准。页面应显示缺哪一项能力和设置入口。没有读写授权时留 PERMISSION_BLOCKED/未接受候选；不谎报已写。身份归属保持真实源助手，用户侧执行者标签为仓储员。

## 最少持久接缝与 DTO

加法 schema 12（执行时核对最新版本号，禁止碰撞）建议如下；精确列由可信单写者冻结后交 UI，不另造第二套记忆正文：

| 接缝 | 必需内容 |
| --- | --- |
| 扩展 memory_pending | 保留 object_id/version/state 兼容已接受对象；加 entry_kind=accepted-memory/shared-candidate、origin、authorityAssistantId、源 refs/digest、候选 JSON、产生时间。shared-candidate 的 object_id 是候选稳定 ID，无需先创建 active MemoryRecord；原表无 FK。候选 JSON 是受管未接受暂存，不进入正常召回。所有旧 INSERT 改显式列名，旧对象准确回填。 |
| steward_configs | singleton actor、version、connection/model/fingerprint、选定助手/范围、显式写入/推测选项、预算；不能复用 assistant_id 主键配置。 |
| steward_jobs/attempts | 稳定输入 entry id/version/digest、锚点、配置/接收快照、提供的 target 接受版本/hash、模型候选、调用预留/已知或未知 usage；复用现有恢复语义，预算按 steward actor 计。 |
| steward_slots | jobId+slotId 唯一、固定 commandId、动作参数 hash、依赖接受版本、状态及真实 MemoryReceipt/分支回执；允许 PARTIAL。 |
| steward_consumptions | entryKind+entryId+version+sourceDigest 唯一、jobId、终态结果/关联版本；source version 已消费不因改配置或重启重新整理。 |
| memory_branches / branch_members / conflicts | 分支稳定 id/version/title、成员真实 memoryId/version 与关系（成员、等价引用、候选冲突）；冲突双方接受 refs、来源、状态/用户决议版本。元数据在 SQL，实际语义仍在受管 Markdown；标题不是文件路径。 |

分支最小实现是稳定命名的 Markdown 语义集合：详情展示可编辑、可导出的真实成员 Markdown 及对应接受版本。模型归并输出新的 faithful-summary 成员（或 inference），链接已有成员；既有用户文本、接受指针不被自动 correct。去重仅建立有来源的等价引用回执，不删除源、不冒称新事实生效；无法证明等价则 conflict 或保留独立成员。分支移动/归并只变版本化组织关系，不改变对象权限。跨分支冲突保持两侧可见；未决冲突必须在普通召回/上下文附冲突状态，不得把矛盾双方无标签拼作确定事实。用户明确选择/纠正经现有即时语义写当前版本，再以 expectedVersion 关闭冲突；不创造自动覆盖用户决议的模型通路。

为避免“分支”只是数据库标签，验收必须看到实际 Markdown 正文按分支组织可读、内编辑与导出可用；外部 reload 复用 previewReload/acceptReload，禁止 watcher 自动接受。物理文件仍由 id/version/commandId 生成，不让模型输出路径。

新增 strict Zod steward DTO（有限分页和数组）：configuration/query/configure/run/control、pending inspect、branch inspect/organize、conflict resolve；请求只给稳定 ID、expectedVersion、commandId 与显式设置，不接收 source 正文、文件名、预算余额或授信结果。返回待整理性质/状态、可核对来源、target 接受版本、slot receipts、conflict 状态和下一动作。原六 assistant channels 不动；新领域有限 IPC 和 preload 常量按已有模式注册。UI 来源/变更默认折叠，区分输入提供与实际输出引用；列出 body-free job 摘要，详情再检查权限。

## 来源版本消费、防循环与用户优先

`memory_pending` 仍接纳即时 global 记忆的整理提示，也接纳正常对话 shared-candidate。识别键取功能+source assistant+requestId+可信 source digest+候选 slot；已接受记忆键取 objectId+accepted version+hash。零候选、等价引用、冲突保存及拒绝均有稳定消费记录；错误/未授权/预算不足不标成功消费。

所有仓储写入显式 origin=steward/job/slot。在 MemoryService 共用 apply 的受控执行上下文中禁止该 origin 再产生同版本的 pending；不能只靠 title/body 去重，更不能用“任何 background 均不入队”误屏蔽助手共享增量。用户手动编辑、即时纠正或外部重载产生新版本仍入队；旧 job 只能以 `WHERE object_id=? AND version=?` 消费当时输入，新版本 pending 不被清空。branch-only 组织变化不产生正文增量。共享候选被用户丢弃须记该源版本抑制/终态，扫描不得重建同候选；新信息可建新候选。

不把模型所称“忠实”当确定性证明：系统固定性质规则；只允许针对已提供内容归纳，不新增数值、确定人格或心理诊断；无法归类/有冲突留 inference/待核验。模型声明重复也不能删除或覆盖任何源。若输出未引用全部实际影响结果的提供上下文，提交来源仍保守保留可信输入依赖，避免漏边复活。性质、事件状态、发生/报告时间不得由归并隐式提升。

用户修改/删除/撤回治理变化应使所有引用旧 version 的 pending/job/conflict 派生退出正常召回。取消/撤权/助手 tombstone/目标变更/文件 hash 不一致使未提交 slots STALE 或 BLOCKED；已有成功回执保留真实“已完成部分”。来源展开复用009隐私与保留边规则；助手永久删除不借机删除已接受全局资料，也不继续展示已删私有原文。retained-source、索引重建、旧job重试和冲突再次解决都受同一权威屏障。

## 多 slot 与异常恢复

模型候选经一次严格校验后冻结成有限 slot 计划，稳定 commandId 与每 slot 参数 hash 持久化后才开始写。新增记忆 slot 继续用 backgroundMutation 的 remember 与 commitReceipt；origin 扩充 steward 仅供防循环/审计，不能扩大动作权限。branch link/conflict metadata slot 用同样稳定回执事务。跨 slot 的新对象引用由已提交 receipt 解析，不能信模型猜 ID。

每 slot Markdown 先写不可变文件并核 hash，然后接受指针、来源、成员/冲突元数据及该 slot receipt 同一 SQL 事务。整个作业在所有计划 slots 终态后汇总；禁止用嵌套现有 apply 事务冒充多文件整体原子。重启先查 receipt：已成功不重写，本地候选未完成继续提交前逐项重验；源不变但目标被用户改过时也不能重放旧 slot。最后一次 source-version consumption 只在整项结果完成或明确终态处理时提交；PARTIAL 保留已完成记录及剩余原因。

模型返回前崩溃仍 REMOTE_UNKNOWN，不自动重发/退预算；明确 retry-unknown 走新 attempt 并保留旧未知成本。模型返回已保存后崩溃优先本地恢复，零额外调用。文件后 SQL 前孤儿不接受；SQL 后返回前恢复同回执。暂存候选正文与已接受 Markdown同属仓库外运行数据，删除与备份治理必须覆盖，不进入默认日志。

## 可甄别验证与接续

1. 普通合成对话（从未手动写 global）→助手识别→pending 可见但不可召回→真实仓储模型→已接受分支 Markdown→刷新/重开仍可读；显式记住在后台关停/预算耗尽时立即成功，临时轮零候选。
2. 未配置、缺范围、global read/write/receive 任一拒绝及推测禁用各有独立零发送/零提交断言；仓储端点不同聊天绑定可合法运行，源助手未授该端点或另一私有 memory 祖先拒绝，global 包装不洗白。模型伪造 target/source 和在途端点更换失败。
3. 同义候选真实去重但保留来源引用；跨分支可见组织；矛盾候选保存冲突，不能改用户确认正文，普通召回也能看到冲突性质；用户即时纠正后旧候选、旧冲突解答与索引重建不得恢复旧说法。
4. 同源扫描/重启/配置编辑不重复消费；仓储产物不自排队，用户改版本重新排队，消费 v1 不清 v2；用户拒绝候选后同源重扫不重建。
5. 两个以上 slots 注入第一项成功后第二项失败、file-ready 失败、SQL 后回执前失败；显示真实 PARTIAL、成功一次、恢复不重复写且不额外调用。期间用户修改/删除或撤权优先，不能以旧候选继续提交。
6. 独立仓储预算并发、未知、重启持续准确；队列分页和不可用前缀不能饿死后续；合成积压量测响应性后再按证据决定 worker。
7. 应用入口验证配置、全局待整理、来源折叠/展开、分支正文与冲突解决、切助手/刷新版本屏障；用两 PID 验证恢复。真实仓储 Provider 角色需有有界合成数据实际服务证据；本设计不持 Key、不调用、不计费。

8. 自动识别/仓储创建全新对象不得取消无关的正常回答；保留013章节修复的新增对象与失效既有来源之区分。用户纠正、删除、撤回或权限变化仍撤销/阻止依赖旧版本的在途执行，不因扩充内部actor而关闭安全屏障。

实施分工：可信执行者单写 schema/Memory/Background/Provider/共享 DTO/IPC 与 trusted tests；DTO 冻结后 UI 单写 renderer 及 UI tests；root 维护 progress/013任务和完整覆盖；未参与实现者独立审核。执行前先建立上述新路径失败 oracle，再完成聚焦/全量、静态/build、生命周期及仓库规定扫描。本文只做事实/链接/格式复核，不继承章节 PASS。

本次未发现阻止该独立仓储链的产品语义冲突；内部 actor+真实权限锚点、候选暂存和分批 slot 属工程决策。RET 清理默认、额外 AST 私有类型、REM 默认仍待用户答复，不替用户选择，也不阻断本链。后续013仍必需多事件观察、每日简报/晚间复盘/每周规划/截止变更、完整分类用量运行中心及009/012/014联测，再继续整体、Windows安装更新卸载与实际发行下载；本增量不可结算全部013。

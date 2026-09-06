# 009 保留与清理设计：schema 6 现场核对

2026-09-06；角色 retention_009_design，gpt-6-astra / medium；模式 Plan / Design，使用 orchestrate-engineering-task skill。仅本报告写入，产品、正式 doc、Git 均未修改。观察 HEAD 为 a5041632c09aa3d421654e56a1e76c9e109147bf，008尚为未提交候选，独立最终审核由 root/reviewer 给结论。本设计不是008/009 PASS。009实施须先记录008实际FINAL PASS产品baseline，再冻结增量合同。

已读 AGENTS、skill/modes、progress、program总清单、009任务、008共享合同及 repair-provenance，以及 proposal §3.1–3.4/4、HLD §7–9、DD §6.2/6.4/7.1–7.2和AST/RET/EXEC集中决议。Q6是009，Q9是仓储员/章节后台，Q10是位置/完整备份/安装恢复，不能混用编号。

## 可直接推进与必须保留的门禁

- AST-006明确授权：归档继续保留；二次确认永久删除该助手私有聊天、关系、连续性记忆；保留全局共享记忆和正式事项，来源显示原助手已删除且不可展开原私有正文。不能把所有source统一写withdrawal，否则保留的共享对象会变成不可用。
- RET-001/002/005/006允许先做三区手动移动、治理预览、明确确认的信息撤回及清理/恢复。RET-007未答：不写100 MiB、90天等默认，不启动任何自动到期迁移或清空；UI注明策略待配置，当前只有手动操作。容量可先只计量和展示，不能宣称总磁盘上限已受控。
- RET-003/004的回收依赖判定/阻断UI可实现；Q9没有章节、accepted summary和未完成话题的可信产物，当前没有资格执行依赖该证据的成功原文回收。不用空摘要、布尔accepted或模拟回执冒充实现。可用合成适配器验证未来成功路径，必须标为合同测试；正式入口保持具体阻断，Q9接入后补真实端到端。
- 010事项尚未实现；建立精确跨域保留/依赖查询钩子即可。永久删除原助手时，未接受proposal处置尚待整合前产品决议，不假装当前有item/proposal表，更不能用正式事项保留规则悄悄决定提案去留。若安装了未来proposal模块且未决，应阻断这类受影响删除，其他已确认路径继续。

## 当前代码事实与必须修正的接缝

1. src/main/data/schema.ts 当前schemaVersion=6。assistant_state与多个表用FK RESTRICT或默认NO ACTION引用assistants；AssistantRepository.snapshot读取所有助手并要求active primary/current有效，archive不能处理primary。建议加法助手tombstone侧表，保留无私有正文的稳定身份占位以兼容FK；snapshot/requireActive/Provider/Memory的所有SQL资格检查统一排除tombstone，不能只依靠archived_at。私有显示名也应替换固定“已删除助手”，不作为保留个人内容。删除current时选择现有主助手；删除primary时预览让用户选替代，若无其他active允许双指针null，事务内revision CAS。不要自动创建新助手。
2. MemoryService.apply目前write/restore都将retention设persistent；delete/withdraw设trash且复用原Markdown文件名；旧版本继续引用该文件。仅变metadata并非物理删除，按版本逐个unlink会误删仍共享文件的保留版本。三区move须独立动作，仅改变retention及治理版本，保持nature/scope/owner/event/sources，不能借移动撤销withdrawal。垃圾可本地显式查看，普通search/assertRecord/index/context/后台须统一排除trash；目前search主要检查active，新增retention检查不可遗漏。
3. memory_dependencies既有memory→source也有round→memory/history；timeline_sources另存历史依赖。008修复的assertSource是路径DFS，memo key含current-memory祖先上下文，4096上下文上限；不可换回flatten closure授权。withdrawn仅命中withdrawal suppressions，representation旧版本仍通过版本规则阻止。新清理边界须保留以上校验、纠正当前版本回边例外与source历史约束。
4. MemoryService.changed仅abort正常inflight（可排除本次request），未清UI缓存。ProviderService.sessions保存临时消息，temporaryToolLedger有内存segment/operation，inflight有response，闭包还有context/providedMemory/providedHistory。永久删助手须取消正常及临时请求、清该助手session/临时账本；信息撤回须遮蔽受影响正文、终止依赖链，并防finally/迟到完成重新写回。现有ToolRepository.clear仅临时合法，persistent调用直接throw，不能复用它作持久清理。
5. TimelineRepository.page/read/context/contextRequestIds/searchHistory/selected配对直接读timeline_messages；仅过滤search_memory或UI不会屏蔽历史。所有读取入口、ToolRepository.replay、Provider的发送前/工具前/每轮续答前、commit前都要检查持久治理世代，不能只依赖AbortController。
6. App pendingMemoryCommands是惰性useState Map，key含assistant和精确mutation正文；ProviderPanel常驻，按助手/模式保存timelines、textDrafts、rejectedDrafts、operations、selected requests、history focus、uncertain/protected request refs及read/citation epochs。MemoryPanel还有编辑/预览/回执状态。隐藏或助手切换不等于清理缓存。

## 建议加法schema与窄API

建议schema 7（须以实际008冻结版为准）加入：retention_state（dataset治理revision）；retention_commands（commandId、intentHash、状态、无正文回执）；retention_previews（版本绑定目标清单/分页引用/依赖摘要）；retention_jobs及retention_job_items（精确资源身份、expected version/hash、阶段、attempt、错误码）；content_tombstones（资源身份/版本、原因、治理epoch）；assistant_tombstones；retained_source_edges（被保留对象精确版本/摘要、被切断source身份、理由、治理epoch）。表名为建议，类型/唯一键/迁移断言需合同冻结。不要把operation summary、title、原始mutation JSON复制进新job审计。

治理epoch覆盖内容状态、来源依赖、接收许可及助手生命周期变动；每个相关写入都参与epoch递增，否则预览无法防并发新增。保留旧对象版本/操作身份作为无正文屏障，不能删idempotency记录后让旧command重跑。参数hash用于相同command冲突检查，不能当正文存储；对已清理command提供已执行/已清理的无正文回执，绝不重新hydrate旧intent。

保留exactly six assistant channels。新retention域可定义preview/confirm/move/restore/status和只含ID/epoch的changed事件，Zod-free常量供sandbox preload，trusted z.strictObject校验；不允许路径、SQL、任意table/action字符串。Scope是严格判别联合：memory IDs+versions、message ID+version、range的两个消息ID（trusted验证同assistant与顺序）、timeline assistantId、assistant purge。命令UUID幂等，confirm仅previewId+nonce+accept，目标/版本来自可信预览；分页impact完整可见，不能以64条截断列表作为全部执行授权。

模型工具只能准备preview，第二次模型调用不能代替本地用户确认。删除表示、撤回信息、原文整理回收、清空垃圾、永久删助手分别呈现意图，批量数量、扩大范围、保留对象、不可恢复项与blocker分开。单条消息选择可以受理，但现有来源粒度为round，若无法准确追踪子消息/片段，则预览明确扩大为所属轮次和相关派生物；禁止靠关键词替换“精准删除”混合正文。未同意扩大则不执行。

## 保留派生物与来源不可展开

不能简单删除source edge，也不能全局放行deleted source。建议retained_source_edges只对已列入本次确认保留集合的具体accepted对象版本，提供“原始来源已删除但该接受结果独立保留”的证据边界；UI显示reason与ID，不返回私有title/snippet。普通旧round根、旧memory根、原协议重放仍拒绝。新版本继承边界须经当前版本CAS与有效body校验，不能凭任意对象ID继承。

AST保留全局共享对象时，先检查当前对象是否本来已withdrawn/suppressed及来源闭包。已撤回对象不能被本次永久删助手重新激活；保留其现状/屏障。只切断将要删除的私有来源子图，保留其他助手/全局来源限制。对嵌套来源，生成受影响叶与保留边清单，覆盖原source的withdrawal仍优先；不能跳过未删除分支。对已存在旧纠正链也保留008路径上下文语义。

外发仍需要接收助手global read+实际endpoint receive。AST决定保留共享内容，不代表授予新端点读取已删除私有历史：沿切断边不要求已不存在的助手历史权限，也不得把私有原文作为context带出；其它未切断source权限照常检查。为防删助手扩大原受限数据接收范围，建议为保留结果记录删除时有效接收约束的无正文快照；已有接收方继续取与当前global权限交集，新端点由显式共享对象授权流程承接，不自动扩大。这个边界应由009独立Reviewer重点审核，正式合同需清楚表示给用户。

正式事项未来按自己的权威状态独立保留，引用只显示来源已删除；信息撤回只能清该事项的来源摘录/派生缓存，不能借AST或聊天清理删正式事项本体。若真实内容撤回请求需要修改正式事项，必须进入该业务独立权限/预览动作，不静默做出语义替换。

## 持久抑制先行、精确作业与批处理

预览只读分页构建，绑定target版本、全部source/dependent集合摘要、权限revision、接受结果版本、active operations与dataset epoch；未完成preview不可确认。Confirm短事务复核这些条件并原子写入tombstone/suppression、固定manifest、job、receipt与新epoch。确认过期返回STALE而非自动重算后删更多。先建立屏障后异步分批物理处理；大量遍历同样采用游标/有界步进，不能全库DFS/JSON读取长时间阻塞main。工程可选每批最多几十对象并按事件循环时间片yield，数值是技术批次预算，不是RET容量/保留期限。SQLite仍保持单可信写入者，文件操作用异步fs；跨资源不宣称原子。

作业状态可为SUPPRESSED→PLANNING/READY→CLEANING→VERIFYING→COMPLETED，失败为CLEANUP_PENDING/FAILED_RETRYABLE并保留具体无正文错误；不可把零可读内容等同零残留。抑制完成后cancel只暂停尚未执行清理，已删除文件不能回滚成可恢复。重启先挂载屏障，再恢复服务读取/索引，之后核查每个job item：已不存在为幂等完成，仍存在且身份/hash/版本吻合才处理，变化则保持屏蔽并要求重新核查，不删外部新改内容。

| 资源/实际副本 | 精确处理 |
| --- | --- |
| timeline_messages.content、source_session_id/source_message_id | 预览列出选中及依赖轮次；治理先遮蔽、清理时清空正文或删除行并保留独立ID tombstone。单消息破坏完整pair时该轮退出context；恢复普通垃圾必须完整协议/配对依赖重查。 |
| protocol_segments.messages_json | 含context旧轮、当前prompt、回答、reasoning、tool arguments/results，按segment源依赖确认影响；清空或删除整个受影响不可合法重建segment，保留无正文身份/终止状态；不截半条工具消息。 |
| tool_operations.arguments_json、record_json；protocol_results.result_json | 删除参数、结果、citation snippet和可能包含内容的summary/memory receipt描述；无正文operation identity/state回执继续幂等核查。先results再operations/segment或采用符合schema的无正文记录，不破坏FK。 |
| memory_objects.record_json；memory_versions.metadata_json | 虽markdown通常空，title/event/来源元数据也可能包含被删除信息；删除私有对象/撤回范围的描述字段。保留对象仅改来源可用状态，保留当前有效正文和性质；全部版本都纳入范围检查。 |
| memory_versions.file_name、body_hash指向Markdown | 汇总受影响全部版本、dedupe文件名；确认无获准保留版本引用后按精确文件unlink。旧版本/temp/orphan不能被遗漏；受控命名与command/manifest身份相符的本数据集孤儿可纳job，未知文件单列未治理，不整目录清空。 |
| memory_commands.intent_json/receipt_json；memory_previews.payload_json | intent包含mutation正文，reload preview含候选正文，removal preview含context；成功/失败/取消的历史行同样清理。替换无正文状态或使对应预览失效，不留下可重放恢复原文的JSON。 |
| memory_index.title/body；memory_pending；memory_cleanup | 删除派生索引和过期待整理输入，迁移既有pending cleanup到真实job，完成后准确更新inspect；rebuild先查屏障，不能从尚未清的Markdown重建复活。 |
| memory_dependencies、timeline_sources、suppressions | 保留防复活/来源保留必要ID边，不存内容。AST用保留边而非withdraw全图；信息撤回保持传递阻断。删body不顺手删所有因果标识。 |
| history/memory permissions、recipients、assistant_provider_bindings | AST删除私有权限和绑定，全球connection/credential是共享配置不删除；如保留来源需要接收约束，先转成无正文结果约束。不能保留可重新启用已删助手的绑定。 |
| main内存、renderer读模型与草稿 | 抑制提交后发epoch通知并取消inflight；丢弃对应session/ledger/cache/预览和pending command正文key。新读取携带epoch；旧异步结果、stream delta、operation event、reload/correction回执均不得重新显示或提交。 |
| SQLite WAL/free pages、备份/外部复制 | SQL逻辑清空不是介质安全擦除。完成口径区分在线受管副本与备份/SQLite残页；checkpoint/数据库维护另由受控窗口处理，失败不可假称字节归零。Q10完整备份恢复必须重放已知最新撤回屏障；未掌握更新屏障的旧备份不可声称保证已删除内容不复活。 |

路径由可信DataRoot+版本化生成basename解析，无renderer路径；检查canonical根、relative containment、lstat与父路径无symlink/junction，禁止路径穿越/ADS/目录unlink和recursive delete。固定data根与数据集身份，位置失效或身份不匹配时停止作业，不回退到新空根；当前DataRoot仅development/test且packaged直接throw，不在009伪造完成Q10 locator/manifest与安装位置选择。将来Q10迁移需携带job/suppression/命令身份，不能仅复制Markdown。

## UI治理和恢复

治理changed事件只传epoch/affected助手与对象ID/原因，不传原文。App统一增加content epoch，清pendingMemoryCommands的受影响项、historyTarget及导航cache；Registry未来建议结构化元数据，避免业务代码脆弱解析JSON key。信息撤回影响混合未确认草稿时，预览说明会清除受影响未发送副本；无法判明依赖的缓存可作保守隔离并提示，不能悄悄重新发送。永久删助手可直接清该助手全部草稿与缓存。

ProviderPanel维护的readVersions/toolReadVersions/citationEpochs/requestRoutes/protected refs全部同步失效；迟到请求不能把旧读模型覆盖空状态。仅onMemoryChanged刷新不够。MemoryPanel需失效旧reload preview/编辑版本/确认卡/unknown-command重试，App切换assistant再切回仍无旧正文。历史搜索和来源定位API本身返回不可展开状态，不能只disable按钮。

恢复普通垃圾是新command+当前治理epoch+目标版本；保持原scope/nature，不新增read/receive。若新withdraw、assistant tombstone或物理文件已清除，返回具体不可恢复原因。恢复原文要验证完整pair/协议合法性和仍保留的依赖；不恢复被单独撤回的derived对象。Q9原文回收成功路径在真实accepted产物和依赖查询接入前保持阻断。

## 实施顺序、单写分工与验证

1. root取得008独立PASS并冻结baseline；009可信合同写者先落schema/治理DTO与事件、source disposition/接受结果依赖接口和数据迁移oracle。先把AST/global保留路径测试做出来，再写清理。RET数值未答不阻断这些步骤。
2. 单个可信写者负责src/main/**、src/shared/**、src/preload/**及对应integration/unit测试，包含memory/provider/assistant/read-model接缝，避免多写者在MemoryService/ProviderService竞改。UI写者仅src/renderer/**与renderer tests，合同冻结后并行；root单写正式doc/tasks/progress/总清单，独立reviewer只写review报告与隔离oracle。若需加速可信域，用先后移交或具体不重叠文件，不按领域名模糊分写同文件。
3. 先实现三区手动move/restore与全入口抑制；再preview/confirm/job核查、SQL/Markdown精确清理；再AST二次确认与global retained-source边；最后对话预览工具/UI治理通知。依赖未实现的原文回收进入诚实blocked evidence，Q9来接而非009伪标完成全部RET。
4. 合成roundtrip：persistent→staging→trash→restart→restore，权限/nature/scope不变；另withdraw后同restore失败。每个retention入口非法UUID/跨assistant/陌生field/path注入/旧version/旧confirm/变更依赖/撤权/不同command正文拒绝。
5. 删除副本oracle：以不同随机marker覆盖user/assistant text、tool参数/结果/reasoning、memory多版本title/body、command intent、reload preview和index；确认后online召回立即零泄漏，job完成后各受管SQL字段与精确文件内容无marker。无关global对象和共享connection保持逐字段/哈希不变。
6. AST三助手合成：A私有来源→global G→B新轮引用，删除A后G在原获准global接收方可用、A原文不可导航/外发；C未获global receive依然拒绝。原withdraw优先；混合B来源撤权仍拒绝；旧G版本根、原A协议重放不放行；global后续纠正仍保持008路径memo边界。
7. 故障注入在确认事务前/提交后/每个文件删除前后/SQL清理前后/回执前/重启时；反复恢复不重跑业务、不接受孤儿、不删新编辑。每batch后可响应取消/状态IPC；大量DAG和文件不会卡主线程，4096治理图超限明确阻断/分页而非漏依赖。真实双PID seed/verify覆盖屏障先启动、恢复0 Provider请求。
8. UI迟到read/stream/operation以及assistant A→B→A、pending未知命令注册表、隐藏ProviderPanel、旧reload确认、来源按钮、切换main/current删除全部做甄别性测试。独立reviewer验证全suite、typecheck/lint/format/build、双PID、依赖树/foundation/secret/generated/residual扫描；合成数据不付费、不读取真实私人数据。

## 交接与未决

本报告文件写权限现归还root。待root正式实施移交，不自行扩写产品。REVIEW重点是retained-source精确边与外发约束、全部副本、迟到写回、job中断、FK/current-primary一致性。产品待答仅RET-007及010 proposal整合前语义；Q9 accepted依赖与Q10数据集/备份能力属于明确后续工程，不冒充现已验证。默认exec helper出现setup-refresh失败，授权require_escalated只读路线成功；报告创建采用精确absent preimage、同目录临时文件、原子move、hash回读，无ACL/reset/force。

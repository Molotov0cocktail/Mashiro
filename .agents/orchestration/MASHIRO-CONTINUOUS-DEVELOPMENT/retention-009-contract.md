# 009 trusted 增量合同（实施中，未审核）

2026-09-06；角色 retention_009_trusted；实际 gpt-6-astra / medium。遵循工程编排 skill Execute Feature / 高风险独立审核路线。产品 baseline 为 008 cc9c729；008纯证据修正 c6a3363，root已完成 docs closing 34cb147。全程序 ACTIVE，009不是停止条件；本报告只协调共享接口，不替代 progress 唯一入口。

## 冻结接口与单写

- trusted写者：src/main、src/shared、src/preload、tests/unit、tests/integration、既有Electron harness；UI写者：src/renderer、tests/renderer。root写正式任务/总清单/全局记录，Reviewer独立。
- shared/retention-contract.ts 为真实DTO：overview、move、preview、confirm、jobs、retry、onChanged；六assistant channels保持。Preload只在运行时引入Electron与纯通道常量，所有输入/输出在trusted校验。
- jobs/retry严格允许省略assistantId，提供最后助手删除后、重启无active助手时的本地管理通路；传ID时精确匹配。治理IPC仅接受当前本地应用窗口main frame。数据范围不能由renderer路径、SQL或任意表名决定。
- move为对象ID/对象版本/治理epoch/命令UUID/三区zone。恢复垃圾是新的CAS动作，不能撤销后续withdraw。preview判别目标为精确memory IDs+版本、message、range、timeline、assistant+接替ID；确认只用可信previewId/nonce/commandId/accept。
- 预览返回完整memoryIds/requestIds/retainedMemoryIds、文件数、扩大到整轮说明、不可恢复与blockers。最多4096图对象，超限拒绝而不截断执行授权；工具结果只返回预览ID和数量，完整范围通过本地卡展示。
- ToolOperation新增retentionPreview/retentionIntent；request_retention_cleanup只能准备，不能确认。由于模型自身协议收尾改变epoch，用户打开时按trusted保存intent重新生成预览，再本地确认。
- changed仅epoch/对象ID/助手ID/轮次ID/reason；Provider generation屏障清session/临时账本、取消请求并拒绝迟到正文/事件/提交。UI清正文缓存及旧确认、未知正文命令Map。
- MemoryRecord.deletedSourceAssistantIds只读展示来源原助手已删除，不能回传扩权或展开其私有原文。

## 明确语义

AST已批准保留归档并二次确认永久删目标A私有chat/relationship/continuity，global共享和正式事项保留。root补充裁决：不能因来源A而删除B已接受私有对象；B对象保留原scope/性质/权限，跟global一样用精确来源保留边与原接收交集。包含A原文副本的B传播轮次/协议只有完整列入扩大的预览并由用户确认才清；来源“曾提供”不声称实际使用。既有withdraw优先，不一概withdraw、不直接删edge扩大接收方。

AST存在目标A的assistant-scoped user/event时，root已就新增范围问用户、等待答复；当前候选预览具体阻断这类purge，不能把它当既有批准。010真实items/proposals表尚不存在，仅留窄依赖钩子；不假称已验提案删除语义。

RET-007待答，automaticPolicy=UNCONFIGURED；不设置100MiB/90天，不自动迁移/清空。计量区分当前接受正文与受管文件占用。三区手动move及明确清理独立推进。

recycle-original先核验Q9接受结果ID/版本/hash与未完成依赖，默认生产适配器缺章节/摘要/未完成话题证据具体阻断。合成适配器只做合同测试。成功路径原轮进入可恢复垃圾，接受结果独立保留；restore-original复核完整配对、接受结果版本和后续withdraw。empty-trash才不可恢复清除原文垃圾。Q9真实端到端尚未完成。

## 持久化与清理

schema7加治理epoch/generation、严格preview、无正文command回执、精确job/items、content/assistant tombstone、原文垃圾及retained source edges。既有authority/content表变动增加epoch使预览失效；显式治理增加generation用于迟到屏障。

确认短事务先写抑制/精确清单、command身份与job，随后每24资源yield执行异步精确unlink与SQL副本清理。hash变化保留屏障并报FILE_CHANGED；路径必须在可信memory根内且每级无symlink/junction，拒绝目录/ADS/穿越，不递归删。重启恢复pending作业，不重放业务或Provider请求。取消确认不产生清理作业。

清理覆盖全部memory_versions文件与metadata、memory_objects标题/event、index/pending/cleanup、成功失败旧memory_commands.intent/receipt及reload/removal preview、timeline正文和源session身份、protocol context/reasoning/tool参数/结果及操作摘要。保留防复活必须的稳定ID、hash和无正文回执，不删除后重新执行原command。助手purge额外包括其未提交命令生成的受管临时/孤儿文件。

SQLite残页/WAL和用户备份/外部副本不称为安全擦除；Q10备份恢复须应用最新已知撤回屏障，另行完整资格。原文物理清除后不承诺可恢复。

## 验证与当前状态

已新增可区分测试覆盖三区/restore、防后续withdraw、精确预览与缺依赖、所有memory旧副本/命令防重放、三助手global保留/旧endpoint交集、文件故障/修改/幂等重试。首轮6测试3通过3失败：两个strict DTO夹具多传body、一个手工改record未同步依赖表；夹具修正后6通过。联合48测试47通过，剩余旧v4降级夹具保留schema7表导致碰撞，已补独立合成legacy helper恢复真实旧形态；待重跑。trusted TypeScript已通过两次，非最终完整验证。

剩余：原文成功合同测试、B私有/混合withdraw/无active重启、多副本协议/迟到流测试、retention迁移fault与严格IPC、最终全套/静态/format/build/fresh双PID与扫描、独立Reviewer。尚未提交/推送，不自判FINAL PASS。

工具路线：默认exec与existing apply_patch helper在目标读取前setup-refresh失败；经授权require_escalated可运行。新文件apply_patch成功；已有文件采用精确allowlist/preimageSHA/确定性匹配次数/同目录临时文件/File.Replace备份/回读postSHA/清自己临时文件，没有ACL/reset/force/history rewrite。


## 可信候选交付更新（2026-09-06 23:49）

以上“首轮/剩余”为保留的阶段历史，最终可信结果见 [retention-009-trusted-result.md](retention-009-trusted-result.md)。可信最终 23 文件 / 167 tests 通过；独立审查尚未进行。

最终 DTO 的 memories 为受影响与保留对象的完整并集（并集后也执行 4096 上限，拒绝而不截断），带版本/所属助手/kind/scope/可见 title；rounds 带真实 assistantId+requestId、时间及当前助手可见摘要，跨助手正文摘要为 null。工具持久化卡中的 title/summary 均清空，不能借预览复制私有正文。计量另列 SQLite 主库/WAL/SHM 字节。

changed 的 cleanup/purge/move 会保守广播全部助手 ID 以失效全局来源缓存；这不是“所有助手身份已删除”。job-status 仅刷新作业，不触发 Provider session 再清理。UI 应清正文与过期卡，未知命令的无正文身份仍须保留防重放；root 正在协调 digest registry，早期“清未知Map”描述不再作为最终契约。

正常 TimelineRepository.insert 在同事务写入前拒绝跨助手既有 requestId，Provider 正常发送与 saveTemporary 均遵守，拒绝零外发/零半轮；Provider 全局 inflight 同时防在途冲突。旧库合法重复不加破坏性 unique 迁移，保留原文并在清理预览 fail closed；不继续制造新歧义。

文件删除采用受控同目录隔离：原始哈希检查后 rename 到作业专属 quarantine，再核验被移动的实际字节；外改不匹配时用不覆盖新路径的恢复路线保留字节并报 FILE_CHANGED。after-quarantine 中断由持久 job 在重启重试，实际删除仍受每级 no-junction/no-symlink 校验；不声称抵御同权限恶意进程或安全擦除。

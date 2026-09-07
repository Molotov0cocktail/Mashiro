# 009 保留、原文清理、恢复与删除完成

- TASK = 009；状态 = ACTIVE / POLICY_IMPLEMENTING（MANUAL_CORE PASS保留）；PROGRAM ACTIVE。
- 编号已核对未占用。008已独立FINAL PASS，当前产品任务为本009；基线产品`cc9c729cd5b65597049f988c41e3def97fcb0515`、归档HEAD`c6a3363bd923be7ad540ce7e0502fb35aa06bd6b`均复核同步双remote，唯一入口为[progress](progress.md)。本任务承接总清单Q6和A07、E01–E06，不是程序停止点。
- 来源：proposal §3.3/4及集中决议，high-level-design §7，detailed-design RET-001–007、MEM-003、AST-006、EXEC-002–004。008提供即时抑制和跨资源提交；本任务完成保留、原文/旧版本/协议副本的实际清理及恢复。

## 用户闭环

1. 用户可在持久、暂存、垃圾三区查看和移动记忆/事件，恢复或按明确范围清空。分区不改变性质、归属、来源和读取/接收权限；持久区不自动降级。垃圾内容退出所有普通召回、后台摘要、索引及协议续接。
2. 按单条消息、选定区段或整条时间线预览清理影响。界面明确区分“整理回收原文、保留接受结果”和“删除信息/撤回依据及派生副本”；确认绑定目标版本、依赖集合和当前权限，过期预览不能执行。
3. 整理回收先检查接受的事件、摘要、连续性记忆确已提交，未完成话题/业务不再依赖原文。保存失败、正在执行、缺少依赖整理结果时不回收，提供具体可处理原因；不得用仅有空摘要标记满足检查。默认先进入可恢复阶段。
4. 信息撤回立即停止召回后，实际清理治理所列原文、Markdown旧版本、摘录、聊天回答、协议及派生索引中的对应副本；记录准确清理状态。只保留防复活必需的不含正文标识/版本屏障，不能靠索引重建或旧作业复活。
5. 恢复是绑定当前治理版本的新动作，重新核验依赖与权限。恢复普通垃圾不自动撤销用户后续的信息撤回；原文已物理清除时诚实说明不可恢复。备份是独立历史副本，恢复备份必须应用已知撤回屏障，不声称磁盘安全擦除或清除用户自行复制的文件。
6. 助手永久删除按AST-006用户决议实现；归档保持可用，不能连带删除全局正式事项/共享记忆。删除私有来源后，全局对象显示来源已删除的诚实状态，不以引用面板重新暴露原文。

## 已确认用户决议

2026-09-06 root已用异步问题询问两项，008继续独立实施：

- AST-006已确认：用户2026-09-06答复“采用建议的永久删除范围”。保留归档，另提供二次确认永久删除助手私有聊天/关系/连续性记忆；全局共享记忆及正式事项保留，来源显示原助手已删除且不再展开私有原文。
- RET-007已于2026-09-07获用户确认：默认持久区已接受Markdown正文UTF-8总量100 MiB（104857600字节），超限只阻止新增占用，不删除或降级已有内容；暂存满90天转入可恢复垃圾区，两项均可调整或关闭；垃圾永不自动永久清空。
- AST-006实施细节已确认：用户2026-09-07答复“采用建议，一并删除助手私有 user/event”。删除范围扩至目标助手全部私有记忆类型；全局共享记忆、正式事项和其他助手私有记录保留，未接受提案按已确认规则删除。新增范围已实现并获[独立限定PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-private-types-root-pass.md)：五文件27tests及两条预览后新增私有记录反例通过，物理旧版本清理/迟到写/共享保留已验；制品整体验收另待。
- REM-002已由用户单独确认并落实到012；此处不更改已确认的提醒规则。

## 当前实施与单写范围

最终手动核心于2026-09-07获[独立MANUAL_CORE PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-final-manual-core.md)：41 files / 255 tests、独立4 UI oracles，最终Electron PIDs99400/115408及102文件无漂移。五处实际缺陷已关闭，详见[集成验证](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-final-validation.md)。所有作者和Reviewer已归还写权。提交同步后继续010；本任务整体保留INTEGRATION_PENDING，RET/额外AST/Q9真实接受回收及Q10备份仍待完成。下段为本次实现和修复过程记录，不代表当前仍待修复。

2026-09-07续接：retention_009_trusted（实际gpt-6-astra / medium）已交回main/shared/preload、trusted tests及Electron harness写权，可信23 files / 167 tests与最新双PID 113640/112668通过；见[可信候选报告](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-trusted-result.md)。独立review_009（实际gpt-6-astra / medium）已复跑可信23/167通过，但[独立反例给出REPAIR](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-repair-1.md)：已清空版本文件占位被再次纳入purge作业。repair_009_cleanup（实际gpt-6-astra / medium）只修可信清理清单及可证明的旧失败恢复，保持unsafe路径拒绝；尚无独立PASS。retention_009_ui（实际gpt-5.6-sol / high）已交回renderer及对应tests，见[UI候选报告](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-ui-result.md)：13 files / 58 tests及自有静态通过；其后独立review_009给出UI反例，原UI作者已重开AssistantPanel、RetentionPanel和MemoryPanel窄修；App迟到来源switch独立通过，旧rename局部缓存、empty-trash目标漏接、过期成功释放未知身份仍须原样oracle通过。可信清理修复及15个新增反例已独立验证，当前可信25/184通过；root增补真实Electron DOM保存及先清记忆再purge测试，尚待最终实际执行。overview/move/preview/confirm/jobs/retry及只含epoch/IDs的changed事件为窄领域入口；六assistant通道不变。root单写正式任务/总入口。

## 工程方案与风险检查

- 复用008接受指针、来源依赖、抑制/命令身份；采用受控范围的清理作业及逐项完成状态。文件删除前验证生成路径在指定合成/数据集根内，不让renderer传路径或任意递归删除目标。
- SQL治理与文件删除不是跨资源原子事务。先持久化抑制与精确清理清单，再幂等执行删除，重启核查未完成项；失败显示未完成，不重新接受旧内容。取消不能谎称已删除文件可自动回滚。
- 正常UI清理和助手工具都使用同一可信授权/预览/确认链；模型输出不是批准。完整批量范围和依赖扩大必须可见。
- 容量计量、暂存期限、垃圾自动清空按用户答复冻结；物理磁盘占用（含旧版本、协议、垃圾）另列真实值，不能把逻辑容量说成总磁盘上限。
- 仓储员/章节尚未提供已接受结果时，相关自动回收保持待处理并由Q9完成后端到端验收，不用空占位通过。

## 验收与交付

- 对话删除表示/撤回依据→真实回执→普通召回、selected/recent、历史检索、协议重放、后台与索引重建均不带出旧内容。
- 混合来源、重复/交叉来源、多助手共享、后续用户纠正、陈旧作业、清理中撤权、并发编辑、旧确认重放都有甄别性测试。
- 整理回收的依赖未满足/保存失败不删除；成功后接受结果保留；垃圾恢复不扩大权限。物理清理文件故障/中断→重启核查→准确恢复与不可恢复提示。
- 容量边界按批准策略测试，持久区不因排序/到期自动删改；定时任务不调用未经预算授权的模型。
- 使用隔离合成数据，不对用户日常数据做破坏验证；新领域独立Astra Reviewer审核后提交、非force同步两个main，更新覆盖并继续事项、仓储员、安装发布队列。

## 执行清单

- [x] 原文、编号、008依赖和待决问题准备。
- [x] AST-006：用户2026-09-06答复“采用建议的永久删除范围”，决议已确认；按上文精确范围实施。
- [x] RET-007于2026-09-07已明确选择建议的100MiB/90天默认。此前[共同工程准备](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-policy-preparation.md)保留为批准前只读事实；现由原Sol/high执行者memory_017_ui落实可信端和完整设置入口，原Astra/medium reviewer独立复核，root单写全局入口。当前schema18，确认版本占用后采用加法schema19；不覆盖正在验收的冻结out。
- [x] 008独立FINAL PASS与精确baseline已核对；[实际代码设计](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-design.md)完成，可信执行者据此冻结增量DTO/清理边界。
- [ ] 三区/容量/期限、用户清理和对话预览确认、恢复/物理清理实现。
- [ ] 依赖、删除传播、中断恢复、权限及真实用户入口验证。
- [x] 手动核心独立审核MANUAL_CORE PASS；最终静态/构建/Electron与反例通过。
- [x] 手动核心绑定提交`d6cd1fa4a27ccb418ffc3ff04503366acb133e2e`，github/gitee非force同步并ls-remote同值；110个源码/raw证据暂存字节一致。
- [x] 额外AST私有user/event已确认、实现并独立限定PASS。
- [x] Q9章节接受→可信回收→摘要继续可读→原文恢复已有真实服务链反例；并发否决优先也已验证。最新015整合全量136文件641tests再次覆盖，见tests/integration/background-service.test.ts与background-retention-race.test.ts。
- [ ] RET/Q10完成后结算整个009；最终安装跨域场景仍待，不用服务测试代替。
- [ ] 持续执行010及后续总任务，直到实际发布下载核验。

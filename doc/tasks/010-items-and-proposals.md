# 010 统一事项、提案与对话执行

- TASK = 010；状态 = TASK_DONE / FINAL PASS；PROGRAM ACTIVE。
- 编号核对未占用。008已独立FINAL PASS，009手动核心已审产品为`d6cd1fa4a27ccb418ffc3ff04503366acb133e2e`，两个main已实查同步，当前正式产品任务为本010，唯一入口为[progress](progress.md)，总需求见[项目总清单](program-docs-to-release.md)。[009](009-retention-and-cleanup.md)承接生命周期；本任务承接Q7、F01–F03/F07及对应业务权限。
- 原文：proposal §3.4–3.5；high-level-design §5/13；detailed-design §7.3/8、ITEM-001–004及EXEC决议。独立Astra阅读所得[领域预案](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-next-design.md)是实施输入，尚不是源码审计或冻结接口。

## 用户闭环

1. 目标、项目、任务、承诺、等待事项使用统一正式系统，提供列表、筛选、详情、关联、明确修改及各类型可理解的完成/取消/重新打开动作。对话执行和界面修改作用于同一对象与版本，正常重启恢复。不会从提案推导用户已经承诺。
2. 正常对话中的明确指令在当前授权内低干扰执行，可信操作回执显示真实结果；模型回答中断不抹除已提交结果，也不重复业务写入。AI推测只能创建待确认提案，模型参数不能自授显式批准。删除、批量、高影响动作先显示精确范围并确认。
3. 提案支持接受、否决、暂缓、恢复处理及与发起助手协商。协商更新同一稳定提案及版本，不复制卡片。原助手稳定身份保留；其他助手不得自行改写。接受将提案和唯一正式事项原子提交，过期版本确认拒绝。
4. 提案接受前不计入正式事项、逾期、完成率、正式承诺、提醒调度或日历占用。否决后的旧来源重试、改写措辞、重建不能反复提出相同建议；新来源证据不被一刀切禁止。来源与语义身份方案须以可区分反例验证。
5. 助手读权限、实际Provider接收权限和业务写权限分别检查，来源撤回和端点变更及时生效。严格临时禁止事项/提案持久业务。全局正式事项不随聊天、记忆或助手私有数据删除而级联消失；来源已删除时不展开原私有正文。
6. 未接入真实Clender，仅提供本地事项、候选时间及后续本地提醒，不声称写入真实日历、核实空闲或无冲突。确定性提醒在Q8实现，后台主动建议和预算在Q9联测，本任务不会用空壳宣称这些功能完成。

## 实施约束与依赖

当前执行者items_010_trusted（实际gpt-6-astra / medium）单写main/shared/preload、trusted tests及harness；严格DTO已落src/shared/item-contract.ts与item-channels.ts；items_010_ui（实际gpt-5.6-sol / high）已单写全部renderer及renderer tests并行接线，可信Provider整合仍由items_010_trusted顺序单写。root单写全局记录与Git。009独立41/255及最终双PID99400/115408有效；010新增差异需新审核。未审发行声明准备文件保留待Q10。

- 复用007稳定operation、可信工具与协议续答，以及008领域授权/来源/接受回执；先承接008已关闭的来源与纠正修复，不复制旧缺陷。事项/提案事务状态由SQLite权威保存，不塞进记忆Markdown。
- 已完成[实际源码方案](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-actual-plan.md)，覆盖可信明确指令、稳定业务slot、来源领域和009同事务联动。实施依赖009已审手动核心，不要求等待Q9自动整理或RET参数完成；相关分支保留明确阻止。
- 归档原助手协商的工程接线：现有assistant.switch严格输入增加可选restoreArchived（默认false），仅明确“恢复原助手并协商”用户动作在同事务解归档并切换；普通switch继续拒绝归档，已删除墓碑永远拒绝。保持六通道，纳入新行为测试和独立审核，不恢复旧primary选择。
- schema号和精确baseline读取最终现场，禁止预占或重写既有迁移。新增领域strict DTO/窄IPC，保留六个助手通道；renderer不能传SQL、任意路径、凭据或网络权限。
- 业务提交、版本检查、提案接受、正式对象和成功回执同一事务。稳定command身份绑定原始用户操作；重复同内容核查已有结果，不同内容冲突；未知状态先核查，不自动重放副作用。
- 来源和权限覆盖结果返回、继续回答、提案协商及009清理。内容删撤后不能从旧快照、协议或操作正文复活。确认绑定目标版本与完整影响范围，陈旧预览不执行。
- 可信域文件和UI组件可以按冻结DTO并行；schema、Provider、preload、App接线等共享文件由单写整合者顺序修改，不能与当前009可信/UI文件并写。正式全局任务和progress由root协调。

## 必要决议

AST-006已批准永久删除私有聊天/关系/连续性记忆并保留全局共享记忆及正式事项。2026-09-07用户已明确答复“未接受提案也一并永久删除”：永久删除发起助手时，其尚未接受提案一并永久删除，停止协商，不转交其他助手或保留待处理卡；已接受形成的正式事项按原AST保留。删除覆盖旧提案正文和可展开副本，迟到作业不能复活；防复活必要无正文墓碑及操作核查标识可保留。本答复取代此前保留ID/状态的推荐；该提案门禁解除，额外私有user/event和RET问题仍待答。当前可继续普通事项/提案闭环。

RET-007保留策略已问待答，REM-002提醒默认仍待具体决议；不阻止本任务明确指令及提案零提前调度的实现。其余内部API、库、SQL和状态代码由工程链决定，不逐项交给用户审批。

## 验收与继续条件

真实角色初检（2026-09-07，未通过）：[诊断记录](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-live-failure-diagnosis.md)保留首轮5调用及增量2调用。创建、服务重开0外发与none检索已成功；提案参数candidate.counterpart触发严格schema invalid_type，0提案写入。可信执行者仅对可选对象字段的wire表示做窄修和非法类型反例，完成前不原样重复计费。第三轮counterpart wire已通过，跨句原样evidence及不存在关联ID导致明确未执行；可信归一化/中性失败工具回传本地反例正在补。以上为前三轮历史事实。修复后[第四轮真实角色闭环](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-live-product.md)SUPPORTED：创建→服务重开→none检索→提案→同ID协商→幂等接受→完成，9请求22923tokens。后续[原事项修改增量](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-update-live-product.md)2请求7577tokens也SUPPORTED：原ID/version完整候选PENDING、确认前零写、重复确认仅v+1、重开0调用。010累计22请求56672tokens；非renderer驱动或进程重启证据，最终Electron和独立产品审核仍待完成。

- 五类对象的真实界面及自然对话写入、修改、重启恢复；真实合适端点至少跑通必需角色，模拟不替代全部live。
- 推测只建提案；接受前零正式统计和调度，确认后正好一项；并发接受/重启恢复/重复点击不重复；旧版本、另一助手协商修改拒绝。
- 同来源否决抑制、不同建议不过度抑制、新信息允许；来源撤回/删助手后隐私保护；新端点无继承外发、在途撤权与严格临时零写。
- 回答失败但已提交可核查，事务故障注入无半接受/重复正式项；删除/批量未确认零执行，确认前目标变化拒绝。
- 独立Astra审核高风险持久化、权限、业务副作用及实际入口；合理静态/完整回归和Electron证据后提交、双远程非force同步，更新覆盖并自动继续Q8/Q9/Q10/整体验收/实际发布。

## 当前独立复核

2026-09-07作者冻结50files/292tests和两PID122888/117380；renderer17/80及root独立恢复oracle红→绿。随后[独立REPAIR](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-review-final-repair-1.md)两反例确认：Provider修改把目标自身旧版本作为新依赖，下一轮不可读；64来源上限静默丢第65条。trusted已承接修复，保留完整来源依赖及原子拒绝边界；Reviewer重跑原反例后再结论。两条来源oracle随后原样通过；独立审核继续发现提案identity对同原文不同引用范围可绕过、非日期实质新条件被误杀，以及正式事项保留例外吞掉传递来源撤回（已用公开memory/retention链复现）。identity两侧也已独立转绿；retained传递撤回和状态变更继承例外已作者修复待独立复验。[追加报告](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-review-final-repair-additional.md)另确认正式事项字段修改/选入对话缺口，现prepare_item_update同ID/version完整候选→本地确认的可信路径及真实增量已通过，UI入口及完整差异已冻结（17files/84tests），review_010_final已复开原样反例与新差异独立复验；trusted正在统一最终build/Electron与manifest02。程序仍ACTIVE，010未完成。

## 最终结论（以上待审描述为历史）

[独立FINAL PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-review-final-pass.md)报告SHA256 45711122F511D0BC26CB369DD411F64075A448F4091CB9E2813E40603C79DBB6；131文件manifest SHA256 29451A2398F3F37B2538355AA0ECE490C8C330C87117FB62F83AEE785726652A。51文件301测试及7个独立断言通过，另1夹具附带测试通过；全部REPAIR关闭。最终回执版本修复、build及静态通过；Electron02先于末次回执元数据修复，Reviewer明确比例复用，未声称重跑最终SHA。root核对130个候选文件和53份010证据暂存blob，属性仅追加UI原始报告字节保留；提交ab11110a45c6ddb65bd114547225dd4e329bba11并非force推送github/gitee，ls-remote两个main均同值且退出0。直接继续011。程序仍ACTIVE。

## 清单

- [x] 文档来源、五类用户闭环、提案与正式边界及编号准备。
- [x] 008最终已审产品baseline为`cc9c729cd5b65597049f988c41e3def97fcb0515`；009清理契约正在整合。
- [x] 承接009最终实际源码，初始严格DTO/窄通道已落；复杂来源和操作实现仍在进行，不冒称全部验证。
- [x] 可信事务、对话工具链与整合中文日常入口。
- [x] 甄别性权限、来源、确认/协商、恢复和真实角色验证。
- [x] 独立审核、提交双远程同步、覆盖更新并继续011。

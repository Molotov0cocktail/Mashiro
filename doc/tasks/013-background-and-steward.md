# 013 章节、仓储员与可预算日常后台

- TASK = 013；ACTIVE / IMPLEMENTING；PROGRAM ACTIVE。唯一入口为[progress](progress.md)，承接[总覆盖](program-docs-to-release.md)Q9及D02/D03/D05/D07、F06、G02/G03相关余项；实施时逐行复核实际覆盖，不以这些导航编号减少范围。
- 来源：proposal §2.1、3.1–3.3、4.2–4.3、6；high-level-design §5.3、7、10；detailed-design §7、9及MEM-001–007、EVT-002、RET-003/004、USE决议。依赖008记忆、009清理、010事项和012运行生命周期；编号已核对未占用。

## 用户闭环与验收

1. 用户选择后台功能、执行角色的连接/模型、允许的数据范围和明确预算后，才能启用后台；默认未配置不外发。界面可查看待处理、运行、失败、预算暂停和已完成，取消及重试有真实回执。达到调用或处理量上限保留待处理，不换模型、不无限重试；记录输入/输出用量及不可得状态。
2. 正常对话可产生有来源的整理增量；严格临时不入队。当前助手管理自己的章节、关系/连续性和未完成话题，适合共享的增量交给内置仓储员。仓储员只能读取当前任务需要、读取允许、实际接收方允许的交集，不互读未经授权的私有资料。
3. 全局待整理区显示来源、性质和处理结果。真实模型角色支持去重、分支归并、冲突识别；忠实归纳低干扰接受，新增判断始终保留推测性质，冲突不覆盖用户确认或后续纠正。来源/变更默认收起但能展开核查；不能只有手动CRUD或后台数据库没有入口。
4. 章节及压缩摘要可以浏览、选入上下文，并明确原文范围与接受版本；完整工具调用/结果关系不得半截压缩。未完成话题及业务依赖持续可查。009原文回收只有在真实接受摘要/事件/连续性已保存且依赖检查通过后才解锁；压缩成功本身不删除原文。
5. 多事件的观察可解释时间、来源和客观依据；习惯判断保持待核验推测，不从零散情绪生成确定人格或心理诊断。删除、撤回、纠正后旧作业、重建、索引和迟到结果均不得复活旧结论。
6. 每日简报、晚间复盘、每周规划、截止及变更提示有可配置时段、范围与预算，实际生成可阅读结果及关联来源；规划推测进入010提案，接受前零正式事项/提醒。无Clender集成，不声称核实空闲或已写日历。
7. 运行中心汇总权限拒绝、业务记录、重复同类错误及按普通对话/整理/后台任务分类的用量；显示下一动作与恢复状态，默认日志不复制正文/Key。失败不把已发生业务说成未执行，未知先核查。
8. Markdown语义接受版本与事务治理一致；应用内编辑优先。显式外部重载只走可信选择、验证及冲突处理，不自动信任文件变化或扩大权限。可选embedding仍按原始DEFERRED范围，不构成必需门槛，现有全文检索和重建须遵守删除抑制。

## 当前源码准备

root在012并行实施期间已形成[实际接入方案](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-actual-plan.md)：基于memory_pending、接受版本/来源/抑制、RetentionDependencies真实ID/version/hash及现有Provider输出限制，明确角色预算、作业、章节与日常入口。background_013_design（实际gpt-6-astra/medium）随后已完成[实际服务合同](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-contract.md)，root已读并采纳为实施路线：后台origin不伪造round，章节引用真实Memory接受版本，预算持久预留且未知不归零，009依赖ID/version/hash稳定排序。012产品f34c543d287946ad9302f51577fe30c86a67bdf9已独立通过且双远程实查同步；现在background_013_trusted（实际gpt-6-astra/medium）已接手可信实施，主进程/共享DTO/存储单写，共享DTO已落盘，background_013_ui（实际gpt-5.6-sol/high）已接手renderer及对应测试并与可信执行者协调；root维护全局记录。首个连贯增量为显式配置→正常完整轮→预算内真实章节/未完成话题→接受/可读/选上下文/可回收依赖；它不代表013全部完成，仓储分支/冲突/观察/日常/运行中心继续必做。

## 章节核心已审核增量

2026-09-07：[独立CHAPTER_CORE PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-final-pass.md)，报告SHA-256 BC709A02DD122825DCA0617AC094187C70A79D775CACCB845E5BDB1DEB29CC0F；45文件最终manifest-v2，73files/418tests、类型/lint/格式/build及实际Electron06 PIDs153292/152788通过。真实章节读取、上下文选择/发送、重启身份/预算和009原文回收依赖已验；独立关闭R1–R6，关键拒绝优先/迟到正文/草稿冲突回归进入默认套件。历史无精确确认proof的closed清理预览不被冒称结果已知，作为来源保守阻止。提交前R7后台记忆详情IPC类型遗漏已修，当前[增补审核](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-final-r7.md)覆盖真实IPC及后台标签；48文件manifest-v3、73/420和静态/build通过，Electron06先于此小修按明确范围复用。已提交95db9cfa93673ff6975ddb75ccba56b2d0264828，github/gitee均非force推送并实查main一致。150暂存路径与已审本地字节一致，本任务仍ACTIVE。

直接接续[仓储员实施合同](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-steward-contract.md)。steward_013_trusted实际Astra/medium已释放可信写锁并开始实施，共享DTO已落盘，steward_013_ui实际Sol/high已并行接renderer；root单写全局入口。全局增量/分支冲突、观察、日常及运行中心继续必需，不能以本增量结束013。

## 仓储核心已审核增量

2026-09-07：[root独立STEWARD_CORE PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/steward-013-root-final-pass.md)对应57文件manifest-v2、独立100文件511项全绿、最后build及比例静态通过。独立关闭范围泄露、完整分页、已解决冲突刷新、纠正后分支版本/UI缓存、损坏正文被吞五类缺陷；最后SQL编译复用修复保留全部实时治理检查和默认测试超时。原生Electron02双PID157852/154732、真实DOM和重启0仓储调用通过，真实角色3请求1361tokens通过。提交同步由root执行后在入口记录。

仓储核心PASS后直接实施[多事件观察与日常合同](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-daily-observation-contract.md)及[UI六入口计划](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/daily-013-ui-plan.md)，补齐观察、简报、复盘、周规划、截止变更、分类用量，不能在此关闭013或PROGRAM。

## 日常候选与当前验收

2026-09-07：日常可信32文件与UI v4十文件已由root完成[独立源码/本地业务限定PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/daily-013-root-candidate-review.md)，四条UI与两条跨域反例关闭。整合full02为129文件602tests全绿；后续专属提示词3文件5tests比例通过并另由Sol独立审。五类[真实服务角色](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/daily-013-live-product.md)已SUPPORTED，失败与修复证据保留；当前Sol单写新增日常native E2E，实际原生入口及全覆盖最终结算仍待。当前HEAD仍2307e490，未将正在完成的候选冒称已提交。

## 当前真实角色证据

[真实章节角色闭环](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-live-product.md)已SUPPORTED：GLM-5.3-FLASH实际3请求849tokens，正常轮→预算1次且真实max_tokens2048→接受Markdown/事务回执→选章节续答→无Key服务重开0调用。结果JSON SHA-256 E3572FCFF6E974363CD714DB74BBDAB36DF2B1FC1AA420F38A7072F08A086A33；非renderer/跨进程/PACKAGED。定向对抗与独立审核仍在继续，仓储/观察/日常角色仍必须分别完成。

## 工程闭环

实施者读取当前实际服务/DTO与上述原文，再拆可审核增量；队列、租约、事务和worker由工程链评估，不能把复杂度改成产品延期。主线程响应性使用真实合成积压验证，只有证据需要时迁移worker。新schema加法版本化，恢复先核查稳定作业身份及当前版本，提交前再检查权限、撤回及取消。

验收包含：零授权零调用；预算并发预留/耗尽/失败记账；同作业重启不重复写入；摘要保存失败不回收原文；用户编辑与在途撤权胜过旧任务；跨助手及换接收方不扩大权限；垃圾区零召回；真实模型完成至少整理与日常后台关键角色。沿用合法进程凭据及有界合成调用，不访问新私人资料。

013完成后对009依赖回收、012运行和Q10备份迁移作跨模块结算，安排未参与实现的独立审核，提交双远程同步，继续整体及Windows实际制品发布验收。该合同不替代实现，也不是PROGRAM_DONE。

## 清单

- [x] 原文闭环和后续依赖已定位。
- [x] 当前源码设计、预算/权限/队列与恢复（已审核心及日常本地候选；最终整合另核）。
- [ ] 章节/待整理/仓储员/观察和日常后台的真实入口与对话链。
- [ ] 实际角色验证及删除、权限、回收依赖反例。
- [ ] 独立审核、跨模块结算与提交同步。

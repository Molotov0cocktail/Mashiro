# Mashiro 当前任务入口

> 更新：2026-09-06。PROGRAM 状态 ACTIVE，目标为文档功能完整落实、整体验收、Windows 安装/更新/卸载验证及实际发布下载核验。TASK_DONE 不等于 PROGRAM_DONE。唯一当前续接入口是本文件；项目覆盖、授权、依赖队列和完成条件见 [文档至发布总清单](program-docs-to-release.md)。

新 Agent 先读本文件，再读总清单、当前正式任务和相关设计。Git、代码与最新独立证据说明当前事实；旧初始化/F1/004/005 非目标与 STOP_CHECKPOINT 只描述历史，不阻止本轮已授权范围。

## 当前工作与直接下一动作

- 当前正式任务：[009 保留、原文清理、恢复与删除完成](009-retention-and-cleanup.md)，ACTIVE / IMPLEMENTING。008已独立FINAL PASS；009先实施已确认的手动三区、精确清理、永久删除与共享来源保留，RET-007未答不擅定自动参数。010事项、Q9后台、完整安装与实际发布继续总队列。
- 同步工作：[早期ASAR探索](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/packaging-spike-v1.md)及[隔离NSIS数据保护路线](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/installer-protection-spike-v1.md)均SUPPORTED。NSIS实验验证精确程序文件清除与未知/data文件保留；没有启动安装后应用、比较不同应用/schema版本或验证升级回滚，正式应用安装/更新/卸载资格仍NOT RUN。全局入口由指定记录者单写。
- 当前已审产品 baseline：008 `cc9c729cd5b65597049f988c41e3def97fcb0515`；纯原始证据字节修正HEAD `c6a3363bd923be7ad540ce7e0502fb35aa06bd6b`也经独立比例核准。root已非force推送并ls-remote实查github/gitee main均c6a3363、退出0。008收尾HEAD `34cb1472faa7bcb083d0b3488de5283cb6ed961c`随后已非force同步两个main并ls-remote核对同值；当前live HEAD实查仍为34cb147。009工作区尚未独立审核，不纳入此前PASS。
- 下一动作：依据[009实际代码设计](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-design.md)，retention_009_trusted（实际gpt-6-astra / medium）单写main/shared/preload与trusted tests；retention_009_ui（实际gpt-5.6-sol / high）已按冻结DTO单写renderer/tests。可信schema/来源保留边/治理屏障和精确作业与中文UI并行实施。Q9真实接受结果尚未存在时原文回收诚实阻断，不能以空摘要通过；009无需等待RET自动参数即可推进。

当前[009生命周期/清理](009-retention-and-cleanup.md)已开始；AST-006原三类范围已确认，新增“私有user/event是否一并删除”细节已问待答，相关purge分支先阻止；RET-007待答；[010事项](010-items-and-proposals.md)合同及独立原文预案已准备。

## 当前任务表

| ID | 产品/工程切片 | 状态 | 证据/下一动作 |
| --- | --- | --- | --- |
| [001](001-project-foundation.md) | F1 本地助手身份生命周期 | 已交付 | 稳定助手与SQLite基线随004/005保留 |
| [002](002-node-sqlite-qualification.md) | Electron44.1.1/node:sqlite | 限定DEV/main-only BUILT QUALIFIED/PASS | PACKAGED另设当前资格，非永久NOT RUN |
| [003](003-provider-live-qualification.md) | 指定真实端点能力 | 普通/流式LIVE_VERIFIED | 思考续接、工具、结构化等按角色新验证 |
| [004](004-provider-text.md) | Provider连接与严格临时文本 | FINAL PASS/历史同步 | `f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6` |
| [005](005-persistent-timeline.md) | 持续时间线、显式保存、正常重启 | TASK_DONE/FINAL PASS | 精确产品`0aa2d9190b63c7b99d59f52808e16965fa6b417f`；旧STOP_CHECKPOINT不是程序状态 |
| [006](006-timeline-context-permissions.md) | 完整浏览检索、局部上下文、权限底座 | TASK_DONE/FINAL PASS | 精确产品`88a86a2dacc616ca3a6fa0ba63a345f059d88859`；跨域权限仍由后续任务扩展 |
| [007](007-provider-tools-execution.md) | Provider工具执行、协议段、操作身份 | TASK_DONE / FINAL PASS | 精确产品`711463a9dd7fbcf16de73c413fe6ad0c56c311cc`；独立25/162与5额外oracle，双remote同步 |
| [008](008-memory-direct-path.md) | 记忆/个人事件即时路径、来源、事务恢复 | TASK_DONE / FINAL PASS | 精确产品cc9c729；28 files / 196 tests、7独立oracles和最终Electron已验，双remote同步 |
| [009](009-retention-and-cleanup.md) | 三区、清理恢复、助手永久删除 | ACTIVE / IMPLEMENTING | AST-006已确认，trusted治理/清理实施；RET-007未答不擅定自动策略 |
| [010](010-items-and-proposals.md) | 五类事项、提案与对话执行 | PLANNED | 独立原文预案及合同已立，008已审，等待当前可信整合窗口 |
| [011](011-assistant-basic-configuration.md) | 稳定人设、基础形象与配置 | PLANNED | 原文闭环已核对，不等待最终美术；按现行生命周期与六助手通道约束实施 |

## 最近有效证据与边界

- 008[独立FINAL PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-review-final-cc9c729.md)，SHA-256 `47FD505BB2B867FC2430E5C07E6291D6904775BADEDA94C27ABC046770ABF5EC`，精确产品cc9c729。28 files / 196 tests、7独立oracles通过；来源传播/纠正/DAG、错对象/时区/迟到回执与未知重试身份缺陷均关闭。最终Electron PIDs99292/7536，恢复0外发、显式发送1；唯一后续App ref→state改动经专属回归及静态/build比例复核。c6a3363仅修正四份raw审核文本的CRLF字节，独立blob比对一致；两remote已实查同值。008不是整个产品或发布完成。

- 008[真实记忆角色闭环](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-live-product.md)已SUPPORTED：自然中文创建→真实写入回执→服务重开→context none新轮检索准确返回随机代码；4请求、1对象/1写入、查询不改版本、恢复0调用，usage8246。前3次[失败诊断及修复](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-live-failure-diagnosis.md)保留，前2次PROTOCOL不被冒称完全解释。创建/纠正wire现已分离，确定未执行有独立状态。当前这组程序累计13请求、已得usage11260，另3次usage未知；008独立产品审核已FINAL PASS；跨后续领域的最终集成仍待验，不是PROGRAM_DONE。

- 007[独立FINAL PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tools-007-review-final-711463a.md)对应精确产品`711463a9dd7fbcf16de73c413fe6ad0c56c311cc`，报告SHA-256 `21119C6C34B29E011F3BA47F3E577AD37B08352A904BD31B03BC718DA6B8E6B0`。25 files / 162 tests及独立5个额外oracle通过，最终静态/build/依赖/foundation/扫描有效；fresh Electron PIDs59208/84996验证操作身份恢复、临时协议不持久化、恢复0调用及显式发送后1调用。初审REPAIR与中间夹具/引用世代错误及修复证据保持归档，已关闭而非当前缺陷。
- 007实际产品可信路径clock闭环为2请求、1 SUCCEEDED、精确UTC续答、usage467/54/521；加此前能力探针，本程序该组验证累计6付费请求、已得usage1515，首探针usage未知。工具thinking仍NOT_OBSERVED；未宣称renderer-driven或跨用户轮live、其他厂商工具、业务写入已验证。凭据已清理。

- 项目总覆盖/授权/006合同/早期打包证据已提交 `c03c5adb05aa5e237fab0f528a1f25ccbd4825ab`；Prompter 独立核对 47 个本地链接目标、005 原始 review hash 和文档差异，非强制推送后实际查询两个 main 均同值。该提交不含006产品。
- 新 [GLM 能力探针](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-capability-probe-v1.md) 完成：54片工具参数聚合→一次可信无副作用执行→结果回传续答、json_object本地严格校验均有真实端点证据；工具保留式思考仍 NOT_OBSERVED。累计4请求，成功三次 usage 994，首次未捕获 usage。仅合成数据、进程环境 Key 已清理；后续007实际产品clock闭环已另获验证，不能将本探针本身当产品PASS。
- 006最终 [独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/timeline-context-v1-review-final-88a86a2.md) 对应产品 `88a86a2dacc616ca3a6fa0ba63a345f059d88859`，报告 SHA-256 `A69669178A74339D08BC1CACCD125F1B3E43432E2449C8B6310D5BFE9D0BBE04`。产品套件22 files / 113 tests；独立全量24 / 117含4个额外oracle，之后新增flow 1 / 1单独通过；typecheck/lint/format/build、依赖/foundation及扫描均通过。适用fresh Electron PIDs83792/90028，恢复0次外发、显式发送后1次，关键源码hash已复核。
- 006历史仅支持搜索后手动找到完整轮次；007已补充搜索命中与工具引用按requestId直接定位原轮次，并通过trusted归属与UI回归。最终整体验收继续检查可用性。

- 005最终 [独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-review-0aa2d91.md) SHA-256 `E13D1F19B9E66D5932D010F8455FD4177A3EBC991FC7DE7C639C5A73C80105B0`；20 files / 88 tests、typecheck/lint/format/build/扫描通过。适用真实Electron独立PIDs59660/62500，恢复0调用、显式发送后1调用。后续新差异不能继承PASS。
- [005产品推送回执](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-push-close-0aa2d91.md)、[continuation](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-text-v1-continuation-f5aa9880.md)、[原始接管记录](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-reconciliation.md) 保留原始失败、修复和历史事实；设计顶栏已简洁对齐最终PASS。
- 003历史4次合成live：2次HTTP400/code1210、2次thinking enabled/reasoning effort low普通和流式成功，各usage22/4/26。旧Key已清理；用户现已在会话提供新的授权测试凭据，不入Git/日志/报告。当前不凭此宣称高级能力已验证或新增调用已发生。
- Toolhelp32 -003 辅助审计保持failed/deferred/non-blocking，禁止重跑或派生-004。默认helper setup-refresh失败已有经工具审核合法宿主执行路径；受控writer保持allowlist/preimage/原子替换/回滚/postimage，不绕过平台拒绝。
- AST-006已由用户2026-09-06确认：保留归档，二次确认永久删除助手私有聊天/关系/连续性记忆；全局共享记忆和正式事项保留，来源不再展开私有原文。[009生命周期任务](009-retention-and-cleanup.md)承接。RET-007容量/期限/垃圾清空问题已提出、待答；REM-002在提醒任务冻结前再问。009独立实施继续。
- 尚未完成领域及验收去处全部列在总清单；当前记忆、事项/提醒、后台、完整数据位置/恢复、PACKAGED安装更新与Release并未完成。当前已明确授权实施和发行，旧NOT RUN仍保留为历史事实。

## 持续授权与交接

本次2026-09-06用户授权开发/精确依赖/合成测试/必要低价付费Provider调用、本地提交/分支/非破坏整合、已独立审核main向两个既有remote非force推送、隔离安装升级重装卸载、版本/新tag及审核安装包/说明的实际Release与下载核验。无需逐SHA/调用/最后发布再次批准。真实私人数据、其他项目、仓库可见性变化、重写历史/tag、破坏性替换发行资产、实质许可证改变、采购及无关外部动作不在授权内。

只有总体已验收并实际发布下载核验通过才写PROGRAM_DONE/RELEASED；真实关键用户门禁或已穷尽合理替代的实际平台硬限制才暂停。平台暂停必须保存TECHNICAL_PAUSE完整现场和直接恢复动作，程序未完成，结束响应后无真实执行机制不得声称后台继续。

关键进展、路线变化、角色交接与暂停前更新当前任务和入口；相应复核成果在合理提交点入Git并同步。纯文档仅核事实/链接/格式，不制造自引用审核提交循环。历史 [004以前progress快照](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/progress-history-through-004-final-snapshot.md) 不变，当前入口不回退为“等用户选下一任务”。

历史008启动记录（2026-09-06，现已关闭）：S0合成SQLite/Markdown实验已完成，见[方案](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-s0.md)与[共享接口](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-contract.md)。memory_008_s0（gpt-6-astra / medium）单写main/shared/preload及trusted tests，memory_008_ui（gpt-5.6-sol / high）单写renderer及对应测试；root维护全局记录。前述S0阅读动作已推进为实际实施，事件/权限范围细分随接口同步；新领域尚未验收。007收尾a5041632c09aa3d421654e56a1e76c9e109147bf已非force推送并ls-remote确认两个main同值，不含008产品。

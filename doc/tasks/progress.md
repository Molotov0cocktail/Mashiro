# Mashiro 当前任务入口

> 更新：2026-09-06。PROGRAM 状态 ACTIVE，目标为文档功能完整落实、整体验收、Windows 安装/更新/卸载验证及实际发布下载核验。TASK_DONE 不等于 PROGRAM_DONE。唯一当前续接入口是本文件；项目覆盖、授权、依赖队列和完成条件见 [文档至发布总清单](program-docs-to-release.md)。

新 Agent 先读本文件，再读总清单、当前正式任务和相关设计。Git、代码与最新独立证据说明当前事实；旧初始化/F1/004/005 非目标与 STOP_CHECKPOINT 只描述历史，不阻止本轮已授权范围。

## 当前工作与直接下一动作

- 当前正式任务：[007 Provider 工具执行、协议段与操作身份](007-provider-tools-execution.md)。006 已在精确产品 `88a86a2dacc616ca3a6fa0ba63a345f059d88859` 获独立最终 PASS；007 以该已审产品为基线进入 S0/trusted 实施，负责受限工具执行、协议段、operation 身份、能力分级和原轮次引用定位。记忆、事项、提醒、后台与发布继续列入总队列。
- 同步工作：早期 [PACKAGED 探索](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/packaging-spike-v1.md) 已 SUPPORTED：独立 ASAR 程序自报 isPackaged=true，双 PID 84660/84304 验证 SQLite/preload/凭据和重启；临时副本含实验修改，生产数据位置与正式安装/升级/卸载仍 NOT RUN。全局入口由 Prompter/指定记录者单写；纯文档差异只做比例核对，不重跑006产品资格。
- 当前已审产品 baseline：main `88a86a2dacc616ca3a6fa0ba63a345f059d88859`。2026-09-06 主协调已实际 `ls-remote` 确认 github/main、gitee/main 同值且命令退出0；后续请查 live Git，不把这次观测当未来保证。其后允许有不改变产品行为的006 closing/007合同文档提交。
- 下一动作：继续007 S0/trusted实现，随后UI、融合、真实产品合成工具闭环与独立审核；已审后同步两个既有远端并自动选择下一依赖满足任务。Q1探索可并行推进，但不冒充正式 packaged/安装资格。

## 当前任务表

| ID | 产品/工程切片 | 状态 | 证据/下一动作 |
| --- | --- | --- | --- |
| [001](001-project-foundation.md) | F1 本地助手身份生命周期 | 已交付 | 稳定助手与SQLite基线随004/005保留 |
| [002](002-node-sqlite-qualification.md) | Electron44.1.1/node:sqlite | 限定DEV/main-only BUILT QUALIFIED/PASS | PACKAGED另设当前资格，非永久NOT RUN |
| [003](003-provider-live-qualification.md) | 指定真实端点能力 | 普通/流式LIVE_VERIFIED | 思考续接、工具、结构化等按角色新验证 |
| [004](004-provider-text.md) | Provider连接与严格临时文本 | FINAL PASS/历史同步 | `f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6` |
| [005](005-persistent-timeline.md) | 持续时间线、显式保存、正常重启 | TASK_DONE/FINAL PASS | 精确产品`0aa2d9190b63c7b99d59f52808e16965fa6b417f`；旧STOP_CHECKPOINT不是程序状态 |
| [006](006-timeline-context-permissions.md) | 完整浏览检索、局部上下文、权限底座 | TASK_DONE/FINAL PASS | 精确产品`88a86a2dacc616ca3a6fa0ba63a345f059d88859`；跨域权限仍由后续任务扩展 |
| [007](007-provider-tools-execution.md) | Provider工具执行、协议段、操作身份 | IMPLEMENTING / S0 | 以已审006产品为基线；trusted实施中，UI/融合/live/独立审核待完成 |

## 最近有效证据与边界

- 项目总覆盖/授权/006合同/早期打包证据已提交 `c03c5adb05aa5e237fab0f528a1f25ccbd4825ab`；Prompter 独立核对 47 个本地链接目标、005 原始 review hash 和文档差异，非强制推送后实际查询两个 main 均同值。该提交不含006产品。
- 新 [GLM 能力探针](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-capability-probe-v1.md) 完成：54片工具参数聚合→一次可信无副作用执行→结果回传续答、json_object本地严格校验均有真实端点证据；工具保留式思考仍 NOT_OBSERVED。累计4请求，成功三次 usage 994，首次未捕获 usage。仅合成数据、进程环境 Key 已清理；产品工具集成仍待007。
- 006最终 [独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/timeline-context-v1-review-final-88a86a2.md) 对应产品 `88a86a2dacc616ca3a6fa0ba63a345f059d88859`，报告 SHA-256 `A69669178A74339D08BC1CACCD125F1B3E43432E2449C8B6310D5BFE9D0BBE04`。产品套件22 files / 113 tests；独立全量24 / 117含4个额外oracle，之后新增flow 1 / 1单独通过；typecheck/lint/format/build、依赖/foundation及扫描均通过。适用fresh Electron PIDs83792/90028，恢复0次外发、显式发送后1次，关键源码hash已复核。
- 006搜索可从单侧命中进入搜索结果、清除搜索、加载更早完整历史并选中原轮次，但没有直接 jump-to-round 按钮；这不是006合同阻塞项。007必须提供原轮次引用定位，最终验收继续检查可用性，不把直接跳转永久排除。

- 005最终 [独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-review-0aa2d91.md) SHA-256 `E13D1F19B9E66D5932D010F8455FD4177A3EBC991FC7DE7C639C5A73C80105B0`；20 files / 88 tests、typecheck/lint/format/build/扫描通过。适用真实Electron独立PIDs59660/62500，恢复0调用、显式发送后1调用。后续新差异不能继承PASS。
- [005产品推送回执](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-push-close-0aa2d91.md)、[continuation](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-text-v1-continuation-f5aa9880.md)、[原始接管记录](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-reconciliation.md) 保留原始失败、修复和历史事实；设计顶栏已简洁对齐最终PASS。
- 003历史4次合成live：2次HTTP400/code1210、2次thinking enabled/reasoning effort low普通和流式成功，各usage22/4/26。旧Key已清理；用户现已在会话提供新的授权测试凭据，不入Git/日志/报告。当前不凭此宣称高级能力已验证或新增调用已发生。
- Toolhelp32 -003 辅助审计保持failed/deferred/non-blocking，禁止重跑或派生-004。默认helper setup-refresh失败已有经工具审核合法宿主执行路径；受控writer保持allowlist/preimage/原子替换/回滚/postimage，不绕过平台拒绝。
- AST-006助手永久删除、RET-007容量/期限/垃圾自动清空、REM-002补发/合并/过期默认仍无后续产品决议。在相应实现前提交少量准备好的推荐/影响问题；006及其他独立分支继续。最终范围结算前不能静默抹去这些问题。
- 尚未完成领域及验收去处全部列在总清单；当前记忆、事项/提醒、后台、完整数据位置/恢复、PACKAGED安装更新与Release并未完成。当前已明确授权实施和发行，旧NOT RUN仍保留为历史事实。

## 持续授权与交接

本次2026-09-06用户授权开发/精确依赖/合成测试/必要低价付费Provider调用、本地提交/分支/非破坏整合、已独立审核main向两个既有remote非force推送、隔离安装升级重装卸载、版本/新tag及审核安装包/说明的实际Release与下载核验。无需逐SHA/调用/最后发布再次批准。真实私人数据、其他项目、仓库可见性变化、重写历史/tag、破坏性替换发行资产、实质许可证改变、采购及无关外部动作不在授权内。

只有总体已验收并实际发布下载核验通过才写PROGRAM_DONE/RELEASED；真实关键用户门禁或已穷尽合理替代的实际平台硬限制才暂停。平台暂停必须保存TECHNICAL_PAUSE完整现场和直接恢复动作，程序未完成，结束响应后无真实执行机制不得声称后台继续。

关键进展、路线变化、角色交接与暂停前更新当前任务和入口；相应复核成果在合理提交点入Git并同步。纯文档仅核事实/链接/格式，不制造自引用审核提交循环。历史 [004以前progress快照](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/progress-history-through-004-final-snapshot.md) 不变，当前入口不回退为“等用户选下一任务”。

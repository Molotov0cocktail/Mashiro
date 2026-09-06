# Mashiro 当前任务入口

> 更新：2026-09-06。PROGRAM 状态 ACTIVE，目标为文档功能完整落实、整体验收、Windows 安装/更新/卸载验证及实际发布下载核验。TASK_DONE 不等于 PROGRAM_DONE。唯一当前续接入口是本文件；项目覆盖、授权、依赖队列和完成条件见 [文档至发布总清单](program-docs-to-release.md)。

新 Agent 先读本文件，再读总清单、当前正式任务和相关设计。Git、代码与最新独立证据说明当前事实；旧初始化/F1/004/005 非目标与 STOP_CHECKPOINT 只描述历史，不阻止本轮已授权范围。

## 当前工作与直接下一动作

- 当前正式任务：[006 时间线浏览、局部上下文与权限底座](006-timeline-context-permissions.md)。合同与 DTO 已冻结，trusted 与 UI 分工实现中。目标是完整浏览/检索、明确局部历史选择及助手读取权/实际端点接收权分离；章节、记忆、事项和提醒继续列入总队列，不能被006非目标排除出项目。
- 同步工作：总覆盖与当前授权文档候选、GLM 工具/结构化角色合成探针准备。早期 [PACKAGED 探索](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/packaging-spike-v1.md) 已 SUPPORTED：独立 ASAR 程序自报 isPackaged=true，双 PID 84660/84304 验证 SQLite/preload/凭据和重启；临时副本含实验修改，生产数据位置与安装/升级/卸载仍 NOT RUN。全局入口由 Prompter/指定记录者单写；独立文档比例审核后合理提交，不重跑无关产品资格。
- 当前接管 baseline：main `fb268174e5b14848c5345e52cf6c88ed6c6e1a5d`，接管时工作区干净；2026-09-06 本记录者实际 `ls-remote` 确认 github/main、gitee/main 同值。后续请查 live Git，不把这次观测当未来保证。
- 下一动作：完成006实现、相称验证与独立审核、修复、提交/双远程同步，更新总覆盖后自动选择下一个依赖满足任务；早期打包路线可独立推进。不得因一个切片 PASS、上下文较长或生成计划默认结束程序。

## 当前任务表

| ID | 产品/工程切片 | 状态 | 证据/下一动作 |
| --- | --- | --- | --- |
| [001](001-project-foundation.md) | F1 本地助手身份生命周期 | 已交付 | 稳定助手与SQLite基线随004/005保留 |
| [002](002-node-sqlite-qualification.md) | Electron44.1.1/node:sqlite | 限定DEV/main-only BUILT QUALIFIED/PASS | PACKAGED另设当前资格，非永久NOT RUN |
| [003](003-provider-live-qualification.md) | 指定真实端点能力 | 普通/流式LIVE_VERIFIED | 思考续接、工具、结构化等按角色新验证 |
| [004](004-provider-text.md) | Provider连接与严格临时文本 | FINAL PASS/历史同步 | `f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6` |
| [005](005-persistent-timeline.md) | 持续时间线、显式保存、正常重启 | TASK_DONE/FINAL PASS | 精确产品`0aa2d9190b63c7b99d59f52808e16965fa6b417f`；旧STOP_CHECKPOINT不是程序状态 |
| [006](006-timeline-context-permissions.md) | 完整浏览检索、局部上下文、权限底座 | IMPLEMENTING | trusted实现、UI与独立审核待闭合 |

## 最近有效证据与边界

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

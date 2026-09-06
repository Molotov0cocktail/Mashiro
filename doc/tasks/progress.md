# Mashiro 当前任务入口

> 更新：2026-09-06。当前实施任务：[005 每助手持续时间线、显式保存与正常重启恢复](005-persistent-timeline.md)，REPAIR 2 IMPLEMENTED / INDEPENDENT RE-REVIEW NEXT。此文件是唯一当前续接入口；下列历史文件只保存当时事实。

新 Agent 先读本文件，再读当前任务、相关设计和所链接的最近证据。Git 实时 HEAD/远端值应查询 Git；不要把历史“尚未 push/等待审核”重新变成已完成切片的门禁。

## 当前、最近完成与下一步

- 当前：005 候选独立 review 对精确 HEAD `842176053489e2d3d90037d7b36a31ef6129c415` 给出 REPAIR；冻结 [失败报告](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-review-8421760.md) 保留两项 UI P2。第一轮 UI 修复在 b1aa9b9 复审发现“未知 read 当缺席”和“乐观 ID 当保存计数”的两项 P2，见 [第二原始 review](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-review-b1aa9b9.md)。现已改为显式 snapshot/unavailable/superseded 观测、捕获 accepted/terminal 证据和 trusted 已保存总数回执；原四个冻结反例全部通过，renderer + trusted timeline 共 7 files / 31 tests，typecheck/lint/format/build 均由接管者独立重跑并 exit 0。原 6Astro 修复执行者在实现完成后遇到 `Selected model is at capacity`，未丢失文件；route 由 `/root/timeline_ui` 接管机械验证、记录与提交。下一动作是精确新 HEAD 独立复审。
- 最近已审核产品交付：004 最终 main `f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6`，独立最终 [Reviewer PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-text-v1-review-f5aa9880.md)。连接、模型绑定、安全凭据和严格临时普通/流式文本已交付；持久聊天尚未交付。
- 某次远程观测：2026-09-06 接管时本地 main/clean，github/main、gitee/main 的 `ls-remote` 均为 f5aa9880；上一轮 [push-close](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-text-v1-push-close-f5aa9880.md) 记录该已审提交普通推送双远程成功。这些是观测事实，不预写本轮提交自身 SHA 或未来审核/推送。
- 续接依据：[原始 continuation](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-text-v1-continuation-f5aa9880.md)。三份报告由上一任务定位到明确原始目录，review SHA-256 核验匹配，逐字归档；来源/hash/Git 可恢复检查见 [入口接管记录](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-reconciliation.md)。
- 后续候选：005 验收后评估时间线浏览/检索与局部上下文选择；实施前登记下一稳定任务。长期记忆、事项/提醒不自动并入 005。

## 当前任务表

| ID                                        | 产品/工程切片                      | 当前状态                                          | 证据/下一动作                                         |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| [001](001-project-foundation.md)          | F1 本地助手身份与生命周期          | 已交付；历史资格链保留                            | 稳定助手与 SQLite 基线随已审核 004 保留               |
| [002](002-node-sqlite-qualification.md)   | Electron 44.1.1 / node:sqlite      | QUALIFIED / REVIEW PASS，限定 DEV/main-only BUILT | PACKAGED 另设资格                                     |
| [003](003-provider-live-qualification.md) | 指定真实端点能力资格               | 普通/流式 LIVE_VERIFIED，随 004 审核闭合          | 其余能力分别 NOT RUN，非整体完成                      |
| [004](004-provider-text.md)               | Provider 连接与严格临时文本        | FINAL REVIEW PASS / 双远程同步已观测              | f5aa9880 原始 review、push-close、continuation 已归档 |
| [005](005-persistent-timeline.md)         | 持续时间线、显式保存、正常重启恢复 | REPAIR 2 IMPLEMENTED / INDEPENDENT RE-REVIEW NEXT | 第二轮观测机制修复已实现；原四反例通过，待精确复审 |

## 阻塞、延期与验证边界

- 005 当前无用户门禁；独立 review 已产生有界 UI REPAIR，修复完成前不得冒充 PASS。默认工具 helper 启动失败已有合法获批执行上下文，不能冒充产品阻塞。合成 transport 不依赖真实 Key；必要 live 新行为缺少 Key 时只索取 Key，等待时继续独立开发。
- 005 候选最新测试 20 files / 80 tests；populated v2→v3 成功/回滚与独立 vault 保留已验，真实双 PID 恢复零自动请求。004 历史 17 files / 62 tests 保留为基线；新候选还未独立审核。
- 003 共 4 次合成 live 调用，2 次 HTTP 400/code 1210，2 次 enabled+low 普通/流式成功；每次成功 usage 22/4/26。测试 Key 已清理。真实取消、工具、结构化输出、思考续接、个人数据均 NOT RUN。
- 历史 Toolhelp32 -003 辅助审计 failed/deferred/non-blocking，禁止重跑或派生 -004；它不等于产品任务 003/004。
- 长期记忆、事项/提醒、通用迁移平台、多实例、全面崩溃恢复、PACKAGED/安装器、Release/部署、真实个人数据访问延期；正常生命周期及本次加法升级属于 005 验收。
- 已授权开发、提交、依赖、合成测试和已审核 main 双远程非强制推送；不逐次重索批准。真实个人数据、不可逆真实操作、Release/部署与系统安全变更另行处理。

## 记录与历史

全局入口由 Prompter 或指定记录者单写；执行者交回本切片结果。阶段开始、关键结果/路线变化、角色交接和停止前更新当前任务及入口，合理提交点随成果入库。新产品差异必须复核；纯文档收尾只检查差异、事实、链接和格式，不自引用循环地提交未来 PASS/推送。

历史原始 [progress 接管快照](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/progress-history-through-004-final-snapshot.md) 完整保留，旧“当前状态”只描述当时时点，不是另一当前入口。004/003 内旧合同均有历史标记。不得改写 Reviewer verdict、失败或 NOT RUN。

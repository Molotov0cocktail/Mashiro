# 014 正式数据位置、备份与 Windows 交付生命周期

- TASK = 014；FOUNDATION_IMPLEMENTING；PROGRAM ACTIVE。入口[progress](progress.md)，覆盖[总清单](program-docs-to-release.md)G04–G06及Q10。来源：high-level-design §8–9、detailed-design §5/10、ARC-003/004、DIST-001及用户2026-09-06发布验收。实际发行和下载在整体验收通过后继续执行，不以本任务产物宣布完整发布。
- 现场：当前data-root仍主动拒绝isPackaged，只有development/test路径；package.json尚无正式构建配置。已成功[ASAR探索](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/packaging-spike-v1.md)和[精确NSIS清理探索](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/installer-protection-spike-v1.md)可复用路线，不能复用旧实验制品冒充当前版本。

## 可观察闭环

1. 普通用户首次安装可分别选择程序位置和数据位置，包括安装目录data、中文及空格路径。首次启动明确创建或选择数据集；可信侧验证普通用户可读写、安全持久化和数据集身份，renderer不获任意路径操作权。程序退出重启仍进入同一数据集。
2. 数据位置失效、权限变化、空间不足或身份不符时显示恢复入口，允许重新定位已知数据集或明确选择新建；不得静默创建第二份空数据。实际恢复成功前不修改原指向，取消仍保留旧配置。
3. 迁移/完整备份包含助手、历史、记忆Markdown及接受版本、事项、提醒、来源权限、删除抑制和作业/回执状态；不能用普通Markdown导出代替。先生成一致且可校验的备份，再迁移并验证，失败保留原数据和可执行恢复步骤。跨用户/机器受保护凭据不可移植时明确重新提供凭据，绝不导出明文Key或降级保护。
4. 真实打包后的应用脱离源码、开发服务器和预装Node运行；校验SQLite、preload、ASAR资源和凭据。正常退出/托盘、重启恢复、离线确定性提醒、运行日志和路径恢复在最终制品上重新验证。
5. 安装、不同版本升级、同版重装、卸载再装保留合成全域数据。卸载仅清已知程序文件及空目录，不递归删安装根；安装目录data和未知用户文件保持。完整制品生成已知文件清单，包括打包器后注入辅助文件；旧版本文件清理也不能触及数据。
6. 更新失败可执行回到旧程序和兼容备份的恢复方案，不能让旧程序直接打开不兼容新schema。升级校验版本/来源/完整性，版本号、源码、构建输入、实际附件校验对应；自动更新框架是否采用由工程链选择，受支持更新路径必须在界面和说明中清楚。
7. 最终独立审核实际制品；生成校验文件、安装/升级/恢复说明、已知限制和完整第三方声明。签名状态如实说明，未签名不自动阻塞发行、不关闭系统防护。审核通过精确新版本后自动同步两源码远程、创建新tag/Release并上传制品，再下载验证哈希；不覆盖已有资产或重写tag。

## 当前源码准备

root在012并行实施期间已形成[实际接入方案](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-actual-plan.md)：生产bootstrap/locator与开发隔离、完整静止备份和接受Markdown/治理状态、安装文件清理、失败恢复及实际发行下载。root现已并行新增[独立locator底座](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-location-foundation.md)和10个定向反例，已修独立发现的正斜杠UNC绕过；[独立FOUNDATION_CANDIDATE PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-location-review-final-pass.md)确认原10+独立5共15通过，类型/格式/lint通过，尚未接入正式启动；不改013单写文件。root现已新增[生命周期锁与显式初始化候选](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-lease-initialize-stage.md)：实际Windows命名管道排他/进程终止后释放路线SUPPORTED，29定向测试通过，配置锁恢复已新增真实占用权令牌校验；未参与实现的steward_013_ui（实际Sol/high）已接独立复核，尚未接入生产main。原生选择/恢复UI、完整备份与安装发行继续必做；不以底座或早期实验代替最终制品。

## 独立底座审核进展

2026-09-07：[lease/location R2 PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-foundation-review-r2.md)由未实现该范围的Sol/high给出，6文件33tests、限定TS/lint/format通过；[session独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-session-independent-pass.md)由未实现该协调器的Astra/medium给出，2文件8tests通过。准备回调期间数据集UUID或locator指向改变的独立反例已红转绿，持有真实双租约再返回。上述限定PASS不包含正式native/main、prepareExisting备份迁移、安装更新或发布，后续仍必做。

## 验证路线与边界

安装测试仅明确命名的隔离合成根和可撤销注册，所有删除/移动先核绝对范围；不用用户日常数据做破坏实验。先资格最小生产路径，再全域最终候选生命周期，早期证据不替代最终验收。

已知NSIS路线必须等待全部已知文件清理完成，不只等启动器退出/主exe消失。程序与data重叠、中文/空格、不可写、错误locator、缺失manifest、磁盘故障注入、迁移失败、备份损坏、凭据保护失败、重复启动及跨版本恢复均需对应反例；真实普通用户制品验证与模拟故障分开记录。手工可执行的更新安装路线若被采用，说明其支持边界，不声称实现了无人值守更新。

只在实际缺少账号权限、需采购/许可证实质决策或确实无法解决的平台条件时提出具体问题。既有打包/安装/版本/tag/发布授权有效，不在精确SHA通过后再次问是否发布。

## 清单

- [x] 原文与现有打包/卸载保护路线已定位，编号现场未占用。
- [ ] 正式数据路径、恢复选择与凭据边界。
- [ ] 完整一致备份、迁移及可执行升级恢复。
- [ ] 正式Windows构建、隔离完整生命周期和制品独立审核。
- [ ] 对照整体覆盖完成发布前结算，实际Release上传及下载核验。

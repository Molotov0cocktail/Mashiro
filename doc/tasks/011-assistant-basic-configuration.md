# 011 助手人设、基础形象与配置入口

- TASK = 011；状态 = TASK_DONE / FINAL PASS；PROGRAM ACTIVE。编号已核对未占用，承接已审[010](010-items-and-proposals.md)，入口为[progress](progress.md)。本任务承接总清单A02/Q2，不等待最终美术或跨应用集成。
- 来源：proposal §2.1、3.1–3.2；high-level-design §5.2；detailed-design §3.1、AST-002及§8.4。名称、基础形象、人设、Provider/模型和数据范围必须可配置；配置变化不改变稳定身份、唯一时间线或关系记忆。

## 可观察闭环

用户在助手管理中编辑稳定人设、选择可辨认的基础形象，并能到达该助手真实模型绑定和数据授权控制。保存有版本冲突与失败回执，重启后保留。改人设、形象、名称或绑定不会创建新助手或清空已有历史/记忆/事项。

正常和严格临时交流都使用当前所选助手的稳定人设。严格临时仍不读取正常历史、关系、全局记忆或业务数据；人设正文不能赋予额外读取、接收或工具权限。普通配置变更按已确认规则在下一执行段生效；撤权仍立即生效，不能把新配置回填到已运行段。

基础形象先提供本地内置可选方案和明确预览，达到稳定可区分、可修改、可持久化即可；最终主题/动画仍是原始未冻结范围。实现不引入任意远程头像请求、renderer文件路径或脚本内容。自定义文件导入不是原文硬要求，如工程认为必要须另走明确受限的可信选取与验证。

## 工程与验收

- 实施时读取009/010实际schema和独占范围，采用加法迁移与现有助手版本事务。保留六个助手IPC通道，评估通过既有窄输入扩展完成配置保存；不以随意改名新通道绕过该约束。字段/存储方式由工程链评审，不交给用户逐项选择。
- 人设作为明确配置进入当前请求，有限长度，绑定实际助手和执行段。协议重放不得恢复旧配置的权限；模型身份文字不能覆盖trusted权限与删除屏障。
- 中文日常入口实际可编辑，基础形象预览与列表/对话展示一致，现有名称/模型/授权入口不会退化为隐藏参数或开发面板。
- 验证稳定ID及历史/关系保留、持久化/CAS、正常与严格临时人设输入、在途/下一段变更、恶意人设零权限扩张、归档/永久删除边界；对新差异安排独立复核后提交双远程同步。复用适用证据，不重跑已关闭历史路线。
- 配置完成后继续事项、提醒、后台、安装更新与实际发布；不把本任务当完整产品或程序终点。

## 实施阶段证据（历史过程）

2026-09-07从010已审产品ab11110及纯文档收尾4c044f9接续。assistant_011_trusted实际gpt-6-astra/medium单写可信域，assistant_011_ui实际gpt-5.6-sol/high单写renderer。DTO已冻结persona与六键内置avatar，复用rename及双CAS；schema9与请求快照在实施，旧夹具正在按新契约更新，尚无最终PASS。root合成live runner已限定语法/lint通过，新库配置保存和服务重开零网络预检通过（0请求）；[实际两请求](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/assistant-011-live-product.md)已SUPPORTED、402tokens：两模式均返回人设口令，临时无正常marker、相关领域计数不变、profile重开0调用。首尝试为max_tokens夹具断言导致本地零网络失败，已解释并修正。trusted阶段已冻结23文件manifest，35文件227测试与限定静态通过；[阶段报告](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/assistant-011-trusted-stage.md)记录。review_011（实际gpt-6-astra/medium）[可信阶段独立复核](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/assistant-011-review-trusted-stage.md)已完成：23文件一致、4文件19测试通过（其中1个新独立oracle），人设永久删除F1关闭；UI迟到导航与旧history focus重放仍待修验，冻结后唤回trusted统一full/build/Electron；不把阶段或服务live当整体PASS。

## 集成检查过程

root核对可信/UI两阶段共46文件一致后，全量54文件320测试、全项目typecheck/format/build/lint通过。原作者followup暂遇thread limit期间root接手验证，首Electron运行seed-profile-ui失败；旧harness自动删除该合成根，仅保留阶段失败输出。root仅增强三个harness文件的固定子阶段诊断及失败证据保留，再通过typecheck/lint/build。第二运行定位seed-profile-ui-save-profile-ui-timeout，保留合成根mashiro-f1-e2e-Jx0yUh，run e450a3ee-e636-4b00-8627-68411650c0b3、PID123168/134236，真实保存尚未提交。容量释放后assistant_011_trusted已恢复并接手诊断；不把全量测试绿当Electron通过，也不删除或改弱真实UI断言。

## 当前最终审核

修复后root[最终验证](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/assistant-011-root-final-verification.md)通过正式54文件320测试、typecheck/lint/format/build及Electron08（PIDs135516/135832）。可信23文件清单83a627…、UI23文件清单08deca…已由独立Reviewer核对。UI父快照回传曾清除冲突提示，root甄别测试实际红转绿；独立新增两个在途/更高版本屏障场景通过。早期Electron失败、直接seed后reload同步机制及未定论保留于[可信交接](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/assistant-011-trusted-integration-handoff.md)。[独立最终PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/assistant-011-review-final-pass.md) SHA256 3b59755c17cf7ba371ea6eeddc95871b09160a920d66d784458e3abc111051b9；104文件候选清单5628248c…逐字节匹配。root暂存104候选+清单+审核报告106文件，原始工作树/index字节核对通过后提交072dd39771e01b29bbced93f49e20a996f1e2cab；非force推送两远程退出0，实际ls-remote两个main同值。已直接启动012；不是PROGRAM_DONE。

## 清单

- [x] 核对原文必需行为及最终美术边界。
- [x] 冻结[实际方案](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/assistant-011-actual-plan.md)与trusted/UI单写范围；以010提交同步后的HEAD实施。
- [x] 可信持久化、请求绑定与中文配置/形象入口。
- [x] 独立行为验证、审核、提交同步及总覆盖结算。

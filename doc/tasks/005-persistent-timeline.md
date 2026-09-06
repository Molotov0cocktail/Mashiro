# 005 每助手持续时间线、显式保存与正常重启恢复

> 状态：PRODUCT COMPLETED / STOP_CHECKPOINT；2026-09-06；route `persistent-timeline-v1`。
> 当前入口：[progress.md](progress.md)。本任务是稳定合同，计划可随直接证据调整；勾选完成须有代码、测试或审核依据。

## 基线与目标

产品 baseline：main `f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6`，接管工作区干净，2026-09-06 独立 `ls-remote` 观测 github/main、gitee/main 均相同。入口整理提交只改文档和脱敏报告；执行者在动产品前记录当时 HEAD，产品审查比较 baseline 至候选全部增量。

交付每助手唯一持续时间线、本地正常记录、严格临时隔离、显式保存和真实新进程恢复的中文纵向闭环。004 临时多轮不算持久对话。本轮无需用户重新批准产品内工程方案或既有外部动作。

来源：[proposal](../proposal.md#32-严格临时交流)、[高层数据流](../high-level-design.md#5-主要数据流)、[详细设计与集中决议](../detailed-design.md)、[004](004-provider-text.md)、[原始 continuation](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-text-v1-continuation-f5aa9880.md)。关键决议：AST-004/005/006、PVD-002/003/007/009、EXEC-003/004/005/006。此前最终 [PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-text-v1-review-f5aa9880.md) 与 [推送回执](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-text-v1-push-close-f5aa9880.md) 已追溯；不受旧快照“等待审核/推送”阻塞。

## 已确认语义与本轮边界

- 正常模式默认自动保存正常用户消息及回答/执行状态，不要求逐句手工保存。稳定 assistant ID 决定归属；改名、改模型或切换不新建时间线、不丢历史。正常历史本地权威，不靠远端 conversation ID 恢复。
- 严格临时模式只用本助手内存临时会话；不读正常历史、不落正文或可重启快照、不写正文日志、不混入普通记录。模式切换本身不保存旧临时内容。
- 显式“保存到此助手时间线”展示目标助手和保存范围。保存当前临时会话中尚未保存的用户可见消息及真实状态；成功后仍处于临时模式，后续消息仍不自动持久化。此前已保存的同一条内容不重复插入；新内容可再次显式保存。失败保留内存内容并显示未保存。保存是本地操作，不触发 Provider 请求。
- 可选简单实现：每次临时会话固定内存 session ID，消息固定 ID；事务按源 session/message ID 去重。保存运行中的临时请求可暂时禁用并明确提示等待完成或取消，避免复制尚在变动的消息；这是本切片的清晰范围，不隐式保存。
- 正常用户消息在请求外发前完成本地事务提交，存储失败则不发送。回答保存 completed/failed/cancelled/interrupted 的真实状态，部分内容不得伪装成功。开始记录 pending，关闭或启动恢复未完成项为 interrupted，并明确没有自动重发。正常关闭应保留已经收到的部分输出；全面断电/崩溃恢复不是本切片承诺。
- 加法 schema v2→v3 可调整具体表结构，事务升级保留助手、状态、连接、绑定与独立 vault 凭据。用 populated v2 验证升级和失败回滚；禁止重建空库、改 ID 或通过放宽 guard 冒充成功。
- trusted context builder 只取当前 assistant 的本地、允许当前接收方外发的最近完整对话，施加明确消息数和字符/token 预算，给当前输入留空间。有限近期窗口用于外发，不裁剪或删除本地历史；不发送其他助手内容、未显式保存临时内容、失败/取消/中断的助手内容或全部历史。若单条太长，采用有说明的拒绝或边界内选择，不静默扩大上限。
- 沿用当前权限范围：用户在当前助手主动正常发送，允许把界面明确标注的该助手近期正常历史送往当前可信绑定接收方；不引入私人业务资料/全局记忆读权。每次调用由 trusted 重新检查助手、连接启用、绑定和凭据，冻结请求实际接收方与模型；撤权及时取消，在途/晚到结果只能提交至其捕获归属。不得让 renderer 传“已授权”结论。
- 保留六 assistant IPC 与 sandbox/contextIsolation/nodeIntegration 不变量；新增 timeline 窄通道、输入/输出/事件 strict Zod，preload runtime 只 Electron 和 Zod-free constants。正文按文本渲染，renderer 无 SQL/文件/任意网络/凭据读取。
- 非目标：章节压缩、长期记忆、事项/提醒、工具/结构化输出、通用迁移平台、永久删除历史、多实例、全面崩溃恢复、PACKAGED/安装器/Release/部署、真实个人资料访问。历史 Toolhelp32 -003 不运行、不派生 -004。

## 可调整的实施计划

1. 高推理执行者冻结最小 domain/DTO/schema 接口，先建立旧实现必失败的 migration、模式隔离、保存幂等/失败、跨助手、重启 oracle。结构可复用 ProviderService，也可增加窄 TimelineService；避免两个持久权威。
2. trusted 存储与 context builder：每助手唯一、稳定消息身份和顺序，事务开始/结束/显式保存，正常 shutdown/interrupted 恢复，不自动重试与计费；范围匹配的状态与分页/有界读取。
3. trusted Provider 集成与窄 IPC/preload：模式显式入参，临时内存与正常 DB 分开，错误/取消/断流保留实际状态；请求捕获的 assistant/request/mode 不受界面切换影响。保存成功后才提供已保存回执。
4. 界限冻结后可交 5.6sol 完成中文 UI/有界测试，单写者管理接口与全局入口。正常/严格临时选择、接收方与历史范围说明、加载/保存失败、保存目标/范围/成功时点、取消/失败/中断状态和已保存提示可操作。
5. 扩展既有 Electron harness，以同一受控仓库外合成数据目录中的真实关闭和 fresh PID 重启验证持久记录恢复；加入未保存临时正文和临时 Key 不恢复、无 transport 自动调用、protected vault 保留。保留 F1/004 适用回归。
6. 更新 README/设计的当前实现说明、任务检查清单与 progress，形成候选提交；全新未参与实现 6Astro Reviewer 按新产品差异独立复核。修复/复核后按已授权流程普通推送两远程并分别核验。

复杂 trusted 持久化/迁移/状态机和关键独立 review 用平台 `gpt-6-astra`；明确边界 UI/常规测试/文档/收尾用 `gpt-5.6-sol`。具体文件分工必须在接口稳定后安排，禁止同一文件并写。Prompter 或指定记录者协调 progress；执行者交回本切片成果。

## 验收清单与证据

- [x] 004 最终 PASS、双远程历史回执和 continuation 原始报告核验并归档；正式 001～004 已在 Git，005 编号未占用。
- [x] 接管 HEAD/clean/双远程实核；必要入口、历史快照和合同已落盘（是否入库以 `git ls-files` 和提交核验为准）。
- [x] 正常时间线按助手独立、改名/换模型不丢，切换/并行/晚到响应不串线。
- [x] 严格临时不读正常历史、不自动持久化；显式保存目标与范围清楚，事务失败保留内容，重复操作不重复插入，保存成功时点诚实。
- [x] 正常 completed/failed/cancelled/interrupted/pending 恢复真实；正常关闭保存已收到 partial，重启不重发。
- [x] populated v2 升级保留助手/连接/绑定/凭据与旧状态；注入升级失败完整回滚。
- [x] 有界 context 的实际请求断言：当前助手、当前允许接收方、最近合格历史、长度上限，不混入其他助手/临时内容。
- [x] 真实 Electron 两个 fresh PID：正常消息/状态/显式保存恢复，未保存临时正文与进程临时 Key 不恢复；恢复零自动请求。
- [x] 聚焦与完整测试、typecheck/lint/format/build、Electron lifecycle、依赖树、foundation validator、秘密/生成物/残留检查通过；报告保留计数、PID、失败和 NOT RUN。
- [x] 独立 Reviewer 对精确产品 HEAD `0aa2d9190b63c7b99d59f52808e16965fa6b417f` 和完整产品 diff 给出 `PASS`；docs-only 后续差异相称核对。
- [x] 已审产品提交普通非 force 推送 github/main 与 gitee/main，并分别以 `ls-remote` 实测为精确产品 HEAD；关键任务、索引和脱敏证据在文档收尾候选中纳入 tracking。

新增验收不得只复述旧 17 files / 62 tests。已有 Provider transport 的精确端点普通/流式资格可复用；本切片可使用合成 transport 验证持久化，不为不变 transport 重复收费。若真实新增行为必须 live，缺少 Key 时向用户索取 Key 一项，同时继续本地工程；端点/模型已知，不从私人目录找秘密。

## 授权、路线与下一动作

持续授权：项目开发/依赖/测试/合成数据、本地提交、已独立复核的 main 非强制推送 github 和 gitee、必要低价合成 Provider 调用，无逐 SHA/调用新批准。真实个人资料、不可逆真实数据操作、系统安全变更、Release/部署仍需独立授权。

目前没有产品用户门禁。工程方案、SQL、文件布局、内部限额、测试工具、角色/路线、合理提交点由工程链决定并记录依据；不能将临时模式明确保存扩大为普通逐句手动保存。重复失败没有证据增量时启用新的高推理诊断并比较实质不同路线，不以任务总时限或单次 REPLAN 停止。

工具现场：默认 exec/Node helper 在进程创建前 setup refresh 失败，主 Agent 已核验 require_escalated exec 可执行；这不是产品失败或拒绝可绕过的许可。编辑采用固定 allowlist、preimage、exact transform、同目录临时文件、原子替换/备份回滚、postimage 和最小 diff；平台明确拒绝不得绕过。

下一动作：005 产品目标已经完成并独立审核通过，本轮为 STOP_CHECKPOINT；收尾审核与传输记录不改变已审产品状态。恢复时评估尚未实施的时间线浏览/检索与局部上下文选择，登记正式任务后按新差异验证复核；长期记忆继续另设切片。

## 实施证据（2026-09-06，候选尚未独立审核）

- 直接实施 HEAD：`cb65fe501c0a366529d3f0553b2ca6a2b900e0de`；产品 baseline 仍为 f5aa9880。shared timeline DTO/两窄通道、v3 加法升级、单一 TimelineRepository、Provider 双模式状态机及 preload 已落盘。
- 普通模式：先原子写 user + pending，再外发；context 最近 16 完整对、输入与历史共 64,000 UTF-16 字符。若最新候选对超预算则停止向前选择，历史本体不删；界面读取最近 100 消息。临时模式保持 64 条内存消息与 120,000 字符上下文预算，显式事务保存后仍临时。
- `npm exec vitest run tests/integration/timeline-service.test.ts`：11 tests 通过（exit 0）；覆盖事务前发、失败回滚、保存幂等/隔离、失败状态、上下文预算、跨助手、正常关闭 partial、最终存储失败诚实回执、撤权和敌手 delta 上限。适用 Provider/assistant IPC 回归已运行 4 files / 19 tests（增加最后 3 oracle 之前）。全链计数待汇合更新。
- 真实失败保留：delta 超限新 oracle 首次失败，原因是 CRLF 使一次定向变换未命中；改用换行归一化和严格匹配计数后通过。测试 protector 的 Buffer.map 返回类型报错已修正，下一完整 typecheck 复核。工具 helper 读取失败后核验 preimage 未变，切换合法获批内容寻址同目录原子写入；一次审批 reviewer deadline 超时未启动命令，允许重试成功。
- UI（sol）与 populated-v2 / Electron 恢复 oracle（sol）独占不重叠文件并行实施。独立 Reviewer、双远程同步、完整 verify 尚未运行；本段不构成 PASS。

- 工程语义澄清（沿用 004）：本切片“当前助手”指每次明确操作所捕获的目标 active assistant。trusted 校验目标存在/active、绑定、启用连接和凭据并冻结接收方；不把 `request.assistantId === assistant_state.current_assistant_id` 作为额外前提。这样界面切换及不同助手并行请求仍可按捕获 ID 完成。renderer 不能传 history、SQL、接收方或“已授权”结论；普通 context 仅 trusted 读取该目标，临时显式保存仅复制 trusted 内存会话。

## 候选最终验证（2026-09-06，历史候选快照）

- `npm run verify` exit 0：focused 与 full 各 20 files / 80 tests，typecheck、lint、format、build 与真实 Electron 全部通过。timeline core 12 tests、migration 2 tests、renderer 总 6 files / 11 tests 均在完整链内。
- [真实 Electron 合成证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-electron-evidence.json)：run `1a09637d-d522-4a64-86c2-28695e59d0f3`，fresh PIDs 25572 / 62496；正常/显式保存记录身份正文恢复、pending partial→interrupted、未保存临时不在盘、恢复调用 0、显式发送后调用 1、实际 persistent Key 与 Windows 保护均通过。
- populated v2 成功升级及第二 DDL 冲突回滚保留助手/归档/primary/current/revision、连接/绑定/版本；独立 vault 密文逐字节不变且仍能解密。旧 v1 测试夹具初次未删除新增 v3 表导致冲突，已修正夹具并通过，未放宽产品 guard。
- `npm ls --all --json` exit 0；foundation validator exit 0，errors/warnings 均空；secret/generated/residual scan 零匹配，`git diff --check` exit 0。无依赖版本或 lockfile 变化。
- UI 首次旧 fixture 缺 timelineApi、effect 同步 setState lint 及完成后返回空 timeline 的 fixture 语义已修正；完整链重新通过。没有删除/跳过测试，无新 paid/live Provider 请求；004 未改 transport 资格沿用。
- 本段形成时仍 NOT RUN：候选双远程 push；随后发生的产品 push 见“独立最终产品审查与同步”。PACKAGED、安装器、全面崩溃恢复、多实例、真实个人数据、Release/部署及其他延期高级 Provider 能力仍不在本片范围。历史 Toolhelp32 -003 保留 failed/deferred/non-blocking，未重跑或派生。

## 独立审查 REPAIR 与有界修复（2026-09-06）

- 独立 Reviewer 对精确 HEAD `842176053489e2d3d90037d7b36a31ef6129c415` 给出 REPAIR；冻结 [原始报告](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-review-8421760.md) SHA-256 `38399EF35CD24003CFA8167C7055E582D32C5101E4E1B2FC422B89BBC13DEB76`，原文不改。
- F1：Provider 在 trusted 建会话前拒绝时，renderer 将输入从可信时间线撤出并保留为明确的“未发送、未保存”草稿；显式保存只按 trusted 回执中由 unsaved 变为 saved 的稳定消息 ID 计数，空保存不再删除草稿或虚报两条。
- F2：每个 `assistantId:mode` 的 captured request 在 pending/terminal 期间受保护；读取使用可信消息 ID/元数据并保留更晚的本地 partial/terminal，delta 或 terminal 会使更早读取失效，可信 terminal 最终取代覆盖层。仓库回归覆盖模式切换、助手切换和 terminal 后迟到 pending 读取。
- 冻结外部 `review-ui.test.tsx` 与 `review-stream.test.tsx` 已分别 exit 0（各 1 test）；仓库 timeline 6 tests、renderer 全组 6 files / 13 tests、`npm run typecheck`、`npm run lint`、`npm run format:check`、build 与 diff-check 均 exit 0。renderer 全组首次 1 fail 来自旧 security 成功 fixture 的固定错误 request ID；改为捕获真实请求并返回完整成功 snapshot 后通过。精确修复候选仍待独立复审；本段不构成 PASS。

## 第二轮 UI 诊断与修复（b1aa9b9 后）

- 原始 [独立第二 review](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-review-b1aa9b9.md) 逐字保留。其 R1/R2 在修复前独立复现为 2 tests / 2 failures；不是存储或 transport finding。
- 对比新增 trusted admission/count DTO 与现有可信事件/命令回执/快照观测，选择后者：UI 显式区分 snapshot、unavailable、superseded；捕获请求记住 accepted/terminal 证据，未知状态保留输入和 partial，只有可信拒绝或无接受证据且完整新快照确认缺席才是未发送草稿。已确认 terminal 不因丢失回执降级。
- 保存消息数只描述 trusted 返回快照的“已确认保存总数”（包括此前保存），不从乐观 ID 或旧 UI 行数猜新插入数；read/save 共用按 request+role 合并，保留新请求和独立未发送草稿。无 trusted/shared/IPC/schema/transport 改动，无自动重试。
- 原冻结 F1 / F2 / R1 / R2 由机械收尾接管者独立重跑并全部通过（1+1+2 tests）；repo 新增 6 tests，覆盖 failed/throw/superseded 观测、已知完成、乐观 ID、重复保存、独立草稿与新请求隔离。renderer + trusted timeline 共 7 files / 31 tests、typecheck、lint、format、build 均 exit 0。原 6Astro 修复执行者在实现完成后遇到 `Selected model is at capacity`，partial state 完整保留；route 转由 `/root/timeline_ui` 完成验证、记录与提交。
- 全链 Electron/migration 沿用独立 review 的未变 trusted 证据（PIDs 59660 / 62500，恢复 0 / 显式发送 1）；本纯 UI 差异未重复运行。本段记录第二轮修复候选形成时状态；随后的独立最终复审与产品 push 见下一节。

## 独立最终产品审查与同步

- 独立 Reviewer 对精确产品 HEAD `0aa2d9190b63c7b99d59f52808e16965fa6b417f` 给出 `PASS`，无剩余 finding；原始报告逐字归档于 [persistent-timeline-v1-review-0aa2d91.md](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-review-0aa2d91.md)，SHA-256 为 `E13D1F19B9E66D5932D010F8455FD4177A3EBC991FC7DE7C639C5A73C80105B0`。
- 独立全量验证为 20 个测试文件 / 88 个测试，typecheck、lint、format、build 与安全扫描通过；同一产品边界沿用独立 Electron 生命周期证据 PID 59660 / 62500。
- 该精确产品提交已用普通非 force push 同步至 GitHub 与 Gitee 的 `main`；推送后 `ls-remote` 均返回 `0aa2d9190b63c7b99d59f52808e16965fa6b417f`。脱敏回执见 [persistent-timeline-v1-push-close-0aa2d91.md](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-push-close-0aa2d91.md)。
- 005 产品范围至此完成，本轮为 STOP_CHECKPOINT。收尾审核与传输记录不改变已审产品状态；时间线浏览/检索与局部上下文选择尚未实施。

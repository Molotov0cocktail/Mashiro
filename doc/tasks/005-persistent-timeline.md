# 005 每助手持续时间线、显式保存与正常重启恢复

> 状态：AUTHORIZED / IMPLEMENTATION NEXT；2026-09-06；route `persistent-timeline-v1`。
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
- [ ] 正常时间线按助手独立、改名/换模型不丢，切换/并行/晚到响应不串线。
- [ ] 严格临时不读正常历史、不自动持久化；显式保存目标与范围清楚，事务失败保留内容，重复操作不重复插入，保存成功时点诚实。
- [ ] 正常 completed/failed/cancelled/interrupted/pending 恢复真实；正常关闭保存已收到 partial，重启不重发。
- [ ] populated v2 升级保留助手/连接/绑定/凭据与旧状态；注入升级失败完整回滚。
- [ ] 有界 context 的实际请求断言：当前助手、当前允许接收方、最近合格历史、长度上限，不混入其他助手/临时内容。
- [ ] 真实 Electron 两个 fresh PID：正常消息/状态/显式保存恢复，未保存临时正文与进程临时 Key 不恢复；恢复零自动请求。
- [ ] 聚焦与完整测试、typecheck/lint/format/build、Electron lifecycle、依赖树、foundation validator、秘密/生成物/残留检查通过；报告保留计数、PID、失败和 NOT RUN。
- [ ] 独立新 6Astro Reviewer 对精确候选和完整产品 diff PASS；docs-only 后续差异相称核对。
- [ ] 已审交付普通推送 github/main 与 gitee/main，分别 Git 实测；关键任务、索引和脱敏证据 tracked。

新增验收不得只复述旧 17 files / 62 tests。已有 Provider transport 的精确端点普通/流式资格可复用；本切片可使用合成 transport 验证持久化，不为不变 transport 重复收费。若真实新增行为必须 live，缺少 Key 时向用户索取 Key 一项，同时继续本地工程；端点/模型已知，不从私人目录找秘密。

## 授权、路线与下一动作

持续授权：项目开发/依赖/测试/合成数据、本地提交、已独立复核的 main 非强制推送 github 和 gitee、必要低价合成 Provider 调用，无逐 SHA/调用新批准。真实个人资料、不可逆真实数据操作、系统安全变更、Release/部署仍需独立授权。

目前没有产品用户门禁。工程方案、SQL、文件布局、内部限额、测试工具、角色/路线、合理提交点由工程链决定并记录依据；不能将临时模式明确保存扩大为普通逐句手动保存。重复失败没有证据增量时启用新的高推理诊断并比较实质不同路线，不以任务总时限或单次 REPLAN 停止。

工具现场：默认 exec/Node helper 在进程创建前 setup refresh 失败，主 Agent 已核验 require_escalated exec 可执行；这不是产品失败或拒绝可绕过的许可。编辑采用固定 allowlist、preimage、exact transform、同目录临时文件、原子替换/备份回滚、postimage 和最小 diff；平台明确拒绝不得绕过。

下一动作：立即实施步骤 1～3，随后中文 UI、验收、独立 review 和授权双远程同步。入口整理不是本轮终止点。005 完成后由新状态评估者选择下一高价值切片；候选为时间线浏览/检索与局部上下文选择，需先登记任务，长期记忆继续另设切片。

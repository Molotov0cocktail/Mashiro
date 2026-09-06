# 004 Provider 连接与严格临时文本交互

> 2026-09-06：IMPLEMENTED CANDIDATE / FINAL VERIFICATION COMPLETE / INDEPENDENT REVIEW REQUIRED，route `provider-text-v1`，attempt 1。

## 执行结果

- 已实现 SQLite v2 连接与助手绑定、Windows 安全凭据、严格临时会话、原生 Chat Completions/SSE transport、窄 IPC/preload 和中文 renderer。助手既有六通道与稳定身份保持不变。
- 上下文按助手隔离并有界；退出即丢失。连接、绑定和受保护的持久 Key 可跨重启；临时 Key 只覆盖当前进程，旧持久 Key 若存在会在重启后恢复。用户可显式清空当前助手临时会话。
- 真实端点按任务 003 执行 4 次合成调用：前两次关闭思考收到 HTTP 400/code 1210；改为该模型要求的 enabled+low 后，普通与流式各一次成功。两次成功 usage 均为 22/4/26 tokens。端点与模型均保持用户指定值。
- 完整 `npm run verify` exit 0：focused/full 均为 17 files / 59 tests，typecheck、lint、format、build 和真实 Electron 双 PID 重启均通过。PID `49348 → 49772`；持久凭据保护/恢复、临时会话不跨重启与 Provider 中文界面截图均有直接证据。测试 Key 已清理，产品没有预置凭据。
- 首轮独立 Reviewer 后完成有界 repair：即使助手无绑定或连接停用也能清除临时内存，renderer 只在 trusted 清空成功后清除捕获助手的 transcript；失败跨助手切换仍保留原内容并显示中文错误。另补真实 populated v1→v2 成功保留完整助手快照的 oracle。repair 聚焦 6 files / 18 tests 及 typecheck/lint/format/build 均 exit 0。

---
> 2026-09-06：AUTHORIZED / READY FOR IMPLEMENTATION，route `provider-text-v1`，attempt 1。

## 基线与现场

- 精确 baseline：main `c8de9e9c84807127bad4ae5edb5302f8f0c3581e`；接管时 index/worktree 干净。
- 2026-09-06 实际 `ls-remote`：github/main、gitee/main 均为该 SHA，URL 与用户指定一致。旧报告 PUSH=NONE 只表示历史时点。
- [F1 Candidate Reviewer](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-candidate-review-attempt-5-r2.md) 对 `90335af96bf95e531ddadc4f3f19259a75c18ee4` PASS；当前 closing commit 仅含 docs/evidence/tooling。用户提供最终审核 PASS 的续接事实，但仓库没有对应 Final Reviewer 原始报告。实现前补核该 docs-only diff，最终新 Reviewer 将此缺口纳入审查；不重跑整个 F1 资格链、不回退已推送成果。
- 历史 10 files / 18 tests 与双 Electron PID 是历史有效证据，不能冒充本轮结果。Toolhelp32 -003 仍 failed/deferred/non-blocking，不再运行或派生 -004。

## 目标与范围

交付用户可配置复用连接、为不同稳定助手分别绑定模型，并在中文界面进行明确标注不留存的严格临时文本交流：普通响应、流式增量、取消、部分输出、分类错误及真实/未知用量。本轮先不做持续时间线；本次临时会话的多轮上下文只留内存，按助手隔离，切换不可串线，退出后不可恢复。现有稳定助手行为全部保留。

权威产品来源：[proposal](../proposal.md)、[high-level-design](../high-level-design.md)、[detailed-design](../detailed-design.md)，特别是 AST-004、PVD-001/002/004/008/009、EXEC-006、USE-001。最新用户持续授权覆盖旧 F1 范围限制和旧逐次授权要求。

## 已选路线与关键约束

- 主进程原生 fetch + 有界 SSE 解析，Chat Completions 优先；与 SDK 双栈相比避免隐式重试与额外扩展映射。执行者在官方资料/本地测试确认流和 abort 行为；只有机制不可行才切换路线。不自动改协议、模型、端点，不自动重发。
- 连接元数据与 assistant model binding 分开，连接稳定 ID，绑定引用 assistant ID。SQLite 可做明确 v1→v2 加法升级：前置完整性检查、单事务、失败回滚、保留原有 ID/状态；不引入通用迁移平台，现有用户数据不重置。
- Windows safeStorage 保护持久 Key，可信侧独立凭据存储/引用；另支持本次进程内临时 Key。保护不可用时持久保存失败，绝不落盘明文。列表/结果/错误/日志/报告不回传 Key；UI 输入提交后清空，不保留展示。凭据不是普通配置或数据库导出的一部分。
- 新增职责窄 IPC，保留已有六个 assistant channels。所有可信输入/输出及流事件严格校验；preload runtime 仅 Electron 与无 Zod channel constants。renderer 无任意请求/SQL/文件/凭据读取权，远端文本按文本渲染。
- Base URL 仅 HTTPS（本地测试注入 transport 或隔离 loopback fixture，不放宽产品规则），拒绝 userinfo/query/hash；禁跟随 redirect，URL 不携带秘密。外发只含本次用户明确提交的临时会话文本，界面显示实际连接接收方与模型；无历史/私人资料隐式注入。
- 执行段绑定端点/协议/模型/adapter version；普通配置变更在下一段生效。连接禁用或凭据删除即时阻止后续调用并取消在途请求。取消、切换和晚到事件按 request ID/assistant ID 路由，不能覆盖新请求。
- 有合理超时、体积/增量缓冲限制与清理；只有正确协议完成才能标成功，断流保留 partial 并标 interrupted。缺少 usage 标 unknown，明细不重复累加，不捏造账单。认证/额度/配置/暂时失败分类，不展示原始 Provider 错误正文或认证 URL。
- 可编辑连接及模型但不开放任意 JSON/脚本/请求模板。工具、思考续接、结构化输出不在本切片实现，分别 UNKNOWN/NOT RUN，不妨碍普通文本交付。

## 实现和验收

1. 先建立甄别性测试：连接/绑定跨重启保持但临时 Key/聊天不恢复；持久凭据密文保护失败无明文；升级保存已有助手且异常回滚。
2. 实现 trusted Provider 服务、存储、传输、IPC 与中文设置/临时交流 UI，合成 fixture 覆盖普通、碎片 UTF-8/CRLF SSE、多行 data、独立 usage、完成/断流、非 JSON、错误、超时、取消、晚到事件和 redirect 拒绝。以真实断言证明没有自动第二次调用。
3. 覆盖可信边界恶意输入/畸形输出、跨助手隔离、禁用/删凭据、未知 usage 与日志脱敏。不会因为收到工具字段就执行任何操作。
4. 运行 focused/full、typecheck、lint、format、build、既有真实 Electron 双 PID 回归，并扩展最小真实 Electron Provider/安全存储/临时状态生命周期证据。依赖树与秘密/生成物/残留扫描；若锁文件没变不机械 npm ci。测试先证明实际变化，不为实现镜像测试或无关历史审计扩框架。
5. 取得精确 Base URL/模型及用户 Key 后，任务 [003](003-provider-live-qualification.md) 通过同一实现执行少量合成普通/流式调用，记录目标指纹、adapter、时间、模型、请求数、usage 和独立能力结果。主 Prompter 管理测试秘密源，不在报告/Agent 消息间复制 Key。真实条件缺失时本地交付可以继续，live 如实 NOT RUN。
6. 实现者同步 README、progress、当前设计状态和任务003顶部授权说明，保留历史记录。候选提交后全新独立 6Astro Reviewer 审关键持久化/凭据/外发/协议与动态证据。最终差异审核覆盖后非强制同步两远程，分别核对 SHA；不要追加自引用审核提交循环。

## 授权、失败与续接

- 2026-09-06 用户持续授权：项目写入、依赖、测试、真实 Electron、合成数据实验、本地 commit、两既定远程 fetch/非破坏性整合，以及已审核最终 main HEAD 的非强制 push；必要低价合成付费核验已授权，不再逐次索预算或批准。
- 本轮不读其他私人目录找 Key，不访问 AIbrowse/Clender/真实个人数据，不 Release/部署/系统安全修改。永久删真实数据仍需用户决策。
- 普通错误直接修；相同 first bad state 无新证据时及时改路线，复杂协议/安全假设失败由新高推理诊断；遵循用户按证据调整阈值，不把每个小错误机械升级。工具故障与安全拒绝分开，合法提升上下文目前可读；编辑保持固定目标/原像核对/原子替换/最小 diff。
- 历史规划时缺失的端点和模型已由用户明确为 `https://open.bigmodel.cn/api/paas/v4` 与 `GLM-5.3-FLASH`；实际结果见本页“执行结果”和任务 003。
- 完成后判断下一切片：每助手持续时间线、对话保存与重启恢复。内存临时会话不会被隐式转为持久历史。
- 剩余 NOT RUN：高级 Provider 能力、持续对话、长期记忆、事项/提案、提醒、安装/PACKAGED、通用迁移/多实例/崩溃恢复、Release/部署、真实个人数据。

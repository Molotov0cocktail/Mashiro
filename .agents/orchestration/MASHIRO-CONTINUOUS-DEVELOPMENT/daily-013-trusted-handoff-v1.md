# 013 日常可信候选交接

2026-09-07。AUTHOR FREEZE / 待独立审核，PROGRAM ACTIVE。执行者为现有 steward_013_trusted；未新增 Agent，未自行提交或推送，未使用真实 Key 或发起外部 Provider 调用。

## 冻结范围

[32 文件 manifest](daily-013-trusted-manifest-v1.json)，SHA256 `A031859595C8FE45D82B6D3E33BCF11C67554E22EAF8BB48AC31E04E5BDC4D31`，产品基线 `2307e490a60af9cfce9f72ba9c0fd0d5ae658f20`。

main/index.ts 已交回 root 接 014；schema.ts、历史迁移夹具链与当前版本期望也交回 root 接 schema15 通知组。它们不在此冻结 manifest。这里的 daily-schema.ts 定义完整 13→14 增量，root 后续继续 14→15。renderer 由 UI 作者单写。

## 实际闭环

- 五个现有助手后台功能分别配置实际模型/接收方、范围、预算、时间与恢复策略。自动周期、手动立即运行使用同一来源校验和 UTC 日预算；稳定 occurrence/job/slot/command，已有候选与已成功提案可零模型恢复。空来源、单独事件支持不足、仅无正文删除记录不调用模型。
- 多事件独立根去重，可信侧统计各事件状态、未知发生时间，同根状态冲突归未知；planned/arranged 不算已发生。模型没有 user-statement 输出权限。观察 pending→disputed/接受/纠正/抑制均有真实 CAS 回执；纠正按用户陈述保存；接受写真实 Memory user actor/DAG/Markdown，不捏造普通 round。
- 已接受观察的纠正/撤回/删除走现有 Memory 影响确认。相关治理改变使报告旧令牌失效并清空旧正文；不会用取消 job 代替撤回接受记忆。pending 拒绝按独立根稳定抑制，改写同一依据不会自动复活。
- 每周规划产生实际 ItemProposal，接受前正式 item/reminder 零增量。报告链接按当前权限与提案实际状态读取；生成提案撤读时清空报告。来源修改、接收方/配置改变阻止迟到业务提交；完成/失效时清理 job 原始正文副本。
- 截止变更保存正式事项逐版本历史，不合并时保留中间版本；64 个检查点上限明示，未消费版本留待后续。只有报告成功事务才推进消费。删除通过真实 Item preview/confirm，清理原历史正文并仅保留删除身份/版本；无正文删除检查点不调用模型。
- 分类用量接实际 transport 每次派发，覆盖普通/工具链/章节/共享发现/仓储/五种日常功能；不再叠加上层整链总数。实际计数与 unknown 分开，严格临时仅进程内。运行中心有真实正在派发、终结、重启未知状态，也纳入章节/仓储/事项回执/正式提醒；角色及功能/助手/连接/模型/时间过滤、用量明细和分组独立分页。
- 严格 trusted Zod 输入/输出及窄 IPC；preload 仅 runtime channel 常量，assistant 六通道未扩大。结果 53 来源的 50+3 分页和治理变化后的旧页拒绝已实际验证。

## 作者验证

| 证据 | 实际结果 |
| --- | --- |
| [日常最终](daily-013-trusted-final-01.json) | 8 文件 / 21 tests 全绿，包含真实 SQLite/Memory/Item/ProviderService、自动派发、独立根、争议/纠正、删除、抑制、分页、预算/DST/恢复 |
| [运行计量最后增补](daily-013-operations-final-01.json) | 3 文件 / 22 tests 全绿，包含原 Provider tools 正常/临时三次实际请求 = 9 tokens，非重复计量；最后代码另补普通调用 SENDING 与重启 UNKNOWN 生命周期，待独立复核 |
| [全量问题比例修复](daily-013-full-repair-02.json) | 7 文件 / 38 tests 全绿，原 Item endpoint oracle 保持，历史 schema preimage 保持 |
| [Provider 基础](daily-013-provider-02.json) | 3 文件 / 28 tests 全绿，五功能各一次真实 ProviderService/fake transport，已冻结真实连接/功能/model，合计 75 合成 tokens，正式事项/提醒零增量 |
| [首次全量](daily-013-full-01.json) | 574 tests / 568 绿 / 6 红，保留原始失败；5 项可信修复如上，REM 项由 root 修复并接新用户默认及 schema15，不能把此记录称最终全量 PASS |

最后 node/web typecheck 退出 0；可信源码及新增测试 ESLint 退出 0；限定 Prettier 检查退出 0。运行计量最后增补后再次 node/web typecheck 退出 0。未声称 schema15/014 主进程整合后的全量、build、native 或真实模型资格已通过，均交 root 统一执行。

保留 `daily-013-*-red/01` 失败与修复链：临时用量不得持久 event；Provider 工具 clock 不能被后台计时调用；新作业不能等一秒空闲 timer；原 Item 普通 execution 不能凭旧端点授权继续读取。最后一项真实修复是在普通 execution 强制当前绑定匹配，独立 job execution 仍按明确的实际接收方授权；没有削弱原 oracle。

受控写入 JSON 计划 01–26 为本次安全写入记录。22 在重复匹配处停止（此前两产品文件成功，其余未写）；23 的版本替换范围少一个末尾字符，后哈希相同证明无改动；24 完成实际 13→14 期望修改，随后 38 项比例验证绿。无遗留可执行 writer，未绕过平台拒绝。

## 独立复核重点与待整合

请 root 独立核对实际接收方与普通 Item execution 的差别、提案 slot 同事务、报告治理/无正文清理、全部队列状态/筛选、RET retained-edge 接缝，以及用户实际 Memory 撤回后的可理解状态。历史事项回执的运行中心时间是此次纳入观测时间，未声称可重建旧操作发生时刻；更早逐请求用量未伪造。

本候选仍需要真实五功能合成端点资格、双 PID 原生 UI/治理/重启、014/schema15 整合、最终独立审查和整体交付。已接受观察撤回入口必须保留 Memory 影响确认，不能给 Daily 增加免确认删除捷径。未接受提案决议、额外 AST、RET 未决边界不变；新 REM 默认由 root 单写。

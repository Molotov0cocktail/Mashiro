# 014 冷启动提醒导航候选交接

状态：CODE_AND_LOCAL_SCOPE_READY_FOR_INDEPENDENT_REVIEW。这不是整体 014、PACKAGED、真实通知点击或最终发行 PASS。

## 行为

- 主进程为提醒导航保留一条内存待消费投递；renderer 先订阅实时事件，再按当前助手与状态版本拉取，实际路由完成后才确认消费。
- delivery、pull、ack 均绑定 assistantId + assistantRevision。同助手 A 经 B 往返或任何状态版本变化后，旧 pull/live/ack 都不能恢复旧目标；同一 delivery 的 listener/pull 竞态只导航一次，新的 live delivery 会废弃更早的迟到 pull。
- 发布、拉取和确认均重新检查当前助手与目标有效性。事项检查只执行活动助手加 ID 存在性的 metadata 查询，不读取或返回事项正文。
- 用户点击提醒进入独立事项/提醒页面；不会给 Provider 的正常或严格临时对话设置 item context。严格临时会话内容边界保持。
- reminder_activations 继续去重业务审计。相同合法系统通知再次激活仍产生新的导航意图，允许 renderer/main 丢失后的用户重试，不重复通知派发或业务变更。
- 待消费状态只在当前主进程内存中保存，可跨 renderer 慢初始化或重载恢复，不能跨主进程崩溃。失败文案指向“再次点击原通知”或“从提醒列表打开事项”，没有承诺重启自动恢复。
- trusted frame 检查先于 pending/ack broker 访问；IPC 返回继续经 strict Zod schema 验证。
- preload 同文件包含 RET 冻结合同要求的 policy/previewPolicy/configurePolicy/runPolicy 四个纯 invoke 接缝；这是跨切片兼容接缝，不是本候选对 retention 业务的验收。

## 回归证据

机器可读结果：[delivery-014-cold-navigation-tests-01.json](delivery-014-cold-navigation-tests-01.json)：

- 9 个测试文件，40 项通过。
- 包含原暖态对照与慢助手初始化冷态反例、旧 pull/新 live 的不同 ID 竞态、同助手新 revision、跨助手 ack scope、A→B→A、删除目标、发布时无助手/失效目标、IPC trusted frame、重复激活审计与无重复派发。
- npm run typecheck 最终 exit 0（Node + web）。
- 候选 19 路径 scoped ESLint exit 0；scoped Prettier check exit 0；scoped git diff --check exit 0。

保留的过程事实：

- 最初误用不存在的 typecheck:web / typecheck:node scripts，npm 报 Missing script；随后改用仓库真实 npm run typecheck。
- RET 并行合同变化曾造成 3 个 fixture、随后一个 scope 变量的全 typecheck 暂时失败；对应作者修复后最终全 typecheck exit 0。
- assistantRevision 成为 strict 必填后，独立 reviewer fixtures 未及时补字段的一次聚焦运行为 39/40；只补合同字段且不改业务断言后，最终 40/40。
- 独立 Reviewer 的两项 RED 原始证据仍是 delivery-014-cold-generation-review-red.json；本候选将其转绿，但最终 Reviewer 结论仍由独立执行者给出。

## 边界

- 当前未构建含本修复的安装包，未执行 PACKAGED 冷启动复验。
- 原生 COM 激活、通知历史保留与安装 schema18 的既有证据保持独立有效；本候选不能把 COM 调用描述为实际鼠标点击。
- 主进程崩溃会丢失内存 pending；合法的下一次系统通知激活会生成新的 navigation delivery。
- broker 只保留最新导航意图；较新的用户激活覆盖更早尚未消费意图。
# 014 可靠冷导航：冻结前独立增补 REPAIR

Reviewer review_017_trusted 未参与实现，当前候选尚未冻结，不绑定最终 hash。新增两项实际业务 RED，原始 [run](delivery-014-cold-generation-review-red.json)为 2 files / 2 failed，scoped ESLint 退出 0。没有 SQLite/桌面/真实提醒操作。

1. [renderer 代际反例](../../../tests/renderer/review014-cold-generation.test.tsx)：真实 App 在助手 A、stateRevision=1 时起 pending 拉取；随后只收到当前助手仍 A、stateRevision=3 的最终 snapshot，模拟主侧 A→B→A 的中间状态未呈现在 renderer。再返回原拉取结果，目标应为空，实际为旧 itemId。ack 明确返回 acknowledged=false，App 仍保留该目标。监听 effect 仅绑定 currentAssistantId，未将 snapshot revision 纳入在途响应/导航失效屏障。主侧 pendingRevision 校验不能收回已经离开主侧的旧回复。

2. [确认归属反例](../../../tests/unit/review014-cold-ack-scope.test.ts)：Broker 发布给 A 并成功确认；切换到 B 后，调用者提供当前 B 的 assistantId 与 A 的旧 deliveryId，Broker 返回 acknowledged=true。原因是缓存仅保留 deliveryId，检查当前请求助手后即匹配该全局数组。没有正文泄露、新导航或新数据修改；问题是跨助手重放获得不属于自己的成功回执，应把缓存确认与助手/适用代际绑定。

已将两个固定 oracle 交作者，要求原样复验。不同 ID 的旧 pull 被新 live 抢先后不能覆盖新导航、同 ID 去重、首次挂载前投递和合法重复原生点击等已有合同继续保持；本报告不以这两项替代最终候选全面边界审核。原始慢加载 RED 与原生一次成功都保持有效，不混称真实 COM 失败。

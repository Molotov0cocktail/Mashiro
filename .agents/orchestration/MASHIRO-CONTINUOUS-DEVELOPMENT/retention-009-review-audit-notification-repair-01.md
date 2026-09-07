# RET 审计通知独立 REPAIR

Reviewer: review_017_trusted，继承实际 gpt-6-astra/medium。仅独立测试/报告单写；产品由 memory_017_ui 修复。日期 2026-09-08。

## 实际反例

[原始 RED](retention-009-review-audit-notification-red-01.json)：2 files / 4 tests，3 failed，1 passed，exit 1。

- 真实 ProviderService、SQLite、MemoryService、RetentionPolicyService，隔离合成目录与模拟 transport；没有真实网络/桌面/个人数据。
- 先真实接受一条记忆；完成临时回答后，仅调用真实 policy.invalidateAudit 并等到 COMPLETE，临时时间线与原快照不再相等。
- 普通和临时回答分别保持 transport Promise 未完成；仅完成审计即令实际 AbortSignal.aborted 从 false 变 true，两项均 RED。
- 原 review009-provider-expiry 对照仍 PASS：真正到期移入垃圾区会中断回答，迟到成功正文不能复活。

因此此前 RET v2 的功能/性能 LIMITED PASS 未覆盖此跨模块通知边界，不能作为本故障通过依据；旧报告和旧失败均保留。根的新版 Electron 6 条临时消息变 0 与本独立反例一致；本测试不是原生 E2E，未改动 harness 的 6 条要求。根第一次 seed readiness 问题与第二次临时消息清空问题不同，不合并其失败原因。

## 源码因果与修复合同

旧 runAudit 完成发 emitPolicy([])，reason policy；RetentionService 将非 job-status 全部转给 Provider changed 回调并扩成全部助手，回调清 sessions 和 abort inflight。配置确认和调度异常也使用同类空对象通知。

纯审计/配置/状态应通知策略界面刷新，不得当成正文、来源、权限或治理变化；真实 expiry/move/cleanup/purge 保持既有撤权。App 的纯状态早退必须在请求代际和治理 epoch 更新之前。所有 renderer 消费者需区分状态与数据变更，不能吞同 epoch 下随后真正治理事件。

## 修复中的独立验证（尚非冻结结论）

[Provider 修后 scope](retention-009-review-audit-notification-green-01.json)：2 files / 5 tests，exit 0。保留原三项业务断言，并新增真实 preview/configure 不移动对象时临时历史不变。格式调整未削弱原断言。

[App 修后 scope](retention-009-review-app-status-run-01.json)：2 files / 3 tests，exit 0。独立新增 job-status、policy-status 在初始助手快照尚未返回时不拒收合法结果、不重复请求；既有真实治理拒收旧助手快照对照仍通过。这两项是修后新增验证，不冒称历史 RED。

独立新测试 scoped ESLint exit 0。等待最终产品冻结哈希及策略面板状态刷新/草稿保留验证后再给限定结论；此报告不宣称最终安装或发布通过。
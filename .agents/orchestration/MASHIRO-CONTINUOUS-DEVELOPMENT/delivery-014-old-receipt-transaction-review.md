# 018 helper 真实事务边界独立验证

2026-09-08，review_017_trusted，继承实际 gpt-6-astra/medium。生产代码和原生场景只读；只新增reviewer合成测试。

原helper643706版本运行真实FAIL：delivery-014-seed-old-receipt-window-executed-01.stderr.txt记录外层SqliteStore.transaction内调用ToolRepository.update默认内部transaction，SQLite报cannot start a transaction within a transaction。旧STATIC_PASS仅静态范围，不能覆盖此次运行失败。

现有生产ToolRepository.update第三参participating=true支持外层事务参与，保留真实状态转换/结果长度校验和写入实现。不需override Repository、伪造成功回执或拆开384项事务。helper修订合同仅将两次update都传true，外层事务与所有原guard保持。

[独立实际oracle](delivery-014-old-receipt-transaction-review-run-01.json)：tests/integration/review018-seed-transaction-participation.test.ts，1file/1test PASS，scoped ESLint exit0。

- 原默认false在外层事务内实际重现nested错误，六张协议/usage表完全回到原快照。
- participating=true真实创建并完成384项后，在最后注入guard失败，所有384项原子回滚，六表与原快照一致。
- participating=true提交384项，默认窗口恰384且旧operation不在其中；原request仍读取完整相等的旧成功回执。
- protocol_segments/tool_operations/protocol_results各+384，usage_attempts/background_attempts/steward_attempts逐行不变，integrity_check ok/FK空。

仅唯一mashiro-review018-transaction合成数据库，无Provider transport、实际网络、Registry或原生场景访问。此oracle确认现有生产API的事务语义，不代替owner对原实际失败后数据回滚的核验；最终helper修订哈希与原场景结果另行记录。
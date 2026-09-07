# 原路径失效后的显式空数据中转恢复：独立限定 PASS

2026-09-08，review_017_trusted，继承实际 gpt-6-astra/medium。新增 reviewer-only 合成 fixture，不修改生产代码或冻结out。

[实际测试原始输出](release-v4-empty-bridge-restore-run-01.json)：1 file / 1 test PASS，exit0。测试 tests/integration/review014-empty-bridge-restore.test.ts SHA256 D1C443FA93D53748BCAB33A96F1ACE82DBB6BE0001F5358F1E8ACB31596A5F9D；scoped ESLint exit0。

场景仅使用新建唯一mashiro-review014-bridge临时目录：生产session建立原dataset并完整备份，随后通过真实受治理SqliteStore提交item_tombstones记录；释放后把原数据保留在同一合成根下另一位置，使原定位失效。实际openProductionApplicationData出现“恢复 Mashiro 数据位置”，合成dialog按真实按钮数组选择“选择新数据位置”，建立新空A并进入session。

A与原datasetId不同。使用菜单对应生产session.restore将原backup恢复到另一空目录B，再session.select。独立断言B重新具有原datasetId、备份之后的删除抑制记录仍存在、retention_policy.restored_paused为1、integrity_check为ok、备份SQLite原字节不变。

可据此说明既有可达路线：先显式切到空A仅为进入应用，再通过菜单恢复到空B。A不是恢复后的原数据；第一次显式新建成功会改变当前定位到A，不能承诺这一中转步骤仍指向丢失位置。应先记下原位置，不删除原位置残留/备份，不能通过删定位文件绕过核验。

治理按备份receipt.dataSetId查询本机index.known或portable，不因当前选中A而使用新ID跳过原dataset删除记录。本测试证明此关键接缝；不声称新原生包的交互、全部治理矩阵或实际备份恢复已完成。既有独立损坏ledger/撤权治理拒绝证据继续复用。
## fixture 类型修正（原运行 PASS 保留）

根后续整合 typecheck 实际 TS2322（tool chunk21fce2，exit2）：prepareExisting 表达式回调返回 Promise<ProductionPreparationResult>，契约需要 Promise<void>。仅将该独立fixture回调改为block内 await prepareProductionData，不返回结果；生产路线及所有断言不变，src/out未修改。首次运行PASS与上述原SHA属于修正前证据，不冒称当时类型检查通过。

最终测试 SHA256 BECD4D1409FE5AF501638C59B1484C7B5DB869A41AC056D09E15A38E3DD213A9。[单测试复跑](release-v4-empty-bridge-restore-run-02.json) 1/1 PASS；npm run typecheck（Node+Web）exit0，见[修后检查记录](release-v4-empty-bridge-restore-typecheck-02.json)。首个写入尝试因预期CRLF与实际LF不符被preimage检查拒绝，无文件变更；按实际换行精确修改后完成上述验证。
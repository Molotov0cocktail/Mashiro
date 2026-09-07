# 009 私有 user/event 永久删除扩展交接

状态：`LOCAL_SCOPED_PASS_PENDING_INDEPENDENT_REVIEW`。基线为 `8154d0e09fc95014b8d205f8ed70c0028557208e`；未提交、未推送，未运行全量或 Electron。

## 实现

- `RetentionService` 删除 AST-006 旧门槛。原有 purge manifest 已按目标助手和 `scope=assistant` 选择 `user / relationship / continuity / event` 四类记录；本次不改变选择算法、事务确认、墓碑或异步清理协议。
- 定向集成反例证明：四类目标私有记录均进入预览；个人记忆 v1/v2 两代及其余私有 Markdown 文件物理清理；清理后的 SQL 元数据与命令不含旧正文；删除后新迟到纠正被墓碑拒绝，旧成功 commandId 只返回中性回执且不重建文件/正文。
- 同一反例证明：由目标私有记忆派生的全局记忆保留正文并显示已删除来源助手；其他助手私有事件保留；目标私有记录不再对替代助手可见。
- 事项回归增加目标助手 `DRAFT_PROPOSAL` 与 `REJECTED` 两种未接受提案均删除；已有断言继续证明正式事项保留、其他助手提案保留及保留事项按原接收方权限读取。
- `RetentionPanel` 预览明确全部私有记忆/事件、全部未接受提案删除，以及全局共享记忆、其他助手私有记录、正式事项保留。
- `DailyPanel` 将观察状态映射为中文：待核验、已接受、有争议、已撤回、已抑制；标题改为中性的“观察与处理”。

未修改 DDL、ProviderService、shared DTO、全局文档或 `dist/windows-baseline-schema15`；RET-007 仍保持未配置。

## 验证

- 最终定向：4 files / 25 tests，exit 0，见 `retention-009-private-types-tests-01.json`。
- scoped ESLint（7 个候选文件）：exit 0。
- scoped Prettier check（7 个候选文件）：exit 0。
- `tsc -p tsconfig.node.json --noEmit`：exit 0。
- `tsc -p tsconfig.web.json --noEmit`：exit 0。
- 扩展相关集：20 files / 80 tests 中 19 files、79 tests 通过；唯一失败是并行、未冻结 015 `src/main/provider/retained-protocol-schema.ts:29` 在 `retention-schema.test.ts` 的旧 v6 迁移路径抛 `PROTOCOL_SCHEMA_INVALID`。该文件不在本候选中，本执行者未修改。

首次定向运行有两处测试预期需对齐：迟到纠正实际由已选中记忆墓碑返回 `PERMISSION_DENIED`，原测试误写 `NOT_FOUND`；既有 Daily disputed 断言仍期待英文原值。只修正这两处 oracle 后，业务断言 25/25 通过。

## 待独立复核

重点复核预览/确认间新增私有记录仍由 epoch 阻止陈旧确认、旧清理作业不能复活正文、全局保留对象不会通过来源面板展开已删私有正文，以及未接受提案范围仍限于目标助手的已确认规则。本报告只主张本地定向结果，不替代独立 PASS。
# 014 治理恢复作者冻结交接 v2

状态：AUTHOR_FROZEN / PENDING_INDEPENDENT_REVIEW。PROGRAM 仍 ACTIVE，无自行提交或 push。

精确清单：[61 文件 manifest-v2](delivery-014-governance-manifest-v2.json)，SHA256 `603C3DFB5C00C6F32D9D6C5C57528ED7587003A419EA15F180F92C59DEBADF03`。包含 root 的用户指南/独立测试及 017 schema 模块作为整合依赖，作者归属不混淆。v1 仅因 credential-vault 的 Prettier 格式变化被替代。

当前机制和边界见[最终协议增补](delivery-014-governance-final-contract-addendum.md)。schema18 接线已完成；旧17受治理库实际 prepare 升级后新 inode/instance 经重新打开配置账本验证，旧完整备份 SQLite 字节保持。该 oracle 不声称已运行完整 openProductionSession 重开或原生17→18安装升级。

## 实际验证

- [suite03](delivery-014-governance-suite-03.json)：21 文件 / 60 测试全绿，含机制、真实SqliteStore/session、Memory纠正及真实read权限撤回、助手私有永久删除、global/formal保留、损坏原源恢复、外来备份、凭据非破坏撤销、root提醒三场景、生产准备/入口与017迁移模块。
- [legacy01](delivery-014-governance-legacy-01.json)：12 文件 / 61 测试全绿；真实历史DDL夹具保留，仅当前版本期待升级到18，未来版本拒绝探针改19。
- [upgrade02](delivery-014-governance-upgrade-02.json)：2 测试绿，真实17→18 prepare以及PREPARING导入创建日志前中断恢复。upgrade01一失败保留：测试误用迁移前内存journal对象判断新anchor，最终使用重新打开的持久journal，并保留旧anchor校验。
- suite02 60 项中59绿1失败保留：旧夹具将journalId置null却保留新seed，形成不一致元数据；修为真实当前PREPARING种子/ID后suite03全绿。没有放宽产品seed匹配。
- 最终限定 ESLint 退出0；61文件 Prettier check 退出0；全项目 node TypeScript `tsc --noEmit -p tsconfig.node.json` 最后退出0。此前017 renderer fixture缺round及 finally清理静态失败均保留在执行历史；root独立文件由root修。
- suite03之后仅补错误cause、将finally内清理拒绝移入函数和格式化；没有改变治理/分页/权限断言。完整整合全量/build/原生由root后续统一核验，不冒称本轮已运行。

## 交接与限制

- 所有工具进程已结束，无付费调用、无后台未完成进程。未改变用户Key；自动审核拒绝物理凭据删除的两次事实保留，已采用获批非破坏marker路线，未绕过。
- 恢复副本加密blob保留但不可读取，只有新持久Key解除marker；临时Key清除后仍拒绝旧blob。坏marker结构/目录/悬空链接拒绝解密，备份验证结构与哈希。
- 待新Reviewer覆盖正式session升级重开、恢复失败/旧locator保持、正文残留及提交后结算故障等独立反例；作者测试不是独立PASS。
- 初始种子元数据当前受8MiB读取上限约束，超限会失败关闭；大规模性能资格未新跑。当前源损坏且有未结算token、已知READY日志丢失/损坏仍进入治理待核验，不能自动恢复召回。
- 携带备份只能携带备份时已知屏障；原配置账本也丢失时无法知道备份后未被保存的治理，指南已透明说明。不是借确认回退取消仍已知的删除。

冻结后 schema/data/production/credential 文件交由root协调独立审核；后续修复需新manifest，不混入017作者其他在途文件。

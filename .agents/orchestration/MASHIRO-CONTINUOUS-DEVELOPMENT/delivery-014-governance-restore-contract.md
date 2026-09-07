# 014 后续治理与旧备份恢复合同

2026-09-07；实际 Astra / medium。总程序 ACTIVE。015 的 28 文件候选冻结，本增量不修改它或 schema16；root 已同意在015审核提交后，以独立schema17增加无正文提交token与实例锚点。依据 [缺口实查](delivery-014-restore-governance-gap.md)、[014](../../../doc/tasks/014-windows-data-and-delivery.md)、009 闭环5与总表 E04/E06。RET007 未决语义不在本合同决定。

## 用户可观察结果

同一 dataset UUID 的旧备份恢复后，后来已经完成的删除、撤回、纠正和权限撤回继续有效；不能显示、搜索、重放或自动整理已禁止的原文。缺少最新纠正正文时明确保留“旧版本不可恢复”的治理结果，不把旧文本当最新事实。助手永久删除按已接受 AST006：私有 user/event 与未接受提案删除，global/formal 不因助手消失而被顺带删除。

当前库健康时精确结算治理；当前库损坏时使用独立、已结算的配置侧屏障。若日志损坏、已登记 UUID 日志缺失或存在无法核实的在途治理，恢复副本保持不可打开，并解释“治理状态待核验”，不是假称删除已成功，也不是静默恢复旧内容。原库、备份、旧指向保持。

## 提交协议

1. 生产配置租约下，为 dataset UUID 创建已登记记录与最小无正文治理账本；数据侧带登记标识以阻止配置丢失后把已知库误当新库。旧未登记库首次升级只有健康验证后才能建立精确基线。备份识别并携带数据侧标识；不同 UUID 不合并。
2. SqliteStore 在生产上下文注册后，为**每个**连接安装 TEMP trigger 和 JS SQLite function。受监控行变更先将最小键/版本/权限意图同步持久化，再允许 SQL 继续。覆盖显式 transaction、直接 autocommit、已有 prepared statement 的执行、级联 trigger；普通未注册 dev/test 不获生产配置权限。
3. SqliteStore 对 prepare 的 run/get/all/iterate 与 exec 保持原接收者绑定，提交/回滚完成且无活跃 transaction 后结算本连接待决事件。TEMP trigger 同时把待决事件token写入schema17提交表，和业务变更同事务提交/回滚。只有核对当前原实例锚点、持久token与配置意图绑定后才晋升已结算屏障；不以“当前行看起来没变化”猜测回滚。SQL 回滚的意图被精确消除，不永久扩大已完成删除。fsync 失败阻止 SQL；SQL 已提交但结算落盘失败留下待决记录，健康重启在静止点完成结算，损坏源禁止自动召回。
4. 多连接各自持有待决批次，不以一连接未提交状态替另一连接结算。还原应用在隔离、未注册副本中进行，不能写回配置屏障污染正常数据或将限制扩散到其他 UUID。

## 最小状态投影

账本只允许固定结构的 ID、版本、状态、权限布尔、接收方指纹、计数/哈希；不含标题、正文、reasoning、工具参数/回执内容、用户路径、Key 或人物信息。

- content_tombstones、assistant_tombstones、memory_suppressions、item_tombstones 与回收状态记录已禁止来源；保留源关系需要明确区分撤回与已依法保留的正式/global来源。
- memory 对象/接受版本、正式事项/提案版本记录最低可接受版本，阻止旧纠正前状态复活；不复制最新正文。
- history/memory/item 权限及实际接收方记录最新已结算权限；恢复取旧副本与当前允许范围的交集，不借旧授权重新授予。
- 已删除助手、私有对象和未接受提案的关联，仅记录治理需要的 stable ID / scope / owner / state，不保存业务内容。

## 还原顺序与清理

验证批准的完整备份→新空目录创建 snapshot marker→复制/核原始 payload→在 marker 内升级 schema→验证 UUID 与账本→事务应用屏障、版本下限及权限交集→清理禁止的 Markdown/正文/协议/索引和衍生副本→失效旧预览、命令批准、后台作业接收资格→核对完整性/清理完成→重新核账本未变化→移 marker→正常准备与选择 locator。

恢复失败或中断都保留 marker；未知路径文件不能清理。物理清理仅针对已核恢复副本中受管文件、已接受文件名/哈希；不清理备份原件或原库。受保护凭据保持原保护格式。仍有效的 global/formal 数据保留；其合法保留来源不因助手私有资料清理而被扩大删除。

## 实施与必要反例

先做最小真实 node:sqlite TEMP trigger / callback / fsync / wrapper 实验，验证 before-commit、rollback、autocommit、prepared-before-hook、级联、多连接和结算失败。该实验只能证明机制，不当作产品闭环 PASS。

随后新建治理 journal / registry / projection / apply 模块；必要改 SqliteStore、生产 session/bootstrap/restore/startup/maintenance/backup 和入口错误说明。原schema16与015 Provider域不改；015提交后独立schema17迁移保留真实旧版本约束。新恢复副本取得新实例锚点，不得凭复制的旧实例记录清除原实例待决token。当前原库损坏时已结算屏障仍可用，存在未结算事件则保持待核验。

产品反例至少覆盖：旧备份后 memory纠正/来源撤回/助手私有永久删除/未接受提案删除/权限撤回；当前库损坏且已结算日志可用；未结算/缺失/损坏日志禁止进入；回滚不误判已完成删除；不同 UUID；恢复中治理变更；清理失败与重启 marker；global/formal 保留；批量治理性能及每连接 hook。仅合成 temp 数据。

作者给出精确 manifest 和原始测试；root 独立审核、最终全量与原生安装恢复验证。独立通过前不 commit，不把配置账本底座当 014 整体完成。

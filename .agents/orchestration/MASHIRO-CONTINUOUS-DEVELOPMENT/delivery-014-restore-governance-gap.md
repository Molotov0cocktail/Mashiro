# 014 已知后来治理屏障缺口（只读核对）

结论：当前还原只复制并校验已批准的完整旧快照，**没有合并当前已知后来撤回、删除、纠正版本屏障**。这与总表 E04/E06 和 009 用户闭环 5 的要求不闭合；确认时间回退不能取消这项既定要求。此前原生报告只限定备份/新目录还原与身份保留，不覆盖该场景，不能据此给完整 014 PASS。

直接源码证据：

- `production-restore.ts` 输入只有 backupDirectory、destinationDirectory、signal、expectedReceipt；没有当前数据集或治理依据。它复制 receipt.files、核原始 hash、删除 snapshot marker、检查 dataset identity，然后返回。
- `production-maintenance.ts` 恢复分支调用上述函数后 session.select；没有读取或合并当前 session 的后续治理记录。
- `production-startup-restore.ts` 同样只有备份和新目录，并以旧完整状态确认文案继续。
- 后续 `production-prepare.ts` 的 schema/完整性校验不能推导旧快照之外的事实；目前没有独立于旧备份的持久治理屏障日志。

可行的有限工程路线：

1. 同 dataset UUID 恢复时，在当前 configuration/data lease 和静止点下先取得可信治理快照：content_tombstones、assistant_tombstones、memory_suppressions、已纠正/删除对象的最低接受版本，以及后续权限撤回。它是限制性合并，不从旧备份重新授予已撤回权限，也不复制无关当前正文来伪装完整历史。
2. 新目录仍保持不可打开的 snapshot marker。先验证备份原始 payload，再迁移隔离副本；事务应用新旧治理屏障的单调并集和版本下限。旧预览/命令批准/后台任务不得凭旧 epoch 继续使用，旧索引和衍生摘要必须重新受来源治理检查。不能把旧纠正版本重新激活；未知新正文可显示不可恢复/需核验，不能把旧正文当当前事实。
3. 复用已验证清理路线清除该还原副本中受屏障禁止的原文/Markdown/协议/派生副本，核对完整性与治理清理完成后，才移除 marker 并绑定 locator。失败保留旧指向、保留新副本阻止状态和准确失败原因。备份原件不被静默修改。
4. 当前数据损坏/未来 schema 无法读取的启动恢复，若有已知但不可可靠取得的屏障，不能直接跳过合并。需要按 dataset UUID 保存于 configuration 管辖的最小、无正文、持久单调治理记录，且与已确认用户治理动作有可恢复提交关系。日志落盘/原库提交中断的状态必须可判定或阻止恢复；不能仅在事后尽力复制、把未同步当“无屏障”。该协议未实现前，有此情况应明确阻止自动进入正常召回，而不是用确认框替代安全条件。

必要独立反例：旧备份→后来撤回来源/纠正 memory/永久删助手私有 user+event 与未接受提案→还原旧备份，UI、Memory.inspect、搜索、协议重放、daily/steward/job 恢复均不能复活；global/formal 保留符合新 AST 决议。另需当前权限撤回、还原中途治理变更、日志损坏/缺失、跨 UUID 不误合并、标记中断/重启恢复及清理失败不切指向。该核对不修改产品，真实功能修复及独立审核需单独接续。

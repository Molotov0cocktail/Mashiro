# 014 下一实现：可验证的静止快照与升级准备

2026-09-07，root 在仓储最终性能修复期间读取实际 production-session、SqliteStore、MemoryService、CredentialVault 和 retention cleanSql 后确定此路线。本文是实施接缝，不是备份已经可用的证据；[014 正式任务](../../../doc/tasks/014-windows-data-and-delivery.md)和总程序仍 ACTIVE。

采用显式维护停写后的完整快照。生产 session 持有真实配置及数据租约；备份先验证数据集 UUID，再使用 SQLite 排他事务确认没有其他数据库写者。当前应用使用默认 DELETE journal；其他 journal 模式不能直接复制主文件冒充完整快照，须有对应安全快照路线或拒绝。同步复制期间不调度同进程业务写者，前后验证源文件清单和哈希，不能仅依赖“已经关闭”的文字声明。

快照为新建空目的目录中的 envelope，包含 payload 和最终才写入的完成清单；完成清单记录数据集 UUID、schema、时间、文件长度和 SHA-256。不直接把旧快照自动绑定成当前数据，避免恢复旧删除状态。失败保留原数据和可识别的不完整目的目录，不修改 locator，不自动清空任何未知文件。

权威内容包括完整 SQLite（全部领域的事务、来源、权限、抑制、回执和作业），memory 中接受版本及所需待恢复文件，credentials 中受保护 blob，以及数据集 manifest。不调用 decryptString，不导出明文 Key；凭据明确限原 Windows 用户的保护能力。普通日志只记录安全错误码和计数。运行缓存和未知用户文件不被冒称业务数据，也不借备份授权读取无关文件。

校验 SQLite integrity/foreign keys 及 memory_versions 对应文件和 body_hash。永久清理已有合法表示是 file_name 为空、hash 为 hash('')、对象 suppressed/trash；不能为它重新创建正文，也不能把损坏的正常接受文件当作这种表示。源和副本校验后才写完成标记。

升级 prepareExisting 先只读识别 schema，不让 SqliteStore 提前迁移；需要迁移时先完成快照，随后迁移并验证。失败不默默覆盖原库，不允许旧程序打开未来 schema；给出精确快照和旧程序恢复路径。恢复旧快照必须保留当前纠正/删除屏障或拒绝危险覆盖，这一后续恢复模块不能用普通目录复制替代。

必须测试：当前完整 schema 与跨域状态、接受/清理 Markdown、受保护凭据原字节、损坏/缺失/路径穿越/符号链接拒绝、目的目录非空及重叠、在用数据库、失租/取消、复制失败和源变更、完成清单校验失败、迁移前快照与失败后可恢复性。用户维护入口和实际安装制品验证随后接入，不以这份路线或底层测试代替最终闭环。

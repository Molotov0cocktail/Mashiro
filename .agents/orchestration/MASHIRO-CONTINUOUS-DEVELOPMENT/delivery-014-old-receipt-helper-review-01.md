# 018 旧回执合成准备脚本独立静态审查

2026-09-08，review_017_trusted，继承实际 gpt-6-astra/medium。结论：限定 REPAIR，脚本未执行，PREPARED_ONLY 不等于 schema19 实证。

仅只读 delivery-014-seed-old-receipt-window.mjs，实核 SHA256 BEA7A29A031FEE1644598CFC860B7A8AF8FFA996FB3A1ED3FBC3EBC1BD49C7F1。当前 HEAD 0b9328b5308a4042d3acb351c2cac9deafd29670。不读取当前数据正文/凭据，不写 Registry/桌面/Git。

必要修正：

1. 当前先 new source.SqliteStore 再检查 PRAGMA user_version。生产 constructor 会 initializeOrVerifySchema 和 attachProductionGovernance；误在18执行可能先迁移，再通过19检查，或失败前已有库变化。应在持有真实lease后，先用只读 DatabaseSync 检查既有 schema 恰等于显式 expectedSchema，finally close，然后再生产打开。SQLite 文件打开前确认普通非链接文件；目录父链已有生产 canonicalProductionDirectory 检查。
2. integrity/FK 最终检查目前在seed事务提交后。移至提交前使对应失败也能回滚该384项seed；可保留提交后只读确认，但不能把提交后报错描述成无变更。

其余范围比例成立：固定已授权合成scene、dataset/run/assistant/oldoperation ID，既有Mashiro进程拒绝及生产lease，精确Git commit blob编译生产ToolRepository；384个独立synthetic clock标识，不调用Provider。整个append在单事务中，原表计数限定只允许三个协议表各+384，usage digest不变、旧操作仍成功可按旧request读取、默认384窗口已挤出旧操作；失败使用生产事务rollback。不可变备份不是写入目标。生成bundle为UUID且清理路径受限。

此审查不构成新产品功能审核，不确认尚未执行的新版schema或最终包。已将以上最小guard合同交根作者，等待修改后静态复核。
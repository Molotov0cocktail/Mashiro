# 014 种子容量接缝 v5 增量冻结

保留 v4 独立限定 PASS。新增 [3文件增量清单](delivery-014-governance-manifest-v5-delta.json) SHA256 `E237E6B026F6B97547FC3815A8B49D2C26CECBDDE0277EE09BEE458F0C3CD317`；仅 index、独立seed reader和作者测试。未改变RET007或产品资料容量决议。

根因：portable入口接受大于8MiB合法投影，但seed写完后通用readMetadata计算hash时拒绝。red01第一次fixture仅8,050,208字节，未达到目标，事实保留；改80,000条合法唯一事项墓碑后 [red02](delivery-014-seed-capacity-red-02.json) 明确报 GOVERNANCE_METADATA_INVALID，测试预期到达隔离journal入口。

新种子登记可信bytes和hash，写后与恢复读取均按已接受字节长度分块读取，读前/后核FD、路径身份和大小，拒绝截断、额外尾部及hash变化。旧无bytes种子保留旧8MiB兼容边界，因为旧实现不可能成功登记更大种子。registry/locator/marker仍用原小元数据边界，未全盘解除上限。PREPARING大部分日志只验证普通文件后原名隔离保留，不再为了保留证据完整读取到小文件buffer。

[green01](delivery-014-seed-capacity-green-01.json)：3文件6tests全绿，含现有实际升级/session恢复和新的大种子入口反例。新测试使用真实portable读、真实index/import种子持久化、真实重新打开registry/读取seed，仅stub Journal.create，避免数万次fsync。因此只证明约9.2MiB种子I/O容量一致及损坏拒绝，不声称80,000投影全日志创建/应用的规模端到端性能PASS。

新测试另验证截断、附加字节、等长坏hash均不能进入journal创建。三个文件Prettier和限定ESLint完成，全项目node TypeScript退出0。没有新增依赖、schema或付费调用；没有未结束命令。交原Reviewer仅审增量，再由root统一资格/提交。

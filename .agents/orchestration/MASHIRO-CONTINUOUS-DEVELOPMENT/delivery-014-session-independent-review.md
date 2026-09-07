# 014 session 独立审查：REPAIR

审查者：复用 steward_013_trusted（Astra / medium），未参与 root 的 production-session 实现。仅新增独立测试/证据；未修改产品或仓储冻结候选。底层 lease/location/lock/initialize 由 steward_013_ui 独立复核，本报告不重复代签其范围。

审查对象 [production-session.ts](../../../src/main/data/production-session.ts)，RED 运行时未同步捕获源码哈希；结果之后采集的 `0B2BE02F761B4873FA61A4D3D57ECE12FF5A875103A80223C64991A52804F9A9` 已含 root 修复，不能用作 RED 字节身份（以原始失败结果及当时读取缺少最终检查的实现为依据）；已读 [stage](delivery-014-session-stage.md)、作者四测试以及 production-location、production-lease、production-location-lock、production-initialize 四依赖全文。

## 必须修复

R1：READY 会话在 await prepareExisting 之后只调用 assertHeld，没有重新验证数据集身份、路径及 locator fingerprint。独立测试分别在真实准备 callback 修改 READY manifest 的 dataSetId、修改 locator revision；两项均错误地成功返回旧身份会话。配置/数据 lease 仍持有不能替代文件身份检查：lease 是协作进程排他，准备流程或外部文件变更仍可能发生。

预期：准备结束后、返回/绑定前，重新核验 canonical 路径、冻结的 UUID 和 locator fingerprint；失败释放占用并保留当前文件事实，不能覆盖为旧指向或假报成功。select/relocate 已通过 bind 再检验，但也应把当前 data lease 的实际持有证明纳入最终统一检查；取消恢复不得新建或重指向。

## 实际独立证据

[独立测试](../../../tests/unit/production-session-independent.test.ts) SHA-256 `3A0121A537733A822415F742BFBE6897CED67B2B987492B666D2A9DDCB9D690F`；[原始结果](delivery-014-session-independent-01.json) SHA-256 `BFEB61A24268DA444FCCA2DC16DF4443620A1FD79ADAAABDCAD1BB1D6982BA6A`。4 tests：2 GREEN / 2 RED。

- RED：READY 准备期间 manifest UUID 变化仍返回成功。
- RED：READY 准备期间 locator revision 变化仍返回成功。
- GREEN：prepareExisting 抛出备份验证失败时 locator 字节不变，配置和数据真实 lease 均释放且可重新获取。
- GREEN：准备等待期间，真实 config/data lease 均排除第二 owner；关闭实际 data pipe server 触发 AbortSignal 和 onOwnershipLost，恢复等待后拒绝返回，locator 字节不变。测试仅包装 createServer 捕获真实 server，未模拟 acquire/ownership 结果。

独立测试严格 NodeNext/strict TypeScript 与 ESLint 均退出 0。数据仅在带 mashiro-session-review 前缀的合成系统 temp 根，清理前校验父目录与前缀；未访问真实用户数据。

作者的真实 schema 初始化与四条已有测试在本轮已阅读但未冒称本轮重跑。尚未接入 native/main、真实备份/迁移策略、PACKAGED 或安装器，本报告没有“完整生产可用”结论。root 修复后须保持本独立 oracle 原文，复跑并精确绑定新实现哈希后另出结果；当前不能 PASS、提交或结束014/PROGRAM。

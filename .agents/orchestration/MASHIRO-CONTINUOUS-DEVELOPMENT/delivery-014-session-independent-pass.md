# 014 session 协调器独立限定 PASS

审查者：复用 steward_013_trusted（Astra / medium），未参与 root 产品实现；只新增独立测试和审查证据。结论仅为 `PRODUCTION_SESSION_STAGE PASS`，不覆盖尚未接入的 native/main、备份/迁移实现、PACKAGED、安装更新卸载或发布。PROGRAM ACTIVE。

精确修复实现 [production-session.ts](../../../src/main/data/production-session.ts) SHA-256 `0B2BE02F761B4873FA61A4D3D57ECE12FF5A875103A80223C64991A52804F9A9`，独立绿色执行前后哈希一致。代码审查确认 READY 的 prepareExisting 完成后重新执行 canonical 数据集/冻结 UUID 验证及 locator fingerprint 比较，然后才返回会话；原 select/relocate/create 绑定路径仍由可信 lease 下的 bind 检查。无默认数据替换。

[独立原始 RED](delivery-014-session-independent-01.json) 为 4 tests / 2 GREEN / 2 RED：准备期 manifest UUID 和 locator revision 改变均曾错误返回成功。root 修复产品，独立 oracle 未改，SHA-256 仍为 `3A0121A537733A822415F742BFBE6897CED67B2B987492B666D2A9DDCB9D690F`。RED 实现未在运行时采集哈希，先前报告事后读取的哈希已是修复实现，已明确更正此时间口径，不伪造旧实现身份。

[本轮独立 GREEN](delivery-014-session-independent-green-02.json) SHA-256 `4C0ADFADA223BA20FF67BAFBF7429E21C1782B02A7C01CF51867CEE62211AA9A`：2 文件 / 8 tests 全部通过，作者四项与独立四项合并实际重跑。覆盖：显式新建真实完整 SQLite/schema/仓储表，已配数据复开不重问；首次/恢复取消不新建或改旧指向；不同配置争用同数据；准备失败保留 locator 字节且释放双 lease；准备期间 config/data 真实排他；实际 data pipe 丢失使 signal aborted、回调一次、等待结束后禁止返回；准备过程中 manifest/locator 身份变化拒绝。

[静态及字节记录](delivery-014-session-independent-static-02.json)：严格 NodeNext/strict TypeScript、ESLint、测试退出码均 0。测试完全使用受控合成系统 temp 根，校验精确父目录及前缀后清理，不读真实个人资料。底层 location/lease/lock/initialize 独立结论由 steward_013_ui 的独立报告给出，本报告不代签。

剩余必需工作：提供真实可验证的 prepareExisting 备份/迁移策略与取消处理，接入可信原生选择/恢复/main，关闭业务写者后实际释放 session，在打包与安装生命周期验证持久路径、占用及恢复。当前 callback 边界明确存在，不能以一个 noop 调用者冒称已经完成这些后续功能。未提交、推送或给014/PROGRAM完成结论。

# 018 旧回执准备脚本修复静态 PASS

2026-09-08，独立 reviewer review_017_trusted，继承实际 gpt-6-astra/medium。仅只读审核；未执行 helper、未打开场景数据库、未重跑产品测试。

结论：STATIC PASS，限定为指定合成场景准备工具，未代表 schema19 或新制品运行验收。

实核 delivery-014-seed-old-receipt-window.mjs SHA256 643706F896E29F1732387C246D69D06A4E8B7832BB392E84C44EE7878224DACB；[prepared02](delivery-014-seed-old-receipt-window-prepared-02.json) SHA256 8356BADD7F5B627140F6EDDB50AED9997C0A0FA01647D4629412A14FC6A24D10。

[原审查 REPAIR](delivery-014-old-receipt-helper-review-01.md) 的保护缺口已关闭：真实生产 lease 后、生产 SqliteStore 前，先确认数据库为普通非符号链接文件且 native realpath 精确等于预期，再用独立 readOnly DatabaseSync 核对已存在 user_version 恰等于 expectedSchema，finally 关闭探针。生产 constructor 不能再替代安装包的 schema 升级证据。

最终 integrity_check 和 foreign_key_check 位于384项 seed 的生产事务内；任一失败与原计数、usage、旧回执、默认窗口检查一起触发 rollback。固定合成场景及 Git revision 源码绑定、目录父链生产防链接检查、不可变备份不作为目标的原边界仍保留。没有新增真实 Provider 调用或广域写入。

prepared02 仅记录 PREPARED_ONLY，明确 0b9328b 不含 schema19，且未 --execute。实际执行必须在最终包完成升级后绑定对应已审源码提交；成功数据和 UI 旧回执查阅仍待原生 owner 验证。此结论不将准备状态冒称执行通过。
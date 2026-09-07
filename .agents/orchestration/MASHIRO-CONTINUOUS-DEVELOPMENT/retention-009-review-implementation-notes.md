# RET 策略可信实现：独立短交接

2026-09-07，review_017_trusted 只读核对 [历史预案](retention-009-policy-preparation.md)、009 与 RET-001/002/007 及实际服务。历史预案中的 OPEN 保持其原时点；用户现已确认默认持久已接受 Markdown UTF-8 正文 104857600 字节、暂存 90 天转可恢复垃圾，均可调/关闭，垃圾永不自动永久清空。Reviewer 不写产品，后续审核新差异。

1. **统一接受守卫。** `MemoryService.apply` 是手动、reload、模型工具与后台接受的共同事务接缝；`RetentionService.move` 的恢复/转持久也是增加配额入口。事务内用当前数据集总量与当前版本贡献计算差额，配置 revision 与实际最新对象同时校验；超限仍允许非增加操作。当前 overview 只统计所选助手可见对象，且损坏文件略过，不能直接当全局配额账本。计量未知应阻止新增而非把损坏数据计零；用实际 UTF-8 字节，不用字符串长度或物理磁盘大小。拒绝接受不能误报 SUCCEEDED，也不能取消已可正常交付的聊天回答。

2. **纠正与移区分离。** 当前 `MemoryService.apply` 为普通 correct 强制 persistent；独立合成反例已实际 RED。用户选择的 staging 应由普通纠正/reload 保留，独立入区时间不因编辑重置；新 remember、显式转持久、垃圾恢复按各自行为处理。不能从保区修复推导垃圾可直接编辑或已撤回来源可恢复。独立测试 [review009-policy-seams](../../../tests/integration/review009-policy-seams.test.ts) 是 Reviewer 单写，请保持原样复验。

3. **自动转换有明确持久代际。** 独立记录 stagingEnteredAt/入区代际，以 UTC 经过天数算期限；现有 staging 缺可靠入区证据时以首次启用基线记录，不能用旧 updatedAt 立即批量回收。小批量到期选择后，在提交事务内重查 zone、objectVersion、epoch、policy revision、入区代际与到期状态，CAS 更新并原子写回执。关闭/缩短/重启/多页/重复 tick 均保持幂等。只 staging→trash，复用现有索引退出、依赖边及 changed 链；不借用 purge/empty-trash 或伪造用户 assistant actor。

4. **如实区分现有风险与已复现。** move 在 await 文件读取后的局部事务代码只显式查 epoch，但独立“在途 move 跨同步纠正”场景已经返回 STALE_PREVIEW，通过现有屏障，未复现覆盖。原始 [2 项结果](retention-009-review-seams-red-01.json)为 1 RED（纠正保区）/1 PASS（跨纠正 move），不是两个现有缺陷。新策略仍应显式校验完整代际，避免只借用偶然的旁路 epoch。

5. **恢复与资格暂停。** 当前 `production-governance-apply.pauseRestoredWork` 只列已有后台配置。新策略必须加入恢复暂停与治理增量约束：旧备份不复活后续关闭/移区/撤回，不从旧 enabled 自动启动；计量重建对缺失/损坏保留 UNKNOWN。先核实际 schema 占用后做加法迁移，并补真实旧版 fixture、恢复 schema 验证/目录清单，不能仅改最新库 DDL。

最小独立验收重点：字节恰好/多 1、中文与替换差额、两连接并发增加、未知计量、超限下减量；到期前后 1ms、旧暂存基线、编辑不重置、垃圾恢复重新入区、关闭在途与用户刚转持久；重启/分页幂等、恢复后零自动转换、垃圾正文仍可恢复。审核测试 scoped lint/Node TypeScript 已退出 0，不修改原 RED 证据为 PASS。

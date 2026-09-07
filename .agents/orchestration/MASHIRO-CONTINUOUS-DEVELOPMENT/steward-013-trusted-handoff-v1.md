# 013 仓储员可信候选交接 v1

2026-09-07；steward_013_trusted；Execute / candidate frozen，独立审核由 root 承接，本文不自判 PASS。产品基线 `95db9cfa93673ff6975ddb75ccba56b2d0264828`，之后文档提交由 root 维护；没有自行 commit/push/Provider 调用。013 和 PROGRAM 仍未完成。

## 精确候选

[35 文件 manifest](steward-013-trusted-manifest-v1.json)，SHA-256 `052B4F18A2DD25A0B376B58AE5D1C37A581E62422C59C4C1BFCDAC049191BEA0`。只含本执行者的 trusted/shared/schema/IPC/preload/main 和可信测试；不包含 root 的独立反例、014、E2E 或 UI 执行者的文件。manifest 记录实际 observed HEAD，不将文档 SHA 当新产品审核结论。

## 实际接入

- schema12 加法迁移：扩展 memory_pending，同时保存独立 discovery/steward 配置、作业、预留调用、有限 slots、消费身份、分支、成员和冲突。迁移碰撞整体回滚，历史 fixture 恢复真正旧字段，未来 schema 守卫由12推进13。
- `ProviderService.steward` 使用与章节相同的受限 Provider 发送实现，独立模型/连接配置及 UTC 日调用数/输入字符预算，wire 仍固定 maxOutputTokens=2048；没有内部假助手、假轮次或第七 assistant 通道。实际原有六 assistant 通道未改。
- 正常完成轮由独立 shared-candidates 配置识别；严格临时/显式保存临时 session 不入队。候选没有先写 active MemoryRecord，待整理页可查，零候选及用户拒绝不会重复扫描重建。
- 仓储员按真实活动 authorityAssistantId 运行；全局读/写/接收、来源 DAG、连接身份及范围都在派发和各 slot 事务里重验。旧 owner 已删除的未应用全局作业可交新显式锚点，新 job 保留旧 job 固定归属；已有 retained-source 授权是必要条件，不能新造边。
- 相关目标以可重建索引排名，随后逐对象权限、祖先及接受 Markdown hash 验证才提供给模型；关闭 allowAcceptedMemories 同时禁用目标索引读取和外发。模型任意 source/target handle 被拒绝。
- remember/conflict 创建新的真实 Markdown，equivalent 只建立保留来源的组织回执，不覆盖原记忆。所有 slot 固定 commandId/参数 hash，Memory 接受指针与对应成员/冲突/slot 回执同事务；支持 PARTIAL，本地候选恢复不额外调用，已成功 slot 不重复写。
- 仓储产物的精确 origin 禁止自排队；用户新版本仍入队，旧任务不能消费新版本。用户纠正、删除、撤回、权限版本或端点改变使未完成部分失效。使用治理 generation、权限摘要和逐源 hash；不使用会被自身记忆回执触发的全局预览 epoch。
- 普通记忆检索附未决冲突状态；用户只能通过同一冲突侧的真实 user/correct 新接受版本关闭冲突。全部提供依赖与模型明确引用来源分开返回，但接受依赖保守保留全部输入。
- 分支 Markdown 按页返回真实成员正文。query 原 cursor 同时完整分页 pending/jobs/branches/conflicts；branch 原 cursor 同时完整分页成员及该分支冲突。UI 必须在固定 expectedVersion 下拉全页再声称完整导出，版本变化返回 STALE_WRITE。

## 验证与保留失败

- [schema RED](steward-013-schema-red.raw.txt)：旧schema11不能满足12。
- [初轮角色 RED](steward-013-initial-tests.raw.txt)：自身 Memory command 写入推进预览 epoch 导致误 STALE；改治理 generation+权限摘要后 [2 files / 13 tests](steward-013-core-tests-02.raw.txt) 通过，没有削弱原断言。
- [核心治理](steward-013-adversarial-01.raw.txt)：3 files / 22 tests；[来源隔离与分页](steward-013-boundaries-02.raw.txt)：1 file / 5 tests。其[首次积压失败](steward-013-boundaries-01.raw.txt)保留：原队列每项固定等50ms，及时排空仍有 QUEUED 的队列后，原5秒测试及心跳<500ms断言通过。
- [恢复](steward-013-recovery-01.raw.txt)：3 files / 31 tests，含4个新恢复 oracle 及既有章节/助手profile。证明无 Key 本地候选恢复0额外调用、file-ready失败零接受、SQL后丢返回同回执。
- [旧owner保留](steward-013-owner-retention-01.raw.txt)：1 file / 2 tests；[旧相关分支](steward-013-retrieval-02.raw.txt)：1/1。第一次排名测试发现 Unicode 字符类被双转义，精确修复后相同反例通过；首次工具输出保留在会话。
- [最终聚焦](steward-013-trusted-final-tests.raw.txt)：8 files / 35 tests，包含 provided/cited 分离和事件状态/发生时间/时区保真。
- root 独立发现 R1 关闭已接受读取仍发送 targets、R2 第101分支无入口；未修改其独立测试，修复后[3 files / 9 tests](steward-013-root-repair-01.raw.txt)包含原三项 root oracle 通过。conflicts 与分支详情的同类分页一并修复；UI 执行者确认现有四列表和分支冲突累积逻辑适用。
- 最后发现共享识别阶段可把新数字冒称 faithful 后变为仓储输入；[RED](steward-013-discovery-nature-red.raw.txt)证明999未受原输入支持。复用同一保守性质分类器于发现阶段，两行修复后[3 files / 14 tests](steward-013-discovery-nature-green.raw.txt)通过；关闭推测时仓储零发送。共新增9个正式测试文件/36项可信测试，最后未重复全量。
- [全套首跑](steward-013-full-01.raw.txt)：81 files / 462 tests，461通过、1个旧future-schema测试失败（仍把12当未来）；已用13修复并在恢复组运行该文件通过。失败时测试异常创建未关闭DB导致其 Temp 清理 EPERM；该失败诚实保留，不当作当前绿色全量。
- [最终静态](steward-013-trusted-final-static.json)：node/web TypeScript、35文件lint/format全部exit0；git diff --check通过。此后manifest只读取hash，没有产品改动。

## 直接交接与边界

root 对冻结候选做独立复核、真实服务合成角色、最终 build/Electron及必要全套结算。UI 自己的 manifest/测试由 UI 执行者提供。可用根服务的 `steward.configure` 先配置 role=assistant 识别（源history read/recipient必要），再 role=steward 配独立模型/预算/选定assistantIds、global读写接收。两种配置默认关闭；grantSelectedRecipient只授选定接收，不打开 read/write/inference 能力。无Key时已保存本地候选仍能在既有权限与相同身份下恢复；任何新的发送仍要求Key。

本执行者实际 Provider/live 请求为0；Key未持有、未读个人数据。真实用户角色/冲突效果、双PID、PACKAGED及发布不是本报告已验范围。后续013观察/日常角色、009/012/014联测及总体交付仍必须继续；RET/REM/额外AST不擅定。

# 009 trusted manual-core candidate

日期：2026-09-06。实现者：retention_009_trusted，gpt-6-astra medium。这是实现交付，不是独立 FINAL PASS，也不是 TASK_DONE / PROGRAM_DONE。

基线：当前 docs checkpoint c000b7d9739589909a80ed8aac1d2b64a569a3bb 加 009 工作区；008 已审产品基线 cc9c729cd5b65597049f988c41e3def97fcb0515。未 commit / push。

## 实现与审核入口

- 新增严格 retention overview/move/preview/confirm/jobs/retry IPC；原六 assistant channels 不变。preload 仅纯通道常量运行时导入，窗口主 frame 身份在 main 校验。
- schema 7 增量事务、epoch/generation、精确预览及抑制优先作业、无正文幂等 command、assistant tombstone、原文垃圾、精确 retained source edges。
- 手动三区 CAS、完整影响预览与 nonce 确认、原文回收/恢复依赖门禁、批次文件与 SQL 副本清理、故障可见与重启续作、最后助手删除后的无 active jobs/retry 通路。
- AST 删除 A 的私有 chat/relationship/continuity；global 与 B 已接受私有记忆保留原 scope 和精确旧接收交集。既有 withdrawal 优先，新 endpoint 不因来源助手删除而获得权限。扩大跨助手整轮影响在确认前列明。
- Provider、read models、source DFS、protocol 和迟到 finally 通过持久 generation/tombstone 拒绝复活。正常跨助手 requestId 复用在写入/transport 前拒绝；旧歧义数据保留并阻断清理。
- 文件必须处于受管根、无 junction/symlink，使用预览绑定 hash 与受控 quarantine rename 后复核；不会静默删除已知并发新正文。受管旧 Markdown 与 SQL 中标题、metadata、intent、preview、index、protocol/context/reasoning、tool args/results 均在清单内。
- changed 保守广播全部助手用于全局缓存失效，不表示这些身份均删除；job-status 不重新清 session。UI 无正文未知 command identity 由 root/UI 保留。

核心文件：src/main/retention/retention-service.ts、retention-schema.ts；src/shared/retention-contract.ts；src/main/ipc/register-retention-ipc.ts。精确共享语义见 [contract](retention-009-contract.md)。

## 验证证据

阶段结果必须区分：早期可信 21 files / 160 tests；随后专项 4 files / 19 tests；最终可信全量 23 files / 167 tests（23:48:51，8.32s）通过。最终多出的 oracle 包括目录 junction 拒绝且目标字节保留、52 对象多批次响应；adversarial 共 11 tests 通过。

专项覆盖：三助手 shared 与 B-private 保留、原 endpoint 交集、混合 withdrawal；三区/恢复；真实依赖缺失与合成已接受分支；完整协议/命令/预览/旧版本 marker 副本清理；无 active 重启；旧请求歧义；真实 Provider 零 transport 与 saveTemporary 零半轮；模型仅准备卡；before-unlink 外改保留、after-quarantine 中断重启；strict IPC；迁移事务失败原样回滚。

可信 TypeScript、可信 lint、可信 Prettier 均通过；npm ls --all exit 0（可选 peer 未安装保持原状态，无新增依赖）。构建及真实 Electron 两进程通过：runId 7b5902b1-359f-4c97-bc8e-51651d164ee1，PID 25312 / 108744，Electron 44.1.1 / Node 24.19.0 / SQLite 3.53.3。新增第 3 个合成助手的 continuity 在 staging/trash/persistent 往返至 v4，明确预览 purge 后清理完成，第二 PID 保持 tombstone 与 COMPLETED job；008 原生命周期、来源、工具闭合上下文及零恢复外发仍通过。所有 Provider 调用为内置合成 transport。

日志：test-results/retention-009-trusted-tests.log；test-results/electron-f1.json。截图：test-results/retention-ui.png，已查看且中文主标题/计量/三区可见。截图只来自本应用合成 BrowserWindow，未抓桌面。上述 ignored evidence 可由 root 选择脱敏归档。

整工作区曾运行全量 35 files / 221 tests，其中 220 pass、1 fail，唯一为 UI 改为 retention 路由后旧 MemoryPanel 删除卡测试，已交 UI 修复。全量 web TypeScript / lint / format 的并行 UI 问题也已回传，不以可信通过代称全量已通过。root 应在 UI 收束后完成最终整工作区验证、foundation/secret/generated/residual scans、独立 reviewer。

## 明确保留的未完成范围

RET-007 自动容量/期限/自动清空参数未获用户答复；实现 UNCONFIGURED，不擅定 100 MiB/90 天，不自动迁移/清空。Q9 真正章节/摘要/unfinished 接受结果尚未接入；生产 recycle-original 明确阻断，合成 adapter 成功合同不代替真实 Q9 联测。010 items/proposals 尚无真实表，仅留窄钩子，不声称正式事项/提案端到端已验。AST A 私有 user/event 的额外删除范围待答，当前 purge 明确 blocker，不擅删。

仅交付 MANUAL_CORE 候选与安全依赖缺失拒绝。SQLite 残页/WAL、备份与外部副本不承诺安全擦除；未来备份恢复联测仍须遵守后续 withdrawal。Windows 安装/更新/发布总任务仍由 root 继续。

## 写权限交回

src/main/**、src/shared/**、src/preload/**、tests/unit/**、tests/integration/**、scripts/electron-f1-harness.mjs 的单写权限在本报告交付后释放。未改 renderer、AGENTS、skills、全局任务文档、依赖或 Git 历史。已有文件均 exact preimage/SHA + File.Replace 原子替换与后验 hash；默认 helper setup-refresh 失败发生于目标执行前，经授权 require_escalated 路线完成。无 ACL/reset/force/个人数据读取。

## 最新双 PID 与精确字节边界

最终再次构建/双 PID：bd620d6b-35af-4150-8534-9aa75c759dae；PID 113640 / 112668；源码清单捕获时间 2026-09-06T15:51:46.1539071Z。退出 0，009 与原 008 全部 harness 断言通过。构建后复查非 renderer 源码与清单差异 0；后续 UI digest 等改动不属于本次字节证据，需要 root 最终相称复验。前述 7b5902b1 是前次阶段证据。

可跟踪原始证据：[build preimage](retention-009-build-preimage.json)、[Electron evidence](retention-009-electron-evidence.json)、[trusted tests](retention-009-trusted-tests.log)、[Electron log](retention-009-electron.log)。清单含当时 renderer SHA，但不声称其未来改动已验证。

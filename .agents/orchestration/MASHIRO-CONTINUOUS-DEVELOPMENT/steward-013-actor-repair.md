# 013 章节记忆详情 actor 窄修

2026-09-07；steward_013_trusted；按 root 临时五文件写锁执行。仓储员主体仍未开始写入，不代表仓储员或 013 完成。

实际后台创建把 `actor=background` 写入 memory_commands，但共享 Memory inspect DTO 仅接受 user/assistant，真实 IPC 因此拒绝整个详情；界面旧分支也把后台显示为助手。修复仅增加既有 background 枚举、对应静态类型与“后台整理”标签，没有添加新执行权限、steward actor 或新 schema。

先增加两个可甄别回归：真实章节接受后把 MemoryService.inspect 结果通过 memoryInspectResultSchema；MemoryPanel 打开默认折叠来源面板后核查执行者标签。旧产品两项均失败，分别为 changes[0].actor 的 Zod invalid_value 和标签缺失，见 [RED](steward-013-actor-red.raw.txt)。修复后受影响整组为 2 files / 27 tests 通过，见 [GREEN](steward-013-actor-green.raw.txt)。node/web TypeScript、五文件 lint/format、git diff --check 均通过；测试最后仅作 Prettier 长行展开。

写入路线：apply_patch Update 在读取前遭 helper setup-refresh 错误；重新核验 background-service.test.ts 原 SHA 未变，改用已授权 require_escalated PowerShell writer，固定五文件 allowlist、观测 prehash、每项唯一 exact match、同目录 temp/显式 backup、File.Replace、posthash、失败回滚及残余清理。没有绕过自动审批拒绝，没有 commit/push/Provider 调用。

冻结 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| src/shared/memory-contract.ts | C1AA68CC602C944F3FCE12D61F4034B33212033B0292C73DF5A2E1D7E60FAD4F |
| src/main/memory/memory-service.ts | 6C686672ABFC294EDB43F17390FDD41B0E05B8552D749E138179B70C3F131562 |
| src/renderer/src/features/memory/MemoryPanel.tsx | D93785318485FC67B638BE66F41CDE5F51D8E6F761A687328F3F5FA30F5849A5 |
| tests/integration/background-service.test.ts | D473DF8E452B85FE00BA28DB60AEFF13913B0D72D0F8F8CF0A523F68ACFCA274 |
| tests/renderer/MemoryPanel.test.tsx | 6F59324960AA256E2E3A9F078A8EA1CC742D6AF22CC01562C5B561FC09D8B194 |
| RED raw | 6152673476EA7CED514FA38A71561790F3032C27D7804ECDAFC7B9403CBDE5E9 |
| GREEN raw | 81F92674F7900B2F90ECE7ABD9B6FAB673865E8C4EFB0AF0EC3F14C3F94E1246 |

独立审核由 root 协调；本报告不自判 PASS。仓储员原合同接续等待 root 完成章节提交并释放完整可信范围写锁。

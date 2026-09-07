# 014 还原及正式main接入候选（未独立PASS）

2026-09-07，root单写；此前main单写者steward_013_trusted明确释放该文件。

- 新production-restore将经过verifyProductionBackup校验的完整authority复制到用户明确指定的新空目录，持有源与目标真实租约；不覆盖当前数据、不自动切换locator。复制中保留snapshot标记，完整文件清单/哈希核验后才去除标记。源快照保留；中断或失败副本不可正常选择。后续可信用户入口必须明确旧快照时间与回退影响，不能隐式复活旧删除。
- production-backup原assertProductionDataMatchesBackup提取无行为变更的文件清单校验函数，供还原在标记尚存在时使用。这是九文件PASS之后的新差异，需要新的比例独立审核。
- delivery-014-restore-tests-01.json：恢复4项及原备份9项共13通过；可信tsc及限定lint通过。未包含原生还原入口或实际制品。
- main/index生产态先准备独立Chromium运行路径，ready后原生选择数据、持有session再开业务服务；正常退出先关闭存储再等待session.release。正式生产profile不使用开发/E2E环境入口。占用权丢失不得因存储关闭异常而留下继续运行的进程。
- data-root类型新增production，原开发解析器仍拒绝直接处理packaged；生产路径只经已审协调器。可信tsc通过，原生实际生命周期尚未重跑。

仍需：可信备份/还原/搬迁用户入口、还原和失败恢复说明、实际生命周期与制品独立复核、整体覆盖和发行。PROGRAM ACTIVE。

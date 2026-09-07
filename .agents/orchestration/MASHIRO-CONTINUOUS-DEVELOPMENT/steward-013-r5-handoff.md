# 013 R5 完整性修复冻结

作者复用 steward_013_trusted（Astra / medium）。新 [40 文件 manifest-v3](steward-013-trusted-manifest-v3.json) SHA-256 `BA8FB56B65E4B79CC504A254A163B16CF343E54FDCB48E7773EC9370A51C5BF4`，替代 R3/R4 的 v2；schema 仍 13、DTO 不变。

独立 R5 发现 active 成员 Markdown 损坏后返回空且完整分支。修复三个可信文件：Memory 先排除版本过时/非 active/trash，再区分可见接受正文的 INTEGRITY；organization 只允许明确治理隐藏的成员跳过，其他读取故障向上传播；Steward 公开返回 STORAGE_UNAVAILABLE 及“已接受正文缺失或与接受版本不一致，已停止读取和导出”的说明。当前合法成员缺失/损坏不能冒称空且完整；用户纠正形成新版本后，旧成员仍可正常隐藏。

[比例回归](steward-013-r5-focused.json) 6 文件 / 29 tests GREEN，含原文未改的 root R3/R4/R5、作者文件缺失/损坏与旧版本治理、来源治理以及 Memory 全文件。node typecheck、限定 lint、40 文件 format check 均 0，退出码写入 manifest。没有重复全量/真实付费/Electron；root 执行最终独立与原生验证。作者不宣称独立 PASS，也不提交或推送。

先前 R3/R4 的 [交接](steward-013-r34-handoff.md) 和真实失败记录保留；后续 [观察与日常规划](background-013-daily-observation-contract.md) 是单独新增文档，不属于该产品候选。PROGRAM ACTIVE。

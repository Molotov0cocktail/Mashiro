# 013 trusted R3/R4 修复冻结

作者：复用 steward_013_trusted（Astra / medium）；作者验证不构成独立 PASS。PROGRAM ACTIVE。

- [39 文件 manifest-v2](steward-013-trusted-manifest-v2.json) SHA-256 `327BDD08B500682A2322F4BA8E2A55BC48A24BCDEA461AA894B32EF94E57D3D6`，替代原 35 文件可信 manifest；未改 renderer 或全局入口，未提交/推送/付费。
- R3：公开冲突读取以已解决的当前 resolution 版本作为权威，左右旧版本保留历史引用；后续用户纠正、已确认删除/撤回使其 STALE/null，重启不恢复旧解决引用。
- R4：schema 12→13 为 memory_branches 增持久 governance_digest；相关成员、依赖 DAG、接受版本、抑制/回收、权限变化时，同条 SQL 原子递增公开版本并存摘要。查询和每秒后台检查刷新，真实 changed 事件通知界面。无关新增记忆不参与摘要，同状态重启令牌不变。完整导出旧 expectedVersion 返回 STALE_WRITE。
- 两个 root 独立反例原文未改；[比例回归](steward-013-r34-green-03.json) 7 文件 / 20 tests GREEN（含旧真实 v8 升级 / 未来 14 拒绝与 v12 分支迁移）；[全部可信仓储回归](steward-013-r34-trusted-green.json) 15 文件 / 49 tests GREEN。
- node typecheck、限定 lint 均 0；39 文件 format check 0。[跨域记录](steward-013-r34-static.json) 保留当时 web typecheck 因 root 新 renderer fixture 类型报错退出 2；[仓储全域套件](steward-013-r34-steward-suite.json) 61 tests / 60 GREEN / 1 RED，唯一失败为新 renderer 迟到正文回写反例，已交 root/UI 独立修复，不能宣称全绿。
- [首次作者测试](steward-013-r3-repair-tests.json) 保留删除/撤回未实际确认时的测试失败；随后补实际确认再断言，无产品断言弱化。第二轮旧迁移目标仍写 12 的失败保留于 [green-02 实际失败记录](steward-013-r34-green-02.json)，只更新升级目标到 13，v8 输入不变。
- 未重跑 live/Electron；root 已报告实际 3 HTTP 200 / 1361 tokens 与前置两 PID，R3/R4 后的原生令牌失效/恢复证据由 root 补充。可信修改冻结后仍需独立比例复核，非 TASK_DONE 或 PROGRAM_DONE。

边界：后台持久摘要检查每秒一次；每次 branch/query 同步检查，不靠定时器保护分页。摘要包含全局权限表，相关权限以外的权限变化也可能保守使令牌失效；普通新记忆不误失效。治理摘要不持久化正文，源正文只参与进程内哈希。无自动回收或未答 REM/RET/extraAST 决策。

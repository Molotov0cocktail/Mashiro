# 最终分页测试超时诊断与比例修复

结论：性能/默认 5 秒超时问题，分页及版本断言没有失效。root 授权后只修改 `src/main/background/steward-branch-guard.ts`，不改测试超时、分页/权限/版本 oracle 或全局入口。

最终 full-03 原分页用例耗时 5171.1576ms，仅报 STACK_TRACE_ERROR；[原样单独重现](steward-013-boundaries-final-isolated-01.json) 同样失败。Vitest runner 的注册堆栈复用了 STACK_TRACE_ERROR，不能把该文字当业务错误代码。允许 15 秒的纯诊断运行使原始完整分页/变更令牌断言通过；该参数从未用于最终门禁或提交测试。

根因：103 个实际接受成员逐项链接时，branch() 每次重新计算全部已链接成员的治理 DAG，节点内相同 SQL 反复 prepare。临时包装只计时原函数，不改其结果；[修复前 profile](steward-013-boundaries-final-profile-before.json) 为 109 次扫描累计 1999.9582ms、最大 356.6120ms。[修复后 profile](steward-013-boundaries-final-profile-after.json) 相同 109 次累计 818.7418ms、最大 113.5444ms，累计降低约 59%。修复后 profile 本身也使用默认 5000ms；文件注释明确修正了包装器沿用的诊断超时描述。

机制：每次 digest 内创建仅存 prepared Statement 的 Map，以 SQL 字符串为键；13 处调用保持原 SQL、参数、all/get 与顺序。没有缓存行、来源、权限、摘要或接受版本；每次 branch/query 仍实时验证同一完整依赖。Map 生命周期只是一轮 digest，自己的结果不触发额外治理语义。没有跳过检查、扩大权限或增设后台缓存失效间隔。

精确文件身份：

- 修改前 `B95FCEE01F592BEA8DE85606A6A0FB3723B52EA481D91D82CBADA99CAB0780FD`。
- 修改后 `BC5F3D1B49F32684465E9590B31E4C71E41609A71F9C0D00C7E3A084E2342FFE`。
- [精确 diff](steward-013-boundaries-final-exact.diff)；反向重建的 [旧字节](steward-013-boundaries-final-before.ts.txt) 经上述修改前 SHA 核对完全一致，非凭肉眼编造补丁。

[最终默认门禁](steward-013-boundaries-final-green-04.json)：8 文件 / 20 tests GREEN，未改原 boundaries 文件，涵盖 103 成员完整分页、旧组织令牌拒绝、R1/R2权限范围、R3解决版本、R4成员治理、R5完整性，以及纠正/已确认删除/撤回/来源回收/权限变化。原分页耗时 3659.4937ms；没有调高默认超时。该定向运行使用项目原配置，未改 workers。

[静态记录](steward-013-boundaries-final-static.json)：node typecheck、限定 ESLint、Prettier、git diff check 均 0。没有重复全量/真实 Provider/Electron；最终全量和独立比例审查由 root 完成。40 文件旧 manifest 的本文件哈希需由 root 更新后再提交。

临时 profile 测试已归档为 [文本](steward-013-boundaries-final-profile-source.txt) 并精确移出测试树，[清理记录](steward-013-boundaries-final-cleanup.json) 含其原哈希。没有残留可执行 writer。作者验证不是独立 PASS；当前产品再次冻结，daily 实施仍等待 root 提交并释放写锁。

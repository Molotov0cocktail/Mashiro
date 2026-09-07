# 013 仓储员 UI 候选交接 v3

2026-09-07；`steward_013_ui`，实际 `gpt-5.6-sol / high`；Execute/Repair。产品基线 `95db9cfa93673ff6975ddb75ccba56b2d0264828`，工作树 HEAD `01a4d8c68dcad371d1bf6f0779d058e5b2fa39fe`。本文件只交接 renderer 候选，不是 013 独立审核 PASS、PROGRAM_DONE 或发布结论。

## 最终候选

精确 9 文件及 SHA-256 见 [candidate manifest v3](steward-013-ui-candidate-manifest-v3.json)，manifest SHA-256 `0B4FE609568939AB7A13B8F9CEE65F86AE91FB75A694999AF9DDA08A8546FDC3`。v1 交接中的入口、独立配置、权限、预算、pending/job/branch/conflict、分页、稳定命令身份、CAS 草稿和 MemoryPanel actor 行为继续适用。

本轮补齐两个冻结后接缝：

- 作业的“来源与分项回执”默认折叠，分别列出 `providedSources`（提供给模型的来源）与 `citedSources`（模型输出明确引用的来源）。界面明确提示未引用不代表未影响，接受结果会保守保留全部提供来源；可选字段缺省时不改变旧作业夹具。
- snapshot 中分支消失或版本变化时，立即从 renderer 状态清空该分支缓存的 Markdown、成员、冲突和后续 cursor，同时递增读分支与完整导出的版本令牌、退出对应导出并清除外部重载预览。用户已经输入的编辑草稿仍保留原 memory/branch CAS；旧 CAS 不能调用 `memory.mutate`。迟到 branch 回执继续经过 route、serial 和当前 snapshot branch version 校验，不能恢复已撤回正文。

## 验证

[最终验证证据](steward-013-ui-final-validation-v3.json) SHA-256 `F75FFD09F44BEB02703D059F9E494CF363683B85EAA7375C439DA66E77A0A82A`：

- 聚焦 renderer 与 root 独立反例：5 files / 22 tests，通过。
- 完整 `tsconfig.web.json` TypeScript：通过。
- 三个本轮改动文件 scoped ESLint：通过。
- 三个本轮改动文件 scoped Prettier：通过。

原始失败与修复均写入验证证据：不存在的 `typecheck:web` 脚本改用正式 `tsconfig.web.json`；root oracle 初始 Provider fixture 缺方法/泛型时断言已绿但进程有未处理异常，root 只修 fixture 后五文件与全 web TS 均绿；Windows PowerShell 5.1 首次把新增中文按系统代码页解析，两个文件在测试前由哈希匹配备份完整恢复，随后改用 UTF-8 Node 生成内容与 `File.Replace` 成功写入并逐字核对。

本轮受控备份和编辑脚本已按明确路径清理，remaining=0。未运行全项目测试、Electron、真实 Provider、付费调用或用户数据验证；未 commit 或 push。UI 候选以 v3 manifest 为准，交由 root 做真实角色、Electron 与整体候选验收。

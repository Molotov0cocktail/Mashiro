# 007 UI 竞态修复候选

- 角色：Repair Executor，本次实际复用现有 gpt-6-astra / medium；Prompter 创建新 sol 修复 Agent 时遇到 thread limit，改用现有执行者是非阻塞替代。本执行者不担任独立 Reviewer。
- 产品基线：已审 006 `88a86a2dacc616ca3a6fa0ba63a345f059d88859`；本轮未 commit / push。
- 单写范围：ProviderPanel.tsx、ToolExecutionPanel.tsx、tests/renderer/ProviderPanel-tools.test.tsx 与本报告。未修改 shared/main/preload、其他 renderer、007 合同、全局文档及 Reviewer 原始文件。
- 状态：REPAIR CANDIDATE，等待独立复核；本报告不是 PASS。

## 修复

1. 工具全量快照恢复本地已有记录，同时保留本运行已经收到事件的 operation，避免旧空快照擦除已成功回执。处理包括读取在事件之前挂起，以及刷新微任务恰好在事件之后启动的时序。正常快照仍可恢复重启后的记录；未知核查仍只读取指定 requestId。
2. 合并 operation 时按状态进展与 updatedAt 防回退；旧 PREPARED 不能覆盖 SUCCEEDED，也不能以尚未产生引用的空列表清掉后来成功事件的有效引用。
3. 已确认的权限修改立即清缓存引用、更新引用世代并重新读取 trusted tools。旧读取以读取版本失效；旧请求的迟到事件保留操作事实但不能恢复旧引用。普通助手、模式或绑定切换仅重新读取 trusted tools，不冒充权限撤销。
4. 临时清空成功时作废未完成读取、删除该助手临时请求路由及事件保护记录，防止晚到快照或旧事件复活回执。
5. selected 工具标签与说明明确仅检索所选轮次；recent + history 才表述检索本助手完整正常历史。

## 回归与结果

正式工具 UI 测试从 9 项增加至 14 项，所有 renderer 从 34 项增加至 39 项。新增/增强断言覆盖旧空读取、旧准备状态与引用、真实助手往返刷新、撤权后的旧读取和 PREPARED/SUCCEEDED 事件、临时清空后的旧读取/事件、selected 文案，并保留原有归属、恢复与未知核查测试。

修复前新增 empty/prepared 两项均红；同次还暴露原有回执测试的同源竞态（11 项中 3 失败）。新增测试最初两个失败由实际中文标签不匹配引起，修正定位器。独立引用 v2 又揭示普通路由刷新错误增加引用世代；已改为仅权限成功回调改变世代，并纳入正式跨助手回归。

最终执行均 exit 0：

- `node node_modules/vitest/vitest.mjs run tests/renderer`：8 files / 39 tests。
- `node node_modules/typescript/bin/tsc -p tsconfig.web.json --noEmit`。
- 对三个拥有产品/测试文件执行 ESLint（--max-warnings=0）及 Prettier --check。
- `git diff --check`：无差异错误；仅其他全局文档已有 CRLF 提示。
- 原样显式运行 [空快照 oracle 配置](tools-007-review-vitest-v2.config.ts)：1 / 1。
- 原样显式运行 [引用 v2 oracle 配置](tools-007-review-citations-v2.config.ts)：1 / 1。

上述两次原 oracle 执行属于修复者验证，不能替代 fresh 独立复核。原 Reviewer oracle/config 未修改。工具调用没有新增 Provider 网络请求、费用或凭据访问；未重复 trusted core / Electron / build，融合验证由 Prompter 组织。

## 最终文件 SHA-256

| 文件                                                      | SHA-256                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| src/renderer/src/features/provider/ProviderPanel.tsx      | 04451ACB792D1AE630765CE2D04F12C9BA520AAD22336C4408B91A79B5806865 |
| src/renderer/src/features/provider/ToolExecutionPanel.tsx | B715BEE3C146A44DF5ED4F5DD320445FF8A1FE9A5BEF22F157BD991D4C3553E6 |
| tests/renderer/ProviderPanel-tools.test.tsx               | 9425BA57B0A8F1825DC58E1636B4E00E8A6EA75E58E59CCB45D70A75E4401DEF |

程序仍 ACTIVE，007 独立复核与提交关闭后由 Prompter 继续总队列。

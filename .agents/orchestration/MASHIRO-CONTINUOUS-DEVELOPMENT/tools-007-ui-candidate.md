# 007 中文工具 UI 候选执行报告

## 角色与范围

- ROLE：UI Executor。
- TASK：007 Provider 工具执行、协议段与操作身份。
- ROUTE / ATTEMPT：`bounded-glm-tools-v1 / 1`。
- 指派能力：gpt-5.6-sol / high；本角色运行环境没有可独立读取的实际模型元数据，因此不把指派映射冒充平台已验证事实。
- 已审产品 BASELINE：`88a86a2dacc616ca3a6fa0ba63a345f059d88859`。
- 开始/结束时工作树 HEAD：`e73fd7e56c37970579e04fcff618f5f77894d166`（006 closing 与 007 合同文档提交；本角色未提交）。
- 所有权严格限于 `src/renderer/**`、`tests/renderer/**` 与本报告；未修改 shared/main/preload/core tests、依赖或全局文档。

## 修改文件

产品：

- `src/renderer/src/features/provider/ProviderPanel.tsx`
- `src/renderer/src/features/provider/HistoryContextPanel.tsx`
- `src/renderer/src/features/provider/ToolExecutionPanel.tsx`（新增）
- `src/renderer/src/styles.css`

测试：

- `tests/renderer/ProviderPanel-tools.test.tsx`（新增）
- `tests/renderer/provider-api-fixture.ts`（新增）
- `tests/renderer/ProviderPanel-security.test.tsx`
- `tests/renderer/ProviderPanel-history-context.test.tsx`
- `tests/renderer/ProviderPanel-timeline.test.tsx`
- `tests/renderer/ProviderPanel-late-response.test.tsx`
- `tests/renderer/App-provider-sync.test.tsx`

## 实现结果

- 在中文主对话中增加每助手、每 normal/temporary 模式独立保留的工具范围：默认 `off`、仅本机时钟、时钟加按关键词检索本助手完整正常历史。发起请求时始终显式传递冻结后的 `startChat.tools`。
- `context=none` 时禁用历史工具并把既有 history scope 收窄为 clock；recent/selected 仍只控制直接附带的上下文。UI 明确说明 recent + history 工具会按关键词检索本助手完整正常历史，且需要读取和当前实际接收方发送权限，不把近期上下文暗扩为全部历史。
- strict temporary 只显示 off/clock，不显示 history；文案明确不读取正常历史，也不产生可重启协议或 operation 记录。临时清空同时清除该模式 UI 回执。
- 从 trusted `capabilities` 读取实际 endpoint、model、protocol、adapterVersion、mode、toolsAvailable、reason 和九项 evidence；原样区分 `UNVERIFIED / DOCUMENTED / LOCAL_TESTED / LIVE_VERIFIED / FAILED`。能力缺失、读取失败或 `toolsAvailable=false` 时工具保持关闭；没有按模型名推定。
- 从 trusted `tools` 和 `ProviderEvent.operation` 展示 operation。七种 schema 状态分别映射为准备、读取中、已完成、已确认未执行、结果待核查、被取消、权限阻止。回执与助手最后回答分别展示；回答中断、取消或晚到不会抹去已完成回执。
- 每个请求在 renderer 捕获发送时的 assistantId + mode。operation event 还同时核对事件/operation 的 requestId 与 assistantId，迟到事件不会串到当前助手或当前模式。切换助手、模式和绑定时，scope/operation 分别按原归属保留或重新读取。
- `RESULT_UNKNOWN` 的“核查本地状态”只调用 `tools({requestId})`；不调用 `startChat`，不把旧未知改写成隐式重试。
- 历史 citation 显示有界摘录、时间和截断状态；“定位原轮次”只调用 `timeline.query({protocolVersion, assistantId, requestId})`，不混入非空 query/before，并在完整历史面板突出显示原轮次，用户可沿用既有复选框选为上下文。
- 普通关键词搜索命中也新增“定位此搜索结果的完整原轮次”，关闭 006 没有 direct jump 的可用性缺口。
- 历史读取权限变更成功后立即使旧 operation 读取失效并重读 trusted 回执；trusted 剥离 citation 后 UI 保留 operation 成功状态但移除旧引用。
- CONFIGURATION 中文错误增加旧工具轮次处理建议：检查连接与模型，或不附带历史重新发送；不声称可以丢字段重建旧协议段。
- 新必需 `ProviderApi.tools/capabilities` 已补到全部 renderer mock。旧 005/006 测试默认夹具将全部能力标为 UNVERIFIED 且 toolsAvailable=false，避免测试夹具虚构能力。

## 红态 oracle 与修正记录

首次运行：

```text
D:\nodejs\node.exe node_modules/vitest/vitest.mjs run tests/renderer/ProviderPanel-tools.test.tsx
exit 1
1 file / 5 tests：5 failed
```

五项均因旧 UI 不存在能力、scope、operation、citation/unknown 核查入口而失败，形成可辨别红态。

第一轮实现后同一文件为 4 passed / 1 failed。唯一失败是测试用 `/保留式思考.*UNVERIFIED/` 跨越 `<strong>` 与文本节点，DOM 中实际已显示正确内容；只把断言改为定位该 `li` 后检查 `UNVERIFIED`，未放宽产品行为。

随后新增普通搜索 direct jump、迟到 operation 助手/模式归属、权限撤销 citation 剥离，以及七种 operation 状态映射。权限刷新接线首轮暴露两个实现/测试问题：一次 props 解构笔误导致 `onContextIntentChange` 未定义；新增绑定触发的额外本地读取使旧测试固定“2 次调用”的假设失效。修正解构，并改为记录点击前调用数、验证只新增一次 requestId 本地核查。最终新增文件：

```text
1 file / 9 tests：9 passed
```

覆盖：

1. 默认 off、九项能力和 clock 显式发送；
2. recent/none/history 交集及 temporary clock-only；
3. operation 成功独立于 interrupted 最终回答、citation direct jump；
4. 迟到 operation 的 assistant/mode 捕获及 scope 隔离；
5. 冷启动本地 unknown 恢复与 requestId-only 核查，零 startChat；
6. 普通搜索 requestId direct jump，零 query/before 混用；
7. 权限撤销后 citation 剥离、成功状态保留；
8. 七种 operation 状态中文映射；
9. toolsAvailable=false 时诚实禁用及原因展示。

## 最终验证

全部命令在 `D:\Mashiro` 执行：

- `D:\nodejs\node.exe node_modules/vitest/vitest.mjs run tests/renderer`：exit 0，8 files / 34 tests passed。
- `D:\nodejs\npm.cmd run typecheck`：exit 0；node 与 web 两套 TypeScript 检查通过。
- `D:\nodejs\node.exe node_modules/eslint/bin/eslint.js src/renderer tests/renderer`：exit 0。
- `D:\nodejs\node.exe node_modules/prettier/bin/prettier.cjs --check src/renderer tests/renderer`：exit 0，全部 matched。
- `D:\nodejs\npm.cmd run build`：exit 0；main 27 modules、preload 4 modules、renderer 32 modules；renderer JS 641.12 kB，CSS 5.98 kB。
- `git diff --check -- src/renderer tests/renderer`：exit 0。
- owned 范围 sibling `.tmp/.bak` 残留扫描：0。

最终产品文件 SHA-256：

- HistoryContextPanel：`B436E34F8945B5518496C6889C5BCB65506857B01B80D3A26903433D83847B3C`
- ProviderPanel：`92E349FF645AC05E552A7E457E636734388AFE0FC8D533AB2E4B3425554BB8BB`
- ToolExecutionPanel：`B053AAA6EFC3A3097EF75EAD6DF64641293B6395D49E41027B0CCCB9DD2A1AAC`
- styles.css：`2AC32D7706A2D6838448459E24B4BFD1CF1EFB5939136E2E538FF465C424C865`

最终新增测试 SHA-256：

- ProviderPanel-tools：`1A2F4312330F273626B0C688D897102B75BAC9B4CAC670BB347C747A5CA7E872`
- provider-api-fixture：`D53F0E6C868B16F70C530160E0B772B135D3804CCCD0810477B0EBDD9AF35C09`

## 工具路线与失败

- 初次 shell helper 在读取前以 `helper_unknown_error: setup refresh had errors` 失败；经批准使用宿主 PowerShell 继续。
- `apply_patch` 成功创建首个新测试/组件后，在更新 HistoryContextPanel 读取前发生同类 sandbox helper 失败；目标 preimage 未变化。之后按技能要求固定 target allowlist、preimage SHA-256、精确匹配次数、同目录 create-new temp、内容寻址 backup、原子 rename、postimage 校验与 diff 检查。所有 backup/temp 已清理。
- 受控 writer 三次人工 payload 曾带入可见行首 `+`；每次均在测试前由 `rg '^\+'` 检出，按固定 preimage 和精确计数原子移除。最终全范围 `rg '^\+'` 无输出、typecheck/lint/format/build/测试均通过。
- `view_image` 因同一 sandbox helper 初始化故障无法读取 `test-results/provider-ui.png`；宿主只读核验该截图存在，62,780 bytes，SHA-256 `D804FCEFC01FAA3DF800AD4E7067A54BE6568A7212289F77EF4D02639822F19B`。本角色未把未完成的视觉查看写成视觉 PASS。

## 外部动作、凭据与 NOT RUN

- commit / push / remote 查询：本角色 NOT RUN。
- 付费 Provider 调用：本角色 0；未读取、扫描、索取或记录 Key。
- 产品 live 工具链、完整 verify、真实 Electron 两 PID、安装/升级/卸载、Release：本角色 NOT RUN，由主协调/核心/后续独立角色按总合同记录；本报告不转述为本角色证据。
- 本角色不自判 PASS。当前产物是待融合与全新独立 Reviewer 检查的 UI candidate。

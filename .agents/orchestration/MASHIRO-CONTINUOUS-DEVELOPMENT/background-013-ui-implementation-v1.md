# 013 章节后台 UI 实施与验证

- 路线：Execute Feature（renderer 切片）
- 实际执行角色：gpt-5.6-sol / high
- 基线与当前 HEAD：`815e778122a682bfc71cac01ffbda0c718a43788`（本切片未 commit、未 push）
- 候选状态：IMPLEMENTED / REVIEW PENDING；不能据此宣告 013 或 PROGRAM 完成

## 用户行为

- 一级“章节后台”页面按当前助手隔离读取；切换助手、刷新、通知和迟到响应受 route/read/operation 屏障约束。
- 独立选择后台连接与模型，不读取或改写聊天绑定。默认关闭、无连接、无可读范围或无 UTC 日硬预算时不能启用外发。
- 接收授权是保存时一次显式 `grantSelectedRecipient` 动作，界面准确说明授权覆盖本助手历史与私有记忆；连接变化时不会沿用旧授权。章节整理本轮仍只读取已完成正常轮次。
- 硬预算明确为 UTC 自然日调用次数与实际输入字符；Provider token 只作已知用量统计，并单列未知次数。
- 运行中心显示全部作业状态、原因、来源与回执。`cancel`、`retry`、`retry-unknown` 和五次上限严格按 trusted 最终状态矩阵显示；未知控制回执复用同一 `commandId`，不会静默双发。
- 章节正文与原文来源默认收起；只有 `AVAILABLE` 章节可选择，最多 16 个，并携带精确 `expectedVersion` 进入正常对话 `context.kind='chapters'`。不可用章节不可选。
- 未完成话题可按章节/话题版本标记已解决或忽略；冲突提示刷新核对，不自动重复提交。
- `cursor/nextCursor` 支持后台作业和章节的完整分页浏览，按对象版本合并。

## Renderer manifest (SHA-256)

```text
37ce857222919ebc1e3c4195645b5a42998fcfb0089777f78818675426e8714e  src/renderer/src/App.tsx
93c4a04a5a167f6bdf5ac766cd38fffd653ef5862019e9c723ee4b3ed341eee4  src/renderer/src/features/background/BackgroundPanel.tsx
b1024a979348cc6ba50dc4d0fc24fc1f96ec60f82063acb60f051c06f7650edd  src/renderer/src/features/provider/HistoryContextPanel.tsx
7153b5acf640b9bc4e219fc13475c543bfbd173f19fdcbff3192d66f4f7af50a  src/renderer/src/features/provider/ProviderPanel.tsx
116c4155a569b8d9bb744383dace13ec5516418ea0a647d03f8a56ee05fcae3c  src/renderer/src/styles.css
9b4b26ad499ce50cdefb9cfa7907fa516dae60daf1e2f6ddd88b269251b0391b  tests/renderer/App-background.test.tsx
9e600ef21e80e7990f65a66a9e05b242218fd585fe4ff30c88bcce78e051ae52  tests/renderer/BackgroundPanel.test.tsx
f0061e7c656ea1df02ff8c5dafcdb44d80bc5fdf8a8f7cc5d65b46c71e3e7b42  tests/renderer/ProviderPanel-chapters.test.tsx
cd6157e482f1caee096678323996f236fe97e31e40b418f047cccd9ce7e3cb4f  tests/renderer/background-api-fixture.ts
```

## Verification

- Focused final: `vitest run tests/renderer/BackgroundPanel.test.tsx tests/renderer/ProviderPanel-chapters.test.tsx tests/renderer/App-background.test.tsx` → 3 files / 7 tests PASS.
- Full renderer regression before the final state-matrix-only repair: `vitest run tests/renderer` → 25 files / 112 tests PASS. The final state matrix is directly covered by the focused 7-test run.
- `npm run typecheck` PASS.
- `npm run lint` PASS, zero warnings.
- exact-file `prettier --check` PASS.
- final `npm run build` PASS: main 63 modules, preload 9 modules, renderer 134 modules. Rollup emitted only the existing Zod comment-placement warnings.
- `git diff --check -- src/renderer tests/renderer` PASS before evidence creation.
- No Provider call was made by this UI executor. Root/trusted separately archived the already completed real chapter flow and asked that it not be repeated.

## Oracle coverage

- Real user actions configure independent receiver/model/read scope/budget/grant and prove no `bindAssistant` call.
- An unknown control reply followed by user retry reuses the same command identity and selects `retry-unknown` only for `REMOTE_UNKNOWN`.
- Cancelled, stale and five-attempt jobs expose only trusted-supported controls.
- Body/source disclosure is lazy and collapsed; unavailable chapters are rejected from selection; chapter/topic calls carry current versions; pagination retains earlier records.
- A delayed assistant-A query cannot overwrite assistant-B state.
- App navigation selects a chapter and the resulting Provider request contains only the explicit chapter id/version context.

## Known boundary

This is the first coherent 013 chapter increment. Steward aggregation/conflict handling, observations, daily background roles and their UI remain required in later 013 increments. Independent review, final Electron evidence and root-managed task/progress updates remain outside this executor's single-writer scope.

## Tooling route

The Windows sandbox patch helper repeatedly failed during updates before reading the target. Each affected tracked file was changed through the orchestration skill's guarded content-addressed route: fixed target allowlist, SHA-256 preimage, exact single-match replacements, same-directory temp file, atomic replacement, postimage hash and diff review. All executor-created temporary backups were removed after verification.

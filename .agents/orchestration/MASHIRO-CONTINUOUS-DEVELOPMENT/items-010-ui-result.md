# Items 010 UI result

日期：2026-09-07  
执行范围：仅 `src/renderer/**`、`tests/renderer/**`；未操作 Git。

## 结果

- 新增真实“事项”入口：正式事项/待确认提案分区、筛选分页、五类事项自然中文状态、创建、详情编辑、状态流转、父/相关事项、来源与治理记录、正式计数边界。
- 事项期限使用完整 ISO 偏移时间与 IANA 时区；未改期限时原偏移、秒和毫秒原样提交。
- 读取、写入、提案、实际 Provider 接收四项权限独立展示和保存；实际端点不可用时如实显示。
- 本地用户明确创建、编辑、状态流转、删除和修改提案不继承模型 write/propose 开关；默认 deny 仍保留本地管理入口，Provider 工具继续由可信端按独立权限拒绝。
- 所有事项写操作使用共享的非正文 SHA-256 命令注册表。回执未知后再次点击先查 `operation`，仅 `CONFIRMED_NOT_APPLIED` 才以原命令重发；助手切换/组件重建后仍能找回对应身份。
- 助手或治理世代变化会清空正文、详情、草稿、回执和预览缓存，并拒绝迟到回调恢复旧正文；未知命令身份保留为对应助手的可核查操作。
- 删除与移除已有关联均走可信预览/本机确认。关联移除展示原父/相关事项与替换后的精确差异，新增关联仍使用普通更新。
- 丢失的待确认预览使用原 `commandId` 调用 `preview(action: 'recover')`，恢复可信服务保存的原 manifest，不创建新命令或确认令牌；Provider 工具回执可把该命令带到事项页恢复。
- 提案协商先按助手状态版本切回发起助手；归档发起助手使用 `restoreArchived: true` 显式恢复。只有 discuss 成功回执的新版本才进入正常对话并作为 `itemContext`。
- 非协商提案回执仅在当前治理世代仍可呈现时释放命令，迟到成功保留原身份以供核查；discuss 由 App 在切换完成并建立可见事项上下文后释放。手动核查若返回 PENDING_CONFIRMATION，会保留身份并恢复原可信 manifest。
- Provider 提供 `items` 与 `items-memory` 范围，事项权限与记忆/历史权限独立；严格临时模式降为本机时钟。事项工具回执独立展示并可打开事项页。
- 清理确认页列出正式事项保留 ID/版本，以及提案永久删除或保留 ID/版本，不展示来源正文。

## 文件清单

- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `src/renderer/src/features/items/ItemPanel.tsx`
- `src/renderer/src/features/provider/ProviderPanel.tsx`
- `src/renderer/src/features/provider/ToolExecutionPanel.tsx`
- `src/renderer/src/features/retention/RetentionPanel.tsx`
- `tests/renderer/item-api-fixture.ts`
- `tests/renderer/ItemPanel.test.tsx`
- `tests/renderer/App-items-sync.test.tsx`
- `tests/renderer/RetentionPanel.test.tsx`
- `tests/renderer/ProviderPanel-tools.test.tsx`

## 验证

- `npm exec vitest run tests/renderer`：17 files / 84 tests PASS。
- 新增/扩展聚焦验证：稳定未知命令、治理清理迟到回执、非协商提案迟到成功、本地管理与模型 deny 分离、手动核查恢复原预览、正式/提案计数、陈旧版本、关联移除确认、期限精度、归档原助手协商顺序、清理事项影响。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- 所有上述 renderer 与 renderer-test 文件的 Prettier check：PASS。
- 此前可信并写文件的格式观察已由 trusted 修复；本轮只验证 renderer owned 文件。共享 build/Electron 由 trusted/root 串行执行。
## Reviewer 补充闭环

- 正式事项卡片和详情可由当前助手直接进入正常对话；`startChat.itemContext` 携带原事项 ID 与精确版本，不切换到来源助手。成功回执更新同一上下文版本；读取或端点接收权限撤回会清除缓存上下文。
- `prepare_item_update` 回执以原 `commandId` 打开 `replace-content` 确认。“事项修改确认”逐项显示类型、标题、说明、状态、期限、时区、父项、关联和相关对象的实际旧值与新值。混合内容与解除关联同样完整显示；取消仅提交 `accept: false`。
- 本轮额外修改 `tests/renderer/ProviderPanel-tools.test.tsx`；聚焦 `ItemPanel`、`App-items-sync`、`ProviderPanel-tools` 为 3 files / 31 tests PASS。
- 一次并行全 renderer 运行中，既有 unknown-operation 测试被自动全量读取覆盖最后调用而失败；该文件随后单独 17/17 PASS，全 renderer 稳定复跑 17/84 PASS。typecheck、lint、本轮 8 个 renderer/test 文件 Prettier 均 PASS。
- 本轮未运行共享 build 或 Electron；由 trusted/root 串行执行。

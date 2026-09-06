# 010 可信候选作者交付

状态：READY_FOR_INDEPENDENT_REVIEW；作者验证不是独立 PASS。PROGRAM 仍 ACTIVE。

产品参照为 root 提供的已审 `d6cd1fa4a27ccb418ffc3ff04503366acb133e2e`；作者未执行 Git、发布或付费调用。精确冻结内容见 [41 文件 SHA-256 manifest](items-010-trusted-manifest.json)。renderer 由 UI 作者及 root 独立 oracle 负责，不计入此 manifest。

## 实际行为

- schema 8 为新增事项域迁移；已有已提交迁移未重写。五类正式事项、版本、关联、独立提案、来源边、命令回执、确认计划、权限与防复活标识均持久化。旧版本迁移碰撞/回滚 fixture 已更新并验证。
- 严格 DTO 与 9 个窄事项 channel；原 6 个 assistant channel 不变。preload 仍只运行 Electron/无 Zod channel 常量，renderer 保持 sandbox、contextIsolation、无 nodeIntegration。
- 完整当前用户指令由可信识别器授权，模型 explicit 字段或自造 intentId 不授权。明确创建、状态、标题、选中接受会实际提交，再从持久工具回执续答。
- 明确删除/解除全部关联只产生 PENDING_CONFIRMATION；对话结束后可通过现有 preview 的严格 `action: recover` 分支恢复原范围，用户本机确认才提交。相同 commandId 复用同确认编号；不同意图、挪作普通 mutation 均拒绝。确认计划关闭后清正文。
- 预览摘要绑定事项/关联、来源、助手治理、Provider/历史/记忆/事项授权与清理状态，排除纯协议回执及本轮文本完成。来源撤回、目标删除、新关联、权限变化、另一助手治理均使旧预览失效；不把已失效预览重新授权。
- 推测只建提案，接受前正式统计为零增量。同 ID 协商、拒绝、暂缓、恢复、接受；接受事务只产生一个 originProposalId 对应正式对象。原助手归档后仅显式 restoreArchived 才可同事务恢复并切换，不增加助手 channel；墓碑始终拒绝恢复。
- Provider scope 为 items / items-memory；临时会话无事项持久化。工具候选 counterpart 的 null/缺省被窄规范为空字符串，其余类型与 DTO 仍严格。
- 提案 evidence 必须逐字引用完整原文分句，允许连续跨分句；规范化证据身份不依赖新的 requestId 或模型标题。无依据的主题 UUID 不能作为关联事项。明确未提交的业务校验错误以 CONFIRMED_NOT_APPLIED 工具结果交模型修正；存储不确定仍保留未知结果，不误报未执行。
- 来源为有界 item/proposal/memory/round 等真实域传播，不把事项伪装成 memory 祖先。模型父项/关联项必须存在且当前可读可接收。旧回执外发继续受来源/权限约束。
- 009 清理同事务接入：永久删除原助手时删除其所有未接受提案，不转交，不连带其他助手提案；清正文/旧协议可展开副本，必要无正文墓碑阻止迟到重建。已形成正式事项按已批准保留策略保留，精确旧接收者来源例外不扩到新端点，撤权优先。

## 作者验证与失败路线

- 最新全部测试：50 files / 292 tests，exit 0。[原始输出](items-010-trusted-final-tests.log)
- 最新可信组：33 files / 212 tests，exit 0。之前整组原始输出仍留在 [旧可信日志](items-010-trusted-tests-01.log)，其计数不冒充最终计数。
- 最终 typecheck、lint、format:check、build 均 exit 0。npm ls --depth=0 精确依赖树通过；foundation 校验 errors/warnings 均空。manifest 附有限域 secret/generated/residual 扫描，无匹配，六助手 channel 检查为 6。
- 最终两 PID Electron：122888 / 117380；Electron 44.1.1、Node 24.19.0、SQLite 3.53.3；恢复 0 次 transport、明确发送 1 次合成 transport。[完整合成证据](items-010-trusted-electron.json)、[事项 DOM 截图](items-010-trusted-ui.png)。截图已捕获；本工具 view_image 的 sandbox helper 失败，未据此声称人工视觉审核。
- Electron 核验五类事项/命令重启一致、DOM 创建第六正式事项/单回执，以及既有助手、Provider、历史、记忆、009 三域清理。首次只有 execute FAILED；新增固定阶段诊断定位 items-ui、再定位 items-ui-button；最终发现 UI 将模型 write deny 错用于本地按钮，由 UI 作者修复并补测后通过。未通过开启模型权限来规避此缺陷。
- 新预览反例先 RED：operation 错报 NOT_APPLIED；修复稳定预览身份后 GREEN。自然删除反例先 RED：没有 PENDING；接线后发现 global retentionEpoch 被本轮正常完成递增导致立即 STALE，改为业务/权限/清理摘要后 GREEN。自然解绑与五类失效矩阵均 GREEN。
- Provider 实际失败的合成回归包含 search+clock → 无效 relation 提案 → 修正提案 → 最终回答，4 次 transport 闭合，0 正式/1 提案。未扩大已有有界回合上限。真实 Provider 结果由 root 负责，见 [root 实际角色报告](items-010-live-product.md)，不重复同链计费。

## 边界与交接

此为 010 候选，不是程序结束、独立审核完成或发布完成。自然指令识别为明确有限语法；不确定/不完整语句不得猜测成正式写入。没有在此任务实现提醒后台调度、安装更新卸载或实际发布。

全局文档、009 RET 和其他用户门禁由 root 继续管理。候选冻结后不再改 renderer 或产品文件；独立 Reviewer 的具体修复意见另行接续。两份未审 distribution-notices 工作未动。

## 一次性 helper 清理清单（交 root，非候选源码）

以下均为本作者生成的已执行编辑/诊断 helper，可逐文件清理；有效 manifest、日志、报告、PNG、live 原始 run、live-product.mjs、sse-observer.mjs 和 candidate-audit.mjs 不在此清单。

```text
items-010-bulk-fix.mjs
items-010-closure-edits.mjs
items-010-counterpart-edits.mjs
items-010-counterpart-typefix.mjs
items-010-electron-edits.mjs
items-010-electron-stage.mjs
items-010-electron-ui-diagnostic.mjs
items-010-error-classification.mjs
items-010-evidence-repair.mjs
items-010-extra-oracles.mjs
items-010-fix-01.mjs
items-010-fixture-fix.mjs
items-010-format.mjs
items-010-guard-oracles.mjs
items-010-guards-edits.mjs
items-010-last-format.mjs
items-010-legacy-edits.mjs
items-010-memory-edits.mjs
items-010-natural-accept-edits.mjs
items-010-natural-preview-fix.mjs
items-010-natural-preview-red.mjs
items-010-oracle-type-edit.mjs
items-010-preview-fix.mjs
items-010-preview-guard.mjs
items-010-preview-red.mjs
items-010-provider-edits.mjs
items-010-recover-contract.mjs
items-010-repair-final-edits.mjs
items-010-repair-oracle-edit.mjs
items-010-restore-links-edits.mjs
items-010-retained-edits.mjs
items-010-retention-edits.mjs
items-010-schema-format-diagnostic.mjs
items-010-schema-lf.mjs
items-010-session-guards.mjs
items-010-status-schema-edits.mjs
items-010-tool-edits.mjs
items-010-unlink-oracle.mjs
items-010-wire-edits.mjs
items-010-writer.mjs
```

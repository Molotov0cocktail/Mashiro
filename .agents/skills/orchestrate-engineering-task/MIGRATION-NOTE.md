# v3.1 变更说明

本版只修正工具层恢复策略，不改变 Planner / Executor / Reviewer / Closer 的产品验收分工。

需要替换：

- `SKILL.md`
- `references/modes.md`
- `references/prompter-mode.md`
- `references/role-contracts.md`

`agents/openai.yaml` 无需更改。

核心修正：`apply_patch` 从“事实上的唯一写入通道”改为优先通道；其 helper 失败后，工程链必须尝试内容寻址、定向、可回滚的替代 writer。只有所有安全写入路线均有直接失败证据时，才允许 `PLATFORM_CHECKPOINT`。

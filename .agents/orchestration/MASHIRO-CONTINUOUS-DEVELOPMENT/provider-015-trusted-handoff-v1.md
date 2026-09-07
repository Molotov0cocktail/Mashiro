# 015 可信候选冻结 v1

执行者沿用 Astra / medium。作者自测完成，**等待 root 独立审核，不是独立 PASS，也不是 PROGRAM_DONE**。未提交推送；全局文档、renderer、014 治理恢复由其他单写者负责。

精确 [28 文件 manifest](provider-015-manifest-v1.json) SHA256：`1B3BB6E6ABBA1B060176A001B5D6DF1DD58824646ECD838ECEEC01E09525E673`。产品基线 `8154d0e09fc95014b8d205f8ed70c0028557208e`；manifest 另记录冻结时实际 HEAD（期间 root 的 009 提交不属于此候选）。旧 schema15 installer 目录未修改。

## 实现与边界

- `provider-profile.ts` 仅认可指定官方 DeepSeek URL 和 v4-flash/pro 模型，与旧 GLM profile 分开选择 adapter/mode/请求字段。未知路径不获得工具或厂商扩展。DeepSeek 明确 thinking enabled / low；没有新增任意扩展 IPC。
- 普通 JSON、SSE 与无工具最终回答捕获实际有界 reasoning，区分缺失和真实空字符串。推理不进入 text/onDelta/普通 timeline。DeepSeek tools off 的异常工具调用拒绝；旧 GLM 无工具忽略未知工具 payload 的原行为保留。
- 普通 DeepSeek 轮也保存协议段；重启后切换工具可以合法回传前一普通轮推理。选中轮只提取该轮，不导入段内早前上下文；adapter/endpoint/model/mode、完整轮、工具结果关系和当前权限都核验。tools off 只省略出站副本的推理，不删除本地原字段。缺失旧协议或中断段明确拒绝。
- schema16 对真实 mode CHECK 重建表。迁移前验证精确旧结构、四个治理 trigger、工具 FK 与完整性；FK OFF 仅在事务外、单连接受控重建期间，成功后推进版本，失败 rollback，finally 恢复 FK ON。旧 fixture 先恢复真实旧 CHECK 再反构历史版本，未只改 PRAGMA 冒充。
- 每次出站把 reasoning、工具参数/结果和调用关联字段计入字符预算及 operations 估计，超过界限不截断也不派发。正常结果缺 usage 仍为未知。每次续调用保留即时权限/来源检查，并核连接和绑定版本，迟到改配置阻止后续工具。
- DeepSeek 显式本地事项意图先经过已有真实业务执行器提交，其实际稳定回执以明确本地来源 system 输入模型。没有伪造 assistant reasoning/tool_call；操作公开 `origin: local-user-intent`。模型失败后同 request 重试不重复创建事项。GLM 原链保持。
- 能力公开 `retained-thinking` 模式；官方协议为 DOCUMENTED，本地严格参数为 LOCAL_TESTED。注入 transport 成功不写 LIVE；本地意图回执不作为模型工具能力证据。DeepSeek / Qwen / Kimi **没有真实付费调用或 live 资格**。Qwen/Kimi 仅官方差异分析见 [合同](provider-015-retained-contract.md)。

## 实际验证

- [focused-03](provider-015-focused-03.json)：7 文件 / 91 项全绿，包括 GLM 既有 transport/tool/item、DeepSeek 普通/SSE/跨轮重启、迟到绑定、撤权、真实本地事项失败重试、schema15 populated 迁移和删表后故障 rollback。
- [final-delta-05](provider-015-final-delta-05.json)：2 文件 / 13 项全绿；包含此前 retained 服务回归、新增能力证据不冒充 LIVE，以及局部轮/错误 tool result ID/缺最终 reasoning 的 4 项拒绝回归。
- [旧迁移族首次](provider-015-legacy-family-01.json)：11 文件 / 42 项中 39 绿，3 项 timeline-context 仅 `STACK_TRACE_ERROR`，9.306–11.784 秒。未改 timeout/断言。[原配置单文件复验](provider-015-timeline-recheck-02.json) 19/19 绿，对应三项 4.109 / 1.883 / 2.188 秒。只能说明本次单独复验通过，不能据此断言具体宿主争用根因已被证明。
- [最终静态](provider-015-static-01.json)：node / web TypeScript、28 文件 ESLint、Prettier 均 0。
- 首次 [transport](provider-015-transport-first-01.json) 保留 GLM 行为回归和旧 schema15 期望失败；后续已修。首次实际 migration 测试夹具从 PREPARED 直接跳 SUCCEEDED 被已有状态机拒绝，修为真实 DISPATCHING 后成功；原失败保留在 [migration-actual-01](provider-015-migration-actual-01.json)。不是将该夹具错误描述为产品迁移缺陷。

## 独立复核和剩余验证

请重点复核表重建全部依赖、推理隐藏及完整重放、当前源治理、有限模型路径、自动本地业务与厂商协议分离。现有治理/删除反例沿用共同可信检查，新增 015 反例不是全域治理复核的替代。

本候选尚未全项目最终 Vitest / build / Electron 双 PID / schema15 实装升级验证；应在 root 独立审核候选后统一运行。旧已安装制品的原生证据不代表本次 schema16 已安装通过。无新增真实 Provider 请求，无 Key 或私人正文进入本报告。

所有产品修改已冻结；若需要修复，应生成新 manifest 并说明 supersede 差异，不能继续声称本 v1 精确。

# 015 有限Provider兼容与保留协议

状态：TASK_DONE / FINAL_CANDIDATE_PASS；属于MASHIRO-CONTINUOUS-DEVELOPMENT，PROGRAM ACTIVE。入口仍为[progress](progress.md)，覆盖总表B02/B04/B07，不替代014安装发行工作。

## 必须闭合的行为

三份设计明确DeepSeek/GLM优先及Qwen/Kimi差异审查。007实际GLM非保留工具模式不能冒称DeepSeek兼容。本任务将有限、可信、端点与模型绑定的配置用于传输、协议持久化、重建及能力面板；未知端点仍诚实拒绝未适配工具。

DeepSeek官方Chat Completions当前工具思考协议要求后续请求回传已提供历史中每个assistant消息的reasoning_content，包括没有tool_call的完成消息。保留数据与聊天展示分离，受同一来源依赖、用户选中历史、权限、实际接收方及预算限制。不能从不获准上下文补全协议，不能伪造缺失reasoning，不能静默截断必要段。不能把GLM旧段去reasoning规则沿用到DeepSeek。

有限工程路线：先核现有表是否可表达新adapter/mode，不为内部选择要求用户批准；如确需schema仅加法版本迁移。实际端点/型号由最新官方文档验证后绑定；GLM保持已验行为。Qwen/Kimi按已核官方字段和托管差异作明确能力限制，不泛用厂商参数。其他原生协议仍原始后置。

## 验收

- [x] 精确配置选取、未知厂商拒绝、普通/流式/工具/结构化与能力证据分别表达。
- [x] 保留工具链及跨用户轮完成消息完整回传，重启后身份/协议/来源一致；GLM回归。
- [x] 选择局部历史、撤权/来源删除/换接收方/预算不足时零非法外发，不复活已撤回数据。
- [x] 取消与业务稳定身份、重试副作用不重复，临时模式不新增持久协议。
- [x] 未参与实现的复杂独立审核；实际支持边界说明。不将DOCUMENTED或LOCAL_TESTED写成LIVE_VERIFIED。

核心GLM角色真实资格已有各任务证据，不能要求每家可选高级能力全部真实通过才交付；如本任务某必需资格确需新Key，再具体索取，不搜索私人目录。当前未发起新厂商请求。

## 最新独立结果

root对28文件manifest逐一核对0漂移并完成[源码/本地独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-015-root-independent-review.md)：定向4文件25tests、额外4个边界反例、全量136文件641tests通过，TypeScript/lint/format/build退出0。最终schema16原生run f8198eef、PIDs186136/171612通过，重启0日常调用；先前中文组合状态夹具失败及首修审核遗漏保留，新增8项renderer回归后已关闭。schema15实装升级仍由014验证；无DeepSeek LIVE，不代表014或PROGRAM完成。已批准009增量提交09cd201与当前候选分开。

## 当前执行

2026-09-07，已审基线8154d0e09fc95014b8d205f8ed70c0028557208e双远程同步；schema15内部旧版0.0.9-internal.1安装包已冻结构建。steward_013_trusted实际gpt-6-astra/medium单写015可信协议和schema16，root独立审核；Sol的009删除/UI和root014数据恢复不重叠，必要DDL先协调。

## 当前来源

2026-09-07重新读取[官方思考协议](https://api-docs.deepseek.com/guides/thinking_mode/)及[官方模型表](https://api-docs.deepseek.com/quick_start/pricing/)，当前型号包括deepseek-v4-flash/pro，思考开关thinking.type和reasoning_effort分离。详见[此前差异核查](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-compatibility-source-check-20260907.md)。文档可变，实施时以实查和本地反例为证，不把旧型号白名单文字当资格。

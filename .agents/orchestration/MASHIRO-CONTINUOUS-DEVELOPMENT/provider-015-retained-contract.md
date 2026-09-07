# 015 有限保留协议实施合同

状态：设计冻结候选；未改现有产品，等待 root 完成 013/014 候选提交后释放写锁。执行者沿用 Astra/medium；root 对新行为独立审核。全程序仍 ACTIVE。

## 范围和实查来源

正式入口为 [015](../../../doc/tasks/015-provider-retained-protocol.md)。设计依据是 proposal 的 DeepSeek/GLM 优先、high-level-design §6.1–6.3 及 detailed-design §6.4–6.6：有限可信适配、协议数据与普通正文分离、精确能力证据和权限约束。不是将主机名加入 toolsSupported 后结束。

2026-09-07 本执行者实际重读官方 [DeepSeek thinking](https://api-docs.deepseek.com/guides/thinking_mode/) 和 [模型表](https://api-docs.deepseek.com/quick_start/pricing/)：当前目标 `deepseek-v4-flash` / `deepseek-v4-pro`，thinking.type 与 reasoning_effort 是不同字段；携带 tools 的后续请求必须带回所提供历史的所有 assistant reasoning_content，包括无工具调用的完成消息。不携带 tools 时旧 reasoning 不参与上下文。官方非流式和流式例子都暴露 reasoning_content。

同时重读 [百炼参考](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions) 和 [Moonshot Kimi-K2.5](https://github.com/MoonshotAI/Kimi-K2.5)。百炼的 enable_thinking / preserve_thinking、可用模型和托管区域必须分开，当前页面也包含工作空间专属域名。Kimi 官方 API thinking 参数与第三方 chat_template_kwargs 不能混用。本切片记录明确差异与未适配限制，不把 Qwen/Kimi 托管路径映射成 DeepSeek 协议，也不声称这些高级模式已本地或真实通过。

## 有限可信选择

新增纯可信 profile 模块，由实际规范化 Base URL 和明确模型共同选择。首批为既有 GLM 5.3 Flash profile，以及 DeepSeek 官方 `https://api.deepseek.com`、`https://api.deepseek.com/v1` 下两个 v4 模型。两个 URL 分别保留原接收方指纹，不以厂商品牌等价替代权限。未知端点/模型不发送厂商扩展、不开放未适配工具。Beta strict 端点不自动切换。

Profile 同时决定 adapterVersion、公开 mode、请求扩展键、普通/流式 reasoning 捕获、历史保留规则及分能力证据。DeepSeek 显式 thinking enabled / reasoning_effort low，不依赖易变厂商默认；GLM 原已验请求保持。不开放 renderer 任意 JSON、扩展字段或新宽 IPC。复用现有连接、模型配置和能力入口；新增 mode 枚举须 strict trusted Zod 校验，renderer 只显示能力资料。

## 闭环与持久化

1. 传输层对 DeepSeek 普通及 SSE 响应都捕获有界 reasoning_content，区分未出现与真实空字符串；它不进入 text/onDelta、普通历史、操作回执或日志。未知响应扩展不自动保存。tools off 仍校验不得出现工具调用。
2. DeepSeek 普通完成轮也创建/关闭协议段，从而允许下一轮用户从 tools off 切到 tools on。工具链最后无工具的 assistant 消息同样保留 reasoning；完整调用/结果顺序及稳定业务操作身份沿用 007。缺失必需字段不伪造；不完整/取消/中断段不可作为完成协议重放。临时模式复用无 store 的内存 ledger，退出不留协议。
3. 扩展历史先通过现有完整轮选择、来源治理与实际接收方授权。对每个选中轮只读取该轮片段，绝不导入 segment 中旧上下文。DeepSeek tools on 要求匹配 adapter/mode/endpoint/model 的完整保留段；旧未捕获普通历史、跨厂商段或损坏/中断段明确拒绝，用户可选择不含它的新上下文。tools off 可依据 profile 省略不需回传的 reasoning，但不能删除本地原保留字段。GLM 维持旧轮移除 reasoning、保留工具关系的规则。
4. 所有消息正文、reasoning、tool arguments/results 与必要协议字段计入实际出站预算和用量估计；保留现有链字节上限。超过界限在该次网络调用前失败，不截断必要字段或绕过当前源/目标检查。每次工具续调用都重查取消、权限、源变化和配置版本。
5. 保存普通完成段须与当前轮成功状态一致；错误关闭仅留下不可重放中断状态。业务操作提交、结果未知、重试不重复语义不变；本地 automatic item receipt 不是厂商生成的 reasoning，须在保留模式下有明确合法处理，不能将合成 assistant 空推理冒充真实返回。

## Schema 16 必要性和约束

已实查 schema 5 原表：protocol_segments.mode 有 `CHECK(mode='standard-non-preserved')`，不能只改 adapterVersion。拟 schema 16 将该约束语义扩展到保留模式，旧列/行/ID/状态/工具 FK 全部保留。优先用单事务受控表重建，先在独立内存及真实旧 schema fixture 验证依赖表不丢失、回滚完整、FK 开关恢复、版本只在成功后推进；不修改 writable_schema，不伪造旧版本夹具。不能用伴随表掩盖旧 mode 的错误含义。若安全重建试验不通过，先上报实证调整迁移方法。

生产启动已有隔离副本完整迁移验证和备份后切换；本切片同时更新当前版本期望及旧 fixture 去除新迁移的完整链，保留历史原像。冻结时单列 migration 风险和原生升级复用边界。

## 文件单写范围与交付检查

可信执行者计划单写 `src/main/provider/provider-profile.ts`（新）、保留协议 migration（新）、`chat-completions-transport.ts`、`tool-protocol.ts`、`tool-repository.ts`、`tool-execution.ts`、`provider-service.ts`、必要的 transport result 可信验证位置、`src/shared/tool-contract.ts`、`src/main/data/schema.ts` 及相应 trusted tests/legacy fixtures。若 operations 的 inputCharacters 接缝需修改，只在当前 Provider 调用点计算，不重写运行分类域。能力 UI 若需 mode 中文映射，通知独立 UI writer，不自行写 renderer。root 继续单写全局任务/进度/安装发行；本执行者不提交推送。

比例验证必须包含：GLM 原 oracle；DeepSeek 普通/流式、带工具的最终回答、跨用户轮（包括前轮 tools off）和重启保留；严格临时无 SQLite 协议；必要 reasoning 缺失/超限；选中局部完整轮不带入其他段；撤权/源纠正删除/换接收方/在途修改；业务结果未知不自动重复；schema 15 有真实工具 FK 行的迁移及故障回滚；能力 profile/证据不把 DOCUMENTED/LOCAL_TESTED 升为 LIVE_VERIFIED。未知厂商的 strict/parallel 不以普通文本成功推定。

最终新行为须独立 review；无 DeepSeek Key 的本地模拟通过不能写成 DeepSeek live。本切片不阻止已授权 GLM 核心产品与 014 安装发行工作继续。

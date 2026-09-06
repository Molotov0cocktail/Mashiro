# 007 Provider 工具执行、协议段与操作身份

- TASK = 007；状态 = REVIEW / UI REPAIR；PROGRAM ACTIVE。
- ROUTE_ID = bounded-glm-tools-v1；ATTEMPT = 1。
- Planner = gpt-6-astra / medium；006最终已审产品基线 = `88a86a2dacc616ca3a6fa0ba63a345f059d88859`。其后006 closing/007合同文档差异不改变产品行为；候选审核须从该产品基线解释全部007产品差异。
- 007已进入S0/trusted实施。全局入口由指定记录者维护；本片PASS后继续总队列，不停止程序。

## 权威来源与事实

[progress](progress.md)是唯一续接入口；[总覆盖](program-docs-to-release.md) Q4与B01–B07、C02/C04、G03；[proposal](../proposal.md) §3.2/3.6/4；[high-level-design](../high-level-design.md) §5.4/6/7.3/9；[detailed-design](../detailed-design.md) §6/8/12；[006合同](006-timeline-context-permissions.md)。当前 shared provider/timeline DTO已读，只按依赖使用，未重新审核006。

[合成探针](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-capability-probe-v1.md)与[scripts/provider-capability-probe.mjs](../../scripts/provider-capability-probe.mjs)是协议可行性证据，不是产品PASS。报告提供的SHA-256分别为 `D5B6BBA618FFC8B10B6143829FB92C124C2B191E290149D27F64F2CC9FFF9EAA`、`3AB54FBA190C0F22A46CBE0A4AC772C8069ABE9182C78D5F1D6FE916324F7954`；执行前重新核验，不用摘要覆盖文件变化。固定端点`https://open.bigmodel.cn/api/paas/v4`、模型`GLM-5.3-FLASH`，54片arguments聚合、一次严格无副作用执行、结果回传续答及独立json_object通过。累计4请求，成功三次usage994，首次usage未知；工具reasoning未观测，独立JSON出现reasoning只证明字段出现。

Planner于2026-09-06完整读取官方[流式工具](https://docs.bigmodel.cn/cn/guide/capabilities/stream-tool)、[工具调用](https://docs.bigmodel.cn/cn/guide/capabilities/function-calling)及[思考模式](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode.md)。前两者通过web，第三者web超时后经受审核宿主HTTPS读取完整Markdown。工具碎片需完整聚合后执行，以匹配tool_call_id回传；tool_choice仅auto。标准API默认不保留先前轮次思考，保留式需clear_thinking=false及完整原顺序reasoning；活动交错工具过程仍须返回必要reasoning。未把示例中的eval/任意SQL/文件/API函数引入产品。

模型参数、API全字段以探针已读官方依据为线索；S0必须读取完整当前API与GLM-5.3-FLASH官方页并记录适配参数核对，不能只采搜索摘要。DeepSeek/Qwen/Kimi本片不冒称已支持工具，B07在后续兼容任务继续保留。

## 用户闭环与交付范围

1. 普通中文对话可选择本轮工具范围，看到实际接收端点/模型和可用工具。用户问“现在几点”时模型调用真实本机时钟并续答；问“找一下我们之前关于某主题的讨论”时在用户明确允许的自己历史范围中检索，显示有界摘录与可定位原轮次的引用，再由模型回答。空结果与没有权限分别解释。不是仅新增工具调试面板。
2. 工具状态显示“准备/读取中/已完成/被取消/权限阻止/结果待核查”，由可信执行回执驱动。模型说“已查询”不产生成功记录。即使最终回答中断，已完成工具记录仍可见；恢复不自动付费请求或重新执行操作。
3. 能力面板按实际端点指纹、协议、model、mode、adapterVersion展示DOCUMENTED/LOCAL_TESTED/LIVE_VERIFIED/失败或未验证及证据时间；普通、流式、工具、保留思考、json_object、本地strict、厂商strict、并行和usage分开。工具未支持时可正常纯文本交流，工具入口明确不可用原因；不能用模型名字推定能力。
4. 正常模式持久保存所需协议段和operation记录，和用户聊天、日志分离；临时模式只在有界内存保存时钟工具与协议状态，不读取正常历史，不产生可重启协议/操作快照、提案、记忆、事项、提醒。显式保存临时聊天沿用005/006，只保存受接纳可读消息，不能顺带复制内部协议或授予新权限。
5. 本片交付统一可信执行入口和operation身份/结果恢复底座。记忆Markdown事务、记住/纠正/删除对话闭环、事项创建/提案批准及跨资源恢复分别由Q5/Q6/Q7接入；本片只读工具与故障夹具不能结算B05完整业务副作用验收。章节/仓储/角色JSON实际产品用途与分类总用量/预算仍由Q8/Q9继续，不删除总需求。

## 固定安全与协议决策

### 有限适配

沿用现有原生HTTPS/SSE transport，不引入第二SDK栈或任意模板。新增版本化内置GLM adapter，仅对经规范化匹配的实际端点和明确能力配置启用。固定thinking.enabled、已支持reasoning_effort；tool_stream只在已验证流式工具模式发送，tool_choice=auto。其他任意OpenAI-compatible端点保留文本能力，工具默认不可用，不能静默切到Beta/其他URL。

本片使用标准API非保留跨轮模式，显式thinking.clear_thinking=true；活动工具链完整保留并原序回传已观察reasoning_content。当前官方API证明该参数只清除历史轮次reasoning，保留工具调用/结果。故最终stop后关闭活动链，下一用户轮仍重放同端点/model/adapter已闭合段的完整调用/结果，仅移除旧reasoning；选段不能夹带更早上下文，必须同时包含来源依赖。无法合法重放时返回CONFIGURATION并提示选不附带历史开始新请求，不丢工具字段假称重建合格。保留式跨用户轮次模式不是本片隐式打开的选项；相关能力显示未验证，不伪造非空reasoning。任何活动链都不能因一次工具完成而清除必要字段。

段身份由trusted生成，绑定assistantId、timeline、endpointFingerprint、protocol、model、mode、adapterVersion与来源引用。内容、reasoning、工具调用与结果分型存放，不把reasoning加到聊天正文。仅白名单厂商字段可进入协议存储，无任意透传对象；明确大小/数量上限，超过即中断并保留可理解状态，禁止裁剪半个调用。首版建议最多3个工具轮次、每轮最多4调用且串行执行、单调用arguments最多32K字符、全请求链总字节/时间预算有界；S0冻结具体常量并测边界，不承诺并行能力。

SSE按choice/index聚合，每个最终call必须具有唯一非空ID、function类型、完整固定名与JSON对象参数。同index的冲突ID/类型/名称、重复ID、稀疏非法index、过量、截断、错误finish_reason、未知tool均零执行；绝不能在半个JSON已可解析时提前调用。完整响应先校验所有调用再开始执行。既有delta/partial输出观察顺序与006撤权优先级保留。

### 工具白名单与权限交集

| 工具                        | 严格参数与结果                                                                                                    | 可信约束                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| get_current_time            | 参数为strict空对象；结果为UTC ISO时间、可信本机时区与offset                                                       | 读取注入Clock；不收模型时区/系统路径，不修改时钟；normal与temporary均可用                                                    |
| search_conversation_history | strict对象query为1–200字符非空字面关键词、limit为1–10整数；结果含有界completed轮次摘录、requestId、时间、截断标志 | 仅当前助手正常历史；assistant/endpoint/范围由trusted注入，禁止模型指定SQL、ID列表、路径或权限；稳定顺序与字面匹配复用006底层 |

请求增加窄工具意图（默认关闭，可单选时钟或时钟+历史）；中文入口说明检索范围并显示当前实际接收方。历史检索必须同时满足本轮明确勾选、006readHistory、该实际端点sendHistory与上下文范围。context=none禁止历史工具；selected只搜选定完整requestIds；recent若启用历史检索，UI必须明确这是授权在自己完整正常历史中按关键词检索，不能暗中把“近期上下文”解释成全部历史。

读取权限和接收权限是必要上限，不等于任务需要或自动发送所有数据。检索结果只含有界必要摘录；进入续答的历史结果、派生回答和reasoning继承来源标签，后续选段/重放不能绕过来源撤回或外发拒绝。参数/结果/权限输出strict Zod；调用前、读前、结果外发前及本地状态提交前重新检查实时授权、取消、连接禁用、凭据删除。006已接受历史发送授权在相同assistant/类别/端点范围可复用，无需重复产品授权；新增工具范围表达本次需要。

不把自然语言模型计划或tool参数中的confirmed=true当用户批准。未来写入工具必须经同一入口，但使用独立可信用户意图/确认记录、对象版本与领域权限；本片没有业务写入工具，也不建立可以由renderer直接派发任意工具的通用IPC。

### 操作身份、恢复和配置变化

modelRequestId、segmentId、operationId分别由可信侧管理。工具callId只作协议关联，不能作为跨段业务幂等键。持久唯一映射(segmentId,modelRequestId,toolCallId)→operationId；同映射不同参数必须拒绝，同映射重复派发返回既有状态/结果，不重新执行。

状态采用PREPARED→DISPATCHING→SUCCEEDED/CONFIRMED_NOT_APPLIED/RESULT_UNKNOWN；未派发可CANCELLED_BEFORE_DISPATCH/BLOCKED_BY_CURRENT_STATE。保存必要工具名、参数版本、来源、对象预期版本槽位和脱敏展示结果，正文结果只在受权限协议区。SUCCEEDED不因后续回答失败或取消变成未发生。崩溃恢复查询本地真实状态；PREPARED未派发可判未发生，DISPATCHING无可核查结果保持未知。UI对未知提供说明/核查入口，不“重试整个流程”掩盖重复风险；只读工具可由用户开启新请求再次查询，但旧操作保留未知事实。

普通改绑定/改模型下段生效，活动段不改接收方；旧连接被禁用/删Key或旧端点授权撤销立即阻止后续。修改连接实际URL不能让旧段向新URL携带旧协议，无法继续时关闭/阻止旧段，用户新请求再按当前配置处理。恢复不自动发模型请求。重试模型续答使用既有已成功结果且重新验权；若无法合法重放完整段则不重建，显示原因。付费请求无隐式transport重试。

正常模式加法版本迁移保存旧助手/凭据/历史/权限，事务建新表或等价存储；不得改写旧schema版本或清库。SQLite业务事务与操作成功记录的统一接口为Q5/Q7预留，但不得把普通日志充当操作权威。临时路径禁止触碰持久协议/operation仓库，包括错误、取消、超时与退出分支。

## 分工、阶段与红态oracle

S0：006最终PASS已满足。trusted执行者以精确产品baseline核验DTO和官方模型/API参数；冻结新增窄DTO、事件顺序、表版本、大小预算、工具scope/结果和能力记录schema，专属报告交UI。冻结前UI只做读需求。

S1 trusted所有权：src/shared provider/timeline及新增operation/capability contracts与Zod-free channels；src/main provider transport/adapter/service、权限/operation/协议repository、schema迁移；preload/IPC/main装配及对应测试。先用注入Clock/transport建立“现在几点→实际工具→续答”红态，再接历史工具。相同文件单写。

S2 UI所有权：ProviderPanel与抽出的工具范围/状态/能力/来源引用组件、renderer样式/测试；App接线若重叠由主指定单写。冻结mock严格匹配DTO。实现完整中文正常对话、临时约束、完成/取消/未知/空结果/权限拒绝和引用导航，不能只有JSON调试视图。

S3融合：真实Electron两PID、合成数据的实际产品路径；必要低价live工具闭环由持Key主角色运行，子角色不索取或扫描Key。现探针已有可行证据，产品适配真实请求需独立记录，不能将脚本输出当产品闭环。保留式思考若未观测如实保留，不为凑字段盲目重试付费。

必须先红后绿的辨别测试：

- SSE arguments跨Unicode/JSON边界多片、多个index交错、重复ID、冲突name/ID、截断、空choices usage尾片、超限；任何不完整/畸形调用执行计数为0，合法完整调用每身份至多1次。
- 两次工具轮次且各含非空reasoning的合成oracle：请求字节语义保真、完整调用/结果关系不丢，普通聊天/IPC/log无reasoning；非保留跨轮边界与保留模式限制独立测试。
- 双助手/端点/路径/权限版本矩阵；none/selected/recent工具范围；SQL通配符字面处理；恶意history内容诱导任意工具/权限提升无效；模型不能传assistantId偷搜别助手。
- 在碎片聚合、执行前、结果提交前、工具结果续答前、迟到成功和迟到畸形输出处取消/撤权；零新增外发/非法读取，已发生状态不被取消覆盖。模拟不合作transport。
- 相同operation重复派发、同callId不同段、参数冲突、成功后回答中断、PREPARED与DISPATCHING崩溃窗口、权限撤销后恢复；冷启动零Provider调用/重复执行。
- temporary各成功/失败/保存/清空/退出路径通过仓库spy及真实重启证明零正常历史读取、零持久协议/operation/业务副作用；测试只用合成数据。
- UI稳定助手切换、在途范围更改、搜索引用、晚到快照、防回退及保存回执沿用006；能力证据失效不静默启用工具，缺usage保持未知，跨工具多请求统计不重复相加或假称准确账单。
- schema前版本夹具升级失败原子性、正常重启协议/操作记录可读且无隐式恢复执行；来源/权限不因迁移默认扩大。

聚焦测试后完整verify（测试/typecheck/lint/format/build）、两PID真实Electron生命周期、依赖树/foundation及secret/generated/residual扫描。本片高风险，必须全新独立Reviewer检查精确差异和敌手/恢复路径，复跑风险相称测试。不要重跑Toolhelp32 -003或创建-004。UI与trusted自述不是PASS。

## 授权、路线切换与交接

工程链自主决定有限适配、文件布局、精确依赖、版本化schema、隔离合成测试、模型重试策略和证据。用户已授权本项目开发、必要合成付费、已审非force main双既有remote同步以及后续隔离安装升级卸载/new tag/Release；无需逐SHA/调用/发布重问。真实私人资料、无关项目、可见性修改、历史/tag重写、破坏性资产替换、实质许可证变更和采购不在授权内。本Planner无付费/commit/push。

协议规则无法证明合法续接、当前DTO不能表达来源继承、一次事务/状态机不能维持真实结果时REPLAN；相同first bad state两次或同路线三次修复无证据增量切换机制。工具helper失败先经平台审核替代路线，保持精确allowlist/preimage/原子写/回滚/posthash，不能把默认helper故障当用户门禁。AST-006/RET-007/REM-002不阻塞本片，保留后续决策。

最终证据：精确baseline/candidate、修改文件与角色所有权、红绿oracle、实际命令/退出码、两PID、现场实际产品live次数/usage及未观察项、官方参数/重建边界依据、独立verdict、提交/双remote与残留。专属报告在`.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/`，由Prompter更新progress和总覆盖。

## 当前S3实际证据

2026-09-06 root 已运行[实际产品Clock工具合成闭环](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tools-007-live-product-result.json)：默认真实transport的ProviderService/Clock/协议与operation仓库→续答，2请求、1 SUCCEEDED、回答包含工具返回的精确UTC，usage467/54/521，工具能力为实际产品LIVE_VERIFIED。两次reasoning均未观测，不结算保留式思考。此为产品可信路径live，不是renderer驱动live或跨用户轮live；renderer/preload/IPC恢复由独立双PID夹具覆盖。程序累计6付费请求，已观测usage1515，第一次探针usage仍未知。完整融合verify与独立Reviewer尚待闭合。

## 集成与独立审核当前事实

- [x] 007编号不存在确认；读当前入口、相关设计/006 DTO、探针与官方核心协议；形成独占规划产物。
- [x] 006最终PASS基线填定为`88a86a2dacc616ca3a6fa0ba63a345f059d88859`。
- [x] S0协议/API/DTO与schema冻结；见[可信候选/S0证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tools-007-core-candidate.md)。
- [x] S1可信工具/协议/操作身份/权限和红绿证据（候选，待独立审核）：17 files / 123 tests、trusted typecheck/lint/build、双PID25816/87296通过。
- [ ] S2中文用户闭环、状态、来源引用及能力限制展示。
- [ ] S3融合、真实产品合成工具闭环、完整verify及两PID。
- [ ] 独立Reviewer PASS、必要修复复审、已审提交/双remote同步。
- [ ] 总覆盖相应行准确更新；自动继续Q5记忆及Q7事项等依赖满足任务，PROGRAM保持ACTIVE。

# 011 assistant basic configuration — actual plan

日期：2026-09-07
性质：010 冻结期间的只读实施准备；011 实际实现必须从 010 独立 PASS、提交同步后的精确新 HEAD 开始。本文不预占 schema 号，不改变当前产品、测试或全局进度。

## 当前事实

- 助手 IPC 仍严格为 `list/create/switch/rename/set-primary/archive` 六个通道。preload 只映射这六个具名方法；renderer 没有任意 IPC、文件、网络或权限结论入口。
- `AssistantDto` 当前只有稳定 ID、名称、归档时间和助手版本；`rename` 同时校验 `expectedAssistantVersion` 与 `expectedStateRevision`，事务更新助手版本并推进全局 revision。名称、切换、主助手和归档都返回完整快照。
- 当前 SQLite `assistants` 表只持久化名称和生命周期字段。准备时现场 `schemaVersion = 8`，但 010 尚未形成 011 基线；实现开始必须重新读取 live HEAD 与版本，只使用当时的“上一版本 + 1”。
- Provider 每次 `startChat` 在 trusted 侧重新解析活动助手、连接、模型、凭据和权限；正常与严格临时在同一入口分流。普通历史只进正常模式，严格临时正文仅在内存。工具协议段保存发送时的完整消息数组，但执行快照目前不含助手人设。
- AssistantPanel 目前只创建、重命名、切换、设主要和归档。Provider/模型、历史权限、记忆权限、事项权限都是真实产品控件，但分布在聊天、记忆和事项区域，助手卡尚无明确导航。

## 冻结实现决议

### 1. 窄 DTO 与六通道复用

- 在 `AssistantDto` 加入 `persona: string` 与 `avatarKey`。`avatarKey` 使用 shared 固定枚举，例如 `mashiro | moon | leaf | spark | wave | violet`；实现前只可调整这组内置键名及默认键，不接受 URL、data URL、文件路径、SVG/HTML、脚本或 renderer 自定义值。
- 人设允许为空，NFC 规范化，保留普通换行，拒绝 NUL/C0 非制表与换行控制字符，按 Unicode code point 限制最多 4,000 字符；shared 先设保守 UTF-16 上限，service 再做精确 code point 校验。名称继续沿用 1–80 字符规则。
- 不增加第七个助手通道，也不增加通用 `update`。扩展现有 `renameInputSchema`，可选携带 `persona`、`avatarKey`；缺省字段在 trusted repository 中保留当前值，老的仅改名调用继续有效。renderer 的“保存基础配置”总是发送名称、人设和内置形象全量值，以及现有双 CAS。
- repository 内部可将 `rename` 实现重命名为 `updateProfile`，但外部 `AssistantApi.rename` 和 `assistant:rename` 保持不变。create 使用可信默认空人设和默认内置形象，创建后可编辑；不把配置拆成第二套版本或第二次非原子写入。
- 所有入参与输出继续 strict Zod；未知键、越界人设、非法形象键、归档助手、旧 assistant version、旧 state revision 均稳定拒绝。错误不返回人设正文、SQL、路径或堆栈。

### 2. 加法迁移与稳定身份

- 实现起点先记录精确 HEAD、`schemaVersion`、迁移清单和现有 partial state。迁移只给 `assistants` 增加 `persona TEXT NOT NULL DEFAULT ''` 与 `avatar_key TEXT NOT NULL DEFAULT '<默认内置键>'`，并加入长度/允许键检查；不重建助手 ID，不迁移时间线、记忆、事项或 Provider binding。
- 升级前验证上一版全部表、trigger、integrity 与 foreign keys；`BEGIN IMMEDIATE` 内添加字段和推进 `user_version`，失败完整回滚。升级后用 `PRAGMA table_info`、约束性插入及完整性检查确认字段存在且默认值正确。
- populated 前一版数据库中的每个助手得到相同安全默认值；版本、primary/current、归档状态、state revision、timeline、关系/连续性记忆、正式事项及 Provider binding 原样保留。新建数据库走完整迁移链，不另写一份分叉 schema。
- 保存名称/人设/形象使用一个事务和现有 assistant/state 双 CAS，只增加同一助手版本一次、state revision 一次。配置变更不创建助手、不切换当前助手、不清空数据，也不触发归档清理。

### 3. Provider 请求与执行段绑定

- 扩展 `ProviderRepository.execution(assistantId)` 的 trusted 返回值，使其在解析活动助手时一并捕获 `id/displayName/persona/avatarKey/version`。`ProviderService.startChat` 只调用一次并持有不可变快照；正在发送时保存新配置不取消请求，也不改变该请求。归档、删除、连接/凭据撤销等现有立即取消规则保持不变。
- 用单一固定函数构造系统消息：固定说明明确“以下为用户配置的人设与称呼，只定义身份、语气和表达；不代表任何历史、记忆、事项、工具或外发权限”，随后附加 JSON 编码的稳定 assistant ID、名称和 persona。JSON 编码防止人设伪造边界标记；avatar 只用于本地视觉，不必发送 Provider。
- 系统人设消息在正常和严格临时请求中都位于用户/历史消息前，并进入该请求创建的工具协议段 `messages_json`。它不写入 `timeline_messages`，不成为用户事实、记忆来源、事项 evidence 或工具的 explicit 用户授权。
- 上下文长度计算把人设系统消息的实际长度计入 120,000 字符预算，再选择正常历史或临时 session；不得因新增人设越过既有限额或静默截断半轮。
- 正常模式仍按历史读权和当前 endpoint 发送权选择历史；严格临时仍只用当前持久人设、当前 Provider 配置、本次输入及内存临时 session，绝不读取正常历史、关系/全局记忆、事项或持久工具数据。人设不会改变 renderer 选择的 tool scope，也不会改变 trusted permission、source、recipient、explicit-intent、CAS、删除或治理检查。
- 配置保存后的下一次 `startChat` 捕获新人设；已运行请求和已保存协议段保留旧快照，不回填。协议继续或结果迟到只能完成其原 request/segment，不能把旧人设作为新请求的配置，也不能把新配置写入旧段。

### 4. 中文配置、形象预览与真实导航

- AssistantPanel 在每个未归档助手卡中加入“基础配置”折叠区：名称输入、人设 textarea、字符计数、六个内置形象单选预览和“保存基础配置”。草稿按稳定 assistant ID 隔离；切换助手、快照 revision、迟到成功/失败继续使用现有 request/operation 世代栅栏，不能让 A 的结果覆盖 B。
- 新建 `AssistantAvatar` renderer 组件和固定本地资产映射。内置形象以打包内 SVG/CSS/React 图形呈现，有可访问名称与选中状态；列表卡、编辑预览及当前聊天助手标题复用同一组件。无网络请求、文件选择器或路径输入；自定义头像明确不在 011。
- 保存成功展示可信快照中的新版本；STALE_WRITE 自动刷新后保留可辨认的本地草稿并要求用户重新比较/保存，不声称成功。归档助手只读展示保存的形象和人设摘要，不允许编辑；永久删除后不从旧 UI 缓存恢复正文。
- 助手卡提供真实导航：当前助手可直接打开“Provider 与模型”“对话历史授权”“记忆与个人事件授权”“事项授权”。非当前助手按钮明确写“设为当前并打开…”，先用现有 `switch` CAS 成功，再由 App 导航；失败留在原处。App/ProviderPanel/HistoryContextPanel/MemoryPanel/ItemPanel 使用窄 focus target 或稳定 section id，不复制模型/权限开关到 AssistantPanel。
- Provider 导航落点必须显示该助手当前实际 connection、模型和 endpoint；数据授权导航落到现有历史、记忆、事项 trusted 控件。基础配置区提示：名称和人设会随正常及严格临时 Provider 请求发送给当前实际接收方，数据权限仍在各授权区单独控制。

## 分阶段单写路线

1. **S0 基线冻结**：010 独立 PASS 和双 remote 同步后，重新读取 HEAD、schema、六通道、测试数及 worktree；若与本文假设不同，先更新本计划，不沿用准备期版本号。
2. **S1 trusted profile**：一名 trusted 作者单写 `src/shared/assistant-*`、`src/main/data/schema.ts`、assistant repository/service/IPC/preload 与对应 unit/integration/migration tests，冻结 DTO、默认值和 CAS。
3. **S2 Provider segment**：同一 trusted 作者顺序修改 Provider execution snapshot/system message/预算与 protocol tests；不得与 S1 schema 并写。先用捕获 transport 验证普通、流式、工具续接和严格临时，再交 UI。
4. **S3 renderer**：一名 UI 作者单写 `src/renderer/**` 与 `tests/renderer/**`，实现编辑/预览/列表与聊天形象、真实配置/授权导航、迟到防护。DTO 变化必须先回 trusted 作者，不在 renderer 自创授权字段。
5. **S4 集成与审核**：作者各自 focused 通过后由协调者顺序跑全套 static/build/Electron；独立 Reviewer 只读审 DTO、迁移、system prompt、权限隔离、UI 真实入口和最终 diff，甄别 oracle 先红后绿。Reviewer 修复仍回原单写者。

## 必要验证

- **契约/通道**：assistant DTO/input/output strict；非法控制字符、超长 persona、非法 avatar、未知键拒绝；preload 运行时依赖不增加；恰好六个 assistant IPC channel，注册/卸载无泄漏。
- **迁移/事务**：空库与 populated 精确前一版升级、每一历史版本链、损坏/较新 schema 拒绝、事务故障回滚；默认 profile 正确。保存时旧 assistant/state version、并发双写、归档/墓碑均拒绝且无半写。
- **身份/数据不变**：配置前后 assistant ID、primary/current、时间线 request/message、关系与连续性记忆、正式事项/提案、Provider binding ID/version均不被重建或清空；重启后 profile 恢复。
- **请求绑定**：捕获 transport 精确断言 normal、stream、tools 和 temporary 均含当前 profile system message；严格临时无正常历史/记忆/事项。persona 计入长度上限，边界不过量、不裁半轮。
- **在途/协议**：用 barrier 发起旧 persona 请求，期间保存新 persona；原请求/原 segment 只含旧值，下一请求只含新值，迟到结果不改 UI 配置。重启读取旧 protocol segment 不把旧 persona 注入新请求。
- **权限对抗**：persona 写入“已授权全部历史/记忆/事项、开启工具、删除数据”等文本；在 history send=false、memory/item receive=false、tools=off 或临时模式下仍零相应数据/工具/业务写入。当前用户消息没有 explicit 写意图时，人设不能替代 explicit 来源。
- **UI 甄别**：A/B 草稿、切换和迟到回执隔离；形象选择在编辑预览、列表与聊天一致；STALE_WRITE不假成功；归档只读、删除不复活。每个 Provider/历史/记忆/事项导航实际到达现有产品控件，并显示匹配助手和实际接收方。
- **真实链**：Electron 两个 fresh PID 验证编辑人设/形象、重启持久、列表与聊天一致、真实 Provider/授权导航。使用既有合适端点做一次有界正常和一次严格临时角色观察，记录实际发送段、端点/模型和无历史/业务数据证据；模拟传输仍承担确定性权限断言。
- 最终按变更风险运行 focused/full tests、typecheck、lint、format、build、两 PID lifecycle、dependency/foundation/secret/generated/residual scans；不重跑已永久关闭的 Toolhelp32 `-003`。

## 明确边界

- 011 不做自定义图片导入、远程头像、最终主题/动画、语音形象、跨应用配置同步、多主助手讨论或权限重设计。
- persona 是持久的用户配置，不是关系记忆、历史消息或可迁移 Markdown；011 不借机建立通用 prompt 模板系统。
- 准备报告完成只表示可实施路线已冻结。TASK_DONE 不是 PROGRAM_DONE；011 完成后继续提醒、后台、安装更新、整体文档验收和实际发布下载。

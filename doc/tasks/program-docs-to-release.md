# Mashiro 文档需求至发布总清单

> PROGRAM_ID：MASHIRO-CONTINUOUS-DEVELOPMENT。状态：ACTIVE。更新：2026-09-08。唯一当前入口为 [progress](progress.md)，本文件是其项目级覆盖明细，不是另一续接入口。总目标：文档需求落实 → 整体产品验收 → Windows 打包安装/更新/卸载验证 → 实际发布与下载核验。TASK_DONE 不等于 PROGRAM_DONE。

## 当前授权与继续规则

最新制品节点：运行时代码为 `37620929a7f507bb31d41861114cf6f825d715fd`；最近一次双main实核为文档/证据后继 `e172870833c2ab3494d97eec740518363c2d9332`，产品源码与冻结制品未变；[Windows v4 构建02](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-build-02.raw.txt)退出0，[精确身份](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-packaged-hashes.json)记录 setup SHA256 `D352DD8AAD149D011405400476C2561C336768F076523E7DEDD2CCDB45D16EF4`、0.1.0、实际 NotSigned。[独立制品STATIC_PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-artifact-review.md)已核5份out、79文件、6声明和真实签名；新包已实际18→19迁移，非空来源/变更、旧回执与重启已有原生观测；[root持续核验](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-root-native-review.md)包含安装前后16文件/76表、自动迁移备份和最终17文件备份、真实2HTTP/6664tokens及仅last_tick变化的字段归因。[独立限定核对](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md)已重算安装/迁移/用量并提供覆盖映射。原生所有者已从失效路径经显式空A将backup05恢复至安装目录data B，新PID235296；原失效路径未重建。恢复强制暂停连接并解除助手绑定；原轮元数据保留，正常UI重新启用并绑定后正文及操作恢复可见。独立审核已实际核图关闭017提供/变更→正确对象详情和018原旧操作65f43282回执入口；未冒称原生unknown动作已跑。backup05→恢复治理C的实际撤回/接收撤权/凭据代际与暂停已独立限定通过；纠正与正式事项删除→旧备份恢复由独立生产服务fixture补足，G05/E04/E06治理恢复分项已结清。原B保留于合成场景的安装-data-later-mutations-B，C已移动至安装目录data，原生所有者继续程序重新定位、通知实际点击/冷激活、登录开启卸载重装与运行中心，随后016及发布下载；逐operation哈希差异另补脱敏归因。首次构建最终输出打开失败保留为FAIL；独占读成功、无候选进程、磁盘余量63.5GB且5份out哈希不变后一次重试成功，未归因防病毒、未改变系统防护。PROGRAM ACTIVE，尚未发布。

以下为先前阶段的保留记录。

最终源码整合已通过：[v4证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-root-final-verification-v4.md)为206文件850tests、842通过/0失败/8项有单独证据的opt-in实验跳过，静态/build及原6→0双PID Electron均通过。009事件/草稿回归已关闭，冷导航与Toast独立PASS可合并；下一动作是整合提交/双推、精确安装包与原生/016/实际发布下载，程序仍ACTIVE。下面保留先前各次观测。

当前Git已审HEAD `0b9328b5308a4042d3acb351c2cac9deafd29670` 已非force双推并实核两个main一致，包含独立通过的Toast清理修复；尚无Release/安装包发布。

最新待修边界：009只读审计完成通知被原撤权路径消费，实际Electron验证发现临时会话6→0；正在修复状态事件与真实治理撤权分离并独立审核，不能以先前限定PASS或修改测试预期通过。Toast v2完整REG_SZ修复已经独立4文件18tests限定PASS。最终安装包仍待009修复、全量及Electron通过；当前程序ACTIVE。

2026-09-08 当前进展：HEAD 1dea4c5a0ccea7cac2d1b2edf283bc22c7e68bbc 已实核双远程同步，新增[发布传输工具](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/release-transport-usage.md)独立静态PASS，实际发布仍NOT RUN。[冷导航独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-cold-navigation-review-final-pass.md)为11文件44tests，最终制品仍待整合；009真实18→19副本迁移及关键功能反例已有独立证据，但100MiB实测constructor/snapshot约9.6秒、accept约6.4秒形成[PERFORMANCE_REPAIR](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-performance-repair-contract.md)，现增量账本/分批事务修复已获[v2源码独立限定PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-v2-final-pass.md)，25,599对象constructor38.7ms、完整后台审计60.49s、真实增量649.6ms，审计期间UNKNOWN；root新整合唯一同轮纠正失败正在核查，原始失败保留。[clean安装包实际覆盖安装](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-login-clean-install-complete.json)已核EXE/ASAR准确且安装进程退出；首次启动前ToastCLSID缺失已按[原生注册时序路线](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-upgrade-toast-registration-route.md)归因；实际普通卸载清除了程序、快捷方式及登录项并保留数据，但[卸载后](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-uninstall-system-post.json)新旧两条属于本安装的LocalServer32残留，014进入该项REPAIR，修复后重验。全域治理恢复、卸载重装、最终整合制品、016与发布下载继续是必需队列。以下9月7日节点保留为历史证据。

当前实际节点（2026-09-07）：产品提交 6fd5ba18565f742e2edeb82e663948f90450caef 已实核 github/gitee main 同值，含独立通过的 NSIS 早期依赖/双分支及固定发行残留清理修复；RET-007 用户确认的100 MiB/90天默认已单独提交。程序仍 ACTIVE，009/schema19容量与期限、014慢启动导航待消费回执分别由两个 Sol 单写实施，Astra 独立复核。当前 `out/` 和实际安装仍为已审 f4/schema18，未混入两项 WIP。

[已安装36文件原生证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-installed-schema18-notification-key-manifest.json)已由[root核对](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-root-native-evidence-check.md)：实际15→18升级、旧数据保留、登录隐藏启动、通知退出后保留、OS COM冷启动直接定位事项，以及持久Key重启后真实2请求/6515tokens和完整备份。真实通知中心鼠标点击仍NOT_PROVEN；[慢初始化RED](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-cold-activation-review-repair.md)不被一次原生成功掩盖。累计56次HTTP、已知96677tokens、5次历史未知用量。

[宏v3源码独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-login-uninstall-review-pass-v3.md)及[真实build04](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-login-packaged-build-04.raw.txt)成功有效；新setup SHA28F1D3AFCDDE0D5CAFC53C70A103A190FFDF013AFB77464EC0888F4B681FB6D3实际NotSigned，ASAR与f4相同，但[制品静态审为REPAIR](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-login-artifact-review-v3.md)：本地Electron发行额外带入default_app.asar/version，缺失主ASAR时可能fallback。[固定清理独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-fixed-residual-review-pass.md)后已完成[build06与精确身份](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-login-clean-packaged-hashes.json)：新setup E615FFDC9BCD18DDF8A1D8BA83A9BC42DFA2B2B25A401113F9EF9797B082201B，两残留缺失，ASAR仍f4；[新制品独立STATIC_PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-login-clean-artifact-review.md)已准入隔离原生安装，当前执行者先冻结cold源码交审，再转卸载/重装与治理恢复。build05输出暂时无法打开及一次重试成功的[诊断](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-login-output-retry.md)保留；不改fuse、不关闭系统防护或警告、不抹除任何原失败。随后继续实际卸载/重装、治理恢复、最终RET/冷导航制品与016整体验收，精确版本发布及下载核验仍未完成。

历史现场（2026-09-07 18:37；已由顶部9月8日进展取代）：HEAD a3550888d4d6d001f441fb73e806eef4729ca315；最后已审产品f04fe24保持。014/schema18治理v4独立26文件65tests PASS，种子容量v5最终文件竞态已修v6并独立4文件9tests PASS；登录启动v2独立4文件20tests PASS，实际Electron隔离验证通过，最终安装仍待。017可信限定PASS、renderer实施中，D03是发布必需。安装执行者继续保存升级前完整合成基线、验证通知与新版生命周期；RET-007仍待答，016整体及实际发布未完成。本阶段无新增真实Provider调用；程序累计54次请求，其中5次历史用量未知，已知90162tokens，依据[daily真实角色记录](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/daily-013-live-product.md)。以下旧候选摘要按历史证据保留，不覆盖本条当前状态。

当前候选：013日常源码/本地边界限定PASS、五角色真实服务SUPPORTED、原生业务链已验；root截图发现调用预算快照滞后，已修复并独立4文件12tests PASS，最终原生run813ded0c已通过，截图中接受正文/回执实际可见。014生产入口和新目录还原独立限定PASS，精确旧制品已验普通桌面启动、中文安装data迁移、托盘、助手重启与完整备份还原；全域升级、OS提醒及最终制品仍待。旧备份恢复与当前已知后来撤回/纠正屏障的合并是待关闭的E04/E06边界，不能仅以确认快照回退代替。AST私有user/event已确认一并删除；RET默认仍待答。HEAD/双远程最新已审核同步f04fe24e7d3cb395bc976db8190969be38ba632e，包含009私有user/event删除和015有限保留协议独立PASS；schema15内部旧安装包0.0.9-internal.1已实际安装，升级合成数据包含待确认提案。015/schema16已完成136文件641tests、额外边界4、DOM8及原生双PID验收；014后续治理恢复屏障/schema17正在接线。完整覆盖与发布终点不变。

本次用户指令覆盖旧初始化、F1、004、005 的阶段停止与发布授权限制。工程链自行选择切片、依赖、精确版本、加法 schema、内部 API、测试方法、并发、分支与合理提交点；可执行必要低价合成 Provider 调用、已独立审核 main 的双远程非强制推送、隔离合成安装/升级/重装/卸载、版本与新 tag、现有 Mashiro 仓库可见性下审核制品 Release、资产和说明上传。GitHub 为默认制品入口，Gitee 同步源码。无需再次逐 SHA、逐调用或发布前征求相同授权。

边界保持：不读取新的真实私人数据，不改 AIbrowse/Clender 等其他项目，不改仓库可见性，不重写历史或已有 tag，不破坏性替换已发布资产，不实质改许可证、不采购证书/订阅、不另建收费基础设施。真实私人数据、无法取得的必需账号权限、用户保留的产品语义才按具体需要询问。合成开发付费授权不取消产品后台预算与权限要求。当前010[真实角色闭环](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-live-product.md)SUPPORTED，[原事项修改增量](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-update-live-product.md)也已SUPPORTED；010累计22请求/56672已得tokens；011[真实人设增量](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/assistant-011-live-product.md)2请求402tokens通过；程序累计44请求/77993已得tokens，仍有5次usage未知（原3次加012首尝试2次）；013[真实章节角色闭环](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-live-product.md)3请求849tokens通过，独立产品审核仍待；012[真实提醒角色闭环](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-live-product.md)已SUPPORTED，首尝试的否定句与当地日期根因已本地修复，不冒称原生通知或安装通过。此为服务级角色证据，010独立FINAL PASS已完成并同步ab11110；011也已独立FINAL PASS并同步072dd39。以下008结束时统计为历史检查点。本记录不包含凭据；Q4能力探针4次、007clock闭环2次、008前3次失败/诊断及修复后4请求成功闭环，合计13次请求；已得usage11260，首探针及008前2次usage未知。008[真实记忆角色闭环](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-live-product.md)已SUPPORTED，008独立产品审核已FINAL PASS；[历史失败](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-live-failure-diagnosis.md)保留，工具reasoning仍NOT_OBSERVED。

每一切片实现、验证、独立审核、提交/同步之后，更新覆盖状态并选择下一依赖满足的工作。计划、PASS、数次修复、需要迁移/新 schema、技术路线失败或上下文较长均不是总任务停止点。换 Agent/压缩/持久交接优先；确实没有可用执行路线时保存 TECHNICAL_PAUSE（准确现场、未完成队列、确切门禁、直接恢复动作），程序不完成，也不声称结束响应后仍在后台开发。

角色策略：用户指定 gpt-6-astra 承担复杂设计/诊断/关键独立审核，默认 medium，仅极复杂问题 high；gpt-5.6-sol 承担明确实现/测试/收尾，默认 high，极简单代码可 medium。本次覆盖记录者的工具未披露实际模型/思考运行元数据，不能将角色映射冒充已验证的实际切换。以后以工具真实选择与返回为准；能力不足时明确降级，不伪造独立 PASS。Prompter 可维护记录、核对现场和裁决工程方案，全局入口保持指定记录者单写。

## 历史接管事实与证据（005/006阶段）

- 当时已审产品 baseline：main `88a86a2dacc616ca3a6fa0ba63a345f059d88859`；006 closing/007合同可在其后形成纯文档提交，不能反向冒充006产品审核对象。
- 2026-09-06 主协调实际 `ls-remote`：github/main 与 gitee/main 均为 `88a86a2dacc616ca3a6fa0ba63a345f059d88859`，两次命令退出0。后续同步再查询，不把此观测写成未来保证。
- 005 精确产品 `0aa2d9190b63c7b99d59f52808e16965fa6b417f` 已独立 [FINAL PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-review-0aa2d91.md)，报告 SHA-256 `E13D1F19B9E66D5932D010F8455FD4177A3EBC991FC7DE7C639C5A73C80105B0`。20 files / 88 tests；静态、构建、扫描通过；沿用未改 trusted 链的独立双 PID 59660 / 62500 恢复证据。
- 005 已有 schema v3、每助手正常时间线、严格临时隔离、显式保存与重启恢复、有界近期上下文。读取仅最近 100 条，外发最多 16 组 completed 合格对/64,000 UTF-16 字符，并不等于完整浏览/检索和权限系统完成。
- [005 任务](005-persistent-timeline.md)、[push-close](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-push-close-0aa2d91.md)、[continuation](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-text-v1-continuation-f5aa9880.md) 保留历史状态和有效证据；其 STOP_CHECKPOINT 只描述旧轮，不再是程序状态。
- [003](003-provider-live-qualification.md) 历史共 4 次合成 live，2 次参数 HTTP 400/code 1210，2 次 enabled+low 普通/流式成功；各成功 usage 22/4/26。只覆盖指定 GLM 端点/模型的普通/流式；思考续接、工具、结构化结果、真实取消未以该证据合格。
- 历史 Toolhelp32 -003 辅助路线 failed/deferred/non-blocking，禁止重跑或创建 -004。默认工具 helper 启动失败已有合法宿主执行路线；本次 apply_patch 在读取目标前 helper setup-refresh 失败，固定 preimage 未改变，使用经工具审核的内容寻址原子 writer，不绕过拒绝。

## 新增程序证据

- 总覆盖与授权规则等11份文档已在 `c03c5adb05aa5e237fab0f528a1f25ccbd4825ab` 入库，独立比例核对47个本地链接、原005审核hash和diff；两既定远端main推送后实际查询同值。此为已发生观测，不预测后续SHA。
- [GLM高级能力探索](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-capability-probe-v1.md)：工具54片参数聚合、严格本地执行、匹配结果回传续答，以及json_object本地精确校验均成功。它为B02/B03与Q4提供端点能力证据，不表示产品集成完成；B04工具思考续接仍未观测。累计本次4请求，3次成功usage994，首次usage未知；无Key/正文落普通日志。
- 006精确产品`88a86a2dacc616ca3a6fa0ba63a345f059d88859`已获[独立FINAL PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/timeline-context-v1-review-final-88a86a2.md)，报告SHA-256 `A69669178A74339D08BC1CACCD125F1B3E43432E2449C8B6310D5BFE9D0BBE04`。产品22 files / 113 tests；独立全量24 / 117含4额外oracle，另flow 1 / 1；fresh Electron PIDs83792/90028及关键源码hash适用。

## 阅读与覆盖口径

覆盖记录者已完整读取 [Proposal](../proposal.md)、[高层设计](../high-level-design.md)、[详细设计](../detailed-design.md)，含功能正文、用户场景、测试 oracle 和实际位于详细设计第 13 节的集中决议。下表 P/H/D 分别代表这三份文档的章节号；旧第 12 节决议锚点是历史引用误差，按真实标题定位。

状态含义：已审表示有精确切片 PASS；部分表示已有实现但整条需求尚未验收；排队表示本次必需且有明确验收去处；待决表示具体用户语义未定；原始后置/可选/非目标保留原文依据，不能算完成。Q 编号仅是本表依赖队列键，立项时检查现场分配正式稳定任务文件；不是提前占用任务编号。六条日常版本摘要不是范围上限，所有已确认正文均纳入发布计划。

### A. 助手与对话

| 覆盖 ID / 来源 | 应有行为与适用范围 | 当前状态 / 关联任务 | 用户入口与验收证据或剩余 oracle |
| --- | --- | --- | --- |
| A01 AST-001；P3.1；D3.1 | 稳定身份、唯一时间线、创建/改名/切换/主助手/归档；归档不删除全局事项和共享记忆 | 001/005身份底座已审；010事项、013后台及助手删除后的跨域保留边界已有独立源码、真实角色与原生入口证据；最终release-v4整体验收由Q11结算；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-review-final-pass.md) | 助手管理；现有重启/并发/事务证据，新增关系与正式事项后证明归档不连带删除 |
| A02 AST-002；P2.1/3.1 | 名称、基础形象、人设、Provider/模型及数据范围可实际配置；改配置不改身份和关系 | 名称/模型部分已审001/004；[011配置](011-assistant-basic-configuration.md)TASK_DONE / FINAL PASS：072dd39双远程已核验；真实2请求、54/320、独立3新增场景及Electron08通过；数据范围随各域扩展 | 中文配置入口；重启保留人设/基础形象；请求准确使用稳定人设，严格临时可用；无任意本地路径暴露 |
| A03 AST-001/P3.1；H3/5.1 | 完整时间线浏览/全文检索；局部上下文选择，有界发送不删除历史 | 006及007原轮次定位已审 | 稳定分页/字面检索/selected trusted重验；搜索命中和工具引用按requestId直接定位原轮次，最终Q11继续可用性验收 |
| A04 MEM-004/RET-003；H5.3/7.2 | 助手负责章节、摘要、连续性记忆、未完成话题；压缩与回收不同 | 008即时连续性与013章节、仓储、日常后台均已独立审查；章节及五类日常有真实角色证据，最终原生入口已观察；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-final-pass.md)；[日常真实角色](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/daily-013-live-product.md) | 独立后台配置/预算→完整正常轮→真实接受Markdown→章节浏览/来源/话题状态/上下文；73/418与最终双PID/DOM通过；仓储/日常源码与真实角色证据已闭合，最终跨场景结算归016 |
| A05 AST-004；P3.2；H5.2 | 正常默认保存；严格临时不读正常/记忆/业务，不写后台/业务/协议重启快照；显式保存可信回执 | 005–008正常/严格临时已审；010事项、012提醒、013后台的临时零业务/零持久化边界均已进入独立回归，009最终Electron保持原6→0；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-review-final-pass.md) | 008严格临时记忆读写与业务零持久化、真实Electron临时拒绝已验；稳定人设及新增事项/后台已有领域回归，最终制品场景由016结算 |
| A06 P3.1/4.3；PVD-007/009 | 切换/取消/部分输出/迟到快照归属明确；重启显示真实状态，不自动重发 | 004–010及018旧轮直接回执已审；012提醒和013后台的取消、迟到、重启真实状态已有独立领域回归；018已进入最终ASAR；最终安装版原旧成功回执已独立核图关闭；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/review018-independent-final-pass.md)；[最终安装证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md) | 008稳定业务回执、跨助手迟到UI隔离、未确认手动重试身份已验；010事项迟到回执与恢复已审；提醒/后台领域回归已审，最终提醒运行和制品余项仍由014/016结算 |
| A07 AST-006 | 助手永久删除的长期数据语义 | 009手动核心已审；010未接受提案随删已审；额外私有user/event已确认并完成增量，独立五文件27tests及两条范围变化反例PASS | 保留归档，二次确认永久删私有聊天/关系/连续性记忆；全局共享记忆及正式事项保留，来源显示原助手已删除且不再展开私有原文 |

### B. Provider 与可信执行

| 覆盖 ID / 来源 | 应有行为与适用范围 | 当前状态 / 关联任务 | 用户入口与验收证据或剩余 oracle |
| --- | --- | --- | --- |
| B01 PVD-001/002/004；P3.6；D6.1 | 可复用连接/助手模型分离，HTTPS固定接收方，Windows保护持久Key和运行期临时Key | 已审 004，打包再验 Q1/Q10 | 连接管理、助手绑定、凭据状态；保护失败不明文落盘；更换连接/凭据对受影响助手与后台可辨认 |
| B02 PVD-005/006/008；H6；D6.6/12.3 | 普通、流式、思考、工具、结构化、strict/并行、输出限制、用量分项能力证据；端点/模型/模式/适配版绑定 | 003/004文本、007有限GLM能力及013五类实际后台角色已审或有真实服务证据；最终release-v4仅按已验证能力展示；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/daily-013-live-product.md) | 九项能力按实际接收方/model/mode/adapter区分；产品clock工具LIVE，保留思考NOT_OBSERVED，vendor strict/并行与其他角色不冒称已验 |
| B03 EXEC-001；D6.3/12.3 | 完整聚合 tool arguments，再trusted工具名/schema/权限校验、实际执行、回传并继续回答 | 007只读、008记忆/事件、010事项、012提醒与013章节/仓储/日常的受控工具执行和真实业务回执已有独立或真实角色证据；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-live-product.md) | 008自然中文创建→真实write_memory提交→服务重开→search_memory续答SUPPORTED；创建/纠正独立严格wire，删除/撤回仅准备确认 |
| B04 EXEC-002/006；H6.2/7.3；D6.4 | 受控协议段与聊天分开，保真必要思考/签名字段与完整调用结果关系；固定接收方语义 | 007 GLM非保留跨轮段已审；其他厂商/保留模式仍Q4/Q11 | 活动链合成reasoning完整回传，closed段保留调用/结果并仅去旧reasoning；来源依赖/预算/不兼容拒绝已验，真实保留思考与DeepSeek等仍待资格 |
| B05 EXEC-003/004/005；H9；D8/12.2 | 稳定operation ID，业务与模型重试分离；本地业务/结果共同事务，跨文件结果未知先核查 | 007/008/010稳定操作身份已审；012提醒、013后台及018旧轮业务回执的取消、重试、迟到与重启恢复均有独立反例；最终旧成功回执入口已核图，unknown/确认按scope03复用独立源码与DOM反例，不冒称原生执行；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-review-final-pass.md) | 记忆接受指针/业务命令/工具回执共同SQL提交，Windows子进程硬终止5窗口；同请求业务不重放，未确认UI重试跨重挂载复用身份 |
| B06 EXEC-006/PVD-009；D8.4 | 取消/撤权/禁用/删凭据立即阻止新外发和提交；不承诺远端绝对取消或回滚 | 004–010及012–013各域取消、撤权、禁用、删凭据和迟到提交屏障均有独立源码/领域回归；009真实expiry仍撤权；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-review-final-pass.md) | 来源、接收许可及已提供记忆/历史在每步重查；搜索后撤回/撤权零写，取消与已提交状态分离 |
| B07 PVD-005；D6.6 | DeepSeek/GLM重点兼容，Qwen/Kimi差异审查；按角色必需能力选择模型 | 007有限GLM工具已审；013五真实日常角色已SUPPORTED；[015](015-provider-retained-protocol.md)有限保留协议已审并同步f04fe24，DeepSeek未做LIVE | 实际端点/model适配白名单和能力限制可见；DeepSeek/Qwen/Kimi及仓储员等角色仍须独立适配/资格；[2026-09-07官方差异核对](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/provider-compatibility-source-check-20260907.md)记录保留思考与托管参数边界，不因007完成而删除 |

### C. 权限与上下文

| 覆盖 ID / 来源 | 应有行为与适用范围 | 当前状态 / 关联任务 | 用户入口与验收证据或剩余 oracle |
| --- | --- | --- | --- |
| C01 AST-003/PVD-003；P4.1/4.2；H5.1 | 任务需要、助手读取允许、实际接收方允许三者交集；范围允许不等于全部发送 | 006–008历史/记忆、010事项及013章节/仓储/日常的任务需要×助手读取×实际接收方三重交集均已扩展并审查；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-review-final-pass.md) | 全局/助手私有read、write、inference、receive分范围CAS，工具scope按本轮意图配置；none不搜历史但可明确用记忆，临时拒绝 |
| C02 P4.2；H4/7.3；D6.2 | 历史回答、摘要、记忆、检索/embedding、后台与协议字段继承来源约束 | 008来源传播与撤回、009清理屏障、013章节/仓储/日常来源继承均已独立审查并进入最终源码；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-final-pass.md) | 搜索命中传播至归纳来源；纠正旧版本回边保持撤回与权限，DAG按上下文memo；普通失效历史不放行；后台来源继承已审，旧备份后续治理实际恢复仍由014/016核验 |
| C03 AST-001/003；P3.1 | 多助手不互读完整聊天/关系，全局记忆按权限共享 | 008全局/私有记忆与历史隔离、010正式事项跨助手保留及009助手永久删除范围均已独立审查；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-review-final-pass.md) | 私有关系/连续性只归本助手，全局按领域与端点交集共享；源历史限制继承；009永久删除共享来源保留另验 |
| C04 ITEM-003/EXEC-001；D4/8.4 | 操作权限由程序执行，明确指令低干扰，高影响/删除/批量明确确认 | 008记忆、010事项、012提醒及013后台高影响操作的可信预览/确认/版本/权限边界已进入独立领域回归；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-review-final-pass.md) | 结构化预览绑定对象版本、完整影响摘要与授权；模型不能批准删除，确认后可信回执不被旧PENDING覆盖 |

### D. 记忆、事件与仓储员

| 覆盖 ID / 来源 | 应有行为与适用范围 | 当前状态 / 关联任务 | 用户入口与验收证据或剩余 oracle |
| --- | --- | --- | --- |
| D01 MEM-001/004/005；P2.1/3.3；D3.2/7.1 | 全局用户记忆与助手关系/连续性分责；陈述/忠实归纳低干扰生效，新增推断保留性质 | 008即时记忆与013仓储/观察/五类日常后台源码、真实角色和原生入口层已审或已观察，已进入release-v4；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/steward-013-root-final-pass.md)；[日常真实角色](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/daily-013-live-product.md) | 全局user与私有relationship/continuity、陈述/忠实归纳/推测有UI和工具入口；新增推测单独授权；后台角色真实资格已验，最终整体制品结算归016 |
| D02 MEM-005/006；H4；D8.3 | Markdown语义正文与事务身份/来源/权限/版本/抑制一致；内编辑优先、外改显式重载和差异验证 | 008 Markdown接受版本与治理已审；完整备份Q10 | 不可变版本+hash+SQL接受指针，故障孤儿不接受，内编辑CAS/外改显式重载；文件清单仅备份输入，不称完整备份 |
| D03 MEM-002；P3.3 | 默认收起来源/变更面板，区分“本轮提供”与无法证明的“实际使用” | 008及017可信/界面独立PASS；最终D352安装版恢复后原395bf轮非空提供/变更、权限隐藏→重新绑定显示、正确对象详情入口均已[独立核图通过](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md)；整体016仍待其他场景 | 本轮具体提供/真实变更、对象导航、重启与当前权限/撤回边界必须闭合；反向request UUID列表不能替代本轮面板 |
| D04 MEM-001/003；D7.1/7.2 | 明确记住/纠正/删除即时生效及真实回执、适用撤销，不等待仓储员 | 008即时记住/纠正/删除FINAL PASS；009受管副本清理、保留策略、防旧作业复活及恢复屏障已完成源码/本地整合审核；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-v2-final-pass.md) | 自然中文创建与下一轮真实检索通过；纠正、删除表示/撤回预览确认与抑制即时生效，恢复受后续撤回保护；009受管副本清理已审，实际旧备份防复活继续014 |
| D05 MEM-004/USE-002；H5.3；D9 | 待整理增量来源保真，仓储员去重/归并/Markdown分支整理/冲突识别 | 013 STEWARD_CORE独立PASS，已提交2307e490；整体联测Q11 | 待整理区与预算配置、整理状态/冲突入口；并发版本核对、权限不扩大、来源不丢、达到预算停调用 |
| D06 EVT-001；P3.3；D3.2 | 可追溯个人事件区分意向/计划/安排/报告发生/完成/取消/未知 | 008事件与010事项已审；013多事件观察真实接受及原生入口已验 | 七种事件状态、来源/性质和正常对话变更，UI编辑保留原时刻含秒毫秒；不冒称真实日历 |
| D07 EVT-002；P5；D3.2 | 多事件客观观察与待核验习惯推测，有时间与来源依据 | 013日常核心已审；观察真实Memory接受与最终原生f8198eef已验，制品整体仍Q11 | 整理输出显示依据/推测；纠正与撤回传播，不静默作人格或心理诊断 |
| D08 MEM-005；H4/12 | 可重建全文索引，失效不能删除有效记忆；删除抑制和权限先于检索 | 008字面全文检索与索引重建抑制已审；三区/物理清理009 | 主路径校验接受正文与权限；索引可重建，旧索引不复活抑制内容；可选向量未实现，备份另Q10 |

### E. 保留、清理与恢复

| 覆盖 ID / 来源 | 应有行为与适用范围 | 当前状态 / 关联任务 | 用户入口与验收证据或剩余 oracle |
| --- | --- | --- | --- |
| E01 RET-001/002；P3.3；H7.1 | 记忆/事件持久、暂存、垃圾三区；持久不自动降级，垃圾不召回但可恢复 | 009三区、容量/期限策略及v4整合已审，已进入3762092安装包；最终安装态联测由Q10收束 | 区域/恢复入口；分区不改性质/权限/归属；模型不得自动清空持久区 |
| E02 RET-003/004；H7.2 | 聊天压缩与本机回收分离；接受结果先保存，检查未完成话题/操作依赖；默认可恢复 | 009预览/依赖检查与013真实接受章节→原文回收→摘要可读→原文恢复已验证；仓储和日常接受结果依赖已有独立审查；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-final-pass.md) | 回收预览/依赖/回执；保存失败或未完成依赖时零回收；拒绝优先于并发接受，旧回执不能冒称当前执行；重建不覆盖新修改 |
| E03 RET-005/006；D7.2 | 消息、区段、时间线清理；区分回收原文、删记忆表示、删除信息/撤回依据 | 009消息/区段/时间线清理及受管副本作业已审；013章节/仓储/日常来源和依赖已纳入跨模块回归并进入release-v4；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-root-final-verification-v4.md) | 清理意图明确；处理相关原文/事件/摘录/版本/索引；正式事项不被连带删除 |
| E04 MEM-003/RET-005；P4.3 | 用户纠正、删除、撤回的事务抑制优先于旧作业、压缩、来源扫描、索引重建 | 008即时抑制、009清理恢复及013章节/仓储/日常的迟到正文、旧作业与索引屏障均已独立审查；不再有Q9实施余项；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-final-pass.md) | 来源撤回即时退出记忆/历史/协议召回；旧版本/旧作业和索引不能覆盖，后台同屏障已审，实际backup05恢复已核后来撤回/撤权优先；普通纠正与正式事项删除恢复由独立生产服务fixture补证 |
| E05 RET-007/D-070 | 容量、期限、垃圾自动清空、具体清理参数 | 用户2026-09-07确认100MiB/90天默认；009 v4源码/本地整合通过，独立功能/性能/状态通知审核及Electron有效；最终安装态仍Q10 | 全数据集有效持久正文UTF-8计量，超限仅拒绝新增占用；暂存到期转可恢复垃圾，两项可调关闭，垃圾永不自动永久清空；事务竞争/恢复暂停/完整设置及只读状态不撤权已独立验证，最终安装态继续Q10 |
| E06 RET-001/003/005；H7.1–7.3；D7.2；用户发布验收4–5 | 垃圾与原文可恢复阶段按当前依赖/权限恢复；物理删除不可假称可恢复，已撤回内容不由旧版本、协议或备份恢复复活 | 009三区恢复/清理与013接受结果→原文回收→恢复已审；release-v4已实际从失效位置经空A把backup05恢复到空B，独立核对机制与数据层一致；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-root-final-verification-v4.md)；[最终安装证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md) | 三区往返与跨重启；后来撤回优先，旧确认/旧作业无复活；受管副本实际清理与失败状态可核查，备份保留边界诚实说明 |

### F. 事项、提案、承诺、提醒和后台

| 覆盖 ID / 来源 | 应有行为与适用范围 | 当前状态 / 关联任务 | 用户入口与验收证据或剩余 oracle |
| --- | --- | --- | --- |
| F01 ITEM-001；P2.1/3.4 | 目标/项目/任务/承诺/等待事项统一正式系统，各类型生命周期和关联可理解 | 010 TASK_DONE / FINAL PASS | 事项列表/详情与对话创建修改同一状态；重启保留，不只手动CRUD |
| F02 ITEM-002/003/004；D7.3 | AI推测进提案，确认/否决/暂缓/与发起助手协商同一版本；发起稳定ID保留 | 010 TASK_DONE / FINAL PASS | 提案入口与发起助手对话；旧版本确认冲突；其他助手不自行改写；同旧来源否决后不反复提出 |
| F03 ITEM-002；P3.4 | 未确认提案不算正式承诺/完成率/逾期/正式提醒/日历占用；临时不生成 | 010正式/提案隔离及012未确认零调度核心已审 | 提案与正式视图统计和调度甄别测试；接受后建立正式对象；提醒须有明确设置并由012联测 |
| F04 REM-001；P3.5；H5.5 | 确定性提醒不依赖模型/Key，打开/最小化/托盘可用；可选登录启动；明确退出无保证 | 012 INTEGRATION_PENDING / CORE PASS | 61/360、独立8反例、实际双PID/DOM、原生show与无Key服务恢复；REM默认和014安装后登录/点击/冷激活待验 |
| F05 REM-001/002；P3.5 | 休眠/重启对仍有价值逾期提醒受控补发，合并与过期语义可理解 | REM-002已确认并有独立默认/通知组/schema15 PASS，014原生联测待验 | 默认24小时、同事项最新、多项合并一条、超窗仅列表；独立101事项/重启/取消/伪造激活与迁移反例已验 |
| F06 P2.1；H3/10；D9；USE-002 | 每日简报、晚间复盘、每周规划、截止与变更提醒，后台授权/预算/状态 | 013日常源码/本地业务限定PASS，五真实角色SUPPORTED；最终原生配置/接受/重启入口已验，整体制品验收待 | 配置时段、功能、角色模型/数据范围/预算；真实合成输出与失败恢复，预算耗尽停止新增，不能用“远期”删除正文要求 |
| F07 INT-001；P3.5；H13 | 未接Clender仍可管理事项/提醒/建议时间，但不称已写日历、核实空闲或无冲突 | 本次边界，Q7/Q8/Q11回归 | 全部相关UI与模型工具回执无虚假日历能力；正式日历集成不暗中启用 |

### G. 运行与交付

| 覆盖 ID / 来源 | 应有行为与适用范围 | 当前状态 / 关联任务 | 用户入口与验收证据或剩余 oracle |
| --- | --- | --- | --- |
| G01 ARC-001/002/LANG-001/PRD-001–004；H1/2 | Windows11单用户本地权威Electron应用，中文对话为主入口；sandbox/窄IPC；无独立服务/运行HTTP服务要求 | 基础001/004/005已审；各任务/Q11 | 可操作整合日常界面；所有新增域trusted严格输入输出，六助手通道保留；真实制品离开开发服务器运行 |
| G02 LOG-001/002；H10；D4.2/10 | 运行状况区分当前故障/历史，默认WARN+，合并重复后台错误，显示等待/运行/重试/待配置/恢复 | REPAIR：最终原生截图发现正常SENDING被错误列为WARN/当前失败；Sol修复严重度与current分离及旧记录兼容，Astra独立复核后重建候选；分类用量账本另保持已有资格 | 运行状况页、权限拒绝、恢复入口；重复错误可合并但重要故障不消失；日志无正文/Key |
| G03 USE-001/002；H10；D9 | 助手/Provider/模型/功能分类用量，实际/估算/未知分离；缓存推理不重复累计，后台可执行预算 | 004/007用量底座及013分类用量、后台预算、实际/估算/未知语义已有独立源码和五类真实角色证据；release-v4新增2次HTTP/6664tokens已独立算术核对；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/daily-013-root-candidate-review.md) | 缺任一请求usage则整链未知，非准确账单；分类用量页、后台设置与限额停止已实现日常候选并经本地反例验证，真实用量及原生整体验收仍待 |
| G04 ARC-003/004；H8；D5 | 默认标准用户路径，程序与数据独立自定义，安装目录data；中文/空格/普通权限；失效恢复不创建第二空库 | 014生产启动/维护已审；release-v4已实际安装于中文空格目录，18→19迁移并从失效位置经明确空A中转恢复backup05到安装目录data B；当前数据可见，最终卸载保护仍待；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md)；[最终安装证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md) | [独立15反例](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-location-review-final-pass.md)覆盖原绑定保护/身份/中文路径/写失败；首次选择与恢复UI、空间/权限实际验证仍待 |
| G05 ARC-004/DIST-001；H4/9；D10 | 带版本/前置检查/失败停止/恢复的迁移与完整备份；Markdown导出不等于完整迁移 | 014完整备份与治理已审；最终安装18→19与backup05恢复已执行；后续撤回/撤权原生恢复及纠正/正式事项删除生产服务fixture共同闭合治理恢复；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md)；[最终安装证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md) | 旧schema数据保留、完整备份与后续治理恢复已验；跨资源故障停止有独立fixture，跨Windows用户不能解密原凭据的边界保留；最终通知与卸载仍Q10 |
| G06 DIST-001/ENG-004；用户2026-09-06发布验收 | 早期PACKAGED路线；最终普通用户安装/启动/托盘/重启/卸载重装/升级保护数据 | 旧版升级/同版重装证据保留；最终release-v4 D352安装包已静态准入并实际保留16文件/76表、首启迁移schema19、重启及受保护Key真实2请求；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-artifact-review.md)；[最终安装证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md) | 全域升级前备份13项校验通过；升级后71/73旧表摘要及12份旧非DB文件相同，另两表按操作归因；普通卸载已清理登录项并保留数据，通知COM注册残留已复现并进入REPAIR；失败恢复及最终制品由Q10继续验证 |
| G07 ENG-001–003/005–010；D11/12 | 精确依赖锁/可恢复构建，真实测试/静态/生命周期/扫描，main双remote非force | 现有链已审；所有候选/Q11 | 每个新差异对应独立证据，历史限域资格不扩大；纯文档比例审核，无报告未来SHA循环 |
| G08 DIST-001；用户发布验收1–8 | 独立整体验收反查文档用户闭环；审核实际安装包，版本/源码/校验/说明/第三方声明对应 | 016证据核对进行中；release-v4源码/安装包静态身份、未签名事实、用户指南及七文件第三方notice ZIP已独立限定核对；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-artifact-review.md)；[说明与声明归档](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/release-v4-user-materials-review.md) | 附件和源码一致，未签名如实说明、不关闭系统防护；只构建或空Release不算完成 |
| G09 用户发布授权/验收8 | 已审精确版本自动同步、创建新tag/Release、上传安装包/校验/说明并实际下载校验 | 实际Release/上传/下载NOT RUN，Q12；传输工具独立静态PASS并双远程同步 | [Release传输预检](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/release-preflight-v1.md)确认既有仓库认证REST路径，不代替POST/资产上传和下载hash；Gitee同步源码，禁止覆盖已有资产/改可见性 |

### 原始后置、可选、非目标完整边界

| 来源 | 原始边界 / 本次去处 | 验收或再决策点 |
| --- | --- | --- |
| AST-005；P5；H3 | 多主助手讨论、并行、互相说服、自动协商、通用Agent调度原始后置 | 不实现为首版硬门槛，不宣称完成；单助手功能不能借此遗漏 |
| AST-007；P3.2 | 读既有上下文但本次不留档、留聊天但不提炼记忆为不同后续临时候选 | 维持严格临时定义，扩展前再立项 |
| MEM-007；P7；H4 | embedding/向量索引可选、独立、可重建且受权限预算 | 全文检索必做；不以向量未选阻塞，不冒充已实现 |
| INT-001/002；P2.1/2.2/5/7；H13 | AIbrowse/Clender真实集成及改造后置；邮箱/日记/AnxReader/游戏/观影/项目文件等逐源授权 | 本次不读真实资料、不改别项目；未来受控工具/任务委托与记忆增量协议另定 |
| PVD-005；H6/13；D6.6 | MiniMax/Gemini/Claude先记录限制，Responses/Claude Messages等原生协议后续独立评估 | 本次有限Chat Completions适配不声称完整原生能力；Qwen/Kimi差异审查仍在B07 |
| PRD-003；P5；D5.2 | 跨设备同步、多用户、网络盘并发/云共享、自建后台服务非目标 | 不承诺跨机器凭据解密或并发共享；本地单应用多开防护仍按交付风险处理 |
| PRD-004；P1/5 | 最终视觉主题/形象/动画/完整视觉系统未冻结 | A02基础形象仍必做；可读、完整、可操作界面必做 |
| P5/7；INT-001 | 完整浏览器、正式日历替代、第二套竞争日程状态非目标 | F07限制必须可见；本地事项/提醒不能删除 |
| P5；D2/6.5 | 任意请求模板/脚本/协议编辑器、大型多Provider框架、通用ORM/工作流/多数据库平台非目标或工程建议 | 工程链选择有限安全实现，不需用户逐库批准 |
| P5；MEM-001/EVT-002 | 不从娱乐或临时情绪静默推断确定性人格/心理诊断 | 观察必须有依据并保留推测性质，D07甄别验证 |
| P2.3/5；DIST-001 | “本次初始化不含安装/迁移/发布”为旧阶段边界 | 本次用户已明确纳入G04–G09，不能继续作为延期依据 |

## 从当前成果到发布的队列

| 队列 | 可观察交付 / 依赖 | 正式任务 / 当前下一动作 |
| --- | --- | --- |
| Q1 早期制品路线 | 现有应用脱源码打包、SQLite/preload/资源/保护凭据和中文空格路径证明；不声称完整发布 | ASAR双PID及[隔离NSIS数据保护路线](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/installer-protection-spike-v1.md)SUPPORTED；正式app/安装/不同版本升级仍Q10 |
| Q2 时间线与助手配置 | 全历史浏览/检索/局部选择；人设/基础形象补全；依赖005 | 006已审时间线/局部选择；[011](011-assistant-basic-configuration.md)稳定人设、基础形象及整合配置入口已审同步072dd39 |
| Q3 权限底座与跨域扩展 | 读取/端点接收/业务政策可配置且每次重查；依赖005，随新增域扩展 | 006已审当前历史权限；Q5/Q7/Q9扩展同一契约 |
| Q4 能力与工具执行 | 协议保真、能力证据、只读真实工具循环、operation恢复；依赖Q3 | 007只读工具FINAL PASS；008记忆、010事项、012提醒及013后台业务工具/角色已有独立与真实服务证据；最终Q11仅结算制品入口和已验证能力边界；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-live-product.md) |
| Q5 记忆/事件事务闭环 | Markdown与治理一致、即时对话记住/纠正/删除、来源面板、全文索引、完整备份语义；依赖Q3/Q4 | 008即时记忆FINAL PASS；013自动章节/仓储/观察/日常整理已完成源码与真实角色层，017本轮来源面板已独立通过并进入release-v4；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-final-pass.md)；[最终安装证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md) |
| Q6 生命周期与清理 | 三区、恢复、消息/区段/时间线意图清理、防复活；依赖Q5 | 009手动核心、v4自动策略、性能修复、状态通知、206文件整合及两PID Electron均已审；release-v4已迁移schema19并执行备份恢复暂停；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-v2-final-pass.md)；[最终安装证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md) |
| Q7 统一事项提案 | 五类事项、对话执行、提案协商确认；依赖Q3/Q4 | [010](010-items-and-proposals.md)TASK_DONE / [独立FINAL PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/items-010-review-final-pass.md)，51/301与131文件清单，精确产品ab11110a45c6ddb65bd114547225dd4e329bba11，双远程已核验 |
| Q8 提醒/托盘/用量健康 | 确定性提醒、可选登录启动、休眠重启补发、运行状况/分类用量；依赖Q7，补发需REM-002 | 012提醒核心独立PASS；REM默认及通知生命周期源码已审；013分类用量/预算源码和真实角色层完成并进入release-v4；运行健康正常SENDING误列失败已转最小REPAIR，须修复和新制品验证；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-review-final-pass.md) |
| Q9 仓储员与日常后台 | 去重分支冲突、章节压缩/未完成话题、事件观察、简报/复盘/周规划；依赖Q3–Q8 | 013章节、仓储、观察、五类日常、运行健康和分类用量已完成源码/本地独立审查；章节及五类日常有真实服务证据，最终原生入口已观察并进入release-v4；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-review-final-pass.md) |
| Q10 位置/安装更新恢复 | 普通用户路径选择/失效恢复、完整迁移备份、隔离安装升级卸载重装；依赖Q1与各schema | release-v4 D352制品静态PASS并已实际安装保留、18→19迁移、自动迁移备份、backup05及失效路径空A→空B恢复；受保护Key重启后新增2次真实请求且旧用量未知未变化；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-artifact-review.md)；[最终安装证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md) |
| Q11 整体功能与制品验收 | 独立从三文档/覆盖表反查用户场景与安全恢复，真实Provider关键角色，所有必需行闭合 | 017来源/变更→正确对象详情与018旧成功回执在最终release-v4均已独立核图通过；A–G证据映射及最终整合有效，仍待Q10治理/通知/卸载/运行中心及016整体结算；[依据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/review017-trusted-independent-pass.md)；[最终安装证据](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md) |
| Q12 发布下载闭合 | 冻结版本/精确源码/资产hash、说明/声明、新tag/Release、下载hash、两remote | [发布传输工具](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/release-transport-usage.md)已独立静态PASS并同步1dea4c5；实际发布上传下载仍NOT RUN，仅Q11及最终制品PASS后按既有授权执行 |

## 关键待决与范围结算

| 问题 | 当前影响 / 推荐准备 | 处理时机 |
| --- | --- | --- |
| AST-006 永久删助手 | 2026-09-06用户确认：保留归档，二次确认删除助手私有聊天/关系/连续性记忆；全局共享记忆和正式事项保留，来源显示原助手已删除，不展开私有原文 | [009](009-retention-and-cleanup.md)实施；该范围已授权，无需重复询问 |
| AST-006 实际私有类型细节 | 2026-09-07用户明确采用建议：助手私有user/event也随所属助手永久删除；全局对象、正式事项及其他助手私有记录保留，不能越范围级联 | 009删除扩展已独立限定PASS：旧副本清理、迟到写、共享保留及过期预览原反例通过，制品联测继续 |
| RET-007 容量/期限/自动清空 | CONFIRMED，用户2026-09-07选择100MiB持久正文/90天暂存默认、两项可调关闭，垃圾永不自动永久清空 | 009实施及独立验收；超限不删除或降级已有内容，不再列用户待答 |
| AST-006 未接受提案 | 2026-09-07用户明确选择：永久删除发起助手时，尚未接受提案也一并永久删除；已接受形成的正式事项保留，必要无正文防复活记录不作待处理提案展示 | 010已解除该门禁并通知执行者，覆盖旧副本和迟到回写 |
| REM-002 补发/合并/过期默认 | 用户2026-09-07确认24小时、同事项最新、多事项合并、超窗仅列表、完成/取消不补发、可调整/关闭 | CONFIRMED；接入未配置默认并补新证据，不覆盖已有用户配置；014实际制品联测仍待 |
| 真实角色Provider必需能力 | GLM聊天、工具续答、记忆、事项、提醒、章节、仓储及五类日常已有各自真实限定证据；不扩张为所有协议能力合格 | 当前安装持久Key重启后的真实记忆链已验；最终变更和制品场景继续按风险验证，确实缺少必需端点时才索取 |
| 完整愿景与发布边界 | 已确认正文（含章节/仓储/观察/日常后台）本次必做；原始后置表保持边界；AST永久删除语义、RET容量/期限默认与REM-002均已由用户确认，实施和制品验收继续 | 不能临发布才悄悄删需求；若新增实质歧义立即汇总而不阻塞独立分支 |
| 签名/许可/外部平台 | 未签名可以如实交付，不能关闭防护；额外证书采购、实质许可证变化或必需账号权限另问 | 实际制品路线判断，不把可选证书自动变硬门禁 |

## 程序完成条件与下一动作

只有同时满足以下条件才改为 PROGRAM_DONE / RELEASED：

1. 本表所有本次必需功能有已审实现、真实用户入口和相称证据，产品待决已解决；原始可选/后置透明，不用测试通过冒充覆盖。
2. 实际Windows制品离开源码、开发服务器、预装开发环境可运行；普通权限下助手、时间线、记忆、事项、提醒、凭据、路径与托盘闭环成立。
3. 合成旧数据升级/迁移/失败恢复、卸载重装默认保护及删除抑制/操作幂等跨模块验证，重要数据丢失/泄密/重复业务/安装不可用缺陷关闭。
4. 独立整体验收与实际制品发布审核PASS；版本、源码、构建、安装包hash、说明/第三方声明对应，不自引用未来SHA。
5. 已审main双远程非force同步，新tag/Release含完整资产；实际发布入口可见、下载内容校验匹配。只push源码、目录中的安装包、空Release、内部预发布都不满足。

当前执行（2026-09-07）：已审仓储/014底座提交2307e490a60af9cfce9f72ba9c0fd0d5ae658f20，195路径暂存字节一致、github/gitee main实际同值。日常可信与renderer已由既有Astra/medium、Sol/high执行者接续，root并行014完整快照及升级准备；全局入口保持单写。

最新里程碑（2026-09-07）：[仓储核心独立PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/steward-013-root-final-pass.md)确认共享发现、独立仓储、分支与冲突、治理缓存失效和真实重启入口；57文件候选、100文件511测试、真实1361tokens。对应D领域仓储/待整理/分支冲突已有核心实现与证据；多事件观察D07、日常F06和运行用量G02/G03按[后续合同](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-daily-observation-contract.md)继续。014 lease/location与session分别独立限定PASS，生产启动/备份和安装发行仍待；并行[备份准备](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-backup-preparation.md)不能当实现。PROGRAM ACTIVE，提交后自动继续。

先前过程记录：当前正在运行：[013](013-background-and-steward.md) ACTIVE / STEWARD_IMPLEMENTING。章节核心及014独立locator底座已提交95db9cfa93673ff6975ddb75ccba56b2d0264828，github/gitee非force push后实查两个main一致；48文件章节独立增补PASS、73/420、真实849tokens，双PID/DOM证据与R7真实IPC/标签小修的比例范围见正式任务。steward_013_trusted实际Astra/medium已接手[仓储员合同](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/background-013-steward-contract.md)，共享DTO已落盘，steward_013_ui实际Sol/high已并行实施UI，随后观察/日常继续。[014](014-windows-data-and-delivery.md)正式启动/完整备份/安装更新仍待，009/012保持INTEGRATION_PENDING；RET、额外AST和REM默认已问待答。早期ASAR/NSIS仅路线SUPPORTED，正式安装升级及Release未验。PROGRAM保持ACTIVE。

历史008启动记录（2026-09-06，现已关闭）：S0合成SQLite/Markdown实验已完成，见[方案](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-s0.md)与[共享接口](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-contract.md)。memory_008_s0（gpt-6-astra / medium）单写main/shared/preload及trusted tests，memory_008_ui（gpt-5.6-sol / high）单写renderer及对应测试；root维护全局记录。前述S0阅读动作已推进为实际实施，事件/权限范围细分随接口同步；新领域尚未验收。007收尾a5041632c09aa3d421654e56a1e76c9e109147bf已非force推送并ls-remote确认两个main同值，不含008产品。

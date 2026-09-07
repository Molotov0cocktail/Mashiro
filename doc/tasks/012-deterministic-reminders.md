# 012 确定性提醒与应用运行承诺

- TASK = 012；状态 = INTEGRATION_PENDING / IMPLEMENTED_CORE PASS；PROGRAM ACTIVE。
- 当前入口为[progress](progress.md)，本任务承接[总覆盖](program-docs-to-release.md)Q8的F04–F05及运行承诺；分类用量、后台预算及重复错误汇总仍由Q8/Q9后续整合，不因本任务拆分遗漏。
- 原文：proposal §3.5及验收正文，high-level-design §5.5及应用架构，detailed-design REM-001/002、ITEM-002及EXEC-003/005。提醒不依赖模型在线或凭据。
- 依赖：[010](010-items-and-proposals.md)正式事项与稳定操作身份；当前已审009手动核心d6cd1fa保留为历史基线，实施时查询实际HEAD/schema。编号012已现场检查未占用。

已实现核心获[独立最终PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-review-final-pass.md)，报告SHA25682550359E78CE578630FCC71B078484569489731A745B0D22AD65AB3C1C1E4AC。精确46文件v2清单SHA256EB22CD59A4A46775D414EADDFE984FCDE5FB1789DEF58F02F0D794AC8112977E；默认61/360及8独立额外反例通过，7处缺陷关闭；最终实际Electron PIDs143756/143776包含原生show、同ID恢复和真实提醒页处理。见[最终协调验证](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-root-final-verification.md)。REM默认、实际OS点击/登录/冷激活和安装制品仍未完，本任务不是全部验收完成。root提交135文件为f34c543d287946ad9302f51577fe30c86a67bdf9，github/gitee非force push均退出0，独立ls-remote两个main实际同值。归档raw尾空格规则为已说明的纯记录收尾差异，其余45份v2候选文件逐项未变。现在继续013/014，不因核心PASS停止项目。

## 用户闭环

1. 从正式事项详情及明确对话指令设置、修改、取消确定性提醒；真实回执作用于同一提醒ID与事项版本。提案接受前零正式调度，不由事项期限自动推导未经确认的通知设置。时间歧义先澄清或用户明确选择。
2. 提醒列表显示计划、系统已观察展示、已处理、取消及恢复待处理的实际状态。通知可打开对应事项，用户可明确处理或调整提醒；事项完成/取消、提醒修改与旧通知回调不能复活旧调度。
3. 窗口打开、最小化及关闭到托盘时按运行承诺调度；托盘可打开应用或明确退出。明确退出停止后台和受管理辅助进程，界面说明退出后无持续提醒保证，不创建未授权Windows常驻服务。
4. 登录启动由用户可见选择控制，关闭后真实取消注册。开发测试不擅自改变用户日常登录项，采用隔离可撤销验证；最终安装制品核验注册路径随安装更新正确。
5. 休眠恢复、启动和应用重启根据已批准的REM-002规则补发、合并或标记过期；一次计划发生拥有稳定身份，重复系统事件、两进程竞争及调度重试不能重复发送同一提醒。系统通知失败/被禁用需诚实显示，不能把调用API等同用户已看见。
6. 无Provider Key、网络断开、模型后台预算用尽时已保存的确定性提醒仍可用。通知与本地状态不把私有正文写入普通运行日志或发给无权Provider。未接入Clender，不声称写日历或已核实空闲。

## 待决与工程路线

root已基于010实际items表和当前main生命周期形成[源码准备方案](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-actual-plan.md)。这是011并行期间的只读准备，未实现提醒、未预占schema；012从011已审并双远程同步的072dd39771e01b29bbced93f49e20a996f1e2cab接续。reminder_012_trusted（实际gpt-6-astra/medium）负责可信域、协议和运行生命周期，先冻结共享契约后协调UI单写；root维护全局记录。reminder_012_notification_spike（实际gpt-5.6-sol/high）已在独立OS-temp合成环境完成Electron44.1.1原生通知事件与身份配置路线验证，仅写自己的实验文件，未改011产品或日常系统设置；[实验结果](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-notification-spike.md)已SUPPORTED（开发态main事件）：A4 Electron44.1.1 PID132972、show后22ms收到show；close调用后6.483秒无close事件，未验点击/冷启动，通知中心残留UNKNOWN。四合成根及进程已清理，无快捷方式/注册表/设置改动；前三次仅Node模式/模块启动失败，最终正确移除ELECTRON_RUN_AS_NODE后进入browser。不能代替最终安装制品验收。

REM-002已于2026-09-07由用户明确确认：默认24小时内补发、同事项只取最新、多事项合并系统通知并可展开列表，超过窗口仅列为过期待处理，完成/取消不补发，窗口可调整或关闭。当前需将已批准默认接入未配置状态并验证，不覆盖用户已有显式设置。可以先实现明确时间提醒、运行生命周期、可测试的策略接口及不依赖默认值的状态恢复。关闭窗口驻留托盘、登录启动可选及明确退出无保证已CONFIRMED，不重复索要批准。

状态和发送身份由SQLite权威管理，计时器只是唤醒信号；唤醒时检查当前时间、事项/提醒版本与取消状态，不为每个提醒长期持有唯一内存计时器。Windows通知、休眠事件和登录注册采用最小适配层便于故障注入；具体API、表及精确依赖由工程链选择。系统通知展示与本地COMMIT无法跨系统原子化，必须定义可核查的中断状态和重复抑制边界，不承诺无法证明的exactly-once用户可见性。

同写src/main/app/index及010 item域之前协调单写；UI有真实日常入口，不能只放开发面板。root维护本任务与全局入口，关键持久化/副作用和Windows制品由未参与实现的胜任Reviewer复核。

## 实施和验收历史（按发生顺序保留）

reminder_012_trusted（实际gpt-6-astra/medium）与reminder_012_ui（实际gpt-5.6-sol/high）按[共享契约](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-contract.md)并行。schema10、SQLite提醒/稳定操作、Provider候选确认及运行适配已在实现；首批可信1文件10测试及node类型检查通过，尚未独立审核。中文时间由模型准备可见候选，本机确认后提交；未确认零调度，普通事项标题修改不取消已有计划，完成/取消/删除与旧通知回调有屏障。

root[零网络预检](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-root-preflight-1.json)通过：实际服务保存提醒→重开同ID、临时Key未恢复→注入时钟与明确合成策略派发一次→重复tick及再重开不重复；0请求，合成通知适配，不是Windows通知或真实进程重启。自然中文live runner已语法/lint通过，Provider合成2文件14测试通过后实际调用2次HTTP200，但startChat返回STORAGE_UNAVAILABLE，候选/计划均未提交；[失败与日期诊断](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-live-diagnosis.md)后已用完全相同原句本地修复复验，随后[真实run2](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-live-product.md)SUPPORTED：2请求8810tokens，精确上海明天9点、候选零调度、重复确认仅一次、同ID无Key重开及合成离线不重复。未把预检或HTTP200当角色能力PASS；真实服务角色和原生Windows资格分别记录。REM默认仍未获答复；合成显式策略不是产品默认。

可信作者已提交[32文件冻结候选](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-trusted-candidate.md)：39files/249tests、node类型/lint/build退出0；Electron02两个实际PID132736/133540核实旧提醒同ID/HANDLED恢复、原生show、关闭隐藏、同托盘handler恢复及明确退出。真实OS点击、登录注册、冷启动激活仍未验，交014。review_012（实际gpt-6-astra/medium）已开始独立可信审核；UI刷新草稿和在途操作屏障仍在修复，不提前判整体PASS。

[独立阶段REPAIR](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-review-stage-repair.md)确认事项快速重开复活旧计划、合并通知单项取消连带关闭。root已[事务/合并修复](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-root-repair.md)，独立原3反例通过；追加跨服务漏广播反例已修复为持久状态快照比较，当前focused16/16和node类型通过，待独立复验。UI已报告刷新/草稿及在途回执修复通过，拒绝候选后复读失败状态补测中。最终统一验证及新清单尚待，不用旧Electron02冒称修复后资格。

UI[10文件正式冻结](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-ui-candidate.md)，22files/106tests和静态通过。独立R1–R6共7个额外反例已全部转绿；最终root静态/build通过。完整61files/360tests两轮默认19workers仅同一retention-adversarial响应性测试超过5000ms，其余359项通过，原样隔离11/11通过；独立Astra/medium诊断正在2workers全套验证，保持期限和断言，原始红态已归档。新增Electron验证将实际切提醒页、点击处理并比对DOM/可信状态，尚未运行。

## 可区分验收

- 明确对话创建/调整/取消与UI同ID；提案零调度；重启不触发模型调用；无Key和离线仍触发合成提醒。
- 同时钟重复tick、重复resume、跨重启、修改/完成/取消后旧回调、发送前后故障注入：不重复建立计划，不恢复旧版本；无法核实系统是否显示时记录真实未知。
- 真实Electron窗口关闭到托盘后仍存活和运行，明确退出后进程结束；打开托盘菜单返回原事项。仅模拟计时器不能代替真实应用生命周期。
- 合成时区/中文时间、时钟跳变、DST歧义和休眠恢复按批准规则验证；不以长期真实等待代替可控时钟验证，也不以可控时钟冒称实际Windows事件已验。
- 登录启动开启/关闭在隔离环境可回收；最终PACKAGED安装位置、普通权限、更新注册路径和卸载保护与Q10联测。

## 清单与继续

- [x] 原文、编号、依赖和用户可见验收准备。
- [x] REM-002具体默认决议（2026-09-07用户确认，默认接入与新证据仍待）。
- [x] 本地提醒事务、对话链、关闭驻留/明确退出、开发态原生通知和真实提醒页处理。
- [x] 已实现核心甄别测试、实际双进程运行及独立最终审核。
- [ ] 实际OS托盘点击、登录注册/关闭、冷启动激活及014安装制品联测。
- [x] 已审核心提交/双远程同步，013已接续；TASK_DONE不等于PROGRAM_DONE。
- [ ] 完成剩余运行决议与安装联测，并完成整体及实际发布下载。

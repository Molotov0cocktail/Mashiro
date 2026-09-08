# 016 文档用户场景与整体验收

状态：TASK_DONE / PRODUCT_AND_WINDOWS_ARTIFACT_PASS；PROGRAM_DONE / RELEASED。独立最终结果见[016报告](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/review016-overall-final-review.md)及[发布验收](../releases/0.1.0/verification.md)。唯一当前入口为[progress](progress.md)，本任务Q11及后续Q12均已完成。

## 验收口径

逐项使用总覆盖中的原始来源、应有行为和边界，从用户入口反向核查。切片测试通过、底层API存在、开发态截图或单次Provider成功都不能单独证明产品闭环。实际实现、UI、相称失败反例、真实角色证据与制品验证分别记录；已有有效证据按差异复用。

## 跨模块用户场景

1. 首次安装后选择程序及数据位置，创建并配置稳定助手，绑定实际连接/模型，设置读取与接收权限，使用受保护凭据完成一次正常对话。重启仍是同一身份与数据；路径失效不创建第二份空库。
2. 浏览并检索旧时间线，选取局部上下文；取消/切换/重启显示真实部分状态。严格临时不读取正常资料、不产生后台业务，显式保存有真实回执。工具及隐藏协议共同遵守来源和接收边界，更换模型不能扩大授权。
3. 通过对话记住、纠正、删除/撤回，核查真实接受Markdown、来源/性质和回执。持久/暂存/垃圾区语义、恢复、助手永久删除及共享/正式对象保留符合决议。旧作业、索引、备份不能覆盖纠正或复活已删除信息。
4. 对话创建和修改正式事项；推测先进入提案，确认、否决、暂缓和协商保持版本及发起身份。确认前不成为正式事项或提醒。重试、取消及结果未知不会重复提交业务。
5. 配置后台角色、资料范围、时段及预算；章节接受后才可按依赖回收原文，摘要继续可读且原文可恢复。仓储去重、分支及冲突、观察推测与接受、简报/复盘/规划/截止变更有可用入口和真实角色资格；撤权与预算不足阻止后续调用。
6. 离线运行确定性提醒，验证打开窗口、托盘及重启补发、过期列表、完成/取消和重复抑制。实际Windows展示/点击/冷激活及可选登录启动由014给出制品证据，不把API show事件当作用户已经看到。
7. 从运行页面解释当前故障、权限拒绝、等待/恢复及已发生业务；分类用量、实际/估算/未知、预算消耗和重复错误合并可理解。不是一组只有测试人员能使用的开发面板。
8. 在隔离合成数据上更新、失败恢复、卸载和重装，保留全部领域及治理状态；程序脱离源码/开发服务器运行。版本、源码、实际附件、校验及下载结果由014/Q12收束。

## 当前已核事实与余项

- 分类源码REPAIR已关闭：正常SENDING/QUEUED/RUNNING与历史记录只读表示为INFO，真实告警及DB/用量不变；[独立反例](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-runtime-review.md)及[v5全量/两PID整合](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/operations-013-root-integration-v5.md)通过。新安装包及最终入口仍需实际验证；v4普通卸载已独立通过，当前保留数据待新包重装。通知物理操作仍未通过，旧COM探针内部CLSID错误不归为产品失败，使用已核的新探针进行有界诊断。

- [独立整体结算](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/review016-overall-final-review.md)已核48项功能、12队列及11项原始边界；非原生功能与治理恢复分项通过，没有新增产品遗漏或待决项。最终通知点击/冷激活、登录开启卸载重装及数据/COM保护、运行中心视觉和实际发布下载仍待，整体不是PASS。

- 2026-09-08当前：运行源码37620929a7f507bb31d41861114cf6f825d715fd，D352安装包已独立STATIC_PASS，206文件850tests中842通过/0失败/8项有单独证据的opt-in跳过，静态及双PID通过。实际18→19迁移、安装前后16文件/76表保留及备份已有[独立限定核对](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-native-independent-review.md)；最终安装版017非空来源/变更→正确对象与018旧回执入口已独立核图关闭，权限暂停与明确重新绑定恢复可见态均有证据。009自动策略源码已审，不再处于POLICY_IMPLEMENTING。后续治理旧备份恢复已由原生撤回/撤权/凭据代际与独立纠正、正式事项删除生产服务fixture分层结清，未冒称所有操作均原生执行。仍待实际通知点击/冷激活、最终登录开启卸载/重装与安装目录data保护、运行中心最终视觉及整体覆盖结算；PROGRAM ACTIVE。

以下保留此前候选观测，当前事实以本节首项及其证据为准。

- 历史已审产品 `f04fe24e7d3cb395bc976db8190969be38ba632e`：136文件641tests，额外Provider边界4项、最后DailyPanel DOM 8项，最终原生run `f8198eef-14e6-4352-ad1e-c2773543aee3` / PIDs186136、171612通过。原生失败与修复诚实保留。五类日常真实角色、章节及仓储真实资格已有专门报告。
- 当前已审源码为 f4fb5c7，017、018、schema18治理及通知生命周期修复均有独立限定PASS；当前内部制品身份和实际安装进展见[014](014-windows-data-and-delivery.md)。schema15→18升级及同版重装已经执行；[独立升级比较](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-upgrade-root-comparison.json)显示71/73旧表行摘要相同、12份旧非数据库文件字节相同，另两表需按明确测试操作/调度字段归因。v6通知运行与退出后均保留；点击冷激活仍待；当前安装版持久Key保存后正常退出并由新PID无重输完成真实合成记忆写入，[root独立账本核对](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-provider-root-ledger-check.json)确认2次HTTP/6515tokens及1次工具和记忆增量，最终Markdown与剩余制品场景继续验收。
- RET-007已于2026-09-07确认100MiB/90天默认、两项可调关闭及垃圾永不自动永久清空，009现进入POLICY_IMPLEMENTING；014治理/schema18源码已独立限定PASS，当前制品治理恢复及完整安装生命周期继续验证。这些不能改名为可选项或被测试数量掩盖。
- 最终独立验收需记录实际审阅者及与对应实现的关系；不能由作者自称独立PASS。既有高风险模块独立证据保持有效；新增差异另审。主协调负责证据和总覆盖更新，不以本任务文件宣告完成。

## 已确认缺口与去处

独立只读预审plan_007发现MEM-002缺本轮具体记忆来源/提供版本和对象导航，root已核proposal §3.3及Provider/MemoryPanel实际路径，纳入必需[017](017-round-memory-provenance.md)实施。既有008单对象来源详情不被作废，但D03不能再以此整体结算。预审未发现整类确认需求被总表排除；已有013积压响应性和015有限兼容证据不被误报遗漏。该预审不是整体或制品PASS，实际模型元数据未披露，角色历史参与007规划也如实保留。

旧轮超过384条后的回执入口已被[独立整体预验](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/review016-overall-preacceptance-repair.md)证实缺失，随后[018](018-old-round-business-receipts.md)实现按原requestId懒加载可信回执及恢复操作；[独立最终限定PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/review018-independent-final-pass.md)覆盖10文件55tests，审定提交0a1a2e5已同步双远程。当前安装版已实际展开旧轮空回执入口；这不冒充安装版真实业务恢复动作完整验收。017来源/变更入口同样已源码独立PASS，其最终制品用户场景仍由014/本任务收束。

## 完成条件

- [ ] 总覆盖每项必需功能均有实现、用户入口和相称验收；原始后置/可选项清楚保留。
- [ ] 上述跨模块场景在对应实际运行环境中闭合，失败状态和恢复可解释。
- [ ] 缺口已修复并独立复核，不存在占位、只有手动CRUD或未经授权放宽隐私/长期语义。
- [ ] 独立整体验收结果可追溯至候选与制品；014发布前门槛全部满足后方可PROGRAM_DONE。

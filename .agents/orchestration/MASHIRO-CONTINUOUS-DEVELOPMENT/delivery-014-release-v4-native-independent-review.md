# release-v4 原生里程碑独立证据核对（进行中）

2026-09-08，review_017_trusted，继承实际gpt-6-astra/medium。仅读取已归档脱敏报告与源码，不读取运行中的合成数据、不操作桌面、不重跑已关闭产品测试。root维护全局入口，steward_013_ui唯一原生owner。**LIMITED_EVIDENCE_CONSISTENT，不是最终014/016或发布PASS。**

## 已独立重算

[独立比较结果](delivery-014-release-v4-native-independent-comparison.json)直接比较pre-upgrade/post-install/post-first-launch及Provider before/after JSON，而非仅转述root verdict。

- pre/post installer两个源报告SHA与root-install-preservation引用一致；16文件逐项完全一致、76表schema和全部row digest一致、datasetId/selected一致、均schema18。安装器未提前承担首次启动迁移。
- first launch为schema19/82表，新增六张retention_policy表；15非DB文件不变，仅mashiro.sqlite改变；76旧schema都相同、73旧row digest相同。余下仅daily_configs1→1、production_governance_commits7→0、production_governance_state1→1。不能把7个已结算事务token清理称为7条业务或治理记录丢失。
- 生产authorizeProductionGovernanceMigration顺序为settle原治理→核候选dominance→rotate候选instance并清commit token→enroll新anchor→由准备层发布候选，支持root对token/state变化的解释。当前快照selected/其它治理表digest保留与该机制一致。
- Provider两个源报告SHA与root引用一致。recent12窗口有10条交集逐条相等，新增两个SETTLED属于原chain395bf025-2c88-403e-908e-1940139a6f7f；总attempt12→14、unknown3不变，token增加6664。没有把窗口外两条旧ID当丢失，也不声称本次逐行比较了窗口外记录。程序58HTTP/103341known/5历史unknown是root此前累计56/96677/5加本轮2/6664的算术，不能与本dataset14/3混为一谈。

## 归因和证据边界

root-migration-backup记录自动迁移备份a921dbed.../16payload与pre字节一致；root-backup05记录e25f2bb0.../17payload校验、schema19/integrity/FK、原395bf轮提供43c35979...version1 RESPONSE_OBSERVED、usage仍14。此次只核归档报告一致性，未重新打开外部备份或独立解密/读取凭据。

daily_config比较仅last_tick由16:59:44变19:49:03、其它字段hash相等，来自原迁移备份与**后来**backup05。它支持该观测区间内定时器归因，不能把后来备份当精确first-launch时点的完整字段快照；root已明确这一限制，未发现需要修正文案的归因错误。

native milestone01的安装包/EXE/ASAR身份匹配已审D352/73A4/F310；firstPID226268/restart222420、非空017/018及未重输Key是owner原生观察，PNG/UIA独立核对尚待。RESPONSE_OBSERVED不代表模型采用；成功旧clock回执不能说成原生unknown恢复，按review016-old-receipt-acceptance-scope-03分层复用已审55项。

原helper nestedtransaction运行FAIL、原scene回滚和修后384成功已由delivery-014-old-receipt-helper-review-03闭合；不是shipping产品变化，不覆盖旧失败。

## 恢复后017暂不可见的当前解释

owner报告B恢复后仍有原source/version/dispatch state/change记录，但正文入口unavailable。源码pauseRestoredWork明确禁用provider_connections并删除assistant_provider_bindings；MemoryService.round在当前endpointFingerprint缺失时隐藏正文/操作，保留无正文历史证据。因此这一现象尚不能认定恢复丢失。

明确用户UI操作为重新启用原连接并保存、给原助手绑定原model/连接，再检查记忆scope读取和当前接收方许可；保留后续撤权收缩，只有明确授权才恢复。随后重新展开同一395bf轮，零新Provider请求。若仍不可见，按对象version/撤回/来源约束核查，不能用新回答覆盖旧证据。实际重新授权及图像待owner交付。

## 总覆盖表可更新的精简映射

| 覆盖ID | 可复用依据与仍需保留的边界 |
| --- | --- |
| A01/A02/A04/A05/A07，C01–C04，D01/D04–D07 | 010正式事项/提案及助手删除、011配置、013章节/仓储/五日常角色正式独立+实际角色+原生证据继续有效；旧Q7/Q9文字不要求再跑同一角色。background-013-review-final-pass、steward-013-root-final-pass、daily-013-live-product及既有原生报告可连接。最终整合回归已覆盖新域权限/临时边界。 |
| B02–B07，F01–F03/F06/F07 | items-010-review-final-pass/live-product/update-live-product，reminders-012-review-final-pass/live-product/root-final-verification，三个013角色资格可结清“提醒/后台继续”的源码/角色层旧字样。GLM有限端点/model资格不扩成DeepSeek/Qwen/Kimi LIVE；未接Clender的边界仍保持。 |
| A03/A06/B05，D03 | 已审018/017源代码与DOM、持久化反例+最终包ASAR对应；当前非空旧成功回执和017source/change/object/restart的最终原生视觉待独立对账。 |
| E01/E05 | 009 v4功能/性能/状态通知/全量与原6条Electron已过，旧POLICY_IMPLEMENTING及6→0待修可更新；100MiB单样本60.49s后台UNKNOWN限制保留。最终安装恢复暂停与设置显示随本轮native补齐。 |
| E02/E03/E04/E06，G05 | 009三区/清理和013接受结果→回收→恢复、014治理独立反例可复用；本轮已核安装保留/18→19迁移/backup05，原位置丢失A→B及later治理实际恢复仍待owner证据，不因旧Q9再做全部角色。 |
| B01，G01/G04/G06/G07/G08 | 376源码冻结、全量/静态/两PID、D352静态准入、本轮安装保留/迁移/受保护Key重启有限事实可结清对应层；G04路径恢复视觉、G06最终启用登录卸载/重装保护和Toast COM残留关闭仍待。G08用户指南与七项notice ZIP已独立限定PASS。 |
| F04/F05，G02/G03 | 012默认补发/确定性调度及013运行用量源码/真实服务证据复用；本轮2HTTP/6664增量已核，仍待最终应用运行中心状态/分类用量视觉及实际通知点击、退出保留、冷激活/托盘登录链。 |
| G09 | 实际tag/Release/上传/无凭据下载校验仍未完成，不用传输工具静态PASS代替。 |

截至本报告，仅需按既定队列补原生视觉、路径/治理恢复、通知与登录卸载重装、016最终分层结算及实际发布下载。未识别需重新全功能测试的新源码缺口；报告后新原生事实应另按准确证据更新，不把上述待项预写PASS。
## 017 同一旧轮恢复授权后的可见态（限定视觉核对）

已独立实际查看两张冻结PNG并读取对应JSON，全部SHA匹配owner冻结身份：

- provided01 JSON 0E597BDAEC37FBC5F93BCACCF4B06C2625B8E35478BD3F66C0982615C6FB5476，PNG B767E714308C6528A0F3698112280704FA6DAD5FE494AA066DDB871D968A974E。
- change01 JSON 50A6135AEAA3063B59139710DF003A571A3DC0569D259E1B50A65AB817CCCCB5，PNG 2C2C829FB658D755E2C73680DC8ACA9FF8B26C3260B24A45FAEE027755251A2E。

两份记录均PID235296/window30548710，request395bf025-2c88-403e-908e-1940139a6f7f，与restored01暂停态相同。provided对象43c35979...v1，变更operation3cd09f98.../对象f93a4a2f...v1，与原持久化/原native milestone身份一致。

provided PNG实际可见“提供版本v1”“已观察到Provider响应”、派发2026/9/8 03:31:26、安装验收代号正文、接受版本v1和本轮用户原话来源；同时可见不证明模型采用，以及接受正文不等于完整外发内容的提示。change PNG实际可见“记住”“已成功执行”“本轮操作已成功提交”、对象版本v1、本轮合成验收代号正文和来源。两者均可见“打开记忆详情与操作”按钮。

UIA名称/对象元数据及几何排列与PNG对应；此次JSON **未保存offscreen布尔字段**，不能声称从JSON直接核到offscreen=false。PNG直接证明所述正文与按钮可见，无需把旧restored01滚动前offscreen记录移用到新图。

结论：017提供/变更面板的非空恢复可见态限定通过，原暂停态没有被改写成丢失或旧证据消失。owner报告仅显式启用原连接并重绑GLM、read/receive原已On、无新Provider请求；本视觉核对不把截图当网络计数，最终用量仍按owner后续账本和既有增量证据对账。**按钮可见不等于已经点击并打开正确对象**，该对象详情与018真实旧成功回执截图仍待后续；不提前给整个017/018或016最终PASS。
## 017 对象详情与018旧成功回执最终制品用户流

本次独立实际查看冻结PNG，并核JSON/SHA：

- memory-object-detail01 JSON B600522E1CA9D81AB9F3343B78B074BA1B2B113BA441E4620664507D7ABBF6B7；PNG 01057B886F78B970F2C9FF096DCB0CB06C81A7E29095B0CF6592D31762A73162。
- old-receipt-visible01 JSON 37F3D79B9DFD031A96FEA06BDCD32C5C91FFCEC99895A91B4887A46F94B8E5DC；PNG A4EE42E29087963AC1859776C8D2881C49A6DEB31852231E2BCC7DCA1E5F9364。

两组仍PID235296/window30548710。017记录sourceAction为原轮“打开记忆详情与操作”，对象f93a4a2f-430f-4f28-acc4-31f7f803e844/version1；PNG已切到“记忆与事件”，右侧编辑区标题“本轮验收代号（合成验收）”及原合成正文与此前变更卡片吻合。UIA同名Edit值吻合，纠正当前版本/保存纠正版本控件存在且记录offscreen=false；截图边缘裁切不夸称保存按钮全文在图中可见。此次只验打开详情，没有保存纠正或制造新变更。

018 PNG在完整正常历史中显示本机时钟、已完成、完整operation65f43282-9144-4d5c-b5fb-8577e5336f56，及“查看和核查不会重发模型请求或业务命令”的说明；UIA该工具/状态/op字段offscreen=false。该图滚动后没有显示轮次标题，JSON关联E2E_TOOL_NORMAL/request5e34c10f-c747-4be2-8e7b-e8e8c59871b7，与原真实旧operation及已审384追加窗口证据一致；“此轮业务与工具回执”标题的offscreen=true保持如实，不把所有UIA元素一概说成可见。

**已关闭的最终制品场景：** 017同一395bf旧轮在正常重启/备份恢复后保留提供v1/RESPONSE_OBSERVED和真实remember变更，暂停绑定时隐藏正文，显式恢复连接与绑定后重新显示接受正文/来源，并由原入口打开正确当前对象；018超过近期384范围的原旧成功回执可从正常历史按原轮打开并显示精确身份。结合既有可信/DOM/持久化独立证据，可结算D03及A03/A06/B05相关017/018入口层，不另造pending/unknown原生夹具。

**没有声称：** 成功clock详情不是原生unknown核查，也不是pending确认。原ID确认/未知核查、迟到/撤权/模式边界按review016-old-receipt-acceptance-scope-03复用正式55项源码/DOM/SQLite证据。查看界面的零新增Provider由既有准备工具与owner最终账本对账，不由截图单独证明。此限定闭合不等于整个014/016完成；later治理恢复、运行中心/分类用量、真实通知点击/冷激活、登录启用卸载/重装保护与实际发布下载仍按原队列完成。
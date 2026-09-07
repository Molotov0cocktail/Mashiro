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
## 后来撤回与接收许可在 backup05 恢复后的限定核对

结论：本组 **LIMITED PASS（撤回、接收撤权与恢复暂停）**，不等于全域治理或016最终通过。只读已冻结JSON、脚本和withdraw PNG，没有读取B/C数据库、解密凭据或操作桌面。owner记录真实选择backup05恢复到空C并正常退出；备份身份复用既有root-backup05的17项payload SHA核验，不能用早于f93创建的backup04替代该证据。

独立实核SHA256：

- governance-snapshot.mjs：4BEAE73CA2A5C8B6C08696F5C890B70D8C223502B007034D722525D3BD1F37D5。
- governance-later-before-restore.json：9E680C3A017A66678A18A144EA82BECF1CEBCCFB35ABCC79CD0D9E7FEA97F07A。
- governance-after-old-backup-restore.json：294C83574DC99F2E5E9AF509732C0C47C609BAAC7A976B0BE6A3F2ED8A97FF56。
- governance-withdraw-01.json：2D74B7A4085DE5CEBABA658275AD8BFF834B87B4058A13C18496349C76F135A0；PNG：665744C43A257948480AA420257733BB213BDC577A1EE26A3AD2BA68D8700B3B。

两个快照dataset均9f2cf384-daa4-4bb6-819a-33976e479c5a、schema19、integrity=[ok]、foreignKeyViolations=[]。f93对象两侧仍version1/suppressed，markdown为空SHA，版本fileName为空/bodyHash为空SHA/metadata为空对象SHA，withdrawal抑制身份逐字段一致；文件清单均无f93正文。原backup05含该对象接受v1，恢复后并未复活该正文。withdraw PNG实际显示“撤回信息及派生副本”、精确一个记忆版本、“受管副本清理完成·4/4”；并未显示执行正式永久删除。

私有read仍1、同接收方assistant allowed仍0/global仍1，权限及接收方两整表hash一致。usage_attempts整表hash一致，仍14次、11 settled、3 unknown、0 sending、已知13291 tokens；不是把unknown计作零。memory_versions、suppressions、round_evidence与protocol_segments整表hash亦一致。daily/steward配置和作业整表hash一致，daily仍关闭。

差异保持如实：f93 title/record hash改变；production-governance-apply.ts的恢复投影明确替换为“旧版本内容已被后续治理阻止”、空正文/来源并置trash，因此不要求旧抑制对象记录字节不变。连接enabled仍0/version5，但hasPersistentCredential由1变0，after清单新增credential.revoked；同文件夹内80字节密文仍存在，不是物理删除。源码对旧备份连接代际落后的密文保守失效，要求重新提供Key。绑定1→0符合pauseRestoredWork。retention_jobs 3→2、items9→5：恢复早期备份不承诺复制备份之后的作业历史；tool_operations仍388而整表hash改变，与治理按引用抹除回执的机制相容，但当前摘要没有逐行差异，不能据整表hash冒称每个operation已逐字段归因。

快照脚本固定合成路径、普通非链接根/DB检查、只读SQLite，输出受限字段和hash。它没有自己锁定进程/事务一致性，证据一致性依赖owner正常退出后的采样条件；不是在线原子快照。credentialContentRead=false应解释为未读出/解密凭据正文：递归文件SHA确实读取密文字节。17张表摘要也不是全82表全面治理证明。

此次未新增“后来普通纠正”“正式永久删除”原生操作。既有独立治理源码/SQLite反例可按风险复用，不需为这两项重复全角色矩阵；若最终验收要求这两项也有安装态直接证据，最小补充是各一项明确旧备份前后身份/版本与屏障摘要，不能把本次withdrawal换名充当。剩余通知/生命周期/实际发布等按原队列处理。
## G05 / E04 / E06 治理恢复的分层结算

**可按风险复用既有证据，关闭这三项中的治理恢复要求；没有发现必须再跑一次最终安装包纠正/正式删除UI矩阵的机制缺口。** 这不是把旧报告的局部PASS自行扩成整个016通过，而是以下独立证据与最终制品/原生接线的组合。

- 纠正与版本下限：正式[014 v4独立报告](delivery-014-review014-final-v4.md)的26文件65项包含 [production-governance-restore.test.ts](../../../tests/integration/production-governance-restore.test.ts)。它使用真实MemoryService记住、完整session备份、普通correct v1→v2和撤权，再恢复旧备份，断言version2/suppressed/空正文，逐文件拒绝旧正文，健康对象仍保留而模型来源读取按新权限拒绝。是Windows合成生产服务/SQLite/文件系统fixture，不是最终安装UI纠正操作。
- 正式事项删除：既有 [item-domain-oracles.test.ts](../../../tests/integration/item-domain-oracles.test.ts) 的确认批删场景实际preview/confirm正式父子项、保留无关项；已独立审查的production-governance-apply对kind=item墓碑明确保留墓碑并删除旧items及来源。真实session、损坏READY日志和回滚/提交token的[独立fixture](../../../tests/integration/production-governance-review014-independent.test.ts)补足治理持久与失败停止；[空A桥接恢复fixture](../../../tests/integration/review014-empty-bridge-restore.test.ts)证明恢复按原receipt数据集查later治理，不能用新A身份绕过。注意这两个fixture的墓碑具体为proposal，不能改称“正式item删除后完整恢复的一条端到端测试”；本项采用业务删除、治理分支源码、通用持久/恢复机制的组合证明。
- 失败及容量：v4报告保留真实session准备/重开、损坏日志拒绝恢复且原库/备份/locator字节保留、失败目标不能正常选入等反例。[v6独立报告](delivery-014-review014-seed-v6-final-pass.md)4文件9项关闭旧8MiB读写不一致和最终stat截断，保留大型journal吞吐未测边界。这里的故障注入/Windows文件及lease fixture不是最终安装进程断电测试，不借名称扩大结论。
- 最终接线与制品：本报告已核D352安装包/F310 ASAR与冻结376源码及五份out身份；最终整合206文件850项中的842通过、8明确opt-in跳过，复用root最终报告，不宣称本次重跑。真实安装18→19、原位保留、自动完整迁移备份、失效路径空A→backup05→B，再按同一原数据集backup05→C，补足此前局部报告尚未覆盖的最终应用恢复入口与治理加载。本轮原生直接证据是f93撤回/接收撤权/连接与凭据代际屏障/后台暂停，不是普通纠正或正式事项删除原生演示。

因此E04后来纠正/删除/撤回优先、E06旧备份不复活已撤回正文、G05完整备份与治理恢复可分层结清；正式删除不承诺物理已删除正文可恢复，丢失原配置后无法凭空重建备份之后的治理仍是既有诚实边界。当前逐operation摘要只待补充解释已列整表hash差异，不构成再跑业务的理由；若出现具体未抹除正文或墓碑缺失的新证据再转REPAIR。G05以外的最终通知、卸载/重装及实际发布下载仍独立待办，不由本节签结。
## 正式事项确认删除 → 旧完整备份恢复的独立窄反例补证

新增 [review014-formal-item-restore.test.ts](../../../tests/integration/review014-formal-item-restore.test.ts)，最终SHA256 A4531D3B5F0A1D9E29BC963E40ED99038FC42C0973CC03BE1F961B2C69DBD1E6。使用新建隔离合成根和真实ProductionSession/SqliteStore/ItemService：创建两个正式事项，被删项持有一条指向保留项的实际来源记录；先完整备份，再通过真实preview及confirm删除，确证kind=item墓碑；restore旧备份到另一空目录后，被删items行不存在、墓碑保留、其非空来源由1变0，无关事项完整SQL行逐字段相等且query只返回该项，integrity/FK有效，原backup SQLite字节不变。来源可用性回调为固定测试接缝，本测试没有验证外部来源权限；删除、SQL、治理和备份恢复均走生产实现。

[首次run01](delivery-014-formal-item-restore-review-run-01.json)1/1通过，无业务RED。首次静态Node类型通过，但新增测试finally直接throw触发no-unsafe-finally（工具f1bad8）；保留此失败事实，改为同义独立清理保护函数后原业务断言不变。[最终run02](delivery-014-formal-item-restore-review-run-02.json)1/1通过；格式、单文件ESLint及Node类型检查串行退出0（067b20）。没有重跑完整suite、Provider或桌面，也未修改src/out/package。

此证据补齐上一节明确区分的formal item删除→session.restore实际接缝，结论为该窄fixture PASS；仍不称最终安装UI上执行过正式事项删除，不新增发布门禁循环。

## 原前后快照的 operation 逐行差异补充

独立只读helper与冻结摘要，并重新计算ID/行hash/字段hash差异，结果与root comparison相同。helper SHA256 5A6FFEEC9D8822EDD99A7EBE416ACD6E631078DDD3E8211B1D48D24838DD0D66；before SHA46918E5AF7EDA26829FA6FD258FE41C76CEEBCB2B7DA24B0E9B192BE4832792B；after SHAC696CB259D0BCAA2CD14222C4F31F984B66A4D6D9284F5EF5296277FB0A49577；comparison SHABC27BA42D32182A4918DC8AE0372C7AEA527A2AF26C530B5317F51D33601DDB8。

脚本只读事务内读取三张固定表，三表count及canonical整表digest必须匹配原phase报告，输出wx；本次独立核实reference SHA及三表值均对应原冻结before/after，因而不以路径后来重命名或整DB文件hash改变猜测时点。388工具中386整行相同，仅7047bddd-41d8-44b6-a465-f9d67ca88c1f及89bf8311-b044-47b7-907f-b928af63532a的record_json字段变化；二者同395bf请求/2984eef9-129a-49a5-9a78-b9c017698020 segment，SUCCEEDED不变，其余SQL字段hash不变。387协议与14usage逐行完全相同。

这关闭此前“尚未逐op定位”的限制。record_json仍只有整体hash，尚不能把具体嵌套键修改逐一称为实测：源码的固定summary/citations及memoryReceipt/retentionIntent/retentionPreview删除与范围相符。若需要精确到该转换的证明，只需这两行afterRecord与beforeRecord应用该固定转换后的深等布尔值，或顶层字段hash加固定值/字段缺失布尔摘要；不要输出正文，不需业务重跑。当前保持record_json范围已定位、业务身份与用量未变的限定结论。

## 两条回执的完整语义归因闭合

root首次仅比较before→production-governance-apply:185 SQL→after的oracle实际FAIL（b148d6），保留，不改成通过。独立新增 [op-semantic-diagnosis.mjs](delivery-014-release-v4-op-semantic-diagnosis.mjs) 与 [首次诊断JSON](delivery-014-release-v4-op-semantic-diagnosis.json)：先实核backup05精确manifest SHA/backupId/数据集及17项payload大小/hash；只读事务分别读取原before归档B、after和backup05两条记录，before/after整行hash必须匹配此前冻结摘要。未写业务库、未解密凭据，输出只有字段名、存在性、子hash（无正文）。

实测两条before→after的唯一顶层差异均为summary，**没有任何时间字段差异**；backup→after第一条另有memoryReceipt删除，第二条仅summary变化。真正backup基底执行该单条SQL后仍不等，剩余也只有summary。因此“只是备份时间回退”的猜测不成立，单条SQL不是完整生产转换。

源码实际链还调用production-governance-redaction.ts的scrubReceipt，最终固定summary为“操作正文已被后续治理清理”；原位retention-service的固定摘要则是“操作内容已清理”。独立用固定字符串的JSON SHA核验两边子hash，均精确相等；单条SQL产生的中间摘要“内容已被后续治理阻止”亦匹配诊断hash。完整记录在仅替换为最终scrubReceipt固定摘要后，与after规范化深等；没有忽略任何时间、权限、状态或其他字段。

[第二份结论](delivery-014-release-v4-op-semantic-diagnosis-02.json)记录两条均通过该完整语义等价核验，同时明确originalSingleSqlEquality=false。结论为**归因PASS**：两条回执差异是两条生产清理路径使用不同固定占位摘要，业务身份/状态保持且旧正文回执没有被恢复。此补证关闭上一节嵌套字段未核的限制，不新增业务操作或发布门禁。

## v4 开启登录后的普通GUI卸载限定通过

独立读取pre/post/comparison及manifest，逐字段重算data/unknownFile/location相等，全部18数据条目路径/类型/大小/SHA保留；5份manifest文件大小/hash零漂移。manifest BB31AA35920B82D10C65D32D76F4C08B8B426F87676B522AE17F476ABD7D5B92；pre 4E1E2009AC4A52B1037C7BF5B75CED30901EC0730029664FBDE52CFBCF39B068；post E00E9589C1287676D17A1B45B4B6785D85065ED653482FC86308EBC37E40769A；comparison 0913A475E60F55274FCB53D5D93771F7BCC349AB68F116CACE08221D68002749。

D352/73A4/F310安装态，正常菜单退出PID233116后精确进程0。pre实际Run存在，值为带引号本EXE加--mashiro-login；post Run不存在，未先关闭登录。StartupApproved前本就不存在，不能宣称本次实际删除该值。程序EXE/ASAR/uninstaller、快捷方式、卸载注册移除，安装目录因data和51字节未知文件保留。四个已知自有CLSID（B505、14AB、4750、77ECE）的LocalServer32由4→0；独立核各CLSID根default/CustomActivator元数据逐字段不变，非空根保留符合精确清理，不当作旧可执行注册仍存在。

真实操作不是一次顺利启动：共3次launcher，两个身份确认后的重复窗口PID237544/246608被取消，仅PID237304的C次流程走下一步→解除安装完成→完成。此处GUI动作依据owner冻结记录，reviewer没有重新操作桌面。先前COM探针旧CLSID错误和真实点击未通过均不被卸载成功覆盖。

结论 **UNINSTALL LIMITED PASS**，关闭v4真实登录Run/已知COM默认注册清理与安装目录data/locator/未知文件保护。可作为仅operations分类修复的v5复用安装器依据，前提v5构建仍核NSIS生成宏/owned策略无行为差异；不要求重跑旧REG_SZ/全部卸载矩阵。v5新包实际身份、重装保留和修复后运行中心/通知点击仍需对应证据，当前处于未安装等待v5状态。

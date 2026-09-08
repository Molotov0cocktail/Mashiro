# Release-v6 native independent review

2026-09-08 Astra/medium。**UPGRADE_PRESERVATION LIMITED PASS**，只读owner确认冻结的两份JSON，未访问活动数据/Registry/桌面。最终新Shell身份、卸载重装及实际点击仍待对应证据。

pre SHA3B087EE2923A6734CB13309DD575DCE30560CA793D23C04EA8218E2D7F66E42C；postinstall-prelaunch SHA8B6253E33E17A4DE762D9DFDBF4A651985C51BA379AD67BA34E097C8CC40B4F9。独立逐字段比较[结果](delivery-014-release-v6-upgrade-independent-comparison.json)：18项data路径/类型/大小/SHA完全相等，location整对象（含085565…2FA8定位SHA、dataset9f2cf384…、原路径）相等，51字节unknownFile及SHA B9192933…15CC7相等。两时点精确安装路径进程数均0，符合启动前比较。

实际EXE由v5 3BD变为v6 33F79D190010A5A6E0C3B9AFDC4D3E14020BCEA272BEDBD209508CFA684454D7，ASAR由BD19变为7659DE497E76AD04CABDBF6956F9BC519ED8E0B3AF1E1FCC4F423B22DC459F0E，与独立静态制品匹配。uninstaller变为138891字节/BEF780A2FBE18C7DF8A784316B8836C844E621A6296FD443AB70B552F820592F，不声称与v5同字节。

卸载注册GUID5555e988-f7b5-5fe3-b6bd-8df3b21f793e及精确UninstallString前后整对象一致。旧Mashiro.Desktop Run从存在变不存在，新生产名从不存在变存在，类型String及带引号精确安装EXE+--mashiro-login命令与旧值完整相等，原On选择迁移。旧/新StartupApproved前后均不存在，本次不冒称验证实际Off binary迁移；该边界复用独立真实NSIS合成测试。owner comparison01与独立结论相符。

本项关闭v6同路径覆盖升级的数据保护、安装身份保持与实际旧Run迁移接缝；不证明随后启动/UI状态、Shell解析、新宏实际卸载或真实通知点击已通过。既有治理恢复/017/018/角色流程按未变源与已审证据复用。

记录限制：owner comparison01的observedAt为11:43，早于所引用pre12:24/post12:32，应视为待勘误的比较摘要时间，不能用其推导执行时序。本独立结论依两份真实source快照的字段和时间，不因该摘要时间错误重跑业务。

## First launch / Shell identity limited pass

首次启动冻结firstlaunch-identity01 SHA2C68CB0D8DF1D0F8B44453572BC2B20F438BDBB349BFD0FDC7F6A343D7A2043D，12:37:41+08实际PID47376/HWND857002、标题Mashiro，EXE33F79…4454D7与v6制品一致。AppsFolder对新生产ID io.github.molotov0cocktail.mashiro精确匹配1项，显示名Mashiro、目标为安装Mashiro.exe；Start Menu shortcut A63E66…AB48E同ID/同安装目标/空arguments，CLSID53630587-95B7-41B2-A36B-D9D6A45B0277。

这些字段直接关闭旧反例“Shell对生产ID解析开发Electron”的本次安装态身份接缝，**SHELL_IDENTITY LIMITED PASS**；不据shortcut的CLSID字段宣称该报告还验证了LocalServer32或真实通知交付，也不把普通首次启动当通知冷启动成功。报告明确未记录其他AppsFolder条目、未读取或改共享Electron链接。

comparison01-errata SHA7FDF85CF781F45CB2AD240D39EFED1A4DB3CFDF040232405BD219357493EE840承认11:43手填时间无效，保留原文，使用pre12:24:06、post12:32:59及比较文件12:34:14顺序；与本报告此前记录一致，没有改动原字段或source hash。时间归因闭合，不需要重跑升级。

新宏实际卸载/重装、新身份真实通知点击和进程为零后的导航仍待；原生owner继续执行，本reviewer不操作现场。
## v6实际卸载：数据及登录清理限定核对

独立对比preuninstall SHA FEE2C71DA629213DB5A5511F8AD4A3C1F3C63FE9892493377959EF420F9C6F0A和postuninstall SHA3F47CFA3FE48E2867B6A352FDCB5DC510D546F3117DB139648E4423B847AFA7D，结果见delivery-014-release-v6-uninstall-independent-comparison.json：18data entries整对象、location及unknownFile完全一致；pre当前新Run On，post清除；旧Run原已不存在，不能称本次又删除旧Run。EXE/ASAR/uninstaller/固定GUID注册从存在变不存在，前后精确进程数0。StartupApproved两名本次仍前后不存在。

这两源文件没有shortcut/COM/AppsFolder字段，所以本节仅关闭实际卸载的数据保护/程序及当前登录清理范围；owner回报的5363/D7 LocalServer及AppsFolder清理待单独冻结证据。重装及真实点击继续由唯一owner执行，不阻塞现场也不重跑矩阵。
## 原路径重装启动前限定通过

postreinstall-prelaunch SHA2EFF54F304E152F24BBA30C652741F543BADEE8E2327A341E6243FCCD3CE1C16，观察12:53:13+08；独立与postuninstall3F47…AFA7D逐项核对，18data整对象、location、unknownFile及安装路径完全相同。EXE33F79…4454D7、ASAR7659…459F0E与v6精确匹配，uninstaller138891/BEF780…0592F保持该候选。固定GUID5555e988…793e注册恢复，旧/新Run均不存在，启动前精确进程0，符合完整卸载后不自动复活登录选择的已审语义。

结果delivery-014-release-v6-reinstall-independent-comparison.json，**REINSTALL_PRELAUNCH LIMITED PASS**。不据重装后的注册状态倒推卸载时COM/shortcut/AppsFolder清理，也不据此声称重装后显式On或真实通知点击已完成；继续等待对应冻结原生证据。
## 重装后显式On及v9冷准备限定通过

独立核ready01 SHA6359B68B3B21A793201352497FCAA8F1B53FF5640C42E7BC3D935F5972D8C797及normal-exit-v9-01 SHA820280A131C431141C59D2C26B9F4053D1018D9407ED8DBCC354BF5319CF26B4：主49136从“退出Mashiro”正常退出，05:14:11Z精确进程数0，05:18Z readiness仍0；EXE33F79…4454D7。新Run名称为生产AUMID、带引号精确安装EXE加--mashiro-login，requestedAndSystemConfirmedOn=true、旧Run absent，补足重装后的显式On范围。

v9 before/after-exit History两文件同SHA102D0383008CE38BB57C989C2545CF2EEC0A693DC63FC6C27AB9F38EB42FC969，新AUMID count1、tagc6cd7a1fdeae2f59/group reminders完整保留；ready绑定原提醒70a8…及item a35f…/E2E_ITEM_waiting、due13:07、DISPLAY_OBSERVED。未以History文件本身证明零进程，而用上面两份正常退出/ready证据。

shortcut-after-exit01 SHA9C2C7A6E7CA63AAEE6CC0BC8DFBF054E5223059CEB7CC39EB57AED66CE1D3E60：重装后当前CLSID145B11B4-27B4-4C65-8585-F689F4C2CBB9，shortcut A29449…88588、新AUMID、空参数、精确安装目标以及LocalServer32一致。不能沿用卸载前5363或旧D7作为当前激活身份。

本批 **LOGIN_ON / COLD_READY LIMITED PASS**；v9未调用COM、未新增Provider、真实点击PENDING_USER_ACTION。已只读核progress/program当前首段，与等待真实点击、旧FAIL保留和卸载COM补证待齐的状态一致；不重复提问或触发任何桌面路线。实际冷启动/事项定位仍须用户点击后的新证据。
## 卸载系统补证的分层结算

supplement01 SHA AB1B61A8ECCDBDAAC879F3A1B6F83821CA4FC191FE59BF8F21805095A714F495明确标注rawStdoutPersisted=false、精确时间NOT_RECORDED、不可由pre/post重算。保留owner在真实卸载完成时观察的shortcut absent、新AppsFolder0、5363及D7 LocalServer32 absent；不把这些升格为可独立重算原始快照，也不用于推断随后状态。

风险比例结论：结合已冻结pre/post强证据、准确uninstaller BEF780…0592F、生成宏与制品一致、此前独立真实NSIS完整REG_SZ/含NUL/外路径/升级guard/邻接枚举及v4正式卸载证据，可对v6系统清理作 **COMBINED_EVIDENCE LIMITED PASS**，无需重复整个生命周期。该结论包含较弱的当时owner观测，不声称两个GUID删除被独立再次读取。当前没有相反现象或机制差异需新业务实验；证据强度限制永久保留。唯一实质原生场景仍新通知真实点击/冷启动正确事项，待用户结果。
## V10 user physical click: cold launch and trusted delivery independently verified

LIMITED PASS for cold application launch and trusted v10 activation; exact selected-detail presentation remains pending. Reviewed immutable ready-v10-01 (SHA6985AE4D5854632F27587EB095C363869519AED30529D6D671A53DFC7A36F536), normal-exit-v10-01 (SHA2BD6C1FAADBAA07BDF4FF2A6023ED2E73BBCF6A67E498063881FC2675287EC87), user-click-v10-process-01 (SHAE4EEC7D2706D4CCA3DD54817D8EDE2B0247F5F93180EF959E2837992E25C9EDD), and reminder-v10-user-click-db-01 (SHA04DC0EF7B6201E7EE8002ACF904A89563F4558F088433D8A577AA98C8069E6C1). Tool chunks ad313b/538ad7; all seven ready source hashes match.

Normal menu exit of58276 at15:09:31 produced zero exact processes; ready at15:11:56 still zero and History retains only v10 tagc15fc141f5c05243. Following the user's reported physical click, new main48312 started15:13:44 with parent svchost1780 and Mashiro window. This is distinct from the earlier login-startup process observation. Frozen before activations contain only4/6/8; after adds exactly10 for reminder70a8cb12-b0e3-42f6-b261-b08e6febcfb6, linked to itema35ff4f3-2096-477f-8dc2-2ca3d8af355f. The reminder record hash is unchanged, dataset9f/schema19/integrity/FK remain valid, Provider calls0. No v10 diagnostic COM or class-factory call was made.

The user screenshot/report supports arrival at the Items page. The shell-only UIA01 does not yet prove that the exact target detail is selected and visible; this limitation remains separate from the now-supported cold-launch/activation result. V9 physical failure and all failed diagnostics remain historical facts. Ordinary Explorer lifecycle/legacy Run cleanup is still outstanding and is not closed by this successful click.
### V10 exact-item presentation closed

Independent hash/read c7a2ed verifies `delivery-014-release-v6-user-click-v10-item-visible-01.json`, SHA256 0DC5762E0397873322FF03DFF7444AA5810C404BBD2980B21E10145A1CC65496. The same cold-start main48312/window201994 remains. Owner only scrolls the existing page to67%; navigationPerformed=false and selectionChanged=false. The visible detail contains exact itema35ff4f3-2096-477f-8dc2-2ca3d8af355f, edit title E2E_ITEM_waiting, description 合成事项 and state 待回应, all offscreen=false. The lower reminder group is still offscreen=true and is not claimed visible.

Together with the preceding independently checked cold-ready/process/activation chain and the user's physical click, this closes PHYSICAL_COLD_CLICK_AND_EXACT_ITEM_TARGET for v10 on unchanged v6. The target detail was already selected but required scrolling; automatic scrolling to the detail is not established. This does not erase v9 failure or close the outstanding ordinary-Explorer installation/login/uninstall scope.
### Ordinary-context same-version coverage: duplicate owned Run requires repair

V10 aggregate `delivery-014-release-v6-user-click-v10-observed-01.json` SHA021E9DB20A5ADCDA5DDC13E8E8E7FBD5DE600468ADECFDFA846143BA1E27498C and all eight source hashes independently match (5a97a7). The notification result remains closed.

Installer disposition is REPAIR for the newly observed same-installation old/new Run coexistence. Root/owner report actual Explorer-parented same-version installer61596 preserves data/program identity but leaves the owned legacy name alongside the exact new On command. Static inspection (2c5242) confirms renderLoginMigrationNsis accepts only ERROR_FILE_NOT_FOUND when querying the new name; any existing name exits without retiring legacy. Existing author test `existing current registration` explicitly uses current:'foreign', so it remains correct and must be preserved; it did not cover identical owned commands.

Two enabled Run commands can request two login launches. The single-instance lock prevents two persistent instances, but the existing second-instance handler unconditionally shows the window, so it is not evidence that duplicate entries are harmless; unexpected visible login startup is a plausible race, not an executed finding. The real residue plus missing migration branch is sufficient to require repair rather than waive the migration acceptance.

Minimal contract: when both complete REG_SZ values exactly match the current installation's authorized command, preserve the existing new Run and its approval bytes, recheck ownership/concurrency, and retire only the exact legacy Run and unchanged legacy approval. Preserve new Off choice. Different path/type, embedded-NUL suffix, unreadable values or late ownership changes remain fail-closed; do not overwrite new state. Add a bounded real NSIS scratch oracle for identical coexistence, new disabled approval preservation and late-change protection, retaining the existing foreign-value and rollback tests. No application/runtime change is required by this finding. The full original physical/lifecycle failures remain preserved; data-protection evidence is not discarded.
Independent RED evidence: review014-login-existing-owned-red-02.json ran unchanged generator9D7039BB5DB181D6569A9F22A219C4BF1975F9A7B312CFD40247EF8BE16CA7BA through real makensis /WX and hidden scratch installers. Both current approval02 and03 cases preserve the current command/approval but fail because legacy Run remains (line127 before formatting). Unique synthetic Registry cleanup is checked in finally. Initial red-01 is retained as a fixture path-escaping failure before registry execution, not a product RED. No real login key was written.

### Ordinary Explorer uninstall independently closed; overlay remains REPAIR

Frozen post-uninstall Explorer report SHA BB0DE43BF54F0EB06724F21FAD0B97D6B4CAF43FC2D21BF2F59764D9BC78F888 was independently read (d3fb70). Its fixed wrapper maps the two COM observations to the LocalServer32 keys of145B and88058F74-4FE1-4431-8581-09F8762BDEBC; it does not assert deletion of every CLSID metadata key. Direct Explorer child33124/parent8252 reports both Run values, those LocalServer32 keys, shortcut, uninstall GUID and program files absent. Data root remains.

Immediate pre-uninstall03 SHA9B48B9F719B86C87D7ACDF435153BFC9F810A2F3E0A7232A6B0B3DBC4CCA2B07 and post03 SHA5F8227CE6E8C1DBF156C8545073AB47FE96FA38566D00AF7D5AAF6C005B31E76 have independently deep-equal data.entries (18), location and unknownFile objects, and post processIds empty (257836/de4fb7). Tool-host registry fields are not substituted for the actual Explorer result. The lifecycle summary B8F66ACB…7EFA1 accurately distinguishes overlay REPAIR and ordinary uninstall/preservation PASS; pre-overlay filename preuninstall-02 is explicitly historical naming, not the actual immediate uninstall baseline. The 23-file lifecycle archive manifest was checked against its file hashes without repeating scene operations.

Limited uninstall/data preservation PASS is therefore supported in the ordinary desktop context. Current scene remains uninstalled pending repaired v7. No reinstatement or full lifecycle PASS is claimed. New/old Run coexistence migration REPAIR remains independent of this successful uninstall.

Independent candidate check: generatorD4218B26E72975CB626B932EA186F4C32B11E1F34207A6C6A7A1D210CA908DEE passes original owned-On/owned-Off cases plus an injected new foreign command immediately before final current-value verification, preserving both the foreign new value and old choice. Together with prior approval-write retry and late-Off, candidate-03 contains two files/five passing tests; Node typecheck and scoped lint/format pass. candidate-02 executed with a malformed foreign-path string later caught by lint; preserved as intermediate evidence and corrected/retested in03. Final candidate review still requires author frozen manifest. Independent test SHA99BB3ECBB549C7D2F8F89E451E912A3CC0C41A28EB9BE8647BAEAE84BC3E485E.
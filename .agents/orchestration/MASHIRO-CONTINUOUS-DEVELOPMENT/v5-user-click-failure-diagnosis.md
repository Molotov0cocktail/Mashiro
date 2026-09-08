# v5 actual user-click failure diagnosis

2026-09-08，独立 Astra/medium，只读 Mashiro 源码、已冻结证据及官方 Electron 44.1.1 源码。结论 **REPAIR：真实 Shell 通知激活未达 Mashiro**；精确原因尚待下述身份映射判别。运行源码 a86c268、v5 setup CEB415…E221E / EXE3BD29…B1030 / ASARBD19…F6B1，协调 HEAD2e3c92a。没有修改产品、注册、UI，没有启动 COM，没有读取另一项目。用户截图事实由当前对话/root转述：来源标题 Electron、正文 Mashiro 提醒，两条均点击后打开另一 Electron43.4 默认页而没有 Mashiro 窗口。这里只记录版本/产品身份，不保存私人路径或截图到 Git。

## 已知链路与反证

- `electron-builder.config.mjs` appId明确Mashiro.Desktop；实际NSIS `include/installer.nsh` 的addStartMenuLink使用WinShell::SetLnkAUMI APP_ID。不是打包配置明写Electron。
- `reminder-runtime.ts:24`设置Mashiro.Desktop，但index先await createWindow/loadFile，再startReminderRuntime。platform自定义toastXml仅提供合法group launch参数与正文，未指定外部协议或EXE。
- 冻结shortcut FD132…1267的AUMID是Mashiro.Desktop、CLSID D7D00685-BBBE-4240-8E2D-D1C7D7EAD6A3。新参数化暖COM HRESULT0和v8 activation入库是有效的直接COM诊断，不能覆盖Shell选择CLSID/启动程序的步骤。
- before/after-exit Mashiro-only WinRT History确有v8 d8af与旧v7 ce646。用户确认两条都失败，不能再用“可能只点旧通知”消解反例。root新只读HKCU Classes/AppUserModelId/Mashiro.Desktop absent；这是观察，不足单独认定缺少该key即BUG。

## 官方实现支持的可区分假设

[WindowsToastNotification 44.1.1](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/notifications/win/windows_toast_notification.cc) Initialize通过GetAppUserModelID创建并缓存notifier；自定义XML不会设置发布AUMID。发布身份早期初始化错误是可能机制，但Mashiro-only History已包含同v8，故目前不是已证根因。

[NotificationPresenterWin](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/notifications/win/notification_presenter_win.cc)先Initialize再异步注册activator；[Notification API](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/api/electron_api_notification.cc)中isSupported也会获取presenter。当前应用可见调用在runtime绑定platform之后；没有找到确定的更早应用调用。因此“设置晚”是可修的初始化脆弱点，不可冒称已复现它导致本次串绑。

[Windows activator](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/notifications/win/windows_toast_activator.cc)按当前应用名找到shortcut，复用其CLSID，另注册当前EXE；该过程和notifier初始化不是同一同步步骤。源码没有显示固定全Electron共享CLSID；共享/污染只能由实际映射证明。此处shortcut合法路线也解释为何不能仅凭AppUserModelId注册key不存在断定失败。

目前优先假设：Shell对Mashiro.Desktop的解析/缓存与当前shortcut/直接COM注册不一致；其次为初始发布身份和稍后注册身份分裂。裸LocalServer32路径或renderer导航丢失均不能独自解释“来源Electron且启动另一版本默认页”，不要先修renderer或将COM成功当点击成功。

## 最小下一证据与修复合同

1. 由root/唯一owner只读精确Mashiro.Desktop的Shell AppsFolder解析属性（AppUserModel.ID、RelaunchCommand/目标、ToastActivatorCLSID、显示名），及HKLM/HKCR同名AppUserModelId合并结果；仅该ID、仅必要目标身份，不读取外部项目文件或遍历其注册。与已冻D7/3BD及实际启动路径做相等布尔比较即可。若未能解析应保留UNKNOWN，不猜测默认映射。
2. 若发布AUMID仍无法确定，在后续作者修复候选的独立合成启动中记录最早设置身份、首次notification presenter使用、首次发布的严格顺序，并在同一新通知验证Mashiro-only History和Shell映射。最小源码加固可把setAppUserModelId移到await ready/窗口之前；但不能仅靠该改动和暖COM绿宣称此次修复完成。
3. 若证实自有Shell映射陈旧/缺失，采用自有AUMID/稳定自有CLSID的明确注册与升级/卸载对称机制，严格目标归属保护，不清理Electron或其他应用身份，不用全局缓存删除。先给独立合成注册冲突/保留测试，再以新包真实通知点击验证。是否需要这一产品改动取决于第1步，不预先扩大写域。
4. 最终只需一次有判别力的新正确通知：来源Mashiro、正常退出后零Mashiro进程、用户真实点击启动精确EXE并导航目标。v8此前已由COM写幂等activation，不能要求重复点击再新增一行；也不能以旧v8行代替点击证据。当前所有实际发布/016最终PASS仍未授予。

诊断读取中官方application_info_win.cc多次URL获取失败、首次本地NSIS路径少include目录失败已保留工具结果；不据未取得源码推断默认AUMID实现。上述结论只依赖成功读取的列明文件。
## 一次精确Shell查询：身份不一致已实际确认

root明确授权后，11:03:04+08只调用AppsFolder.ParseName('Mashiro.Desktop')，没有枚举Items；并只读HKLM/HKCR同名AUMID。冻结结果[v5-user-click-shell-identity-01.json](v5-user-click-shell-identity-01.json)：System.AppUserModel.ID=Mashiro.Desktop，显示名却是Electron，TargetParsingPath指向本仓node_modules/electron/dist/electron.exe；ToastActivatorCLSID和RelaunchCommand属性null。HKLM/HKCR同名key均absent。**Shell对该精确ID的当前解析与已冻安装shortcut/3BD EXE不一致已获实际证据**，不再只是代码假设。

此查询目标是本仓开发Electron；用户截图中另一版本/位置的程序是另一时点的启动事实，不能将两个路径强行说成相同。null属性也可能是Shell不暴露该字段，不单据null宣称CLSID根本不存在。应保留“自有AUMID在开发/安装运行之间混用导致Shell解析污染”的高优先机制，下一步仅核自有同AUMID快捷方式来源及身份设置，不改其他项目或全局Electron身份。

修复合同因此收紧：生产身份必须在任何窗口/通知初始化前确定；开发/测试执行不得注册生产Mashiro.Desktop，需独立开发身份或不启用原生集成。安装路线必须验证Shell精确解析为安装EXE/产品名，不能只验证单一lnk属性。对已污染自有身份的修复要具备可审核归属检查和升级/卸载对称清理；不能删除所有Electron快捷方式或重置Shell全局缓存。单改设置时序尚不足覆盖本次实测Shell错误映射。

[Microsoft桌面通知说明](https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/send-local-toast-desktop-cpp-wrl)明确桌面foreground/background激活均交COM activator；[当前桌面通知指南](https://learn.microsoft.com/en-au/windows/apps/develop/notifications/app-notifications/app-notifications-quickstart?tabs=cs)亦说明background属性对desktop被忽略。因此未显式activationType的默认foreground不是改成background即可修的证据，不应以此绕开身份问题。

Electron Notification.isSupported会GetNotificationPresenter，能够触发Initialize；handleActivation只设置回调，单独不会创建presenter。当前应用源码所见isSupported调用在runtime设置身份和attach之后，早于它的确定应用调用未找到；不要把可能时序写成已发生。root另回报新Mashiro后台主进程命令含--mashiro-login、父Explorer且窗口隐藏，待owner冻结；这应归登录启动，不能作为用户点击启动成功。
## 根因收束与最小候选范围

11:05:06+08按root授权只读两个精确已知链接，[known-links01](v5-user-click-known-links-01.json)实际确认：Electron.lnk和Mashiro.lnk同时声明Mashiro.Desktop。前者目标本仓开发electron.exe、CLSID5DD196AC-DEFB-40BF-9CF2-E75F924E106D；后者目标安装Mashiro.exe、CLSID D7D00685-BBBE-4240-8E2D-D1C7D7EAD6A3。这与AppsFolder实际选择开发Electron一致，构成生产身份重复注册的实证。未读取链接目标项目文件。

代码中startReminderRuntime在非packaged运行也无条件使用生产AUMID，且attach/recover照常启用Notification；supported()的packaged判断只保护登录项，不保护notificationSupported/show。Electron开发可执行文件的产品名为Electron，官方EnsureShortcut按产品名创建/更新链接，故本仓开发/两PID测试可生成同生产AUMID的Electron.lnk。不能从当前快照追认具体某次测试为唯一写入者，但缺少隔离的生产代码路线与重复链接现场均已证实。无需以另一项目行为解释或修改另一项目。

推荐作者最小候选：

1. 一个可信Windows身份模块：新稳定生产AUMID（例如com.mashiro.desktop，最终由作者统一选定），开发和测试独立身份或完全关闭原生集成；在app.whenReady/窗口创建/通知API之前初始化。生产不得因测试标志使用开发可执行路径去注册生产ID。
2. 将installer appId、runtime、登录Run查询/设置名称、卸载自有清理及相关严格测试统一到该生产常量/受审核生成值；数据集路径、数据库/用户内容不随AUMID变化。稳定CLSID如采用，须与installer链接和运行时完全一致且不复用共享Electron链接CLSID。
3. 兼容旧Mashiro.Desktop的登录条目，只能在精确归属当前安装EXE时迁移/清理；保留其他安装路径、未知字段及共享Electron.lnk。新身份避开旧Shell冲突，不能靠删除共享链接或清空系统缓存让测试暂时通过。
4. 有判别力RED/验收：旧生产代码在nonpackaged启动会请求生产ID（独立mock顺序反例）；同旧AUMID两链接fixture应识别歧义；修后开发/两PID先运行仍不能写生产身份，生产ID初始化早于Notification.isSupported/窗口，登录和NSIS常量一致。新包完成后精确AppsFolder生产ID必须为安装EXE/Mashiro，并以实际通知用户点击验证。保留当前两个冻结快照及真实用户失败，暖COM仅辅助。

该范围需要新的独立源码/生成宏与制品验证，旧数据保护/治理/Provider资格按无差异范围复用。不是整产品重写，也不接受仅改toast activationType或清除其他项目注册作为修复。

root已选定候选生产AUMID为io.github.molotov0cocktail.mashiro，上述示例com.mashiro.desktop不作为实现值。旧Mashiro.Desktop Run须在同一已授权安装路径精确匹配时保留用户On选择并迁移；卸载同时识别该精确旧条目及新条目，不能删除他路径。旧内部测试通知只能按已知自有tag精确撤下，旧通知不能可靠重绑定的边界应明示；不得操作Electron.lnk或全局注册。当前尚未公开发行，只覆盖已授权内部升级路线，不扩展任意历史迁移框架。


独立行为RED补证：tests/unit/review014-production-notification-identity.test.ts在作者产品尚未改时，对platform SHA9015453516B5DC1CDB1FB977EDB7736821A4D6EBC2EA8C45ADC9AB509320C7A8实跑2项均FAIL（raw review014-production-notification-identity-red-01.json）。开发capability检查实际返回true，直接show实际构造原生通知；仅Electron mock，没有系统副作用。随后只格式化测试，Node typecheck退出0。原RED保留，候选修后需原断言通过，并配生产正常发布positive测试；正式新包Shell/用户点击仍必需。

## NSIS安装身份独立核对

实际本仓NsisTarget.js:157使用options.guid或builder-util-runtime.UUID.v5(appInfo.id, UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'))。本机直接调用同库结果：旧Mashiro.Desktop→5555e988-f7b5-5fe3-b6bd-8df3b21f793e；新生产ID→98de4788-7225-5961-aff2-6abe7ac08135。旧值也对应delivery-014-release-v4-uninstall-snapshot.ps1的精确uninstallSubkey及已冻pre exists=true，不依赖推测。

必须显式nsis.guid固定5555e988-f7b5-5fe3-b6bd-8df3b21f793e，允许APP_ID更新而APP_GUID/UNINSTALL_APP_KEY保留。模板multiUser.nsh还由GUID派生Software安装位置key，installer mutex同用APP_GUID，因此不能只手工保留卸载key。v5 builder-debug/raw未输出GUID define展开，本结论来自实际依赖算法+既有精确注册证据，不声称raw含该值。

作者一度回报2433d7b9…旧值，与本机实际库及注册证据矛盾；已立即回报root/作者要求纠正，未执行安装/注册。候选应以实际builder算法和上述旧安装实证锁定，不用不同UUID库/参数顺序生成替代值。
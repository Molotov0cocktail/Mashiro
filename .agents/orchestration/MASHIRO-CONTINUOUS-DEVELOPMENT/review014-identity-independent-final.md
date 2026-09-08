# Production notification identity independent review

2026-09-08 Astra/medium。**SOURCE LIMITED PASS**，绑定[11个产品及验证接线哈希](review014-identity-independent-source-hashes.json)，不代替新v6制品/安装/实际Shell通知点击。审核未参与产品实现；只写独立测试及报告，所有Registry运行限唯一UUID合成分支。

根因与原始证据见[v5真实点击诊断](v5-user-click-failure-diagnosis.md)：同生产AUMID的开发Electron.lnk与安装Mashiro.lnk并存，Shell实际解析开发Electron，用户真实点击失败。旧warm COM通过与此不矛盾，原失败不撤销。

最终生产ID io.github.molotov0cocktail.mashiro，开发/测试ID隔离；index在single-instance/ready/window前初始化，runtime不再迟设身份。非packaged平台capability与show均挡住原生Notification，独立原2RED转绿；packaged正向仍调用真实platform构造/show接口（Electron mock，不冒充原生）。固定NSIS guid5555e988-f7b5-5fe3-b6bd-8df3b21f793e保留既有安装位置/互斥/卸载身份，新APP_ID与安装GUID职责分离。

NSIS generator9D7039BB5DB181D6569A9F22A219C4BF1975F9A7B312CFD40247EF8BE16CA7BA：旧Run只接受当前安装路径精确Unicode完整REG_SZ/长度/含NUL字节一致，新目标既存保留；迁移审批保留原binary选择。升级不执行卸载清理，真正卸载精确识别新旧名并保留外路径。未增加共享Electron链接或全局缓存清理。原Toast完整字节/寄存器/earlyinclude资格按无差异部分复用。

独立真实NSIS故障注入验证：approval成功/Run错误5后保留旧Off且清理本次approval，原宏重试迁移成功；晚到旧Off曾在ECD候选实际留下新On（review014-login-late-off-run-01.json，1PASS/1FAIL），最终9D候选原断言转绿。补偿只删除类型/长度/完整bytes仍等于本次写入的新Run；删除成功或新Run确认不存在后，才按同样归属核对处理新approval，保护不同并发新值。Registry非事务，无法声称消除任何系统级最后一指令竞态；本范围受测明确阶段竞争及失败恢复已关闭，没有据此扩张全局注册权限。

E2E内存平台仅!app.isPackaged且dataRoot.profile==='test'注入；数据profile仍走既有marker验证，生产即使有test环境变量也默认Windows平台。真实ReminderService、timer、持久提醒幂等、close-hide、tray handler、UI处理和第二PID旧身份断言未削弱。仅交付观察来源改为syntheticDeliveryObserved=true/nativeShowObserved=false，userSawNotification/coldActivation仍NOT_PROVEN/NOT_RUN。它不再为开发测试创建真实系统通知。

独立最终[run04](review014-identity-final-run-04.json)：4files9tests全绿（2真实NSIS、3platform、2E2E守卫、2main），NodeTS与独立文件scopedlint0，生成器前后哈希相同。此前编码误读导致的retry-run01 FAIL、开发2RED、late-Off真实RED均保留；没有声称未执行旧迁移故障实验为RED。作者迁移/卸载14项及根全量记录为补充证据，不替代独立运行。

下一准入：root新包静态核out/ASAR/宏，唯一owner核覆盖安装GUID与旧Run On迁移、Shell精确新ID解析安装EXE/Mashiro，并真实通知点击/冷启动导航。旧内部通知的身份不可由源码修复追认有效，按精确自有tag处理且诚实记录；不得清其他项目集成。016/实际发布仍未最终PASS。

最终manifest闭合：delivery-014-notification-identity-manifest-v1.json SHA99FC2D11C4B586E978C65E5CCD486E84A86C835B181CD89F672AD806A7B85AEC独立匹配；11产品/接线+8作者测试+2独立oracle共21项逐文件SHA全部一致、0漂移，完整结果review014-identity-final-manifest-check.json。完整候选 **SOURCE LIMITED PASS**，本轮结束；新制品/升级/Shell真实点击仍按上文边界验收。未重新运行矩阵。

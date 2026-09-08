# v5 用户实际通知点击：未通过，继续诊断

用户在手动测试后提供两张截图：通知中心来源为 Electron，含两条“Mashiro 提醒”；点击结果为 Electron 43.4.0 默认欢迎页，显示另一项目 AIbrowse 的开发 Electron 可执行文件。截图未区分点击的是旧 v7 还是最新 v8，不能将该结果归为最终通过。图片由用户主动提供，仅记录与本次故障有关事实，不将私人目录中的原图复制到仓库或发行包。

root 随后只读进程查询（042b07）发现精确 Mashiro 安装路径有四个进程 32872/33096/33112/33328，启动于 2026-09-08 10:53，MainWindowTitle 为空；当次未返回 Electron 进程。该观测不证明用户截图无效，也不足以证明 Mashiro 已正确导航。用户随后明确答复：上下两条都点了，都是 Electron 页面，没有 Mashiro 窗口。故不能用“可能只点旧通知”解释掉失败；后台进程存在也不足以证明正确导航，继续分别调查实际 Shell 激活身份与隐藏进程状态。

精确 HKCU Software/Classes/AppUserModelId/Mashiro.Desktop 键只读查询为 absent（93237c）；这仅是线索，不单独作为根因。现有快捷方式 D7D CLSID、暖 COM 交付和 v8 幂等 activation 证据保留，但不能替代 Windows Shell 的真实点击路径。

当前执行状态 ACTIVE / NOTIFICATION_REPAIR，撤销等待点击的技术暂停。Astra 只读排查源代码、官方通知注册机制及可区分假设；原生所有者只观察精确 Mashiro 进程与合成数据。禁止启动 COM 或操作窗口污染本次用户结果，禁止改动 AIbrowse；此前被拒任务栏自动路线不重试。root 单写全局入口。之后按确证根因修复、独立审核、重构制品与必要差异验收，再继续完整发布及下载校验。

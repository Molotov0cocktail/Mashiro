# 实际 NSIS 更新参数独立验证

限定结论：参数机制 PASS；注册表清理候选与原生卸载尚未验收。

Reviewer review_017_trusted 未参与产品实现。使用实际 f4 构建的 `dist/windows-candidate-notification/builder-debug.yml` 中 `_isUpdated` 定义、本机缓存 NSIS 3.0.4.1 编译器和 StdUtils.dll，编译并隐藏运行独立合成 EXE。脚本没有 Registry 读写、应用启动或卸载调用，仅在 `.cache/review014-login-flag/probe-spoIak` 中写入自己的输入和结果。该目录保留为可检查的合成残留。

实际三项通过：`/S` 返回 uninstall；`/S --updated` 返回 updated；`/S --updated-other` 返回 uninstall。Push/Pop 保护下，三次 `$R9` 均保持 sentinel。这验证真实参数解析，而非在测试中硬编码布尔值；同版重装调用链传参另见 [源码路线](delivery-014-login-uninstall-route.md)。

[原始执行结果](delivery-014-login-updated-review-probe.json)与[独立探针](delivery-014-login-updated-review-probe.mjs)已落盘。执行退出码 0。探针首次 scoped lint 因正则中的重复字面空格报两项 no-regex-spaces，随后以等价 `{4}` 表达式修正，scoped lint 退出 0；格式检查此前通过。没有修改产品、原作者测试、全局入口或 Git 状态。

此结果不能替代最终生成宏的寄存器保护、所有权匹配、Win32 ABI、隔离注册表保护测试，也不能替代由原生执行者保持登录开启后进行的实际卸载验证。

# 014 登录项卸载清理：早期 include 完整隔离

真实模板在自定义 include 之后才加载 `LogicLib`，且同一自定义 include 会进入最终安装器编译分支。生成的全部卸载专用文本现在置于 `BUILD_UNINSTALLER` 条件内，并在该条件开头显式 include `LogicLib.nsh`；v2 已冻结的真实可执行文件名注入保持不变。

- 真实 makensis `/WX` 同时编译无 `BUILD_UNINSTALLER` 的安装器分支和有该定义的卸载器分支。
- 8 个唯一隔离 HKCU Run/StartupApproved 场景继续验证真实执行语义。
- 聚焦结果：2 files / 12 tests PASS；四文件 scoped ESLint 与 Prettier check 均退出 0。
- 未运行应用 build，生产打包与安装验收仍由主控完成。

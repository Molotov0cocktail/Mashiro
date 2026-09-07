# 014 登录项卸载清理：生产 include 时序修复

实际打包在 `custom include` 展开时尚未定义 `APP_EXECUTABLE_FILENAME`，NSIS warning 6000 被正确当作错误终止。修复由 `afterPack` 从 electron-builder 的 `context.packager.appInfo.productFilename` 取得已解析产品文件名，校验后把完整 `.exe` 文件名写入生成宏；宏不再依赖后续模板定义。原有逐字节 UTF-16 命令归属校验、升级保留和 StartupApproved 快照校验不变。

作者合成夹具删除了 `APP_EXECUTABLE_FILENAME` 预定义，因此 8 个隔离 HKCU 场景均以真实早期 include 顺序编译。`packaging-config-independent` 同时断言 afterPack 生成的是 `"$INSTDIR\\Mashiro.exe" --mashiro-login` 且不含迟定义宏。

- `npm exec vitest run tests/unit/installer-login-uninstall.test.ts tests/unit/packaging-config-independent.test.ts`: 2 files / 11 tests PASS。
- 上述 4 个文件的 scoped ESLint 与 Prettier check 均退出 0。
- Node TypeScript 未作为本切片通过证据：当时 RET-007 可信端 WIP 尚未接线，报错只来自该暂停中的 WIP；014 四文件自身没有 TypeScript 或 lint 错误。
- 未运行应用 build；真实 electron-builder 重打包由主控在独立复核后执行。

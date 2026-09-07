# 014 生产 include 修复：独立限定 PASS v2

Reviewer review_017_trusted 未参与实现。限定结论：v2 源码接线、早期 include 合成编译与范围静态 PASS。真实完整生产打包、安装与卸载仍由 root/原生执行者验证。

四个冻结 SHA-256 独立匹配 [manifest-v2](delivery-014-login-uninstall-author-manifest-v2.json)：

- `build/after-pack.mjs`: `7DACC906AF9C1E7492E8AAC07178CBF22917C83B55D7414899C78A53C9B57A48`
- `build/installer-login-cleanup.mjs`: `1D573253F30EFA2A60E2A04EC8C79298D95A62D4832B981855972022D3715C3A`
- `tests/unit/installer-login-uninstall.test.ts`: `0CB735B3835E6C136B0B8E8B3AC0192D3CDBF1C444E3E7ED74E13004D0F6470C`
- `tests/unit/packaging-config-independent.test.ts`: `A2F4599278D05E61132A3ACC4BE8144BDBFFD4FFEB618CF3F7C9C29B4FA92819`

本地 electron-builder 26.15.3 `NsisTarget` 先生成 custom include 头部，`installer.nsi` 后续 include common.nsh 才定义 APP_EXECUTABLE_FILENAME。v1 合成夹具预先定义该常量，未覆盖真实顺序；[真实生产失败](delivery-014-login-packaged-build-02.raw.txt)保持 FAIL，v1 限定 PASS 不扩张到生产构建。

v2 afterPack 从 `context.packager.appInfo.productFilename` 获取文件名；同一字段正是本地 NsisTarget 传入 PRODUCT_FILENAME 的来源。构建入口验证字符后显式传入完整 `.exe` 文件名，生成器再校验文件名字符及长度。实际 afterPack 测试生成的命令为 `"$INSTDIR\Mashiro.exe" --mashiro-login`，没有迟定义 token。底层生成器仍有供旧合成调用者使用的宏 token 默认值，但生产 afterPack 不走该默认；本报告不宣称模块源码已完全删除 token。

独立比例复跑仅选择 early-include 相关两项真实 NSIS 场景（--updated 与 Unicode 外来路径）及 afterPack 包装接线，共 3 PASS / 0 FAIL / 8 未选，退出 0，[原始结果](delivery-014-login-uninstall-review-v2-run.json)。该版本作者 fixture 已移除 APP_EXECUTABLE_FILENAME 定义，以显式 `Mashiro Test.exe` 编译运行；使用既有 UUID 隔离 Registry 子树和隐藏进程，没有触碰生产 Run、桌面或当前安装。四路径 scoped ESLint/Prettier 均退出 0（1007cc、b957c5）。

原字节匹配、缓冲长度、权限范围、更新保护及释放逻辑保持，比例复用 [v1 独立 16 项](delivery-014-login-uninstall-review-pass-v1.md)；未重跑整个历史 ABI 套件，也未在 RET 半成品现场做全量 TypeScript/build。下一门槛是 root 对冻结输出执行真实 electron-builder BUILD_UNINSTALLER 与安装器编译，不能用本 PASS 取代该结果。

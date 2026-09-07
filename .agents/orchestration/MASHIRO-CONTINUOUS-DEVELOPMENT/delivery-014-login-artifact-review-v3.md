# 014 v3 内部制品：身份通过，封装残留 REPAIR

Reviewer review_017_trusted 未运行安装器或 EXE，未操作桌面/真实 Registry。宏 v3 的 [源码限定 PASS](delivery-014-login-uninstall-review-pass-v3.md)保持；本次制品最终静态结论为 **ARTIFACT_REPAIR**：local unpacked electronDist 额外带入可达的 Electron 默认应用 fallback。健康 Mashiro ASAR 加载不受影响，但不能声称新增资源没有加载行为影响。

## 已独立通过的身份检查

- setup：112656667 字节，SHA-256 `28F1D3AFCDDE0D5CAFC53C70A103A190FFDF013AFB77464EC0888F4B681FB6D3`，实际 NotSigned，产品 Mashiro、版本 0.1.0。
- EXE：245289984 字节，SHA-256 `A39A4F4A10E40A2C21BEA5185C919AA8C2F61C06B3B28A592B1AD3B96CB98472`，实际 NotSigned，产品 Mashiro、ProductVersion 0.1.0.0 / FileVersion 0.1.0。它与旧 F556 开头的 EXE **不同字节**，不复用旧 EXE 身份结论。
- ASAR：15431590 字节，SHA-256 `7FDDAD7FDA3E7ED19E754FB9704B61B7AD1F0E0A9ECDF879AA41D836D30702BC`，与已审 f4 完全相同。实际提取五项冻结输出分别核对大小/hash 全匹配；内部 runtime、package/preload 权限结构比例复用原 ASAR 审核，不重复遍历相同包。
- 六份 notice 引用文件 hash 全匹配；owned 清单 81 项与实际 81 文件完全一致，无符号链接、缺项或额外未拥有文件。实际 `.cache/packaging/owned-files.nsh` 与当前 v3 生成器根据清单再生成的全文完全一致，SHA-256 `9C8D0F6CC6EB946797FC908DFB7EA7B541588D860D4D5543FA63C8D16F84206D`。

[结构核验原始数据](delivery-014-login-artifact-review-v3.json)中的 STATIC_PASS 仅为该脚本的身份/清单断言结果，后续加载风险调查形成的最终结论以本报告 ARTIFACT_REPAIR 为准。[签名/版本原始数据](delivery-014-login-artifact-review-v3-identity.json)另存。

## 新增两文件的来源与实际风险

相对原 79 项，新增 `resources/default_app.asar` 与顶层 `version`。default_app.asar SHA-256 `06D4A28BE095A80EFF94DBD18EDCFAC5B5805E1B5538E0FB7CEE7C7AE81DB76A` 与 `node_modules/electron/dist/resources/default_app.asar` 一致；两个 version 均为 44.1.1。本地 electron-builder 26.15.3 ElectronFramework.js 对 custom unpacked electronDist 返回非 full cleanup，故不执行默认发行路径中删除这两项的操作。这不是来源未知或项目测试泄漏。

默认应用 package 声明 name=electron、main=main.js、type=module，包含 main/default_app/preload 等实际代码；包内 LICENSE.electron.txt 已包含 Electron contributors/GitHub 的 MIT 授权。未发现借新增文件引入未声明独立 runtime 包。

精确版本官方 [node_bindings.cc](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/common/node_bindings.cc) 将默认搜索顺序设为 app.asar、app、default_app.asar；OnlyLoadAppFromAsar fuse 开启时才仅搜索 app.asar。[init.ts](https://raw.githubusercontent.com/electron/electron/v44.1.1/lib/browser/init.ts) 遇到可读取 package.json 即停止，失败则尝试下一个。实际新 EXE 由已安装 @electron/fuses.getCurrentFuseWire 只读解析，选项 5 为 48（DISABLE），因此 fallback 未被禁用。这是官方代码与实际 fuse 的静态推断，没有运行破坏/缺失 ASAR 的原生实验。

因此正常候选的有效 app.asar 优先，不会被默认应用抢先替换；但缺失/不可读取 app.asar 时新增默认应用可被加载，与原候选直接失败的封装语义不同。根据父级本轮要求“能替代 app.asar 则 REPAIR”，应在最终封装中精确移除这两个不需要的发行残留，或使用本地同版 zip 走标准清理。无需因本问题修改应用权限、熔丝或主进程产品代码。

root 的真实完整 build-04 退出 0 为独立外部构建证据，未被本报告改写失败；修正封装后需生成新身份并做比例检查，原生执行者再验证安装后 payload、登录保留/卸载清理。此报告不覆盖冷激活修复、RET WIP、最终安装或发布资格。

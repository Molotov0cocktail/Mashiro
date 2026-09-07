# 014 early include：完整依赖诊断与 v3 合同

Reviewer review_017_trusted（实际继承 Astra/medium）只读产品并建立独立编译探针，不写实现。当前生产 v2 仍 REPAIR；v1/v2 旧限定 PASS 不扩张为生产资格。[build-02](delivery-014-login-packaged-build-02.raw.txt) 的迟定义文件名与 [build-03](delivery-014-login-packaged-build-03.raw.txt) 的 LogicLib 缺失是不同 first bad state；本轮完整诊断阻止逐 token 修补循环。

## 依赖与展开时序

实际 `NsisTarget.computeCommonInstallerScriptHeader` 先 include StdUtils.nsh，定义 isUpdated 等参数宏；custom include、语言文件和插件目录加入头部。之后才拼接 installer.nsi，后者 include common.nsh，间接通过 x64.nsh/WinVer.nsh 引入 LogicLib。构建先定义 BUILD_UNINSTALLER 编译并生成卸载器，再取消该定义编译最终安装器，两次共用早期头部。

| 符号/依赖 | 当前阶段与要求 |
| --- | --- |
| If / OrIf / AndIf / EndIf / IfNot | 来自 LogicLib，早期函数正文即时编译时尚无；生成区必须显式 include LogicLib.nsh |
| NSIS_CHAR_SIZE | 当前 Unicode 编译模式提供的内建常量，已在真实早期函数编译实证可用；不要伪造定义 |
| System::Call / Alloc / Free | NSIS 自带 System 插件，早期可编译；Win32 DLL 名在运行期解析，本轮不运行 |
| isUpdated | 实际头部预先定义；在 customRemoveFiles 的晚期展开点使用 |
| StdUtils.TestParameter / StdUtils.dll | 头部先定义宏；资源插件目录可能排在 custom include 之后，但真正调用只在晚期 customRemoveFiles 展开，故届时已就绪 |
| APP_EXECUTABLE_FILENAME | common.nsh 才定义；保持 v2 afterPack 显式 productFilename 注入，不能回退迟定义默认 |
| UNINSTALL_FILENAME | 仅位于 customRemoveFiles 宏体，晚期展开时 common.nsh 已定义，未在早期函数体使用 |
| WinMessages / StrFunc | 当前生成区不引用其常量/宏，不需盲目引入更多库 |
| un.MashiroRemoveOwnedLogin 函数 | 早期 include 即产生卸载代码；最终 installer 分支没有 WriteUninstaller，必须限制在 BUILD_UNINSTALLER |

## 实际双分支编译对照

[探针](delivery-014-login-earlyinclude-review-probe.mjs)直接提取 build-03 的 builder-debug 头部，保留 custom include 与插件目录顺序；仅移除本轻量场景不使用的临时 UI 语言文件 include。后续使用真实 common.nsh，再加入最小安装/卸载 Section。没有预置 LogicLib、APP_EXECUTABLE_FILENAME 或 NSIS_CHAR_SIZE；使用真实 compiler `/WX`，保留警告即失败。六次均只编译，不运行生成 EXE，不访问 Registry、桌面或应用。

| 探索变体（只在独立 fixture 内） | BUILD_UNINSTALLER | 最终 installer |
| --- | --- | --- |
| 冻结 v2 原样 | FAIL，Invalid command If | FAIL，Invalid command If |
| 仅显式 LogicLib | PASS | FAIL，warning 6020：存在卸载代码却未使用 WriteUninstaller |
| BUILD_UNINSTALLER 限定生成区 + 显式 LogicLib | PASS | PASS |

[原始全部输出](delivery-014-login-earlyinclude-review-probe.json)保留。生成残留仅在 `.cache/review014-earlyinclude/compile-rlo7e4`，未执行。探针 scoped lint/format 退出 0。

## 路线选择与精确合同

选择**显式依赖、按构建分支限定生成区**：renderOwnedFilesNsis 返回文本最外层 `!ifdef BUILD_UNINSTALLER`，其内开头 `!include LogicLib.nsh`，随后现有 helper 宏、un.Function、customRemoveFiles 宏，末尾 `!endif`。不改变内部 Registry 算法/ABI/范围。全模板搜索证明 customRemoveFiles 仅被 uninstaller.nsh 引用，而该文件仅在 BUILD_UNINSTALLER 分支加载；最终 installer 没有被隐藏的必需宏。afterPack 的许可证、owned-file 清单和文件名验证照常执行，不在 JS 层关闭。

另一实质路线是延迟展开：把函数正文转为晚期 customUnInstall 中的内联宏，或通过 customUnInstallSection 在合法顶层声明函数。前者 customUnInstall 本身位于 Section 内，不能直接把 Function 声明塞进去，需改结构和控制流；后者新增 hook/声明路径。它们能利用晚期模板依赖，但变更更大且影响文件忙 Abort 前后的清理顺序。本轮选择已有接口中的显式依赖和分支 guard，双分支编译已支持，无需更换 hook。

作者验收必须覆盖早期 include、BUILD_UNINSTALLER 开/关、无预置 LogicLib、警告视错；运行期 fixture 应显式模拟真实 BUILD_UNINSTALLER。Reviewer 保留独立双分支 oracle复验，既有 Registry ABI 证据按无差异比例复用；root 随后仍需完整真实 electron-builder 两阶段生产打包。不得将轻量编译结果冒称完整打包 PASS。

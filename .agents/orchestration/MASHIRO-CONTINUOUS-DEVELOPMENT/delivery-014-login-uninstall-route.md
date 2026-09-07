# 登录注册卸载清理：独立只读路线核验

结论：**已确认源码层面的清理缺口风险，需专门清理路线；实际卸载结果尚未验证**。不能把本报告写成原生卸载 FAIL 或 PASS。Reviewer 为 review_017_trusted，未修改产品/Git、未操作桌面、未读写当前登录注册值，也未加载或执行插件。原生执行者应继续保留当前已启用登录状态，直接观察卸载前后；不得预先禁用登录来掩盖结果。

## 已核事实

1. 本地 electron-builder 26.15.3 的 `templates/nsis/uninstaller.nsh` 在156–162行先执行可选 `customUnInstall`，随后执行自有 `customRemoveFiles`；191行的 `WinShell::UninstAppUserModelId` 位于快捷方式清理分支。其后仅明确删除应用的安装/卸载登记key，未找到 Run 或 StartupApproved 清理。
2. 本项目 [after-pack.mjs](../../../build/after-pack.mjs) 生成的 `.cache/packaging/owned-files.nsh` 只有精确程序文件删除、卸载器删除和非递归目录移除，没有登录注册值处理。`customUnInstall` 没有项目实现。
3. [WinShell官方说明](https://nsis.sourceforge.io/WinShell_plug-in)明确其 `UninstAppUserModelId` 调用 `IApplicationDestinations::RemoveAllDestinations` 与 `ICustomDestinationList::DeleteList`。[微软前者文档](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-iapplicationdestinations-removealldestinations)描述清理Jump List最近/常用目标；[后者文档](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-icustomdestinationlist-deletelist)描述删除自定义Jump List。这些不是登录启动注册清理接口。因此不能以该调用证明 Run/StartupApproved 已清除。
4. 限定读取实际缓存 `nsis-resources-3.4.1/.../plugins/x86-unicode/WinShell.dll`：3072字节，SHA-256 `9be85b986ea66a6997dde658abe82b3147ed2a1a3dcb784bb5176f41d22815a6`，x86，导出 `SetLnkAUMI` / `UninstAppUserModelId` / `UninstShortcut`；静态导入只有 KERNEL32的GetProcAddress/LoadLibraryA/GlobalFree与OLE32的CoCreateInstance，未发现Run/StartupApproved字面量。这是与官方说明一致的二进制元数据辅证，并非对动态调用行为的完整反汇编证明。
5. 当前可信登录代码固定AppUserModelID `Mashiro.Desktop`，用带引号的 `process.execPath` 与唯一参数 `--mashiro-login` 注册。父级已报告本次原生同版重装后的HKCU Run值符合该形式；本Reviewer未重复读取当前Registry，不将父报告转述为自己的原生观察。

只读文件身份：uninstaller.nsh SHA-256 `9EE2DAC4593478083E8AA6F8487287CE9401006CCD50ECC538871D133EA4A42C`；after-pack.mjs `CC4C651934CD48A59736FE207BE81AD08D34267A02CA7E28510668612FA851E0`；当前owned-files.nsh `43D77E11AFA249C5927454EF8CF2D1F55ACB34305199471DC8A18FD0EBBA842F`。

## 最小实现方案（尚未实施/编译）

优先在项目生成的 `customRemoveFiles` 中，在所有应删程序文件成功删除后、最终清目录前加入一个独立的登录清理宏。这样文件被占用而中途Abort时不提前撤销仍在使用的安装登录配置。不要修改node_modules模板，也不要借重新启动应用清理；当前应用已退出的卸载过程不应再启动它。

- 只在 `${isUpdated}` 为false的真正卸载运行。更新/同版重装经过卸载器时保留登录配置，之后由已安装应用正常恢复读取；需要实际验证升级标志，不能仅依赖版本号判断。
- 只操作当前单用户安装的HKCU值。沿已验证的x64注册表视图，固定值名 `Mashiro.Desktop`，固定两个候选key：`Software\Microsoft\Windows\CurrentVersion\Run` 与 `Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`。不枚举/清除其他值、不删除整个key、不触及HKLM/其他用户。
- 构造期望完整命令：带双引号的 `$INSTDIR\${APP_EXECUTABLE_FILENAME}` 加单个空格和 `--mashiro-login`。模板已定义 `APP_EXECUTABLE_FILENAME`。第一版采用精确字符串匹配；不要用子串、文件名匹配或路径前缀，也不要展开环境变量/去掉引号后猜测归属。不同安装目录、相似目录、额外参数、非字符串/过长值、读取失败都保留并报告未取得归属。
- StartupApproved的二进制值本身没有可确认的安装路径。只有同一轮已经取得精确属于当前安装的Run值时，才可把同名approval值纳入清理；记录其存在性、类型、完整字节，删除前重新比对。Run不存在或指向其他安装时，**不可只凭AppID删除孤立approval值**。
- 真正删除前再次读取Run命令和approval快照；任何变化均不清理。只用DeleteRegValue删除上述精确值；检查删除结果及读回。若Run删除失败，不顺手删除approval。若Run已删除后发现新Run或approval变化，应保留新的/未知值并报告并发变化，不补写旧值。
- Win32注册表没有这里可直接使用的compare-and-delete原子操作；读取后删除之间仍有竞争窗口。不得把双读方案宣传为面对任意外部并发写入的绝对保证。需要将检测到的冲突如实降级为未清理，并用隔离反例验证其他安装项保护。若验收要求完全排除该窗口，应另评估可信清理helper/更严格协调，不伪造原子性。

实现时可先完成精确Run清理，再加入通过Win32读取REG_BINARY原始字节的approval分支。NSIS `ReadRegStr` 不能代替完整二进制快照；不要仅根据approval首字节或enabled状态推断归属。未知/孤立approval优先保留，避免误删另一安装状态。

## 独立验证点

在隔离安装目录及明确合成注册项中验证，禁止用当前真实候选先手工禁用来替代原生卸载：

1. 中文空格路径、正确引号与参数、登录已启用：卸载前记录精确Run/approval，卸载后确认已拥有的值消失、程序文件删除、外部合成数据保留。
2. 登录被系统禁用但Run仍属于当前安装：同名approval二进制状态也按快照治理，不把“禁用”误作无注册。
3. Run不存在、非字符串、别的安装路径、同名前缀路径、相似EXE名、额外/不同参数：全部保留；孤立approval保留。
4. 两个安装目录共享AppID：卸载A时Run指向B，B的Run/approval哈希必须不变。
5. 删除前Run或approval被替换、删除失败、文件忙导致卸载Abort：不能删除新值，不能谎报完全清理；既有安装仍可用的路径不提前撤销登录。
6. 真升级和同版重装的更新卸载链：登录注册保持；最终真正卸载才清。保留原native卸载失败/残留证据后，再对修复制品重装启用并重新验证。

本报告只准备工程路线，不表示实现已通过、也不解决通知可见/暖冷激活、RET或最终发布验收。

## 当前实际生成的升级标志（追加只读核验）

`dist/windows-candidate-notification/builder-debug.yml`第25–29行在生成NSIS头部定义 `_isUpdated`：通过 `${StdUtils.TestParameter} $R9 "updated"` 读取参数并比较 `true`，随后定义 `${isUpdated}`。该定义先于卸载模板及项目宏展开，因而在customRemoveFiles阶段可用。宏判定会使用 `$R9`，自有实现应保护其临时寄存器。

本地26.15.3 `include/installUtil.nsh`第201–206行显示：非delete-app-data的旧版卸载调用总追加 `--updated`；第222/227行把它经ExecWait传给复制的或原位旧卸载器。这条路径也用于同版重装，并不以应用版本号是否不同作为判据。特殊delete-app-data分支不追加该标志，不应被误称为标准保留数据升级。这里只确认当前生成脚本和调用源码；实际同版/升级执行保护仍需隔离及原生验证。
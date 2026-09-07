# 014 登录注册卸载清理：作者候选

状态：**候选已冻结，等待独立复核**。这不是实际 Mashiro 安装或卸载 PASS。

## 实现

- `afterPack` 继续生成既有 `customRemoveFiles`，并接入独立的 NSIS 登录清理生成器。
- 清理位于所有可中止的程序文件删除成功之后、目录删除之前；文件忙导致 `Abort` 时不会提前撤销登录设置。
- `${isUpdated}` 为真时保留登录设置，覆盖升级与同版重装使用的 `--updated` 路径。判定前后保存并恢复 `$R9`。
- 真正卸载仅打开 HKCU 64 位视图中固定的 `Run` 与 `StartupApproved\\Run` key，且只处理固定值名 `Mashiro.Desktop`。
- `Run` 必须是 REG_SZ，长度与带引号的当前 `$INSTDIR\\${APP_EXECUTABLE_FILENAME} --mashiro-login` 完全相同，并通过包含终止符的 UTF-16 原始字节比较两次。不同路径、前缀路径、附加参数、类型或 Unicode 等价但字节不同的内容均不归属当前安装。
- `StartupApproved` 仅在同一轮已确认 owned Run 后处理；必须是大小不超过 4096 字节的 REG_BINARY，并在删除 Run 前与删除 approval 前分别按类型、长度及完整字节复核。Run 删除失败或读回不是 `ERROR_FILE_NOT_FOUND` 时不删除 approval。
- 宏保存全部通用寄存器，Win32 handle 与动态缓冲区均在统一出口释放。

## 作者验证

- 旧实现上新增 oracle 实际 7/7 RED：缺少 `renderOwnedFilesNsis`。
- 最终 `tests/unit/installer-login-uninstall.test.ts` 使用本地真实 `makensis`、真实 `StdUtils.TestParameter` 与隐藏运行的 NSIS 卸载器，在唯一 UUID `HKCU\\Software\\Mashiro\\Tests\\LoginCleanup\\<uuid>` 子树执行 8 个场景：owned 删除、`--updated` 保留、外部路径、前缀路径、额外参数、Unicode 等价但字节不同、孤立 approval、非二进制 approval。8/8 PASS，并验证 `$R9` 恢复。
- 与既有 `packaging-config-independent.test.ts` 合并运行：2 files / 11 tests PASS。
- Node TypeScript、三文件 scoped ESLint、scoped Prettier 均退出 0。

fixture 以 `_?=` 让唯一卸载器原位运行，`execFileSync` 等到实际进程退出后读取结果；finally 只查询并删除本轮 UUID 子树。临时目录来自已解析系统临时根，递归删除前核对父目录、命名前缀与非符号链接。

## 限制

Win32 注册表没有 compare-and-delete 原子操作。实现通过删除前重复读取、原始字节比较与删除后读回来缩小并发窗口；无法声称面对任意外部并发写入绝对原子。完整打包及真实 Mashiro 卸载尚未运行，真实 `Mashiro.Desktop` 登录值和桌面均未触碰。

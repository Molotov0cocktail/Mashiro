# 014 登录卸载清理：独立限定 PASS

Reviewer review_017_trusted（实际继承 gpt-6-astra/medium）未参与产品实现。结论限定为冻结源码、生产生成接线及真实隔离 NSIS 行为 PASS；不表示实际 Mashiro 安装/卸载或最终发行通过。

## 身份与生产接线

[作者 manifest](delivery-014-login-uninstall-author-manifest-v1.json) 的三个路径 SHA-256 全部独立匹配：after-pack `CA24E74DD6DD25A04A60A98A964D0B44E1B5EE7FF2D90E814D570B6C6A8A111E`；installer-login-cleanup `1628102798733062E36541447F9D7E091963D29094A0B75437BAADA4AAE0289E`；作者测试 `9C527D9DC5A504312CCF0661A2744BB87E7F468797E9887B98155CA34152B53E`。

独立 diff 核对 afterPack 仅将既有 owned-file 删除宏生成转交给新模块；精确文件删除、忙文件 Abort、非递归目录删除保留。清理调用位于可中止的文件删除之后，仍使用既有 customRemoveFiles 接口。配置继续 per-user、无提权；生产默认仅固定 HKCU 64 位视图的两个 key、Mashiro.Desktop 单个值，没有删除整个生产 key、修改 HKLM 或启动应用。NSIS 通过显式 Win32 access mask 选择视图，不改变调用者 SetRegView。

真实模板的 `${isUpdated}` 在该阶段可用，同版重装/升级标准调用链带 `--updated`。最终宏判定前后保存 R9；函数入口/出口保存通用寄存器并释放分配缓冲与句柄。[先前独立真实参数探针](delivery-014-login-updated-review.md)保留有效。

## 原问题关闭与独立验证

[原始 REPAIR](delivery-014-login-uninstall-review-working.json) 保持不改。两处 Run 判断现使用含终止符的完整 UTF-16 memcmp，配合 REG_SZ 与精确字节长度校验；原 U+212B/U+00C5 等长路径反例在最终真实 NSIS 场景中保留外来 Run/approval。Run 删除后失败查询输出不再用于清零长度，改由已验证 approval 长度 `$7 + 1` 重建已知分配容量。零长度、超长、API 失败均不以未知输出扩大写入范围。

- 原样独立重跑作者 8 个真实 NSIS 场景及既有包装测试：2 files / 11 tests，退出 0，[原始结果](delivery-014-login-uninstall-review-run-01.json)。包含正确归属清理、真实 --updated 保留、外部/前缀/附加参数/Unicode 外来路径、孤立 approval、非二进制 approval、R9 恢复。
- [独立增补测试](../../../tests/unit/review014-login-uninstall-boundary.test.ts)复用已审编译/隔离 harness、独立添加输入和预期：精确命令但 REG_EXPAND_SZ、REG_BINARY Run 均保留；4096 字节 approval 可清理，4097 字节未知 approval 保留；系统禁用的 binary approval 可随 owned Run 清理。1 file / 5 tests，退出 0，[原始结果](delivery-014-login-uninstall-review-run-02.json)。
- 新审核测试 scoped ESLint、Prettier、Node TypeScript 均退出 0（工具输出 8e0b67）。不以全项目测试替代必要的真实 ABI 检验，也未重复完整产品资格。

所有 Registry 写入仅在每场景新建的 UUID `HKCU\Software\Mashiro\Tests\LoginCleanup` 子树，fixture 使用隐藏进程、技术超时、等待实际原位卸载器退出和限定 finally 清理；临时目录删除有解析根、前缀和非符号链接检查。未操作当前安装、真实登录条目或桌面。

## 保留边界

双读/完整字节快照和删除后查验不能消除最后读取与删除间任意外部写入的 TOCTOU 窗口；实现没有伪造原子 compare-and-delete。独立增补未注入注册表并发替换、访问拒绝或忙文件 Abort；忙文件保护的既有代码与调用顺序已只读核对。未知/孤立/过大 approval 优先保留，清理失败不会被本报告当成成功。

下一步由原生执行者重建修复制品、保持登录开启验证同版重装保留及真正卸载清理。新制品身份、完整安装/卸载、数据保留、通知冷激活及实际 Release 均不在本 PASS 内。

# 014 early include v3：独立限定 PASS

Reviewer review_017_trusted 未参与产品实现。四路径独立 SHA-256 与 [manifest-v3](delivery-014-login-uninstall-author-manifest-v3.json)全部一致：

- after-pack：`7DACC906AF9C1E7492E8AAC07178CBF22917C83B55D7414899C78A53C9B57A48`
- installer-login-cleanup：`78C9A7D069C2CACBCDA58B28B2CCB379BEFA3828CFBF03FB20498B4C60B2A5F6`
- 作者 NSIS 测试：`1AFB992FF070C663B12B322410A6770ABDD3B87C7822C90D2C0D2F1C4748125E`
- packaging-config-independent：`6985FA2180DAB4EF4952848672D16F8FBB2BFB156E90D9DF2D509CED455D8C5E`

当前生成器原样输出以 BUILD_UNINSTALLER 为最外层 guard，内显式引入 LogicLib，末尾闭合；三个卸载专属定义均在 guard 内。v2 显式文件名注入保持。没有改注册表算法或 afterPack 清单/许可证行为，没有降低 NSIS 警告等级。完整依赖与接口引用证明见 [诊断](delivery-014-login-earlyinclude-diagnosis.md)。

独立 [v3 探针](delivery-014-login-earlyinclude-review-v3.mjs)保留 build-03 实际头部顺序，直接调用当前生成器并输入真实程序文件清单、Mashiro.exe；不额外补 guard 或 LogicLib。以真实 common.nsh 与最小 Section 编译 BUILD_UNINSTALLER 和最终 installer 两个分支，均 `/WX` 退出 0，stdout/stderr 为空；[双分支原始结果](delivery-014-login-earlyinclude-review-v3.json)。生成 EXE 未执行，无 Registry/桌面操作。

审核者旧运行期 fixture 仅将提前 include LogicLib 改为真实 BUILD_UNINSTALLER define，原五个类型/容量/禁用状态断言保持。真实隐藏 NSIS UUID 隔离场景 5/5 通过，退出 0，[原始结果](delivery-014-login-uninstall-review-v3-boundary.json)。当前新编译探针 scoped ESLint 退出 0；既有未变 ABI 与作者四路径静态结果比例复用，不重跑整个历史资格。

结论限定为 v3 源码、早期双分支编译和上述隔离场景 PASS。先前 build-02/build-03 真实失败及旧有限 PASS 均保持原时点，不覆盖或改写。本探针省略无关临时 UI 语言 include、压缩包与完整安装器 Section；root 仍须真实 electron-builder 两阶段完整生产重包，再验证安装/卸载、数据及登录注册。不能把本 PASS 当完整生产包或最终发行验收。

# Release-v6 artifact independent static review

2026-09-08 Astra/medium。**STATIC_PASS**，仅准入原生覆盖升级，未启动installer/EXE或操作安装现场，不是016/实际发布最终PASS。

运行源码ea94184e3fb80943d333005d50372dacf1892ea3，候选manifest99FC2D11…85AEC及21路径现场哈希匹配。独立脚本实际读取完整v6：[artifact-review.json](delivery-014-release-v6-artifact-review.json)、[EXE身份](delivery-014-release-v6-artifact-identity.json)、[ASAR integrity](delivery-014-release-v6-asar-integrity.json)。

- Setup112587804 / FABC9B560D27AFE5ECE3C8A62CD33A50E797A506D31B02A7E0E575A4208FB995。
- EXE245289984 / 33F79D190010A5A6E0C3B9AFDC4D3E14020BCEA272BEDBD209508CFA684454D7。
- ASAR15514291 / 7659DE497E76AD04CABDBF6956F9BC519ED8E0B3AF1E1FCC4F423B22DC459F0E。
- Blockmap118868 / FDE645EE90E77D598B88525D229B76D3E95EFA74A8CB73FA12A80F55DBDDCA33。

两EXE实际ProductName Mashiro/FileVersion0.1.0/NotSigned，不沿用旧EXE身份。ASAR五份输出逐字节匹配identity-root-frozen-output01，main927315/SHA176002…18556；运行schema19、cold navigation、policy-status、沙箱与新生产身份/开发通知guard包含。包根仅node_modules/out/package.json，runtime依赖版本与六声明及index实际一致。

79项owned清单与实际79普通文件一致，无符号链接、data、default_app.asar或version残留；当前生成NSIS宏与审核后生成器按实际owned/dirs重新生成完全一致，包括新旧Run迁移与精确卸载。config APP_ID io.github.molotov0cocktail.mashiro、nsis.guid5555e988-f7b5-5fe3-b6bd-8df3b21f793e实核，沿用旧安装身份而隔离通知身份。新宏有迁移增量，不能简单以v5同字节uninstaller复用取代此次原生旧Run升级选择验证。

实际PE中resources/app.asar完整性值4a14eb3bf7bc809481a171690ed8f05ea87d00bae70ea03feada6a6aadac7d79，与ASAR头SHA256匹配。PE另含发行版default_app.asar的完整性metadata，实际文件不存在，延续已审无额外fallback代码边界。

首次组合工具退出1来自末尾rg找不到旧辅助脚本路径，静态Node脚本已经完整写出STATIC_PASS结果；后续已读结果确认，未将辅助搜索失败冒称制品失败或重跑成功覆盖。所有身份/签名/完整性均实际只读计算。

下一步：唯一native owner覆盖安装，核旧GUID实例/数据与旧Run On选择迁移，精确新AUMID Shell解析到安装EXE，开发两PID不污染生产身份，以及新通知真实点击/冷启动导航。此前用户两条点击错误Electron的FAIL仍保留，不以本静态PASS替代实际修复验收。
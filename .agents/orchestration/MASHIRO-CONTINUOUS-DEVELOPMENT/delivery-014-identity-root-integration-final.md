# 通知身份修复：最终源码整合

2026-09-08，root 按实际工作区与独立证据结算：SOURCE_INTEGRATION_PASS，仍须 v6 制品、覆盖升级、Shell 身份和真实通知点击验收；没有发布。

最终候选由[作者 manifest](delivery-014-notification-identity-manifest-v1.json) SHA256 99FC2D11C4B586E978C65E5CCD486E84A86C835B181CD89F672AD806A7B85AEC 的 11 产品/接线、8 作者测试及 2 独立 oracle 共 21 路径界定。[独立最终审核](review014-identity-independent-final.md)及[逐项哈希核对](review014-identity-final-manifest-check.json)确认全部一致。生产身份为 io.github.molotov0cocktail.mashiro，安装 GUID 保留实际旧值 5555e988-f7b5-5fe3-b6bd-8df3b21f793e；开发不能启用原生通知，合成平台仅供非打包 test profile。数据库、数据位置及 Provider 协议未改。

## 验证及原失败

- [完整 run01](delivery-014-identity-root-full-01.json)：215 文件、872 项，863 通过、1 失败、8 明确 opt-in 跳过。唯一失败是独立晚到 Off 反例，不改写成全绿。
- 完整运行后只变更 installer-login-cleanup 生成器与新增该反例的独立测试。生成器 ECD54D…576E4 修为 9D7039…6CA7BA；其他已冻结路径不变（22c81e）。随后[六个受影响文件](delivery-014-identity-root-affected-02.json)25/25 全通过，独立原反例另复跑通过。其余领域复用本次完整 run01 已通过结果，不重复无差异矩阵。
- Node TypeScript 由作者/独立最终审核通过；root Web TypeScript、全 lint、format 均退出0。最终仅变化的生成器另 lint/format 通过。root [正式 build](delivery-014-identity-root-build-01.raw.txt)退出0，保留既有 Zod 注释警告。
- [实际两进程原始结果](delivery-014-identity-root-electron-01.raw.txt)退出0，runId 9c0a1603-1df1-4c8b-b956-d364bbc62554，PID 44084/40668；Electron44.1.1、Node24.19.0、SQLite3.53.3。原 temporaryConversationReset、protected credentials、各领域恢复断言仍成立。提醒明确 syntheticDeliveryObserved=true / nativeShowObserved=false，Windows 点击、冷激活、登录注册均不据此冒称通过；没有新增付费 Provider 调用。
- [开发测试前](delivery-014-release-v6-pre-harness-shortcuts-01.json)与[测试后](delivery-014-release-v6-post-harness-shortcuts-01.json)两个已知快捷方式大小与 SHA 完全一致，未通过修改共享 Electron.lnk 制造通过。
- [冻结五份输出](delivery-014-identity-root-frozen-output-01.json)：main 927315 字节，SHA176002B9D221C553F41C479DF27B12E692B34376E0914C58D1AA4F716BA18556；其余 preload/renderer 与 v5 相同。该输出由提交前的最终工作区构建，后续 Git 提交需明确绑定这些相同源码字节。

依赖、版本、SQLite schema 无变化，依赖树与领域资格按前次有效验证复用。旧 NSIS GUID 首次算法参数错误未进入制品，最终按真实库及旧卸载登记核定；原 late-Off RED 和独立 NSIS fixture 编码失败均由各原报告保留。

## 下一动作

精确提交/非强制双同步后，用已冻结 out 构建 v6。原 v5 已从正式菜单生成升级前备份28860377并正常退出，旧登录项On保留；[root备份核对02](delivery-014-release-v6-preflight-backup-root-check-02.json)16清单文件与独立快照标记有效。新包须覆盖升级继承数据和登录选择、Shell精确解析至安装EXE/Mashiro，并验证真实通知点击；历史v5用户点击失败仍是FAIL。之后补016和最终发行材料，实际发布及无凭据下载校验。不得重试被拒任务栏路线或改其他项目。

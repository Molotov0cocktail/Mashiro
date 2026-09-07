# 014 固定发行残留清理：独立限定 PASS

Reviewer review_017_trusted 未参与产品实现。冻结身份独立匹配：

- `build/after-pack.mjs`：`BBF45360609093AEB3BA92C6FDEAEF5339D0F4B96E7E4CD0B36C7B461CF85803`
- `tests/unit/packaging-config-independent.test.ts`：`162E6AAC9FAA258BA7585438F29D6786EA2528507D36FC5A846179A6D8E0A28A`

删除只针对 appOutDir 的固定 `resources/default_app.asar` 与固定 `version`，在 notices/owned-file 枚举之前。先确认输出根为真实目录且解析路径等于自身，resources 父为非链接目录；目标缺失允许，存在时仅允许非链接普通文件，使用 unlink 而非递归删除。没有修改 fuse、系统防护、项目源码或 runtime ASAR，不删除未知文件。正常构建输出由当前打包流程独占；本测试不声称对任意外部进程同时替换父路径具有原子防护。

独立运行作者 4 项及 [新建边界 3 项](../../../tests/unit/review014-packaging-residual-boundary.test.ts)：合计 2 files / 7 tests PASS，退出 0，[原始结果](delivery-014-fixed-residual-review-run.json)。作者场景实际删除两残留，app.asar 与未知文件内容保留，owned 清单不再含残留，resources junction 拒绝且外部目标/第二残留保持。独立增补分别验证 output 根 junction、固定目标 junction、固定目标普通目录均拒绝；未沿链接访问或递归删除，合成目标正文保持。Reviewer 测试 scoped ESLint/Prettier 退出 0。

结论限于固定清理源码与合成路径边界 PASS。原 [v3 制品 ARTIFACT_REPAIR](delivery-014-login-artifact-review-v3.md)保持原值和原结论；修正后的实际包须在新目录重建，再核 setup/EXE/ASAR 身份、两残留缺失、owned 与许可证及安装后 payload。本轮没有执行安装器、EXE、桌面或 Registry，也没有重跑无差异宏 ABI 或旧 runtime 全套。

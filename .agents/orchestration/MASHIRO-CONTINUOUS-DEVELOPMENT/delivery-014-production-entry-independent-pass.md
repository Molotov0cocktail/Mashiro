# 014 生产入口与维护独立复核：限定 PASS

2026-09-07。Reviewer 为既有 steward_013_trusted（委派 Astra / medium），未实现本次 root 的 014 产品差异。本结论排除 main/index.ts 之前由本 reviewer 实现的 daily IPC 接线，亦不代替另一 reviewer 对 restore 核心/REM 通知组的审核；本次只追踪 restore 新增的批准快照绑定接缝。

[精确复核清单](delivery-014-production-entry-reviewed-manifest-v1.json)包含 10 个产品文件及 3 个独立 oracle 文件，SHA256 `EE0B189F8F7865A49D4F4D508C2624E0738E9BDC7676E0B9FB62B2975171AA38`。

## 发现与修复

| 发现 | 原始证据 | root 修复及独立结果 |
| --- | --- | --- |
| R-E1：当前 schema 仅经过 SQLite integrity/FK 检查，缺必需 guard 的数据仍被 session.select 绑定；业务 SqliteStore 随后拒绝 | [2 项 1 红](delivery-014-entry-independent-red-01.json)，真实临时 SQLite、配置/数据租约和 locator | 当前版在源只读事务期间复制到专属排他临时路径，运行完整应用验证，缺 guard 拒绝；不在原数据修补 guard，失败不切 locator。原 oracle 通过 |
| R-E2：ownershipLost 后 AssistantService.close 抛错逃逸 before-quit，未执行明确 app.exit(1) | [main 边界 2 项 1 红](delivery-014-main-independent-red-01.json) | provider/assistant 关闭进入同一保护块；失权失败明确退出，普通退出失败明确说明维护未开始。原 oracle 通过 |
| R-E3：原生恢复先展示快照 A 供确认，但路径在确认期间换成合法快照 B 后会恢复 B | [真实快照替换 1 红](delivery-014-consent-independent-red-01.json) | startup/maintenance 均携带确认时完整 receipt，core 在首个 await 前冻结 JSON，在实际验证后、创建目标标记前比对，并保留复制结束后的整份源快照复核。原 startup oracle 与新增 maintenance 路径均通过 |

未修改产品获得 PASS。独立 oracle 仅修过 mock 调用签名类型和格式，并将同一 R-E3 断言扩展到维护路径；原失败条件没有削弱。

## 实测覆盖

[最终比例结果](delivery-014-production-entry-independent-final-01.json)为 **7 files / 21 tests 全绿**，SHA256 `3C3020EDE4CBBE067A30C0601A764BB6A68141D3482AEB2284AD3EAE9B2C3109`。覆盖新三份独立测试、实际维护/生产 session、既有 session 失效反例及 window 安全。Node typecheck 和三份独立 oracle ESLint 均退出 0，格式化完成。

此外核查：正式 main 选择生产配置路径并向 E2E 返回空运行元数据；packaged create-window 忽略开发 renderer URL；实际 main 模块边界测试确认关闭顺序 Provider→Assistant→租约、释放期间重复退出被拦截。真实 session 准备期间重新出现 writer 时不切指向，目标租约可重新获得。维护取消、备份失败、未来版本从完整备份恢复到新位置的路线复用已实际通过的比例用例。所有反例只使用本测试拥有的 OS-temp 根，清理和快照替换均先校验范围。

## 结论边界

本 PASS 是上述精确源码及合成运行边界的独立结论；**未运行真实打包 Electron 原生菜单/对话框、在途工作退出的 native 故障注入、安装更新卸载或 Release 下载**。main 的 test double 不冒充 native PID 证据；真实数据/session 反例也不冒充正式生产整体验收。整体主进程集成、当前 schema15/REM及 daily 候选仍由 root 做最终全量、build、双 PID 和制品验收。PROGRAM ACTIVE。

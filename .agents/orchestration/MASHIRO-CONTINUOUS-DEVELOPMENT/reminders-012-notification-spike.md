# 012 Windows 通知路线独立实验

- ROLE：Explorer（实际 gpt-5.6-sol / high）
- ROUTE：`NOTIFICATION-012-A`
- 日期：2026-09-07（原始 Electron 事件为 UTC）
- 结论：`SUPPORTED`，仅限本机 Electron 44.1.1 开发态独立主进程的通知事件入口；不是安装制品通知资格或用户点击资格。

## QUESTION

在不修改 Mashiro 产品、011 文件、用户现有快捷方式、注册表、通知设置、登录项或系统防护的前提下，本机精确 Electron 44.1.1 是否能在唯一临时应用中：

1. 进入真实 Electron browser 主进程并设置唯一合成 AppUserModelID；
2. 返回 `Notification.isSupported()`；
3. 调用 `show()` 并观察 `show / failed / close` 的实际事件；
4. 注册 `Notification.handleActivation`，随后有界退出且无进程/临时目录残留。

## ROUTE / HYPOTHESIS

Route A 使用现有 `node_modules/electron/dist/electron.exe`，把 `userData` 与 `sessionData` 指向每次新建的 `%TEMP%/Mashiro-Notification-Spike-012-<GUID>`，只设置进程内唯一 AUMID，不创建快捷方式或注册表项。PowerShell 以 `Start-Process -WindowStyle Hidden` 启动，15 秒超时只终止返回的自身 PID。

关键启动事实：Codex/Electron harness 环境可能含 `ELECTRON_RUN_AS_NODE`。Electron 按键是否存在进入 Node 模式；PowerShell 7.6 应使用 `Start-Process -Environment @{ ELECTRON_RUN_AS_NODE = $null }` 对子进程显式删除该键。微软文档确认 `-Environment` 的 `$null` 值用于 unset。

## ISOLATION / FILES

实验只新增 `reminders-012-notification*` 文件：

- [探针](reminders-012-notification-probe.cjs)
- [隐藏启动、超时及清理 runner](reminders-012-notification-run.ps1)
- 每次尝试的 `events.jsonl / result.json / stderr.txt` 原始证据

没有修改 `src/`、`tests/`、`scripts/`、`package*.json`、配置、全局任务文档、Git index/HEAD 或任何 011 文件。无 Provider 请求、无凭据、无私人数据访问。通知标题为“Mashiro 合成通知实验（012）”，正文明确为隔离验证且不含个人信息。

运行时：

- Electron npm 包：`44.1.1`
- `electron.exe` SHA-256：`11246B242F4FB967283B6D50D5800FA30E7C3F43D47353A6D20FC8D6AC07B87F`
- 成功探针 SHA-256：`1C49876F43B285DE601359FE55E67CCA82B79A3709B8E1C87AC81F0E4F69B369`
- Windows：`Microsoft Windows NT 10.0.26200.0`，x64
- PowerShell：`7.6.5`
- 成功 Electron：Node `24.19.0`、Chrome `152.0.7977.65`

## EXPERIMENTS + EXIT CODES

| 尝试 | PID | 单一变化 | first bad state / 实际结果 | 进程退出 |
| --- | ---: | --- | --- | ---: |
| A1 | 129848 | 临时单文件入口，`require('electron/main')` | API 前 `Cannot find module 'electron/main'`；[events](reminders-012-notification-route-a-attempt-1-events.jsonl) | 70 |
| A2 | 130140 | 改为 `require('electron')` | API 前 `Cannot find module 'electron'`；[events](reminders-012-notification-route-a-attempt-2-events.jsonl) | 70 |
| A3 | 132668 | 改为临时 app 目录+`package.json`，增加预导入诊断 | Electron 版本存在，但 `ELECTRON_RUN_AS_NODE` 键仍存在、`process.type=null`、`defaultApp=null`，仍为 Node 模式；[events](reminders-012-notification-route-a-attempt-3-events.jsonl) | 70 |
| A4 | 132972 | `Start-Process -Environment` 对子进程显式 unset `ELECTRON_RUN_AS_NODE` | `process.type=browser`、`defaultApp=true`，完整进入通知路线；[events](reminders-012-notification-route-a-attempt-4-events.jsonl) / [result](reminders-012-notification-route-a-attempt-4-result.json) | 0 |

A4 的实际事件顺序：

1. `pre-require`：`ELECTRON_RUN_AS_NODE` 不存在，Electron `44.1.1`，`process.type=browser`。
2. `ready`：AUMID、userData、sessionData 均为本次唯一合成值；`handleActivationAvailable=true`。
3. `activation-handler-registered`。
4. `is-supported { supported: true }`。
5. `show-invoked`，22 ms 后收到 `show`。
6. `show` 后 1.504 秒调用 `notification.close()`，记录 `close-requested`。
7. 再观察 6.483 秒仍未收到 `close`，于是记录 `quit-requested { reason: observation-timeout }`。
8. 随后收到 `before-quit`、`will-quit`、`quit { exitCode: 0 }`，runner 观察进程退出 0。

A4 中没有 `failed`、`close`、`click` 或全局 `activation` 事件。stderr 为空。Electron 官方说明 Windows 的 `close` 事件并非所有关闭情形都保证发出，因此这次“close 未出现”是实际边界，不是成功回执。探针在 `app.quit()` 前设置的 Node `process.exitCode=5` 没有成为 Electron 的退出码；产品不能用该方式持久表达通知结果，状态应在退出前由可信存储记录。

## FIRST BAD STATE / EVIDENCE DELTA

- A1/A2 失败在模块导入，尚未进入 `app.ready`，不能记为 Windows 通知失败。
- A3 把问题定位到环境：空值仍表示环境键存在，Electron 处于 Node 模式。该证据也解释了 A1/A2 的模块解析症状。
- A4 使用 PowerShell 官方的子进程环境覆盖机制后，真实 Electron browser 主进程和通知 API 均可用。没有复制 npm `electron` 包到临时目录来掩盖 Node 模式。
- `show()` 返回与 `show` 事件均已观测；这只能记录“API 调用已返回 / Electron show 事件已到达”，不能标记“用户已读”。
- `failed` 未发生只能说明本次合成输入没有已知创建/展示错误，不能证明 Windows 通知始终可用。
- `notification.close()` 已调用但 `close` 未发生；不能把关闭请求等同关闭事件或用户关闭。
- `handleActivation` 的 API 可用且已注册；没有用户点击，因此 click、全局 activation、实例/全局双回调去重、冷启动和重启后激活均未验证。

## CONCLUSION = SUPPORTED

012 候选可以使用可信 main 进程的 Electron `Notification` 最小适配层，并将事件语义分开：

- `show()` 正常返回：仅表示提交调用没有同步抛错；
- `show`：记录 Electron 提供的展示观察，不记录用户已读；
- `failed`：记录已知失败和原始错误；
- 到观察期限既无 `show` 也无 `failed`：记录 `RESULT_UNKNOWN`；
- `close()`：只记录关闭请求；只有实际 `close` 事件才记录其 reason，且不能依赖其必达；
- `click` 与 `handleActivation`：都进入同一窄可信入口，按提醒 ID+计划版本重新查库并去重，不接受路径、正文或脚本授权。

## CANDIDATE ROUTE / REMAINING QUALIFICATION

开发/CI Electron harness 必须显式删除 `ELECTRON_RUN_AS_NODE`，检查 `process.type === 'browser'` 后再把通知结果当真实 Electron 证据。

本实验没有创建 Start Menu shortcut/ToastActivatorCLSID/COM 注册，因为开发态 `show` 已成功，未触发扩大系统配置的条件。Electron 官方仍要求 Windows 应用具备带匹配 AppUserModelID 与 ToastActivatorCLSID 的开始菜单快捷方式。014 的真实安装制品资格仍需在普通权限下验证：

- 安装快捷方式、AUMID、ToastActivatorCLSID/CLSID 注册一致；
- 用户真实点击、实例 click 与全局 activation 去重、冷启动/重启后激活；
- 更新后路径/注册延续，卸载后自有快捷方式和注册项回收；
- 系统禁用/抑制通知与 Action Center 的真实产品状态展示。

参考：[Electron Notifications](https://www.electronjs.org/docs/latest/tutorial/notifications)、[Electron Notification API](https://www.electronjs.org/docs/latest/api/notification)、[PowerShell Start-Process -Environment](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-7.5)。

## CLEANUP / RESIDUALS

四个唯一临时根均已删除；每次 runner 的清理前后匹配进程数均为 0。最终再次扫描 `%TEMP%/Mashiro-Notification-Spike-012-*` 和命令行含该前缀的进程，结果均为空。没有创建或修改快捷方式、注册表、通知设置、登录项或系统防护。

A4 已调用 `notification.close()`，但因没有 `close` 事件，Windows 通知中心中该条合成通知是否仍残留没有独立查询，保持 `UNKNOWN`；不得冒称已由事件确认移除。

限定静态验证：

- `npm exec eslint -- .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-notification-probe.cjs`：退出 0；
- PowerShell AST 解析 runner：退出 0；
- 所有四次 stderr 文件：空文件 SHA-256 `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`；
- A4 events SHA-256：`2615DC92D7CC408C7193A464C4F32BF34854882B30C86C403245514AAE3BA2D0`；
- A4 result SHA-256：`465892B5D1CB6CA613EACC40F0E79DDB474C3E5AAF2C9A8E125EFD4411EDC7AD`。

未运行：产品实现、托盘、登录启动、真实提醒持久化、安装器、快捷方式/注册、用户点击、冷启动、休眠、更新/卸载、Provider。实验结论不能替代 012 Reviewer 或 014 最终制品验收。

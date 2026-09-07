# 014 schema 18 安装、通知保留与持久凭据原生验收交接

## 范围与制品

本轮只使用隔离场景 `mashiro-install-full-Zbzmgp` 和合成数据集 `9f2cf384-daa4-4bb6-819a-33976e479c5a`。当前安装制品来自已审提交 `f4fb5c7c064e0e24bbd0d360cdf7a8b208a0027f`，安装包 SHA-256 为 `CBA1270A795A9FA0BACFCD8D8224B4C8B43A594E69E552CCE1083943C402AE5D`，安装后 EXE SHA-256 为 `F5566CEDB14AF2C2908717B12860FBEBA4EB6BBA12BE25F722BC919009164F05`，ASAR SHA-256 为 `7FDDAD7FDA3E7ED19E754FB9704B61B7AD1F0E0A9ECDF879AA41D836D30702BC`。它是未签名的内部验收包，不是最终发布制品。

未读取真实个人资料；Provider 调用只使用唯一无私人含义的合成标记。Key 只经受限 stdin 桥输入密码控件，没有写入普通文件、日志、截图或报告。

## 已证原生结果

### 升级、数据与新入口

- 原 schema 15 数据由安装程序升级到 schema 18；SQLite `integrity_check=ok`、外键错误为 0，数据集 ID 保持一致。
- 71 张既有表逐表摘要一致。`daily_configs` 与 `reminder_settings` 是两张有解释的变化表：前者的配置 JSON SHA、ID、助手、功能和 `next_run` 保持一致，只有周期调度的 `last_tick` 从 `2026-09-07T12:00:15.752Z` 更新到 `2026-09-07T13:55:29.393Z`；后者由本轮在真实 UI 中显式开启登录启动并保存运行设置而从版本 0 更新到版本 1，策略摘要随之变化。
- 新增 `memory_round_evidence`、`production_governance_commits`、`production_governance_state` 三张 schema 18 表；旧的 12 个非数据库文件保持原摘要，新增 `.mashiro-governance.json`。因此不能把升级描述为“所有表和文件完全不变”。
- 已安装 UI 能打开历史轮次 `E2E_NORMAL_USER` 的“查看本轮业务与工具回执”入口，并显示“所选轮次业务与工具回执”和“所选轮次没有可信工具或业务回执。”；没有触发 Provider 重发。该入口在本轮范围内通过。

### 登录启动 v2

- 重装后提醒设置显示“已由系统确认开启”，登录复选框为开启状态。当前用户 Run 值精确为 `"…\\Mashiro.exe" --mashiro-login`，旧的 `Run\\Mashiro` 不存在。
- 开始菜单快捷方式绑定 AUMID `Mashiro.Desktop`、Toast CLSID `{B5051779-A11F-4603-BE81-C87C46CCB6C5}`；该 CLSID 的 `LocalServer32` 精确指向当前安装 EXE。
- 正常菜单退出 PID 170296 后，本安装路径进程数为 0。随后用当前安装 EXE 的 `--mashiro-login` 隐藏启动，主进程 PID 195904、初始 HWND 0；普通启动被单实例接管后仍由 PID 195904 恢复窗口，临时进程退出且只保留原四个 Electron 进程。登录启动与单实例恢复在本轮范围内通过。

### 通知展示、历史保留与退出

- 合成提醒 `70a8cb12-b0e3-42f6-b261-b08e6febcfb6` 经真实 UI 改为版本 6，到期时间 `2026-09-07T21:10:00+08:00`，命令 ID `f92ccae9-59e6-41e0-989e-86c2fbfbaa8b`。
- 到期前，`GetHistory('Mashiro.Desktop')` 返回 0。主窗口关闭到托盘后 PID 195904 仍存活；在 `2026-09-07T13:10:00.620Z`，即上海本地 `2026-09-07T21:10:00.620+08:00`，数据库把同一提醒版本 6 记录为 `DISPLAY_OBSERVED`。
- 运行中 `2026-09-07T21:10:29.566+08:00` 的 Windows WinRT 历史精确返回本应用一条记录：tag `d78abf505e772867`、group `reminders`、count 1。通过产品菜单正常退出后，本安装路径进程为 0；`2026-09-07T21:14:32.902+08:00` 再读仍为相同 tag/group/count 1。该证据证明修复后的已派发通知在正常退出后被系统历史保留。
- Win+N 后的固定标题/正文 UIA 查询仍未定位条目，任务栏受 NVIDIA overlay 干扰；没有枚举、保存、点击或清除其他应用通知。用户可见横幅、真实通知中心鼠标点击，以及由该点击触发的暖/冷激活仍是 NOT_PROVEN。
- 在应用进程为 0 时，以已核快捷方式 CLSID 和同一 v6 通知组参数调用 Windows INotificationActivationCallback。COM 返回 S_OK 并启动当前制品四个进程；稳定后的真实 UI 直接进入目标事项 E2E_ITEM_waiting 的“事项详情”，同时显示 v6 到期时间和“已观察到展示”。备份前后只新增唯一 activation 70a8cb12-b0e3-42f6-b261-b08e6febcfb6:6；通知组成员、occurrence、reminder 和目标事项均不变。该结果证明注册的 OS COM 冷激活与 launch 参数到业务定位的链路，不等同于用户实际点击通知。验证后通过产品菜单正常退出，2026-09-07T22:30:33.0916129+08:00 本安装路径进程为 0。

### 持久凭据、重启解密与真实 Provider 链

- 唯一密码控件通过固定 EXE/hash/PID/HWND 和 `IsPassword=true` 守卫接受已授权 Key；提交后 UI 显示“Key 已由 Windows 凭据保护持久保存”。PID 194584 通过产品菜单正常退出，精确进程数为 0。
- 新 PID 193864 启动后没有再次输入 Key，UI 仍显示持久保护状态。随后只发送一次包含合成标记 `SYNTH_KEY_RESTART_c2a8f772aff5` 的用户任务。
- 该任务形成同一 request chain `1895f71b-114b-41a5-898b-48e82fcf1443` 下两次真实 HTTP 工具续答，两次均为 `SETTLED`。实际用量增量为 prompt 6384、completion 131、total 6515 tokens，input characters 1568；UNKNOWN/SENDING 增量均为 0。
- 可信工具操作 `97bcb3b7-cff7-4434-92c6-b38435733918` 为 `write_memory/SUCCEEDED`，真实 Memory 回执 `429a42c5-e9ff-4f53-8af4-2eb4ac61f10e` 创建对象 `43c35979-ee88-4510-a699-7bb0bd8c026d` v1。Markdown 73 bytes，SHA-256 `376BE9FE9FAA1B414766D036E22763B8477EDC6A41E6D5FC9D8EF508B827F04B`，数据库正文摘要一致。事项、待确认提案、提醒数量不变。
- 这条真实 HTTP 成功和业务写入证明持久 Key 在正常退出和新进程启动后被实际解密使用；仅凭 UI 标签或 80-byte 受保护凭据文件不作为结论依据。程序累计实际请求由 54 增至 56，已知 token 由 90162 增至 96677；历史 5 条未知用量保持未知。

### 调用后完整备份

- 真实产品“完整备份并退出”把当前 schema 18 数据写入 `完整备份-凭据调用后-04`，backup ID `59eb6a23-ff54-4640-9e0a-298b977a61ce`。确认文案明确包含历史、记忆正文、治理状态和受保护凭据；完成文案为“备份已校验，程序即将退出。”
- 确认后 PID 193864 正常退出，本安装路径进程为 0。清单包含 16 个源文件；每个源文件与 payload 的长度和 SHA-256 一致，源与 payload 的 SQLite 完整性均为 `ok`，逐表计数一致，快照标记与 backup ID/data set ID 绑定。
- delivery-014-current-backup-01.json 的文件、哈希和 SQLite 校验是在源仍静止时取得，但其 PID/时间字段误留自更早运行；该文件保留为元数据错误证据。修正 helper 读取本次原始 UI 事件，保留 01 的备份时源比较并重新核验不可变 payload，权威修正版为 delivery-014-current-backup-02.json；未记录的确认点击时刻明确为 NOT_RECORDED。
- 当前受保护凭据文件只按 bytes/SHA 参与一致性校验，从未读取或输出内容。该结果为 `PASS_WITHIN_INSTALLED_BACKUP_SCOPE`，并给后续恢复验证提供了调用后精确基线。

## 失败事实与限制

- 018 按钮的 UIA Invoke 不受支持，最终使用进程/HWND/控件命中三重守卫后的精确指针点击。
- 通知中心固定标题/正文查询和系统面板 UIA 均未定位条目；WinRT 本应用历史提供了不同机制的确定性保留证据，但尚未证明视觉点击。
- 首次 Windows PowerShell 5 密码桥因 UTF-8 无 BOM 的中文路径解析而在读 Key 前报 `PROCESS_PATH_MISMATCH`；pwsh 非 PTY 会话因 stdin 立即 EOF 报 `KEY_INPUT_INVALID`；跨 agent 写会话返回 `Unknown process id`。最终由 root 在同一已审 pwsh7 helper 会话输入成功，以上失败均未修改密码控件。
- 第一版调用后核验工具误查不存在的 `memories` 表并失败；修正为真实 `memory_objects` 后得到上述证据，未放宽断言。

本交接只冻结已安装内部候选的上述切片。真实通知中心点击及其用户触发激活、恢复治理、卸载保留与登录 Run 清理、最终发行制品（签名状态如实说明）、发布和下载仍需继续验证；本报告不是 014 整体 PASS，更不是 PROGRAM_DONE。

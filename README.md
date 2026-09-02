# Mashiro

Mashiro 是面向 Windows 11、单用户、本机优先的私人助理桌面应用。当前 F1 候选提供本地助手身份与 SQLite 持久化生命周期：创建、切换、重命名、设为主助手和归档。

## 开发命令

- `npm ci`：从锁文件干净恢复 npm 依赖；随后运行 `npm exec install-electron` 恢复锁定版本的 Electron 二进制。
- `npm run dev`：启动开发环境。
- `npm run test:focused` / `npm test`：运行聚焦与全量测试。
- `npm run typecheck`、`npm run lint`、`npm run format:check`：静态验证。
- `npm run build`：构建 main、preload 和 renderer。
- `npm run test:electron`：构建并用两个真实 Electron PID 验证重启恢复。
- `npm run verify`：运行完整候选验证链。

运行数据不写入仓库。开发数据位于当前用户 appData 下的 `Mashiro Development`；E2E 使用带所有权标记的唯一系统临时目录并在验证后清理。

F1 不包含 Provider、对话、记忆、事项、提醒、安装器、PACKAGED、Release 或部署。

## F1 候选状态

mandatory-fresh Candidate Reviewer 已对精确 HEAD `90335af96bf95e531ddadc4f3f19259a75c18ee4`（tree `41afc7bf9c4db1c4a98c93f3c0c0bc3ea27a7451`）给出 F1 `PASS`；聚焦/全量验证为 10 个测试文件／18 个测试，独立完整 `verify` 的真实 Electron PID 为 `506244 → 506388`。当前 closing 仅更新文档/证据；若形成 closing commit，仍须新的 mandatory-fresh Final Reviewer 审核该精确 HEAD 后，才可无 force 推送到 `github/main` 与 `gitee/main`。`PACKAGED`、发布和部署链路继续为 **NOT RUN**。

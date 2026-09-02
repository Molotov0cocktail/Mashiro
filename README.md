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

当前实现已完成 Executor 验证，尚待 mandatory-fresh Reviewer 作出唯一 verdict。聚焦/全量测试、类型检查、lint、格式、构建、clean `npm ci`＋显式 Electron 恢复和两个不同真实 Electron PID 的关闭/重启持久化均已通过；`PACKAGED` 与发布链路仍为 **NOT RUN**，任何 push 只允许针对 Reviewer 明确审核的最终 HEAD。

# Mashiro

Mashiro 是面向 Windows 11、单用户、本机优先的私人助理桌面应用。004 Provider 连接与严格临时文本的实现与验证已完成：在稳定本地助手身份基础上增加可复用 Provider 连接、按助手绑定模型，以及普通或流式的严格临时文本交流。

## 使用 Provider 临时文本

1. 运行 `npm run dev`。
2. 在“本地助手”中创建或切换助手。
3. 在“连接设置”中新建连接，填写名称和 HTTPS Base URL 后保存。
4. 输入你自己的 API Key；可仅在本次运行使用，也可选择由 Windows 凭据保护后持久保存。
5. 为当前助手绑定连接和模型。例如智谱测试配置使用 `https://open.bigmodel.cn/api/paas/v4` 与 `GLM-5.3-FLASH`。
6. 确认界面显示的“实际接收方”与模型，再发送普通或流式消息。可取消请求或清空当前助手的临时会话。

开发测试 Key 已清理，产品不会预置 Key。聊天正文和多轮上下文只保存在当前主进程内存中；退出后不能恢复，也不会写入助手时间线或长期记忆。连接元数据和助手绑定写入 SQLite；持久 Key 存在仓库外并由 Electron `safeStorage` 保护。保护不可用时会拒绝持久保存。

## 开发命令

- `npm ci`：从锁文件干净恢复 npm 依赖；随后运行 `npm exec install-electron` 恢复锁定版本的 Electron 二进制。
- `npm run dev`：启动开发环境。
- `npm run test:focused` / `npm test`：运行聚焦与全量测试。
- `npm run typecheck`、`npm run lint`、`npm run format:check`：静态验证。
- `npm run build`：构建 main、preload 和 renderer。
- `npm run test:electron`：构建并用两个真实 Electron PID 验证重启、凭据保护和临时会话边界。
- `npm run verify`：运行完整候选验证链。

运行数据不写入仓库。开发数据位于当前用户 appData 下的 `Mashiro Development`；E2E 使用带所有权标记的唯一系统临时目录并在验证后清理。

## 当前边界

Provider 文本实现支持连接、助手模型绑定、临时或 Windows 保护的持久 Key、普通响应、流式增量、取消、部分输出、分类错误和已知/未知用量。最新独立候选测试为 17 files / 62 tests，产品 finding 已关闭；当前只等待文档差异的独立复核，尚未推送。下一建议切片是每助手持续时间线、对话保存与重启恢复。工具调用、结构化输出、长期记忆、事项、提醒、安装器、`PACKAGED`、Release、部署和真实个人数据仍未实现或未运行。

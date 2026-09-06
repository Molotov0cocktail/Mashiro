# Mashiro

Mashiro 是面向 Windows 11、单用户、本机优先的私人助理桌面应用。当前 005 候选在稳定助手、Provider 连接和模型绑定基础上增加每助手持续时间线、严格临时模式的显式保存及正常重启恢复；独立审核与完整验证结果见 [当前任务](doc/tasks/005-persistent-timeline.md)。

## 使用文本交流与时间线

1. 运行 `npm run dev`，创建或切换本地助手。
2. 在“连接设置”中新建连接，填写名称和 HTTPS Base URL。
3. 输入自己的 API Key，选择仅本次运行使用或由 Windows 保护后持久保存。
4. 为当前助手绑定连接与模型，核对显示的实际接收方。
5. 正常模式自动记录用户消息、回答和状态；主动发送会把该助手最近合格历史发往显示的接收方。外发最多 16 个完整对话对，当前输入与历史共 64,000 个 UTF-16 字符；超预算的旧对话不会发出，本地历史仍保留。界面显示最近 100 条消息。
6. 严格临时模式不读取正常历史，也不自动保存正文。可显式“保存到此助手时间线”；保存当前临时会话尚未保存的可见消息与实际状态，运行中先等待或取消。保存成功后仍为临时模式，再次保存不会重复插入已保存内容。清空临时会话不删除正常时间线。

正常关闭会记录已收到的部分回答和中断状态；重启读取本地记录，不自动重发请求。失败、取消、中断的回答不作为后续正常外发上下文。临时正文及进程临时 Key 不随重启恢复。开发测试 Key 已清理，产品不预置 Key；持久 Key 在仓库外由 Electron `safeStorage` 保护，保护不可用时拒绝持久保存。

## 开发命令

- `npm ci`，随后 `npm exec install-electron`：按锁文件恢复依赖与 Electron。
- `npm run dev`：启动开发环境。
- `npm run test:focused` / `npm test`：聚焦与全量测试。
- `npm run typecheck`、`npm run lint`、`npm run format:check`：静态验证。
- `npm run build`：构建 main、preload 和 renderer。
- `npm run test:electron`：用两个真实 Electron PID 验证恢复、凭据保护和临时边界。
- `npm run verify`：完整候选验证链。

运行数据位于仓库外；开发数据在 appData 下的 `Mashiro Development`，E2E 使用带所有权标记的唯一系统临时目录。当前 schema v3 事务升级已有 v2，保留助手、连接与绑定；凭据文件独立保留。

## 当前边界

工具调用、结构化输出、长期记忆、事项、提醒、历史检索与全量浏览、安装器、`PACKAGED`、全面崩溃恢复、Release、部署及真实个人数据访问不在 005 范围。当前进度以 [progress](doc/tasks/progress.md) 为唯一入口，候选完成不等同于独立审核通过。

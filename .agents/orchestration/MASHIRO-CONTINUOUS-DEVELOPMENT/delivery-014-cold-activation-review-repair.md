# 冷激活慢初始化投递：独立 REPAIR

结论：已复现真实 App/AssistantPanel 在助手初始加载未完成时丢失 open-item 事件。不是对原生 COM 激活失败的判断；父级报告的实际冷启动进入目标事项可以与此时序缺口同时成立。

[独立 renderer oracle](../../../tests/renderer/review014-cold-activation-delivery.test.tsx)保留真实 App 与真实 AssistantPanel，仅延迟 assistants.list Promise，并用当前 preload 的非缓存监听分发语义替代跨进程传输；其他子面板用目标展示桩排除无关数据读取。暖态对照 PASS：snapshot 完成且订阅存在后发 open-item，App 打开事项页面并传入正确目标。冷态 RED：初始列表挂起时监听器数量 0，此时发送一次 open-item；随后 resolve 相同真实 snapshot 并等订阅就绪，目标仍为 none。原始 [run-02](delivery-014-cold-activation-review-run-02.json)为 1 PASS / 1 FAIL，退出 1；审核测试 scoped ESLint 退出 0。

## 已核完整时序边界

- `createWindow` 等待 loadFile/loadURL，未等待 React AssistantPanel 的异步助手列表完成。index 随后 startReminderRuntime，后者 attach/recover 后注册 Notification.handleActivation。
- App 的 reminders.onChanged effect 在 currentAssistantId 尚无值时直接返回；助手 snapshot 完成后才注册。
- preload 只是 ipcRenderer.on/removeListener；main 的 emitReminderChanged 校验后直接 webContents.send，没有待消费回执或 renderer 就绪握手。
- `ReminderService.activateVerified` 在 changed 回调前执行 `INSERT OR IGNORE INTO reminder_activations`，相同身份后续 changes=0 即返回。该记录是已接收原生点击去重记录，不能当作 UI 已消费回执。

可信落库顺序为本轮源码核验，未伪装成该 renderer oracle 实际执行 SQLite 的结果。最初尝试 jsdom 同时运行真实可信服务，被并行 RET 未完成 schema 的 `Storage schema version mismatch` 阻断，两项均未到业务；[run-01](delivery-014-cold-activation-review-run-01.json)保持原 FAIL。随后拆出纯 renderer 测试并移除 Node 导入，未通过修改产品/schema 绕过失败，也未重复构造半完成数据库。

## 修复验收重点

投递应在冷启动/慢助手列表时保留未消费目标，等有效 snapshot 后完成导航。仅把订阅提到 effect 首次执行仍不足以覆盖 React 挂载前的 IPC 事件；需要主进程待消费状态/就绪拉取或等价可靠机制，严格校验事件身份并区分原生激活去重与 UI 确认。当前窗口/renderer 重载的旧回执、对象被删除/权限变化、助手切换等不能重放到无权目标。不得在尚未完成消费前永久清除待处理目标，也不借此扩大 renderer 任意对象/命令权限。

独立复验至少保留暖态对照与原冷态反例，再覆盖首次订阅之前到达、重复拉取/确认幂等、失效对象及迟到 snapshot。实际 Notification.handleActivation 回放顺序、原生窗口启动/COM、真实安装数据和通知点击均未由本 Reviewer 执行；父级已有原生成功证据保持有效。

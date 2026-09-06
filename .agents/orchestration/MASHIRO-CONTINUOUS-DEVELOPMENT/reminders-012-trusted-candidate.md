# 012 可信候选交接

2026-09-07，实际 gpt-6-astra / medium。基线 072dd39771e01b29bbced93f49e20a996f1e2cab；本执行者无 Git 写操作。候选待独立审核，不自判 PASS；PROGRAM 继续。

## 候选与证据

固定 [32 文件 SHA-256 清单](reminders-012-trusted-manifest.json)，涵盖 main/shared/preload、可信 tests 及已有 Electron harness。renderer 与其测试由 UI 单写，正式任务/总入口/Git由root单写。

- 完整可信 tests/unit + tests/integration：[39 files / 249 tests 通过](reminders-012-trusted-final.raw.txt)，退出0。
- node TypeScript noEmit、固定候选 ESLint --max-warnings=0，最终均退出0。格式化只作用固定候选；[构建](reminders-012-build.raw.txt)退出0，未改变既有依赖。
- [真实 Electron 02](reminders-012-electron-02.raw.txt)：PID132736、133540；44.1.1 / Node24.19.0 / SQLite3.53.3。两个实际应用进程均通过真实preload提醒保存/重复命令回执、关闭窗口隐藏且仍存活、原生Notification show事件、同托盘handler注入恢复和明确app.quit退出。第二进程核实第一进程提醒同ID/HANDLED仍存在。原有身份/工具/记忆/事项/人设/保留证据继续通过；恢复0外发、显式发送1。
- [Electron 01](reminders-012-electron-01.raw.txt)此前也退出0，PID135364/139300；第二轮专门新增真实跨进程提醒身份断言。
- 实际OS托盘鼠标点击、原生冷启动激活、实际登录注册、安装快捷方式仍 NOT RUN；托盘恢复为同handler注入。Notification show不等于用户已看见；通知中心残留不作已清除承诺。登录适配合成测试验证路径/开关，开发环境拒绝注册；实际安装/升级路径由014联测。
- root独立执行真实Provider并持有凭据；本执行者无付费调用。root已回报第二轮自然中文实际工具链SUPPORTED，原失败及usage由root报告，不在此冒充renderer/native/process-restart live。

## 行为及边界

Schema9→10加法迁移，碰撞整体回滚，损坏列拒绝。reminder command及回执同一SQLite事务；命令身份保留，候选预留身份不能被手动入口抢占。DISPATCHING发生实例先持久领取、跨调度器唯一。系统展示与SQLite不原子；无观察/原生调用异常或中断恢复为RESULT_UNKNOWN，禁止盲重发。显式改期产生新版本；通知回调重查当前计划/正式事项，重复激活身份持久去重，合并只打开一次提醒列表。

事项标题/说明等普通编辑保留已保存提醒；完成/取消/删除停旧计划。保存/改期/候选确认仍检查事项CAS。正式事项的本地提醒不依赖Provider Key、模型预算、receive许可或origin助手继续存在。对话候选创建及确认沿用items当前read/write/receive、来源权限；严格临时无业务工具写入。

未批准REM-002数值绝未设默认。UNCONFIGURED恢复显示RECOVERY_PENDING，用户可明确选择补发窗口/合并，或逐项改期。准时周期tick保留；仅实际状态变更广播，未配置pending不反复改更新时间。窗口关闭驻留托盘，明确退出终止运行；先可信数据根设置userData再获取单实例锁，然后打开SQLite。原存储关闭失败仍阻止退出并恢复quitting=false。

prepare_reminder只准备候选；中文明确请求与本地选定/唯一匹配正式事项绑定。模型时间不是授权，UI明确确认才建立/修改同一提醒。实际失败文本含“请明天…提醒我。…不要改事项期限。”：旧整段否定过滤误伤，现按完整句识别，独立负向“不要提醒我”仍不产生候选。可信system提供用户明确IANA时区的当前当地日期/时间，避免UTC日界误算。无明确时区须询问。已知拒绝只有在稳定preview和command均核实未提交后才记CONFIRMED_NOT_APPLIED，其他失败保留UNKNOWN。

## 已发现与关闭的执行中问题

- 默认helper setup-refresh失败、apply_patch产品读取失败；核验无部分写后转精确路径/preimage/匹配次数/同目录原子替换/明确backup/posthash受控writer。换行/格式化导致的匹配失败均在替换前停止，没有覆盖未知状态。
- 初次ReminderService构造器消费注入clock，击中既有读取次数/撤权oracle；改为实际提醒工作时才读clock，完整旧套件通过。
- 合成旧schema夹具需移除新提醒表；未来版本拒绝改为11，保留旧迁移/碰撞含义。一次失败产生的精确合成profile根已清理。
- 中文工具合成初夹具未授权现有user-round来源history read/send，按010既有权限补齐，未削弱来源检查。
- native callback与全局激活合并去重、合并导航、renderer加载前IPC注册、无变化tick广播均在root早期审查后收敛。

## 后续

独立Reviewer核实32文件manifest、事务/来源/未知结果/重启和UI结合，root执行整体验证与版本收尾。REM-002默认决议仍待用户；012/009未完成门禁不抹去，013/014与总体实际发行继续。任何新源码修复须更新候选清单和相称证据。

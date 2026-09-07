# 013 日常与运行 renderer 候选交接

基线为 `2307e490a60af9cfce9f72ba9c0fd0d5ae658f20`。本候选只包含 renderer、App/ItemPanel 的窄接缝、样式与 renderer 测试；共享合同、IPC、preload、main、Provider 与 Item 服务由可信作者维护。

用户入口新增一级“日常与运行”，内含观察、每日简报、晚间复盘、周规划、期限与变更、运行与用量六类。每个日常功能按明确配置、可信时区预览、立即运行、作业控制、报告列表、报告正文、来源与用户决定排列。配置默认关闭；端点授权每次读取配置及切换连接/模型后回到未勾选。期限与变更提供观察窗口、字段与合并规则；计划提供 DST fold/gap 与错过运行规则；预算可独立关闭或配置。

报告读取固定 `report.version` 与 `governanceVersion`，来源按 `nextCursor` 累积。`daily.onChanged` 会立即撤掉正文、来源、观察草稿和旧读取，并用 route/inspect generation 阻止迟到结果恢复。观察只对 `pending-verification` 暴露接受、纠正、拒绝；已保存观察显示真实 memoryId/version 并转到记忆区走既有影响确认。提案按钮把真实 proposalId 交给 ItemPanel；ItemPanel 会重新核验权限并按 `proposal` 类型读取和打开待确认编辑视图。

运行与用量分别维护 operation view、attempt cursor 与 group cursor；未知请求明确显示为未知，不按零消耗处理。运行、作业控制、观察决定与已读使用稳定 command registry，未知回执保留原 commandId；成功或明确抑制后释放。作业显示 PARTIAL、REMOTE_UNKNOWN、预算暂停、补跑、取消及各结果槽位。

验证证据见 `daily-013-ui-tests-01.json` 与 `daily-013-ui-static-01.json`：完整 renderer 为 34 files / 141 tests 通过，web TypeScript、候选 scope lint、format 与 diff whitespace 均为 exit 0。这些是执行者证据，不声明独立评审 PASS。

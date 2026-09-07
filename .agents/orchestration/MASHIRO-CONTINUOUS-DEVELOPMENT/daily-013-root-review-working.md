# 013 日常独立审核：REPAIR

2026-09-07。root未参与日常可信/renderer产品实现，正在独立审核作者候选。014 root产品另由Sol/high独立审核；不把交叉角色的作者测试混成独立PASS。PROGRAM ACTIVE。

UI作者v1为9文件候选，34 renderer文件141tests与限定静态绿；仍发现以下真实用户闭环缺口。

| 编号 | 发现 | 独立证据 / 当前处置 |
| --- | --- | --- |
| R-U1 | 运行中心仅固定当前助手，没有功能/连接/模型/时间筛选及全部/内部角色访问入口 | DailyPanel-root-review.test.tsx；要求接真实query/usage筛选及完整计量展示，不能只补静态标签 |
| R-U2 | business标签实际直接请求usage，无法查看真正operations.query business记录或打开owner对象 | 同独立文件；需要独立业务页和合法所属对象导航 |
| R-U3 | ConfigEditor将完整DailyConfiguration作为strict settings发送，附带只读id/version等元数据，已有配置不能正常再保存 | 真实dailyConfigureInputSchema.safeParse抓到false；保持可信strict校验，renderer仅投影可编辑字段 |
| R-U4 | 普通job changed重新查询同版本配置，IPC返回新对象触发effect清掉未提交草稿 | structuredClone模拟实际IPC新对象，修改模型草稿后普通事件即丢失；需同版本保留及真正变化时的显式冲突 |

[最终四项RED](daily-013-root-ui-red-04.json)是本轮实际独立失败。首[01](daily-013-root-ui-red-01.json)误记现有tab“运行与用量”为“运行中心”，是测试入口名称错误；[02](daily-013-root-ui-red-02.json)已纠正并确认R-U1/U2。[03](daily-013-root-ui-red-03.json)确认R-U3，但草稿夹具复用同一配置对象造成假绿；04改为每次返回真实IPC等价的新对象后R-U4确认。没有改产品或削弱原需求以得到这些结论。

作者已收到四项修复，未给UI最终PASS。可信日常还在补提案PARTIAL恢复、来源治理、恢复时区、消费历史和分类账本，之后另做独立服务/真实角色/native验收。核心未完成的功能不得在总体覆盖中标为已交付。

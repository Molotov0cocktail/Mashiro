# 017 本轮记忆来源与变更入口

状态：INTEGRATION_PENDING / SOURCE_PASS；PROGRAM ACTIVE。由[016整体验收](016-overall-product-acceptance.md)发现，纳入[总覆盖](program-docs-to-release.md)D03，入口仍为[progress](progress.md)。编号已核现场，未覆盖其他正式任务。

## 原始要求与已核缺口

`proposal.md` §3.3 / MEM-002要求默认收起的来源与变更面板，能从本轮检查实际提供给模型的记忆、本轮变更、来源、时间、性质和操作入口。008已有单记忆详情、变化回执和反向请求UUID列表，007搜索操作只显示条数。这些仍有价值，但不能替代按回答查阅具体对象及提供版本的入口。

独立预审者plan_007只读定位，root已核原文及实际代码：Provider的search_memory已有对象/版本信息及持久依赖，renderer未收到可按轮浏览的记忆来源DTO；回执对象也缺直接打开对应记忆的入口。不得通过修改要求将该子项算作已完成。

## 可观察闭环

1. 在正常时间线的具体回答展开默认收起的记忆来源与变更面板，查看本轮实际提供的记忆对象及提供版本、可用的来源/时间/性质；明确“提供”不证明模型实际采用。
2. 同一面板展示本轮真实成功变更或待确认回执；区分未执行/结果未知。可打开对应记忆的现有查看、纠正和删除入口，不要求用户手工复制UUID。
3. 重启、局部上下文、取消/部分输出后仍按真实请求身份显示；当前读取/来源治理限制即时生效。旧版本被纠正、删除或不可再展示时说明不可用，不泄露旧正文、不拿当前内容冒充当时提供版本。
4. 严格临时仍不读取正常资料或新建持久追踪记录。可信侧验证assistant/request归属、分页和对象范围；renderer不直接读取SQL/协议载荷/路径/凭据。六个助手IPC频道不增加。

## 工程与验收

最新结果：可信13路径与UI7路径分别独立限定PASS，UI原R-U1–7已全部关闭，另有草稿/刷新悬挂保护。见[最终UI独立报告](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/review017-ui-independent-final-pass.md)。root冻结候选分组全覆盖169文件746tests、静态/build、原生已有双PID场景通过，见[整合记录](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-017-root-integration-close-01.md)。新018旧业务回执用户入口另行实施，不撤销017已审范围；本轮来源在最终安装版的真实模型操作与整体结算仍待014/016。以下保留修复过程事实。

当前独立界面审核：review_017_trusted（实际gpt-6-astra/medium，未参与产品实现）已复现5项实际REPAIR，原始报告为review017-ui-boundary-red-01.json（三项）、review017-ui-app-red-01.json、review017-ui-correction-red-01.json，均在项目编排证据目录。涉及权限世代第一帧、normal/temporary往返、迟到对象详情填入编辑框、A→B→A重新消费旧导航、纠正后返回对话保留旧版本。作者继续修复，原断言不削弱；可信范围既有PASS保留，界面未冻结或通过。

优先复用现有受管版本、依赖和业务回执。现场确认现有依赖在本地准备阶段即写入，且混有写入来源，不能充当真实外发证据；因此新增无正文的三阶段派发记录及schema18独立迁移模块。017作者提供模块，014作者在schema17稳定后协调总迁移入口。明确区分本地准备、派发已开始但接收未知、已观察Provider响应；旧历史标未追踪，不补造提供记录。具体API/布局由实施者决定，当前014治理单写锁不被抢占。

- [x] 边界明确后分配可信实施和UI单写者。
- [ ] 正常本轮提供/实际变更/对象导航的真实服务与renderer闭环。
- [ ] 错助手/错请求、撤权、旧版本清理、严格临时和重启的相称反例。
- [ ] 未参与对应实现者独立审核；最终制品纳入016场景2/3，不因本切片通过宣告PROGRAM_DONE。

memory_017_trusted（实际gpt-6-astra/medium）可信候选v1已冻结13路径，3文件20tests及限定lint通过，见[候选报告](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-017-trusted-candidate-v1.md)。review_017_trusted（实际gpt-6-astra/medium，未参与实现）已核13路径哈希一致，4文件25tests含5项独立反例通过，给出[可信范围限定PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/review017-trusted-independent-pass.md)。schema18由014作者接线，正式升级及整体类型检查仍待整合；原Sol已明确释放017 renderer产品写锁并继续login/native；新memory_017_ui（实际gpt-5.6-sol/high）已接入界面实施，保留既有round fixture。默认折叠、本轮状态区分、版本详情与真实外发截断的区别、直接对象导航及迟到响应失效均需DOM/实际界面验证。该项是发布必需，不是可选或远期。

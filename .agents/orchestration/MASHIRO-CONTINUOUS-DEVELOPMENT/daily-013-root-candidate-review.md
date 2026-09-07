# 013 日常候选独立源码与业务边界复核

2026-09-07。root未实现本次daily可信域或renderer，独立核查trusted manifest-v1的32文件与UI manifest-v4的10文件均零哈希差异。main中的root014差异、REM默认/组与生产数据由其他独立reviewer复核，不纳入此独立性声明。

## 后续差异说明

root随后修改daily-model提示词，使counterpart为空字符串而非null、观察上限7及allowProposals禁用与已有可信schema一致；真实简报诊断后进一步按feature生成专属角色说明，不放宽校验。该hunk不属于root独立PASS范围，交由未实现它的Sol独立复核；manifest-v1为修改前历史。当前实际PACKAGED首次失败已定位宿主MSIX虚拟化路径，桌面正常启动替代路线验证中，尚未制品PASS。

## 当前限定结论

CODE / LOCAL BUSINESS BOUNDARIES PASS；不等于013最终验收，更不等于PROGRAM完成。真实五角色端点随后已获[服务级SUPPORTED](daily-013-live-product.md)；新增日常native用户闭环仍待。

四条root独立UI反例（无运行筛选、无业务记录入口、配置携带DTO元数据被strict schema拒绝、同版本IPC刷新丢草稿）均已修复。v4新差异为明确显示“用户陈述”，争议动作仍带报告/治理/观察CAS和稳定commandId。daily-013-root-ui-green-01及daily-013-root-candidate-final-01保持原独立断言；作者renderer证据补充而不代替它们。

root另新增tests/integration/daily-root-review.test.ts两条组合断言：两提案候选中首项真实提交后故障，原来源纠正使剩余项STALE，恢复不再付费、不重复首项、正式事项及提醒仍零；在途观察更换实际接收方后迟到结果不能创建报告或记忆。daily-013-root-boundaries-01及最终候选比例结果均通过。

源码重点核读daily源收集/身份/接受与报告治理、部分提案回执、配置撤权、可信来源独立根、取消与UTC预算恢复、原Provider/Memory/Item跨模块差异、按实际transport派发计量和严格临时不持久化。既有普通Item执行仍必须匹配当前端点；后台独立实际接收方由显式配置和来源权限共同检查。用户拒绝与已接受对象的治理语义保留原任务边界。

## 集成证据与限制

- daily-014-root-full-01.json实际122文件587tests全绿，早于随后014 R-E1/E2/E3和REM弱schema修复；不能冒称这些后续差异已被该全量覆盖。后续独立原oracle比例均另有记录，整合最后全量仍需按最终候选执行。
- 当前npm build退出0；现有Electron生命周期原始daily-014-electron-01.json SHA256 03D941BD39DB740D480DA2EECA835F95676B9FD874CF731FC2092E3715BEA0AA，实际PIDs176040/175176，run5291ea0b-770c-49e9-bc49-ff61173d2dab；这是已有章节/仓储/提醒等native回归，未加新的daily native场景。已实测恢复0仓储调用，旧治理DOM断言有效。
- Windows unpacked最新构建成功；独立实际原生启动/数据选择验证正在准备。不把builder成功或旧harness当PACKAGED功能PASS。
- 未发起本轮新真实付费调用；五角色harness准备中。未提交、推送、打tag或发布当前未完成候选。

总目标继续：真实daily角色/界面 → 全覆盖反向验收 → 最终Windows完整生命周期 → 独立实际制品审 → 双远程/Release/下载校验。

# 013 日常与运行 renderer 最终候选交接

本候选以 daily-013-ui-manifest-v3.json 为唯一当前 UI manifest，取代 v2。原六类日常闭环、运行中心筛选/业务记录/用量、严格配置投影与草稿 CAS 语义均保留。

未接受且状态为 pending-verification 的观察现在可显式“标为有争议”，调用真实 daily.decide，携带报告 version、governanceVersion、观察 version 与稳定 commandId。RESULT_UNKNOWN 后再次点击沿用同一 commandId。未接受且已是 disputed 的观察仍可接受、纠正或拒绝，不重复显示争议按钮。已经接受并生成 Memory 的观察仍只进入记忆区的影响确认流程，Daily UI 不伪造撤回或仅改标签。

root 独立 oracle 当前 SHA-256 6FE1A1D8... 的 4/4 随定向套件通过。executor 验证为定向 6 files/15 tests、完整 renderer 36 files/148 tests、web TypeScript、scope lint、format 和 diff whitespace 全 0。新增两项争议回归覆盖固定 CAS、未知回执稳定身份及 disputed 后续可操作性。等待 root 依据精确 v3 manifest 作最终独立判定。
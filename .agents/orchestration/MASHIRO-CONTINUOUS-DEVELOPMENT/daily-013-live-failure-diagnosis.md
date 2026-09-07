# 013 日常真实角色诊断

2026-09-07，root协调；仅用户授权的合成事件与事项，凭据只在调用进程环境，未保存正文或Key。

- `daily-013-live-product-01.json`：2次HTTP200，观察COMPLETED且通过实际Memory API接受客观统计；简报FAILED。1261+1596=2857已得tokens。观察并非renderer或进程重启验收。
- 初始harness只有作业失败状态，且清理了合成临时根；未声称已知道首个失败的精确响应。后续增加仅结构诊断及明确feature子集，不改产品传输结果、不伪造模型输出。
- `daily-013-live-diagnostic-preflight-01.json`：单角色无网络预检通过。
- `daily-013-live-diagnostic-02.json`：1次HTTP200，1625tokens，strict schema有效，来源句柄全有效；非观察角色却返回1条observations，可信侧按原规则拒绝。提示词同时教授所有角色且前置观察统计说明，形成可消除的指令混杂。
- root改为按当前feature专属角色说明，并在非观察任务首尾明确observations为空；可信schema、来源校验及禁止非观察条目的规则保持。`daily-013-model-role-repair-01.json`原3文件5项断言通过，独立增补审核待回传。

截至诊断02，本组新增3请求4482tokens；程序累计50请求83836已知tokens，另历史5请求usage未知。后续03正在验证四个尚未通过角色，本记录不预先算作成功。失败证据保留；没有以HTTP200或本地模拟替代真实业务PASS。

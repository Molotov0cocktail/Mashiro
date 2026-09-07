# RET 状态通知修复 LIMITED PASS

独立 Reviewer review_017_trusted，继承实际 gpt-6-astra/medium。2026-09-08。产品作者 memory_017_ui；本角色仅独立测试/报告。此结论补足先前 v2 未覆盖的审计完成清会话缺陷，不覆盖最终 Windows 制品或发布验收。

## 结论和冻结身份

LIMITED PASS。[完整文件 SHA256](retention-009-review-notification-final-hashes.json) 记录 7 个实现/合成 E2E 准备路径、2 个作者 renderer 测试及 3 个独立测试。实际核对作者冻结前缀全部匹配。核心 policy service 为 C834EC22DF8D1FF8746E68C7DE8402C403913717DB5FAE67E87AF485BAC16F33，RetentionService 为 2356C81DE10046100FC8281A686E5EB6F7FC6E1DC7F787A173E582125D0E129B。

[最终独立 scope03 原始输出](retention-009-review-notification-scope-03.json)：7 files / 22 tests，22 passed，exit 0。范围包含三个新独立 oracle、原 Provider expiry / App 治理围栏，以及作者 ProviderPanel / RetentionPanel 真实组件测试。没有重跑 25k 性能实验、全项目构建或启动桌面。

## 保留的真实失败

- [首个原始 RED](retention-009-review-audit-notification-red-01.json)：纯 audit COMPLETE 清临时历史、abort normal 和 temporary 正常回答，共 3 RED；实际 expiry 撤权对照 1 PASS。
- [草稿原始 RED](retention-009-review-status-draft-run-01.json)：job-status 刷新使未保存的容量 64 MiB 变回 100 MiB；同场 policy-status 已保留 64。
- [中途 scope02](retention-009-review-notification-scope-02.json)：21/22；唯一失败来自作者新测试每次 rerender 新建 memoryApi 对象，触发初始化。修正为生产稳定 API 身份后，保留 64 MiB 和 overview 仅一次的原断言，scope03 全绿。此中间失败没有被覆盖或当作生产 PASS。

## 验证边界

- 新 strict enum policy-status 经既有 trusted safeParse 和同一个通知通道广播。audit COMPLETE、纯配置和调度错误状态使用该值，实际移动对象仍 reason policy。
- RetentionService 仅把真实内容/治理变更交给 Provider 撤权回调；纯状态仍广播给 UI。实际 expiry 继续 abort，在迟到 transport 成功后仍不能恢复被撤下正文。
- 临时历史原快照保留，普通/临时进行中回答的 signal 不被纯审计取消，后续成功正文可见；真实 preview/configure 不移动对象时也保持临时历史。
- App 在更新请求/治理代际前分流 job-status/policy-status；独立两项迟到初始助手快照照常接收，原真实治理旧快照仍拒收。
- ProviderPanel 在记录 retention epoch 前分流纯状态；作者真实临时 stream 测试验证模式、正文、取消按钮保留，以及同 epoch 随后的真实 cleanup 仍撤下正文。其他正文组件依受影响助手集合过滤；生产 policy-status 的 assistantIds 为空，不赋予正文读取权限。
- RetentionPanel 对全局 policy-status 只刷新 policy，按 effect 生命周期和 revision 防旧回写；不覆盖草稿或触发全量 overview。job-status 的既有 load 明确保留 policyDraft。独立两类状态下 64 MiB 草稿均保留。

作者另报 typecheck / scoped lint / format 全 0；独立新增测试已各自 scoped ESLint 0。E2E controller 仅生产审计就绪准备边界在当前记录中，未修改根 harness 的临时消息 6 条要求。本角色不把局部绿替代根正在进行的原六条隔离 Electron 回归，更不声明新包安装/卸载或实际发布已完成。
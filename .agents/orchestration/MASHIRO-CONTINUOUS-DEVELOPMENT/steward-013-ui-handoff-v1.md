# 013 仓储员 UI 候选交接 v1

2026-09-07；`steward_013_ui`，实际 `gpt-5.6-sol / high`；Execute Feature。产品基线 `95db9cfa93673ff6975ddb75ccba56b2d0264828`，工作树当前 HEAD `01a4d8c68dcad371d1bf6f0779d058e5b2fa39fe`。本文件只交接 renderer 候选，不是独立审核 PASS、013 完成或 PROGRAM_DONE。

## 候选范围

精确 9 文件及 SHA-256 见 [candidate manifest](steward-013-ui-candidate-manifest-v1.json)，manifest SHA-256 `FC8C3D00F5D7D6CE26992C39BFDEA5F797A5F74972C414CF02A6023C5D70B27B`。

- `App.tsx` 增加一级“资料整理”入口，并把当前助手快照、仓储 API、记忆 API 和 Provider API 交给新面板。
- `StewardPanel.tsx` 分开当前助手共享增量识别与 singleton 仓储员配置；默认关闭，分别保存连接、模型、来源范围、显式接收授权、读写/推测选择和 UTC 日硬预算。切助手使用 route generation/read version，迟到 A→B→A 结果不会覆盖当前页，busy 不跨路由。
- 待整理区明确 shared candidate 尚未接受，显示性质、来源、正文与丢弃回执；仓储作业显示 `PARTIAL`、`REMOTE_UNKNOWN`、预算/权限状态、稳定 slot commandId、取消和对应重试。
- 分支详情按冻结的 `cursor/nextCursor` 累积真实成员与页级 Markdown；完整导出固定同一 expectedVersion 遍历所有页，版本变化或用户取消时不生成不完整文件。成员应用内编辑走现有 `memory.mutate(correct)`，草稿绑定原 member/branch CAS；外部修改继续 `previewReload` 后显式 `acceptReload`。
- 冲突不能任意选择旧 memory 关闭。UI 先 `memory.inspect` 读取某侧当前接受记录，再由用户即时纠正；只把 `SUCCEEDED` 回执的新 memoryId/version 交给 `resolveConflict`。关闭回执未知时保留已接受纠正并复用稳定 resolve commandId。旧引用变为 `STALE` 后仍可读取当前侧并完成此恢复通路。
- `MemoryPanel` 新增 actor=`steward` 的中文“仓储员”标签，既有 actor=`background` 的“后台整理”不变。样式沿用中文深色应用风格，并为 7 个一级入口和窄屏布局调整。

## 验证

- 完整 renderer：29 files / 129 tests，通过。原始输出 [steward-013-ui-renderer-tests.raw.txt](steward-013-ui-renderer-tests.raw.txt)，SHA-256 `05ED39ECBC78D37F132682509AA87316E774398DACF16B5D40468A79B9FDD449`。
- 全项目 typecheck：通过。原始输出 [steward-013-ui-typecheck.raw.txt](steward-013-ui-typecheck.raw.txt)，SHA-256 `F4842DE794457D66EE087C2E916891CB0195BE63915602B8AA8D62ADA0C6D3FD`。
- 全项目 lint：通过。原始输出 [steward-013-ui-lint.raw.txt](steward-013-ui-lint.raw.txt)，SHA-256 `4D27DFA379CD84A7C62F8F5B47E52839D82D8D666F26B5DF840290555C6A72EA`。
- 全项目 format：首跑只报 trusted 域 4 文件，原始失败 [steward-013-ui-format.raw.txt](steward-013-ui-format.raw.txt)，SHA-256 `A1C88873594FE0DC0FF7DB6306D1B4C4DA767C196913275CB15211E8CB10E17F`；trusted 格式化后复跑通过，[steward-013-ui-format-after-trusted.raw.txt](steward-013-ui-format-after-trusted.raw.txt)，SHA-256 `EEEF8F1FE204866B4B4CCE1F4B31E14C51F91A41D0F10ABE415F05AE51BE3FF1`。
- 全项目 build：通过。原始输出 [steward-013-ui-build.raw.txt](steward-013-ui-build.raw.txt)，SHA-256 `3BD8C6F00B7F42F1E71E685753C8500112EB5E8C30F1C9CC29E90AFEE79DCD46`。
- renderer scoped `git diff --check`：通过。未运行 Electron、真实 Provider、付费调用或用户数据验证；由 root 接续真实角色与 Electron 验收。

## 红转绿与工具路线

首轮聚焦测试有 3 个测试夹具/同步失败：App fixture 缺 Provider `list/onEvent`，候选复合文本使用了过严 exact matcher，分支变化 oracle 未先等待异步 snapshot；分别补全 API fixture、改为语义 matcher、先等待分支 stale 再验证草稿 CAS。随后 web tsc 报 recovery test 的 `this` 隐式 any 与 deferred branch Promise 类型未知，补精确类型后关闭。产品侧没有为这些测试失败放宽语义。

默认 `apply_patch` 更新既有文件在读取前遇到已知 `setup refresh` helper 错误。执行路线改为逐文件 exact allowlist、preimage SHA-256、精确匹配次数、同目录临时文件与备份、`File.Replace`、postimage hash 和最小 diff；验证后清理 13 个本轮备份，remaining=0。新增文件继续使用 `apply_patch Add`。

UI 候选现已冻结，未提交、未 push，也未自判独立 PASS。Reviewer 应以 manifest 的 9 个文件为精确 UI 候选，并结合 trusted 候选做集成审核。

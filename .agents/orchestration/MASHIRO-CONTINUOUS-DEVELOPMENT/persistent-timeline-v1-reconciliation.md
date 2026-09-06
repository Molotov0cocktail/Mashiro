# 005 入口接管与持久证据记录

日期：2026-09-06；角色：独立 State Reconciler / Planner / 指定入口记录者；route persistent-timeline-v1。

## Git 与事实调和

直接执行指定 Git 可执行文件和命令级 safe.directory：rev-parse HEAD、status --short、ls-files doc/tasks、remote -v、两个 ls-remote。全部成功，本地 main=f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6，index/worktree 干净，github/main 与 gitee/main 同 SHA。GitHub 使用命令级 localhost:7890 代理，Gitee 直连；未修改全局配置。编号 005 未占用，001～004/progress 已 tracked，正式任务目录不被忽略。

当前未新增产品行为；004 的 FINAL DOCS DELTA REVIEW REQUIRED/尚未 push 属于最终审核前快照。最终原始 PASS 与 push-close 覆盖精确 f5aa9880，勿回退或重复全量资格。003 仅普通/流式 LIVE_VERIFIED，其余能力保留 NOT RUN。

## 原始报告来源与完整性

Prompter 从项目相关上一任务 01a07488-3416-76f1-8717-97868a65b7c3 的 read_thread 定位明确来源：系统临时目录的 mashiro-provider-final-review-f5aa9880。只定向读取三个已知文件，不扫描私人目录或搜 Key。原文包含脱敏技术元数据，无 Key、私人正文或运行数据库。

| 原始文件 | 仓库归档 | SHA-256（原始字节） |
| --- | --- | --- |
| review.md | [最终审核](provider-text-v1-review-f5aa9880.md) | C284C416AAE64E7D5E615BFA6D8C7D54E35425C7453A87E4FA5D8AE827714AA9 |
| push-close.md | [推送回执](provider-text-v1-push-close-f5aa9880.md) | D8B2C437671E7B442B5DF9E4901A8A78B2EB1E3C226A62EF554FCC06BA2075A7 |
| continuation.md | [续接](provider-text-v1-continuation-f5aa9880.md) | 559A30979F1E751AB1ADF1A5138F03D12A2839AC2EAD7B0F8798C1FFB4EB0B76 |

原始字节逐字复制，不改 verdict、失败与 NOT RUN。Git 按仓库 eol=lf 规范化文本后，归档的 Git blob hash/checkout 字节 hash 可能与原始 CRLF 字节不同；语义与逐行文本不得变化。progress 原始快照保存到 [历史区域](progress-history-through-004-final-snapshot.md)，新入口只保留当前索引。

## 写入、验证和交接

写入固定目标 allowlist；原文件 preimage SHA-256、HEAD 和 clean index guard；确定性替换匹配次数必须等于 1。新文件必须不存在。所有内容先写同目录唯一 create-new 临时文件，再使用 File.Replace 加内容寻址备份或 File.Move 创建；校验 postimage，失败回滚原像。该路线复用已合法批准的执行上下文，应对默认 helper 在进程创建前失败；没有规避安全拒绝。

本次仅文档/脱敏归档。相称验证为 git diff --check、任务/链接存在与 ls-files/check-ignore 检查、AGENTS 格式检查、报告原始哈希匹配和临时残留清理；不重跑 004 产品全量测试。不 push 未审核新 HEAD。精确提交与工作区事实由交接 Git 查询提供，不在自身文本中预写未来 SHA/PASS。

下一动作：[005 合同](../../../doc/tasks/005-persistent-timeline.md)立即进入高推理 trusted 实现，随后明确接口下的执行模型 UI/测试、全新独立高推理复核和授权双远程收尾。当前没有产品决策门禁，入口整理不作为用户本轮请求的完成。

# 013 可信首增量候选交接

2026-09-07；background_013_trusted，实际 gpt-6-astra / medium。Execute Feature；候选实现，未自判独立 PASS。产品起点 f34c543d287946ad9302f51577fe30c86a67bdf9；root 后续纯文档 815e778122a682bfc71cac01ffbda0c718a43788 不改变本切片源码起点。PROGRAM 持续 ACTIVE；013 仓储员/冲突/观察/日常功能及完整运行中心仍须接续，009/012/014 与总体发布不因本增量停止。

## 已实现与边界

- 严格后台独立 DTO / 6 个调用通道 + changed 事件，原六 assistant 通道保持；preload 运行时只增加无 Zod 通道常量，主进程验证输入/输出和窗口主 frame。
- 每助手显式 enabled、独立 connection/model、允许完整正常轮范围、UTC 日 calls / 实际输入 UTF-16 code-unit characters 预算；缺任一必要配置零外发。grantSelectedRecipient 是本次明确动作，不是模型可写设置：授所选端点本助手历史与私有记忆接收，保留原读写权限和逐来源递归约束。保存 endpoint fingerprint，端点改变失效；无须改聊天 binding。
- schema 11 加法配置、稳定源 job、attempt/reservation、chapter/slot、控制幂等表。派发前事务预留 calls+实际消息字符，独立 maxOutputTokens=2048 映射真实 HTTP max_tokens。该输出 ceiling 是 transport 限制，UI 字符预算不能误称 token 总预算。
- 当前完整正常 user/assistant 轮及完整工具协议作为输入；严格临时及显式保存的临时 session 不入队。祖先正文不全量重复发送，但 round→memory 来源 DAG 与 assertSource/assertRound 递归权限继续生效。长于 16 轮反例通过。
- 扫描每批 32 轮事务提交并让出事件循环；不可用来源保存无正文 PERMISSION_BLOCKED 状态，避免前缀饿死；jobs/chapters SQL 分页每页 100，nextCursor 明确。原文/凭据不进入错误日志。
- 输出仅 title/summary/unfinishedTopics 严格 JSON；summary 用私有 continuity / faithful-summary MemoryRecord。未完成话题单独标 model-suggestion，显式 OPEN/RESOLVED/DISMISSED，不能自动当事实或全部关闭。
- Background Memory origin 与稳定 slot commandId 不伪造用户 round；Markdown 接受版本、来源、chapter metadata、话题、job receipt 同一事务提交。文件后 SQL 前失败仅留未接受孤儿；同本地候选重试不再调用模型；SQL 后回执前故障沿既有 receipt 返回。
- RUNNING 重启无接受回执转 REMOTE_UNKNOWN；unknown 不自动重发且保留已可能消费预算，普通 retry 拒绝 unknown，明确 retry-unknown 才可再次预算预留。当前最多 5 次尝试，配置变化不重置消费。cancel 不退款、不接受迟到输出；CANCELLED 不提供普通 retry。
- 章节详情与普通 chapters context 重新核对真实接受 memory id/version/hash、当前章节版本与递归权限。原文回收使用真实接受依赖；未完成话题/未知作业/损坏版本阻挡。实际 recycle-original→仍可授权摘要召回→restore-original 已验证。助手 purge 的事务 hook 清除后台私有章节/候选/配置并停止提交，保留无正文已消费预算身份。

## 验证与真实失败

- [最后定向结果](background-013-trusted-tests-06.json)：3 files / 20 tests / 0 failed，含 220 不可用前缀+后继正常轮、完整 3 页 221 jobs、10ms 心跳采样最大间隔低于 500ms、20 轮连续来源与祖先撤回、实际 009 回收/召回/恢复、取消/撤权/unknown/重启、文件前 SQL 故障本地候选重试、schema10→11碰撞原子回滚、真实 HTTP max_tokens 与无效值零网络。积压整项（含逐条 synthetic fixture 落盘）2302.9547ms；不声称该时间就是模型延迟。
- [tests-01](background-013-trusted-tests-01.json) 初次 2 passed / 9 failed：源码错误按不存在的 tool_operations assistant_id/request_id 查询，导致正常来源未入队；改为真实 protocol_segments JOIN 后 [tests-02](background-013-trusted-tests-02.json) 11/11 同组转绿。没有延长默认测试期限。
- [tests-03](background-013-trusted-tests-03.json) 21 passed / 1 failed：新 HTTP mock 缺 application/json 和 choice index；修正 fixture 后 [tests-04](background-013-trusted-tests-04.json) 19/19，[tests-05](background-013-trusted-tests-05.json) 20/20。后续 batching/心跳增量由 tests-06 再验。
- [定向静态原始结果](background-013-trusted-static-v1.json)：node TypeScript、27 文件 ESLint、27 文件 Prettier 全部退出 0；git diff --check 退出 0。8 份旧 schema 升级测试的当前版期望已改 11，统一 removeBackgroundFixture 构造真实旧版，future-version 拒绝改 12；root 接完整 suite 检查。
- [27 文件 SHA 清单](background-013-trusted-manifest-v1.json) 是此可信冻结范围。未编辑 renderer、renderer tests、progress/program/正式任务、root 的 production-location 或 E2E 文件。没有执行 Git commit/push。
- root 已完成 [实际角色验证](background-013-live-product.md)：3 HTTP200、849 known tokens，normal→真实 background Markdown/receipt→selected chapter 实际外发/回复→无 Key 重开零调用；本执行者不持 Key，不另付费。最后 long-chain/batching 变更不改变已验单轮角色 wire，比例复用；实际 UI/两 PID/PACKAGED 不凭 live-service 自称完成。

## 交接

root 继续统一 full/static/build、真实双 PID/DOM、扫描及独立 Reviewer。E2E 合成 transport 可用首 system message 以“你是当前助手的章节整理角色。”开头区分，并断言 maxOutputTokens=2048，返回严格三个字段 JSON，summary 保留合成 marker。真实角色成功不替代 renderer 或安装验证。完整013后续必做仓储员去重/Markdown分支冲突、多事件观察、简报/复盘/周规划/截止变更及分类用量中心；本候选只有单一 chapter Memory slot，未虚称多文件原子事务。

工具路线：默认 exec/helper 读取前失败已保存本会话事实，合法 require_escalated 读取/写入获审执行。已有文件补丁 helper 失败后使用固定目标、捕获 SHA、精确匹配次数、同目录 temporary+可恢复 backup、posthash 的小块 writer；一次过长 OS command 在目标执行前失败后改为短 replacement 列表，不重试整文件巨型命令。格式化同样逐文件 hash/backup/atomic replacement，仅本清单文件。无 ACL/safe.directory 持久更改、reset、force 或历史改写。

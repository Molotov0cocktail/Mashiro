# 006 时间线浏览、局部上下文与历史权限

- TASK = 006；状态 = IMPLEMENTING / PROGRAM ACTIVE。
- ROUTE = timeline-context-permissions-v1 / attempt 1。
- BASELINE = main / fb268174e5b14848c5345e52cf6c88ed6c6e1a5d。规划已实时核验；主控制器接管已核 clean。执行前解释其后单写者文档变化。
- Planner 实际型号 = gpt-6-astra / medium。
- 本稳定合同的 PASS 不是 PROGRAM_DONE。总入口 [progress](progress.md)，本片后自动更新总覆盖并继续。

## 来源与当前事实

权威：[proposal](../proposal.md) 助手/严格临时、隐私与权限、验收；[high-level-design](../high-level-design.md) 正常/临时交流、Permission、Provider；[detailed-design](../detailed-design.md) §3.1、§4、§6.1–6.2 与 AST-002/003/004、PVD-003/007、EXEC-006。按真实标题定位旧锚点，不建立无关审计任务。

005 [独立最终 PASS](../../.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/persistent-timeline-v1-review-0aa2d91.md) 产品为 0aa2d9190b63c7b99d59f52808e16965fa6b417f。现场 schema v3；正常 UI 只读最近 100 条，无翻页/搜索/显式选段；trusted 正常上下文最近 16 个完成轮次，含输入最多 64,000 UTF-16 单元。没有独立持久化历史读取/接收权限。严格临时隔离、显式保存及既有 observation 保护必须保持。

## 用户闭环与固定验收

1. 用户可加载当前助手全部更早正常历史，关键词搜索完整已存时间线，清除搜索，并理解空结果/失败。中文、空格、SQL 通配符均按字面文本处理。稳定序列翻页，在新消息插入时不重复/跳漏旧记录，保留正文、时间和真实状态；不裁剪数据库。用户本地浏览不等于模型读取。
2. 上下文入口提供近期合格历史、仅本次输入、选定轮次。selected 只提交 trusted request IDs，指完整 completed 用户/助手对，按历史顺序构建。不接受 renderer 正文/序列/接收方/权限结论。跨助手、未知、重复、非完成项、超预算明确拒绝，零 transport 调用且不产生预接纳消息。显式选项不得静默删除；recent 保留既有有界规则并说明截断。
3. UI 每助手正常选择独立，代表发送意图而非长期存储语义。strict temporary 禁用正常历史浏览与选择，遗留选项不能导致正常仓库读取。晚到搜索页、助手/模式切换不得污染当前 UI；原 pending/partial/未发送草稿/保存回执/旧快照不回退保护保持。
4. 持久化权限最少覆盖 assistant own-normal-timeline 读取，与 assistant + actual endpoint fingerprint + own-normal-timeline 接收授权。UI 分开开关，显示实际 HTTPS 接收地址并解释本地用户仍能浏览。fingerprint 由 main 规范化实际 Base URL + 协议/适配语义产生，不能只按名称/connection ID，不把不同路径端点合并。
5. v3 数据迁移不得丢消息、助手、凭据或治理状态。旧数据不隐式授予历史外发权；第一次带历史发送由用户在产品内明确授权当前接收端点。own-history 读取可保持既有自己历史语义；接收缺省关闭。缺授权时 UI 明确只发本次输入或引导授予；explicit selected 遇读取/接收拒绝必须报权限错误，不能无声降成无历史。none 按现有单次发送意图执行并正常保存。
6. 新端点不继承旧许可；同指纹至多保留同 assistant/同类别范围。改名不改变身份，换模型不能扩大授权，其他助手不借共享连接获取权限。权限编辑有版本冲突保护，失败不改内存生效状态。
7. 每次发送 trusted 重新解析当前 assistant/binding/endpoint/凭据/权限，历史正文只能在需要、读取允许、接收允许交集内解析。撤权立即取消受影响在途历史调用；不合作 transport 晚到 delta/成功不能采纳为完成，不自动重试。已外发数据无法本地收回的事实需说明。UI 缓存不构成授权。
8. 新输入/输出 strict Zod，窄 IPC，保留六个 assistant channels 与 sandbox preload runtime 限制。错误和常规日志不得含正文、Key、原始栈。可记录来源数量、策略/裁剪、拒绝原因。

## 实施计划与单写者范围

Trusted 执行者：shared timeline/provider 与新增 permission DTO/channels；main timeline/provider repository/service、schema/权限模块、IPC/preload/main 装配及 trusted 测试。先冻结 API/fixture 再通知 UI。现有 read/save 兼容保留或加法扩展，避免分页破坏 005 observation。

UI 执行者：ProviderPanel、可拆出的 history/context/permission 组件、renderer 样式/测试、必要 App 接线。与 trusted 装配重叠处由主协调单写。建议历史浏览独立实时 transcript，搜索页不冒充权威观察快照。

建议 query 输入 assistantId + normal mode + 有界 query + before cursor，输出 bounded page/nextCursor。上下文 intent = recent / none / selected(requestIds)。权限 snapshot/read/update 是用户设置用例，trusted 重新验证对象和版本。具体导出名称由 trusted 执行者冻结并同步 UI mock。

人设/基础形象、章节压缩/回收、记忆/事项/工具协议、打包发布均继续项目队列；此为依赖分片，不是永久 non-goals。章节压缩须结合来源/删除治理。本片不依赖 AST-006/RET-007/REM-002 决议。

## 测试与独立审核

先建立旧实现失败的 oracle：

- 超过 100 条、多页、多助手、同时间戳、翻页间插入、字面特殊字符与中文搜索；能找到早期记录且不泄露其他助手。
- 捕获 transport messages，精确证明 recent/none/selected；selected 早期轮次有效，伪造/重复/跨助手/不完整/超预算零调用。
- 缺接收权无历史正文，关闭读取后不调用历史 context 查询；selected 拒绝保留草稿。新端点/换模型/改名/两助手共享连接权限矩阵。
- 撤权后模拟晚到 delta/成功，仍保持取消且重启无重发。过期写入与存储失败原子性。
- strict temporary 在正常 query/context 方法设拒绝 spy 时仍可发送；遗留 selected 不穿透。005 explicit save/切换/部分输出回归。
- 有数据 v3 加法迁移、新权限重启、升级失败回滚、原凭据保持；不静默建空数据。
- renderer 可操作完整查询/选择/授权闭环，旧页不回退实时 partial，晚到查询不污染，失败保留未发送稿。
- focused 后 npm run verify，含 full tests/typecheck/lint/format/build/两 PID Electron 生命周期；dependency/foundation、secret/generated/residual 范围扫描。trusted/schema 变化需新真实 Electron 证据。
- 本片未换普通/流式协议，历史端点证据可按适用性复用，捕获 transport 证明权限构建；不伪造新 live 资格。项目后续工具/记忆仍必须真实端点验证。

未参与实现的 gpt-6-astra medium Reviewer 独立检查完整差异、权限/持久化和适当复验。实现者交回精确 HEAD、命令/退出码/计数、模型、失败与 NOT RUN，不自判 PASS。PASS 后主协调提交、既定双远程同步、总覆盖更新并继续下一任务。

## 授权、路线与续接

继承本次用户持续授权：项目改动/依赖/合成付费验证/非破坏 commit 与分支，经独立审核 main 向既定 GitHub/Gitee 非强制推送，隔离打包安装升级卸载，发布验收后的新 tag/Release/附件与下载核验。不得访问新的私人资料、泄漏秘密、强推/改已有 tag/改远程可见性/改许可证实质条款。006 本身不执行发布。

同 first bad state 两次或同路线三次失败需实质路线评估，不按任务总时长停止；Toolhelp32 -003 禁止重跑或派生 -004。主已证实默认 helper 在目标写入前失败，获准宿主 PowerShell 可用；复用内容寻址 allowlist/preimage/同目录临时/原子或备份回滚/postimage/diff 写入机制，不绕过平台拒绝。

当前没有必要用户决策。真实凭据/权限门禁仅阻塞依赖动作，其余继续。上下文轮换交接本合同和总入口，不将本片完成当项目终点。

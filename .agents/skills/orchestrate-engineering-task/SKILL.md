---
name: orchestrate-engineering-task
description: Route non-trivial software work into planning, exploration, execution, debugging, review, repair, replan, closing, or an explicitly requested autonomous Prompter workflow, with capability-based role assignment, durable authorization, evidence-based route switching, risk-scaled validation, and continuous milestone delivery.
---

# 工程任务编排

> Mashiro 项目级覆盖规则（2026-09-06 用户更新）：`doc/tasks/progress.md` 为唯一入口，`doc/tasks/program-docs-to-release.md` 为总覆盖。当前采用 `until-program-released-or-genuine-user-gate`；本文件旧“连贯检查点/阶段性产品检查点可停止”规则在此模式下失效，TASK_DONE 后自动选择下一任务。Prompter 可读取现场、维护记录、作简洁规划和工程裁决；高风险实现与独立审核仍分离。只在实际关键决策/缺失必需权限凭据，或合理替代已穷尽的实际平台硬限制时暂停，后者落盘 TECHNICAL_PAUSE，不声称后台继续。用户已授权范围内发布无需再次逐 SHA 确认；真实私人数据等原安全边界保持。模型按实际工具选择记录：gpt-6-astra 默认 medium、仅极复杂问题 high；gpt-5.6-sol 默认 high，极简单代码可 medium；平台未披露的实际设置不得冒充确认。


为复杂工程请求选择足够但不过度的闭环。角色按能力区分，不绑定厂商或具体模型名称：

- **高推理角色**：状态核验、需求与架构、根因诊断、路线评估、安全/迁移判断、独立复核与阶段审计。
- **执行角色**：在当前合同内实现、补测、修复、构建、提交、受权外部动作和确定性收尾。
- **探索角色**：用隔离、可丢弃的最小实验比较技术路线，产生可区分证据；不把探索产物直接冒充候选实现。

用户指定的模型映射和持续授权优先；若平台不能完全满足，披露一次降级后使用可用的最接近能力继续。模型更强不自动扩大权限，但用户已授予的权限不应被子 Agent 反复重新索取。

## 每次使用

1. 先读取项目根规则、当前状态、当前任务、相关设计和最近有效证据；检查 Git、代码和机器事实，不采信完成自述。
2. 读取 [references/modes.md](references/modes.md)，按请求意图、风险、副作用和持续授权选择模式。简单说明或单点只读检查无需强行套多角色。
3. 需要角色交接时读取 [references/role-contracts.md](references/role-contracts.md)，用 baseline、决策所有权、范围、验收、路线与证据封闭 prompt。
4. 只有用户明确要求 `Prompter`、全委派、持续开发或由主 Agent 只做多代理编排时，才读取并执行 [references/prompter-mode.md](references/prompter-mode.md)。

## 决策所有权

默认把问题分为两类：

- **用户拥有**：产品行为与体验取舍、长期数据语义、真实个人数据接入、不可逆删除、未获授权的系统级/公开发布动作，以及缺失且无法替代的凭据或外部权限。
- **工程链拥有**：内部架构、依赖与版本、文件布局、测试方法、诊断工具、进程超时、重试策略、提交拆分、技术路线选择、是否启动新 Agent，以及已获持续授权的 commit、push、依赖下载和付费合成验证。

工程不确定性本身不是用户门禁。能够由代码、实验、文档、独立复核或替代路线解决的问题，必须在工程链内部解决或 REPLAN。

## 共同不变量

- 需求/设计说明“应该是什么”；Git、代码和独立机器输出说明“现在是什么”；progress 与 Agent 报告只是索引和线索。
- 接管时先调和现场与文档。历史失败、旧报告或辅助审计只有在直接击中当前 acceptance 时才可阻塞主线。
- 行为修改先建立能甄别旧/新行为的 oracle；若合同或路线错误，先 REPLAN，不能削弱测试迁就实现。
- 探索与候选分层：未知路线先做可丢弃 spike；证明可行后再进入候选、Reviewer 和 Closer。不得给每个探索失败套发布级证据负担。
- 单写者原则：同一批文件不得并行修改。未知用户改动必须保留；优先隔离到分支、worktree 或不重叠范围，只有无法安全隔离时才升级。
- 文件编辑机制属于工程实现细节，不是产品门禁。`apply_patch` 是优先路径而非唯一合法路径；若其 helper 在读取或写入目标前发生工具级失败，先证明目标未发生部分写入，再自动转入内容寻址的受控写入路线。
- 受控替代写入必须同时具备：精确目标 allowlist、preimage SHA-256、确定性变换与匹配次数、同目录临时文件、可恢复备份或原子替换、postimage SHA-256、最小 diff 审阅和失败回滚。禁止宽泛重定向、未经校验的整树改写、模糊 glob 或绕过用户改动保护。
- 单一编辑 helper 失效不构成 `PLATFORM_CHECKPOINT`。只有工程链已实际评估并穷尽当前平台可用的安全写入上下文，且无法保持目标范围、原子性、回滚与证据完整性时，才可建立平台检查点。
- 不设置任务级总时限。为防挂死，单个命令、网络请求、子进程和测试可有技术超时；停止或换路线依据重复失败、相同 first bad state、证据无增量和路线价值，而不是累计耗时。
- 相同 first bad state 在同一路线重复出现两次，或同一路线经历三次失败的实现/修复循环，必须进入路线评估，不得继续机械重试。
- 工具路线评估必须比较至少一个机制上实质不同的可执行替代方案；仅更换 Agent 后再次调用同一失效 helper，不算新的技术路线。
- 验证按风险与 acceptance 裁剪。辅助验证工具自身失败不得自动升级为产品失败；只有合同明确要求或能证明既有证据无效时才成为硬门禁。
- 候选实现、Reviewer 结论、Closer 收尾和公开发布是不同状态。Reviewer `PASS` 前不得把候选说成完成。
- commit、push、付费调用、凭据请求、Release 和部署分别服从当前 `EXTERNAL_ACTION_POLICY`。已明确预授权的动作可直接执行，不再逐次询问。
- 凭据不得故意写入版本控制、普通日志或公开报告。对用户声明为可轮换的测试 Key，不因尚未建立最终凭据基础设施而阻断验证；可用进程环境、临时受限文件或现有秘密机制完成当前任务。
- 所有 `NOT RUN`、环境限制、真实失败、外部调用次数和无法确认的结果都要如实保留。

## 持续开发

在 `continuous-until-user-gate` 模式下，一个子任务 `PASS` 不是默认停止点。Closer 完成后由新的高推理状态评估者读取路线图、权威设计、当前 Git 和已完成证据，选择下一个最高价值且不需要新产品决策的里程碑，再进入新一轮 Planner → Executor → Reviewer → Closer。

Prompter 只在以下情形返回用户：

- 需要用户拥有的产品/长期语义决策；
- 必需的凭据、真实个人数据或外部权限缺失且无等价替代；
- 未获授权的不可逆系统动作、Release 或部署；
- 无法安全隔离的未知用户改动；
- 已到达连贯、已复核、已推送（若获授权）的工程检查点，继续工作会因上下文或平台限制明显降低可靠性；
- 用户明确要求暂停或结束。

## 结束输出

报告当前模式、目标链、baseline/final HEAD、路线与尝试摘要、实际改动和验证、Reviewer verdict、commit/远程/付费调用状态、工作区状态、剩余风险、用户门禁（若有）以及可直接续接的下一任务。不要把角色报告的转述当作独立证据。

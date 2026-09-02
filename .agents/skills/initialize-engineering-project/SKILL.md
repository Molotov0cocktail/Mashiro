---
name: initialize-engineering-project
description: Initialize an empty or near-empty software-project folder from user requirements, creating a conservative source/test skeleton plus AGENTS.md, design documents, task contracts, progress tracking, Git rules, and verified local commands. Use for project bootstrap, not routine work in an established repository.
---

# 工程项目初始化

把用户指定的空目录或近空目录变成“可运行、可测试、可由下一位 Agent 接管”的工程基线。只建立首个最小闭环，不提前实现大段产品功能。

## 开始前

1. 解析目标目录的绝对路径并只读盘点。目录非空时保留所有既有内容；若已有实质工程，停止初始化并建议改做项目审计。
2. 从用户需求和本机事实中确认：产品目标与运行形态、技术栈与包管理器、交付物、团队语言、Git 远程、默认分支、测试/检查要求，以及代理、凭据或平台限制。只询问无法安全推断且会改变结果的缺项。
3. 检查 OS、shell、Git、运行时和包管理器的实际版本。不得更改用户全局配置，不得打印密钥、令牌或个人路径中的敏感内容。
4. 读取 [references/foundation-contract.md](references/foundation-contract.md)。需要起草文档时再读取 [references/file-templates.md](references/file-templates.md)；选择测试和环境验证时读取 [references/stack-and-verification.md](references/stack-and-verification.md)。

## 初始化顺序

1. 先创建适合技术栈的 `.gitignore`、编辑器基础配置和最小目录，避免安装或构建残留进入版本控制。
2. 建立一个能实际执行的最小源代码与测试闭环；依赖版本、lockfile 和命令必须来自真实脚手架或明确选择，不能编造。
3. 创建 `AGENTS.md`、`doc/proposal.md`、`doc/high-level-design.md`、`doc/detailed-design.md`、`doc/tasks/progress.md` 与至少一个任务文件。用真实信息替换模板占位；未决产品问题放入“待决项”，不要伪装成已冻结事实。
4. 若用户提供了远程地址，精确校验并记录托管平台、远程名、默认分支和网络/代理规则。可以在初始化范围内建立本地 Git 与配置远程；除非用户明确要求发布，否则不得 fetch、push、建 Release 或改变远程状态。
5. 先运行聚焦测试，再运行适用于该基线的类型检查、lint、格式检查与构建。命令只有实际成功或诚实记录失败后才能写入“已验证命令”。
6. 执行 `scripts/validate_project_foundation.py <目标目录>`，复查 `git status --short`、敏感信息、临时文件和意外生成物。

## 文档边界

- `AGENTS.md` 只保存长期规则、稳定架构、真实命令、环境要求、Git/交付边界和事实来源关系；动态 HEAD、临时测试数字和执行流水进入 `progress.md` 或 Git。
- `progress.md` 是紧凑的当前状态，不是开发日记。历史证据进入任务文件、提交历史或归档；顶部必须能在一次短读取中说明当前任务、阻塞与下一动作。
- 设计文档说明“应该是什么”，Git、代码和机器输出说明“现在是什么”。发现冲突必须显式记录，不得挑选对自己有利的一方。
- 每个任务是一个可验证闭环，包含目标、非目标、权威输入、预期范围、实施、测试、验收、停止条件和完成定义。

## 完成条件

- 目录结构与所选技术栈一致，最小程序或库入口可构建/运行。
- 至少一个甄别性测试通过；不适用的检查有原因，不用空命令或弱断言制造绿灯。
- 文档中的路径、命令、远程和环境要求均与实际核对；无未解释模板占位。
- 工作区没有密钥、日志、缓存、安装包或未知用户文件被覆盖。
- 向用户报告创建内容、实际验证、Git/远程状态、未决项和下一项独立任务；不要在未获授权时把“本地就绪”说成“已发布”。

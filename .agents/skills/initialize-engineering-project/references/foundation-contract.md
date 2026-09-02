# 项目基线契约

## 默认最小结构

按技术栈裁剪，不创建无职责的空目录：

```text
<project>/
├── AGENTS.md
├── README.md
├── .gitignore
├── .editorconfig
├── <manifest-and-lockfile>
├── src/
├── tests/                         # 也可采用技术栈惯用的共址测试
└── doc/
    ├── proposal.md
    ├── high-level-design.md
    ├── detailed-design.md
    └── tasks/
        ├── progress.md
        └── T1-project-foundation.md
```

只有在真实需要时才增加 `scripts/`、`config/`、`assets/`、`migrations/`、`docs/` 或多包工作区。不要为了“看起来完整”创建空壳。

## 事实职责

```text
用户需求 / proposal
  → 产品目标、范围、非目标、验收

high-level-design / detailed-design / task
  → 应有架构、接口、风险、实施与测试契约

AGENTS.md
  → 长期工程规则、稳定结构、真实命令、权限与交付边界

doc/tasks/progress.md
  → 当前任务、状态、最近验证、阻塞、下一动作

Git / 实际文件 / 机器输出
  → 当前工程事实
```

设计与实现不一致时同时报告“应当”和“实际”。不要用 `progress.md` 覆盖 Git 事实，也不要用现有错误实现否定正式需求。

## AGENTS.md 必备信息

1. 项目定位、目标用户、运行形态与交付物。
2. 技术栈、包管理器、版本/lockfile 策略。
3. 依赖方向、目录职责和关键入口。
4. 事实来源优先级与新会话接管步骤。
5. 计划、实现、诊断、复核、修复和收尾的权限边界。
6. 代码质量、安全、隐私、数据、日志与破坏性操作红线。
7. 实际可运行的开发、测试、类型、lint、格式、构建、冒烟命令。
8. 按风险裁剪的验证矩阵。
9. Git 远程、默认分支、提交格式、代理/网络规则、push/发布授权。
10. 本机稳定要求与已验证工具版本；不得写入密钥、用户名目录或不可移植的私人路径。
11. 已知长期限制与需要重新评审的触发条件。

AGENTS.md 不保存动态 HEAD、任务流水、每次测试数量和下一任务。若某条规则只服务一个任务，把它放进任务文件。

## `progress.md` 约束

建议控制在约 200 行内并保持顶部可直接接管：

- 当前阶段/里程碑、分支、基线与工作区状态；
- 当前唯一任务及状态；
- 最近一次验证的日期、命令、结果或 NOT RUN 原因；
- 当前阻塞、开放风险、下一唯一动作；
- 紧凑任务表。

完成历史只保留短摘要和链接。大量轮次证据进入对应任务文件、Git 或 `doc/tasks/history/`，不要无限追加到当前状态文件。

## 任务契约

每个任务必须包含：

- `TASK / BASELINE / GOAL / NON-GOALS`
- `AUTHORITATIVE SOURCES / CURRENT VERIFIED STATE`
- `FIXED DECISIONS / INVARIANTS`
- `EXPECTED SCOPE / IMPLEMENTATION PLAN / TEST PLAN`
- `ACCEPTANCE / STOP CONDITIONS / FINAL EVIDENCE`

任务按可验证闭环划分，而不是机械地一个文件一个任务。安全、迁移、发布和跨模块架构变化应单独成任务并提高复核等级。

## 本地环境与 Git

- 环境要求写稳定约束，例如受支持运行时范围；本次机器的探测结果写 `progress.md`。
- 项目命令必须在目标目录实际执行；不能从另一个项目复制后假设有效。
- 用户提供远程 URL 才能记录或配置远程。已有同名 remote 不一致时停止并报告，不能静默覆盖。
- 本地初始化和本地提交不等于获得 push、Release、部署、建云资源或改远程设置的授权。
- 网络操作前检查托管平台、认证和项目的代理约定；不要修改全局 Git、shell 或系统代理来“修复”环境。
- 首次提交前检查敏感信息、生成物、日志、缓存和用户文件。不要用清理命令覆盖非本任务内容。

# 001 Mashiro 工程基线与最小闭环

> 状态：DRAFT / F1 TARGET ACCEPTED / INITIALIZATION NOT AUTHORIZED  
> 本文件记录已选择的初始化闭环与待冻结范围，不是执行工作令。

## TASK

- 唯一任务：在用户批准冻结清单后，把近空的 `D:\Mashiro` 建成可运行、可测试、可接管的 Electron＋TypeScript＋React 工程基线，并只实现被批准的一个最小真实闭环。

## BASELINE

- 目标目录：`D:\Mashiro`。
- 当前内容：`.agents` 与本次获准的规划文档；没有源码、manifest、lockfile、项目配置或产品数据。
- Git：目标不在任何 Git 工作树、父级仓库或 worktree 中；分支、HEAD、基线提交、remote 均不存在。
- 开发环境只读观测：Windows 25H2 build `26200.9168` x64、PowerShell Core 7.6.4、Git 2.51.2、Node 24.18.0、npm 11.16.0；这些是本机观测，不是项目已验证要求。
- 当前授权：用户已接受F1作为初始化目标，并已单独完成任务002隔离资格验证；正式初始化、正式项目依赖安装、F1源码、Git写入和真实API仍未授权。

## GOAL

- 产生一个符合已确认安全边界的最小桌面应用基线。
- 至少一个可观察产品行为真实贯通 renderer、受限 preload/main 边界以及该闭环需要的可信状态。
- 使用甄别性测试和真实 Electron 启动/冒烟验证；命令与版本来自实际安装和运行结果。
- 交付 skill 要求的工程与文档基线，但不自动进入下一产品任务。

## NON-GOALS

- 不一次实现首个日常可用版本。
- 不接入真实 Provider、AIbrowse、Clender、邮箱、日记或个人数据。
- 不实现完整记忆整理、正式后台提醒、安装器/更新器、最终视觉、embedding 或多助手协商。
- 不发布、不 push、不建远程仓库、不创建 Release 或部署。

## AUTHORITATIVE SOURCES

- 产品与阶段范围：[../proposal.md](../proposal.md)
- 架构边界：[../high-level-design.md](../high-level-design.md)
- 近期契约与集中决议：[../detailed-design.md](../detailed-design.md)
- `initialize-engineering-project` skill 与其 foundation contract；实际执行前重新读取其当前版本。
- 用户最终批准的《初始化冻结清单》优先于本草案中的推荐项。

## CURRENT VERIFIED STATE

- 2026-09-02 已只读确认目标目录存在且没有实质工程；七个规划文件在本轮前均不存在。
- 已只读确认 AIbrowse 与 Clender 是参考工程，保持只读；其结果不能当作 Mashiro 的测试证据。
- 任务002已在独立系统临时目录完成 Electron `44.1.1`内嵌`node:sqlite`资格验证并经独立Reviewer `PASS`，详见[002-node-sqlite-qualification.md](002-node-sqlite-qualification.md#final-evidence)。该结果不是正式项目安装、构建或F1实现。
- 正式项目安装、依赖恢复、测试、类型检查、lint、格式、构建、启动和基础校验器：**NOT RUN（未获初始化授权且当前有意缺少工程产物）**。

### 2026-09-02 有限预检证据

执行上下文：Codex Desktop，`D:\Mashiro`，PowerShell Core `7.6.4` x64；观测时间为 2026-09-02 03:28～03:35（Asia/Shanghai）。下表只列脱敏后的必要事实；没有输出身份值、凭据、认证 header 或完整用户路径。

| 检查 | 命令/来源 | 退出码与结果 | 影响 |
| --- | --- | --- | --- |
| Windows/架构/shell | `Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion`；`.NET RuntimeInformation`；`$PSVersionTable` | `0`；DisplayVersion `25H2`、build `26200.9168`、OS/进程均 x64；注册表产品名仍是旧式 Windows 10 标签；PowerShell Core `7.6.4` | 以 DisplayVersion/build/架构记录环境，不用旧标签推断系统代际 |
| 工具解析与版本 | `Get-Command git,node,npm,pwsh,powershell -All`；`git --version`；`node --version`；`node -p "process.version+'|'+process.arch+'|'+process.platform+'|'+process.execPath"`；`npm --version` | 均 `0`；实际 Git `D:\Git\Git\cmd\git.exe` `2.51.2.windows.1`，另有 Codex 随附 Git；Node `D:\nodejs\node.exe` `v24.18.0`；npm首选 `D:\nodejs\npm.ps1` `11.16.0`，同目录另有cmd/无扩展名入口 | 后续每次资格/初始化记录实际解析来源；不能用本机Node替代Electron内嵌Node |
| Git上下文 | `git -C D:\Mashiro rev-parse --is-inside-work-tree`、`--show-toplevel`、`--git-common-dir`、`--show-superproject-working-tree` | 四项均 `128`，均报告不是当前或父级Git仓库 | 证明目标不只是在根目录缺`.git`，而是当前不处于仓库/worktree/superproject；未执行`git init` |
| Electron/Node关键环境 | 对进程、用户、机器范围定向读取`ELECTRON_RUN_AS_NODE`及已列Electron变量；定向读取`NODE_OPTIONS`、证书/TLS变量 | `0`；`ELECTRON_RUN_AS_NODE`三范围均UNSET；其他已查Electron启动/下载变量、`NODE_OPTIONS`、`NODE_TLS_REJECT_UNAUTHORIZED`均UNSET | AIbrowse旧记录不是当前事实；未来Electron子进程仍局部清除并校验运行身份，不改全局环境 |
| npm配置 | `npm config get <registry|proxy|https-proxy|strict-ssl|cafile|noproxy|fetch-*|userconfig|globalconfig|electron-mirror>` | 每项 `0`；registry=`https://registry.npmjs.org/`，proxy/https-proxy/cafile/noproxy/electron mirror均UNSET，`strict-ssl=true`；目标/用户/全局`.npmrc`均不存在 | 只证明配置读取；npm包和Electron二进制链路均未联网验证 |
| Git配置与来源 | `git -C D:\Mashiro config --show-origin --show-scope --get[-all] <selected-key>`；`--get-urlmatch`；只检查代理、rewrite、TLS、helper、身份存在性、默认分支、签名、换行、hooks/include/safe.directory | 设置项返回`0`，未设置项返回`1`；`http.proxy` UNSET；全局有自定义`https.proxy=http://127.0.0.1:7890`；TLS backend=`openssl`且未关闭验证；helper=`manager`；身份name/email均存在但值未记录；系统默认分支=`master`；无签名要求、hooks、rewrite、活动include或`safe.directory=*`；`core.autocrlf=true` | Git官方代理键按`http.proxy`处理；不复制Clender的冲突全局命令。初始化后复核仓库/条件配置，并冻结项目换行规则 |
| URL重写与本地代理 | `git -C D:\Mashiro ls-remote --get-url <exact-url>`；定向检查rewrite/extraHeader；TCP连接`127.0.0.1:7890`，2秒超时 | 两个URL解析均`0`且逐字符不变；无rewrite/extraHeader；代理端口探测`0`、12ms、LISTENING | 未发现请求被改写或附加未知header；允许进行一次匿名只读仓库查询 |
| GitHub匿名读取 | `git -c http.proxy=http://127.0.0.1:7890 -c credential.helper= -c credential.interactive=false -c http.lowSpeedLimit=1 -c http.lowSpeedTime=15 ls-remote --symref https://github.com/Molotov0cocktail/Mashiro.git HEAD refs/heads/*`，并设置`GIT_TERMINAL_PROMPT=0`/`GCM_INTERACTIVE=Never`，硬超时25秒 | `0`；1413ms；stdout/stderr均空，无HEAD或分支引用 | 当次通过命令级代理读取端点成功；仓库当前无匹配引用；不证明push/认证权限 |
| Gitee匿名读取 | 同上但精确URL为`https://gitee.com/Molotov0coaktail/mashiro.git`，且命令级`http.proxy=`显式直连 | 受限沙箱首次`128`/767ms（无法连接）；按授权仅一次非沙箱复核`0`/628ms，stdout/stderr均空，无HEAD或分支引用 | 当前直连路径读取成功；首次失败属于受限执行网络，不能泛化为Gitee不可达；不证明push/认证权限 |

历史线索核对：`D:\AIbrowse\AGENTS.md`与其baseline曾记录GitHub使用命令级`http.proxy`、Gitee直连以及`ELECTRON_RUN_AS_NODE`风险；`D:\Clender\AGENTS.md`仍要求写全局`https.proxy`。两者规则冲突且均属于其他工程。Mashiro只采用本机预检和官方语义确认的边界，不修改任何参考项目或全局配置。

明确 **NOT RUN**：`git init/add/commit/remote`、任何fetch/pull/push、认证/推送权限验证、正式项目npm包下载、正式项目Electron二进制恢复、Provider调用、项目测试/构建/启动。任务002只在隔离临时目录实际完成了npm/Electron下载与SQLite资格实验；该证据不等于正式项目链路已建立。Git仓库读取、npm包获取、Electron二进制和Provider调用保持为四条独立网络链路。

## FIXED DECISIONS / INVARIANTS

- 使用 Electron＋TypeScript＋React、electron-vite v5系列、npm和精确直接依赖，提交真实生成的 `package-lock.json`。
- renderer sandbox、`contextIsolation`、窄且运行时校验的 IPC；无任意文件、SQL、凭据或系统执行能力。
- 中文产品/规划/UI优先；代码标识符、命令、配置和 API 字段英文。
- 仓库不得包含真实个人聊天、记忆、凭据或运行日志。
- 不未经验证复制 AIbrowse 依赖/config；不通过 `--force` 或忽略 peer 冲突制造安装成功。
- 不触碰 `D:\AIbrowse` 或 `D:\Clender`。
- F1使用`node:sqlite`的前置资格门禁已由任务002在 Electron `44.1.1`限定范围通过；初始化冻结若改变Electron/内嵌Node、架构、关键API或执行位置须重新验证。
- 未来remote地址必须逐字符保留为GitHub `https://github.com/Molotov0cocktail/Mashiro.git` 与Gitee `https://gitee.com/Molotov0coaktail/mashiro.git`；拟议名称为`github`/`gitee`，但本任务未获remote配置或push授权。
- 本地分支推荐`main`但仍待用户冻结；系统默认是`master`，不得通过修改全局配置偷渡该选择。

## 初始化闭环候选

### F1（推荐）：本地助手身份与持久化生命周期

**真实行为**

- 用户在基础可用界面创建助手、切换、重命名、指定主助手和归档。
- 助手使用稳定 ID；改名不产生新助手；归档不等于删除。
- 应用关闭并重新启动后，助手及主助手状态从隔离的开发数据目录恢复。

**验证价值**

- 同时验证 Electron main/preload/renderer、窄 IPC、React 交互、本地事务状态、数据根隔离和重启恢复。
- 直接覆盖首版多助手的稳定身份基础，又不需要真实 Provider、记忆算法、托盘提醒或个人数据。

**依赖与风险**

- 依赖 SQLite 实际驱动，因此 `node:sqlite`候选必须先通过任务 002；失败时回到冻结清单评审，不静默切换。
- 需防止为完整助手配置提前建立复杂权限框架；只创建本闭环所需字段。

**不冻结的未来选择**

- 不冻结 Provider 客户端/SDK、记忆 Markdown目录格式、事项 Schema、最终 UI、安装器或跨应用协议。

**下一项最有价值任务**

- 建立 Provider 连接配置和合成 Chat Completions 协议闭环，再申请单端点真实资格验证。

### F2：合成 Provider 协议闭环

**真实行为**

- 应用通过受控本地测试端点完成普通/流式文本和一个无副作用工具闭环，展示能力与错误状态。

**验证价值**

- 提前验证 Provider adapter、SSE、工具参数聚合、取消和用量解析，不需要真实费用和个人数据。

**依赖与风险**

- 不依赖 SQLite资格验证时可更早执行；但会先构建测试协议而非用户长期使用的本地身份/状态基础。
- 需要先冻结 fetch/SSE 或 SDK 路线，可能让初始化被 Provider 差异主导。

**不冻结的未来选择**

- 不证明任何真实厂商端点，也不证明长期时间线、记忆或事项持久化。

**下一项最有价值任务**

- 实现助手身份和本地持久化，或在独立授权下验证首个真实端点。

### F3：数据位置与恢复边界闭环

**真实行为**

- 开发模式选择隔离数据根，验证 locator/manifest 对应；路径不可用时显示明确错误且不静默创建空数据。

**验证价值**

- 直接验证自定义数据位置和失败保护，减少后续数据分叉风险。

**依赖与风险**

- 产品可见价值弱于 F1，且安装器尚未选择，容易把开发期路径验证误报为正式安装行为。
- 如果只写标记文件而无真实业务对象，甄别性不足。

**不冻结的未来选择**

- 不证明安装、更新、卸载、Windows凭据或数据库迁移。

**下一项最有价值任务**

- 在该数据根上实现助手生命周期或其他真实业务对象。

## 已选择结论

用户已接受 F1“本地助手身份与持久化生命周期”作为初始化目标。它用最小功能同时证明产品身份语义、可信进程边界和事务持久化，是三个候选中最接近真实产品且不会让 Provider 或安装器反向主导架构的闭环。

任务002已证明`node:sqlite`在 Electron `44.1.1`的开发运行时与main-only构建预览中具备进入F1冻结清单的资格。F1选择和前置门禁通过仍不等于正式初始化授权；正式依赖、目录、Git、分支、remote、提交及命令须在初始化冻结清单中另行确认。

## EXPECTED SCOPE

最终范围随闭环选择变化。若批准 F1，预计类别为：

- 工程基础：`.gitignore`、`.editorconfig`、真实 manifest/lockfile、electron-vite配置；
- 最小源码：main应用入口、受限preload、React renderer、助手生命周期用例和可信存储；
- 最小测试：领域/存储、IPC输入、renderer基础交互、重启恢复与Electron启动冒烟；
- 基线文档：`AGENTS.md`、`README.md`及本次规划文档的冻结更新；
- 不提前创建 Provider、记忆、事项、提醒、安装器或集成空目录。

精确路径和依赖版本须在冻结清单中列明，并由实际安装结果生成；本草案不编造。

## IMPLEMENTATION PLAN

仅作为批准后的建议顺序：

1. 重新检查目标目录、父级/worktree Git上下文、仓库/条件配置、工具解析和Electron关键环境；发现新文件或冲突即停止。
2. 创建匹配技术栈的忽略/编辑器规则，再进行任何安装或构建。
3. 使用批准的精确版本建立 electron-vite main/preload/renderer 最小基线。
4. 先建立甄别性测试，再实现被批准闭环；只创建实际职责文件。
5. 运行聚焦测试、全量测试、类型、lint、格式、构建和真实启动/冒烟。
6. 更新文档为实际命令和结果，运行 skill 基础校验器并解释 warnings。
7. 检查敏感信息、生成物、未知文件和Git状态；复核`core.autocrlf`下的项目换行契约与`git diff --check`；只执行获准的Git操作。

## TEST PLAN

### F1甄别 oracle

- 创建后返回稳定assistant ID；重命名保持同一ID；归档不删除；主助手规则不产生两个有效主助手。
- 非法或过期对象版本被可信侧拒绝，renderer不能绕过。
- 关闭数据库/应用后重开，得到相同助手和主助手状态。
- 使用隔离测试数据目录；仓库中不出现业务数据库或运行日志。
- 启动真实Electron窗口，基础操作可完成且错误可理解。

### 工程验证

- 精确命令在安装后由实际 `package.json`确定；当前全部 **NOT RUN**。
- 最低类别：聚焦测试、全量测试、类型检查、lint、格式检查、构建、Electron启动/冒烟、敏感信息检查、skill结构校验。
- 不用静态网页预览代替Electron进程，不用只断言mock调用代替行为结果。

## ACCEPTANCE

- 用户明确批准某一候选及冻结清单。
- 所选闭环真实运行且甄别测试通过；所有失败/未运行项如实列出。
- 依赖、lockfile、Node/npm/Electron内嵌Node和命令一致。
- renderer安全边界、数据隔离和错误行为符合决议。
- 仅修改批准范围；参考项目和真实个人数据未触碰。
- Git、提交、远程和发布状态与授权完全一致。

## STOP CONDITIONS

- 目标目录出现未预期文件、实质工程或与用户修改冲突。
- 未取得依赖安装/网络、初始化、Git或所需实验授权。
- 最终依赖出现无法解释的engine/peer冲突，或需强制忽略冲突。
- F1所需SQLite驱动资格验证失败或证据不足。
- 需要读取真实个人数据、调用真实Provider或修改参考项目。
- 测试只能靠跳过、空脚本或弱断言变绿。

## FINAL EVIDENCE

执行获准后才填写：

- 文件和职责清单；
- 实际安装版本与lockfile；
- 每项命令、退出码和结果；
- Electron启动/冒烟证据；
- skill校验器结果与每条warning解释；
- 敏感信息/生成物检查；
- Git/提交/远程/发布实际状态；
- 限制、失败和下一独立任务。

当前：**F1 TARGET ACCEPTED / 002 PRECONDITION QUALIFIED / INITIALIZATION NOT RUN OR AUTHORIZED**。

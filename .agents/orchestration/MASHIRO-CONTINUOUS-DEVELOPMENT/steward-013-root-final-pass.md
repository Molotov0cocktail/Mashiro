# 013 仓储核心独立 STEWARD_CORE PASS

2026-09-07。Reviewer 为 root，未实现本次仓储 trusted/renderer 产品；新增的是独立反例、合成真实/原生验收 runner、记录及无关014模块。作者分别为实际 Astra/medium 和 Sol/high。平台新增Reviewer及复用历史Reviewer实际遇到 thread limit，已有角色继续可用；root实际型号设置未披露，不声称完成了模型切换。该结论不是013全部完成，也不是 PROGRAM_DONE。

精确候选为[57文件 manifest-v2](steward-013-final-manifest-v2.json)，SHA-256 `16DE8203866927726BB47CDDF1D9AE5A5DA662A8F6C1A9101819CE4017C3D5F7`。相对v1只有一个实时治理语句编译优化及八份旧迁移测试中九处“当前schema”预期12→13；历史迁移前像、冲突DDL和未来版本拒绝未削弱。提交前再次核对所有文件哈希一致。014独立底座另有限定审核，不由本报告代签。

## 独立发现与关闭

- R1：关闭接受记忆读取仍外发目标正文；作者修复范围判断，原独立反例绿。
- R2：第101个及更旧分支没有分页入口；分支/冲突及成员分页修复，独立103分支反例绿。
- R3：冲突真实纠正完成后公共查询错误显示失效；按实际resolution判断，刷新/重开保持已解决，后续纠正/删除仍使旧resolution失效。
- R4：成员纠正不推进分支版本、旧导出令牌可继续，UI也保留旧正文；schema13持久治理digest和版本原子更新，旧分页令牌拒绝，UI清缓存并取消旧读取/导出。独立原反例及真实DOM反例通过。
- R5：可见active成员正文损坏被吞成完整空分支；可信侧区分治理隐藏和INTEGRITY，损坏/缺失时拒绝完整读取和导出，合法过时成员可隐藏。原独立反例通过。

原始RED和修复链接保留在[工作记录](steward-013-root-review-working.md)、[R3/R4交接](steward-013-r34-handoff.md)、[R5交接](steward-013-r5-handoff.md)及[UI v3](steward-013-ui-handoff-v3.md)。独立UI首运行还有缺Provider mock的夹具错误，后仅补类型正确的完整mock，关键断言不变。

最终全量03另发现103成员构造默认5秒超时，单独重现后profile定位重复SQL预编译。作者仅在一次digest内复用Statement，所有SQL、参数、每次实时取行和依赖遍历不变；未缓存权限/版本/结果。独立核对[精确diff](steward-013-boundaries-final-exact.diff)及[诊断报告](steward-013-boundaries-final-repair.md)，109次guard累计1999.96ms→818.74ms；原oracle默认5秒绿。未提高最终超时。

## 最终证据

- [独立全量04](steward-013-root-full-04.json)：100文件511项全部通过，包含独立R1–R5、UI、迁移及014限定测试；03的510/511失败如实保留。
- [全项目静态](steward-013-final2-static.json) typecheck/lint/format均0；最后单文件优化的[定向静态](steward-013-boundaries-final-static.json)全0；[最后构建](steward-013-final3-build.raw.txt)成功。依赖树及[foundation](steward-013-foundation-01.json)均通过，后者无错误/警告。
- [原生Electron02](steward-013-electron-02.json) SHA-256 `E55456EA1FAA899CB3C3317E73D7B6C5C50E77DAA42BD7A3C84C4A6F7C3C88EC`，PIDs157852/154732，Electron44.1.1、Node24.19.0、SQLite3.53.3；接受分支/记忆/回执身份重启一致，恢复零仓储调用，DOM读取/默认收起来源及纠正后旧缓存清除通过。原历史/工具/事项/提醒等断言保留。该运行先于最后SQL编译复用；后者由不变原oracle、独立全量及新build比例覆盖，不冒称再次运行原生。
- [原生截图02](steward-013-electron-02-ui.png) SHA-256 `A385F56FCABE2FF26BC43B0FAD05E1C0E1B3768D9D298640A85CD513BE4CB441`已由root实际查看，分支Markdown、真实成员、来源折叠和编辑入口可读可操作。
- [真实GLM角色](steward-013-live-product.md)：三HTTP200、1361tokens，正常合成轮→共享发现→仓储接受Markdown/回执→无Key服务重开零调用；非手动写入，非打包live。最后runner仅去掉未使用初值以通过lint，不改变已运行调用流程，也未重复计费。当前程序47请求、79354已知tokens及5次usage未知。

资格边界：已配置的共享发现、仓储整理、分支/冲突/治理、UI和恢复核心通过。观察、简报、复盘、周规划、变更、分类用量仍按[下一合同](background-013-daily-observation-contract.md)实施；014生产启动/备份迁移/安装更新卸载/Release与下载尚未完成。实际OS通知点击/登录冷启动也未被本次DOM和注入恢复冒称通过。

最终提交还须执行凭据/生成物/残留及差异检查和暂存字节核对；该机械收尾不需要新一轮产品资格审核。独立审核通过的精确版本按已有授权同步两源码远程，随即继续下一切片。

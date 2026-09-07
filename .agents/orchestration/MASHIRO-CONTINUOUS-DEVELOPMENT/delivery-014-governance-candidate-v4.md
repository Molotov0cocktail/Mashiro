# R014-P2 作者修复冻结 v4

v3 保留为 REPAIR，原独立 [key-red-01](delivery-014-review014-key-red-01.json) 不更改。

当前 [65文件清单](delivery-014-governance-manifest-v4.json) SHA256 `88F7055BC6171B3B1108DB715C09F565D8A5097DA1AE365C599392F29D14E237`，实查0漂移。root最新凭据保守判断指南与独立oracle已纳入；017不相关代码未修改。

产品增量仅 apply/check：恢复连接版本低于已知账本下限，或已删除/无持久凭据，写非破坏撤销标记并设不可用。连接身份保持、version抬到max(copy,floor)，后续显式新Key从该floor递增；治理覆盖校验不能再因连接disabled跳过version或撤销凭据限制。原保护blob未删除。

连接version是保守信号：普通连接编辑也可能触发要求重新提供Key，不能宣称已经证明某Key被删除。完全未变化且未撤销的备份Key保持可用。root指南已说明该差异。

[key-repair01](delivery-014-governance-key-repair-01.json) 4文件7tests全绿：独立删除→replacement→旧备份反例；作者unchanged/replacement/connection-edit三个真实session备份恢复场景，验证blob字节保持、是否调用解密、版本floor、新显式Key后floor+1；原非破坏凭据恢复及lstat目录/悬空marker反例。

本次限定ESLint及全项目node TypeScript均退出0，三个作者修改文件已Prettier。没有付费请求、未重复全量，无未结束工具进程。原v2/v3限制及原生未验事实保留。交root重新触发原Reviewer独立复核，不宣称作者自测即PASS。

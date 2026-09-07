# release-v4 用户材料独立限定 PASS

2026-09-08，review_017_trusted，继承实际 gpt-6-astra/medium。仅用户材料静态审查及必要的独立合成恢复fixture；未启动应用/安装器、未操作原生场景或发布。

## 冻结材料

- release-user-guide-0.1.0-draft.md：SHA256 AC72868E958C309C3B86A3ECBB4D78C7DC008DBE144230283CD42D94276DAE3B，实核匹配，限定 PASS。
- dist/release-v4-assets/Mashiro-0.1.0-third-party-notices.zip：2670275 bytes，SHA256 541450973FA7DB5E7270D5DAF6F0AD23065B0C36FECD2F83D5FD9E4446A95BAC，STATIC_PASS。

[ZIP独立结果](release-v4-user-materials-zip-review.json)：七项精确目录集合，每项只解压至内存，长度/SHA均与已审release-v4解包目录原文件一致，包括Electron、Chromium、四份组件许可和index；没有修改归档或许可。

## 用户说明闭环

[首次REPAIR](release-v4-user-materials-review-01.md) 保留原7E49版本事实：重装有效定位不一定再出首次设置窗口；恢复位置窗口没有通用备份还原按钮。C065中间文字虽然区分按钮，仍没有完整解释原位置已丢失且只有备份时的可达路线，不作为最终通过版本。

最终AC728版本明确：重装有效定位直接打开原数据，由菜单核对；恢复窗口退出/取消保留旧指向，显式成功选择另一个位置会改变指向。备份-only场景可明确创建新空A仅作进入应用的中转，再通过应用菜单将原备份恢复到另一新空B，治理核对与切换全部成功后B成为当前位置；不把A冒充恢复结果，不让用户删除定位文件绕过校验。

[独立恢复路线实证](release-v4-empty-bridge-restore-review.md) / [原始1项PASS](release-v4-empty-bridge-restore-run-01.json)：实际生产bootstrap恢复窗口→新A→生产session.restore旧备份到B→select。B保持原datasetId且应用备份后的原ID删除抑制，RET暂停，备份字节未变。仅合成fixture证明此关键路线，未代替最终原生备份/恢复验收。该新增测试scoped ESLint为0。

其它比例核对包括真实菜单标签、临时Key覆盖与重启语义、严格临时与明确退出、100MiB/90天可关闭和垃圾永不自动永久删除、恢复暂停及Windows凭据边界。未发现需要再次更改产品的用户说明问题。

指南仍明确是草稿，待填最终链接/tag/安装包校验及最终原生完成状态。此次PASS只认可当前草稿内容和附件字节对应已审37620929a7f507bb31d41861114cf6f825d715fd / D352安装包；不授权把草稿占位或未验场景写成发布完成。后续填入发行身份仍需比例事实/链接核对，不要求因文字修订重复全量产品测试。
## 恢复后重新授权步骤增量审核

指南最终增量SHA256 4DB87249DC7C4233D2F49A573988CAEFA79ACA8E9BD714CE70599DBCF0DC692C；发行说明SHA256 E41C8FA44C7EB0E7CCC4DDFE6FC6C92DD37A10F86C290B6AC4C36E66872511A8。仅比例只读审核，LIMITED PASS，不重跑产品测试。指南97B6中间版把事项授权标题套用了记忆标题，已修为实际“事项权限与实际接收方”；记忆仍为“助手与实际接收方授权”。

两文新增的恢复后连接停用、助手绑定清除、重新启用保存并重绑、再核读取与实际接收许可，与生产pauseRestoredWork/permissionSnapshot/MemoryService.round边界一致。重新授权不等于重新请求Provider，不得把已撤回或已更新对象的旧正文复活。notes同时澄清有效定位重装直接打开、备份only显式A→B路线和当前NotSigned，与前述已审证据一致；最终下载与原生待验仍保留。

本次独立实际查看冻结delivery-014-release-v4-memory-round-restored-01.png（SHA256 547F552CCCBB59273905372125E54312CFDC391C5BEFE7F8E0CF53EA6274CD78）：可见提供v1、已观察到Provider响应、派发时间2026/9/8 03:31:26、不证明模型采用，以及对象/版本当前不可用、正文/来源/操作入口撤下。它支持暂停状态如实呈现，不证明恢复后正文已可打开或数据已丢失。

对应JSON SHA256 7222C53AE705E0CF71FEF404679EC9621AA99A0E7B482221F213B5D3E096B54E记PID235296和原request/object身份；其中UIA为滚动前offscreen采样，不将其bounds和PNG视口说成同步。同位可打开态仍待owner后续冻结证据。默认view_image因sandbox helper启动失败，改用获准exec读取同一冻结PNG字节直接显示；未捕获实时桌面。
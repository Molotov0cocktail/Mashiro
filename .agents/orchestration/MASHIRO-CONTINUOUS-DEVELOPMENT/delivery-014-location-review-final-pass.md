# 014 location foundation — independent FOUNDATION_CANDIDATE PASS

2026-09-07；Reviewer background_013_trusted，实际 gpt-6-astra / medium。本次只复核由root实现、本人未实现的014位置底座，不评审013自有代码。产品未由Reviewer修改。

## 精确候选

- src/main/data/production-location.ts — SHA-256 3a9e9eaea91a1e73131f51b794d31598996a2d60d4c31bd33ca56672d8d94048
- tests/unit/production-location.test.ts — SHA-256 8f004344ad19739182c9b765767c66df6f1b2679ca29088f785986e0f5e01203
- Reviewer独立反例 tests/unit/delivery-014-location-review.test.ts — SHA-256 3814ba61e396c0e64bec4f87a0cfbb6f5b5d859e75041ec052b82aa06c977e59

最终SHA在测试和静态检查后再次读取确认。仅新增Reviewer测试最终纯格式差异；测试语义相同，scoped静态在格式化后执行。

## 缺陷闭环与独立证据

[初审REPAIR](delivery-014-location-review-v1.md)发现 Windows 正斜杠UNC绕过原字符串检查，使 lstat 开始访问远端路径；[原始红结果](delivery-014-location-review-01.json)为13通过/1失败。root现在在 resolve(path) 后、任何 lstat前再次拒绝规范化UNC。Reviewer直接读取了修复顺序，并额外覆盖正反混合斜杠；全部文件IO由mock拦截，反例没有真实网络访问。

[最终独立结果](delivery-014-location-review-02.json)：2测试文件、15测试、0失败；包括root原10项及Reviewer独立5项。命令直接调用已锁定Vitest，最终退出0，工具chunk f90b85；初审失败工具chunk cedd5a。最终新增覆盖：

- 正斜杠UNC及3种混合斜杠UNC在任何文件IO前拒绝。
- 未知manifest权限字段拒绝，且不生成locator。
- dataset manifest换ID进入RECOVERY，数据库与locator字节保持。
- locator目录junction不会误判成缺失首次使用，绑定拒绝并保留目标。

独立scoped TypeScript严格NodeNext/noEmit退出0（0b1561）；三文件ESLint退出0（5c99ec）；三文件Prettier退出0（33204e）。没有修改默认测试期限或削弱原断言。

## 成立范围

严格版本化locator/manifest身份，READY/PREPARING区分；缺失/损坏数据与配置不静默创建或回退；显式bind绑定已初始化dataset，expectedFingerprint拒绝过期；relocate保持原UUID；同目录fsync临时文件后rename原子替换失败保留旧locator；协作写锁不自动清除既有锁；local canonical目录与每层junction校验。初审唯一明确缺陷已关闭，因此本精确候选满足其限定底座合同。

这是FOUNDATION_CANDIDATE PASS，不是014完成或PACKAGED资格。模块尚未接正式启动；首次数据集初始化、SQLite打开前的应用/数据所有权、dataset全生命周期锁、经过核验的stale-lock恢复、完整数据库/schema/Markdown检查、备份迁移、原生chooser/recovery UI、真实普通用户权限失败、断电持久性与Windows安装/升级/卸载仍是后续必需条件。现有locator协作锁不能被当作dataset生命周期锁，SQLite header检查不能替代完整性检查。root原说明准确列出这些边界，无需为本次底座PASS虚构完成。

后续由root继续013/014及总体验收发行；本审查不提交或推送，不改变PROGRAM持续授权。

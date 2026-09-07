# 014 location foundation independent review — REPAIR

2026-09-07；background_013_trusted，实际 gpt-6-astra / medium。本次只复核自己未实现的 production-location 底座；不审查013自有实现，不修改产品。

候选字节独立实查：
- src/main/data/production-location.ts: 7ad82944247358478c226d40565a961a397408d4fb682f5f62155960d0e4697a
- tests/unit/production-location.test.ts: 8f004344ad19739182c9b765767c66df6f1b2679ca29088f785986e0f5e01203

## 确认缺陷

P2：canonicalDirectory 在 resolve 之前仅用原字符串 startsWith('\\\\') 排除 UNC。Windows 的正斜杠 UNC（例如 //review.invalid/share/data）也满足 isAbsolute，却绕过检查；resolve 将其转成 UNC 后，第一次 lstatSync 已尝试访问远端路径。这违反本底座“仅本地绝对目录”的明确边界。

独立反例将 lstatSync 替换为只记录路径并立即抛错的 guard，没有任何真实网络访问。期望 LOCATION_UNSUPPORTED，实际为 REVIEW_BLOCKS_ALL_IO，证明到达了文件访问边界。[原始结果](delivery-014-location-review-01.json)：原10测试与独立4测试共13通过/1失败。修复应在第一次文件IO前检查规范化绝对路径的UNC根，覆盖正斜杠及混合斜杠；不得仅扩大网络访问后再捕获错误。root 单写产品修复。

## 已核查成立的范围

严格 versioned locator/manifest UUID 与状态；缺配置目录不冒充 first use；缺失/损坏定位和未就绪dataset不创建新库；同ID relocation 保留身份；expectedFingerprint 拒绝过期绑定；失败rename保留旧locator且清本次临时文件；预存cooperative lock不擅删；每层ancestor junction拒绝；SQLite仅检查header的限制与文档一致。新增未知manifest权限字段、数据manifest换ID、locator junction三反例均通过。新增反例自身node typecheck与scoped lint退出0。

## 非本候选完成的能力

模块尚未接生产启动。生命周期dataset lock、先获取数据所有权再打开SQLite、完整schema/数据库/Markdown校验、验证后的stale-lock恢复、原子数据集初始化/备份迁移、chooser/recovery UI、真实普通用户权限失败、断电持久性以及安装/更新/卸载仍是014集成必需项。cooperative locator写锁不是dataset lifetime lock，header通过不等于数据库合格。候选说明明确这些限制，因此不把未接入能力伪报为本模块已验，也不把它们额外升级成与当前代码无关的缺陷。

当前结论 REPAIR，仅上述本地路径缺陷阻止 FOUNDATION_CANDIDATE PASS。修复后须由Reviewer复跑相同独立反例及原套件；不宣称014/PACKAGED或PROGRAM完成。

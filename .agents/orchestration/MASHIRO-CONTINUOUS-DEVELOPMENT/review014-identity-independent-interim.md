# Identity repair independent interim verification

2026-09-08 Astra/medium，限定验证通过，不授候选最终PASS。作者仍补E2E隔离平台接线；index/runtime旧阶段hash不得视为最终冻结。

独立tests/unit/review014-production-notification-identity.test.ts原2项在旧platform901545…0C7A8真实RED，raw review014-production-notification-identity-red-01.json保留。当前原断言转绿，并新增packaged Windows正向：能力检查调用Electron、真实platform.show将有界group launch交给mock Notification并show一次，避免全部禁通知假通过。mock不构成原生Shell验收。

独立tests/unit/review014-login-migration-retry.test.ts复用作者真实makensis机制，唯一HKCU Software/Mashiro/Tests/Review014Migration/UUID，不接触实际Run；生成宏副本只将唯一新Run RegSet调用换成返回错误5。第一次调用已写approval后失败，旧Unicode精确命令及Off binary保留，新Run/approval不存在；原宏第二次完整重试，旧两项删除，新命令及Off binary精确迁移。finally删除唯一自有子树并验证不存在，临时文件清理先验证真实tmp父目录/前缀/非链接。

实测generator前后均ECD54D2792681A87EC38F756644FE343142B85189E06C92C8BEBEB776B4576E4。首次run01实际FAIL停在reg.exe中文输出按UTF8读取的测试断言，已保留raw，不称迁移失败；独立读取改为.NET Unicode→base64精确值，未降低业务断言，run02绿。该候选已含作者回滚修复，不伪造旧实现该风险曾被此oracle执行为RED。

最终raw review014-identity-boundaries-run-03.json：2files/4tests全部通过；Node typecheck、两文件scoped ESLint及Prettier均退出0。原源码根因、双链接现场及安装GUID依据见v5-user-click-failure-diagnosis.md。

待正式manifest核所有最终hash、晚到Off作者fixture/实现、新E2E !packaged+test profile守卫与原生产路径。新制品AppsFolder身份、旧Run升级选择与实际通知点击仍需对应证据，不能由本轮mock/合成Registry代替。
## Final-candidate late-Off counterexample: REPAIR

对同ECD54D…576E4生成器新增独立真实NSIS场景，在新Run RegSet成功返回后，将旧approval从02(On)写为03(Off)，再继续原宏。旧Run及Off保留检查通过，但新Run仍存在，违反迁移不得绕过用户禁用选择。raw review014-login-late-off-run-01.json：原错误5回滚重试PASS，新增late-Off FAIL（query status0）；唯一scratch子树finally清理检查通过。原始FAIL保留，不把仅保留旧Off字节冒称行为安全。

要求作者在源改变/迁移未完成时按完整归属检查撤回本次新Run/approval，不能删除晚到的他方新值；修后原独立断言复验。E2E增量只读核对确认!packaged+test严格守卫、生产默认Windows，原service/timer/真实UI处理/重启身份断言保留，syntheticDeliveryObserved与nativeShowObserved=false诚实分开；整体仍因上述真实竞态REPAIR，等待修复冻结。
# 019/020 integrated candidate — ongoing

Status: ACTIVE / REPAIR, not packaged acceptance. Source base `3aeb3c7deaa75faa2997af083423ae803a252d00` was non-force pushed and then read back from both existing main remotes. Version metadata is 0.1.1; no tag or release has been created.

## Executed checks and actual failures

- Full suite 01: 905 tests, 887 passed, 10 failed, eight explicitly pending. Original JSON/raw remain unchanged. Old UI selectors and the new ready-data acknowledgement/window-cleanup fixture contract account for several failures; their actual corrections and independent review must be bound before integration is accepted.
- Two unchanged heavy integration files were rerun with one worker: 16/16 passed in `post-release-root-heavy-diagnostic-01.json`. This supports a contention hypothesis, not a claim that the first run passed. No test deadline or behavioral assertion was changed. Full suite 02 is running with one worker.
- Typecheck passed. Initial lint found missing explicit Node globals in the release-tool offline fixture; root added `node:url` and `node:console` imports. The extracted release-transport checks still pass one positive and 12 rejecting mutations, with zero network or credential reads. A later lint found a reviewer fixture's unused parameter; its owner corrected the fixture. Whole-project lint 03 and format check then passed.
- Integrated build 01 passed. Root output record 01 incorrectly assumed `out/preload/index.js`; it is invalid evidence. Corrected record 02 enumerates all five actual outputs, including `index.cjs`. Subsequent product changes require a new build/output identity.
- Electron run `43999aaf-a402-45f2-94f1-0f724696d302` failed at the invalid-root startup probe timeout. The new early visible error can wait for interaction. The next experimental harness killed its child after seeing the failure event; root rejected this as proof of the application's own nonzero exit. That route cannot replace the original assertion.
- A subsequent normal seed reached a real history-permission navigation timeout, run `7dc3455b-c8b5-4f76-85a3-5b0b9888018d`. The author identified a real visibility seam: App navigates to chat while the moved permissions are hidden in that surface. Root viewed the associated synthetic screenshot and also found overlapping sidebar settings/operations at 944 by 616. Both are being repaired; component-level PASS does not settle real viewport behavior.

## Current ownership and data state

Sol owns the renderer/deep-link/layout repair and corresponding E2E navigation fixture; the other Sol owns the precise startup-dialog probe and installation preparation. Astra independently reviews the changed behavior and original assertions. Root owns integration, global records and release coordination.

The authorized complete original-profile preflight passed, but profile preservation has **not** run. No original profile has been moved, no new candidate installed, and the external previous dataset has not been parsed or deleted. Native testing begins only after reviewed preservation and candidate admission; test data is retained separately before restoring the original tree.

## Current integration result

最新整合（2026-09-08）：full04 已实际通过，230文件/908项，900通过、0失败、8明确跳过；保留full01–03原失败。steward扫描批次/合并事务已独立限定PASS，未放宽500ms断言。类型、lint、格式通过，build04通过。真实Electron06 run ddf02832-8aa5-4325-b995-6438275706c7 已 E2E_SUCCESS_RETAINED，seed PID89356 / verify PID38256；早期错误窗口由正常WM_CLOSE关闭并保留应用自身非零退出断言，日常、权限导航和持久化链实际通过。Daily测试标签/阶段诊断适配不改变业务断言。正在生成0.1.1候选与独立制品审，随后隔离安装；原profile仍未移动。用户明确原安装位于桌面子文件夹。

Package attempt01 failed before packaging because the CLI interpreted the dotted short option as a configuration filename. Attempt02 uses the installed electron-builder API with the same committed config, an explicit unique output directory and the previously qualified local Electron distribution. This does not change product source or dependencies.

原生隔离状态（2026-09-08 21:40）：原 C:\Users\30910\AppData\Roaming\Mashiro 已由正常Explorer上下文运行已审helper原样保全到同级 Mashiro-preserved-019-20260908-69f785a9；PROFILE_PRESERVED 回执 SHA BDB657C75E6887BF4F8249E1FA45638C4BEC929D6F4F9B3AB86E437CFD4BED22，目录ID D4AE69AB:011C00000001C1FF、tree BFA47C4C5514DE7E6183202465063DB767B65C2593BD0BDAC6A7B70419EAE103、92文件/6078369B完全相同，原位置不存在；未读取业务正文/凭据语义，外部9f未访问。steward_013_ui为唯一后续隔离执行者，必须最后FreezeTestProfile→退役合成树→RestoreOriginal并核完整回执，不能遗留原树未恢复。若接管先读实际phase回执，不能根据旧段“未移动”重复执行保全。

源码29831920b3ed1d0140f889f8a4a01dfab1e97ff9双main实核一致；v1安装包已实际STATIC_PASS，候选绑定40C96AFCD93FD68AFD770C732C3D7899D3A7C694BCFEC1E6C236CABF0378A3E9。非空A seed仍独审REPAIR（真实fixture计数、profile身份、复制读锁、目标后台暂停），未执行。020真实截图发现chat首屏输入被重复身份/上下文挤出，UI作者继续窄布局改善；v1保持历史静态通过但最终UI将重新冻结/build/harness/v2打包。原生任务继续独立准备，不在此停止。

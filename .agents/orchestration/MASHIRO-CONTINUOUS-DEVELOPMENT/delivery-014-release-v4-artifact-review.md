# release-v4 内部制品 STATIC_PASS

2026-09-08，独立 reviewer review_017_trusted，继承实际 gpt-6-astra/medium。只读 dist/windows-candidate-release-v4；未启动 setup/EXE、未操作 Registry、未占用原生场景。结论仅准入下一步原生安装验收，不是016整体或发布完成。

源码 HEAD 实核 37620929a7f507bb31d41861114cf6f825d715fd；相关打包、schema、RET、App和合同路径与该提交无差异。实际 ASAR 的五份 out 与 retention-009-root-frozen-output-v4.json 的长度和 SHA256 全部匹配，包括 main、preload、renderer JS/CSS/HTML。冻结证据原 baseCommit 表示构建时的工作树基点，不冒称当时旧提交已有新行为。

## 实际身份

- Setup：112585917 bytes；SHA256 D352DD8AAD149D011405400476C2561C336768F076523E7DEDD2CCDB45D16EF4。
- 应用 EXE：245289984 bytes；SHA256 73A4AFA12FF36B758C0F8D450F6B6AACFC0F3566C63EFAD14F458173D8508E4D。与旧clean EXE不同，未复用旧EXE身份声明。
- ASAR：15512143 bytes；SHA256 F310B79143120BADF9BF7AEE4603A01C7F2C63963B43EBE1E80C4C906F5541FD。
- Blockmap：118818 bytes；SHA256 C9C0809DD91F3AABB47885598556496058118E4F99325F5DFA3FF4847C85C9D6。
- 两个EXE实际 Authenticode 均 NotSigned，FileVersion 0.1.0、ProductName Mashiro；应用ProductVersion 0.1.0.0，setup为0.1.0。签名不是推断。

## 包内容和卸载清单

实际递归目录79个普通文件与 owned清单79项完全一致，无链接、重复项、未登记文件或data路径；resources/default_app.asar及version均缺失。六份notice引用文件SHA全部匹配，实际ASAR runtime元数据对应React19.2.8、react-dom19.2.8、scheduler0.27.0、Zod4.5.4。包根只含out/node_modules/package.json；第三方Zod自带src/tests不误判为项目测试泄漏。

实际.cache/packaging/owned-files.nsh按此79清单和目录、Mashiro.exe参数，用冻结Toast v2生成器全文重建完全相同，宏SHA256 B3DEE5761E6237DDF5E8938C74745577DAB435C9B78ECBA2F7D30FCDF97970FE；生成器仍为已审D840058C6C46066C6EBCD0699EAE0AF674F741B75BE504835D8CABF93EAFB169。这里验证生产生成输入和宏，不冒称从NSIS机器码反编译证明所有卸载行为；实际卸载仍交原生owner。

ASAR main有schema19迁移、冷导航assistantRevision/pendingNavigation和policy-status修复；主入口package.json指向./out/main/index.js，preload及renderer资源路径存在且对应冻结字节。contextIsolation/sandbox开启、nodeIntegration关闭，preload无node:sqlite。既有源码独立审核及冻结两PID测试复用，不通过静态包扫描冒称新原生行为已执行。

[只读静态结果](delivery-014-release-v4-artifact-review.json)、[实际签名与版本](delivery-014-release-v4-artifact-review-identity.json)、[核验脚本](delivery-014-release-v4-artifact-review.mjs)。首轮脚本在ASAR依赖元数据读取误用斜杠路径导致not found，tool chunk2e9e3f exit1；实际listPackage证明文件存在，统一Windows路径后完整复跑exit0。它是review脚本路径问题，不是制品缺包。

根build01最终Can't open output file保持原FAIL，build02为独立成功证据；本审核不猜测防病毒原因，不覆盖旧报告。准入后仍需最终安装payload、schema升级、真实通知/冷导航、治理恢复、旧回执UI及卸载残留验收，再完成实际发布和下载核验。
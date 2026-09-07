# Release-v5 independent artifact static review

2026-09-08 independent Astra/medium。**STATIC_PASS，准入独立原生重装验证；不是通知/016/发布最终通过。** 只读实际dist/windows-candidate-release-v5，不运行setup/EXE/COM。

绑定源码a86c2684733fbd3d9d5f5fefd53775357089fbfd，实际manifest SHA41BEA8DDEE33CE97A20D8728FCBC62086F9C2AA363CFDD1B5B97ADFA4688EC10。独立执行[审核脚本](delivery-014-release-v5-artifact-review.mjs)退出0并落[原始结果](delivery-014-release-v5-artifact-review.json)，实际字节/hash：

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| setup | 112586002 | CEB41588827C580C47F226F94E810188FC85563D34D24C68FE89D4C94C6E221E |
| Mashiro.exe | 245289984 | 3BD29B9E9C4300000B98251D07C3D4A98E1638EBE4D4F9EF152FF8596DFB1030 |
| app.asar | 15512717 | BD19D48D842ADE57CAA16CD42C103B8D8EB9C30637005342A30711DDC6D0F6B1 |
| blockmap | 118827 | 811C66629ABC87C6B5C98A62B8CC14F8E8CC9A634437BFBACC8ED194A7E99EB5 |

[独立系统身份](delivery-014-release-v5-artifact-review-identity.json)确认setup/EXE均0.1.0、Mashiro、实际NotSigned。ASAR五份输出逐大小/hash等于operations-013-root-frozen-output-v5；main925741/F5E0B6925E4585C44A1CCE13B9125F68CE2A17107D5469695E5A0B667FF1B4D5，其余四份与v4相同。schema19、冷导航、policy-status及正常SENDING/QUEUED/RUNNING INFO兼容包含，旧runtime其它资格按已审diff复用。

实际79owned文件与遍历完全一致，无链接/data/未知文件；resources/default_app.asar和version不存在。六声明及index hash与实际runtime版本一致，ASAR根仅node_modules/out/package.json，入口./out/main/index.js。生成NSIS全文匹配已审Toast v2，SHA B3DEE5761E6237DDF5E8938C74745577DAB435C9B78ECBA2F7D30FCDF97970FE，与v4相同。因此v4真实开启Run的卸载、4个自有LocalServer32清理、18data/locator/未知文件保留可比例复用；v5仍需实际重装及新增运行中心/通知结果，不要求重复未变旧宏矩阵。

[ASAR完整性证据](delivery-014-release-v5-asar-integrity.json)：独立计算ASAR header SHA256 14d03c1ccf365c4ff3a27cd6dc8c00e0b41be9a8bc007bae33cdda9dde161985，与EXE内完整性JSON的resources\\app.asar条目精确匹配。EXE同时带resources\\default_app.asar的发行完整性条目，但相应实际文件不存在；这是验证元数据，不是额外可加载fallback代码。未更改fuse或系统保护。首个简短node诊断因shell引号语法失败，随后here-string只读解析成功，未构成产品失败。

build01最终输出打不开的FAIL保留，build02成功由root记录；不归因AV、不改权限。新探针[release-v5-toast-com-01.ps1](delivery-014-release-v5-toast-com-01.ps1) SHA0AB144C736FF59FF33C9B30B03824A20B9AF3F1D6072F35C04EBA8F9ADD3A356，仅从已审probe02更新注释及真实EXE3BD身份，单一已验shortcut CLSID参数逻辑不变，PS parser0；未执行。原v7旧CLSID探针失败不重写。

# 014 正式构建配置与隔离安装保护路线

2026-09-07，root实施和实测，尚非独立制品PASS。精确electron-builder26.15.3已加入package/lock，npm安装254包、audit0漏洞；安装脚本的三条allowScripts警告未被宽泛批准。直接CLI版本26.15.3和实际构建均可运行。保留既有ASAR/NSIS历史路线，不重启已关闭的Toolhelp路线。

新增electron-builder.config.mjs、build/after-pack.mjs、build/inspect-runtime.mjs及pack:windows/dist:windows命令。应用身份Mashiro.Desktop与提醒一致；per-user assisted NSIS，允许选择程序目录，无提升、不删除AppData；显式自定义空签名回调仍保留Windows版本资源编辑，所有构建publish=never。没有访问签名身份、采购、关闭系统防护或发布资产。

[独立目录构建](delivery-014-pack-route-01.raw.txt)退出0：Electron44.1.1/x64、ASAR成功，实际Mashiro.exe FileVersion0.1.0、ProductVersion0.1.0.0、ProductNameMashiro；Authenticode为NotSigned，SHA-256 `17EB621B881EBA51BCF0C7F84CB75BB285B75D68E0057D707A133E23A379B6FB`。构建器内部“signing”日志不是已签名声明。当前仍用默认Electron程序图标，且这个内部制品沿用此前已构建的仓储out，未接生产main或日常最新源，不能作为功能完成候选。

[内部NSIS构建](delivery-014-nsis-route-01.raw.txt)使用独立appId Mashiro.InternalRoute.20260907，关闭自动运行和快捷方式，生成明确INTERNAL-ROUTE安装包。SHA-256 `2945BBBC6A904954486124CFB86F664ED6E71385EFAC08762368A50D7714D3A6`，NotSigned。没有创建公开Release/tag，也没有上传。

[实际隔离安装结果](delivery-014-install-route-01.json)：Windows普通用户令牌（isAdministrator=false）；安装PID159260、同版重装165368、卸载launcher162120均退出0。程序路径包含中文与空格。卸载后等待全部80个程序路径消失，再核对仅余data/synthetic-governance.json、根目录unknown-user-file.txt及resources/unknown-user-file.txt，三者原哈希均未变。合成根保留在结果中供复查；未启动应用、不声称跨版本升级或完整制品验收。

卸载宏从实际appOutDir文件生成，拒绝链接、不安全路径和data根；包含NSIS随后确实注入的resources/elevate.exe及自描述清单，只删精确文件和空目录，不递归删除安装根。文件忙时明确失败，未知文件不被清理。标签避免相对跳转在缺失文件时落入Abort；该实际宏通过上述安装/卸载实验。

第三方原文声明包括实际ASAR中的react19.2.8、react-dom19.2.8、scheduler0.27.0、zod4.5.4，以及Electron/Chromium原始声明。初次新增ASAR盘点误用POSIX路径调用Windows extractor，实际抛错；修为匹配时规范路径、提取时平台分隔符，实际四包读取和hook重新运行均成功，未知包或版本不一致将阻止构建。该补充严格盘点晚于上面的内部安装包，只改变声明验证和index元数据，不冒称旧安装包含新index；最终功能候选须重新正式构建。

当前结论：正式工具链与新的精确卸载保护路线SUPPORTED。剩余：数据候选独立修复/审核，生产main和退出释放、可执行升级恢复/用户备份、日常整合、真实制品场景、不同版本安装更新/卸载重装、最终独立发布验收和实际下载校验。PROGRAM ACTIVE。

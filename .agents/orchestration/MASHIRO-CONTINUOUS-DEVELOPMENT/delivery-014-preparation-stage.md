# 014 生产数据准备候选

2026-09-07。root 作者候选，未独立PASS、未接main、未声称PACKAGED可用。基线为已审并双远程同步2307e490a60af9cfce9f72ba9c0fd0d5ae658f20；并行013日常实现已加入schema14，数据模块使用当前schemaVersion和完整SQLite，不维护竞争表清单。

[九文件候选v1](delivery-014-preparation-candidate-v1.json) SHA-256 `21EE46B00B3541B58BCAC2F5D002E526548E4B99885117B32D6067EDCAB81AFA`，限定严格TS/lint/format全0；[当前5文件28tests](delivery-014-preparation-selection-tests-02.json)全绿，包含此前session作者与独立8项回归。初始5/8/12/26项增量报告保留，不冒称独立资格。

实现：标准用户runtime/config与业务data分开，显式原生默认/自定义/已有/重新定位/取消选择，首次取消只留下runtime不创建业务库，已有同身份重开不重新询问。session向可信准备回调传递已持有的真实租约。默认目录非空且不是有效数据集时拒绝，不静默初始化。

完整备份在维护停写断言、真实双目录租约及SQLite排他事务下复制权威SQL、接受/待恢复Markdown和受保护凭据blob；不解密、不记录正文/Key。原版本与副本完整性/外键/正文哈希、复制前后清单一致后形成可独立验证的envelope。旧快照payload带持久标记，常规数据选择拒绝直接打开，不能绕过后续恢复中的纠正/删除屏障。源/目的重叠、非空目的、坏正文、取消、伪租约、源变化、在用SQL、篡改完成清单均有反例。

需要升级时先只读识别旧schema和未来版本拒绝，再验证完整快照；迁移只在独立SQLite副本执行，全部通过且当前源完整清单仍一致才原子替换SQL。失败前原库保持原字节，快照可校验，自己的未提交候选清理。历史v11夹具移除真实后续结构后迁移到当前版本；失败DDL碰撞和未来版本不被削弱。

后续必要边界：常规手动完整备份入口、受保护的旧版本恢复/迁移数据位置、启动错误重试UX、生产main与退出释放整合、制品凭据/路径/安装升级卸载/实际下载验收均仍必做。当前回调与组合测试不能替代真实Electron native dialog或普通用户安装证据。独立Reviewer先完成其renderer有界工作后接此九文件；root暂冻结候选，继续精确Windows打包配置。PROGRAM ACTIVE。

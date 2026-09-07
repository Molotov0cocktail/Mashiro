# 013 日常与运行 renderer 修复候选交接

本候选以 `daily-013-ui-manifest-v2.json` 为唯一当前 UI manifest，取代 v1。除原六类日常闭环外，运行中心现在有五个相互独立的视图：当前运行、当前失败、历史记录、业务记录与分类用量。筛选覆盖助手、内部角色、功能、连接、模型和起止时间；助手与 actor 通过可信服务端字段筛选。业务记录使用 `operations.query({view:'business'})`，owner 展示可信 domain/id，并可进入日常功能、正式事项或所属后台、仓储员、提醒、Provider 页面。跨助手打开时先走既有助手切换 CAS。

用量汇总显示 prompt、completion、总 tokens、输入字符、未知和发送中请求。分类与请求继续使用独立游标；实际 token、估算 token/方法、未知原因和持久记录状态分别显示，未知不按零处理。

配置修复只把 `DailySettings` 的允许字段投影给 strict configure schema。草稿绑定载入时的配置版本；同版本的新 IPC 对象不会重置草稿。真正版本变化时保留旧草稿、清除接收授权、禁用保存并提示显式重载，因而不会拿新 version 覆盖旧草稿。期限与变更的窗口、字段及合并规则均可配置。

root 独立 oracle 的四项 RED 记录在 `daily-013-root-ui-red-04.json`，当前同一测试文件 SHA-256 `6FE1A1D8...` 的 4/4 已在修复后定向套件中通过。最终 executor 验证为定向 6 files/13 tests、完整 renderer 36 files/146 tests、web TypeScript、scope lint、format 和 diff whitespace 全 0。等待 root 依据精确 v2 manifest 作最终独立判定。

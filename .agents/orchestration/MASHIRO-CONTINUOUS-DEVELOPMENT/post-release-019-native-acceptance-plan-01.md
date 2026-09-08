# 019 v0.1.1 原生隔离验收执行计划（准备版）

状态：PREPARED_ONLY。此文件不授权立即运行安装器、应用或 profile 移动。唯一原生执行者为 steward_013_ui；只有 root 确认原 profile 保全成功，且 0.1.1 最终候选获得独立制品准入后，才可开始下列步骤。

## 固定边界

- 原 profile：C:\Users\30910\AppData\Roaming\Mashiro。
- 原 profile 保全位置：C:\Users\30910\AppData\Roaming\Mashiro-preserved-019-20260908-69f785a9。
- 原 profile 基线：目录身份 D4AE69AB:011C00000001C1FF，树摘要 BFA47C4C5514DE7E6183202465063DB767B65C2593BD0BDAC6A7B70419EAE103，92 文件、6078369 字节。
- 历史 v0.1.0 安装包：D:\Mashiro\dist\release-v7-assets\Mashiro-0.1.0-win-x64-setup.exe，112587919 字节，SHA-256 8F33C7E10FA663F52EABD9418B2B51979D1E191B1C3F5D28606068F95FCDDB58。
- Desktop 验证目录必须由 Environment.SpecialFolder.Desktop 解析，再追加 Mashiro 019 验证 中文 空格\应用；不得使用桌面根目录。用户确认历史安装位于桌面子文件夹。
- 默认安装目录预期为 %LOCALAPPDATA%\Programs\Mashiro，但必须以安装器页面、卸载登记与快捷方式实际目标三方读回为准。
- 测试期间只操作新建的隔离 profile 和它指向的合成数据；不打开保全的原数据库，不解析原正文或凭据，不触碰外部旧 dataset9f。
- 不调用 Provider。系统项只读/写 Mashiro 的固定 GUID、当前与 legacy Run、Mashiro 快捷方式和当前 COM 注册；不枚举或修改其他应用。
- 所有安装、应用和卸载启动复用 GetShellWindow/SWC_DESKTOP 的真实 Explorer ShellExecute 路线。工具侧 Start-Process 或工具注册表视图不能替代普通桌面证据。

## 执行顺序

1. **双门禁**
   - 核 0 个精确 Mashiro/安装器/卸载器进程。
   - root 提供 review019-profile-preserved-01.json，源路径已空、保全树身份及摘要与基线完全相同。
   - root 提供 0.1.1 最终制品绑定：source commit、setup/EXE/ASAR 的路径、字节、SHA-256、NotSigned 状态和独立 STATIC_PASS。uninstaller 若能从静态解包取得则一并绑定；否则在实际安装后立即冻结其字节/hash，不把安装前不存在的值设为门禁。
   - 绑定任一项缺失或漂移即停止；不移动 profile、不启动制品。

2. **建立隔离 profile**
   - 在原路径新建空 Mashiro 目录和唯一 .mashiro-019-isolated-profile.json 标记；标记不含原路径正文、数据或凭据。
   - 普通 Explorer 核真实 Run/StartupApproved/卸载登记仍与保全前快照一致。
   - 后续快照必须先验证保全 receipt、隔离标记、0 进程和无 reparse point。

3. **Desktop 中文空格子目录的 v0.1.0 基线**
   - 由 Explorer 启动已发布 v0.1.0 安装器，GUI 选择固定 Desktop 子目录。
   - 首次启动在隔离 profile 创建合成数据集 A，不导入、不绑定原 profile 或 dataset9f；记录安装 EXE/ASAR、cwd、父链、快捷方式和数据集 ID。
   - A 必须是非空跨域哨兵：至少含助手、正常历史、记忆、事项、提醒、连接、助手绑定、受保护的无私人含义合成凭据、后台设置与治理/删除抑制。优先复用已审 full-domain 合成 fixture 在全新隔离副本中生成，或通过产品 UI 创建；不得发送真实 Provider 请求。
   - 冻结 A 的 dataset ID、manifest/SQLite/凭据文件整体 hash、逐域计数与无正文哨兵摘要，后续升级/新建 B/卸载才能证明保护与不继承。
   - 正常菜单退出，冻结 locator、manifest、SQLite 整体哈希、schema/integrity/FK、无 Provider 调用。
   - 若历史泛化错误复现，保留原对话框、阶段和 0/短命进程事实；不据猜测修复或改注册，仍可在同一隔离现场继续 0.1.1 覆盖验证。

4. **同路径升级到 0.1.1 与一次性旧数据说明**
   - 覆盖安装前后、首次启动前，profile/locator/数据库逐字节不变；安装目录身份变为受审 0.1.1。
   - 首次 0.1.1 启动必须显示当前数据路径、数据集 ID、安装包不含助手/历史/记忆，以及继续、数据管理、退出三项。
   - 第一次选择退出：应用退出，locator/数据库/治理字节不变；再次启动仍显示提示。
   - 第二次选择继续：打开同一数据集；正常退出后再启动一次，提示不再重复。登录启动不得因普通启动反复弹出该提示。
   - 若 prompt 未出现，必须由隔离 profile 的 awareness 证据解释；不得手改 marker 制造通过。

5. **健康应用的数据管理与新空数据**
   - “查看当前数据位置”必须实际显示当前路径和数据集 ID，卸载保留说明使用真实换行。
   - “新建空数据集并重启…”第一次取消：locator、旧数据哈希、治理登记均不变。
   - 第二次选择隔离 profile 内新空目录 B：重启后 B 有新 dataset ID、当前 schema、integrity ok、FK 0。
   - B 不继承 assistants、timeline/history、items/reminders、memory、provider connections、assistant bindings、持久凭据和业务设置；控制/治理表只允许新数据初始化的必要行。
   - 原合成 A 的目录身份、manifest、数据库和 sentinel 哈希保持，仍可显式选择；不能将“保留 A”写成“物理删除 A”。

6. **错误恢复**
   - 数据路径恢复：正常退出后，仅将当前合成 B 同卷改名到固定保全名；启动应进入数据恢复，不得静默新建默认库或改 locator。选择退出后 locator 仍指 B。再把 B 原样改回并启动，应恢复同一 dataset ID。
   - 早期配置失败：正常退出后，将整个隔离 profile 同卷改名保全，在原位置放一个固定合成阻挡文件；从 Desktop 中文空格安装目录启动 0.1.1。应出现安全的 RUNTIME_PATHS 阶段提示和 correlationId，且原异常细节不泄露。诊断文件无法写入时也不能掩盖原提示。
   - 阻挡文件改名保留，再将隔离 profile 按目录身份/树摘要原样恢复；启动后仍是同一 B。全程不删除目录、不损坏数据库。
   - SESSION_PREPARE、窗口/服务部分启动和 cleanup FAILED 的细节由已通过的独立故障注入测试承担；原生现场不故意破坏数据库、ASAR 或权限 ACL。

7. **Desktop 安装卸载保留**
   - 应用正常退出且 login Off 后，普通 GUI 卸载 Desktop 安装。
   - 程序目录、固定 GUID、当前/legacy Run、StartupApproved、自有快捷方式和自有 COM 注册按实际清除；隔离 profile、A、B 与未知 marker 完整保留。
   - 卸载前后稳定数据树可逐字节比较；运行后产生的正常 metadata 变化必须逐字段归因，不能用表数相同替代数据保护。

8. **默认目录重装**
   - 由 Explorer 启动同一受审 0.1.1 setup，使用安装器实际默认目录。
   - 首次启动前隔离 profile 逐字节不变；启动后打开同一 B，已确认过的数据集不重复弹旧数据提示。
   - 核默认目录 EXE/ASAR、快捷方式真实 target、固定 GUID、AUMID、login Off；如需测试 login On，只经产品 UI 显式开启并在收尾前再关闭。
   - 020 视觉与可达性验收可在此 B 上执行；单独记录 viewport/截图/UIA，且不把 UI 测试结果冒充 019 数据隔离结论。

9. **最终卸载与 profile 恢复**
   - 普通 GUI 卸载默认安装；确认 0 进程、Mashiro 自有系统项清理、隔离 profile/数据完整。
   - 将当前隔离测试 profile 同卷改名到 Mashiro-test-retired-019-20260908-69f785a9，保留而不递归删除。
   - 重新核原保全树身份/摘要，再同卷恢复到 C:\Users\30910\AppData\Roaming\Mashiro；恢复后身份、树摘要、文件数、字节数与原基线完全一致。
   - 恢复后不启动 Mashiro，不打开原 SQLite，不读取凭据。外部 dataset9f 不访问、不改写。
   - 任一 CAS、身份、hash、reparse、进程或登记守卫失败即保持两棵树并进入人工诊断；不得覆盖或删除。

## 证据与裁决

- 每一步用独立 CreateNew receipt，包含时间、阶段、固定制品/路径哈希、父链和动作结果；原失败文件不覆盖。
- installer prelaunch 用全树字节相等；正常应用启动后只要求业务对象/凭据/治理语义保持，并逐字段解释调度、审计、awareness 等允许变化。
- 历史 Desktop 泛化错误目前仍是 NOT_REPRODUCED。只有 0.1.1 在隔离 Desktop 子目录的实际成功/失败才构成本候选原生裁决。
- 本计划准备完成不等于 profile 已保全、候选已准入或原生 PASS。

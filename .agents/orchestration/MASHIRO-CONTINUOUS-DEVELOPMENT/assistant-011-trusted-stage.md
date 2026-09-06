# 011 trusted stage handoff

日期：2026-09-07。角色：trusted Executor，实际 gpt-6-astra / medium。阶段：TRUSTED_FROZEN_AWAITING_UI；不是独立 PASS，不是 TASK_DONE 或 PROGRAM_DONE。root 可在 UI 冻结后 followup 本作者继续顺序集成。

## 基线与范围

010 产品基线 ab11110a45c6ddb65bd114547225dd4e329bba11；实施时实查 HEAD 已为其文档收尾 4c044f9c269fa90ed7e9677a4603601268e343eb。schema 实查 8，加法迁移至 9。未修改 Git/index/remotes、renderer、全局文档或 distribution-notices 文件。23 个作者文件及精确哈希见 [阶段清单](assistant-011-trusted-stage-manifest.json)；其中 Electron 脚本仅准备，尚未执行。

## 实现

- 必需 DTO persona/avatarKey；六个内置键，默认空人设/mashiro。rename 可选扩展保持仅改名兼容，既有六通道和双 CAS 不变。NFC、CR/CRLF 转 LF、4000 code points、控制字符检查、strict output。
- schema 9 两个加法字段；旧表/trigger/integrity/FK 前置验证；事务内迁移；table_info 和回滚式约束/default 探针。碰撞完整回滚。
- Provider 单次读取冻结助手快照；JSON 配置系统消息不赋予权限。正常历史 64000 子预算和临时/最终 120000 预算计入实际转义后 system 长度；旧工具段保留旧配置，下一次和重开 selected context 只注入新配置。
- 永久删除新增字段闭环：root 提示后先通过公开 purge 路径复现 persona 墓碑残留，再在现有事务清空 persona、恢复默认 avatar；旧段清除，旧 ID 无法恢复。
- Electron 准备：seed 为 E2E_PROFILE_BEFORE/leaf；真实目标卡 DOM 改 E2E_PROFILE/moon，验证 revision+1，第二 PID 恢复；四个真实配置导航、列表/聊天形象和发送段将验证。该阶段尚未跑 Electron，UI 完成后可能需要测试选择器修复。

## 机器验证

- 最终 trusted 全套：`npx vitest run tests/unit tests/integration --maxWorkers=1`，35 文件 / 227 测试，退出 0。[原始输出](assistant-011-trusted-unit-integration.txt)。
- 新 profile suite 9/9：NFC/4000 Unicode、双 CAS/事务失败、身份与跨域行保留、v8 碰撞回滚、正常/临时预算整轮排除、在途旧段/重启新段、恶意人设权限与 user-statement 来源对抗。[输出](assistant-011-trusted-profile-focused.txt)。
- purge 先红退出 1，原公开 API 完成后仍留人设；修复后 profile+retention 2 文件 / 15 测试退出 0。[红](assistant-011-trusted-purge-red.txt)、[绿](assistant-011-trusted-purge-green.txt)。
- trusted TypeScript `npx tsc -p tsconfig.node.json --noEmit`、限定 main/shared/preload/unit/integration/harness ESLint 均退出 0。
- `npm ls --depth=0` 精确依赖树退出 0；foundation validator JSON ok=true/errors=[]/warnings=[]。
- scoped diff --check 无输出；src/tests/scripts 常见私钥/header/token 模式和 db/tmp/bak/credential/writer 残留扫描均无匹配，非全环境凭据审计。

## 尝试与工具事实

首个默认 exec 以及 apply_patch 在目标写入前 setup-refresh 失败；assistant-contract preimage 94f45508352c8033ec19d7589eaeb3717243e16f31c64191b46c11bbc20e0382 未变。转经工具审核的 require_escalated Node writer：明确路径/精确匹配数、preimage hash、同目录 create-new 临时文件、备份替换与失败回滚、postimage hash。自己的 tmp/bak 已清理，无绕过审核拒绝。

首次 affected regressions 为 18 个旧夹具断言失败：旧 schema 8、降版夹具未删除新增列、缺少新增 system 消息。精确修正后 10/70 通过；扩大 trusted 发现 4 个、随后 1 个同类剩余消息断言，全部修正后 35/227 通过。保留原用户/历史/权限断言，新增独立 system/预算测试；没有跳过或放宽测试换绿。5 个失败断言留下的已知合成 Temp 目录已验证绝对位置后逐一删除。

## 未运行与交接

本作者未发付费请求、未接触凭据、未 commit/push。真实两次 Provider 由 root 独立执行并另存证据；实现请求组成在其验证后未变，仅补 purge 清理与测试。

**full renderer-inclusive tests、全项目 typecheck/lint/format、build、更新后的两个 fresh PID Electron 尚待 UI 冻结后本作者顺序执行。** 此阶段可供独立 Reviewer 先审可信冻结范围；独立审核结论由 root 安排，不把作者结果当正式 PASS。

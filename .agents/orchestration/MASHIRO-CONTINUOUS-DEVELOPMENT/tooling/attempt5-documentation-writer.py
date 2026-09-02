from __future__ import annotations

import difflib
import hashlib
import json
import os
import stat
import sys
import uuid
from pathlib import Path


ROOT = Path(r"D:\Mashiro")

AGENTS_NEW = """# Mashiro repository rules

## Project overview

- Mashiro is a Windows 11, single-user, local-first desktop assistant. The current F1 candidate is limited to stable local assistant identities and their SQLite-backed create, switch, rename, primary, archive, and restart lifecycle.
- Product language is Chinese; identifiers, APIs, commands, and configuration use English.
- Provider, conversation, memory, item, reminder, installer, updater, migration, packaged distribution, Release, and deployment capability require separate tasks.

## Authoritative sources

- Product scope and design live in `doc/proposal.md`, `doc/high-level-design.md`, and `doc/detailed-design.md`.
- Executable task state lives in `doc/tasks/001-project-foundation.md` and `doc/tasks/progress.md`; task 002 remains the limited Electron 44.1.1/node:sqlite qualification and task 003 remains deferred and NOT RUN.
- Orchestration route and failure evidence live under `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/`.

## Stable architecture

- Keep renderer untrusted: no SQL, filesystem paths, credentials, shell, broad IPC, or arbitrary network authority.
- Preserve `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict trusted-side Zod validation, exactly six assistant IPC channels, stable assistant IDs, SQLite transaction atomicity, and repository-external runtime data.
- The sandbox preload may import only Electron and the Zod-free shared channel constants at runtime; schemas remain on trusted boundaries.

## Workflow

- Use exact dependency versions and the committed npm lockfile. Do not use force, legacy-peer-deps, alternate registries, mirrors, or disabled TLS.
- Clean recovery is `npm ci`, then `npm exec install-electron`, then `npm run verify`; the Electron package exposes the installer as a bin and does not run it as an npm lifecycle script.
- Required verification is focused/full tests, typecheck, lint, format, build, the two-PID Electron lifecycle harness, dependency-tree checks, foundation validation, and secret/generated/residual scans.
- Preserve the historical Toolhelp32 `-003` auxiliary audit as failed, deferred, and non-blocking; do not rerun it or create `-004`.
- Only a mandatory-fresh Reviewer may issue the F1 verdict. Only an explicitly reviewed final HEAD may be pushed to `github/main` and `gitee/main`.

## Environment and Git

- Git commands on this host use `D:\\Git\\Git\\cmd\\git.exe -c safe.directory=D:/Mashiro ...`.
- Never persist `safe.directory`, change owner/ACL, reset, reinitialize, rewrite history, force-push, or discard known partial state.
- Runtime data belongs outside the repository. `PACKAGED`, installer, migration, multi-instance, crash recovery, Provider calls, and real personal-data access remain NOT RUN unless a dedicated task says otherwise.
"""

SPECS = (
    {
        "path": ROOT / "README.md",
        "prehash": "998609aab64d1bc8d0efc27c149377625f51975767c93166f54df4fff8343c5d",
        "transforms": (
            (
                "- `npm ci`：从锁文件干净恢复依赖，并运行官方 Electron 安装器。",
                "- `npm ci`：从锁文件干净恢复 npm 依赖；随后运行 `npm exec install-electron` 恢复锁定版本的 Electron 二进制。",
            ),
            (
                "F1 不包含 Provider、对话、记忆、事项、提醒、安装器、PACKAGED、Release 或部署。\n",
                """F1 不包含 Provider、对话、记忆、事项、提醒、安装器、PACKAGED、Release 或部署。

## F1 候选状态

当前实现已完成 Executor 验证，尚待 mandatory-fresh Reviewer 作出唯一 verdict。聚焦/全量测试、类型检查、lint、格式、构建、clean `npm ci`＋显式 Electron 恢复和两个不同真实 Electron PID 的关闭/重启持久化均已通过；`PACKAGED` 与发布链路仍为 **NOT RUN**，任何 push 只允许针对 Reviewer 明确审核的最终 HEAD。
""",
            ),
        ),
    },
    {
        "path": ROOT / "AGENTS.md",
        "prehash": "b3e1eb8196e9fca4877009b885e3d1c46e90e8a7793eb0224bf95d0a61637c1b",
        "whole": AGENTS_NEW,
    },
    {
        "path": ROOT / "doc" / "proposal.md",
        "prehash": "a7ba993580de0b4bb8b655b8402c3684c2bede8b678b59c12c1ec05311b70a15",
        "prefix": """# Mashiro 产品与阶段 Proposal

> 当前状态：F1 CANDIDATE IMPLEMENTED / EXECUTOR VERIFICATION GREEN / MANDATORY-FRESH REVIEW PENDING
> 当前更新：2026-09-03。下方原始 2026-09-02 规划快照保留决策与失败历史；其中“未授权／未初始化”等现场描述不再代表当前状态。

## 2026-09-03 F1 候选事实

- 已实现的范围仅为本地助手身份生命周期：创建、切换、重命名、设为主要助手、归档和 SQLite 重启恢复；Provider、对话、记忆、事项、提醒和发布能力没有随 F1 引入。
- renderer 维持不可信；preload 只暴露六个窄助手方法，main 以严格 Zod schema 验证输入，窗口保持 sandbox/context isolation，运行数据位于仓库外。
- clean 依赖恢复、10 个测试文件／16 个测试、静态检查、构建和真实 Electron `44.1.1` 两 PID 重启持久化已由 Executor 验证。最终产品 verdict 仍只能由全新 Reviewer 给出。
- task 002 的 `node:sqlite` 结论仍严格限定于既有资格范围；`PACKAGED`、安装器、迁移、多实例、崩溃恢复和发布仍为 **NOT RUN**。Provider task 003 仍为 **DEFERRED / NOT RUN**，没有读取凭据或个人数据。
- Toolhelp32 `-003` 辅助审计的历史失败保持 deferred/non-blocking，没有重跑，也没有创建 `-004`。全部 Attempt-1～5 路线与失败证据保留在编排报告中。

## 历史规划快照（2026-09-02，保留）

""",
    },
    {
        "path": ROOT / "doc" / "high-level-design.md",
        "prehash": "4a945375132abc233bb0c31ee3b3f1f01aae52743454c74df3c6597bd7ac6d69",
        "prefix": """# Mashiro 高层设计

> 当前状态：F1 CANDIDATE IMPLEMENTED / EXECUTOR VERIFICATION GREEN / REVIEW PENDING
> 当前更新：2026-09-03。下方 2026-09-02 设计保留为长期方向；未在 F1 中实现的模块仍不是现有架构事实。

## 当前 F1 架构落点

- 当前实际链路是 React renderer → contextBridge preload → 六个 typed assistant IPC handler → trusted AssistantService/Repository → Electron main 的 `node:sqlite`。
- preload 的运行时依赖图只有 Electron 与无 Zod 的本地通道常量；Zod schema 留在 trusted contract/main 验证路径。窗口固定 `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`、`webSecurity=true`，并拒绝新窗、导航和权限请求。
- SQLite schema/version/trigger guard、参数化语句、`BEGIN IMMEDIATE` 事务、stable UUID、assistant/state revision 和 primary/current active invariants 已实现并有 adversarial、stale/concurrent、rollback、corrupt/newer schema 测试。
- E2E 数据根必须是带 runId 所有权标记的 canonical OS-temp 子目录；开发数据位于 appData 的 `Mashiro Development`。真实 Electron seed/verify 使用不同 PID 并证明相同持久化快照。
- Provider、memory、item、reminder、worker、托盘、安装/更新/迁移和 `PACKAGED` 仍不属于当前实现。

## 历史高层设计（2026-09-02，保留）

""",
    },
    {
        "path": ROOT / "doc" / "detailed-design.md",
        "prehash": "b85b63f05bac38ab2317b6c59822d095d8f61738665a6f3210d410682991f766",
        "prefix": """# Mashiro 近期详细设计草案

> 当前状态：F1 IMPLEMENTED CANDIDATE / EXECUTOR GREEN / FRESH REVIEW PENDING
> 当前更新：2026-09-03。下方设计与集中决议记录完整保留；旧的授权、Git 和“尚未实现”描述仅是 2026-09-02 历史现场。

## 当前实现与验证增量

- 精确直接依赖现为 React `19.2.8`、React DOM `19.2.8`、Zod `4.5.4`；Electron `44.1.1`、electron-vite `5.0.0`、Vite `7.3.6`、TypeScript `5.9.3`、Vitest `4.1.11` 等开发依赖均由 lockfile 精确固定。
- 助手持久字段仅含 F1 所需 ID、名称、创建/更新/归档时间和版本；singleton state 保存 primary/current ID 与 state revision。永久删除未实现，archive 受 trigger 与事务 invariant 保护。
- IPC 只有 `assistant:list/create/switch/rename/set-primary/archive`；preload 不加载 Zod，main 对所有 unknown 输入执行 strict `safeParse`，错误返回随机 correlation ID 且不泄露底层 SQLite/stack。
- 测试覆盖 strict unknown/protocol/UUID/name、SQL 字符串、stale/concurrent、primary/archive、事务 rollback、schema guard、不可用路径、E2E root/marker、CSP/navigation/popup/permission、React 文本转义和真实两 PID restart。
- `npm ci` 不会自动安装 Electron 二进制；锁定包提供的 `npm exec install-electron` 是 clean restore 的显式第二步。随后 `npm run verify` 已通过。
- 不改变 task 002 的限定资格；task 003、Provider/记忆/事项/提醒、`PACKAGED`、发布和所有真实个人数据仍未运行。

## 历史详细设计与集中决议（2026-09-02，保留）

""",
    },
    {
        "path": ROOT / "doc" / "tasks" / "001-project-foundation.md",
        "prehash": "a187a2ca25ce7a54dbed343cbd8f0c9897c6a6001c040b79b78678a999958818",
        "prefix": """# 001 Mashiro 工程基线与最小闭环

> 状态：F1 CANDIDATE IMPLEMENTED / EXECUTOR VERIFICATION GREEN / MANDATORY-FRESH REVIEW PENDING
> 2026-09-03 当前事实优先；下方保留原始 DRAFT/未授权基线作为历史，不代表候选现状。

## CURRENT CANDIDATE

- `D:\\Mashiro` 已是 `main` Git 工作树；基线 HEAD `92a6dd9ccd086192f5f1213ab4030bc5b0a2c3a1` 之后的已知 Attempt-2～5 partial 构成当前 F1 candidate changeset。index 会在 Executor 显式盘点后形成 candidate commit；本文件不冒充 Reviewer PASS。
- Electron＋TypeScript＋React 基线、精确 manifest/lockfile、main/preload/renderer、助手 service/repository/schema、SQLite、六通道 IPC、data-root、中文 AssistantPanel 和真实 Electron harness 均已建立。
- `npm run test:focused` 与 `npm test`：10 个测试文件、16 个测试通过；typecheck/lint/format/build 通过。clean `npm ci` 后显式 `npm exec install-electron`，再运行完整 `npm run verify` 通过。
- 最近完整 harness：Electron `44.1.1`、内嵌 Node `24.19.0`、SQLite `3.53.3`，seed/verify 两个不同 browser PID，重启后同一 stable ID、名称、primary/current/archive 状态和 revision 7。
- remotes 保持 `github`/`gitee` 的已冻结 URL；Executor 没有 push。后续必须 fresh Reviewer →（如需）Repair/Re-review → Closer →（若 closing commit）fresh Final Reviewer，最终只推送明确 reviewed HEAD。
- task 002 的限定 Reviewer PASS 不扩展为 `PACKAGED`；Provider task 003、真实凭据/个人数据、安装器、迁移、Release、部署均未运行。Toolhelp32 `-003` 历史失败保留、deferred、non-blocking，未创建 `-004`。

## HISTORICAL INITIALIZATION CONTRACT（2026-09-02，保留）

""",
    },
    {
        "path": ROOT / "doc" / "tasks" / "002-node-sqlite-qualification.md",
        "prehash": "3602f4812d0ffe73f4a45f1c2c3be1a5cec33458afbac5d22e5e0dfbab07f27b",
        "prefix": """# 002 Electron 内嵌 `node:sqlite` 资格验证

> 状态：COMPLETED / QUALIFIED / INDEPENDENT REVIEW PASS（限定范围不变）
> 2026-09-03 注：F1 候选已在同一 Electron `44.1.1`／内嵌 Node `24.19.0`／SQLite `3.53.3` 主进程边界上实现并通过独立两 PID 生命周期 harness。该产品验证不修改、重跑或扩大本任务的历史资格结论。

## F1 使用边界

- 当前 F1 使用 `node:sqlite` 完成助手 schema、事务 rollback、版本/trigger guard 和关闭重启恢复；这些证据归 F1 candidate，不回写为本任务 002 的新资格范围。
- `PACKAGED`、安装器、自定义安装目录、升级/卸载、迁移、多实例、崩溃恢复和更大负载继续为 **NOT RUN**。
- 本任务原始失败、repair、ACL 和独立 Reviewer 证据全部保留；没有重跑 Toolhelp32 `-003` 辅助审计，也没有创建 `-004`。

## 历史资格记录（原文保留）

""",
    },
    {
        "path": ROOT / "doc" / "tasks" / "003-provider-live-qualification.md",
        "prehash": "14001fc72bfaa839f47e57eb8ef787dd1a912399e324f23a2282231644333a4b",
        "prefix": """# 003 真实 Provider 能力资格验证

> 当前状态：DEFERRED / NOT RUN / NON-BLOCKING FOR F1
> 2026-09-03 注：F1 continuation 只授权本地助手身份与 SQLite 生命周期，不授权 Provider endpoint、credential、预算或个人数据。没有 Provider 调用，也没有把本任务变成 F1 前置门禁。

## 当前边界

- 本任务仍需未来独立授权的精确 endpoint、协议、模型、预算和纯合成发送范围；当前缺少这些输入是预期 deferred 状态，不是 F1 产品 BLOCKED。
- F1 没有创建 Provider client/scaffolding、没有读取凭据或真实个人数据，也没有用本地 mock 冒充 `LIVE_VERIFIED`。
- 下方原始任务契约完整保留；其 `WAITING FOR SEPARATE AUTHORIZATION` 只约束未来执行本任务 003，不回滚已获授权的 F1 本地实现。

## 历史 Provider 资格合同（原文保留）

""",
    },
    {
        "path": ROOT / "doc" / "tasks" / "progress.md",
        "prehash": "a3d1551fe8ad6c4d10cd41325503edacb34fd34a7e519fdf4fef0fcbc0514fe4",
        "prefix": """# progress.md — 当前状态

> 当前阶段：F1 IMPLEMENTED CANDIDATE / EXECUTOR VERIFICATION GREEN / MANDATORY-FRESH REVIEW PENDING
> 当前更新：2026-09-03。下方旧“未初始化／未授权”内容作为 2026-09-02 历史接管快照保留，不是当前行动边界。

## 当前接管摘要

- PROGRAM：`MASHIRO-CONTINUOUS-DEVELOPMENT`；route `foundation-f1-electron-sqlite-v1`；Attempt-5 采用 Zod-free shared channel module 修复 sandbox preload 的外部 `require("zod")` first bad state。
- Git baseline：`main`、HEAD `92a6dd9ccd086192f5f1213ab4030bc5b0a2c3a1`、tree `f086cc7da02bcc0d0009982a3b6bdd2201fbb241`；当前 changeset 是已知 Attempt-2～5 partial 与 v3.1 skill migration，不是未知用户改动。remotes 已配置；candidate 尚未 push。
- 产品：本地助手 create/switch/rename/set-primary/archive，stable UUID，strict Zod trusted validation，六窄 IPC，sandbox preload，SQLite v1/事务/guard，仓库外 data root，中文 React panel。
- 验证：10 个 test files／16 tests；focused/full/typecheck/lint/format/build 全部 exit 0。clean `npm ci` exit 0、package/lock hash 不变；显式 `npm exec install-electron` exit 0；随后完整 `npm run verify` exit 0。
- 最新 clean-verify Electron：runId `5ca3051a-1577-42c9-bf90-8031169f9377`；browser PID `483360` 与 `498460`；Electron `44.1.1`、Node `24.19.0`、SQLite `3.53.3`；restart snapshot 相同，revision 7，一个 archived `Mashiro` 与一个 active/primary/current `雪`。
- foundation validator `ok=true`；原 AGENTS 五项结构 warning 已通过本次结构化文档更新修复并需在 candidate 上复跑。secret/generated/runtime-data/writer-residual 检查、最终 Git diff 和 candidate commit 仍由本 Executor 收口。
- 下一动作：显式 staging → candidate commit → mandatory-fresh Reviewer。Executor 不判 PASS、不 push；Reviewer verdict 决定 Repair/Replan/Closer。

## 保持的延期与 NOT RUN

- task 002 维持限定 `QUALIFIED / REVIEW PASS`；`PACKAGED`、安装器、迁移、多实例、崩溃恢复仍 **NOT RUN**。
- task 003 Provider 保持 **DEFERRED / NOT RUN / NON-BLOCKING**；没有 endpoint、credential、预算、调用或个人数据读取。
- Toolhelp32 `-003` 辅助审计保持 historical failed/deferred/non-blocking；未重跑，未创建 `-004`。Attempt-1～5 的 route failure 与 writer rollback/repair 证据均保留。

## 历史接管快照（2026-09-02，保留）

""",
    },
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_new(path: Path, data: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(fd)


def allowed_parent(path: Path) -> bool:
    return path.parent in {ROOT, ROOT / "doc", ROOT / "doc" / "tasks"}


def main() -> int:
    if ROOT.resolve(strict=True) != ROOT:
        raise RuntimeError("canonical root mismatch")
    staged: list[dict[str, object]] = []
    installed: list[dict[str, object]] = []
    rollback = "not-required"
    evidence = []
    try:
        for spec in SPECS:
            target = spec["path"]
            assert isinstance(target, Path)
            canonical = target.resolve(strict=True)
            if canonical != target or not allowed_parent(canonical):
                raise RuntimeError(f"target outside fixed allowlist: {canonical}")
            info = canonical.lstat()
            if stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400):
                raise RuntimeError(f"target is symlink or reparse point: {canonical}")
            original = canonical.read_bytes()
            if sha(original) != spec["prehash"]:
                raise RuntimeError(f"preimage mismatch {canonical}: {sha(original)}")
            if original.startswith(b"\xef\xbb\xbf") or b"\r\n" in original or not original.endswith(b"\n"):
                raise RuntimeError(f"unexpected UTF-8/newline profile: {canonical}")
            old_text = original.decode("utf-8")
            counts = []
            if "whole" in spec:
                counts.append(old_text.count(old_text))
                new_text = spec["whole"]
            elif "prefix" in spec:
                title = old_text.split("\n", 1)[0] + "\n\n"
                counts.append(old_text.count(title))
                if counts[-1] != 1:
                    raise RuntimeError(f"title match count {counts[-1]}: {canonical}")
                new_text = old_text.replace(title, spec["prefix"], 1)
            else:
                new_text = old_text
                for old, new in spec["transforms"]:
                    count = new_text.count(old)
                    counts.append(count)
                    if count != 1:
                        raise RuntimeError(f"match count {count}: {canonical}")
                    new_text = new_text.replace(old, new, 1)
            if counts != [1] * len(counts):
                raise RuntimeError(f"unexpected match counts {counts}: {canonical}")
            post = new_text.encode("utf-8")
            if post.startswith(b"\xef\xbb\xbf") or b"\r\n" in post or not post.endswith(b"\n"):
                raise RuntimeError(f"postimage profile mismatch: {canonical}")
            token = uuid.uuid4().hex
            temp = canonical.with_name(f".codex-temp-attempt5-{token}-{canonical.name}")
            backup = canonical.with_name(
                f".codex-backup-attempt5-{spec['prehash']}-{token}-{canonical.name}"
            )
            create_new(temp, post)
            create_new(backup, original)
            if temp.read_bytes() != post or sha(backup.read_bytes()) != spec["prehash"]:
                raise RuntimeError(f"staging verification failed: {canonical}")
            staged.append({"target": canonical, "temp": temp, "backup": backup,
                           "original": original, "post": post, "counts": counts,
                           "prehash": spec["prehash"], "old_text": old_text, "new_text": new_text})
        for item in staged:
            os.replace(item["temp"], item["target"])
            installed.append(item)
            if Path(item["target"]).read_bytes() != item["post"]:
                raise RuntimeError(f"postcondition failed: {item['target']}")
            evidence.append({"target": str(item["target"]), "preimage_sha256": item["prehash"],
                             "postimage_sha256": sha(item["post"]), "match_counts": item["counts"],
                             "diff": "".join(difflib.unified_diff(item["old_text"].splitlines(keepends=True), item["new_text"].splitlines(keepends=True)))})
    except Exception:
        rollback = "required"
        for item in reversed(installed):
            backup = Path(item["backup"])
            target = Path(item["target"])
            if backup.exists() and sha(backup.read_bytes()) == item["prehash"]:
                os.replace(backup, target)
                if sha(target.read_bytes()) != item["prehash"]:
                    rollback = "failed"
        raise
    finally:
        if rollback != "failed":
            for item in staged:
                for key in ("temp", "backup"):
                    path = Path(item[key])
                    if path.exists():
                        path.unlink()
    residuals = [str(path) for item in staged for path in (Path(item["temp"]), Path(item["backup"])) if path.exists()]
    if residuals:
        raise RuntimeError(f"writer residuals: {residuals}")
    print(json.dumps({"rollback": rollback, "residuals": residuals, "files": evidence}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"attempt5 documentation writer failed: {error}", file=sys.stderr)
        raise

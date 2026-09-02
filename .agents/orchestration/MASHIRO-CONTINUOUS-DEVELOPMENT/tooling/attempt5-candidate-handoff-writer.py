from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
import uuid
from pathlib import Path


ROOT = Path(r"D:\Mashiro")
SPECS = (
    (
        ROOT / "doc" / "tasks" / "001-project-foundation.md",
        "118e4fa12a64bc2e641418b6358ab7fa625f886b7fb3cdb1f6509bf9b80445ab",
        (
            (
                "index 会在 Executor 显式盘点后形成 candidate commit；本文件不冒充 Reviewer PASS。",
                "candidate 已由 Executor 显式盘点并提交；本文件不冒充 Reviewer PASS。",
            ),
        ),
    ),
    (
        ROOT / "doc" / "tasks" / "progress.md",
        "9c22f6bf323c3a9a70abc23eadd254b9315812beb25ca11dcf4c7c36c9897f03",
        (
            (
                "secret/generated/runtime-data/writer-residual 检查、最终 Git diff 和 candidate commit 仍由本 Executor 收口。",
                "secret/generated/runtime-data/writer-residual 检查与最终 Git diff 均已完成；candidate 已由 Executor 显式 staging 并提交。",
            ),
            (
                "下一动作：显式 staging → candidate commit → mandatory-fresh Reviewer。",
                "下一动作：mandatory-fresh Reviewer 独立复核精确 candidate HEAD。",
            ),
        ),
    ),
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


def main() -> int:
    if ROOT.resolve(strict=True) != ROOT:
        raise RuntimeError("canonical root mismatch")
    staged = []
    installed = []
    rollback = "not-required"
    evidence = []
    try:
        for target, prehash, transforms in SPECS:
            canonical = target.resolve(strict=True)
            if canonical != target or canonical.parent != ROOT / "doc" / "tasks":
                raise RuntimeError(f"outside fixed allowlist: {canonical}")
            info = canonical.lstat()
            if stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400):
                raise RuntimeError(f"symlink/reparse target: {canonical}")
            original = canonical.read_bytes()
            if sha(original) != prehash:
                raise RuntimeError(f"preimage mismatch {canonical}: {sha(original)}")
            if original.startswith(b"\xef\xbb\xbf") or b"\r\n" in original or not original.endswith(b"\n"):
                raise RuntimeError(f"unexpected source profile: {canonical}")
            text = original.decode("utf-8")
            post_text = text
            counts = []
            for old, new in transforms:
                count = post_text.count(old)
                counts.append(count)
                if count != 1:
                    raise RuntimeError(f"match count {count}: {canonical}")
                post_text = post_text.replace(old, new, 1)
            post = post_text.encode("utf-8")
            token = uuid.uuid4().hex
            temp = canonical.with_name(f".codex-temp-attempt5-{token}-{canonical.name}")
            backup = canonical.with_name(f".codex-backup-attempt5-{prehash}-{token}-{canonical.name}")
            create_new(temp, post)
            create_new(backup, original)
            if temp.read_bytes() != post or sha(backup.read_bytes()) != prehash:
                raise RuntimeError(f"staging verification failed: {canonical}")
            staged.append({"target": canonical, "temp": temp, "backup": backup, "prehash": prehash,
                           "original": original, "post": post, "counts": counts})
        for item in staged:
            os.replace(item["temp"], item["target"])
            installed.append(item)
            if Path(item["target"]).read_bytes() != item["post"]:
                raise RuntimeError(f"postcondition failed: {item['target']}")
            evidence.append({"target": str(item["target"]), "preimage_sha256": item["prehash"],
                             "postimage_sha256": sha(item["post"]), "match_counts": item["counts"]})
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
        raise RuntimeError(f"residuals: {residuals}")
    print(json.dumps({"rollback": rollback, "residuals": residuals, "files": evidence}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"attempt5 candidate handoff writer failed: {error}", file=sys.stderr)
        raise

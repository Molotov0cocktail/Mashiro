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
TARGET = ROOT / "tests" / "integration" / "security-failure-atomicity.test.ts"
PREHASH = "b420957a5fe690a41a88e42c3bf7e1b8f600cb3b9dee1c17a03ceb732a7fa4e5"
OLD = """    const second = service.create({ protocolVersion: 1, displayName: 'B', expectedStateRevision: 1 })
"""
NEW = """    const second = service.create({
      protocolVersion: 1,
      displayName: 'B',
      expectedStateRevision: 1
    })
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_new(path: Path, data: bytes) -> None:
    descriptor = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0),
        0o600,
    )
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(descriptor)


def main() -> int:
    if ROOT.resolve(strict=True) != ROOT or TARGET.resolve(strict=True) != TARGET:
        raise RuntimeError("canonical path mismatch")
    if TARGET.parent != ROOT / "tests" / "integration":
        raise RuntimeError("target outside fixed allowlist")
    info = TARGET.lstat()
    if stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400):
        raise RuntimeError("target is a symlink or reparse point")
    original = TARGET.read_bytes()
    if sha(original) != PREHASH:
        raise RuntimeError(f"preimage mismatch: {sha(original)}")
    if original.startswith(b"\xef\xbb\xbf") or b"\r\n" in original or not original.endswith(b"\n"):
        raise RuntimeError("unexpected source encoding/newlines")
    text = original.decode("utf-8")
    count = text.count(OLD)
    if count != 1:
        raise RuntimeError(f"match count {count}, expected 1")
    post_text = text.replace(OLD, NEW, 1)
    post = post_text.encode("utf-8")
    token = uuid.uuid4().hex
    temporary = TARGET.with_name(f".codex-temp-attempt5-{token}-{TARGET.name}")
    backup = TARGET.with_name(f".codex-backup-attempt5-{PREHASH}-{token}-{TARGET.name}")
    installed = False
    rollback = "not-required"
    try:
        create_new(temporary, post)
        create_new(backup, original)
        if temporary.read_bytes() != post or sha(backup.read_bytes()) != PREHASH:
            raise RuntimeError("staged content verification failed")
        os.replace(temporary, TARGET)
        installed = True
        if TARGET.read_bytes() != post:
            raise RuntimeError("postcondition failed")
    except Exception:
        rollback = "required"
        if installed and backup.exists():
            os.replace(backup, TARGET)
            if sha(TARGET.read_bytes()) != PREHASH:
                rollback = "failed"
        raise
    finally:
        if rollback != "failed":
            for path in (temporary, backup):
                if path.exists():
                    path.unlink()
    residuals = [str(path) for path in (temporary, backup) if path.exists()]
    if residuals:
        raise RuntimeError(f"residuals: {residuals}")
    print(json.dumps({
        "target": str(TARGET),
        "preimage_sha256": PREHASH,
        "postimage_sha256": sha(post),
        "match_count": count,
        "rollback": rollback,
        "residuals": residuals,
        "diff": "".join(difflib.unified_diff(text.splitlines(keepends=True), post_text.splitlines(keepends=True))),
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"attempt5 format writer failed: {error}", file=sys.stderr)
        raise

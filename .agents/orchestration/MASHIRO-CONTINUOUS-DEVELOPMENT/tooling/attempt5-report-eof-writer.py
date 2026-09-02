from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
import uuid
from pathlib import Path


ROOT = Path(r"D:\Mashiro")
TARGET = ROOT / ".agents" / "orchestration" / "MASHIRO-CONTINUOUS-DEVELOPMENT" / "f1-executor-report-attempt-3.md"
PREHASH = "2d739696b67ff1bcd6bf9cf73feb77fd29e883894a9de35190390d14464c8108"
OLD = "- USER_GATE: NONE.\n\n"
NEW = "- USER_GATE: NONE.\n"


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
    canonical = TARGET.resolve(strict=True)
    allowed = ROOT / ".agents" / "orchestration" / "MASHIRO-CONTINUOUS-DEVELOPMENT"
    if ROOT.resolve(strict=True) != ROOT or canonical != TARGET or canonical.parent != allowed:
        raise RuntimeError("canonical allowlist mismatch")
    info = canonical.lstat()
    if stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400):
        raise RuntimeError("symlink/reparse target")
    original = canonical.read_bytes()
    if sha(original) != PREHASH:
        raise RuntimeError(f"preimage mismatch: {sha(original)}")
    if original.startswith(b"\xef\xbb\xbf") or b"\r\n" in original or not original.endswith(b"\n"):
        raise RuntimeError("unexpected source profile")
    text = original.decode("utf-8")
    count = text.count(OLD)
    if count != 1 or not text.endswith(OLD):
        raise RuntimeError(f"exact EOF match failed: {count}")
    transformed = (text[: -len(OLD)] + NEW).encode("utf-8")
    token = uuid.uuid4().hex
    temporary = canonical.with_name(f".codex-temp-attempt5-{token}-{canonical.name}")
    backup = canonical.with_name(f".codex-backup-attempt5-{PREHASH}-{token}-{canonical.name}")
    installed = False
    rollback = "not-required"
    try:
        create_new(temporary, transformed)
        create_new(backup, original)
        if temporary.read_bytes() != transformed or sha(backup.read_bytes()) != PREHASH:
            raise RuntimeError("staging verification failed")
        os.replace(temporary, canonical)
        installed = True
        if canonical.read_bytes() != transformed:
            raise RuntimeError("postcondition failed")
    except Exception:
        rollback = "required"
        if installed and backup.exists():
            os.replace(backup, canonical)
            if sha(canonical.read_bytes()) != PREHASH:
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
    print(json.dumps({"target": str(canonical), "preimage_sha256": PREHASH,
                      "postimage_sha256": sha(transformed), "match_count": count,
                      "rollback": rollback, "residuals": residuals,
                      "diff": "removed one extra LF at EOF; semantic content unchanged"}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"attempt5 report EOF writer failed: {error}", file=sys.stderr)
        raise

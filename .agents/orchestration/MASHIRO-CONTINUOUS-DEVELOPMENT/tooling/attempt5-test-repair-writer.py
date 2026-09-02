from __future__ import annotations

import difflib
import hashlib
import json
import os
import stat
import sys
import uuid
from pathlib import Path


PROJECT_ROOT = Path(r"D:\Mashiro")
TARGET = PROJECT_ROOT / "tests" / "integration" / "security-failure-atomicity.test.ts"
PREIMAGE_SHA256 = "6407c56e2ef097b41fd04a34006a62d3b6af7bb39ec611c057a888268ded6333"
OLD = """      (database: DatabaseSync) => database.exec('CREATE TABLE foreign_object(value TEXT)'),
      (database: DatabaseSync) => {
        database.close()
      }
"""
NEW = """      (database: DatabaseSync) => database.exec('CREATE TABLE foreign_object(value TEXT)')
"""
OLD_CLOSE = "      if (database.isOpen) database.close()"
NEW_CLOSE = "      database.close()"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_new(path: Path, data: bytes) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    descriptor = os.open(path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(descriptor)


def main() -> int:
    canonical_root = PROJECT_ROOT.resolve(strict=True)
    canonical_target = TARGET.resolve(strict=True)
    if canonical_root != PROJECT_ROOT or canonical_target != TARGET:
        raise RuntimeError("canonical path mismatch")
    if canonical_target.parent != PROJECT_ROOT / "tests" / "integration":
        raise RuntimeError("target outside fixed allowlist")
    metadata = canonical_target.lstat()
    if stat.S_ISLNK(metadata.st_mode) or bool(getattr(metadata, "st_file_attributes", 0) & 0x400):
        raise RuntimeError("target is a symlink or reparse point")

    original = canonical_target.read_bytes()
    if digest(original) != PREIMAGE_SHA256:
        raise RuntimeError(f"preimage mismatch: {digest(original)}")
    if original.startswith(b"\xef\xbb\xbf") or b"\r\n" in original or not original.endswith(b"\n"):
        raise RuntimeError("unexpected encoding or newline profile")
    text = original.decode("utf-8")
    match_counts = {"invalid-empty-case": text.count(OLD), "close": text.count(OLD_CLOSE)}
    if match_counts != {"invalid-empty-case": 1, "close": 1}:
        raise RuntimeError(f"unexpected match counts: {match_counts}")
    transformed_text = text.replace(OLD, NEW, 1).replace(OLD_CLOSE, NEW_CLOSE, 1)
    transformed = transformed_text.encode("utf-8")
    if transformed.startswith(b"\xef\xbb\xbf") or b"\r\n" in transformed or not transformed.endswith(b"\n"):
        raise RuntimeError("postimage encoding or newline mismatch")

    token = uuid.uuid4().hex
    temporary = canonical_target.with_name(f".codex-temp-attempt5-{token}-{canonical_target.name}")
    backup = canonical_target.with_name(
        f".codex-backup-attempt5-{PREIMAGE_SHA256}-{token}-{canonical_target.name}"
    )
    rollback = "not-required"
    installed = False
    try:
        create_new(temporary, transformed)
        create_new(backup, original)
        if temporary.read_bytes() != transformed or digest(backup.read_bytes()) != PREIMAGE_SHA256:
            raise RuntimeError("temporary or backup verification failed")
        os.replace(temporary, canonical_target)
        installed = True
        if canonical_target.read_bytes() != transformed:
            raise RuntimeError("postcondition failed")
    except Exception:
        rollback = "required"
        if installed and backup.exists():
            os.replace(backup, canonical_target)
            if digest(canonical_target.read_bytes()) != PREIMAGE_SHA256:
                rollback = "failed"
        raise
    finally:
        if rollback != "failed":
            for artifact in (temporary, backup):
                if artifact.exists():
                    artifact.unlink()

    residuals = [str(path) for path in (temporary, backup) if path.exists()]
    if residuals:
        raise RuntimeError(f"writer residuals: {residuals}")
    print(
        json.dumps(
            {
                "target": str(canonical_target),
                "preimage_sha256": PREIMAGE_SHA256,
                "postimage_sha256": digest(transformed),
                "match_counts": match_counts,
                "rollback": rollback,
                "residuals": residuals,
                "diff": "".join(
                    difflib.unified_diff(
                        text.splitlines(keepends=True),
                        transformed_text.splitlines(keepends=True),
                        fromfile=str(backup),
                        tofile=str(canonical_target),
                    )
                ),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"attempt5 test repair writer failed: {error}", file=sys.stderr)
        raise

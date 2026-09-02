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
TARGET = ROOT / "tests" / "unit" / "window-security.test.ts"
PREHASH = "c4aabccfd08ae3bc430f72d0b8e2cabeb79e2a1f244bf4ae478f6640ffe3d528"
TRANSFORMS = (
    (
        "  const BrowserWindow = vi.fn(function FakeBrowserWindow(_options: unknown) {\n    return window\n",
        "  const BrowserWindow = vi.fn(function FakeBrowserWindow(options: unknown) {\n    void options\n    return window\n",
    ),
    ("    expect(html).toContain('default-src \\'self\\'')", "    expect(html).toContain(\"default-src 'self'\")"),
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
    if ROOT.resolve(strict=True) != ROOT or TARGET.resolve(strict=True) != TARGET:
        raise RuntimeError("canonical path mismatch")
    if TARGET.parent != ROOT / "tests" / "unit":
        raise RuntimeError("outside fixed allowlist")
    info = TARGET.lstat()
    if stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400):
        raise RuntimeError("symlink or reparse target")
    original = TARGET.read_bytes()
    if sha(original) != PREHASH:
        raise RuntimeError(f"preimage mismatch: {sha(original)}")
    if original.startswith(b"\xef\xbb\xbf") or b"\r\n" in original or not original.endswith(b"\n"):
        raise RuntimeError("unexpected source profile")
    old_text = original.decode("utf-8")
    new_text = old_text
    counts = []
    for old, new in TRANSFORMS:
        count = new_text.count(old)
        counts.append(count)
        if count != 1:
            raise RuntimeError(f"match count {count}, expected 1")
        new_text = new_text.replace(old, new, 1)
    post = new_text.encode("utf-8")
    token = uuid.uuid4().hex
    temp = TARGET.with_name(f".codex-temp-attempt5-{token}-{TARGET.name}")
    backup = TARGET.with_name(f".codex-backup-attempt5-{PREHASH}-{token}-{TARGET.name}")
    installed = False
    rollback = "not-required"
    try:
        create_new(temp, post)
        create_new(backup, original)
        if temp.read_bytes() != post or sha(backup.read_bytes()) != PREHASH:
            raise RuntimeError("staging verification failed")
        os.replace(temp, TARGET)
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
            for path in (temp, backup):
                if path.exists():
                    path.unlink()
    residuals = [str(path) for path in (temp, backup) if path.exists()]
    if residuals:
        raise RuntimeError(f"residuals: {residuals}")
    print(json.dumps({"target": str(TARGET), "preimage_sha256": PREHASH,
                      "postimage_sha256": sha(post), "match_counts": counts,
                      "rollback": rollback, "residuals": residuals,
                      "diff": "".join(difflib.unified_diff(old_text.splitlines(keepends=True), new_text.splitlines(keepends=True)))}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"attempt5 window lint writer failed: {error}", file=sys.stderr)
        raise

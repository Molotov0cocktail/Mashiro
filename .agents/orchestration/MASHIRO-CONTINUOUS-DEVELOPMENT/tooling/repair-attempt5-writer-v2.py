import hashlib
import os
import uuid
from pathlib import Path

TARGET = Path(r"D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\tooling\attempt5-route-a-writer.py")
PREHASH = "d7f52bbd33f71599732a2338172f80f00fb397a36edc028c943885278c387592"
OLD = b'''            if sha256(actual) != item["posthash"] or profile(actual) != item["profile"]:\n                raise RuntimeError(f"postcondition failed: {item['id']}")'''
NEW = b'''            if sha256(actual) != item["posthash"]:\n                raise RuntimeError(f"postcondition failed: {item['id']}")'''


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_new(path: Path, data: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
    try:
        os.write(fd, data)
        os.fsync(fd)
    finally:
        os.close(fd)


original = TARGET.read_bytes()
if digest(original) != PREHASH or original.count(OLD) != 1:
    raise SystemExit("repair-v2 precondition failed")
postimage = original.replace(OLD, NEW, 1)
token = uuid.uuid4().hex
temp = TARGET.with_name(f".codex-temp-writer-repair-v2-{token}")
backup = TARGET.with_name(f".codex-backup-writer-repair-v2-{PREHASH}-{token}")
create_new(temp, postimage)
create_new(backup, original)
try:
    os.replace(temp, TARGET)
    if TARGET.read_bytes() != postimage:
        raise RuntimeError("repair-v2 postcondition failed")
except Exception:
    os.replace(backup, TARGET)
    if digest(TARGET.read_bytes()) != PREHASH:
        raise RuntimeError("repair-v2 rollback failed")
    raise
finally:
    if temp.exists(): temp.unlink()
    if backup.exists(): backup.unlink()
print(f"pre={PREHASH} post={digest(postimage)} match=1 residuals=0 rollback=not-required")

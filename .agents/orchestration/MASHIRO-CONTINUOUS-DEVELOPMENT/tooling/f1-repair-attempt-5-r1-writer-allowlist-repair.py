import hashlib
import os
import stat
import uuid
from pathlib import Path


TARGET = Path(
    r"D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\tooling\f1-repair-attempt-5-r1-writer.py"
)
PREHASH = "6896a14110ff650d465f9417404d990e730de8a4fd004790f496f43fcbf73138"
OLD = b'''    allowed = {
        SCRIPT_RELATIVE,
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-executor-report-attempt-5.md",
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-candidate-review-attempt-5.md",
    }'''
NEW = b'''    allowed = {
        SCRIPT_RELATIVE,
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tooling/f1-repair-attempt-5-r1-writer-escape-repair.py",
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/tooling/f1-repair-attempt-5-r1-writer-allowlist-repair.py",
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-executor-report-attempt-5.md",
        ".agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/f1-candidate-review-attempt-5.md",
    }'''


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_new(path: Path, data: bytes) -> None:
    descriptor = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0),
        0o600,
    )
    try:
        offset = 0
        while offset < len(data):
            offset += os.write(descriptor, data[offset:])
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


canonical = TARGET.resolve(strict=True)
item = TARGET.lstat()
if canonical != TARGET or stat.S_ISLNK(item.st_mode) or not stat.S_ISREG(item.st_mode):
    raise SystemExit("allowlist repair target guard failed")
if getattr(item, "st_file_attributes", 0) & getattr(
    stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400
):
    raise SystemExit("allowlist repair refuses reparse target")
original = TARGET.read_bytes()
observed = original.count(OLD)
if digest(original) != PREHASH or observed != 1:
    raise SystemExit(f"allowlist repair precondition failed match={observed}")
postimage = original.replace(OLD, NEW, 1)
token = uuid.uuid4().hex
temp = TARGET.with_name(f".codex-temp-f1-repair-allowlist-{token}")
backup = TARGET.with_name(f".codex-backup-f1-repair-allowlist-{PREHASH}-{token}")
create_new(temp, postimage)
create_new(backup, original)
if temp.read_bytes() != postimage or digest(backup.read_bytes()) != PREHASH:
    raise SystemExit("allowlist repair staging failed")
try:
    os.replace(temp, TARGET)
    if TARGET.read_bytes() != postimage:
        raise RuntimeError("allowlist repair postcondition failed")
except Exception:
    os.replace(backup, TARGET)
    if digest(TARGET.read_bytes()) != PREHASH:
        raise RuntimeError("allowlist repair rollback failed")
    raise
finally:
    if temp.exists():
        temp.unlink()
    if backup.exists():
        backup.unlink()
print(
    f"pre={PREHASH} post={digest(postimage)} match={observed} "
    "rollback=not-required residuals=0"
)

import hashlib
import os
import stat
import uuid
from pathlib import Path


TARGET = Path(
    r"D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\f1-candidate-review-attempt-5.md"
)
PREHASH = "96f4a75197f50164419ac45833ec7c92e9882458f791b90db10dbe9e95c06a15"
OLD = b"  \n"
NEW = b"\n"
EXPECTED = 5


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


item = TARGET.lstat()
if TARGET.resolve(strict=True) != TARGET or stat.S_ISLNK(item.st_mode) or not stat.S_ISREG(item.st_mode):
    raise SystemExit("review whitespace target guard failed")
if getattr(item, "st_file_attributes", 0) & getattr(
    stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400
):
    raise SystemExit("review whitespace reparse guard failed")
original = TARGET.read_bytes()
observed = original.count(OLD)
if digest(original) != PREHASH or observed != EXPECTED:
    raise SystemExit(f"review whitespace precondition failed match={observed}")
postimage = original.replace(OLD, NEW, EXPECTED)
if (
    original.startswith(b"\xef\xbb\xbf")
    or b"\r" in original
    or not original.endswith(b"\n")
    or postimage.startswith(b"\xef\xbb\xbf")
    or b"\r" in postimage
    or not postimage.endswith(b"\n")
):
    raise SystemExit("review whitespace profile guard failed")
token = uuid.uuid4().hex
temp = TARGET.with_name(f".codex-temp-f1-review-whitespace-{token}")
backup = TARGET.with_name(f".codex-backup-f1-review-whitespace-{PREHASH}-{token}")
create_new(temp, postimage)
create_new(backup, original)
if temp.read_bytes() != postimage or digest(backup.read_bytes()) != PREHASH:
    raise SystemExit("review whitespace staging failed")
try:
    os.replace(temp, TARGET)
    if TARGET.read_bytes() != postimage:
        raise RuntimeError("review whitespace postcondition failed")
except Exception:
    os.replace(backup, TARGET)
    if digest(TARGET.read_bytes()) != PREHASH:
        raise RuntimeError("review whitespace rollback failed")
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

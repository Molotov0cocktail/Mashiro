import hashlib
import os
import stat
import uuid
from pathlib import Path


TARGET = Path(r"D:\Mashiro\tests\integration\ipc-registration.test.ts")
PREHASH = "1bedc8c4639eb0cd2ac67b98e42b738570cbc6e1b6fc3f7c0e1ac9f7cdfa84ca"
OLD = b"""    handle: vi.fn(
      (
        channel: string,
        listener: (_event: unknown, input: unknown) => AssistantResult
      ): void => {
        listeners.set(channel, listener)
      }
    ),"""
NEW = b"""    handle: vi.fn(
      (channel: string, listener: (_event: unknown, input: unknown) => AssistantResult): void => {
        listeners.set(channel, listener)
      }
    ),"""


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
    raise SystemExit("format target guard failed")
if getattr(item, "st_file_attributes", 0) & getattr(
    stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400
):
    raise SystemExit("format target reparse guard failed")
original = TARGET.read_bytes()
observed = original.count(OLD)
if digest(original) != PREHASH or observed != 1:
    raise SystemExit(f"format precondition failed match={observed}")
postimage = original.replace(OLD, NEW, 1)
if original.startswith(b"\xef\xbb\xbf") or b"\r" in original or not original.endswith(b"\n"):
    raise SystemExit("format preimage profile failed")
if postimage.startswith(b"\xef\xbb\xbf") or b"\r" in postimage or not postimage.endswith(b"\n"):
    raise SystemExit("format postimage profile failed")
token = uuid.uuid4().hex
temp = TARGET.with_name(f".codex-temp-f1-repair-format-{token}")
backup = TARGET.with_name(f".codex-backup-f1-repair-format-{PREHASH}-{token}")
create_new(temp, postimage)
create_new(backup, original)
if temp.read_bytes() != postimage or digest(backup.read_bytes()) != PREHASH:
    raise SystemExit("format staging failed")
try:
    os.replace(temp, TARGET)
    if TARGET.read_bytes() != postimage:
        raise RuntimeError("format postcondition failed")
except Exception:
    os.replace(backup, TARGET)
    if digest(TARGET.read_bytes()) != PREHASH:
        raise RuntimeError("format rollback failed")
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

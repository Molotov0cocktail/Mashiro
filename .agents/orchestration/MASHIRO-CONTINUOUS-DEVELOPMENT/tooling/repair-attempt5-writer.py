import hashlib
import os
import uuid
from pathlib import Path

TARGET = Path(r"D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\tooling\attempt5-route-a-writer.py")
PREHASH = "57a1abc6f58547d961e7a33fb98d9139886d0ffabb88937fcc623ddd121c00dd"
OLD = b'''            if profile(transformed) != original_profile:\n                raise RuntimeError(f"encoding/newline profile changed: {spec['id']}")'''
NEW = b'''            transformed_profile = profile(transformed)\n            if (\n                transformed_profile["bom"] != original_profile["bom"]\n                or transformed_profile["crlf"] != 0\n                or transformed_profile["final_newline"] != original_profile["final_newline"]\n            ):\n                raise RuntimeError(f"encoding/newline profile changed: {spec['id']}")'''


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
    raise SystemExit("repair precondition failed")
postimage = original.replace(OLD, NEW, 1)
token = uuid.uuid4().hex
temp = TARGET.with_name(f".codex-temp-writer-repair-{token}")
backup = TARGET.with_name(f".codex-backup-writer-repair-{PREHASH}-{token}")
create_new(temp, postimage)
create_new(backup, original)
if temp.read_bytes() != postimage or digest(backup.read_bytes()) != PREHASH:
    raise SystemExit("repair staging failed")
try:
    os.replace(temp, TARGET)
    if TARGET.read_bytes() != postimage:
        raise RuntimeError("repair postcondition failed")
except Exception:
    os.replace(backup, TARGET)
    if digest(TARGET.read_bytes()) != PREHASH:
        raise RuntimeError("repair rollback failed")
    raise
finally:
    if temp.exists():
        temp.unlink()
    if backup.exists():
        backup.unlink()
print(f"pre={PREHASH} post={digest(postimage)} match=1 residuals=0 rollback=not-required")

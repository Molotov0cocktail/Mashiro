import hashlib
import os
import stat
import uuid
from pathlib import Path


TARGET = Path(
    r"D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\tooling\f1-repair-attempt-5-r1-writer.py"
)
PREHASH = "8a65b30dc24e5d501cffcda8962ef3fccabea859f3fc02281d95bf286e580ace"
REPLACEMENTS = [
    (rb"file:\/\/\/", rb"file:\\/\\/\\/", 2),
    (
        rb"  const captured = `${stdout.join('')}\n${stderr.join('')}`",
        rb"  const captured = `${stdout.join('')}\\n${stderr.join('')}`",
        1,
    ),
    (
        rb"    /(?:^|\r?\n)\s*at\s+/u,",
        rb"    /(?:^|\\r?\\n)\\s*at\\s+/u,",
        1,
    ),
    (
        rb"    /\b(?:SQL|SQLite|SQLITE_[A-Z_]+)\b/iu",
        rb"    /\\b(?:SQL|SQLite|SQLITE_[A-Z_]+)\\b/iu",
        1,
    ),
]


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
    raise SystemExit("writer repair target guard failed")
if getattr(item, "st_file_attributes", 0) & getattr(
    stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400
):
    raise SystemExit("writer repair refuses reparse target")
original = TARGET.read_bytes()
if digest(original) != PREHASH:
    raise SystemExit("writer repair prehash mismatch")
postimage = original
counts = []
for old, new, expected in REPLACEMENTS:
    observed = postimage.count(old)
    counts.append(observed)
    if observed != expected:
        raise SystemExit(
            f"writer repair match mismatch expected={expected} observed={observed}"
        )
    postimage = postimage.replace(old, new, expected)
if postimage.startswith(b"\xef\xbb\xbf") or b"\r" in postimage:
    raise SystemExit("writer repair encoding/newline guard failed")
token = uuid.uuid4().hex
temp = TARGET.with_name(f".codex-temp-f1-repair-writer-{token}")
backup = TARGET.with_name(f".codex-backup-f1-repair-writer-{PREHASH}-{token}")
create_new(temp, postimage)
create_new(backup, original)
if temp.read_bytes() != postimage or digest(backup.read_bytes()) != PREHASH:
    raise SystemExit("writer repair staging failed")
try:
    os.replace(temp, TARGET)
    if TARGET.read_bytes() != postimage:
        raise RuntimeError("writer repair postcondition failed")
except Exception:
    os.replace(backup, TARGET)
    if digest(TARGET.read_bytes()) != PREHASH:
        raise RuntimeError("writer repair rollback failed")
    raise
finally:
    if temp.exists():
        temp.unlink()
    if backup.exists():
        backup.unlink()
print(
    f"pre={PREHASH} post={digest(postimage)} matches={counts} "
    "rollback=not-required residuals=0"
)

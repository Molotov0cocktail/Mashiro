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
LINES = (
    "> 当前状态：F1 CANDIDATE IMPLEMENTED / EXECUTOR VERIFICATION GREEN / MANDATORY-FRESH REVIEW PENDING",
    "> 当前状态：F1 CANDIDATE IMPLEMENTED / EXECUTOR VERIFICATION GREEN / REVIEW PENDING",
    "> 当前状态：F1 IMPLEMENTED CANDIDATE / EXECUTOR GREEN / FRESH REVIEW PENDING",
    "> 状态：F1 CANDIDATE IMPLEMENTED / EXECUTOR VERIFICATION GREEN / MANDATORY-FRESH REVIEW PENDING",
    "> 状态：COMPLETED / QUALIFIED / INDEPENDENT REVIEW PASS（限定范围不变）",
    "> 当前状态：DEFERRED / NOT RUN / NON-BLOCKING FOR F1",
    "> 当前阶段：F1 IMPLEMENTED CANDIDATE / EXECUTOR VERIFICATION GREEN / MANDATORY-FRESH REVIEW PENDING",
)
SPECS = (
    (ROOT / ".agents" / "orchestration" / "MASHIRO-CONTINUOUS-DEVELOPMENT" / "tooling" / "attempt5-documentation-writer.py", "cffc4b0373fd5a2b4b82e19525c7dd52b9b887030de2c74b8ebf1eeab84ea8c2", LINES),
    (ROOT / "doc" / "proposal.md", "a4a2e130f18d7a9c9fb655d8e6b2de93dc25f0d85d001d39c46cacc69b15529a", (LINES[0],)),
    (ROOT / "doc" / "high-level-design.md", "e1cbdb3a5ef397c67c3242258ead9786b2312c5e1cac15d423788c82396403b5", (LINES[1],)),
    (ROOT / "doc" / "detailed-design.md", "8927ec873f729ebd1e85e645881af78bf6a29d30b90fe76e14e7b75933170047", (LINES[2],)),
    (ROOT / "doc" / "tasks" / "001-project-foundation.md", "6ea68f43aa1e1a141662612bb3683c5658c7bb890317ef095c73d58bf5bcdf2f", (LINES[3],)),
    (ROOT / "doc" / "tasks" / "002-node-sqlite-qualification.md", "3803dff67b2f2fa25d5c915b6f2ddd9dc0952657abf529f9c8236a73b5319c76", (LINES[4],)),
    (ROOT / "doc" / "tasks" / "003-provider-live-qualification.md", "a9bfa1e8cdbdfe8908175ce8362650cd683115c997a9d41108c52d0eaa7bcb18", (LINES[5],)),
    (ROOT / "doc" / "tasks" / "progress.md", "daf4f938804c2dac3e3265278182e15f06a7e7c25558238b61cc893895001efa", (LINES[6],)),
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


def allowed(path: Path) -> bool:
    return path.parent in {
        ROOT / ".agents" / "orchestration" / "MASHIRO-CONTINUOUS-DEVELOPMENT" / "tooling",
        ROOT / "doc",
        ROOT / "doc" / "tasks",
    }


def main() -> int:
    if ROOT.resolve(strict=True) != ROOT:
        raise RuntimeError("canonical root mismatch")
    staged = []
    installed = []
    evidence = []
    rollback = "not-required"
    try:
        for target, prehash, lines in SPECS:
            canonical = target.resolve(strict=True)
            if canonical != target or not allowed(canonical):
                raise RuntimeError(f"outside fixed allowlist: {canonical}")
            info = canonical.lstat()
            if stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400):
                raise RuntimeError(f"symlink/reparse target: {canonical}")
            original = canonical.read_bytes()
            if sha(original) != prehash:
                raise RuntimeError(f"preimage mismatch {canonical}: {sha(original)}")
            if original.startswith(b"\xef\xbb\xbf") or b"\r\n" in original or not original.endswith(b"\n"):
                raise RuntimeError(f"unexpected source profile: {canonical}")
            old_text = original.decode("utf-8")
            new_text = old_text
            counts = []
            for line in lines:
                old = line + "  \n"
                new = line + "\n"
                count = new_text.count(old)
                counts.append(count)
                if count != 1:
                    raise RuntimeError(f"match count {count}: {canonical}")
                new_text = new_text.replace(old, new, 1)
            post = new_text.encode("utf-8")
            token = uuid.uuid4().hex
            temp = canonical.with_name(f".codex-temp-attempt5-{token}-{canonical.name}")
            backup = canonical.with_name(f".codex-backup-attempt5-{prehash}-{token}-{canonical.name}")
            create_new(temp, post)
            create_new(backup, original)
            if temp.read_bytes() != post or sha(backup.read_bytes()) != prehash:
                raise RuntimeError(f"staging verification failed: {canonical}")
            staged.append({"target": canonical, "prehash": prehash, "temp": temp, "backup": backup,
                           "original": original, "post": post, "counts": counts,
                           "old_text": old_text, "new_text": new_text})
        for item in staged:
            os.replace(item["temp"], item["target"])
            installed.append(item)
            if Path(item["target"]).read_bytes() != item["post"]:
                raise RuntimeError(f"postcondition failed: {item['target']}")
            evidence.append({"target": str(item["target"]), "preimage_sha256": item["prehash"],
                             "postimage_sha256": sha(item["post"]), "match_counts": item["counts"],
                             "diff": "".join(difflib.unified_diff(item["old_text"].splitlines(keepends=True), item["new_text"].splitlines(keepends=True)))})
    except Exception:
        rollback = "required"
        for item in reversed(installed):
            backup = Path(item["backup"])
            target = Path(item["target"])
            if backup.exists() and sha(backup.read_bytes()) == item["prehash"]:
                os.replace(backup, target)
                if sha(target.read_bytes()) != item["prehash"]:
                    rollback = "failed"
        raise
    finally:
        if rollback != "failed":
            for item in staged:
                for key in ("temp", "backup"):
                    path = Path(item[key])
                    if path.exists():
                        path.unlink()
    residuals = [str(path) for item in staged for path in (Path(item["temp"]), Path(item["backup"])) if path.exists()]
    if residuals:
        raise RuntimeError(f"writer residuals: {residuals}")
    print(json.dumps({"rollback": rollback, "residuals": residuals, "files": evidence}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"attempt5 documentation whitespace writer failed: {error}", file=sys.stderr)
        raise

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import stat
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(r"D:\Mashiro")
SCRIPT = ROOT / ".agents" / "orchestration" / "MASHIRO-CONTINUOUS-DEVELOPMENT" / "tooling" / "f1-closer-attempt-5-writer.py"
GIT = Path(r"D:\Git\Git\cmd\git.exe")
TARGETS = {
    "readme": ROOT / "README.md",
    "agents-root": ROOT / "AGENTS.md",
    "doc-proposal": ROOT / "doc" / "proposal.md",
    "doc-high-level": ROOT / "doc" / "high-level-design.md",
    "doc-detailed": ROOT / "doc" / "detailed-design.md",
    "task-001": ROOT / "doc" / "tasks" / "001-project-foundation.md",
    "task-002": ROOT / "doc" / "tasks" / "002-node-sqlite-qualification.md",
    "task-003": ROOT / "doc" / "tasks" / "003-provider-live-qualification.md",
    "task-progress": ROOT / "doc" / "tasks" / "progress.md",
    "round2": ROOT / ".agents" / "orchestration" / "MASHIRO-CONTINUOUS-DEVELOPMENT" / "f1-candidate-review-attempt-5-r2.md",
    "closer": ROOT / ".agents" / "orchestration" / "MASHIRO-CONTINUOUS-DEVELOPMENT" / "f1-closer-report.md",
}
DOC_IDS = (
    "readme", "agents-root", "doc-proposal", "doc-high-level", "doc-detailed",
    "task-001", "task-002", "task-003", "task-progress",
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        [str(GIT), "-c", "safe.directory=D:/Mashiro", *args],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="strict",
        capture_output=True,
        check=False,
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed {result.returncode}: {result.stderr.strip()}")
    return result


def canonical_regular(path: Path, must_exist: bool) -> None:
    parent = path.parent.resolve(strict=True)
    if parent != path.parent:
        raise RuntimeError(f"noncanonical parent: {path}")
    parent_info = path.parent.lstat()
    if stat.S_ISLNK(parent_info.st_mode) or bool(getattr(parent_info, "st_file_attributes", 0) & 0x400):
        raise RuntimeError(f"reparse parent: {path.parent}")
    if must_exist:
        resolved = path.resolve(strict=True)
        if resolved != path:
            raise RuntimeError(f"noncanonical target: {path}")
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400):
            raise RuntimeError(f"non-regular or reparse target: {path}")


def create_new(path: Path, data: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(fd)


def guard_head(expected_head: str) -> None:
    if ROOT.resolve(strict=True) != ROOT or SCRIPT.resolve(strict=True) != SCRIPT:
        raise RuntimeError("fixed root/script canonical guard failed")
    if git("branch", "--show-current").stdout.strip() != "main":
        raise RuntimeError("branch is not main")
    if git("rev-parse", "HEAD").stdout.strip() != expected_head:
        raise RuntimeError("HEAD guard failed")
    if git("diff", "--cached", "--quiet", check=False).returncode != 0:
        raise RuntimeError("index is not empty")


def modified_files() -> set[str]:
    return {line for line in git("diff", "--name-only").stdout.splitlines() if line}


def untracked_files() -> set[str]:
    return {line for line in git("ls-files", "--others", "--exclude-standard").stdout.splitlines() if line}


def docs_mode(args: argparse.Namespace) -> dict:
    guard_head(args.expected_head)
    script_rel = SCRIPT.relative_to(ROOT).as_posix()
    if modified_files() or untracked_files() != {script_rel}:
        raise RuntimeError("docs-mode opening status is not exactly the new bounded writer")
    plan_bytes = base64.b64decode(args.plan_base64, validate=True)
    if sha(plan_bytes) != args.plan_sha256:
        raise RuntimeError("plan SHA-256 mismatch")
    plan = json.loads(plan_bytes.decode("utf-8"))
    if tuple(item["target_id"] for item in plan) != DOC_IDS:
        raise RuntimeError("plan target order/allowlist mismatch")
    staged: list[dict] = []
    installed: list[dict] = []
    evidence: list[dict] = []
    rollback = "not-required"
    try:
        for item in plan:
            target_id = item["target_id"]
            target = TARGETS[target_id]
            canonical_regular(target, True)
            original = target.read_bytes()
            actual_pre = sha(original)
            if actual_pre != item["preimage_sha256"]:
                raise RuntimeError(f"preimage mismatch: {target_id}: {actual_pre}")
            if original.startswith(b"\xef\xbb\xbf") or b"\r" in original or not original.endswith(b"\n"):
                raise RuntimeError(f"encoding/newline profile mismatch: {target_id}")
            text = original.decode("utf-8", errors="strict")
            transformed = text
            counts: list[int] = []
            for transform in item["transforms"]:
                old = base64.b64decode(transform["old_b64"], validate=True).decode("utf-8")
                new = base64.b64decode(transform["new_b64"], validate=True).decode("utf-8")
                count = transformed.count(old)
                counts.append(count)
                if count != transform["expected_count"]:
                    raise RuntimeError(f"match count {count}: {target_id}")
                transformed = transformed.replace(old, new)
            post = transformed.encode("utf-8")
            if b"\r" in post or not post.endswith(b"\n"):
                raise RuntimeError(f"post newline profile mismatch: {target_id}")
            token = uuid.uuid4().hex
            temp = target.with_name(f".{target.name}.codex-temp-closer-{token}")
            backup = target.with_name(f".{target.name}.codex-backup-{actual_pre}-{token}")
            create_new(temp, post)
            create_new(backup, original)
            if temp.read_bytes() != post or sha(backup.read_bytes()) != actual_pre:
                raise RuntimeError(f"staging verification failed: {target_id}")
            staged.append({"id": target_id, "target": target, "temp": temp, "backup": backup, "pre": actual_pre, "post": post, "counts": counts})
        for entry in staged:
            if sha(entry["target"].read_bytes()) != entry["pre"]:
                raise RuntimeError(f"concurrent target change: {entry['id']}")
            os.replace(entry["temp"], entry["target"])
            installed.append(entry)
            actual_post = sha(entry["target"].read_bytes())
            if actual_post != sha(entry["post"]):
                raise RuntimeError(f"postimage mismatch: {entry['id']}")
            evidence.append({"target_id": entry["id"], "target": str(entry["target"]), "preimage_sha256": entry["pre"], "postimage_sha256": actual_post, "match_counts": entry["counts"]})
        expected = {TARGETS[target_id].relative_to(ROOT).as_posix() for target_id in DOC_IDS}
        active_backups = {entry["backup"].relative_to(ROOT).as_posix() for entry in staged if entry["backup"].exists()}
        if modified_files() != expected or untracked_files() != {script_rel} | active_backups:
            raise RuntimeError("post-write Git scope mismatch")
        check_result = git("diff", "--check", check=False)
        if check_result.returncode != 0:
            raise RuntimeError(f"git diff --check failed: {check_result.stdout}{check_result.stderr}")
    except Exception:
        rollback = "required"
        for entry in reversed(installed):
            if entry["backup"].exists() and sha(entry["backup"].read_bytes()) == entry["pre"]:
                os.replace(entry["backup"], entry["target"])
                if sha(entry["target"].read_bytes()) != entry["pre"]:
                    rollback = "failed"
        raise
    finally:
        if rollback != "failed":
            for entry in staged:
                for key in ("temp", "backup"):
                    path = entry[key]
                    if path.exists():
                        path.unlink()
    residuals = [str(p) for entry in staged for p in (entry["temp"], entry["backup"]) if p.exists()]
    if residuals:
        raise RuntimeError(f"writer residuals: {residuals}")
    return {"mode": "docs", "plan_sha256": args.plan_sha256, "rollback": rollback, "residuals": residuals, "files": evidence}


def add_mode(args: argparse.Namespace) -> dict:
    guard_head(args.expected_head)
    if args.target_id not in ("round2", "closer"):
        raise RuntimeError("add target is outside fixed allowlist")
    expected_modified = {TARGETS[target_id].relative_to(ROOT).as_posix() for target_id in DOC_IDS}
    if modified_files() != expected_modified:
        raise RuntimeError("add-mode modified-file scope mismatch")
    script_rel = SCRIPT.relative_to(ROOT).as_posix()
    round2_rel = TARGETS["round2"].relative_to(ROOT).as_posix()
    expected_untracked = {script_rel} if args.target_id == "round2" else {script_rel, round2_rel}
    if untracked_files() != expected_untracked:
        raise RuntimeError("add-mode untracked scope mismatch")
    target = TARGETS[args.target_id]
    canonical_regular(target, False)
    if target.exists():
        raise RuntimeError("add target already exists")
    content = base64.b64decode(args.content_base64, validate=True)
    if sha(content) != args.content_sha256 or content.startswith(b"\xef\xbb\xbf") or b"\r" in content or not content.endswith(b"\n"):
        raise RuntimeError("add content hash/profile mismatch")
    token = uuid.uuid4().hex
    temp = target.with_name(f".{target.name}.codex-temp-closer-{token}")
    installed = False
    rollback = "not-required"
    try:
        create_new(temp, content)
        if temp.read_bytes() != content or sha(temp.read_bytes()) != args.content_sha256:
            raise RuntimeError("add staging verification failed")
        if target.exists():
            raise RuntimeError("add target appeared concurrently")
        os.replace(temp, target)
        installed = True
        if sha(target.read_bytes()) != args.content_sha256:
            raise RuntimeError("add postimage mismatch")
        if git("diff", "--check", check=False).returncode != 0:
            raise RuntimeError("git diff --check failed after add")
    except Exception:
        rollback = "required"
        if installed and target.exists():
            target.unlink()
            if target.exists():
                rollback = "failed"
        raise
    finally:
        if temp.exists():
            temp.unlink()
    residuals = [str(temp)] if temp.exists() else []
    if residuals:
        raise RuntimeError(f"add residuals: {residuals}")
    return {"mode": "add", "target_id": args.target_id, "target": str(target), "preimage": "absent", "postimage_sha256": args.content_sha256, "rollback": rollback, "residuals": residuals}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("docs", "add"), required=True)
    parser.add_argument("--expected-head", required=True)
    parser.add_argument("--plan-base64")
    parser.add_argument("--plan-sha256")
    parser.add_argument("--target-id")
    parser.add_argument("--content-base64")
    parser.add_argument("--content-sha256")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = docs_mode(args) if args.mode == "docs" else add_mode(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"f1 closer writer failed: {error}", file=sys.stderr)
        raise

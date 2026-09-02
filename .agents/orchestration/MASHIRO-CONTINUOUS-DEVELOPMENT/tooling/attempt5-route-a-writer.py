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
TARGETS = (
    {
        "id": "assistant-contract",
        "path": PROJECT_ROOT / "src" / "shared" / "assistant-contract.ts",
        "prehash": "2a24c8bd10f67a7903ad03241213f1feeeea3e76c2c6d0e4085b511073ce4eb0",
        "old": (
            "export const assistantChannels = {\n"
            "  list: 'assistant:list',\n"
            "  create: 'assistant:create',\n"
            "  switch: 'assistant:switch',\n"
            "  rename: 'assistant:rename',\n"
            "  setPrimary: 'assistant:set-primary',\n"
            "  archive: 'assistant:archive'\n"
            "} as const"
        ),
        "new": "export { assistantChannels } from './assistant-channels.js'",
    },
    {
        "id": "preload-index",
        "path": PROJECT_ROOT / "src" / "preload" / "index.ts",
        "prehash": "23a9ea439f0b57848b670fd1cf7c5c46f9e75fc6ac9bf5165dc9e4a9b38e6ce8",
        "old": (
            "import { assistantChannels, type AssistantApi } from "
            "'../shared/assistant-contract.js'"
        ),
        "new": (
            "import { assistantChannels } from '../shared/assistant-channels.js'\n"
            "import type { AssistantApi } from '../shared/assistant-contract.js'"
        ),
    },
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def profile(data: bytes) -> dict[str, object]:
    bom = data.startswith(b"\xef\xbb\xbf")
    body = data[3:] if bom else data
    return {
        "bom": bom,
        "crlf": body.count(b"\r\n"),
        "bare_lf": body.count(b"\n") - body.count(b"\r\n"),
        "final_newline": body.endswith(b"\n"),
    }


def create_file(path: Path, data: bytes) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    descriptor = os.open(path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(descriptor)


def is_reparse(path: Path) -> bool:
    info = path.lstat()
    attributes = getattr(info, "st_file_attributes", 0)
    return stat.S_ISLNK(info.st_mode) or bool(attributes & 0x400)


def main() -> int:
    canonical_root = PROJECT_ROOT.resolve(strict=True)
    if canonical_root != PROJECT_ROOT:
        raise RuntimeError(f"unexpected canonical root: {canonical_root}")

    staged: list[dict[str, object]] = []
    installed: list[dict[str, object]] = []
    evidence: list[dict[str, object]] = []
    rollback = "not-required"
    try:
        for spec in TARGETS:
            target = spec["path"]
            assert isinstance(target, Path)
            canonical_target = target.resolve(strict=True)
            if canonical_target.parent not in {
                PROJECT_ROOT / "src" / "shared",
                PROJECT_ROOT / "src" / "preload",
            }:
                raise RuntimeError(f"target outside fixed allowlist: {canonical_target}")
            if is_reparse(canonical_target) or not canonical_target.is_file():
                raise RuntimeError(f"target is not a regular non-reparse file: {canonical_target}")

            original = canonical_target.read_bytes()
            if sha256(original) != spec["prehash"]:
                raise RuntimeError(f"preimage mismatch: {spec['id']} {sha256(original)}")
            original_profile = profile(original)
            if original_profile["bom"] or original_profile["crlf"] or not original_profile["final_newline"]:
                raise RuntimeError(f"unexpected encoding/newline profile: {spec['id']}")
            text = original.decode("utf-8")
            count = text.count(spec["old"])
            if count != 1:
                raise RuntimeError(f"match count {count}, expected 1: {spec['id']}")
            transformed = text.replace(spec["old"], spec["new"], 1).encode("utf-8")
            transformed_profile = profile(transformed)
            if (
                transformed_profile["bom"] != original_profile["bom"]
                or transformed_profile["crlf"] != 0
                or transformed_profile["final_newline"] != original_profile["final_newline"]
            ):
                raise RuntimeError(f"encoding/newline profile changed: {spec['id']}")

            token = uuid.uuid4().hex
            temp = canonical_target.with_name(f".codex-temp-attempt5-{token}-{canonical_target.name}")
            backup = canonical_target.with_name(
                f".codex-backup-attempt5-{spec['prehash']}-{token}-{canonical_target.name}"
            )
            create_file(temp, transformed)
            if temp.read_bytes() != transformed:
                raise RuntimeError(f"temp content mismatch: {spec['id']}")
            create_file(backup, original)
            if sha256(backup.read_bytes()) != spec["prehash"]:
                raise RuntimeError(f"backup hash mismatch: {spec['id']}")
            diff = "".join(
                difflib.unified_diff(
                    text.splitlines(keepends=True),
                    transformed.decode("utf-8").splitlines(keepends=True),
                    fromfile=str(backup),
                    tofile=str(canonical_target),
                )
            )
            staged.append(
                {
                    "id": spec["id"],
                    "target": canonical_target,
                    "temp": temp,
                    "backup": backup,
                    "prehash": spec["prehash"],
                    "posthash": sha256(transformed),
                    "match_count": count,
                    "diff": diff,
                    "profile": original_profile,
                }
            )

        for item in staged:
            os.replace(item["temp"], item["target"])
            installed.append(item)
            actual = Path(item["target"]).read_bytes()
            if sha256(actual) != item["posthash"]:
                raise RuntimeError(f"postcondition failed: {item['id']}")
            evidence.append(
                {
                    "id": item["id"],
                    "target": str(item["target"]),
                    "preimage_sha256": item["prehash"],
                    "postimage_sha256": item["posthash"],
                    "match_count": item["match_count"],
                    "encoding": "UTF-8 without BOM",
                    "newline": "LF with final newline",
                    "diff": item["diff"],
                }
            )
    except Exception:
        rollback = "required"
        for item in reversed(installed):
            backup = Path(item["backup"])
            target = Path(item["target"])
            if backup.exists() and sha256(backup.read_bytes()) == item["prehash"]:
                os.replace(backup, target)
                if sha256(target.read_bytes()) != item["prehash"]:
                    rollback = "failed"
        raise
    finally:
        if rollback != "failed":
            for item in staged:
                for key in ("temp", "backup"):
                    path = Path(item[key])
                    if path.exists():
                        path.unlink()

    residuals = [
        str(path)
        for item in staged
        for path in (Path(item["temp"]), Path(item["backup"]))
        if path.exists()
    ]
    if residuals:
        raise RuntimeError(f"writer residuals: {residuals}")
    print(json.dumps({"rollback": rollback, "residuals": residuals, "files": evidence}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"attempt5 writer failed: {error}", file=sys.stderr)
        raise

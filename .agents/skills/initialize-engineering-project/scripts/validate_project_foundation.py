#!/usr/bin/env python3
"""Read-only structural validation for an initialized engineering project."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


REQUIRED_FILES = (
    "AGENTS.md",
    "doc/proposal.md",
    "doc/high-level-design.md",
    "doc/detailed-design.md",
    "doc/tasks/progress.md",
)

AGENTS_SECTION_GROUPS = (
    ("项目概览", "project overview"),
    ("事实来源", "source of truth", "authoritative"),
    ("项目结构", "稳定架构", "architecture", "structure"),
    ("工作流", "workflow"),
    ("规则", "红线", "guardrail", "rules"),
    ("命令", "commands"),
    ("测试", "验证", "test", "verification"),
    ("环境", "environment"),
    ("git", "交付", "delivery"),
)

SCAFFOLD_MARKERS = (
    "[todo:",
    "briefly describe what this skill does",
    "add the task-specific guidance",
)


def read_text(path: Path, errors: list[str]) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        errors.append(f"无法以 UTF-8 读取 {path}: {exc}")
        return ""
    if not text.strip():
        errors.append(f"文件为空: {path}")
    return text


def validate(root: Path) -> dict[str, object]:
    errors: list[str] = []
    warnings: list[str] = []
    if not root.is_dir():
        return {"ok": False, "root": str(root), "errors": ["目标不是目录"], "warnings": []}

    texts: dict[str, str] = {}
    for relative in REQUIRED_FILES:
        path = root / relative
        if not path.is_file():
            errors.append(f"缺少必需文件: {relative}")
            continue
        texts[relative] = read_text(path, errors)

    task_dir = root / "doc" / "tasks"
    task_files = []
    if task_dir.is_dir():
        task_files = sorted(
            path for path in task_dir.glob("*.md") if path.name.lower() != "progress.md"
        )
    if not task_files:
        errors.append("doc/tasks 中至少需要一个 progress.md 之外的任务文件")

    agents = texts.get("AGENTS.md", "").lower()
    for choices in AGENTS_SECTION_GROUPS:
        if not any(choice.lower() in agents for choice in choices):
            warnings.append(f"AGENTS.md 未发现章节语义: {' / '.join(choices)}")

    for relative, content in texts.items():
        lowered = content.lower()
        for marker in SCAFFOLD_MARKERS:
            if marker in lowered:
                errors.append(f"{relative} 仍含初始化占位: {marker}")

    progress = texts.get("doc/tasks/progress.md", "")
    if progress.count("\n") > 250:
        warnings.append("progress.md 超过 250 行；考虑把执行历史归档到任务文件或 Git")

    if not (root / ".gitignore").is_file():
        warnings.append("未发现 .gitignore；安装或构建前应明确生成物与敏感文件规则")
    if not (root / ".git").exists():
        warnings.append("尚未初始化本地 Git；如属用户范围，请完成后再建立基线提交")

    return {
        "ok": not errors,
        "root": str(root.resolve()),
        "taskFiles": [str(path.relative_to(root)) for path in task_files],
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="project root")
    parser.add_argument("--json", action="store_true", help="emit JSON")
    args = parser.parse_args()
    result = validate(args.root.resolve())
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"project foundation: {'PASS' if result['ok'] else 'FAIL'}")
        print(f"root: {result['root']}")
        for item in result["errors"]:
            print(f"ERROR: {item}")
        for item in result["warnings"]:
            print(f"WARN: {item}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())

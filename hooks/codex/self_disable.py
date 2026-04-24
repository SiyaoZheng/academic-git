#!/usr/bin/env python3
"""Helpers for disabling Fu inside its own source repository and worktrees."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


def _git(args: list[str], cwd: str | Path) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return ""
    return (completed.stdout or "").strip()


def repo_root(candidate: str | Path | None) -> Path | None:
    if not candidate:
        return None
    root = _git(["rev-parse", "--show-toplevel"], candidate)
    return Path(root) if root else None


def is_fu_source_repo(candidate: str | Path | None) -> bool:
    root = repo_root(candidate)
    if root is None:
        return False

    manifest = root / ".codex-plugin" / "plugin.json"
    if not manifest.exists():
        return False
    if not (root / "hooks" / "codex" / "hooks.json").exists():
        return False
    if not (root / "skills" / "handle-issue" / "SKILL.md").exists():
        return False

    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    return data.get("name") == "fu"

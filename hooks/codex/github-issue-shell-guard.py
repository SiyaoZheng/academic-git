#!/usr/bin/env python3
"""Block shell commands that bypass the codex-gh-issue-start workflow."""

from __future__ import annotations

import json
import re
import shlex
import subprocess
import sys
from pathlib import Path


HELP_RE = re.compile(r"(^|\s)(--help|-h)(\s|$)")
SHELL_SEPARATORS = {";", "&&", "||", "|", "(", ")"}


def deny(reason: str) -> int:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    return 0


def routing_reason(command: str) -> str:
    helper = Path(__file__).resolve().parents[2] / "scripts" / "render-routing-table.sh"
    payload = json.dumps({"tool_input": {"command": command}})
    completed = subprocess.run(["bash", str(helper)], input=payload, capture_output=True, text=True, check=False)
    if completed.returncode != 0 or not completed.stdout.strip():
        return ""

    try:
        decision = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return ""
    if decision.get("decision") not in {"route", "deny"}:
        return ""
    reason = decision.get("reason")
    return reason if isinstance(reason, str) else ""


def shell_tokens(command: str) -> list[str]:
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        lexer.commenters = ""
        return list(lexer)
    except ValueError:
        return []


def command_basename(token: str) -> str:
    return token.rsplit("/", 1)[-1]


def token_has_shell_c(tokens: list[str], index: int) -> int | None:
    if command_basename(tokens[index]) not in {"sh", "bash", "zsh"}:
        return None
    for j in range(index + 1, len(tokens) - 1):
        token = tokens[j]
        if token in SHELL_SEPARATORS:
            return None
        if token.startswith("-") and "c" in token:
            return j + 1
    return None


def has_raw_issue_create(command: str, depth: int = 0) -> bool:
    if depth > 2:
        return False
    tokens = shell_tokens(command)
    for i in range(len(tokens) - 2):
        if tokens[i] == "gh" and tokens[i + 1] == "issue" and tokens[i + 2] in {"create", "new"}:
            return True
        nested_index = token_has_shell_c(tokens, i)
        if nested_index is not None and has_raw_issue_create(tokens[nested_index], depth + 1):
            return True
    return False


def issue_develop_span(command: str) -> tuple[int, int, list[str]] | None:
    tokens = shell_tokens(command)
    for i in range(len(tokens) - 2):
        if tokens[i] == "gh" and tokens[i + 1] == "issue" and tokens[i + 2] == "develop":
            end = len(tokens)
            for j in range(i + 3, len(tokens)):
                if tokens[j] in SHELL_SEPARATORS:
                    end = j
                    break
            return i, end, tokens
    return None


def has_issue_develop(command: str) -> bool:
    return issue_develop_span(command) is not None


def has_issue_develop_flag(command: str, flag: str) -> bool:
    span = issue_develop_span(command)
    if span is None:
        return False
    start, end, tokens = span
    return flag in tokens[start:end]


def has_worktree_add(command: str) -> bool:
    tokens = shell_tokens(command)
    for i in range(len(tokens) - 2):
        if tokens[i] == "git" and tokens[i + 1] == "worktree" and tokens[i + 2] == "add":
            return True
    return False


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    command = payload.get("tool_input", {}).get("command", "")
    if not isinstance(command, str) or not command.strip():
        return 0

    if HELP_RE.search(command):
        return 0

    if has_raw_issue_create(command):
        reason = routing_reason(command)
        if not reason:
            reason = (
                "blocked raw gh issue create; route to create_issue for standalone issue bookkeeping "
                "or the codex-gh-issue-start skill/MCP path for issue-bound code work"
            )
        return deny(
            reason
        )

    if has_issue_develop(command) and not has_issue_develop_flag(command, "--list"):
        if has_issue_develop_flag(command, "--checkout") or has_issue_develop_flag(command, "-c"):
            return deny(
                "`gh issue develop --checkout` is not allowed in academic-git. "
                "Use the codex-gh-issue-start skill/MCP path, or pair `gh issue develop` with "
                "`git worktree add` so no existing worktree is switched."
            )
        if not has_worktree_add(command):
            return deny(
                "`gh issue develop` must be paired with `git worktree add` in "
                "the same repair step. For new issue-bound work, use the "
                "codex-gh-issue-start skill/MCP path."
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

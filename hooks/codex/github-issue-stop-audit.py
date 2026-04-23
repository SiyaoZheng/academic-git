#!/usr/bin/env python3
"""Continue a turn when issue creation bypassed codex-gh-issue-start."""

from __future__ import annotations

import json
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any


HELP_RE = re.compile(r"(^|\s)(--help|-h)(\s|$)")
SHELL_SEPARATORS = {";", "&&", "||", "|", "(", ")"}


def emit_continue() -> int:
    print(json.dumps({"continue": True}))
    return 0


def block(reason: str) -> int:
    print(json.dumps({"decision": "block", "reason": reason}))
    return 0


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


def load_turn_events(transcript_path: str | None, turn_id: str | None) -> list[dict[str, Any]]:
    if not transcript_path or not turn_id:
        return []
    path = Path(transcript_path)
    if not path.exists():
        return []

    events: list[dict[str, Any]] = []
    found_start = False
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            event = json.loads(raw_line)
        except json.JSONDecodeError:
            continue

        payload = event.get("payload", {})
        if payload.get("type") == "task_started" and payload.get("turn_id") == turn_id:
            found_start = True
            events = [event]
            continue

        if found_start:
            events.append(event)

    return events


def command_from_event(event: dict[str, Any]) -> str | None:
    payload = event.get("payload", {})

    if event.get("type") == "event_msg" and payload.get("type") == "exec_command_end":
        command = payload.get("command")
        if isinstance(command, list):
            if (
                len(command) >= 3
                and command_basename(str(command[0])) in {"sh", "bash", "zsh"}
                and str(command[1]).startswith("-")
                and "c" in str(command[1])
            ):
                return str(command[2])
            return shlex.join(str(part) for part in command)

    if event.get("type") == "response_item" and payload.get("type") == "function_call":
        if payload.get("name") == "exec_command":
            try:
                args = json.loads(payload.get("arguments", "{}"))
            except json.JSONDecodeError:
                return None
            cmd = args.get("cmd")
            if isinstance(cmd, str):
                return cmd

    return None


def connector_issue_created(event: dict[str, Any]) -> bool:
    payload = event.get("payload", {})

    if event.get("type") == "response_item":
        return (
            payload.get("type") == "function_call"
            and payload.get("namespace") == "mcp__codex_apps__github"
            and payload.get("name") == "_create_issue"
        )

    if event.get("type") == "event_msg" and payload.get("type") == "mcp_tool_call_end":
        invocation = payload.get("invocation", {})
        return invocation.get("tool") == "github_create_issue"

    return False


def hook_maintenance_command(command: str) -> bool:
    return (
        "hooks/codex/github-issue-" in command
        or "scripts/codex-gh-issue-start" in command and "--dry-run" in command
    )


def current_branch(cwd: str | None) -> str:
    if not cwd:
        return ""
    completed = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return ""
    return completed.stdout.strip()


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return emit_continue()

    if payload.get("stop_hook_active"):
        return emit_continue()

    events = load_turn_events(payload.get("transcript_path"), payload.get("turn_id"))
    commands = [cmd for event in events if (cmd := command_from_event(event))]
    connector_created = any(connector_issue_created(event) for event in events)
    raw_issue_create = any(
        has_raw_issue_create(cmd)
        and "codex-gh-issue-start" not in cmd
        and not hook_maintenance_command(cmd)
        and not HELP_RE.search(cmd)
        for cmd in commands
    )
    used_issue_start = any(
        "codex-gh-issue-start" in cmd
        and "--title" in cmd
        and "--dry-run" not in cmd
        and not hook_maintenance_command(cmd)
        for cmd in commands
    )
    used_develop = any(
        has_issue_develop(cmd)
        and "codex-gh-issue-start" not in cmd
        and not hook_maintenance_command(cmd)
        for cmd in commands
    )
    used_develop_checkout = any(
        has_issue_develop_flag(cmd, "--checkout") or has_issue_develop_flag(cmd, "-c")
        for cmd in commands
    )
    used_worktree_add = any(has_worktree_add(cmd) for cmd in commands)

    if connector_created and not (used_issue_start or (used_develop and used_worktree_add)):
        return block(
            "GitHub connector issue creation was detected in this turn. Adrian's workflow "
            "requires the `/codex-gh-issue-start` skill instead. Because the issue already "
            "exists, continue by using `gh issue develop <issue-number-or-url> --name "
            "codex/issue-<number>-<slug> --base <default-branch>` and `git worktree add "
            "<path> <branch>` for the created issue. For future new issues, use "
            "`/codex-gh-issue-start` instead of the GitHub connector."
        )

    if raw_issue_create and not (used_develop and used_worktree_add):
        return block(
            "A bare `gh issue create` command was detected. Adrian's workflow requires "
            "`/codex-gh-issue-start`, which creates the issue-linked branch and opens "
            "it in a dedicated git worktree. Continue by creating that linked worktree "
            "now, or redo future issue creation through `/codex-gh-issue-start`."
        )

    if used_develop_checkout:
        branch = current_branch(payload.get("cwd"))
        return block(
            "`gh issue develop --checkout` was used, but academic-git must not switch "
            f"the existing workspace with checkout. Current branch: {branch or 'unknown'}. "
            "Continue by opening issue work in a dedicated git worktree instead."
        )

    if used_develop and not used_worktree_add:
        return block(
            "`gh issue develop` was used without a matching `git worktree add` in this "
            "turn. Continue by creating a dedicated worktree for the issue branch before "
            "editing files."
        )

    return emit_continue()


if __name__ == "__main__":
    raise SystemExit(main())

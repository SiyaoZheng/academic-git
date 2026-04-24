#!/usr/bin/env python3
"""Route academic-git workflow events into canonical handle-* actions."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from self_disable import is_fu_source_repo


ISSUE_BRANCH_RE = re.compile(r"^codex/issue-(\d+)")
PROTECTED_BRANCHES = {"", "main", "master", "develop", "trunk"}


def run_cmd(args: list[str], cwd: str, check: bool = True) -> str:
    completed = subprocess.run(args, cwd=cwd, check=False, capture_output=True, text=True)
    if completed.returncode != 0 and check:
        raise RuntimeError((completed.stderr or completed.stdout).strip() or " ".join(args))
    return (completed.stdout or "").strip()


def git(args: list[str], cwd: str, check: bool = True) -> str:
    return run_cmd(["git", *args], cwd, check=check)


def gh(args: list[str], cwd: str, check: bool = True) -> str:
    return run_cmd(["gh", *args], cwd, check=check)


def git_ref_exists(ref: str, repo_dir: str) -> bool:
    completed = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", ref],
        cwd=repo_dir,
        check=False,
        capture_output=True,
        text=True,
    )
    return completed.returncode == 0


def default_branch(repo_dir: str) -> str:
    symbolic = git(["symbolic-ref", "refs/remotes/origin/HEAD"], repo_dir, check=False).replace(
        "refs/remotes/origin/", ""
    )
    if symbolic:
        return symbolic

    remote_show = git(["remote", "show", "origin"], repo_dir, check=False)
    match = re.search(r"HEAD branch:\s*(\S+)", remote_show)
    if match:
        return match.group(1)

    if git_ref_exists("refs/remotes/origin/master", repo_dir):
        return "master"
    if git_ref_exists("refs/remotes/origin/main", repo_dir):
        return "main"
    return "main"


def issue_from_branch(branch: str) -> int | None:
    match = ISSUE_BRANCH_RE.match(branch or "")
    return int(match.group(1)) if match else None


def parse_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def is_linked_worktree(repo_dir: str) -> bool:
    git_dir = git(["rev-parse", "--git-dir"], repo_dir, check=False)
    common_dir = git(["rev-parse", "--git-common-dir"], repo_dir, check=False)
    if not git_dir or not common_dir:
        return False

    git_dir_abs = os.path.realpath(os.path.join(repo_dir, git_dir)) if not os.path.isabs(git_dir) else os.path.realpath(git_dir)
    common_dir_abs = os.path.realpath(os.path.join(repo_dir, common_dir)) if not os.path.isabs(common_dir) else os.path.realpath(common_dir)
    return git_dir_abs != common_dir_abs


def current_state(repo_dir: str) -> dict[str, Any]:
    config = parse_json_file(Path(repo_dir) / ".academic-git.json")
    branch = git(["branch", "--show-current"], repo_dir, check=False)
    head_sha = git(["rev-parse", "HEAD"], repo_dir, check=False)
    branch_issue = issue_from_branch(branch)
    locked_issue = config.get("locked_issue")
    locked_branch = config.get("locked_branch")
    issue = locked_issue or branch_issue
    main_branch = default_branch(repo_dir)
    dirty_status = git(
        ["status", "--porcelain", "--untracked-files=all", "--ignore-submodules=dirty"],
        repo_dir,
        check=False,
    )
    dirty_lines = [line for line in dirty_status.splitlines() if line.strip()]
    conflict_lines = git(["diff", "--name-only", "--diff-filter=U"], repo_dir, check=False).splitlines()
    ahead_raw = git(["rev-list", "--count", f"origin/{main_branch}..HEAD"], repo_dir, check=False)
    try:
        ahead_commits = int(ahead_raw or "0")
    except ValueError:
        ahead_commits = 0

    remote_head = ""
    if branch:
        remote_head = git(["rev-parse", f"refs/remotes/origin/{branch}^{{commit}}"], repo_dir, check=False)

    gh_available = shutil.which("gh") is not None
    open_pr: dict[str, Any] | None = None
    issue_view: dict[str, Any] | None = None
    if gh_available and branch:
        pr_raw = gh(["pr", "list", "--head", branch, "--state", "open", "--json", "number,url"], repo_dir, check=False)
        try:
            pr_list = json.loads(pr_raw or "[]")
            if isinstance(pr_list, list) and pr_list:
                open_pr = pr_list[0]
        except json.JSONDecodeError:
            open_pr = None

    if gh_available and issue:
        issue_raw = gh(["issue", "view", str(issue), "--json", "title,body"], repo_dir, check=False)
        try:
            issue_view = json.loads(issue_raw) if issue_raw else None
        except json.JSONDecodeError:
            issue_view = None

    issue_body = ""
    if isinstance(issue_view, dict):
        body = issue_view.get("body")
        if isinstance(body, str):
            issue_body = body.replace("\\n", "\n") if "\\n" in body and "\n" not in body else body

    checklist_lines = [line for line in issue_body.splitlines() if re.match(r"^- \[[x ]\] [A-Z]\.", line)]
    unchecked = [line for line in checklist_lines if line.startswith("- [ ]") and "~~" not in line]
    checklist_complete = bool(checklist_lines) and not unchecked

    tree_basis = dirty_status if dirty_lines else f"clean:{head_sha}"
    tree_fingerprint = hashlib.sha256(tree_basis.encode("utf-8")).hexdigest()[:16]

    return {
        "repo_dir": repo_dir,
        "config": config,
        "branch": branch,
        "head_sha": head_sha,
        "branch_issue": branch_issue,
        "locked_issue": locked_issue,
        "locked_branch": locked_branch,
        "issue": issue,
        "main_branch": main_branch,
        "dirty_lines": dirty_lines,
        "dirty_count": len(dirty_lines),
        "conflict_lines": [line for line in conflict_lines if line.strip()],
        "ahead_commits": ahead_commits,
        "remote_head": remote_head,
        "gh_available": gh_available,
        "open_pr": open_pr,
        "issue_view": issue_view,
        "issue_body": issue_body,
        "checklist_complete": checklist_complete,
        "tree_fingerprint": tree_fingerprint,
        "linked_worktree": is_linked_worktree(repo_dir),
        "journal": config.get("auto_workflow") if isinstance(config.get("auto_workflow"), dict) else None,
    }


def invariant_diagnostics(state: dict[str, Any]) -> list[str]:
    diags: list[str] = []
    branch = state["branch"]
    locked_issue = state["locked_issue"]
    locked_branch = state["locked_branch"]
    branch_issue = state["branch_issue"]

    if not state["linked_worktree"]:
        diags.append("current repo is not a linked issue worktree")
    if not branch:
        diags.append("HEAD is detached or branch name is unavailable")
    if branch in PROTECTED_BRANCHES or branch.startswith("release/") or branch.startswith("hotfix/"):
        diags.append(f"branch '{branch or 'unknown'}' is protected")
    if branch_issue is None:
        diags.append(f"branch '{branch or 'unknown'}' is not an issue branch")
    if locked_issue in (None, ""):
        diags.append("locked_issue is missing from .academic-git.json")
    if locked_branch in (None, ""):
        diags.append("locked_branch is missing from .academic-git.json")
    if locked_branch and branch and locked_branch != branch:
        diags.append(f"locked_branch '{locked_branch}' does not match current branch '{branch}'")
    if locked_issue and branch_issue and int(locked_issue) != int(branch_issue):
        diags.append(f"locked_issue '{locked_issue}' does not match branch issue '{branch_issue}'")
    if locked_issue and state["issue"] and int(locked_issue) != int(state["issue"]):
        diags.append(f"locked_issue '{locked_issue}' does not match effective issue '{state['issue']}'")
    return diags


def route_payload(action: str, diagnostics: list[str], state: dict[str, Any], expected_tools: list[str]) -> dict[str, Any]:
    id_source = json.dumps(
        {
            "action": action,
            "branch": state["branch"],
            "issue": state["issue"],
            "head_sha": state["head_sha"],
            "tree_fingerprint": state["tree_fingerprint"],
        },
        sort_keys=True,
    )
    idempotency_key = hashlib.sha256(id_source.encode("utf-8")).hexdigest()[:20]
    return {
        "action": action,
        "diagnostics": diagnostics,
        "context": {
            "issue": state["issue"],
            "branch": state["branch"],
            "worktree_path": state["repo_dir"],
            "head_sha": state["head_sha"],
            "tree_fingerprint": state["tree_fingerprint"],
            "idempotency_key": idempotency_key,
            "main_branch": state["main_branch"],
            "ahead_commits": state["ahead_commits"],
            "locked_issue": state["locked_issue"],
            "locked_branch": state["locked_branch"],
            "branch_issue": state["branch_issue"],
            "dirty_count": state["dirty_count"],
            "expected_tools": expected_tools,
            "open_pr": state["open_pr"],
            "journal": state["journal"],
        },
    }


def route_text(payload: dict[str, Any]) -> str:
    action = payload["action"]
    diagnostics = payload["diagnostics"]
    context = payload["context"]
    instructions = {
        "handle-issue": (
            "Use handle-issue now. If this branch already belongs to an issue, prefer "
            f"resume_issue(issue: {context['issue']}, branch: \"{context['branch']}\"). "
            "Only use start_issue(...) when Adrian is explicitly beginning new issue work."
        ),
        "handle-commit": (
            "Use handle-commit now. Read the issue, group the diff by checklist meaning, then call "
            f"create_commit(issue: {context['issue']}, items: [...], type: \"...\", description: \"...\", "
            f"paths: [...], idempotency_key: \"{context['idempotency_key']}\")."
        ),
        "handle-pr": (
            "Use handle-pr now. Call "
            f"prepare_pr(issue: {context['issue']}) first, review the body, then call "
            f"open_pr(issue: {context['issue']}, title: \"...\", body: \"...\", "
            f"idempotency_key: \"{context['idempotency_key']}\")."
        ),
    }[action]
    return "\n".join(
        [
            f"route({action})",
            "diagnostics:",
            *[f"- {item}" for item in diagnostics],
            "context:",
            json.dumps(context, ensure_ascii=False, indent=2, sort_keys=True),
            instructions,
        ]
    )


def emit_allow(event: str, system_message: str | None = None, additional_context: str | None = None) -> int:
    if not system_message and not additional_context:
        return 0

    payload: dict[str, Any] = {}
    if system_message:
        payload["systemMessage"] = system_message
    if additional_context:
        payload["hookSpecificOutput"] = {
            "hookEventName": event,
            "additionalContext": additional_context,
        }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def emit_route(event: str, payload: dict[str, Any]) -> int:
    text = route_text(payload)
    if event == "Stop":
        print(json.dumps({"decision": "block", "reason": text}, ensure_ascii=False))
        return 0

    print(
        json.dumps(
            {
                "systemMessage": f"[academic-git] route({payload['action']})",
                "hookSpecificOutput": {
                    "hookEventName": event,
                    "additionalContext": text,
                },
            },
            ensure_ascii=False,
        )
    )
    return 0


def decide_route(event: str, state: dict[str, Any], stop_hook_active: bool) -> dict[str, Any] | None:
    if event == "Stop" and stop_hook_active:
        return None

    journal = state["journal"]
    if isinstance(journal, dict) and journal.get("status") in {"pending", "running"}:
        action = str(journal.get("action") or "")
        if action == "create_commit":
            return route_payload("handle-commit", ["resume pending auto commit journal"], state, ["create_commit"])
        if action == "open_pr":
            return route_payload("handle-pr", ["resume pending auto PR journal"], state, ["prepare_pr", "open_pr"])
        return route_payload("handle-issue", ["repair stale workflow journal before proceeding"], state, ["resume_issue", "start_issue"])

    conflicts = state["conflict_lines"]
    if conflicts:
        return route_payload(
            "handle-issue",
            ["unresolved merge conflicts detected", *[f"conflict: {line}" for line in conflicts[:10]]],
            state,
            ["resume_issue"],
        )

    diagnostics = invariant_diagnostics(state)
    if diagnostics:
        return route_payload("handle-issue", diagnostics, state, ["resume_issue", "start_issue"])

    if state["dirty_count"] > 0:
        sample = state["dirty_lines"][:10]
        return route_payload(
            "handle-commit",
            [f"dirty issue worktree with {state['dirty_count']} changed path(s)", *sample],
            state,
            ["view_issue", "create_commit"],
        )

    if state["ahead_commits"] > 0 and not state["open_pr"]:
        if not state["gh_available"]:
            return route_payload(
                "handle-issue",
                ["branch is ahead but GitHub CLI is unavailable, so PR readiness cannot be verified"],
                state,
                ["resume_issue"],
            )
        if not state["issue"]:
            return route_payload(
                "handle-issue",
                ["branch is ahead but no effective issue could be resolved"],
                state,
                ["resume_issue", "start_issue"],
            )
        if state["remote_head"] != state["head_sha"]:
            return route_payload(
                "handle-issue",
                ["branch is ahead but origin/<branch> is missing or stale"],
                state,
                ["resume_issue"],
            )
        if not state["issue_body"]:
            return route_payload(
                "handle-issue",
                [f"issue #{state['issue']} could not be read for PR readiness"],
                state,
                ["resume_issue"],
            )
        if state["checklist_complete"]:
            return route_payload(
                "handle-pr",
                ["clean pushed issue branch is PR-ready"],
                state,
                ["prepare_pr", "open_pr"],
            )

    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", choices=["SessionStart", "UserPromptSubmit", "Stop"], required=True)
    args = parser.parse_args()

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        payload = {}

    repo_dir = payload.get("cwd") or os.getcwd()
    try:
        repo_dir = git(["rev-parse", "--show-toplevel"], repo_dir, check=False) or repo_dir
    except RuntimeError:
        pass
    if is_fu_source_repo(repo_dir):
        return 0
    if not repo_dir or not Path(repo_dir).exists():
        return 0
    if git(["rev-parse", "--git-dir"], repo_dir, check=False) == "":
        return 0

    state = current_state(repo_dir)
    route = decide_route(args.event, state, bool(payload.get("stop_hook_active")))
    if route is not None:
        return emit_route(args.event, route)

    if args.event == "SessionStart":
        summary = (
            f"academic-git status: branch={state['branch'] or 'unknown'}, "
            f"dirty_files={state['dirty_count']}, ahead_of_{state['main_branch']}={state['ahead_commits']}, "
            f"locked_issue={state['locked_issue'] or '(none)'}, locked_branch={state['locked_branch'] or '(none)'}."
        )
        return emit_allow(args.event, system_message="[academic-git] session recovery scan complete", additional_context=summary)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

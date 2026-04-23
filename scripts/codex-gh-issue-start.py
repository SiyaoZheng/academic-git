#!/usr/bin/env python3
"""Create a GitHub issue and open its linked branch in a separate worktree."""

from __future__ import annotations

import argparse
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path


ISSUE_URL_RE = re.compile(r"https://github\.com/[^/\s]+/[^/\s]+/issues/(\d+)")
REQUIRED_SECTIONS = (
    "## Context",
    "## Task",
    "## Scope",
    "## Affected Files",
    "## Verification",
)
CHECKLIST_RE = re.compile(r"^- \[ \] [A-Z]\. .+", re.MULTILINE)


def run(cmd: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=False, capture_output=capture, text=True)


def require_tool(name: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(f"Required command not found on PATH: {name}")


def slugify(text: str, max_len: int = 48) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text.lower()).strip("-")
    slug = re.sub(r"-+", "-", slug)
    return (slug or "issue")[:max_len].strip("-") or "issue"


def shell_join(cmd: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in cmd)


def repo_args(repo: str | None) -> list[str]:
    return ["--repo", repo] if repo else []


def default_branch(repo: str | None) -> str:
    cmd = [
        "gh",
        "repo",
        "view",
        "--json",
        "defaultBranchRef",
        "--jq",
        ".defaultBranchRef.name",
        *repo_args(repo),
    ]
    completed = run(cmd, capture=True)
    branch = completed.stdout.strip()
    if completed.returncode == 0 and branch:
        return branch

    fallback = run(["git", "symbolic-ref", "refs/remotes/origin/HEAD"], capture=True)
    ref = fallback.stdout.strip()
    if fallback.returncode == 0 and ref.startswith("refs/remotes/origin/"):
        return ref.removeprefix("refs/remotes/origin/")

    current = run(["git", "branch", "--show-current"], capture=True)
    branch = current.stdout.strip()
    return branch or "main"


def repo_root() -> Path:
    completed = run(["git", "rev-parse", "--show-toplevel"], capture=True)
    if completed.returncode != 0 or not completed.stdout.strip():
        raise SystemExit("codex-gh-issue-start must run inside a local git repository.")
    return Path(completed.stdout.strip()).resolve()


def branch_exists(branch: str) -> bool:
    completed = run(
        ["git", "rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"],
        capture=True,
    )
    return completed.returncode == 0


def worktree_for_branch(branch: str) -> Path | None:
    completed = run(["git", "worktree", "list", "--porcelain"], capture=True)
    if completed.returncode != 0:
        return None

    current_path: Path | None = None
    for line in completed.stdout.splitlines():
        if line.startswith("worktree "):
            current_path = Path(line.removeprefix("worktree ")).resolve()
        elif line == f"branch refs/heads/{branch}" and current_path:
            return current_path
    return None


def resolve_worktree_path(args: argparse.Namespace, issue_number: int) -> Path:
    if args.worktree_dir:
        return Path(args.worktree_dir).expanduser().resolve()

    root = repo_root()
    parent = Path(args.worktree_parent).expanduser().resolve() if args.worktree_parent else root.parent
    return parent / f"{root.name}.issue-{issue_number}-{slugify(args.title)}"


def read_body(args: argparse.Namespace) -> str:
    if args.body_file == "-":
        return sys.stdin.read()
    if args.body_file:
        body_path = Path(args.body_file).expanduser()
        if not body_path.exists():
            raise SystemExit(f"Body file does not exist: {body_path}")
        return body_path.read_text(encoding="utf-8")
    if args.body is not None:
        return args.body
    if not sys.stdin.isatty():
        return sys.stdin.read()
    return ""


def validate_body(body: str, *, skip_template_check: bool = False) -> None:
    if skip_template_check:
        return

    missing = [section for section in REQUIRED_SECTIONS if section not in body]
    if missing:
        raise SystemExit(f"Issue body missing required sections: {', '.join(missing)}")

    checklist_lines = CHECKLIST_RE.findall(body)
    if not checklist_lines:
        raise SystemExit("Issue body must contain at least one checklist item: - [ ] A. description")

    without_dependencies = [line for line in checklist_lines if "after:" not in line]
    if without_dependencies:
        raise SystemExit("Every checklist item must declare DAG dependencies with 'after:'.")


def create_github_issue(args: argparse.Namespace, body: str) -> tuple[str, int]:
    cmd = ["gh", "issue", "create", "--title", args.title, *repo_args(args.repo)]

    for label in args.label:
        cmd.extend(["--label", label])
    for assignee in args.assignee:
        cmd.extend(["--assignee", assignee])
    if args.milestone:
        cmd.extend(["--milestone", args.milestone])

    if args.dry_run:
        print(shell_join([*cmd, "--body-file", "<validated-body>"]))
        return "https://github.com/example/example/issues/0", 0

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as handle:
        handle.write(body)
        body_file = handle.name

    try:
        completed = run([*cmd, "--body-file", body_file], capture=True)
    finally:
        Path(body_file).unlink(missing_ok=True)

    if completed.stdout:
        print(completed.stdout, end="")
    if completed.stderr:
        print(completed.stderr, end="", file=sys.stderr)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)

    match = ISSUE_URL_RE.search(completed.stdout)
    if not match:
        raise SystemExit("Could not parse issue URL from `gh issue create` output.")
    return match.group(0), int(match.group(1))


def develop_issue(args: argparse.Namespace, issue_number: int) -> str:
    base = args.base or default_branch(args.repo)
    branch = args.branch or f"{args.branch_prefix}/issue-{issue_number}-{slugify(args.title)}"
    cmd = [
        "gh",
        "issue",
        "develop",
        str(issue_number),
        "--name",
        branch,
        "--base",
        base,
        *repo_args(args.repo),
    ]

    if args.dry_run:
        print(shell_join(cmd))
        return branch

    completed = run(cmd, capture=True)
    if completed.stdout:
        print(completed.stdout, end="")
    if completed.stderr:
        print(completed.stderr, end="", file=sys.stderr)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)

    return branch


def ensure_local_branch(branch: str, args: argparse.Namespace) -> None:
    if branch_exists(branch):
        return

    fetch_cmd = ["git", "fetch", "origin", f"{branch}:refs/heads/{branch}"]
    if args.dry_run:
        print(shell_join(fetch_cmd))
        return

    completed = run(fetch_cmd, capture=True)
    if completed.stdout:
        print(completed.stdout, end="")
    if completed.stderr:
        print(completed.stderr, end="", file=sys.stderr)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def add_worktree(args: argparse.Namespace, issue_number: int, branch: str) -> Path:
    existing = worktree_for_branch(branch)
    if existing:
        return existing

    path = resolve_worktree_path(args, issue_number)
    if path.exists() and any(path.iterdir()):
        raise SystemExit(f"Worktree path already exists and is not empty: {path}")

    ensure_local_branch(branch, args)

    cmd = ["git", "worktree", "add", str(path), branch]
    if args.dry_run:
        print(shell_join(cmd))
        return path

    completed = run(cmd, capture=True)
    if completed.stdout:
        print(completed.stdout, end="")
    if completed.stderr:
        print(completed.stderr, end="", file=sys.stderr)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)
    return path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create a GitHub issue, create its linked branch, and open that "
            "branch in a separate git worktree."
        )
    )
    parser.add_argument("--title", required=True, help="Issue title.")
    parser.add_argument("--body", help="Issue body text. If omitted, stdin is used when piped.")
    parser.add_argument("--body-file", help="Read issue body from a file or '-'.")
    parser.add_argument("--repo", help="Repository in OWNER/REPO form.")
    parser.add_argument("--base", help="Base branch for the linked development branch.")
    parser.add_argument("--branch", help="Explicit linked branch name.")
    parser.add_argument("--branch-prefix", default="codex", help="Branch prefix.")
    parser.add_argument("--worktree-dir", help="Explicit path for the issue worktree.")
    parser.add_argument(
        "--worktree-parent",
        help="Parent directory for the issue worktree. Defaults to the current repository's parent.",
    )
    parser.add_argument("--label", action="append", default=[], help="Issue label.")
    parser.add_argument(
        "--assignee",
        action="append",
        default=None,
        help="Issue assignee. Defaults to @me unless --no-assignee is set.",
    )
    parser.add_argument("--no-assignee", action="store_true", help="Do not assign the issue.")
    parser.add_argument("--milestone", help="Issue milestone.")
    parser.add_argument("--skip-template-check", action="store_true", help="Skip DAG template validation.")
    parser.add_argument("--dry-run", action="store_true", help="Print commands without running them.")
    args = parser.parse_args(argv)
    if args.no_assignee:
        args.assignee = []
    elif args.assignee is None:
        args.assignee = ["@me"]
    return args


def main(argv: list[str]) -> int:
    require_tool("gh")
    require_tool("git")
    repo_root()

    args = parse_args(argv)
    body = read_body(args)
    validate_body(body, skip_template_check=args.skip_template_check)
    issue_url, issue_number = create_github_issue(args, body)
    branch = develop_issue(args, issue_number)
    worktree = add_worktree(args, issue_number, branch)

    print("CODEX_ISSUE_START_OK")
    print(f"issue: {issue_url}")
    print(f"branch: {branch}")
    print(f"worktree: {worktree}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

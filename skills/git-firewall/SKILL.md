---
name: git-firewall
description: Internal hook policy, not a primary user workflow. Blocks direct git/gh CLI mutations and keeps Codex routed through academic-git MCP tools.
---

# Git Firewall

## Why This Exists

All mutation operations must go through the `academic-git` MCP tools because they enforce:
- DAG-validated commit ordering
- Pipeline execution before commits
- Gate checks (9 deterministic rules)
- Append-only issue refinement
- Branch naming conventions

Bypassing MCP tools circumvents these safeguards.

## What Gets Blocked

The `check.sh` script inspects the Bash command for these patterns:
- `git commit`, `git push`, `git merge`, `git rebase`, `git reset`
- `git checkout`, `git switch`, `git stash`, `git cherry-pick`, `git revert`, `git tag`
- `gh pr create`, `gh pr merge`, `gh pr close`
- `gh issue create`, `gh issue close`, `gh issue edit`, `gh api`

## What's Allowed (Read-Only)

These introspection commands are allowlisted because hooks use them internally:
- `git branch --show-current`
- `git rev-parse`
- `git status --porcelain`
- `git diff --name-only`
- `git symbolic-ref`
- `git remote get-url`
- `git branch --list`

## MCP Tool Routing

| Blocked CLI | Use MCP Tool Instead |
|-------------|---------------------|
| `git commit` | `commit(issue, item, type, description)` |
| `git push` | Automatic after `commit` |
| `gh pr create` | `create_pr(issue, title, body)` |
| `gh pr merge` | `merge_pr(pr)` |
| `gh issue create` | `/codex-gh-issue-start` |
| `gh issue edit` | `refine_issue(issue, action, ...)` |
| `git switch -c` | `/codex-gh-issue-start` for new issue-bound work |
| `git switch` | `switch_branch(branch)` |
| `git tag -a` | `create_tag(name, message)` |

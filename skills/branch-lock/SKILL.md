---
name: branch-lock
description: Enforce branch protection rules — block commits to main, master, or release/* branches. Use this skill whenever a commit is attempted on a protected branch, when someone tries to work directly on main, or when switching to a protected branch with uncommitted changes.
---

# Branch Lock

## Purpose
Prevent accidental commits to protected branches. The `commit` MCP tool already routes through this check, but the hook provides defense-in-depth for any direct `git` CLI usage that bypasses the MCP server.

## Protected Branches

- `main`
- `master`
- `release/*`

## What Happens

The PreToolUse hook runs `branch-lock/check.sh` before any `Bash` tool call:
1. `condition.sh` — activates only when currently on a protected branch
2. `check.sh` — exits 1 (block) if on a protected branch

If blocked, you'll see:
"Commit blocked: direct commits to protected branches are not allowed. Create a feature branch first."

## Resolution

Use `create_branch(slug: "descriptive-name")` to create a feature branch, then retry.

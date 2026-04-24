---
name: guard-write-branch
description: Internal branch safety policy that keeps protected branches out of the formal issue workflow.
---

# Guard Write Branch

## Source Repo Self-Disable

If the current repo top-level contains the packaged `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

This guard prevents direct work on protected branches such as:
- `main`
- `master`
- `release/*`

## Resolution

Route through `handle-issue` so the repository returns to a dedicated issue branch/worktree.

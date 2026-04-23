---
name: guard-write-branch
description: Internal branch safety policy that keeps protected branches out of the formal issue workflow.
---

# Guard Write Branch

This guard prevents direct work on protected branches such as:
- `main`
- `master`
- `release/*`

## Resolution

Route through `handle-issue` so the repository returns to a dedicated issue branch/worktree.

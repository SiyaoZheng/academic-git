---
name: finalize-pr-merge
description: Post-merge cleanup and verification guidance after merge_pr succeeds.
allowed-tools: ["academic-git"]
---

# Finalize PR Merge

`merge_pr` is the single source of truth for PR merge execution.

This skill exists to describe the expected post-merge state:
- repository back on the default branch
- worktree clean
- `locked_issue`, `locked_branch`, and `auto_workflow` cleared

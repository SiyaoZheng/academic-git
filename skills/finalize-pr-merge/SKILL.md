---
name: finalize-pr-merge
description: Post-merge cleanup and verification guidance after merge_pr succeeds.
allowed-tools: ["academic-git"]
---

# Finalize PR Merge

## Source Repo Self-Disable

If the current repo top-level contains the packaged `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

`merge_pr` is the single source of truth for PR merge execution.

This skill exists to describe the expected post-merge state:
- repository back on the default branch
- worktree clean
- `locked_issue`, `locked_branch`, and `auto_workflow` cleared

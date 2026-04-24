---
name: finalize-pr-merge
description: Post-merge cleanup and verification guidance after merge_pr succeeds.
allowed-tools: ["scholaros"]
---

# Finalize PR Merge

## Source Repo Self-Disable

If the current repo top-level contains ScholarOS's own `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing ScholarOS itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

`merge_pr` is the single source of truth for PR merge execution.

This skill exists to describe the expected post-merge state:
- repository back on the default branch
- worktree clean
- `locked_issue`, `locked_branch`, and `auto_workflow` cleared

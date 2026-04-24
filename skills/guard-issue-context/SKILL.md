---
name: guard-issue-context
description: Internal hook policy that prevents project-file edits until fu has an active locked issue and branch context.
allowed-tools: ["fu"]
---

# Guard Issue Context

## Source Repo Self-Disable

If the current repo top-level contains Fu's own `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

This guard blocks writes until fu has an active issue context.

Config files may still be edited without a locked issue:
- `.codex/*`
- `.fu.json`
- `AGENTS.md`
- `.gitignore`
- `README.md`

## Resolution

Route through `handle-issue`, then use:
- `resume_issue(...)` for existing issue branches
- `start_issue(...)` for new issue-bound work

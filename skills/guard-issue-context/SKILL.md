---
name: guard-issue-context
description: Internal hook policy that prevents project-file edits until academic-git has an active locked issue and branch context.
allowed-tools: ["academic-git"]
---

# Guard Issue Context

## Source Repo Self-Disable

If the current repo top-level contains the packaged `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

This guard blocks writes until academic-git has an active issue context.

Config files may still be edited without a locked issue:
- `.codex/*`
- `.fu_git.json` and legacy `.academic-git.json`
- `AGENTS.md`
- `.gitignore`
- `README.md`

## Resolution

Route through `handle-issue`, then use:
- `fu_git resume_issue ...` for existing issue branches
- `fu_git start_issue ...` for new issue-bound work

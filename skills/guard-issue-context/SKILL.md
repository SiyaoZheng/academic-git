---
name: guard-issue-context
description: Internal hook policy that prevents project-file edits until academic-git has an active locked issue and branch context.
allowed-tools: ["academic-git"]
---

# Guard Issue Context

This guard blocks writes until academic-git has an active issue context.

Config files may still be edited without a locked issue:
- `.codex/*`
- `.academic-git.json`
- `AGENTS.md`
- `.gitignore`
- `README.md`

## Resolution

Route through `handle-issue`, then use:
- `resume_issue(...)` for existing issue branches
- `start_issue(...)` for new issue-bound work

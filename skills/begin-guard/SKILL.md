---
name: begin-guard
description: Internal hook policy, not a primary user workflow. Blocks writes until /begin has locked an issue and branch; use the begin skill as the normal entrypoint.
allowed-tools: ["academic-git"]
---

# Begin Guard — Write Block Until /begin

This PreToolUse hook blocks all Write/Edit calls until `/begin` has been run and an issue is locked. It enforces the architectural rule that every change must be traceable to an issue.

## How It Works

1. **condition.sh** — checks if the Write/Edit target is a project file (not config), and no `locked_issue` exists in `.academic-git.json`
2. **check.sh** — outputs a `{"decision": "block", ...}` JSON to prevent the tool call

## Config Files Allowed Without /begin

These files can be edited without a locked issue:
- `.claude/*` — Claude Code configuration
- `.academic-git.json` — plugin state
- `CLAUDE.md` — project instructions
- `.gitignore` — git configuration
- `README.md` — documentation

## Resolution

Run `/begin` to:
1. Pick an existing issue, or
2. Create a new issue

This sets `locked_issue` and `locked_branch` in `.academic-git.json`, which unblocks writing.

## Edge Cases

- Not in a git repo → guard is skipped (degraded mode)
- On wrong branch → guard blocks with "wrong branch" message
- Config files → guard is skipped (no issue needed)

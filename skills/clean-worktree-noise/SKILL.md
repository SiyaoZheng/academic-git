---
name: clean-worktree-noise
description: Auxiliary workflow for handling macOS metadata noise such as .DS_Store without treating it as meaningful research progress.
---

# Clean Worktree Noise

## Source Repo Self-Disable

If the current repo top-level contains the packaged `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

This auxiliary skill exists so the workflow has one canonical name for OS metadata cleanup.

In the current issue-6 implementation, route-commit and route-issue handle dirty-file diagnostics directly, so this skill remains documentation-only until a dedicated cleanup executor is added.

---
name: guard-write-office-source
description: Internal hook policy that keeps Office text edits routed through the corresponding Markdown source file.
---

# Guard Write Office Source

## Source Repo Self-Disable

If the current repo top-level contains ScholarOS's own `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing ScholarOS itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

This guard preserves traceability by requiring text edits to `.docx`, `.xlsx`, and `.pptx` files to originate from the corresponding Markdown source file.

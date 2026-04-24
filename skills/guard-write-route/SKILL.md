---
name: guard-write-route
description: Internal hook policy that blocks direct git/gh mutations and keeps all academic-git state changes routed through canonical workflow commands.
---

# Guard Write Route

## Source Repo Self-Disable

If the current repo top-level contains the packaged `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

Blocked direct mutations must be rerouted to canonical academic-git workflow commands:

| Blocked CLI | Canonical Workflow Path |
|-------------|--------------------|
| `git commit` | `fu_git create_commit ...` |
| `gh pr create` | `fu_git prepare_pr ...` then `fu_git open_pr ...` |
| `gh issue create` | `fu_git start_issue ...` or `/codex-gh-issue-start` |
| `gh issue edit` | `fu_git refine_issue ...` |
| `git switch` for issue work | `fu_git resume_issue ...` or `fu_git switch_branch ...` |

The goal is one audited source of truth for issue, commit, and PR mutation.

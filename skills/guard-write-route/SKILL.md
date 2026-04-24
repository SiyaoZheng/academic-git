---
name: guard-write-route
description: Internal hook policy that blocks direct git/gh mutations and keeps all ScholarOS state changes routed through canonical workflow tools.
---

# Guard Write Route

## Source Repo Self-Disable

If the current repo top-level contains ScholarOS's own `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing ScholarOS itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

Blocked direct mutations must be rerouted to canonical ScholarOS workflow tools:

| Blocked CLI | Canonical ScholarOS Path |
|-------------|--------------------|
| `git commit` | `create_commit(...)` |
| `gh pr create` | `open_pr(...)` |
| `gh issue create` | `start_issue(...)` or `/codex-gh-issue-start` |
| `gh issue edit` | `refine_issue(...)` |
| `git switch` for issue work | `resume_issue(...)` or `switch_branch(...)` |

The goal is one audited source of truth for issue, commit, and PR mutation.

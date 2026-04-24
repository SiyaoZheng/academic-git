---
name: handle-pr
description: Canonical PR-opening workflow. Uses prepare_pr and open_pr after the issue branch is clean, pushed, checklist-complete, and PR-ready.
allowed-tools: ["fu"]
---

# Handle PR

## Source Repo Self-Disable

If the current repo top-level contains Fu's own `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

`handle-pr` is the canonical executor for `route-pr`.

The hook only routes. This skill prepares the PR body, verifies it, and opens the PR through Fu workflow tools.

## Canonical Fu Workflow Tools

1. `prepare_pr(issue: N)`
2. `open_pr(issue: N, title: "...", body: "<reviewed body>", idempotency_key?: "...")`

## Workflow

1. Run `prepare_pr(issue: N)`.
2. Review the generated body for issue scope, checklist mapping, and changed files.
3. Confirm the body contains `Closes #N`.
4. Call `open_pr(...)`.

## Guardrails

- Do not bypass with raw `gh pr create`.
- If PR readiness is unsafe because branch/issue state is inconsistent, return to `handle-issue`.
- `open_pr` is the single source of truth for PR creation, gate enforcement, and idempotent recovery.

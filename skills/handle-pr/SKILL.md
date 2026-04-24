---
name: handle-pr
description: Canonical PR-opening workflow. Uses prepare_pr and open_pr after the issue branch is clean, pushed, checklist-complete, and PR-ready.
allowed-tools: ["academic-git"]
---

# Handle PR

`handle-pr` is the canonical executor for `route-pr`.

The hook only routes. This skill prepares the PR body, verifies it, and opens the PR through the academic-git workflow.

## Canonical Workflow Commands

1. `fu_git prepare_pr N`
2. `fu_git open_pr N --title "..." --body "<reviewed body>" --idempotency-key "..."`

## Workflow

1. Run `fu_git prepare_pr N`.
2. Review the generated body for issue scope, checklist mapping, and changed files.
3. Confirm the body contains `Closes #N`.
4. Call `fu_git open_pr ...`.

## Guardrails

- Do not bypass with raw `gh pr create`.
- If PR readiness is unsafe because branch/issue state is inconsistent, return to `handle-issue`.
- `fu_git open_pr` is the single source of truth for PR creation, gate enforcement, and idempotent recovery.

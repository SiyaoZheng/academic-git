---
name: handle-commit
description: Formal issue-linked commit workflow. Uses create_commit to record one auditable change set tied to one or more checklist items, with explicit paths and automation journal support.
allowed-tools: ["academic-git"]
---

# Handle Commit

## Source Repo Self-Disable

If the current repo top-level contains the packaged `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

`handle-commit` is the canonical executor for `route-commit`.

The hook only routes. This skill decides how to group the diff and then calls `create_commit(...)`.

## Canonical Workflow Command

`create_commit(issue: N, items: ["A", "C"], type: "feat", description: "...", paths: [...], idempotency_key?: "...")`

It produces:

`type(#N/A+C): description`

## Workflow

1. Read `status` and `diff`.
2. Read `view_issue(issue: N)` so checklist grouping stays issue-scoped.
3. Group files by research meaning, not by convenience.
4. Prefer explicit `paths`.
5. Call `create_commit(...)`.

## Guardrails

- Never use raw `git commit`.
- Never create `wip` / `misc` commits just to satisfy routing.
- If issue linkage is unstable or grouping is unclear, go back through `handle-issue` rather than forcing a commit.

## After Create Commit

`create_commit` is responsible for:
- DAG validation
- configured pipeline checks
- gate checks
- commit + push
- automation journal writes

If the branch becomes PR-ready after the commit, the next route should be `handle-pr`, not another ad hoc workflow.

---
name: commit
description: Formal commit tied to a specific Issue checklist item. Format type(#N/X) description. Validates DAG and gates, stages selected paths, commits, and pushes. Use this skill whenever you need to commit changes or save progress on an issue. Do NOT use raw git commit — always route through the academic-git commit tool.
allowed-tools: ["academic-git"]
---

# Commit — Formal Commit with DAG Validation

Every formal commit is tied to a specific Issue checklist item. The `commit` MCP tool handles staging, commit message formatting, DAG validation, pipeline execution, gate checks, and pushing — all in one call.

This skill is also the executor for the Codex Auto-Commit Stop hook. The hook only blocks session end when dirty files remain; it does not create commits itself. When the hook blocks, continue the session, inspect the changes, and use this workflow to create meaningful commits.

## How It Works

The `commit` MCP tool takes these parameters:
- `issue` — the Issue number
- `item` — the checklist letter (A-Z)
- `type` — one of: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`
- `description` — imperative mood, no period
- `paths` — optional explicit file or directory paths to include in this commit

It produces a commit message: `type(#N/X): description`

### What Happens Automatically

1. **DAG check** — all `→ after:` predecessors must be `[x]`, otherwise commit is blocked
2. **Pipeline check** — if `pipeline.run` is set in `.academic-git.json`, it runs first; failure blocks the commit
3. **Gate check** — 9 deterministic rules run; CRITICAL violations block the commit, HIGH are advisory
4. **Stage + commit + push** — if all checks pass, stages `paths` when provided, otherwise stages all dirty files, commits, and pushes

### Example

```
commit(issue: 7, item: "A", type: "feat", description: "add CI/CD gate enforcement to commit hook")
→ Produces: feat(#7/A): add CI/CD gate enforcement to commit hook
```

With explicit paths:

```
commit(
  issue: 7,
  item: "A",
  type: "feat",
  description: "add stop hook auto-commit guard",
  paths: ["hooks/codex/stop.sh", "skills/commit/SKILL.md"]
)
```

## Auto-Commit Hook Recovery

When the Stop hook blocks because the working tree is dirty:

1. Inspect the dirty state with `status` and `diff`.
2. Read the locked Issue if one is configured; otherwise ask Adrian which Issue or checklist item owns the work.
3. Group changes by research meaning, not by convenience. Prefer one commit per checklist item or coherent subtask.
4. Use explicit `paths` for each group. Do not rely on "all dirty files" unless every dirty file belongs in the same commit.
5. Repeat until the working tree is clean, then allow the session to end.

Never create `wip`, `misc`, or `update files` commits to satisfy the hook. If the changes are not ready for a formal commit, ask Adrian whether to refine the Issue, split the task, or intentionally leave the session dirty.

## Mid-Task Progress

If you need to save progress mid-task without completing a checklist item, create a small issue-linked commit only when the diff is coherent and auditable. Do not use raw `git stash` or raw `git commit`; those bypass academic-git controls.

## After Committing

The commit is evidence for the checklist item, but completion is a separate act. Once the checklist item is actually done, call `check_item`.

If that was the last unchecked item, keep going. The Auto-Pull-Request Stop hook will block session end once the branch is clean, pushed, ahead of the default branch, linked to the completed Issue, and has no open PR. At that point run `generate_pr_body` and `create_pr`; do not leave the branch in a PR-ready-but-no-PR state.

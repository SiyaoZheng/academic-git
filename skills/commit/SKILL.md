---
name: commit
description: Formal commit tied to a specific Issue checklist item. Format type(#N/X) description. Validates DAG, checks off item, pushes. Use this skill whenever you need to commit changes, check off a task item, or save progress on an issue. Do NOT use raw git commit — always route through the academic-git commit tool.
allowed-tools: ["academic-git"]
---

# Commit — Formal Commit with DAG Validation

Every formal commit is tied to a specific Issue checklist item. The `commit` MCP tool handles staging, commit message formatting, DAG validation, pipeline execution, gate checks, and pushing — all in one call.

## How It Works

The `commit` MCP tool takes these parameters:
- `issue` — the Issue number
- `item` — the checklist letter (A-Z)
- `type` — one of: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`
- `description` — imperative mood, no period

It produces a commit message: `type(#N/X): description`

### What Happens Automatically

1. **DAG check** — all `→ after:` predecessors must be `[x]`, otherwise commit is blocked
2. **Pipeline check** — if `pipeline.run` is set in `.academic-git.json`, it runs first; failure blocks the commit
3. **Gate check** — 9 deterministic rules run; CRITICAL violations block the commit, HIGH are advisory
4. **Stage + commit + push** — if all checks pass, stages all changes, commits, and pushes

### Example

```
commit(issue: 7, item: "A", type: "feat", description: "add CI/CD gate enforcement to commit hook")
→ Produces: feat(#7/A): add CI/CD gate enforcement to commit hook
```

## Mid-Task Progress

If you need to save progress mid-task without completing a checklist item, use `git stash` — it preserves working tree state without creating a commit that bypasses gates or pollutes the DAG.

## After Committing

The tool automatically checks off the checklist item (calls `check_item` internally). If this was the last item, consider creating a PR with `generate_pr_body` + `create_pr`.

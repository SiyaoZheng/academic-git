---
name: review-pr
description: Prepare and explain a Pull Request. Generates/reviews PR body and preflights local gates, while GitHub Actions plus branch protection are the final server-side merge gate.
allowed-tools: ["academic-git"]
---

# Review PR — Gate-Enforced PR Creation

PR creation is a controlled process: all checklist items must be done, and gate checks must pass before `create_pr` will succeed.

## Workflow

### Step 1: Generate PR Body

```
generate_pr_body(issue: N)
```

This maps each commit (via `type(#N/X)` messages) to its checklist item, producing a draft PR body with changes per item and file listing. Review and adjust before proceeding.

### Step 2: Create PR

```
create_pr(issue: N, title: "...", body: "<from step 1>")
```

The MCP tool automatically:
- Validates all checklist items are `[x]` (uncompleted items block creation)
- Validates PR body includes `Closes #N`
- Runs all 9 gate checks — CRITICAL and HIGH violations block the PR
- MEDIUM/INFO violations are advisory only

### Step 3: After PR is Created

The PR URL is returned. Adrian can review in the browser.

### Step 4: Merge

When approved:
```
merge_pr(pr: N)
```

This squash-merges, deletes the remote branch, switches to main, and pulls.

If the PR should be abandoned instead of merged:
```
close_pr(pr: N, comment: "...", delete_branch: true|false)
```

## Gate Checks (9 Rules, No LLM)

Severities shown are for PR mode. Commit mode may downgrade some.

| Rule | PR Severity | Commit Severity | What It Checks |
|------|-------------|-----------------|----------------|
| checklist-complete | CRITICAL | — (skip) | All items checked off |
| scope-match | MEDIUM | MEDIUM | Diff files match Affected Files |
| silent-failure | CRITICAL | HIGH | No swallowed errors |
| hardcoded-values | CRITICAL | HIGH | No magic numbers, paths, secrets |
| reproducibility | HIGH | MEDIUM | Seeded randomness, fixed params |
| scope-creep | HIGH | MEDIUM | No changes beyond declared scope |
| spec-boundary | MEDIUM | INFO | Art. II — no unbounded specification |
| temporal-marking | MEDIUM | INFO | Art. III — ex post decisions marked |
| convergence-check | CRITICAL | — (skip) | No convergence warnings |

Run `run_gates(issue: N, mode: "pr")` to pre-check before attempting `create_pr`.

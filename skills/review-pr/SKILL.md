---
name: review-pr
description: Review and create a Pull Request. Runs gate checks (CRITICAL + HIGH block PR creation), validates all checklist items are done, generates PR body from commit history. Use this skill whenever all checklist items on an issue are done and you're ready to create a PR, when Adrian says "create PR", "make a PR", "submit this", or when the last item is checked off.
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

## Gate Checks (9 Rules, No LLM)

| Rule | Severity | What It Checks |
|------|----------|----------------|
| checklist-complete | CRITICAL | All items checked off |
| scope-match | HIGH | Diff files match scope declaration |
| silent-failure | HIGH | No swallowed errors |
| hardcoded-values | MEDIUM | No magic numbers |
| reproducibility | MEDIUM | Seeded randomness, fixed params |
| scope-creep | HIGH | No changes beyond declared scope |
| spec-boundary | MEDIUM | Art. II — no unbounded specification |
| temporal-marking | MEDIUM | Art. III — ex post decisions marked |
| convergence-check | CRITICAL | No convergence warnings |

Run `run_gates(issue: N, mode: "pr")` to pre-check before attempting `create_pr`.

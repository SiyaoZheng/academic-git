---
name: review-pr
description: Prepare and explain a Pull Request. Generates/reviews PR body and preflights local gates, while GitHub Actions plus branch protection are the final server-side merge gate.
allowed-tools: ["academic-git"]
---

# Review PR — Gate-Enforced PR Creation

PR creation is a controlled process: all checklist items must be done, and gate checks must pass before `create_pr` will succeed.

This skill is also the executor for the Codex Auto-Pull-Request Stop hook. The hook only blocks session end when a clean issue branch is PR-ready; it does not create a PR itself. When the hook blocks, continue the session and run this workflow.

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
- Fails closed if PR gate checks cannot run
- MEDIUM/INFO violations are advisory only

### Step 3: After PR is Created

The PR URL is returned. Adrian can review in the browser.

## Auto-Pull-Request Hook Recovery

When the Stop hook blocks because a branch is PR-ready:

1. Confirm the hook context says the branch is clean, pushed, ahead of the default branch, linked to an Issue, and has no open PR.
2. Run `generate_pr_body(issue: N)` and review the generated body for issue scope, checklist mapping, and changed files.
3. Call `create_pr(issue: N, title: "...", body: "<reviewed body>")`.
4. If `create_pr` blocks, fix the named checklist, `Closes #N`, or gate problem. Do not bypass it with raw `gh pr create`.

The hook must not create PRs silently. Adrian should be able to inspect the generated PR body and every gate failure before GitHub state changes.

### Step 4: Merge

When approved:
```
merge_pr(pr: N)
```

This squash-merges, deletes the remote branch, switches to main, and pulls.

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

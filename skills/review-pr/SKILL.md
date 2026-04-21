---
name: review-pr
description: Create a PR with full gate checks. Triggered when all Issue checklist items are [x]. Runs gates, generates PR body, performs AI review, then creates PR.
argument-hint: "[issue-number]"
allowed-tools: ["academic-git"]
---

# Review & Create PR

When all checklist items on an Issue are `[x]`, this skill orchestrates PR creation with full verification.

## DISPATCH

Triggered when:
- User says "ready for PR", "all done", "create PR"
- All checklist items on the current Issue are `[x]`

## BEHAVIOR

### 1. Verify Completion

MCP tool: `view_issue(issue)` — confirm ALL non-strikethrough items are `[x]`.
If any unchecked items remain → stop, tell Adrian what's left.

### 2. Run Gates

MCP tool: `run_gates(issue)` — execute all gate checks.

Review violations:
- **CRITICAL** → must fix before PR
- **HIGH** → should fix, flag to Adrian
- **MEDIUM/INFO** → informational, note in PR body

### 3. Generate PR Body

MCP tool: `generate_pr_body(issue)` — auto-generate PR body with item-to-commit mapping.

Review the draft. Adjust if needed.

### 4. AI Review

Claude performs review using the gate results + diff + issue context:

1. **Scope match** — does the PR do what the Issue says?
2. **Silent failures** — any error swallowing?
3. **Hardcoded values** — seeds, paths, keys?
4. **Reproducibility** — set.seed() before randomness?
5. **Scope creep** — changes beyond Issue scope?

### 5. Show Adrian

Present the full PR body to Adrian for confirmation before creating.

### 6. Create PR

MCP tool: `create_pr(issue, title, body)`

The PreToolUse hook will automatically run clean-room pipeline + gates before allowing PR creation.

## OUTPUT RULES

- PR body must include `Closes #N`
- PR body must list changes by checklist item
- PR body must list all changed files
- All CRITICAL gate violations must be resolved before PR

## NON-GOALS

- This skill does NOT merge the PR — use `merge_pr` after review
- This skill does NOT run custom CI — only the configured pipeline + gates

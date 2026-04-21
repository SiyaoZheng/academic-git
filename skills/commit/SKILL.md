---
name: commit
description: Formal commit tied to a specific Issue checklist item. Format type(#N/X) description. Validates DAG, checks off item, pushes. Add `pr` to create PR.
argument-hint: "[optional: pr]"
allowed-tools: ["academic-git"]
---

# Commit

Create a formal commit tied to a specific Issue checklist item.

All git/GitHub operations MUST go through the `academic-git` MCP tools. Never use `git` or `gh` CLI directly.

## Two-Tier Commit System

| Tier | When | Message | Issue-linked? |
|------|------|---------|---------------|
| **wip** (auto-commit hook) | After every Claude response | `wip: file1, file2` | No — safety net only |
| **Formal** (this skill) | Checklist item completed | `type(#N/X): description` | Yes — mandatory |

## Steps

### 1. Read Issue (SSOT)

MCP tool: `view_issue(issue: N)` — read body + comments to get current truth.

### 2. Check Changes

MCP tools:
- `status()` — what files changed
- `diff()` — what changed in those files

### 3. Determine Issue + Item

On a `feat/*` branch, the Issue number and current item should be known from context. If unclear, use `list_issues()` + `view_issue()` to determine.

### 4. Validate DAG

The `commit` MCP tool validates DAG automatically — it checks that all predecessors of the item are `[x]` before allowing the commit. If blocked, it returns an error.

### 5. Commit

MCP tool: `commit(issue, item, type, description)`

This tool:
1. Validates the item exists and is unchecked
2. Checks DAG predecessors are all `[x]`
3. Stages all changes (`git add -A`)
4. Commits with format `type(#N/X): description`
5. Pushes to remote

### 6. Check Off Item

MCP tool: `check_item(issue, letter)` — toggles `- [ ] X.` → `- [x] X.`

### 7. Check for Completion

After checking off, read the Issue again. If ALL items are `[x]`:

#### PR Flow

MCP tools:
- `create_pr(issue, title, body)` — validates all items done, requires `Closes #N`
- `merge_pr(pr)` — squash merge, delete branch, return to main

PR body template:
```
Closes #N

## Summary
[What was done]

## Changes
[Key changes by file/area]

## Verification
[How to verify correctness]
```

If NOT all items done → find next unblocked item and continue.

### 8. Next Item

Read Issue checklist. Find the next `- [ ]` item whose `→ after:` predecessors are all `[x]`. Resume working on that item.

## Commit Types

| Type | When |
|------|------|
| `feat` | New analysis, table, figure |
| `fix` | Data bug, coding error |
| `refactor` | Code restructure, no output change |
| `docs` | Documentation, comments |
| `test` | Tests, verification |
| `chore` | Config, dependencies |
| `perf` | Performance improvement |

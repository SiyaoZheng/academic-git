---
name: refine-issue
description: Modify an existing Issue — add/remove checklist items, adjust scope, update context. All changes are logged as append-only timestamped comments. Issue body is NEVER modified.
argument-hint: "#N [description of change]"
allowed-tools: ["academic-git"]
---

# Refine Issue

Modify an existing Issue's checklist, scope, or context. Two rules are absolute:

1. **Issue body is immutable** — never edit the body after creation
2. **Append-only comments** — every change is a timestamped comment; comments are never edited or deleted

All git/GitHub operations MUST go through the `academic-git` MCP tools. Never use `git` or `gh` CLI directly.

## Architecture

| Layer | What it holds | Mutability |
|-------|--------------|------------|
| Issue body | Original plan (checklist, scope, context) | **Immutable** — frozen at creation |
| Issue comments | All modifications since creation | **Append-only** — never edit, never delete |

Current truth = body + all comments read sequentially.

## Steps

### 1. Read Current State

MCP tool: `view_issue(issue: N)` — returns body + all comments.

Display the current Issue (body + refinement comments) to Adrian.

### 2. Ask Adrian What to Change (AskUserQuestion)

```
Current Issue #N: <title>

Body (original plan):
<checklist summary>

Prior refinements:
<list of refinement comments, if any>

What would you like to change?
(A) Add checklist items
(B) Remove/cancel checklist items
(C) Change scope
(D) Update context
(E) Multiple changes
```

### 3. Log the Change

MCP tool: `refine_issue(issue, action, items_affected, detail, reason, requested_by)`

This creates a single timestamped comment documenting the change. The MCP tool enforces the format.

Rules:
- One comment per refinement
- Always include the reason
- Never edit the Issue body

### 4. Confirm

Show Adrian the comment before posting it.

## How Claude Reads Current State

When resuming work on an Issue, reconstruct current truth:

1. `view_issue(issue: N)` — returns body + all comments
2. Apply refinements sequentially:
   - "Added: F..." → treat F as a new checklist item
   - "Removed: C..." → treat C as cancelled (skip it)
   - "Scope change: ..." → update scope understanding

The first unchecked, non-removed item whose `→ after:` predecessors are all `[x]` is the next item.

## DAG Impact

When adding or removing items, check:
- Adding: cycle? predecessors valid?
- Removing: dependents affected? Note in comment.

## When NOT to Use This Skill

- Checking off a completed item → MCP tool `check_item`
- Creating a brand new Issue → `/create-issue`
- The Issue doesn't exist yet → `/begin`

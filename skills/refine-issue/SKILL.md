---
name: refine-issue
description: Modify an existing Issue — add/remove checklist items, adjust scope, update context. All changes are logged as append-only timestamped comments. Issue body is NEVER modified.
argument-hint: "#N [description of change]"
allowed-tools: ["Bash", "Read"]
---

# Refine Issue

Modify an existing Issue's checklist, scope, or context. Two rules are absolute:

1. **Issue body is immutable** — never edit the body after creation
2. **Append-only comments** — every change is a timestamped comment; comments are never edited or deleted

## Architecture

| Layer | What it holds | Mutability |
|-------|--------------|------------|
| Issue body | Original plan (checklist, scope, context) | **Immutable** — frozen at creation |
| Issue comments | All modifications since creation | **Append-only** — never edit, never delete |

The body tells you WHAT WAS PLANNED. The comments tell you WHAT CHANGED.

Current truth = body + all comments read sequentially.

## Steps

### 1. Read Current State

```bash
ISSUE_NUM="${ARGUMENTS##*#}"  # extract N from #N
gh issue view "$ISSUE_NUM" --json title,body,comments --jq '{title, body, comments: [.comments[] | {body, createdAt}]}'
```

Display the current Issue (body + any existing refinement comments) to Adrian.

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

### 3. Log the Change (append-only comment)

After Adrian confirms, add a single comment documenting the change:

```bash
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
gh issue comment "$ISSUE_NUM" --body "**Refinement (${TIMESTAMP})**

**Action:** [added/removed/scope-change/context-update]
**Items affected:** [A, B, E... or 'scope' or 'context']
**Detail:**
- [precise description of what changed]
- [e.g., 'Added: F. Run placebo test → after: D']
- [e.g., 'Removed: C. No longer needed — merged into B']
- [e.g., 'Scope change: Table 1 now IN scope (was OUT)']

**Reason:** [why — quote Adrian or source]
**Requested by:** [Adrian / coauthor name / reviewer]"
```

Rules:
- One comment per refinement — do not batch multiple refinements into one comment
- Always include the reason — "Adrian said so" is a valid reason
- If removing items, explain why (scope change? no longer needed? merged into another item?)
- Never edit or delete previous comments
- Never edit the Issue body

### 4. Confirm

Show Adrian the comment before posting it.

## How Claude Reads Current State

When resuming work on an Issue, Claude must reconstruct current truth:

1. Read the body (original plan)
2. Read all comments in order
3. Apply refinements sequentially:
   - "Added: F..." → treat F as a new checklist item
   - "Removed: C..." → treat C as cancelled (skip it)
   - "Scope change: ..." → update scope understanding

The first unchecked, non-removed item whose `→ after:` predecessors are all `[x]` is the next item to work on.

## DAG Impact

When adding or removing items, check if the DAG is still valid:
- Adding: does the new item create a dependency cycle? Are its predecessors still valid?
- Removing: does removing this item unblock other items? Do any items depend on it?

If removing an item that others depend on, those dependents must be noted in the comment.

## When NOT to Use This Skill

- Checking off a completed item → that's `/commit` Step 8
- Creating a brand new Issue → that's `/create-issue`
- The Issue doesn't exist yet → use `/begin` first

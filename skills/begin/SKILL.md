---
name: begin
description: Triage a task — continue, supplement, or create new Issue. Routes to the correct branch or invokes /create-issue.
argument-hint: "[task description or #issue-number]"
allowed-tools: ["Bash", "Read"]
---

# Begin — Task Triage

When Adrian describes a task, determine whether it maps to an existing Issue or needs a new one.

## Shortcut

If `$ARGUMENTS` contains `#N` → skip triage, go directly to that Issue's branch.

## Step 1: Gather Context

```bash
gh issue list --state open --limit 20 --json number,title
git branch --list 'feat/*'
```

## Step 2: Ask Adrian (AskUserQuestion)

Present open Issues and ask which path:

```
Open Issues:
#5  Revise Table 3 FE per Li's feedback
#8  Add mechanism section
#12 Fix income variable coding

Your task: "<Adrian's message>"

(A) Continue an existing Issue → which #?
(B) Add to an existing Issue → which #?
(C) New Issue
```

If no open Issues exist → skip to (C).

## Step 3: Execute

### A. Continue existing Issue

```bash
git switch feat/<slug>
gh issue view N --json body --jq '.body'
```

Read the checklist, find the next unblocked item (all `→ after:` predecessors are `[x]`), resume working.

### B. Supplement existing Issue

Invoke `/refine-issue #N` to add new items via append-only comment, then switch:

```bash
git switch feat/<slug>
```

### C. New Issue

Invoke `/create-issue` with Adrian's task description.

## Task Switching

Adrian describes a new task while on `feat/X`:
1. Auto-commit hook saves current state
2. `git switch main`
3. New `/begin` cycle starts

## When NOT to Use Issues

- No GitHub remote on the project
- `gh auth status` fails
- Adrian explicitly says "no issue", "quick fix", or "不用 issue"

In these cases, work directly on main without creating a branch.

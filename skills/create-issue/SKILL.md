---
name: create-issue
description: Draft a new GitHub Issue with DAG checklist, Adrian confirmation, then create branch and start working. Called by /begin when triage result is "New Issue".
argument-hint: "[task description]"
allowed-tools: ["academic-git"]
---

# Create Issue

Draft a new Issue → Adrian confirms → submit → create branch → start working.

All git/GitHub operations MUST go through the `academic-git` MCP tools. Never use `git` or `gh` CLI directly.

## Core Principle: Issue is the Single Source of Truth

The GitHub Issue is the SSOT for every task:

- **What to do** → Issue checklist (`- [ ]` items)
- **What's done** → Issue checklist (`- [x]` items)
- **What's next** → First unchecked item whose `→ after:` predecessors are all `[x]`
- **Is it complete?** → All items `[x]`

**1 Issue = 1 Branch = 1 PR.**

## Steps

### 1. Draft Issue

Write the Issue body using this template, then **display it to Adrian**. Do NOT submit until Adrian confirms.

#### Issue Template

```markdown
# <Title — concise, action-oriented>

## Context
<Why this task exists. Quote the original request verbatim when possible.>

## Task
- [ ] A. <Concrete action item>
- [ ] B. <Concrete action item> → after: A
- [ ] C. <Concrete action item> → after: A
- [ ] D. <Concrete action item> → after: B, C

## Scope
- In: ...
- Out: ...

## Affected Files
- `path/to/file1`

## Verification
- [ ] <Expected output or behavior>
```

Rules for checklist:
- Letter IDs (A, B, C...) for dependency references
- `→ after: X, Y` for dependencies (omit if none)
- Each item = one commit, independently verifiable, binary (done or not)
- No vague items

### 2. Show Adrian (the ONLY manual checkpoint)

Print the draft to terminal. Wait for:
- "行" / "ok" / "go" → submit as-is
- Edits → incorporate and reshow
- "不用 issue" / "quick fix" → skip, work on main

### 3. Submit + Create Branch

MCP tools:
- `create_issue(title, body)` — validates template, creates on GitHub
- `create_branch(slug)` — creates `feat/<slug>`, switches to it

### 4. Start Working

`view_issue(issue)` → read checklist → begin executing first unblocked item.

## On Completion

All items `[x]` → auto PR + merge:
- `create_pr(issue, title, body)` — validates all `[x]`, requires `Closes #N`
- `merge_pr(pr)` — squash merge, delete branch, return to main

## Tags

After milestone merges:
- `create_tag(name, message)` — enforces `(email|meeting|chat|conference)-YYYY-MM-DD`

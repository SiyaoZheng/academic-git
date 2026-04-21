---
name: create-issue
description: Draft a new GitHub Issue with DAG checklist, Codex review, Adrian confirmation, then create branch and start working. Called by /begin when triage result is "New Issue".
argument-hint: "[task description]"
allowed-tools: ["Bash", "Read"]
---

# Create Issue

Draft a new Issue → Codex review → Adrian confirms → submit → create branch → start working.

## Core Principle: Issue is the Single Source of Truth

The GitHub Issue is the SSOT for every task. All other artifacts derive from it:

- **What to do** → Issue checklist (`- [ ]` items)
- **What's done** → Issue checklist (`- [x]` items)
- **What's next** → First unchecked item whose `→ after:` predecessors are all `[x]`
- **Is it complete?** → All items `[x]`
- **Why this task?** → Issue Context section
- **What's in/out of scope?** → Issue Scope section

**1 Issue = 1 Branch = 1 PR.** Each task maps to one Issue, one `feat/<slug>` branch, and eventually one squash-merged PR (`Closes #N`).

## Steps

### 1. Draft Issue

Write the Issue body using this template, then **display it to Adrian** for review. Do NOT submit until Adrian confirms.

#### Issue Template

```markdown
# <Title — concise, action-oriented>

## Context
<Why this task exists. Include:
- Source: email from [who], meeting on [date], reviewer comment, Adrian's own idea
- Quote the original request verbatim when possible
- Link to related Issues if any>

## Task
- [ ] A. <Concrete action item>
- [ ] B. <Concrete action item> → after: A
- [ ] C. <Concrete action item> → after: A
- [ ] D. <Concrete action item> → after: B, C
Rules:
- Use letter IDs (A, B, C...) for dependency references
- Mark dependencies with `→ after: X, Y` (omit if no dependency)
- Each item = one commit, must be independently verifiable and binary (done or not)
- No vague items ("improve X", "clean up Y")
- If an item needs 3+ commits, split it into sub-items
- Claude must respect the DAG: only start an item when ALL its predecessors are `[x]`
- All items `[x]` = auto PR + merge

## Scope
<What is IN scope and what is NOT. Prevents scope creep.>
- In: ...
- Out: ...

## Affected Files
<Best guess of which files will be touched>
- `path/to/file1`
- `path/to/file2`

## Verification
<How to check the task is done correctly>
- [ ] <Expected output or behavior>
```

#### Template selection by trigger type

| Trigger | Context section emphasis |
|---------|------------------------|
| Email from coauthor | Quote the email, name the sender and date |
| Meeting notes | Summarize decisions, list action items |
| Reviewer comment | Quote the reviewer, identify which point (R1.3, R2.1) |
| Adrian's own idea | Capture in Adrian's words, mark as self-initiated |
| Chat message | Quote the message, name the sender |

### 2. Codex Review

After drafting the Issue, run Codex to check it. Keep the prompt minimal:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task \
  "Review this Issue draft. Check: (1) duplicates any open issue? (2) each checklist item verifiable? (3) scope clear? Reply PASS or list problems.\n\nDRAFT:\n${ISSUE_TITLE}\n${ISSUE_BODY}\n\nOPEN ISSUES:\n${OPEN_ISSUES}" \
  --wait
```

If Codex finds problems, fix the draft before showing Adrian. If PASS, proceed.

### 3. Show Adrian (the ONLY manual checkpoint)

Display the drafted Issue in the terminal (not via Read tool — Adrian can't see Read output):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Issue Draft
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Title: Revise Table 3 FE per Li's feedback

## Context
...

## Task
- [ ] ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confirm? (Adrian can edit, add, or say "ok")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Wait for Adrian's response:
- "行" / "ok" / "go" → submit as-is
- Adrian provides edits → incorporate and resubmit
- "不用 issue" / "quick fix" → skip Issue, work on main

### 4. Submit + Create Branch

```bash
# Submit Issue
gh issue create --title "<title>" --body "<body>"
# Capture #N from output

# Generate slug from title
SLUG=$(echo "<short description>" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 40)

# Create branch (check if exists first)
git branch --list "feat/${SLUG}"
# If exists → git switch feat/${SLUG}
# If not → git switch -c "feat/${SLUG}"
```

Slug rules: lowercase English + hyphens, drop prepositions/articles, max 40 chars.

### 5. Notify + Start Working

```
[git] Issue #N: <title> → feat/<slug>
```

Read the Issue checklist and begin executing. The auto-commit Stop hook will silently commit + push on this branch. Claude reads the Issue (`gh issue view N`) before starting each item to check DAG ordering.

## On Completion

Claude judges the task is complete (all checklist items `[x]`) → creates PR → squash merges → cleanup:

```bash
gh pr create --title "feat: <description>" --body "Closes #N\n\n## Summary\n..."
gh pr merge --squash --delete-branch
git switch main
git pull
```

No completion signal from Adrian needed. Claude knows when it's done.

## Tags (milestone markers)

After merging a PR that represents a milestone delivery, tag on main:

```bash
git tag -a "email-2026-04-21" -m "Changes after Li's email re: Table 3"
```

Tag types:
- `email-YYYY-MM-DD` — changes triggered by email
- `meeting-YYYY-MM-DD` — changes after coauthor/advisor meeting
- `chat-YYYY-MM-DD` — changes after chat discussion
- `conference-YYYY-MM-DD` — snapshot for external presentation/submission

Tags are only for milestone deliveries, not every PR.

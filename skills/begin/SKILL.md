---
name: begin
description: Start work from an Issue — match or create Issue, create branch, begin. Auto-triggered by prompt hook when on main.
argument-hint: "[task description or #issue-number]"
allowed-tools: ["Bash", "Read"]
---

# Begin — From Issue to Branch

When Adrian describes a task, match or create an Issue + Branch, then start working.
Auto-triggered: the UserPromptSubmit hook injects git context when on main → Claude invokes this skill if Adrian's message describes a task.

## Core Principle: Issue is the Single Source of Truth

The GitHub Issue is the SSOT for every task. All other artifacts derive from it:

- **What to do** → Issue checklist (`- [ ]` items)
- **What's done** → Issue checklist (`- [x]` items)
- **What's next** → First unchecked item whose `→ after:` predecessors are all `[x]`
- **Is it complete?** → All items `[x]`
- **Why this task?** → Issue Context section
- **What's in/out of scope?** → Issue Scope section

**1 Issue = 1 Branch = 1 PR.** Each task maps to one Issue, one `feat/<slug>` branch, and eventually one squash-merged PR (`Closes #N`).

**Read Issue before every work session.** When switching to a `feat/*` branch, always `gh issue view N` first to sync state. Never rely on memory — the Issue body is truth.

## Steps

### 1. Triage: Continue, Supplement, or New?

First, gather context:
```bash
gh issue list --state open --limit 20 --json number,title,body
git branch --list 'feat/*'
```

Then compare Adrian's message against open Issues. Three outcomes:

#### A. Continue existing Issue (most common)
Adrian's message is about the same task as an open Issue.
- Signal: "继续改 Table 3", "回到那个 robustness check", "上次没做完"
- Action: `git switch feat/<slug>` → resume working. No new Issue needed.

#### B. Supplement existing Issue
Adrian's message adds scope to an open Issue — it's not a new task, it's an extension.
- Signal: "李老师又说 Table 3 还要加 cluster SE", "对了那个 Issue 还需要..."
- Action: Append new checklist items to the existing Issue body:
  ```bash
  # Read current body, append new items
  gh issue edit N --body "<existing body + new items>"
  ```
  Then `git switch feat/<slug>` and continue working.
  Show Adrian the updated Issue before editing.

#### C. New Issue
Adrian's message describes a genuinely different task.
- Signal: "李老师说加一个 mechanism section", "新需求：...", topic clearly different from all open Issues
- Action: → **Step 2** (draft new Issue)

#### Decision rule
Read each open Issue's title AND body (not just title). Compare semantically — "revise Table 3 fixed effects" and "Table 3 要换 FE" are the same Issue even though the words differ. When in doubt, ask Adrian: "This sounds related to Issue #N '<title>'. Continue that one, or new Issue?"

If `$ARGUMENTS` contains `#N` → skip triage, go directly to that Issue.

### 2. Draft Issue (show Adrian before submitting)

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

#### Codex review (before showing Adrian)

After drafting the Issue, run Codex to check it. Keep the prompt minimal:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task \
  "Review this Issue draft. Check: (1) duplicates any open issue? (2) each checklist item verifiable? (3) scope clear? Reply PASS or list problems.\n\nDRAFT:\n${ISSUE_TITLE}\n${ISSUE_BODY}\n\nOPEN ISSUES:\n${OPEN_ISSUES}" \
  --wait
```

If Codex finds problems, fix the draft before showing Adrian. If PASS, proceed.

#### Display format

Show the drafted Issue + Codex verdict to Adrian in the terminal (not via Read tool — Adrian can't see Read output):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Issue Draft
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Title: Revise Table 3 FE per Li's feedback

## Context
...

## Task
- [ ] ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Confirm? (Adrian can edit, add, or say "行")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Wait for Adrian's response:
- "行" / "ok" / "go" → submit as-is
- Adrian provides edits → incorporate and resubmit
- "不用 issue" / "quick fix" → skip Issue, work on main

### 3. Submit Issue

```bash
gh issue create --title "<title>" --body "<body>"
```

Capture the issue number from output.

### 4. Generate Slug

Derive branch name from Issue title (human words, not numbers):

```bash
SLUG=$(echo "<short description>" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 40)
```

Rules:
- Lowercase English + hyphens
- Drop prepositions, articles ("for", "the", "a")
- Keep core content words
- Max 40 characters

### 5. Check for Existing Branch

```bash
git branch --list "feat/${SLUG}"
```

If exists → `git switch feat/${SLUG}` directly. Do not recreate.

### 6. Create Branch

```bash
git switch -c "feat/${SLUG}"
```

No `cd`, no directory change. `CLAUDE_PROJECT_DIR` stays the same.

### 7. Notify Adrian

One line:
```
[git] Issue #N: <title> → feat/<slug>
```

### 8. Start Working

Read the Issue content and begin executing the task checklist. The auto-commit Stop hook will silently commit + push on this branch.

## On Completion

Claude judges the task is complete (all checklist items done) → creates PR → squash merges → cleanup:

```bash
gh pr create --title "feat: <description>" --body "Closes #N\n\n## Summary\n..."
gh pr merge --squash --delete-branch
git switch main
git pull
```

No completion signal from Adrian needed. Claude knows when it's done.

## Task Switching

Adrian describes a new task while on `feat/X`:
1. Auto-commit hook saves current state
2. `git switch main`
3. New `/begin` cycle starts
4. Coming back later: `git switch feat/<previous-slug>`

## Tags (milestone markers)

After merging a PR that represents a milestone delivery, tag on main:

```bash
git tag -a "email-2026-04-21" -m "Changes after Li's email re: Table 3"
git tag -a "meeting-2026-04-21" -m "Post-meeting revisions"
git tag -a "conference-2026-04-21" -m "Version for APSA presentation"
```

Tag types:
- `email-YYYY-MM-DD` — changes triggered by email
- `meeting-YYYY-MM-DD` — changes after coauthor/advisor meeting
- `chat-YYYY-MM-DD` — changes after chat discussion
- `conference-YYYY-MM-DD` — snapshot for external presentation/submission

Tags are only for milestone deliveries, not every PR.

## When NOT to Create an Issue

- No GitHub remote on the project
- `gh auth status` fails
- Adrian explicitly says "no issue", "quick fix", or "不用 issue"

In these cases, work directly on main without creating a branch.

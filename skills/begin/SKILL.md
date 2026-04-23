---
name: begin
description: Triage a task — continue, supplement, or create a new Issue. Routes to the correct issue worktree or prepares a codex-gh-issue-start command. Use this skill whenever a session starts, when Adrian describes a new task, says "let's work on", mentions an issue number, or needs to figure out what to work on next. Also use when switching between tasks or resuming work on an existing issue.
argument-hint: "[task description or #issue-number]"
allowed-tools: ["academic-git", "Bash"]
---

# Begin — Task Triage

When Adrian describes a task, determine whether it maps to an existing Issue or needs a new one.

For new Codex implementation issues, use the local `codex-gh-issue-start` CLI so the Issue, linked branch, and dedicated worktree are created together. For existing academic-git operations, prefer MCP tools unless the current workflow explicitly calls for `gh issue develop` plus `git worktree add`.

## Shortcut

If `$ARGUMENTS` contains `#N` → skip triage, go directly to that Issue's branch.

## Step 1: Gather Context

Use MCP tools:
- `list_issues` — get open Issues
- `list_branches` — get feature branches

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

Use MCP tools:
- `switch_branch(branch: "feat/<slug>")` — switch to the branch
- `view_issue(issue: N)` — read the Issue (body + comments = current truth)

Read the checklist, find the next unblocked item (all `→ after:` predecessors are `[x]`), resume working.

### B. Supplement existing Issue

Invoke `/refine-issue #N` to add new items via append-only comment, then:
- `switch_branch(branch: "feat/<slug>")`

### C. New Issue

Draft the Issue body with the `/create-issue` template, then create it with:

```bash
codex-gh-issue-start --title "<title>" --body-file - --repo OWNER/REPO --base <default-branch>
```

The command creates the GitHub Issue, assigns it to Adrian by default, creates the linked `codex/issue-<number>-<slug>` branch, and opens that branch in a dedicated worktree. Continue work from the printed `worktree:` path.

## Task Switching

Adrian describes a new task while on `feat/X`:
1. Auto-commit hook saves current state
2. New `/begin` cycle starts in the appropriate issue worktree

## When NOT to Use Issues

- No GitHub remote on the project
- Adrian explicitly says "no issue", "quick fix", or "不用 issue"

In these cases, work directly on main without creating a branch.

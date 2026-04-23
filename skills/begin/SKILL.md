---
name: begin
description: Triage a task — continue, supplement, or create new Issue. Routes to the correct branch or invokes /codex-gh-issue-start. Use this skill whenever a session starts, when Adrian describes a new task, says "let's work on", mentions an issue number, or needs to figure out what to work on next. Also use when switching between tasks or resuming work on an existing issue.
argument-hint: "[task description or #issue-number]"
allowed-tools: ["academic-git"]
---

# Begin — Task Triage

`/begin` is the single front door for task routing. Adrian does not choose among multiple paths; the AI resolves the route internally from the task text and repo state.

Git/GitHub mutations usually go through the `academic-git` MCP tools. For code work that needs a tracked branch/worktree, route through `/codex-gh-issue-start`. For issue-only bookkeeping, use `create_issue`. Do not present those as user choices.

## Shortcut

If `$ARGUMENTS` contains `#N` → skip triage, go directly to that Issue's branch.

## Step 1: Gather Context

Use MCP tools:
- `list_issues` — get open Issues
- `list_branches` — get feature branches

## Step 2: Resolve Internally

Use the current branch lock, the explicit issue number in the request, and the task text to choose one route:

1. If a locked issue/branch exists, continue that work.
2. If the request names an issue number, switch to that issue's branch and read the issue.
3. If the request is a refinement of existing scope, call `refine_issue` and continue on the same branch.
4. If the request starts new code work, call `/codex-gh-issue-start`.
5. If the request is issue-only bookkeeping, call `create_issue`.

Never ask Adrian to choose between these routes.

## Step 3: Execute

- For active issue work, use `switch_branch(branch: "<linked issue branch>")` and `view_issue(issue: N)`.
- For new code work, invoke `/codex-gh-issue-start` directly.
- For issue-only bookkeeping, invoke `create_issue(...)` directly.

## Task Switching

If Adrian describes a new task while on an issue branch:
1. Auto-commit hook blocks task switching until dirty work is committed or Adrian explicitly decides how to handle it
2. `switch_branch(branch: "main")`
3. New `/begin` cycle starts

## When NOT to Use Issues

- No GitHub remote on the project
- Adrian explicitly says "no issue", "quick fix", or "不用 issue"

In these cases, work directly on main without creating a branch.

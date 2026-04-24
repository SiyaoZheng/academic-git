---
name: handle-issue
description: Route issue work at message begin or recovery time. Use this skill to decide whether to start a new issue workflow or resume an existing issue branch/worktree, then lock the repository to that issue.
argument-hint: "[task description or #issue-number]"
allowed-tools: ["academic-git"]
---

# Handle Issue

## Source Repo Self-Disable

If the current repo top-level contains the packaged `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

`handle-issue` is the canonical entry skill for academic-git.

Use it when:
- a session starts in an academic-git repository
- `route-issue` sends the model here
- `locked_issue` / `locked_branch` is missing or inconsistent
- Adrian is resuming existing issue work
- Adrian is explicitly starting new issue work

## Canonical Workflow Paths

- `fu_git resume_issue --issue N --branch "codex/issue-N-slug"`
  Use when the issue already exists and the worktree/branch should be locked to it.
- `fu_git start_issue --title "..." --body-file issue-body.md`
  Use when Adrian is explicitly starting new issue-bound work and the system should create the issue, linked branch, and dedicated worktree together.

## Resume Existing Work

1. Read `current_branch` and `status`.
2. If you are already on `codex/issue-N-*`, prefer `fu_git resume_issue`.
3. Read `fu_git view_issue N` to recover the checklist and current truth.
4. Only after issue context is stable should work continue to `handle-commit` or `handle-pr`.

## Start New Work

1. If Adrian is creating a new task, use `fu_git start_issue ...`.
2. Do not use bare `gh issue create`.
3. Do not switch an existing workspace with checkout; issue work must live in a dedicated worktree.

## Recovery Rule

If `route-commit` or `route-pr` is unsafe, the workflow falls back here.

That means `handle-issue` is the safe recovery path for:
- missing or stale `.fu_git.json` locks
- wrong branch or wrong worktree
- unresolved issue ownership
- stale workflow journal state

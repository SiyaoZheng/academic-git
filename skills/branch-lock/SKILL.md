---
name: branch-lock
description: Enforce branch protection rules — block commits to protected branches (main, master, release/*)
---

# Branch Lock

## Purpose
Prevent accidental commits to protected branches (main, master, release/*).

## Rules
1. NEVER commit directly to `main`, `master`, or `release/*` branches.
2. Always work on a feature branch.
3. Use `git checkout -b feat/<issue-number>-<short-description>` to create branches.

## Condition
This skill activates when the current branch matches a protected pattern.

## Failure Message
"Commit blocked: direct commits to protected branches are not allowed. Create a feature branch first."

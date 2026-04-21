---
name: post-merge
description: Cleanup after PR merge — verify clean state on main, close linked issues. Use this skill after a PR is merged, when Adrian says "merge done", "cleanup", or when the merge_pr tool has been called and you need to verify the repo is clean.
allowed-tools: ["academic-git"]
---

# Post-Merge — Verification & Cleanup

The `merge_pr` MCP tool handles squash-merge + branch deletion + switch to main automatically. This skill covers the verification and issue closure that should follow.

## What `merge_pr` Already Does

- Squash-merges the PR
- Deletes the remote branch
- Switches to main and pulls

## Post-Merge Checklist

1. **Verify working tree** — `status` should show `(clean)`
2. **Close linked issue** — add a comment referencing the merged PR, then close:
   ```
   gh issue close N --comment "Closed by PR #M"
   ```
3. **Check for stale branches** — `list_branches` to see if other branches need cleanup

## Condition

This skill activates when a merge commit is detected (2+ parents on HEAD).

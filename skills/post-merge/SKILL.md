---
name: post-merge
description: Post-merge follow-up after GitHub Actions and branch protection have accepted a PR. Verifies clean state, summarizes open issues, and guides the next task.
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
   close_issue(issue: N, comment: "Closed by PR #M", reason: "completed")
   ```
3. **Check for stale branches** — `list_branches` to see if other branches need cleanup

## Condition

This skill activates when a merge commit is detected (2+ parents on HEAD).

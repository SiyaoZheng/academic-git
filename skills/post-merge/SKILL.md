---
name: post-merge
description: Post-merge follow-up after GitHub Actions and branch protection have accepted a PR. Verifies clean state, summarizes open issues, and guides the next task.
allowed-tools: ["academic-git"]
---

# Post-Merge — Verification & Cleanup

The `merge_pr` MCP tool handles the GitHub squash merge and then runs explicit, auditable cleanup steps. This skill covers the verification and issue closure that should follow.

## Hook Wiring

`hooks/codex/hooks.json` runs this skill through `hooks/hook-runner.sh` on `PostToolUse`; `condition.sh` activates only for MCP tool names ending in `merge_pr`. Do not key this skill on local merge commits because `merge_pr` uses GitHub squash merge plus local fast-forward cleanup.

## What `merge_pr` Already Does

- Reads the PR head branch before merging
- Records the PR head commit OID and refuses branch deletion if a same-named ref has moved
- Squash-merges the PR on GitHub without using `gh pr merge --delete-branch`
- Returns the primary worktree to the default branch and pulls with `--ff-only`
- Removes the clean dedicated issue worktree that owns the PR head branch
- Deletes the local PR branch after the worktree no longer owns it
- Deletes the remote PR branch explicitly only after local worktree/branch cleanup is safe, and only when the PR is not cross-repository
- Reports each cleanup step separately so a successful GitHub merge is not hidden by a local cleanup problem

## Post-Merge Checklist

1. **Inspect cleanup statuses** — `merge_pr` should report `[ok]` or `[skipped]` for every cleanup step; any `[failed]` step is a manual follow-up even though the PR may already be merged on GitHub.
2. **Verify working tree** — `status` should show `(clean)`
3. **Confirm branch/worktree cleanup** — `list_branches` should not show the merged PR branch, and dedicated issue worktrees for that branch should be absent. If cleanup reports a ref/OID mismatch, inspect manually before deleting anything; it means the branch name no longer points at the merged PR head.
4. **Close linked issue** — add a comment referencing the merged PR, then close:
   ```
   close_issue(issue: N, comment: "Closed by PR #M", reason: "completed")
   ```
5. **Check for stale branches** — `list_branches` to see if other branches need cleanup

## Condition

This skill activates on `PostToolUse` payloads whose MCP tool name ends in `merge_pr`.

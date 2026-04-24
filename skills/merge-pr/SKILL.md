---
name: merge-pr
description: Complete a Pull Request through the academic-git merge_pr workflow command with worktree-safe cleanup semantics.
allowed-tools: ["academic-git"]
---

# Merge PR — Worktree-Safe Completion

Use this skill whenever a PR is ready to merge. It is the main workflow skill for the `merge_pr` command; `finalize-pr-merge` is only the after-action follow-up.

## Hook Wiring

`hooks/codex/hooks.json` runs this skill through `hooks/hook-runner.sh` on `PreToolUse`; `condition.sh` activates only for workflow command names ending in `merge_pr`. Direct `gh pr merge` and `git merge` are blocked by `guard-write-route` and routed back here before execution.

## Required Tool

```
merge_pr(pr: N)
```

## What The Skill Enforces Before Execution

- The PR number is present.
- GitHub can report the PR head branch and head commit OID.
- The PR is still open before the workflow attempts the GitHub merge.
- The merge path is explicit: no `gh pr merge --delete-branch`, no raw branch deletion, and no forced local worktree removal.

## Cleanup Contract

After the preflight passes, `merge_pr` must:

- Squash-merge the PR on GitHub.
- Return the safe primary worktree to the default branch and pull with `--ff-only`.
- Remove a clean dedicated issue worktree before deleting branch refs.
- Delete only local and remote refs that still point at the recorded PR head OID.
- Report each cleanup step as `[ok]`, `[skipped]`, or `[failed]`.
- Preserve branch refs when local worktree cleanup did not complete, so manual recovery remains possible.

## Failure Semantics

If GitHub merge succeeds but any cleanup step fails, treat the PR as remotely merged and the local cleanup as incomplete. Do not re-run raw git or gh cleanup commands; inspect the reported step and either repair manually with explicit evidence or create a follow-up issue.

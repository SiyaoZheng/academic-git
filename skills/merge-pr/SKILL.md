---
name: merge-pr
description: Complete a Pull Request through the academic-git merge_pr workflow command with worktree-safe cleanup semantics.
allowed-tools: ["academic-git"]
---

# Merge PR — Worktree-Safe Completion

## Source Repo Self-Disable

If the current repo top-level contains the packaged `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

Use this skill whenever a PR is ready to merge. It is the main workflow skill for `fu_git merge_pr`; `finalize-pr-merge` is only the after-action follow-up.

## Hook Wiring

`hooks/codex/hooks.json` runs this skill through `hooks/hook-runner.sh` on `PreToolUse`; `condition.sh` activates only for workflow command names ending in `merge_pr`. Direct `gh pr merge` and `git merge` are blocked by `guard-write-route` and routed back here before execution.

## Required Tool

```bash
fu_git merge_pr <pr-number>
```

## What The Skill Enforces Before Execution

- The PR number is present.
- GitHub can report the PR head branch and head commit OID.
- The PR is still open before the workflow attempts the GitHub merge.
- The merge path is explicit: no `gh pr merge --delete-branch`, no raw branch deletion, and no forced local worktree removal.

## Cleanup Contract

After the preflight passes, `fu_git merge_pr` must:

- Squash-merge the PR on GitHub.
- Return the safe primary worktree to the default branch and pull with `--ff-only`.
- Remove a clean dedicated issue worktree before deleting branch refs.
- Delete only local and remote refs that still point at the recorded PR head OID.
- Report each cleanup step as `[ok]`, `[skipped]`, or `[failed]`.
- Preserve branch refs when local worktree cleanup did not complete, so manual recovery remains possible.

## Failure Semantics

If GitHub merge succeeds but any cleanup step fails, treat the PR as remotely merged and the local cleanup as incomplete. Do not re-run raw git or gh cleanup commands; inspect the reported step and either repair manually with explicit evidence or create a follow-up issue.

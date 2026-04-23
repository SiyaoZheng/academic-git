---
name: codex-gh-issue-start
description: Create a new GitHub issue through the local CLI workflow, then create its linked codex/issue branch and open it in a dedicated git worktree. Use this skill whenever Adrian asks to create a new issue, track a new implementation task, or start new issue-bound work. Do not use the GitHub connector, MCP issue-creation tools, or bare gh issue create for these requests.
argument-hint: "[issue title or task description]"
allowed-tools: ["Bash"]
---

# Codex GitHub Issue Start

Use this skill as the single issue-start entrypoint for academic-git. It creates the issue, creates the linked branch with `gh issue develop`, and opens that branch in a dedicated git worktree so new work does not continue on `main` or `master`.

## When To Use

- Adrian asks to create an issue.
- Adrian asks to track or start a new implementation task.
- `handle-issue` routes to "new issue".
- A hook reports that an issue was created through the GitHub connector or bare `gh issue create`.

## Do Not Use

- Do not call the GitHub connector issue tool.
- Do not recreate or call an MCP issue-creation tool for normal Codex issue-start work.
- Do not run bare `gh issue create` or `gh issue new`.
- Do not run any form of `git checkout`.

## Issue Body Template

Create a body with these sections before invoking the script:

```markdown
## Context

Why this is needed. Link the request, decision, or observed failure.

## Task

- [ ] A. First concrete task item → after: (none)
- [ ] B. Second concrete task item → after: A

## Scope

In scope and out of scope boundaries.

## Affected Files

Expected files or directories.

## Verification

How to verify the issue is ready to work on.
```

Every checklist item must have a stable letter ID and an `after:` dependency declaration.

## Command

From a repository with a GitHub remote, run the plugin-owned entrypoint:

```bash
PLUGIN_ROOT="${ACADEMIC_GIT_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-.}}"
"$PLUGIN_ROOT/scripts/codex-gh-issue-start" --title "Imperative issue title" <<'EOF'
## Context

...

## Task

- [ ] A. ... → after: (none)

## Scope

...

## Affected Files

...

## Verification

...
EOF
```

The script validates the template, runs `gh issue create`, creates a linked branch named `codex/issue-<number>-<slug>` with `gh issue develop`, and then runs `git worktree add` for that branch. It prints `CODEX_ISSUE_START_OK`, the issue URL, branch, and worktree path on success.

## Options

- `--base <branch>` overrides the detected default branch.
- `--branch <name>` overrides the generated `codex/issue-<number>-<slug>` branch.
- `--worktree-dir <path>` overrides the generated sibling worktree path.
- `--worktree-parent <path>` chooses a parent directory for the generated worktree.
- `--label <label>` may be repeated.
- `--assignee <user>` may be repeated; default is `@me`.
- `--no-assignee` creates the issue without an assignee.
- `--dry-run` prints the commands without creating anything.

## Repair Path

If an issue already exists because the wrong tool was used, do not create a duplicate. Continue by creating the linked branch and worktree:

```bash
gh issue develop <issue-number-or-url> --name codex/issue-<number>-<slug> --base <default-branch>
git worktree add <path> codex/issue-<number>-<slug>
```

After the worktree exists, continue issue work from that worktree.

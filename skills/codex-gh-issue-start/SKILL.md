---
name: codex-gh-issue-start
description: Validate and route new issue-bound work through the skill-owned issue-start workflow. Use this skill whenever Adrian asks to create an issue, track a new implementation task, or start new issue-bound work. Do not use the GitHub connector, standalone issue-only tools, or bare gh issue create for issue-bound code work.
argument-hint: "[issue title or task description]"
allowed-tools: ["Bash", "scholaros"]
---

# Codex GitHub Issue Start

## Source Repo Self-Disable

If the current repo top-level contains ScholarOS's own `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing ScholarOS itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

Use this skill as the internal issue-start routine for ScholarOS. It owns the issue-start policy and body contract, then routes mutation through ScholarOS workflow tools.

## Architecture Contract

`codex-gh-issue-start` follows the hook-skill-workflow philosophy:

- Hooks are involuntary guards. They block bare `gh issue create`, `gh issue develop --checkout`, and any attempt to skip this skill's issue-body check.
- This skill owns workflow judgment, the issue body template, and the DAG checklist validation. The executable check is `skills/codex-gh-issue-start/check.sh`.
- ScholarOS workflow tools own ordinary auditable GitHub and Git mutations, such as issue-only bookkeeping, append-only issue refinement, commits, PRs, gates, and lint.

Mutation must move through ScholarOS workflow tools or an explicitly implemented issue-start primitive.

## When To Use

- Adrian asks to create an issue.
- Adrian asks to track or start a new implementation task.
- `handle-issue` routes to "new issue".
- A hook reports that an issue was created through the GitHub connector or bare `gh issue create`.
- The task needs issue-start policy, DAG validation, and routing into ScholarOS-owned mutation.

## Do Not Use

- Do not call the GitHub connector issue tool.
- Do not recreate or call standalone `create_issue` when the task also needs the linked branch/worktree; use this skill instead.
- Do not run bare `gh issue create` or `gh issue new`.
- Do not run any form of `git checkout`.

## Issue Body Template

Create a body with these sections before running the skill check:

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

Every checklist item must have a stable letter ID and an `after:` dependency declaration. The skill-owned check accepts either `→ after:` or `-> after:`, rejects duplicate letters, rejects undeclared dependencies, and rejects dependency cycles.

## Skill Check

After drafting the issue body, run the skill-owned validation check:

```bash
PLUGIN_ROOT="${SCHOLAROS_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-.}}"
bash "$PLUGIN_ROOT/skills/codex-gh-issue-start/check.sh" --body-file path/to/issue-body.md
```

The check validates the required sections, stable letter IDs, explicit `after:` declarations, declared dependencies, and acyclic checklist graph. It does not create a GitHub issue, branch, or worktree.

## Mutation Boundary

For issue-only bookkeeping, use `create_issue`. When assignees are omitted, ScholarOS defaults the new issue to Adrian via GitHub's `me` assignee.

For issue-bound code work that needs issue + linked branch + dedicated worktree, use `start_issue` after the body passes this skill check. `start_issue` creates the GitHub Issue, linked `codex/issue-*` branch, and dedicated sibling worktree without switching the current worktree. When assignees are omitted, the created issue defaults to Adrian via GitHub's `me` assignee; explicit assignee lists override that default.

## Repair Path

If an issue already exists because the wrong tool was used, do not create a duplicate. Continue by creating the linked branch and worktree:

```bash
gh issue develop <issue-number-or-url> --name codex/issue-<number>-<slug> --base <default-branch>
git worktree add <path> codex/issue-<number>-<slug>
```

After the worktree exists, continue issue work from that worktree.

This repair path is a hook-directed repair exception for already-created issues. Do not use it as a general escape hatch, do not use it for new issue creation, and never add `--checkout`.

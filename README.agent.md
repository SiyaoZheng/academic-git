# Fu Agent Guide

This is the agent-facing companion to `README.md` for an open-source community project.

- `README.md` explains the project in human terms.
- This file explains how to operate in this repository.
- Treat the repository as a workflow system, not as a plain codebase.

## What Fu Is

Fu supports research workflows that prioritize:

- reproducibility
- traceability
- artifact-centered work
- explicit task boundaries
- recoverable state

In Fu, reproducibility does not mean only preserving code and final outputs. It also means preserving the exploratory process: the sequence of questions, trials, revisions, and decisions that led to the result.

The repository is organized around enforcement hooks, workflow skills, and supporting scripts.

## Repository Map

- `hooks/` contains enforcement hooks that block unsafe or out-of-policy actions.
- `skills/` contains workflow playbooks and operational guidance.
- `scripts/` contains helper scripts only. Issue-start policy lives in skills and hook-owned checks.
- `.codex-plugin/` contains plugin metadata used by the local Codex setup.
- `index.html` provides a visual overview page.
- `README.md` is the human-facing overview.
- `README.agent.md` is this agent-facing operational guide.

## Operating Model

- One session should correspond to one research task.
- One task may span multiple sessions.
- Do not try to complete multiple research tasks inside one session.
- If a task is new, open a fresh session and keep the work boundary clean.
- If a task continues an existing issue or branch, resume that work instead of starting over.

## Recommended Workflow

1. Triage the task with the `handle-issue` skill.
2. If this is new work, use the `codex-gh-issue-start` route so issue-start policy and DAG validation happen before `fu_git start_issue` creates the issue, branch, and worktree.
3. If the task already exists, switch to the linked branch and continue there.
4. Keep the work scoped to the issue or task boundary.
5. Use the `handle-commit` skill for formal commits tied to checklist items.
6. Close out the session only when the worktree is clean or the remaining dirty state is intentional.

## Runtime Note

- This repository no longer ships a repo-local backend server or the legacy backend workspace.
- The workflow backend is the system-installed `fu_git` CLI. `codex-gh-issue-start` is the issue-start skill and body-contract gate, not a separate backend.
- Validation lives in the hook-owned shell/Python checks and any workflow-specific dry runs the current task requires.

## Workflow Rules

- Never run `git checkout`.
- Prefer the provided skills and `fu_git` commands over raw `git` or `gh` commands.
- Use the issue-start workflow for new issue-bound work.
- Treat `codex-gh-issue-start` as the issue SSOT boundary: hooks guard, the skill validates policy, and `fu_git start_issue` owns issue/branch/worktree mutation. Do not split a new implementation task across separate issue and branch tools.
- Keep issue, branch, and worktree aligned when the task is issue-bound.
- Preserve user changes unless the user explicitly asks for a revert.
- Treat hooks as enforcement, not suggestions.

## How To Read The Human README

The human README explains why Fu exists and what kind of research practice it supports.

When translating that README into action, use this mapping:

- philosophy and research rationale become workflow constraints
- artifact-centered thinking becomes traceability requirements
- session-level task boundaries become one-task-per-session behavior
- reproducibility concerns become type-checking, clean state, and explicit commits
- hidden work by Fu becomes the use of the repo’s tools instead of ad hoc manual steps

## When To Stop and Ask

Ask the maintainer or issue author when:

- a task could reasonably map to more than one issue
- a change would broaden scope
- a revert would affect work you did not author
- a command would mutate state in a risky or ambiguous way
- the repository structure and the request do not obviously match

## Practical Priority

If there is a conflict between convenience and traceability, choose traceability.

If there is a conflict between a quick ad hoc step and a workflow-backed step, choose the workflow-backed step.

If there is a conflict between writing code and preserving research meaning, preserve the research meaning first.

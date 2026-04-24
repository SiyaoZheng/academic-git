# ScholarOS Repository Skill

This skill captures the real repository conventions for ScholarOS's own source tree.

ScholarOS is Adrian's original open-source workflow project, started from scratch. It is a local governance layer for research and open-source implementation work, with primary relevance to computational social science scholars and AI for Social Science scholars.

## Important Scope Rule

When you are inside ScholarOS's own source repository, ScholarOS is self-disabled.

- Do not use ScholarOS to govern ScholarOS.
- Do not rely on ScholarOS hooks or workflow tools as enforcement inside this repository.
- Work in plain code mode and test the relevant hook, skill, or script entrypoints directly.

Treat the current repo as ScholarOS's own source when its top-level contains:

- `.codex-plugin/plugin.json` with `name: "scholaros"`
- `hooks/codex/hooks.json`
- `skills/handle-issue/SKILL.md`

## What This Repository Actually Contains

- `hooks/`: enforcement logic and hook entrypoints
- `skills/`: workflow playbooks and guard logic
- `scripts/`: helper scripts and focused tests
- `.codex-plugin/`, `.claude-plugin/`, `.codex/`: packaged plugin metadata and local baseline config

This is not a JavaScript application codebase. Do not infer JS-specific conventions such as `camelCase` file naming, `import/export` style rules, `*.test.*` naming, or generic Node test workflows unless a specific subdirectory explicitly uses them.

## Core Project Intent

When formalizing what ScholarOS is trying to do, emphasize:

- research integrity over convenience
- reproducibility of process, not just final artifacts
- traceable issue, branch, worktree, commit, and PR boundaries
- append-only issue history and explicit ex post decisions
- recoverable local state after interruptions, merges, and tool failures
- clear task boundaries that reduce HARKing-like drift
- open, inspectable infrastructure that can support methodological contribution and field-building

ScholarOS is open-source and public-facing, but it is not a startup pitch, a client services project, or a repair/fork of someone else's system.

## Working Conventions

- Preferred new-task workflow: `skills/codex-gh-issue-start/SKILL.md`
- Canonical branch naming: `codex/issue-<number>-<slug>`
- Canonical task unit: `1 issue = 1 branch = 1 PR`
- Avoid direct `git` / `gh` mutation in governed repos; use ScholarOS workflows there
- In ScholarOS's own source repo, edit and test directly because self-disable is intentional

## Build And Verification

- There is no `mcp/` directory or repo-local MCP server in this checkout anymore.
- No repo-wide build or type-check command is currently configured.
- Validate changes by running the affected hook, skill, or script entrypoints directly.
- Workspace config/state may appear as `.scholaros_git.json`, `.scholaros-git.json`, or `.scholaros.json`; none of these are plugin activation flags.

## Practical Guidance

- Read root `AGENTS.md` first for the authoritative repo rules.
- Use `README.agent.md` for the operator-facing explanation of how to work in the repo.
- Treat auto-generated repository summaries as suspect if they conflict with actual files, scripts, or tests.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Type-Check

```bash
cd mcp && npx tsc --noEmit    # Type-check (no build script configured)
```

No test runner, linter, or CI pipeline exists yet. The MCP server runs via stdio transport launched by the Claude Code plugin system.

## Architecture: Thin Harness, Fat Skills & Hooks

Three layers with distinct roles:

| Layer | Role | Location |
|-------|------|----------|
| **MCP server** (thin) | Data primitives — CRUD GitHub/git via `gh` CLI | `mcp/src/server.ts`, `mcp/src/gates.ts` |
| **Hooks** (fat, 1st-class) | Process enforcement — automatic, involuntary | `hooks/`, `skills/*/condition.sh` + `check.sh` |
| **Skills** (fat) | Creative judgment — how to do things | `skills/*/SKILL.md` |

**Hooks check RESULTS, not whether skills were called.** If a gate isn't passed, the hook blocks the MCP tool call and outputs guidance to run the relevant skill.

## Hook-Runner Framework

`hooks/hook-runner.sh <skill-dir> [--block]` is a generic two-layer wrapper:

1. Runs `<skill-dir>/condition.sh` — non-zero exit = skip silently (condition not met)
2. Runs `<skill-dir>/check.sh` — non-zero exit = check failure
3. If `--block` flag set AND check failed → exit 2 (blocks tool call in PreToolUse)

Hook wiring in `hooks/hooks.json`:

| Event | Matcher | Skill | Blocks? |
|-------|---------|-------|---------|
| `PreToolUse` | `Bash` | `git-firewall` | Yes |
| `PreToolUse` | `Bash` | `branch-lock` | Yes |
| `PreToolUse` | `create_pr` | `review-pr` | Yes (clean-room) |
| `PostToolUse` | `commit` | `commit` | No (output only) |
| `PostToolUse` | `merge_pr` | `post-merge` | No (output only) |
| `SessionStart` | — | `begin` | No |
| `Stop` | — | `begin` (wip) | No |

## MCP Server Structure (`mcp/src/server.ts`)

Helpers: `run()`, `runSafe()` (local git), `runWithRetry()` (gh API with quadratic backoff), `classifyGhError()`, `parseGhError()`.

Tools organized by category:
- Read: `status`, `diff`, `log`, `current_branch`
- Issues: `list_issues`, `view_issue`, `create_issue`, `refine_issue`, `check_item`
- Commits: `commit` (DAG-validated), `wip` (safety net)
- PRs: `generate_pr_body`, `create_pr`, `merge_pr`, `view_pr`
- Branches: `create_branch`, `switch_branch`, `list_branches`
- Tags: `create_tag`
- Gates: `run_gates`

## Gate Engine (`mcp/src/gates.ts`)

9 deterministic rules (no LLM), severity levels: CRITICAL/HIGH/MEDIUM/INFO.

`runAllGates(ctx)` takes a `GateContext` (issue body, checklist, diff, commits, branch) and returns `GateResult` with violations. Rules: `checklist-complete`, `scope-match`, `silent-failure`, `hardcoded-values`, `reproducibility`, `scope-creep`, `spec-boundary` (Art. II), `temporal-marking` (Art. III), `convergence-check` (Art. IV).

## Key Conventions

- **1 Issue = 1 Branch = 1 PR** — issue body is immutable; changes via append-only comments
- **Commit format**: `type(#N/X): description` (N=issue, X=checklist letter)
- **Branch naming**: `feat/<slug>` (lowercase, hyphens, max 40 chars)
- **Tag format**: `(email|meeting|chat|conference)-YYYY-MM-DD`
- **No direct git/gh CLI** — git-firewall hook blocks all direct calls; use MCP tools
- **Project config**: `.academic-git.json` stores `pipeline.run`, `pipeline.clean_run`, `locked_branch`, `locked_issue` (created on first use, gitignored)

## Two-Tier CI/CD

- **Every commit**: cached pipeline run (`.academic-git.json pipeline.run`) + all gates
- **PR creation**: clean-room pipeline (`.academic-git.json pipeline.clean_run`) + all gates (enforced by PreToolUse hook)

Pipeline commands are project-specific, not hardcoded. First use: ask the user what the verification command is.

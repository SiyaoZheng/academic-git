# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Build & Type-Check

```bash
cd mcp && npx tsc --noEmit    # Type-check (no build script configured)
```

No test runner or CI pipeline exists in this source repo yet. The MCP server runs via stdio transport launched by the plugin system. Workspace config/state may be stored in `.academic-git.json` when a workflow needs it, but that file is not a plugin activation flag.

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
| `Stop` | — | `auto-commit` + `begin` | No |

## MCP Server Structure (`mcp/src/server.ts`)

Helpers: `run()`, `runSafe()` (local git), `runWithRetry()` (gh API with quadratic backoff), `classifyGhError()`, `parseGhError()`.

Tools organized by category:
- Read: `status`, `diff`, `log`, `current_branch`
- Issues: `list_issues`, `view_issue`, `create_issue` (template validation only for Codex; create implementation Issues with `codex-gh-issue-start`), `refine_issue`, `check_item`
- Commits: `commit` (DAG-validated)
- PRs: `generate_pr_body`, `create_pr`, `merge_pr`, `view_pr`
- Branches: `create_branch`, `switch_branch`, `list_branches`
- Tags: `create_tag`
- Gates: `run_gates`
- Lint: `lint` (runs only configured `lint.python` and `lint.r`)

## Gate Engine (`mcp/src/gates.ts`)

9 deterministic rules (no LLM), severity levels: CRITICAL/HIGH/MEDIUM/INFO.

`runAllGates(ctx)` takes a `GateContext` (issue body, checklist, diff, commits, branch) and returns `GateResult` with violations. Rules: `checklist-complete`, `scope-match`, `silent-failure`, `hardcoded-values`, `reproducibility`, `scope-creep`, `spec-boundary` (Art. II), `temporal-marking` (Art. III), `convergence-check` (Art. IV).

## Key Conventions

- **1 Issue = 1 Branch = 1 Worktree = 1 PR** — issue body is immutable; changes via append-only comments
- **Commit format**: `type(#N/X): description` (N=issue, X=checklist letter)
- **Branch naming**: `codex/issue-<number>-<slug>` for Codex implementation work
- **Tag format**: `(email|meeting|chat|conference)-YYYY-MM-DD`
- **No bare issue creation** — new Codex implementation Issues use `codex-gh-issue-start`, not GitHub connector/MCP `create_issue` or bare `gh issue create`
- **Optional workspace config/state**: `.academic-git.json` can store `pipeline.run`, `pipeline.clean_run`, `lint.python`, `lint.r`, `renv.working_directory`, `locked_branch`, `locked_issue` when needed (created on first use, should be gitignored)

## Remote CI and Local Lint

- **Remote CI**: the authoritative reproducibility check runs the project-defined pipeline command on GitHub Actions.
- **Local lint**: fast data-science lint runs only the configured Python and R commands (`lint.python`, `lint.r`).
- **Formal commits**: the MCP `commit` tool still runs configured commit-time checks and gates before staging, committing, and pushing.

Pipeline commands are project-specific, not hardcoded. First use: ask the user what the verification command is.


<claude-mem-context>
# Memory Context

# [academic-git] recent context, 2026-04-23 11:08am GMT+8

No previous sessions found.
</claude-mem-context>

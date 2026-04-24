---
name: refine-issue
description: Refine an existing GitHub Issue by adding an append-only comment (body is immutable). Adds context, splits scope, or updates acceptance criteria. Use this skill when Adrian wants to add items to an issue, change scope, update requirements, or when handle-issue routes to supplement existing issue work.
allowed-tools: ["academic-git"]
---

# Refine Issue — Append-Only Comments

## Source Repo Self-Disable

If the current repo top-level contains the packaged `.codex-plugin/plugin.json`, `hooks/codex/hooks.json`, and `skills/handle-issue/SKILL.md`, then you are developing Fu itself. This skill is disabled there, including linked worktrees of the same repo. Work on the repository in plain code mode instead.

The issue body is **immutable** — it's the single source of truth. All changes are made through the `refine_issue` workflow command, which adds a structured comment to the issue.

## How It Works

```
refine_issue(
  issue: N,
  action: "added" | "removed" | "scope-change" | "context-update",
  items_affected: "A, B, E" or "scope",
  detail: "What changed",
  reason: "Why it changed",
  requested_by: "Adrian"
)
```

This produces a timestamped comment:

```
**Refinement (2026-04-21 14:30)**

**Action:** added
**Items affected:** A, B
**Detail:** Added new items for convergence checking and spec-boundary validation

**Reason:** Feedback from review meeting
**Requested by:** Adrian
```

## Rules

1. **Never edit the issue body directly** — `codex-gh-issue-start` validates body format on creation; editing it risks breaking the DAG structure that `create_commit` and `check_issue` depend on
2. **Read before refining** — use `view_issue(issue: N)` to see the current state including comments
3. **All refinements are append-only** — this preserves audit trail (Art. VI traceability)
4. **If scope grows too large** — propose splitting into a new issue and linking via `parent: #N`

---
name: create-issue
description: Legacy MCP issue template reference. For normal Codex issue-start work, use codex-gh-issue-start instead so the GitHub issue, linked branch, and dedicated worktree are created together. Keep this skill only as the body template reference for MCP-only workflows.
allowed-tools: ["academic-git"]
---

# Create Issue — DAG Checklist Template

Preferred path: use `/codex-gh-issue-start`. Do not use the GitHub connector, MCP `create_issue`, or bare `gh issue create` for normal issue-start work because those can leave the branch/worktree step incomplete.

The `create_issue` MCP tool validates the body structure before creating. If required sections are missing, it returns an error.

## Required Template

```markdown
## Context

Why is this needed? Link to conversations, feedback, or decisions that prompted this work.

## Task

- [ ] A. First task item → after: (none)
- [ ] B. Second task item → after: A
- [ ] C. Third task item → after: A, B

## Scope

What's in scope and out of scope.

## Affected Files

List expected files to create or modify.

## Verification

How to confirm each item is done. Include test commands or expected outcomes.
```

## Rules

1. **Title**: imperative mood, max 80 chars (e.g., "Add OAuth2 PKCE flow")
2. **Checklist items** MUST have letter IDs (`A.`, `B.`, `C.`, ...) — the MCP tool enforces this
3. **Dependencies** use `→ after: X` syntax for DAG ordering
4. The `commit` MCP tool validates these dependencies before allowing commits
5. At least one checklist item is required

## MCP Tool Call

```
create_issue(
  title: "Add gate enforcement to commit hook",
  body: "<filled template>"
)
```

After creation, use `create_branch(slug: "gate-enforcement")` to start working.

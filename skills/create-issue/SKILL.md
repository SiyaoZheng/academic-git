---
name: create-issue
description: Create a well-structured GitHub Issue with DAG checklist template. The body must follow the required template (Context, Task with letter-ID checklist + dependencies, Scope, Affected Files, Verification). Use this skill whenever creating a new issue, starting new work, or when Adrian asks to track a task. Also use when /begin routes to option C (new issue).
allowed-tools: ["academic-git"]
---

# Create Issue — DAG Checklist Template

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

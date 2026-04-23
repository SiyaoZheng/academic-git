---
name: create-issue
description: Draft a well-structured GitHub Issue body with a DAG checklist template, then create the implementation Issue with codex-gh-issue-start so it gets a linked branch and dedicated worktree. Use this skill whenever creating a new issue, starting new work, or when Adrian asks to track a task. Also use when /begin routes to option C (new issue).
allowed-tools: ["Bash"]
---

# Create Issue — DAG Checklist Template

For Codex implementation work, do **not** create Issues with the GitHub connector, the academic-git MCP `create_issue` tool, or bare `gh issue create`. Use `codex-gh-issue-start` after drafting the body. It creates the Issue, assigns Adrian by default, creates the linked branch, and opens a dedicated git worktree.

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
2. **Checklist items** MUST have letter IDs (`A.`, `B.`, `C.`, ...)
3. **Dependencies** use `→ after: X` syntax for DAG ordering
4. The `commit` MCP tool validates these dependencies before allowing commits
5. At least one checklist item is required

## Create Command

```bash
codex-gh-issue-start \
  --repo OWNER/REPO \
  --base <default-branch> \
  --title "Add gate enforcement to commit hook" \
  --body-file -
```

Paste the completed Issue body on stdin when using `--body-file -`. After the command succeeds, continue from the printed `worktree:` path.

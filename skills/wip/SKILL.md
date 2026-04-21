---
name: wip
description: Safety-net snapshot commit — saves current work without tying it to a specific Issue checklist item. Skips DAG validation and gate checks. Use this skill when you need to save progress mid-task, before switching branches, or when work is incomplete but you want a checkpoint. Not a substitute for formal commits.
---

# WIP — Snapshot Commit

The `wip` MCP tool creates a lightweight safety-net commit. Unlike the formal `commit` tool, it:
- Skips DAG dependency validation
- Skips pipeline and gate checks
- Uses `--no-verify` flag
- Auto-generates message from changed files

## When to Use

- **Mid-task checkpoint** — saving progress before trying something risky
- **Branch switching** — preserving state before `switch_branch`
- **End of session** — auto-commit hook uses this for dirty trees

## When NOT to Use

- When a checklist item is complete — use `commit(issue, item, type, description)` instead
- When you need gate validation — WIP skips all checks

## MCP Tool Call

```
wip()
```

That's it — no parameters. The tool:
1. Stages all changes (`git add -A`)
2. Generates message: `wip: file1.py, file2.ts` or `wip: main.py + 5 files`
3. Commits with `--no-verify`
4. Pushes to current branch

## Resume Later

WIP commits don't check off issue items. When you resume, use `view_issue` to find the next unblocked checklist item, then make a formal `commit` when the item is done.

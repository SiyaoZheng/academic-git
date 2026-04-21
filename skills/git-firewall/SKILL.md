---
name: git-firewall
description: Block direct git/gh CLI calls — force use of MCP tools instead
---

# Git Firewall

## Purpose
Prevent direct use of `git` and `gh` CLI commands in Bash tool calls.
All git operations must go through the academic-git MCP server tools.

## Rules
1. Block any Bash command containing bare `git` or `gh` invocations.
2. Allowlisted commands: `git branch --show-current`, `git rev-parse`,
   `git status --porcelain` (read-only introspection used by hooks themselves).
3. All mutation operations (commit, push, merge, rebase, etc.) must use MCP tools.

## Failure Message
"Direct git/gh CLI usage blocked. Use academic-git MCP tools instead."

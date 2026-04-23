#!/bin/bash
# check.sh for git-firewall skill
# Block direct git/gh CLI calls, allow read-only introspection
set -euo pipefail

input=$(cat)
command_str=$(echo "$input" | jq -r '.tool_input.command // ""')

if [ -z "$command_str" ]; then
  exit 0
fi

if [[ "$command_str" == *"codex-gh-issue-start"* ]]; then
  exit 0
fi

# Allowlisted read-only commands (used by hooks themselves)
ALLOWED_PATTERNS=(
  'git branch --show-current'
  'git rev-parse'
  'git status --porcelain'
  'git diff --name-only'
  'git symbolic-ref'
  'git remote get-url'
  'git branch --list'
)

for pattern in "${ALLOWED_PATTERNS[@]}"; do
  if [[ "$command_str" == *"$pattern"* ]]; then
    exit 0
  fi
done

# Check for blocked commands
BLOCKED_PATTERNS=(
  'git commit'
  'git push'
  'git merge'
  'git rebase'
  'git reset'
  'git checkout'
  'git switch'
  'git stash'
  'git cherry-pick'
  'git revert'
  'git tag'
  'gh pr create'
  'gh pr merge'
  'gh pr close'
  'gh issue create'
  'gh issue close'
  'gh issue edit'
  'gh api'
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if [[ "$command_str" == *"$pattern"* ]]; then
    if [ "$pattern" = "gh issue create" ]; then
      echo "BLOCKED: Direct 'gh issue create' detected. Use codex-gh-issue-start so the Issue, linked branch, and dedicated worktree are created together." >&2
      exit 1
    fi
    echo "BLOCKED: Direct '$pattern' detected. Use academic-git MCP tools instead." >&2
    exit 1
  fi
done

exit 0

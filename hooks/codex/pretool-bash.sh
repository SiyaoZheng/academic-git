#!/bin/bash
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
COMMAND_STR="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
REPO_DIR="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"

if [ -z "$COMMAND_STR" ]; then
  exit 0
fi

if [[ "$COMMAND_STR" == *"codex-gh-issue-start"* ]]; then
  exit 0
fi

if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$PWD"
fi

cd "$REPO_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

ALLOWED_PATTERNS=(
  'git branch --show-current'
  'git rev-parse'
  'git status --porcelain'
  'git diff --name-only'
  'git symbolic-ref'
  'git remote get-url'
  'git branch --list'
  'git log --oneline'
)

for pattern in "${ALLOWED_PATTERNS[@]}"; do
  if [[ "$COMMAND_STR" == *"$pattern"* ]]; then
    exit 0
  fi
done

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
  if [[ "$COMMAND_STR" == *"$pattern"* ]]; then
    if [ "$pattern" = "gh issue create" ]; then
      deny "Direct '${pattern}' detected in an academic-git repository. Use /codex-gh-issue-start instead."
    fi
    deny "Direct '${pattern}' detected in an academic-git repository. Use academic-git MCP tools instead."
  fi
done

if echo "$COMMAND_STR" | grep -qE '\s*>\s|>\s|>>\s|sed\s+-i|tee\s|cp\s|mv\s|install\s+-m|dd\s+of=|python3?\s+-c.*open\(.*["'"'"']w'; then
  LOCKED_ISSUE=""
  LOCKED_BRANCH=""
  if [ -f .academic-git.json ]; then
    LOCKED_ISSUE="$(jq -r '.locked_issue // empty' .academic-git.json 2>/dev/null || echo "")"
    LOCKED_BRANCH="$(jq -r '.locked_branch // empty' .academic-git.json 2>/dev/null || echo "")"
  fi
  CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || echo "unknown")"

  if [ -z "$LOCKED_ISSUE" ]; then
    deny "No issue locked. Use academic-git to pick or create an issue before shell-based file edits."
  fi

  if [ -n "$LOCKED_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LOCKED_BRANCH" ]; then
    deny "Wrong branch: you are on '${CURRENT_BRANCH}' but locked to '${LOCKED_BRANCH}'. Use academic-git MCP tools to switch tasks."
  fi
fi

exit 0

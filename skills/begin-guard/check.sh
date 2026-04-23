#!/bin/bash
# check.sh for begin-guard skill
# Block: no locked_issue, or on wrong branch
# Uses hookSpecificOutput.permissionDecision for blocking hook responses
set -euo pipefail

PROJECT_DIR="${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LOCKED_BRANCH=$(jq -r '.locked_branch // empty' .academic-git.json 2>/dev/null || echo "")

if [ -n "$LOCKED_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LOCKED_BRANCH" ]; then
  # On wrong branch
  cat <<EOF
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "Wrong branch: you are on '${CURRENT_BRANCH}' but locked to '${LOCKED_BRANCH}'. Run switch_branch('${LOCKED_BRANCH}') or /begin to change task."}}
EOF
  exit 1  # Signal failure so hook-runner can block with exit 2
fi

# No locked issue at all
cat <<EOF
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "No issue locked. Run /begin to pick or create an issue before writing code. This ensures every change is traceable to an issue."}}
EOF
exit 1  # Signal failure so hook-runner can block with exit 2

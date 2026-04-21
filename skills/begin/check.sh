#!/bin/bash
# check.sh for begin skill
# Non-blocking: output project state summary for session context
set -euo pipefail

[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir &>/dev/null || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
AHEAD=$(git log --oneline 'origin/main..HEAD' 2>/dev/null | wc -l | tr -d ' ' || echo "0")

echo "Branch: ${BRANCH:-unknown} | Dirty files: ${DIRTY:-0} | Commits ahead: ${AHEAD:-0}"

# Exit 0 always — this is informational, never blocking
exit 0

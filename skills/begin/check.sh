#!/bin/bash
# check.sh for begin skill
# Non-blocking: output project state summary + enforcement warnings
# Uses plain stdout for SessionStart/Stop hooks (per Claude Code docs)
set -euo pipefail

[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir &>/dev/null || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

# Detect main branch name (don't hardcode 'main')
MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||' || echo "")
[ -z "$MAIN_BRANCH" ] && MAIN_BRANCH="main"
AHEAD=$(git log --oneline "origin/${MAIN_BRANCH}..HEAD" 2>/dev/null | wc -l | tr -d ' ' || echo "0")

# Build output
echo "Branch: ${BRANCH:-unknown} | Dirty files: ${DIRTY:-0} | Commits ahead: ${AHEAD:-0}"

# --- Enforcement: check locked_issue ---
LOCKED_ISSUE=""
LOCKED_BRANCH=""
if [ -f ".academic-git.json" ]; then
  LOCKED_ISSUE=$(jq -r '.locked_issue // empty' .academic-git.json 2>/dev/null || echo "")
  LOCKED_BRANCH=$(jq -r '.locked_branch // empty' .academic-git.json 2>/dev/null || echo "")
fi

if [ -z "$LOCKED_ISSUE" ]; then
  echo ""
  echo "[academic-git] No issue locked. Run /begin to pick or create an issue. Writing code will be blocked until /begin completes."
fi

# --- Enforcement: auto-switch to locked branch ---
if [ -n "$LOCKED_BRANCH" ] && [ "$BRANCH" != "$LOCKED_BRANCH" ]; then
  if git rev-parse --verify "$LOCKED_BRANCH" &>/dev/null; then
    git switch "$LOCKED_BRANCH" 2>/dev/null || true
    echo ""
    echo "[academic-git] Switched back to locked branch '${LOCKED_BRANCH}'."
  else
    echo ""
    echo "[academic-git] Locked branch '${LOCKED_BRANCH}' does not exist locally. Run /begin to resolve."
  fi
fi

# Exit 0 always — this is informational, never blocking
exit 0

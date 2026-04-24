#!/bin/bash
# check.sh for handle-issue
# Non-blocking summary for issue routing and recovery context
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
source "$PLUGIN_ROOT/scripts/fu-git-paths.sh"
PROJECT_DIR="$(fu_git_project_dir)"
[ -z "$PROJECT_DIR" ] && exit 0
cd "$PROJECT_DIR" 2>/dev/null || exit 0
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
CONFIG_PATH="$(fu_git_find_config_path "$PROJECT_DIR")"
LOCKED_ISSUE=$(jq -r '.locked_issue // empty' "$CONFIG_PATH" 2>/dev/null || echo "")
LOCKED_BRANCH=$(jq -r '.locked_branch // empty' "$CONFIG_PATH" 2>/dev/null || echo "")

if [ -z "$LOCKED_ISSUE" ]; then
  echo ""
  echo "[academic-git] No issue locked. Route through handle-issue and use fu_git resume_issue or fu_git start_issue before writing code."
fi

# --- Enforcement: auto-switch to locked branch ---
if [ -n "$LOCKED_BRANCH" ] && [ "$BRANCH" != "$LOCKED_BRANCH" ]; then
  if git rev-parse --verify "$LOCKED_BRANCH" &>/dev/null; then
    git switch "$LOCKED_BRANCH" 2>/dev/null || true
    echo ""
    echo "[academic-git] Switched back to locked branch '${LOCKED_BRANCH}'."
  else
    echo ""
    echo "[academic-git] Locked branch '${LOCKED_BRANCH}' does not exist locally. Route through handle-issue to resolve."
  fi
fi

# Exit 0 always — this is informational, never blocking
exit 0

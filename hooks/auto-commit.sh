#!/bin/bash
# Stop hook: ADHD zero-touch git workflow v3
#
# Design: zero interruption. Adrian never notices.
#
# 1. After each Claude response → silently detect dirty files → silent auto-commit + push
# 2. Feature branch with enough commits → non-blocking PR reminder
# 3. Explicit completion signal → block and request PR creation
#
# macOS compatible: does not depend on GNU timeout

set -euo pipefail

# === Dependency check ===
if ! command -v jq &>/dev/null; then exit 0; fi
if ! command -v git &>/dev/null; then exit 0; fi

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# Triggered by previous block → skip auto-commit (prevent loop), but still check PR
SKIP_AUTOCOMMIT=false
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  SKIP_AUTOCOMMIT=true
fi

# === Enter project directory ===
[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir &>/dev/null || exit 0

# === Check 0: merge conflict → must block ===
if [ -n "$(git diff --name-only --diff-filter=U 2>/dev/null)" ]; then
  cat <<'EOF'
{"decision": "block", "reason": "Merge conflict detected. Resolve conflicts first (git diff --name-only --diff-filter=U to see conflicted files), then git add and commit."}
EOF
  exit 0
fi

# === Check 1: silent auto-commit (non-blocking) ===
if [ "$SKIP_AUTOCOMMIT" = "false" ]; then
  DIRTY=$(git status --porcelain 2>/dev/null)
  if [ -n "$DIRTY" ]; then
    # Exclude files that shouldn't be committed
    # Add all first, then reset exclusions
    git add -A 2>/dev/null || true

    # Exclude large and sensitive files
    git reset HEAD -- \
      '*.env' '*.env.*' \
      '_targets/' '_targets/**' \
      '*.Rdata' '*.RData' '*.rds' \
      '*.feather' '*.parquet' '*.arrow' \
      '*.pkl' '*.pickle' \
      '__pycache__/' '.ipynb_checkpoints/' \
      '.Rhistory' '*.Rproj.user/' \
      '.DS_Store' \
      'node_modules/' \
      2>/dev/null || true

    # Check if anything remains staged after exclusions
    if ! git diff --cached --quiet 2>/dev/null; then
      # Generate commit message from changed files
      CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null | head -5)
      FILE_COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
      FIRST_FILE=$(echo "$CHANGED_FILES" | head -1)

      if [ "$FILE_COUNT" -le 2 ]; then
        MSG="wip: ${CHANGED_FILES//$'\n'/, }"
      else
        MSG="wip: ${FIRST_FILE} + ${FILE_COUNT} files"
      fi

      git commit -m "$MSG" --no-verify 2>/dev/null || true

      # 静默 push（有 remote 才推，background + hard kill 防僵尸）
      if git remote get-url origin &>/dev/null; then
        BRANCH=$(git branch --show-current 2>/dev/null)
        if [ -n "$BRANCH" ]; then
          ( git push -u origin "$BRANCH" &>/dev/null &
            PUSH_PID=$!
            ( sleep 10 && kill "$PUSH_PID" 2>/dev/null ) &
            wait "$PUSH_PID" 2>/dev/null ) &
          disown
        fi
      fi
    fi
  fi
fi

# === Check 2: feature branch PR detection ===
BRANCH=$(git branch --show-current 2>/dev/null)
case "${BRANCH:-}" in
  ""|main|master|develop|trunk|release/*|hotfix/*)
    exit 0
    ;;
esac

# Only check PR if remote + gh exist
if ! git remote get-url origin &>/dev/null; then exit 0; fi
if ! command -v gh &>/dev/null; then exit 0; fi

# macOS-compatible timeout
_timeout() {
  local secs=$1; shift
  "$@" &
  local pid=$!
  ( sleep "$secs" && kill "$pid" 2>/dev/null ) &
  local watchdog=$!
  wait "$pid" 2>/dev/null || true
  local ret=$?
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  return $ret
}

# PR cache (repo+branch composite key)
REPO_ID=$(git rev-parse --show-toplevel 2>/dev/null | md5 -q 2>/dev/null || echo "unknown")
CACHE_FILE="/tmp/claude-hook-pr-${REPO_ID}-${BRANCH//\//-}"
CACHE_TTL=300
NOW=$(date +%s)
CACHE_MTIME=$(stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0)

if (( NOW - CACHE_MTIME < CACHE_TTL )) && [ -f "$CACHE_FILE" ]; then
  EXISTING_PR=$(cat "$CACHE_FILE")
else
  EXISTING_PR=$(_timeout 3 gh pr list --head "$BRANCH" --state open \
    --json number --jq '.[0].number // empty' 2>/dev/null || echo "")
  echo "$EXISTING_PR" > "$CACHE_FILE" 2>/dev/null || true
fi

# PR already exists → no need to create
if [ -n "$EXISTING_PR" ]; then
  exit 0
fi

# Skip shallow clones
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  exit 0
fi

# Count ahead commits
MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
if [ -z "$MAIN_BRANCH" ]; then
  MAIN_BRANCH=$(_timeout 3 git remote show origin 2>/dev/null | awk '/HEAD branch/{print $NF}' || echo "")
fi
[ -z "$MAIN_BRANCH" ] && MAIN_BRANCH="main"

AHEAD=$(git rev-list --count "origin/${MAIN_BRANCH}".."${BRANCH}" 2>/dev/null || echo "0")
if [ -z "$AHEAD" ] || [ "$AHEAD" -lt 1 ]; then
  exit 0
fi

# Claude auto-judges completion via Issue checklist — no human signal needed.
# This hook only auto-commits; PR creation is handled by Claude when the task is done.
exit 0

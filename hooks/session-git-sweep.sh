#!/bin/bash
# SessionStart hook: commit leftover dirty files in CURRENT project only
# Covers: laptop closed, Claude Code crashed, forgot to commit
# Also signals fresh session for Issue+item selection

set -euo pipefail

[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir &>/dev/null || exit 0

# Commit leftover dirty files
DIRTY=$(git status --porcelain 2>/dev/null | head -c 1)
if [ -n "$DIRTY" ]; then
  git add -A 2>/dev/null || true

  git reset HEAD -- \
    '*.env' '*.env.*' \
    '_targets/' '_targets/**' \
    '*.Rdata' '*.RData' '*.rds' \
    '*.feather' '*.parquet' '*.arrow' \
    '*.pkl' '*.pickle' \
    '__pycache__/' '.ipynb_checkpoints/' \
    '.Rhistory' '*.Rproj.user/' \
    '.DS_Store' 'node_modules/' \
    2>/dev/null || true

  if ! git diff --cached --quiet 2>/dev/null; then
    FILE_COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
    git commit -m "wip: session-sweep ${FILE_COUNT} files ($(date +%Y-%m-%d))" --no-verify 2>/dev/null || true

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

    osascript -e "display notification \"Session sweep: $(basename "$CLAUDE_PROJECT_DIR") (${FILE_COUNT} files)\" with title \"Git Auto-Commit\"" 2>/dev/null || true
  fi
fi


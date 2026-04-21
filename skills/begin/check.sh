#!/bin/bash
# check.sh for begin skill
# SessionStart + Stop hook: output project state + wip snapshot on stop
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

IS_STOP="${1:-}"

# --- If Stop hook: wip auto-commit ---
if [ "$IS_STOP" = "--stop" ]; then
  DIRTY=$(git status --porcelain 2>/dev/null || echo "")
  if [ -n "$DIRTY" ]; then
    git add -A 2>/dev/null || true
    STAGED=$(git diff --cached --stat 2>/dev/null || echo "")
    if [ -n "$STAGED" ]; then
      FILES=$(git diff --cached --name-only 2>/dev/null | head -3 | tr '\n' ', ' | sed 's/,$//')
      MSG="wip: ${FILES}"
      git commit -m "${MSG}" --no-verify 2>/dev/null || true
      BRANCH=$(git branch --show-current 2>/dev/null || echo "")
      if [ -n "$BRANCH" ]; then
        git push -u origin "${BRANCH}" 2>/dev/null || true
      fi
      echo "{\"supplementary_output\": \"[academic-git] Wip snapshot committed.\"}"
    fi
  fi
  exit 0
fi

# --- SessionStart: output project state ---
ISSUES=$(gh issue list --state open --limit 10 2>/dev/null || echo "(gh not available)")
BRANCH=$(git branch --show-current 2>/dev/null || echo "(unknown)")
STATUS=$(git status --short 2>/dev/null || echo "(clean)")

# Check for locked branch
LOCKED=""
if [ -f ".academic-git.json" ]; then
  LOCKED=$(python3 -c "import json; d=json.load(open('.academic-git.json')); print(d.get('locked_branch',''))" 2>/dev/null || echo "")
fi

OUTPUT="[academic-git] Session start — project status:\\n\\n"
OUTPUT="${OUTPUT}Branch: ${BRANCH}\\n"
if [ -n "$LOCKED" ]; then
  OUTPUT="${OUTPUT}Locked to: ${LOCKED}\\n"
fi
OUTPUT="${OUTPUT}Working tree: ${STATUS}\\n\\n"
OUTPUT="${OUTPUT}Open Issues:\\n${ISSUES}\\n\\n"
OUTPUT="${OUTPUT}Pick an issue to work on, or say 'new task' to create one."

echo "{\"supplementary_output\": \"${OUTPUT}\"}"
exit 0

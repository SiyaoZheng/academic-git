#!/bin/bash
# check.sh for review-pr skill
# PreToolUse hook (BLOCKING): clean-room pipeline + gates before PR creation
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 1

# --- Step 1: Clean-room pipeline ---
if [ -f ".academic-git.json" ]; then
  CLEAN_CMD=$(python3 -c "import json,sys; d=json.load(open('.academic-git.json')); print(d.get('pipeline',{}).get('clean_run',''))" 2>/dev/null || echo "")
  if [ -n "$CLEAN_CMD" ]; then
    CLEAN_OUT=$(eval "$CLEAN_CMD" 2>&1) && CLEAN_EXIT=0 || CLEAN_EXIT=$?
    if [ $CLEAN_EXIT -ne 0 ]; then
      # Block: clean-room pipeline failed
      echo "{\"error\": \"[academic-git] Clean-room pipeline FAILED. Fix before creating PR. Run /review-pr skill.\\n${CLEAN_OUT}\"}"
      exit 2
    fi
  fi
fi

# --- Step 2: Gate checks would go here ---
# Full gate execution is via run_gates MCP tool, called by the skill
# This hook does the blocking part (pipeline check)

exit 0

#!/bin/bash
# check.sh for commit skill
# PostToolUse hook: after commit, run pipeline + gates
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

OUTPUT=""

# --- Step 1: Run project pipeline (if configured) ---
if [ -f ".academic-git.json" ]; then
  PIPELINE_CMD=$(python3 -c "import json,sys; d=json.load(open('.academic-git.json')); print(d.get('pipeline',{}).get('run',''))" 2>/dev/null || echo "")
  if [ -n "$PIPELINE_CMD" ]; then
    PIPELINE_OUT=$(eval "$PIPELINE_CMD" 2>&1) && PIPELINE_EXIT=0 || PIPELINE_EXIT=$?
    if [ $PIPELINE_EXIT -ne 0 ]; then
      # Pipeline failed — output as supplementary
      echo "{\"supplementary_output\": \"[academic-git] Pipeline FAILED:\\n${PIPELINE_OUT}\"}"
      exit 0
    else
      OUTPUT="[academic-git] Pipeline passed."
    fi
  fi
fi

# --- Step 2: Run gates via the compiled gate engine ---
# We use a small Node script to call gates.ts logic
# For now, output a summary message (gate execution will be via MCP tool in full impl)
if [ -n "$OUTPUT" ]; then
  echo "{\"supplementary_output\": \"${OUTPUT} Gates: run /run_gates for full check.\"}"
else
  echo "{\"supplementary_output\": \"[academic-git] Commit recorded. Run /run_gates for gate check.\"}"
fi

exit 0

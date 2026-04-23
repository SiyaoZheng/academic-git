#!/bin/bash
# check.sh for branch-lock skill
# Block: output error and exit 2
set -euo pipefail

PROJECT_DIR="${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}"
cd "$PROJECT_DIR" 2>/dev/null || exit 1

LOCKED=$(python3 -c "import json; d=json.load(open('.academic-git.json')); print(d.get('locked_branch',''))" 2>/dev/null || echo "")

echo "{\"error\": \"[academic-git] Branch locked to '${LOCKED}'. Focus on current issue. Run /begin to switch tasks.\"}"
exit 2

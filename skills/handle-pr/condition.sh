#!/bin/bash
# condition.sh for handle-pr
# Run: only on issue branches (not main/master)
set -euo pipefail

PROJECT_DIR="${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}"
cd "$PROJECT_DIR" 2>/dev/null || exit 1
BRANCH=$(git branch --show-current 2>/dev/null || echo "")
[[ "$BRANCH" == codex/issue-* ]]

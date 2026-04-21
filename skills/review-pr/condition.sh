#!/bin/bash
# condition.sh for review-pr skill
# Run: only on feature branches (not main/master)
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 1
BRANCH=$(git branch --show-current 2>/dev/null || echo "")
[[ "$BRANCH" == feat/* ]]

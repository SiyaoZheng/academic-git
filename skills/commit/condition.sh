#!/bin/bash
# condition.sh for commit skill
# Run: only if non-gitignored files were committed (i.e., HEAD differs from HEAD~1)
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 1

# Check that this is a git repo with commits
git rev-parse --git-dir >/dev/null 2>&1 || exit 1
git rev-parse HEAD~1 >/dev/null 2>&1 || exit 1

# Check if there are changed files between HEAD and HEAD~1
CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null | head -1)
[ -n "$CHANGED" ]

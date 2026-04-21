#!/bin/bash
# condition.sh for post-merge skill
# Run: only if a merge just happened
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 1
git log -1 --merges HEAD >/dev/null 2>&1

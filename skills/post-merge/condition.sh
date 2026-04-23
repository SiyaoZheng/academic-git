#!/bin/bash
# condition.sh for post-merge skill
# Run: only if a merge just happened
set -euo pipefail

PROJECT_DIR="${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}"
cd "$PROJECT_DIR" 2>/dev/null || exit 1
git log -1 --merges HEAD >/dev/null 2>&1

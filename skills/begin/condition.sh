#!/bin/bash
# condition.sh for begin skill
# Run: on session start if there are open issues
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 1
gh issue list --state open --limit 1 2>/dev/null | grep -q .

#!/bin/bash
# condition.sh for guard-write-branch
# Run: when git switch is attempted and target != locked branch
set -euo pipefail

PROJECT_DIR="${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}"
cd "$PROJECT_DIR" 2>/dev/null || exit 1

# Read hook input to get the command
INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# Only trigger on git switch commands
echo "$CMD" | grep -qiE 'git\s+switch|git\s+checkout' || exit 1

# Check if branch lock exists
[ -f ".academic-git.json" ] || exit 1

LOCKED=$(python3 -c "import json; d=json.load(open('.academic-git.json')); print(d.get('locked_branch',''))" 2>/dev/null || echo "")
[ -n "$LOCKED" ] || exit 1

# Extract target branch from the command
TARGET=$(echo "$CMD" | sed -E 's/.*git\s+(switch|checkout)\s+//' | awk '{print $1}')

# If target matches locked branch → allow (exit 1 = condition not met = skip the check)
[ "$TARGET" != "$LOCKED" ]

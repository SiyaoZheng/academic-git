#!/bin/bash
# check.sh for guard-write-branch
# Block: output error and exit 2
set -euo pipefail

PROJECT_DIR="${SCHOLAROS_GIT_PROJECT_DIR:-${SCHOLAROS_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}}"
cd "$PROJECT_DIR" 2>/dev/null || exit 1

CONFIG_PATH=".scholaros_git.json"
[ -f "$CONFIG_PATH" ] || CONFIG_PATH=".scholaros-git.json"
[ -f "$CONFIG_PATH" ] || CONFIG_PATH=".scholaros.json"
LOCKED=$(python3 -c "import json, sys; d=json.load(open(sys.argv[1])); print(d.get('locked_branch',''))" "$CONFIG_PATH" 2>/dev/null || echo "")

echo "{\"error\": \"[ScholarOS] Branch locked to '${LOCKED}'. Focus on the active issue, or route through handle-issue to switch tasks.\"}"
exit 2

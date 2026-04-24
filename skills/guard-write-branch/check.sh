#!/bin/bash
# check.sh for guard-write-branch
# Block: output error and exit 2
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
source "$PLUGIN_ROOT/scripts/fu-git-paths.sh"
PROJECT_DIR="$(fu_git_project_dir)"
cd "$PROJECT_DIR" 2>/dev/null || exit 1

CONFIG_PATH="$(fu_git_find_config_path "$PROJECT_DIR")"
LOCKED=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d.get('locked_branch',''))" "$CONFIG_PATH" 2>/dev/null || echo "")

echo "{\"error\": \"[academic-git] Branch locked to '${LOCKED}'. Focus on the active issue, or route through handle-issue to switch tasks.\"}"
exit 2

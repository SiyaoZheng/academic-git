#!/bin/bash
# condition.sh for finalize-pr-merge
# Run: only if a merge just happened
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
TOOL_NAMES="$(printf '%s' "$INPUT" | jq -r '
  [
    .tool_name?,
    .toolName?,
    .name?,
    .tool?.name?,
    .tool?.id?,
    .tool_call?.name?,
    .toolCall?.name?,
    .server_tool_name?,
    .mcp_tool_name?
  ]
  | map(select(type == "string"))
  | .[]
' 2>/dev/null || true)"

if printf '%s\n' "$TOOL_NAMES" | grep -Eq '(^|__|[./:-])merge_pr$'; then
  exit 0
fi

exit 1

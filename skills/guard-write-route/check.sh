#!/bin/bash
# check.sh for guard-write-route
# Block direct git/gh CLI calls, allow read-only introspection
set -euo pipefail

input=$(cat)
command_str=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

if [ -z "$command_str" ]; then
  exit 0
fi

PLUGIN_ROOT="${FU_PLUGIN_ROOT:-${ACADEMIC_GIT_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}}}"
ROUTING_HELPER="$PLUGIN_ROOT/scripts/render-routing-table.sh"
ROUTING_JSON="$(printf '%s' "$input" | bash "$ROUTING_HELPER" 2>/dev/null || true)"
ROUTING_DECISION="$(printf '%s' "$ROUTING_JSON" | jq -r '.decision // "allow"' 2>/dev/null || echo "allow")"
ROUTING_REASON="$(printf '%s' "$ROUTING_JSON" | jq -r '.reason // "Direct git/gh commands are blocked."' 2>/dev/null || echo "")"

if [ "$ROUTING_DECISION" != "allow" ]; then
  echo "BLOCKED: $ROUTING_REASON" >&2
  exit 1
fi

exit 0

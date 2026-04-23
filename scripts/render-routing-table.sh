#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TABLE_PATH="$REPO_DIR/.academic-git-routing.json"

INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // .command // ""' 2>/dev/null || true)"

if [ -z "$COMMAND" ]; then
  jq -n '{decision:"allow", reason:"No Bash command to classify."}'
  exit 0
fi

if [ ! -f "$TABLE_PATH" ]; then
  jq -n '{decision:"deny", reason:"Missing .academic-git-routing.json routing table."}'
  exit 0
fi

MATCHED="$(jq -c --arg cmd "$COMMAND" '
  [
    .entries
    | to_entries[]
    | select(.value.match as $match | $cmd | test($match))
    | {
        index: .key,
        decision: .value.decision,
        match: .value.match,
        reason: .value.reason,
        tool: .value.tool,
        policy: .value.policy,
        score: (if .value.decision == "deny" then 3 elif .value.decision == "route" then 2 else 1 end)
      }
  ]
  | if length == 0 then
      {decision:"allow", reason:"No routing rule matched."}
    else
      sort_by(-.score, .index)[0] | del(.index, .score)
    end
' "$TABLE_PATH")"

if [ -n "$MATCHED" ]; then
  printf '%s\n' "$MATCHED"
else
  jq -n '{decision:"allow", reason:"No routing rule matched."}'
fi

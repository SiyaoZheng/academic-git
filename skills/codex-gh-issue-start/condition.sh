#!/bin/bash
set -euo pipefail

if [ "$#" -gt 0 ]; then
  exit 0
fi

INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"

if printf '%s' "$COMMAND" | grep -q "codex-gh-issue-start"; then
  exit 0
fi

BODY="$(printf '%s' "$INPUT" | jq -r '.body // .tool_input.body // empty' 2>/dev/null || true)"
if [ -n "$BODY" ]; then
  exit 0
fi

exit 1

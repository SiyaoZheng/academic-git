#!/bin/bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "--body-file" ]; then
  python3 "$SKILL_DIR/validate_body.py" "${2:-}"
  exit $?
fi

INPUT="$(cat 2>/dev/null || true)"
BODY="$(printf '%s' "$INPUT" | jq -r '.body // .tool_input.body // empty' 2>/dev/null || true)"

if [ -z "$BODY" ]; then
  # Hook payloads usually expose only the Bash command, not heredoc stdin.
  # The CLI calls this check explicitly with --body-file before any mutation.
  exit 0
fi

printf '%s' "$BODY" | python3 "$SKILL_DIR/validate_body.py" -

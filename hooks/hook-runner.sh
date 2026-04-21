#!/bin/bash
# hook-runner.sh — generic two-layer hook wrapper
# Usage: hook-runner.sh <skill-dir> [--block]
#
# Each skill owns:
#   condition.sh — "should this check run?" (exit 0 = yes, non-zero = skip)
#   check.sh     — actual verification logic
#
# Hook events fire this script. It delegates to the skill's scripts.
# --block flag: exit 2 on check failure (for PreToolUse hooks that can block tool calls)

set -euo pipefail

SKILL_DIR="$1"
BLOCK_MODE="${2:-}"

if [ -z "$SKILL_DIR" ]; then
  exit 0
fi

# --- Condition: should this hook even run? ---
if [ -f "$SKILL_DIR/condition.sh" ]; then
  if ! bash "$SKILL_DIR/condition.sh"; then
    exit 0  # condition not met → silent allow
  fi
fi

# --- Check: run the actual verification ---
bash "$SKILL_DIR/check.sh"
CHECK_EXIT=$?

if [ $CHECK_EXIT -ne 0 ] && [ "$BLOCK_MODE" = "--block" ]; then
  exit 2  # PreToolUse: block the tool call
fi

exit $CHECK_EXIT

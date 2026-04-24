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
#
# Stdin (tool input JSON) is buffered and forwarded to both condition.sh
# and check.sh so they can inspect tool arguments.

set -euo pipefail

SKILL_DIR="$1"
BLOCK_MODE="${2:-}"
HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$SKILL_DIR" ]; then
  exit 0
fi

# Buffer stdin (tool input JSON) so we can forward it to skill scripts
INPUT=$(cat)
REPO_DIR="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"

if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$PWD"
fi

# ScholarOS must not govern its own source repo or linked worktrees.
source "$HOOKS_DIR/self-disable.sh"
if scholaros_is_source_repo "$REPO_DIR"; then
  exit 0
fi

# --- Condition: should this hook even run? ---
if [ -f "$SKILL_DIR/condition.sh" ]; then
  if ! echo "$INPUT" | bash "$SKILL_DIR/condition.sh"; then
    exit 0  # condition not met → silent allow
  fi
fi

# --- Check: run the actual verification ---
CHECK_EXIT=0
echo "$INPUT" | bash "$SKILL_DIR/check.sh" || CHECK_EXIT=$?

if [ $CHECK_EXIT -ne 0 ] && [ "$BLOCK_MODE" = "--block" ]; then
  exit 2  # PreToolUse: block the tool call
fi

exit $CHECK_EXIT

#!/bin/bash
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
REPO_DIR="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$CMD" ]; then
  exit 0
fi

if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$PWD"
fi

cd "$REPO_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

source "$HOOKS_DIR/self-disable.sh"
if fu_is_source_repo "$REPO_DIR"; then
  exit 0
fi

PLUGIN_ROOT="${FU_PLUGIN_ROOT:-${ACADEMIC_GIT_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}}}"
ROUTING_HELPER="$PLUGIN_ROOT/scripts/render-routing-table.sh"
ROUTING_JSON="$(printf '%s' "$INPUT" | bash "$ROUTING_HELPER" 2>/dev/null || true)"
ROUTING_DECISION="$(printf '%s' "$ROUTING_JSON" | jq -r '.decision // "allow"' 2>/dev/null || echo "allow")"
ROUTING_REASON="$(printf '%s' "$ROUTING_JSON" | jq -r '.reason // "Fu routing table blocked this command."' 2>/dev/null || echo "")"

deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

if [ "$ROUTING_DECISION" != "allow" ]; then
  deny "$ROUTING_REASON"
fi

if echo "$CMD" | grep -qE '\s*>\s|>\s|>>\s|sed\s+-i|tee\s|cp\s|mv\s|install\s+-m|dd\s+of=|python3?\s+-c.*open\(.*["'"'"']w'; then
  LOCKED_ISSUE=""
  LOCKED_BRANCH=""
  CONFIG_PATH=".fu.json"
  if [ ! -f "$CONFIG_PATH" ] && [ -f ".academic-git.json" ]; then
    CONFIG_PATH=".academic-git.json"
  fi
  if [ -f "$CONFIG_PATH" ]; then
    LOCKED_ISSUE="$(jq -r '.locked_issue // empty' "$CONFIG_PATH" 2>/dev/null || echo "")"
    LOCKED_BRANCH="$(jq -r '.locked_branch // empty' "$CONFIG_PATH" 2>/dev/null || echo "")"
  fi
  CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || echo "unknown")"

  if [ -z "$LOCKED_ISSUE" ]; then
    deny "No issue locked. Use Fu to pick or create an issue before shell-based file edits."
  fi

  if [ -n "$LOCKED_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LOCKED_BRANCH" ]; then
    deny "Wrong branch: you are on '${CURRENT_BRANCH}' but locked to '${LOCKED_BRANCH}'. Use Fu workflow tools to switch tasks."
  fi
fi

exit 0

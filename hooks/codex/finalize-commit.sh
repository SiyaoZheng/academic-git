#!/bin/bash
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
REPO_DIR="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
COMMAND_STR="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"
HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$PWD"
fi

cd "$REPO_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

source "$HOOKS_DIR/self-disable.sh"
if fu_is_source_repo "$REPO_DIR"; then
  exit 0
fi

DIRECT_COMMIT=false
if echo "$COMMAND_STR" | grep -qiE '(^|[^A-Za-z])(git\s+commit|git\s+merge|git\s+cherry-pick|git\s+revert|git\s+am\s+--continue|git\s+rebase\s+--continue)([^A-Za-z]|$)'; then
  DIRECT_COMMIT=true
fi

HEAD_SHA="$(git rev-parse HEAD 2>/dev/null || echo "")"
if [ -z "$HEAD_SHA" ]; then
  exit 0
fi

STATE_FILE="$(git rev-parse --git-path fu-posttool-last-head 2>/dev/null || echo "")"
if [ -z "$STATE_FILE" ]; then
  exit 0
fi

mkdir -p "$(dirname "$STATE_FILE")"

if [ ! -f "$STATE_FILE" ]; then
  printf '%s\n' "$HEAD_SHA" >"$STATE_FILE"
  if [ "$DIRECT_COMMIT" != true ]; then
    exit 0
  fi
fi

PREV_HEAD="$(cat "$STATE_FILE" 2>/dev/null || echo "")"
if [ "$DIRECT_COMMIT" != true ] && [ "$PREV_HEAD" = "$HEAD_SHA" ]; then
  exit 0
fi

printf '%s\n' "$HEAD_SHA" >"$STATE_FILE"

BRANCH="$(git branch --show-current 2>/dev/null || echo "unknown")"
SUBJECT="$(git log -1 --pretty=format:%s HEAD 2>/dev/null || echo "(unknown subject)")"
SHORT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "$HEAD_SHA")"

SYSTEM_MESSAGE="[Fu] Detected new commit ${SHORT_SHA} on '${BRANCH}': ${SUBJECT}"
ADDITIONAL_CONTEXT="A new git commit was created in this Fu repository after a Bash tool call. Current branch: ${BRANCH}. New HEAD: ${SHORT_SHA}. Subject: ${SUBJECT}."

if [ "$DIRECT_COMMIT" = true ]; then
  SYSTEM_MESSAGE="${SYSTEM_MESSAGE}. Direct shell commit flow bypasses Fu commit checks."
  ADDITIONAL_CONTEXT="${ADDITIONAL_CONTEXT} The triggering Bash command appears to have committed directly via git, so issue linkage, DAG checks, pipeline execution, and gates may have been bypassed."
fi

jq -n \
  --arg system_message "$SYSTEM_MESSAGE" \
  --arg additional_context "$ADDITIONAL_CONTEXT" \
  '{
    systemMessage: $system_message,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $additional_context
    }
  }'

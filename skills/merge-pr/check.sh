#!/bin/bash
# check.sh for merge-pr skill
# PreToolUse hook: read-only preflight before the MCP merge_pr tool executes.
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
PROJECT_DIR="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
PR_NUMBER="$(printf '%s' "$INPUT" | jq -r '
  [
    .tool_input.pr?,
    .tool_input.arguments.pr?,
    .toolInput.pr?,
    .toolInput.arguments.pr?,
    .input.pr?,
    .input.arguments.pr?,
    .arguments.pr?
  ]
  | map(select(. != null))
  | first // empty
' 2>/dev/null || echo "")"

if [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR="${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}"
fi

deny() {
  local reason="$1"
  jq -n \
    --arg reason "$reason" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
  exit 1
}

cd "$PROJECT_DIR" 2>/dev/null ||
  deny "[academic-git] Cannot enter project directory '${PROJECT_DIR:-unknown}'; refusing merge_pr preflight."

if ! printf '%s' "$PR_NUMBER" | grep -Eq '^[0-9]+$'; then
  deny "[academic-git] merge_pr requires a numeric pr argument. Run the merge-pr skill with merge_pr(pr: N)."
fi

METADATA="$(gh pr view "$PR_NUMBER" --json number,state,headRefName,headRefOid,baseRefName,isCrossRepository 2>/dev/null)" ||
  deny "[academic-git] Cannot inspect PR #${PR_NUMBER}; refusing merge_pr preflight."

STATE="$(printf '%s' "$METADATA" | jq -r '.state // empty' 2>/dev/null || echo "")"
HEAD_REF="$(printf '%s' "$METADATA" | jq -r '.headRefName // empty' 2>/dev/null || echo "")"
HEAD_OID="$(printf '%s' "$METADATA" | jq -r '.headRefOid // empty' 2>/dev/null || echo "")"
BASE_REF="$(printf '%s' "$METADATA" | jq -r '.baseRefName // empty' 2>/dev/null || echo "")"
CROSS_REPO="$(printf '%s' "$METADATA" | jq -r '.isCrossRepository // false' 2>/dev/null || echo "false")"

if [ "$STATE" != "OPEN" ]; then
  deny "[academic-git] PR #${PR_NUMBER} is ${STATE:-unknown}, not OPEN. Do not run merge_pr; inspect the PR state and cleanup status manually."
fi

if [ -z "$HEAD_REF" ] || [ -z "$HEAD_OID" ]; then
  deny "[academic-git] PR #${PR_NUMBER} is missing headRefName/headRefOid; refusing merge_pr because branch cleanup would not be auditable."
fi

CONTEXT="[academic-git] merge_pr preflight passed for PR #${PR_NUMBER}: head=${HEAD_REF} (${HEAD_OID}), base=${BASE_REF:-unknown}, cross_repo=${CROSS_REPO}. MCP merge_pr must merge first, remove clean local worktrees before deleting refs, and delete only refs that still match this head OID."

jq -n \
  --arg system_message "[academic-git] merge-pr skill preflight passed" \
  --arg additional_context "$CONTEXT" \
  '{
    systemMessage: $system_message,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: $additional_context
    }
  }'
exit 0

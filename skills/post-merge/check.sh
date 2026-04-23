#!/bin/bash
# check.sh for post-merge skill
# PostToolUse hook: after merge_pr, surface cleanup status and follow-up context.
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
MERGE_OUTPUT="$(printf '%s' "$INPUT" | jq -r '[.. | objects | select(.type? == "text") | .text?] | join("\n")' 2>/dev/null || echo "")"

if [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR="${ACADEMIC_GIT_PROJECT_DIR:-${CODEX_WORKSPACE_ROOT:-${CODEX_PROJECT_DIR:-.}}}"
fi

OUTPUT="[academic-git] Post-merge follow-up"
if [ -n "$PR_NUMBER" ]; then
  OUTPUT="${OUTPUT} for merge_pr #${PR_NUMBER}"
fi

append_output() {
  OUTPUT="${OUTPUT}"$'\n\n'"$1"
}

emit_output() {
  jq -n \
    --arg supplementary_output "$OUTPUT" \
    --arg system_message "[academic-git] Post-merge follow-up ready" \
    --arg additional_context "$OUTPUT" \
    '{
      supplementary_output: $supplementary_output,
      systemMessage: $system_message,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: $additional_context
      }
    }'
}

if ! cd "$PROJECT_DIR" 2>/dev/null; then
  append_output "Cannot enter project directory '${PROJECT_DIR:-unknown}'. Post-merge follow-up could not inspect issues or lock state."
  emit_output
  exit 0
fi

CLEANUP_COMPLETED=false
if printf '%s' "$MERGE_OUTPUT" | grep -q '\[failed\]'; then
  append_output "Cleanup status: merge_pr reported failed cleanup step(s). Treat the GitHub merge as completed, but inspect the failed local/remote cleanup lines before closing the issue."
elif printf '%s' "$MERGE_OUTPUT" | grep -q 'Post-merge cleanup:'; then
  append_output "Cleanup status: merge_pr returned explicit cleanup statuses. Confirm all steps are [ok] or [skipped] before closing the issue."
  if printf '%s' "$MERGE_OUTPUT" | grep -q 'post-merge cleanup completed'; then
    CLEANUP_COMPLETED=true
  fi
fi

ISSUES="$(gh issue list --state open --limit 10 2>/dev/null || echo "(gh not available)")"
append_output "Open Issues:
${ISSUES}"

PR_TEXT=""
if [ -n "$PR_NUMBER" ]; then
  PR_TEXT="$(gh pr view "$PR_NUMBER" --json title,body --jq '.title + "\n" + (.body // "")' 2>/dev/null || true)"
fi

if printf '%s\n%s' "$MERGE_OUTPUT" "$PR_TEXT" | grep -qiE 'email|meeting|conference|submit|send|deadline'; then
  TAG_DATE="$(date +%Y-%m-%d)"
  append_output "[academic-git] Milestone keywords detected. Consider: create_tag(name='email-${TAG_DATE}', message='...')"
fi

if [ "$CLEANUP_COMPLETED" = true ] && [ -f ".academic-git.json" ]; then
  python3 - <<'PY' 2>/dev/null || true
import json
from pathlib import Path

path = Path(".academic-git.json")
try:
    data = json.loads(path.read_text())
except Exception:
    raise SystemExit(0)
changed = False
for key in ("locked_branch", "locked_issue"):
    if key in data:
        del data[key]
        changed = True
if changed:
    path.write_text(json.dumps(data, indent=2) + "\n")
PY
  append_output "[academic-git] Branch lock cleared."
elif [ -f ".academic-git.json" ]; then
  append_output "[academic-git] Branch lock retained because merge_pr cleanup was not confirmed complete."
fi

emit_output
exit 0

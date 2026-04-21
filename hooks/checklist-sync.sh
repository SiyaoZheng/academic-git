#!/bin/bash
# Stop hook: checklist-sync
# After every Claude response on feat/* branches:
# 1. Parse [checklist:done #N/X] signal from last message
# 2. If item completed → check off on Issue (toggle checkbox only)
# 3. Never modify any other content in Issue body
# 4. Append notes at end if [checklist:note ...] present

set -euo pipefail

if ! command -v jq &>/dev/null; then exit 0; fi
if ! command -v gh &>/dev/null; then exit 0; fi

INPUT=$(cat)
LAST_MSG=$(echo "$INPUT" | jq -r '.last_assistant_message // ""' 2>/dev/null | tail -20)

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
git rev-parse --git-dir &>/dev/null || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "")
[[ "$BRANCH" == feat/* ]] || exit 0

# Only proceed if remote + gh exist
git remote get-url origin &>/dev/null || exit 0

# Parse: [checklist:done #N/X]
DONE_MATCH=$(echo "$LAST_MSG" | grep -oE '\[checklist:done #[0-9]+/[A-Z]\]' | head -1 || echo "")

if [ -n "$DONE_MATCH" ]; then
  ISSUE_NUM=$(echo "$DONE_MATCH" | grep -oE '#[0-9]+' | tr -d '#')
  ITEM_LETTER=$(echo "$DONE_MATCH" | grep -oE '/[A-Z]' | tr -d '/')

  [ -z "$ISSUE_NUM" ] && exit 0
  [ -z "$ITEM_LETTER" ] && exit 0

  # Read current Issue body
  BODY=$(gh issue view "$ISSUE_NUM" --json body --jq '.body' 2>/dev/null || echo "")
  [ -z "$BODY" ] && exit 0

  # Toggle only the matching checkbox: "- [ ] X." → "- [x] X."
  # Use perl for reliable in-place substitution (sed varies across platforms)
  UPDATED_BODY=$(echo "$BODY" | perl -pe "s/^- \\[ \\] ${ITEM_LETTER}\\./- [x] ${ITEM_LETTER}./m")

  # Only update if something changed
  if [ "$BODY" != "$UPDATED_BODY" ]; then
    gh issue edit "$ISSUE_NUM" --body "$UPDATED_BODY" 2>/dev/null || true
  fi
fi

# Parse: [checklist:unrelated] — BLOCK. Anti-ADHD: work on feat/* must relate to an item.
UNRELATED=$(echo "$LAST_MSG" | grep -oE '\[checklist:unrelated\]' | head -1 || echo "")

if [ -n "$UNRELATED" ]; then
  jq -n '{"decision":"block","reason":"[ADHD guard] This work is unrelated to any checklist item on the current Issue. Adrian: explain what this is — should it be added to the Issue, or is it a different task (switch to main + /begin)?"}'
  exit 0
fi

# Parse: [checklist:note ...] — append to end of Issue body
NOTE_LINE=$(echo "$LAST_MSG" | grep -oE '\[checklist:note\] .*' | head -1 || echo "")

if [ -n "$NOTE_LINE" ]; then
  NOTE_TEXT=$(echo "$NOTE_LINE" | sed 's/\[checklist:note\] //')
  # Re-read ISSUE_NUM from done match or from wip match
  if [ -z "${ISSUE_NUM:-}" ]; then
    WIP_MATCH=$(echo "$LAST_MSG" | grep -oE '\[checklist:wip #[0-9]+/[A-Z]\]' | head -1 || echo "")
    ISSUE_NUM=$(echo "$WIP_MATCH" | grep -oE '#[0-9]+' | tr -d '#' || echo "")
  fi

  if [ -n "${ISSUE_NUM:-}" ] && [ -n "$NOTE_TEXT" ]; then
    BODY=$(gh issue view "$ISSUE_NUM" --json body --jq '.body' 2>/dev/null || echo "")
    if [ -n "$BODY" ]; then
      TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
      UPDATED_BODY="${BODY}

---
**Note (${TIMESTAMP})**: ${NOTE_TEXT}"
      gh issue edit "$ISSUE_NUM" --body "$UPDATED_BODY" 2>/dev/null || true
    fi
  fi
fi

exit 0

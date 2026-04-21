#!/bin/bash
# UserPromptSubmit hook: inject git context on every message in a git repo
#
# On main: provide open issues + branches, prompt Issue selection or /begin
# On feat/*: enforce checklist signals, detect task-switching

set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
git rev-parse --git-dir &>/dev/null || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "")

# Collect context (shared across both paths)
ISSUES=""
if command -v gh &>/dev/null && git remote get-url origin &>/dev/null; then
  ISSUES=$(gh issue list --state open --limit 10 --json number,title \
    --jq '.[] | "#\(.number) \(.title)"' 2>/dev/null || echo "")
fi

BRANCHES=$(git branch --list 'feat/*' 2>/dev/null | sed 's/^[* ]*//' || echo "")

case "${BRANCH:-}" in
  main|master)
    MSG="[git] On main."
    [ -n "$ISSUES" ] && MSG="${MSG} Open issues: ${ISSUES}"
    [ -n "$BRANCHES" ] && MSG="${MSG} Feature branches: ${BRANCHES}"
    MSG="${MSG} If open Issues exist, present them and ask Adrian to pick an Issue + checklist item. If Adrian describes a new task, invoke /begin. If just a question, ignore."
    ;;
  feat/*)
    MSG="[git] On branch ${BRANCH}."
    [ -n "$ISSUES" ] && MSG="${MSG} Open issues: ${ISSUES}"
    MSG="${MSG} SSOT: the Issue checklist is truth — read it (gh issue view N) before working. MANDATORY: end EVERY response with exactly one checklist signal — [checklist:done #N/X] if item completed, [checklist:wip #N/X] if still working on item, or [checklist:unrelated] if this work matches NO item (triggers block — Adrian must explain). No exceptions. If Adrian describes a DIFFERENT task, auto-commit current work, switch to main, then invoke /begin."
    ;;
  *)
    MSG="[git] On branch ${BRANCH}."
    ;;
esac

printf '%s' "$MSG"

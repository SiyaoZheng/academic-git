#!/bin/bash
# Auto-stash: save dirty working tree on Stop/SessionStart without polluting DAG.
# Uses git stash instead of wip commit + push — no gate bypass, no untraceable commits.
# macOS compatible: does not depend on GNU timeout

set -euo pipefail

if ! command -v git &>/dev/null; then exit 0; fi

# Stop hook sends JSON on stdin; SessionStart may send nothing. Handle both.
INPUT=$(cat 2>/dev/null || echo "")
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# Triggered by previous block → skip auto-stash (prevent loop), but still check PR
SKIP_AUTOSTASH=false
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  SKIP_AUTOSTASH=true
fi

# === Enter project directory ===
[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir &>/dev/null || exit 0

# === Check 0: merge conflict → must block ===
if [ -n "$(git diff --name-only --diff-filter=U 2>/dev/null)" ]; then
  cat <<'EOF'
{"decision": "block", "reason": "Merge conflict detected. Resolve conflicts first (git diff --name-only --diff-filter=U to see conflicted files), then git add and commit."}
EOF
  exit 0
fi

# === Check 1: stash dirty working tree (non-blocking) ===
if [ "$SKIP_AUTOSTASH" = "false" ]; then
  DIRTY=$(git status --porcelain 2>/dev/null)
  if [ -n "$DIRTY" ]; then
    # Stash with descriptive message — does not create a commit, does not push, does not bypass gates
    STASH_MSG="auto-save: $(date +%Y-%m-%dT%H:%M)"
    git stash push -m "$STASH_MSG" --include-untracked 2>/dev/null || true
  fi
fi

# === Check 2: feature branch PR detection ===
BRANCH=$(git branch --show-current 2>/dev/null)
case "${BRANCH:-}" in
  ""|main|master|develop|trunk|release/*|hotfix/*)
    exit 0
    ;;
esac

# Only check PR if remote + gh exist
if ! git remote get-url origin &>/dev/null; then exit 0; fi
if ! command -v gh &>/dev/null; then exit 0; fi

# macOS-compatible timeout
_timeout() {
  local secs=$1; shift
  "$@" &
  local pid=$!
  ( sleep "$secs" && kill "$pid" 2>/dev/null ) &
  local watchdog=$!
  wait "$pid" 2>/dev/null || true
  local ret=$?
  kill "$watchdog" 2>/dev/null || true
  wait "$watchdog" 2>/dev/null || true
  return $ret
}

# PR cache (repo+branch composite key)
REPO_ID=$(git rev-parse --show-toplevel 2>/dev/null | md5 -q 2>/dev/null || echo "unknown")
CACHE_FILE="/tmp/claude-hook-pr-${REPO_ID}-${BRANCH//\\//-}"
CACHE_TTL=300
NOW=$(date +%s)
CACHE_MTIME=$(stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0)

if (( NOW - CACHE_MTIME < CACHE_TTL )) && [ -f "$CACHE_FILE" ]; then
  EXISTING_PR=$(cat "$CACHE_FILE")
else
  EXISTING_PR=$(_timeout 3 gh pr list --head "$BRANCH" --state open \
    --json number --jq '.[0].number // empty' 2>/dev/null || echo "")
  echo "$EXISTING_PR" > "$CACHE_FILE" 2>/dev/null || true
fi

# PR already exists → no need to create
if [ -n "$EXISTING_PR" ]; then
  exit 0
fi

# Skip shallow clones
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  exit 0
fi

# Count ahead commits
MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
if [ -z "$MAIN_BRANCH" ]; then
  MAIN_BRANCH=$(_timeout 3 git remote show origin 2>/dev/null | awk '/HEAD branch/{print $NF}' || echo "")
fi
[ -z "$MAIN_BRANCH" ] && MAIN_BRANCH="main"

AHEAD=$(git rev-list --count "origin/${MAIN_BRANCH}".."${BRANCH}" 2>/dev/null || echo "0")
if [ -z "$AHEAD" ] || [ "$AHEAD" -lt 1 ]; then
  exit 0
fi

# Claude auto-judges completion via Issue checklist — no human signal needed.
# This hook only auto-stashes; PR creation is handled by Claude when the task is done.
exit 0

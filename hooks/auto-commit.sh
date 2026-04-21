#!/bin/bash
# Auto-save: commit + push dirty working tree on Stop.
# Creates wip(#0) commits for traceability. Never runs on protected branches.
# macOS compatible: does not depend on GNU timeout

set -euo pipefail

if ! command -v git &>/dev/null; then exit 0; fi

# Stop hook sends JSON on stdin; SessionStart may send nothing. Handle both.
INPUT=$(cat 2>/dev/null || echo "")
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# Triggered by previous block → skip auto-save (prevent loop)
SKIP_AUTOSAVE=false
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  SKIP_AUTOSAVE=true
fi

# === Enter project directory ===
[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
git rev-parse --git-dir &>/dev/null || exit 0

# === Check 0: merge conflict → must block ===
if [ -n "$(git diff --name-only --diff-filter=U 2>/dev/null)" ]; then
  cat <<'EOF'
{"hookSpecificOutput": {"hookEventName": "Stop", "permissionDecision": "deny", "permissionDecisionReason": "Merge conflict detected. Resolve conflicts first (git diff --name-only --diff-filter=U to see conflicted files), then git add and commit."}}
EOF
  exit 0
fi

# === Check 1: commit dirty working tree (ONLY on feature branches) ===
if [ "$SKIP_AUTOSAVE" = "false" ]; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "")

  # Skip protected branches — never auto-commit on main/master/develop/trunk
  case "${BRANCH:-}" in
    ""|main|master|develop|trunk|release/*|hotfix/*)
      # On protected branch: only stash, do not commit or push
      DIRTY=$(git status --porcelain 2>/dev/null)
      if [ -n "$DIRTY" ]; then
        STASH_MSG="auto-save: $(date +%Y-%m-%dT%H:%M)"
        git stash push -m "$STASH_MSG" --include-untracked 2>/dev/null || true
      fi
      exit 0
      ;;
  esac

  DIRTY=$(git status --porcelain 2>/dev/null)
  if [ -n "$DIRTY" ]; then
    FILE_COUNT=$(echo "$DIRTY" | wc -l | tr -d ' ')
    DATE=$(date +%Y-%m-%d)
    COMMIT_MSG="wip(#0): session-sweep ${FILE_COUNT} files (${DATE})"

    # Stage all changes (including untracked)
    if ! git add -A 2>/dev/null; then
      echo "[academic-git] WARNING: git add -A failed during auto-save" >&2
      exit 0
    fi

    # Commit with WIP format
    if ! git commit -m "$COMMIT_MSG" 2>/dev/null; then
      echo "[academic-git] WARNING: git commit failed during auto-save" >&2
      exit 0
    fi

    # Push if remote exists
    if git remote get-url origin &>/dev/null; then
      # macOS-compatible timeout for push
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

      if [ -n "$BRANCH" ]; then
        if ! _timeout 15 git push origin "$BRANCH" 2>/dev/null; then
          echo "[academic-git] WARNING: git push failed during auto-save. Local commit exists but is not on origin." >&2
        fi
      fi
    fi
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

AHEAD=$(git rev-list --count "origin/${MAIN_BRANCH}..${BRANCH}" 2>/dev/null || echo "0")
if [ -z "$AHEAD" ] || [ "$AHEAD" -lt 1 ]; then
  exit 0
fi

# Output suggestion to create PR
echo "[academic-git] Branch '${BRANCH}' has ${AHEAD} commits ahead of ${MAIN_BRANCH} with no open PR. Consider running create_pr when ready."
exit 0
